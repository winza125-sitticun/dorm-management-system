#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class SmokeFailure(RuntimeError):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code


def sql_quote(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def parse_wrangler_json(text: str) -> Any:
    clean = re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]", "", text or "")
    decoder = json.JSONDecoder()
    for index, char in enumerate(clean):
        if char not in "[{":
            continue
        try:
            value, _ = decoder.raw_decode(clean[index:])
            return value
        except json.JSONDecodeError:
            continue
    raise SmokeFailure("WRANGLER_JSON_PARSE_FAILED")


def build_wrangler_config(template: str, pages_name: str, d1_name: str, d1_id: str) -> str:
    replacements = {
        "REPLACE_WITH_YOUR_PAGES_PROJECT": pages_name,
        "REPLACE_WITH_YOUR_D1_DATABASE": d1_name,
        "00000000-0000-0000-0000-000000000000": d1_id,
    }
    rendered = template
    for old, new in replacements.items():
        count = rendered.count(old)
        if count != 1:
            raise SmokeFailure("WRANGLER_TEMPLATE_PLACEHOLDER_MISMATCH", f"{old}:{count}")
        rendered = rendered.replace(old, new)
    if "REPLACE_WITH_YOUR" in rendered or "00000000-0000-0000-0000-000000000000" in rendered:
        raise SmokeFailure("WRANGLER_TEMPLATE_PLACEHOLDER_REMAINS")
    return rendered


def extract_api_data(payload: dict) -> Any:
    if not isinstance(payload, dict) or payload.get("success") is not True:
        code = "API_RESPONSE_FAILED"
        if isinstance(payload, dict):
            error = payload.get("error")
            if isinstance(error, dict) and error.get("code"):
                code = str(error["code"])
        raise SmokeFailure(code)
    return payload.get("data")


def assert_no_store(headers: dict, label: str) -> None:
    normalized = {str(k).lower(): str(v) for k, v in (headers or {}).items()}
    if "no-store" not in normalized.get("cache-control", "").lower():
        raise SmokeFailure("CACHE_CONTROL_NO_STORE_MISSING", label)


def sanitize_evidence(value: Any) -> Any:
    blocked = ("token", "secret", "password", "authorization", "jwt", "refresh")
    if isinstance(value, dict):
        clean: dict[str, Any] = {}
        for key, item in value.items():
            normalized = re.sub(r"[^a-z0-9]", "", str(key).lower())
            if any(word in normalized for word in blocked):
                continue
            clean[str(key)] = sanitize_evidence(item)
        return clean
    if isinstance(value, list):
        return [sanitize_evidence(item) for item in value]
    return value


def run_command(args: list[str], cwd: Path, input_text: str | None = None) -> str:
    proc = subprocess.run(
        args,
        cwd=str(cwd),
        input=input_text,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()
        last_line = stderr.splitlines()[-1] if stderr else "command failed"
        raise SmokeFailure("COMMAND_FAILED", f"{args[0]} {args[1] if len(args) > 1 else ''}: {last_line[:300]}")
    return proc.stdout or ""


def d1_execute(workdir: Path, sql: str) -> list[dict[str, Any]]:
    output = run_command(
        [
            "npx", "wrangler", "d1", "execute", "DB", "--remote",
            "--command", sql, "--json", "--config", "wrangler.jsonc",
        ],
        workdir,
    )
    parsed = parse_wrangler_json(output)
    if isinstance(parsed, dict):
        parsed = [parsed]
    if not isinstance(parsed, list):
        raise SmokeFailure("D1_RESULT_INVALID")
    for item in parsed:
        if isinstance(item, dict) and item.get("success") is False:
            raise SmokeFailure("D1_EXECUTE_FAILED")
    return [item for item in parsed if isinstance(item, dict)]


def d1_rows(workdir: Path, sql: str) -> list[dict[str, Any]]:
    batches = d1_execute(workdir, sql)
    rows: list[dict[str, Any]] = []
    for batch in batches:
        result = batch.get("results")
        if isinstance(result, list):
            rows.extend(item for item in result if isinstance(item, dict))
    return rows


def http_json(
    method: str,
    url: str,
    payload: Any | None = None,
    token: str | None = None,
    timeout: int = 30,
) -> tuple[int, dict[str, str], dict[str, Any]]:
    body = None if payload is None else json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Accept": "application/json", "User-Agent": "v14-task12-d1-smoke/1"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return response.status, dict(response.headers.items()), data
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"success": False, "error": {"code": "NON_JSON_HTTP_ERROR"}}
        return error.code, dict(error.headers.items()), data


def wait_for_health(base_url: str, attempts: int = 45, delay: float = 2.0) -> None:
    last_status = None
    for _ in range(attempts):
        try:
            status, _, payload = http_json("GET", f"{base_url}/api/health", timeout=10)
            last_status = status
            if status == 200 and isinstance(payload, dict) and payload.get("success") is True:
                return
        except Exception:
            pass
        time.sleep(delay)
    raise SmokeFailure("HEALTH_TIMEOUT", str(last_status or "unreachable"))


def require_status(actual: int, expected: int, code: str) -> None:
    if actual != expected:
        raise SmokeFailure(code, f"expected={expected}, actual={actual}")


def business_counts(data: dict[str, Any]) -> dict[str, int]:
    keys = [
        "rooms", "bills", "recurringChargeTemplates", "roomRecurringCharges", "billChargeItems",
        "maintenanceTickets", "housekeepingTasks", "leaseContracts", "announcements", "notes",
    ]
    return {key: len(data.get(key, [])) if isinstance(data.get(key), list) else 0 for key in keys}


def main() -> int:
    workdir = Path(os.environ.get("SMOKE_WORKDIR", "")).resolve()
    base_url = os.environ.get("SMOKE_BASE_URL", "").rstrip("/")
    d1_name = os.environ.get("SMOKE_D1_NAME", "")
    pages_name = os.environ.get("SMOKE_PAGES_NAME", "")
    evidence_path = Path(os.environ.get("SMOKE_EVIDENCE_PATH", "v14-task12-d1-smoke-evidence.json"))
    candidate_sha = os.environ.get("SMOKE_CANDIDATE_SHA256", "")

    if not workdir.is_dir() or not base_url or not d1_name or not pages_name:
        raise SmokeFailure("SMOKE_ENVIRONMENT_INCOMPLETE")

    evidence: dict[str, Any] = {
        "runTimestamp": datetime.now(timezone.utc).isoformat(),
        "pagesProject": pages_name,
        "d1Database": d1_name,
        "candidateSha256": candidate_sha or None,
        "overallPass": False,
    }
    no_store: dict[str, bool] = {}

    try:
        wait_for_health(base_url)
        evidence["health"] = True

        run_marker = re.sub(r"[^a-zA-Z0-9]", "", os.environ.get("GITHUB_RUN_ID", "local"))[-12:] or "local"
        email = f"smoke-{run_marker}@example.invalid"
        password = f"V14Smoke!{secrets.token_hex(8)}Aa1"

        setup_status, _, setup_payload = http_json(
            "POST",
            f"{base_url}/api/setup/init",
            {"email": email, "password": password, "displayName": "V14 Smoke", "dormName": "V14 Smoke Dorm"},
        )
        require_status(setup_status, 201, "SETUP_HTTP_STATUS")
        setup_data = extract_api_data(setup_payload)
        if not isinstance(setup_data, dict) or not isinstance(setup_data.get("user"), dict) or not setup_data.get("token"):
            raise SmokeFailure("SETUP_RESPONSE_INVALID")
        owner_id = int(setup_data["user"]["id"])
        jwt = str(setup_data["token"])
        evidence["ownerId"] = owner_id

        seed_sql = f"""
        UPDATE settings SET subscription_plan='pro', subscription_status='active', dorm_name='V14 Smoke Dorm',
          default_elec_rate=7, default_water_rate=13, default_due_date_day=5, default_penalty_rate=100
          WHERE user_id={owner_id};
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status,tenant_name,tenant_phone)
          VALUES (101,{owner_id},'101',3000,'occupied','Smoke Tenant A','0800000101');
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status,tenant_name,tenant_phone)
          VALUES (102,{owner_id},'102',3500,'vacant',NULL,NULL);
        INSERT INTO bills (id,user_id,room_id,bill_month,prior_elec,current_elec,elec_deduct,elec_unit_cost,elec_cost,prior_water,current_water,water_unit_cost,water_cost,rent_cost,deposit_cost,other_cost,other_description,total_cost,due_date,status,slip_status)
          VALUES (201,{owner_id},101,'2026-08',100,150,0,7,350,20,25,13,65,3000,0,0,NULL,3415,'2026-08-05','unpaid','none');
        INSERT INTO bills (id,user_id,room_id,bill_month,prior_elec,current_elec,elec_deduct,elec_unit_cost,elec_cost,prior_water,current_water,water_unit_cost,water_cost,rent_cost,deposit_cost,other_cost,other_description,total_cost,due_date,status,slip_status)
          VALUES (202,{owner_id},102,'2026-08',50,60,0,7,70,10,12,13,26,3500,0,0,NULL,3596,'2026-08-05','paid','none');
        INSERT INTO recurring_charge_templates (id,user_id,name,description,default_amount,frequency,billing_months,is_active)
          VALUES (301,{owner_id},'Internet','Smoke recurring charge',300,'monthly','[1,2,3,4,5,6,7,8,9,10,11,12]',1);
        INSERT INTO room_recurring_charges (id,user_id,room_id,template_id,amount_override,is_enabled)
          VALUES (401,{owner_id},101,301,250,1);
        INSERT INTO bill_charge_items (id,bill_id,assignment_id,label,amount,kind,sort_order)
          VALUES (501,201,401,'Internet',250,'recurring',1);
        INSERT INTO notes (id,user_id,created_by,room_id,title,content,color,is_pinned)
          VALUES (601,{owner_id},{owner_id},101,'Smoke note','Original smoke note','yellow',1);
        """
        d1_execute(workdir, seed_sql)

        status, headers, original_payload = http_json("GET", f"{base_url}/api/admin/backup/export", token=jwt)
        require_status(status, 200, "ORIGINAL_EXPORT_HTTP_STATUS")
        assert_no_store(headers, "original export")
        no_store["originalExport"] = True
        original = extract_api_data(original_payload)
        if not isinstance(original, dict) or not isinstance(original.get("manifest"), dict) or not isinstance(original.get("data"), dict):
            raise SmokeFailure("ORIGINAL_EXPORT_INVALID")
        original_manifest = original["manifest"]
        original_data = original["data"]
        if original_manifest.get("format") != "dorm-backup" or original_manifest.get("formatVersion") != 1 or original_manifest.get("schemaVersion") != 6:
            raise SmokeFailure("BACKUP_FORMAT_INVARIANT_FAILED")
        original_sha = str(original_manifest.get("dataSha256") or "")
        if len(original_sha) != 64:
            raise SmokeFailure("ORIGINAL_BACKUP_SHA_INVALID")
        counts = business_counts(original_data)
        expected_minimums = {"rooms": 2, "bills": 2, "recurringChargeTemplates": 1, "roomRecurringCharges": 1, "billChargeItems": 1, "notes": 1}
        for key, minimum in expected_minimums.items():
            if counts.get(key, 0) < minimum:
                raise SmokeFailure("ORIGINAL_BACKUP_COUNT_FAILED", key)

        line_user_id = f"U_CURRENT_{secrets.token_hex(8)}"
        line_display_name = "Current Smoke LINE"
        line_picture_url = "https://example.invalid/current-line.png"
        line_notify = f"notify-{secrets.token_hex(8)}"
        line_access = f"line-access-{secrets.token_hex(16)}"
        line_secret = f"line-secret-{secrets.token_hex(16)}"
        google_sheet = f"sheet-current-{secrets.token_hex(8)}"
        google_refresh = f"refresh-current-{secrets.token_hex(16)}"

        mutate_sql = f"""
        UPDATE rooms SET monthly_rent=9999 WHERE id=101 AND user_id={owner_id};
        UPDATE notes SET content='Mutated smoke note', updated_at=CURRENT_TIMESTAMP WHERE id=601 AND user_id={owner_id};
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status) VALUES (103,{owner_id},'103',4100,'vacant');
        UPDATE rooms SET line_user_id={sql_quote(line_user_id)}, line_display_name={sql_quote(line_display_name)},
          line_picture_url={sql_quote(line_picture_url)}, line_status='linked', line_notify_token={sql_quote(line_notify)}
          WHERE id=101 AND user_id={owner_id};
        UPDATE settings SET line_channel_access_token={sql_quote(line_access)}, line_channel_secret={sql_quote(line_secret)},
          line_bot_enabled=1, google_spreadsheet_id={sql_quote(google_sheet)}, subscription_plan='pro', subscription_status='active'
          WHERE user_id={owner_id};
        INSERT INTO google_oauth_tokens (user_id,refresh_token) VALUES ({owner_id},{sql_quote(google_refresh)})
          ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP;
        """
        d1_execute(workdir, mutate_sql)

        validate_status, validate_headers, validate_payload = http_json(
            "POST",
            f"{base_url}/api/admin/backup/validate",
            {"manifest": original_manifest, "data": original_data},
            token=jwt,
        )
        require_status(validate_status, 200, "VALIDATE_HTTP_STATUS")
        assert_no_store(validate_headers, "validate")
        no_store["validate"] = True
        validate_data = extract_api_data(validate_payload)
        if not isinstance(validate_data, dict) or not validate_data.get("restoreToken"):
            raise SmokeFailure("VALIDATE_RESTORE_TOKEN_MISSING")
        restore_token = str(validate_data["restoreToken"])

        pre_status, pre_headers, pre_payload = http_json("GET", f"{base_url}/api/admin/backup/export", token=jwt)
        require_status(pre_status, 200, "PRE_RESTORE_EXPORT_HTTP_STATUS")
        assert_no_store(pre_headers, "pre-restore export")
        no_store["preRestoreExport"] = True
        pre_restore = extract_api_data(pre_payload)
        pre_sha = str(pre_restore["manifest"]["dataSha256"])
        if pre_sha == original_sha:
            raise SmokeFailure("BUSINESS_MUTATION_NOT_REFLECTED")

        restore_status, restore_headers, restore_payload = http_json(
            "POST",
            f"{base_url}/api/admin/backup/restore",
            {
                "manifest": original_manifest,
                "data": original_data,
                "restoreToken": restore_token,
                "confirmation": "RESTORE",
            },
            token=jwt,
        )
        require_status(restore_status, 200, "RESTORE_HTTP_STATUS")
        assert_no_store(restore_headers, "restore")
        no_store["restore"] = True
        restore_data = extract_api_data(restore_payload)
        if not isinstance(restore_data, dict) or restore_data.get("restored") is not True:
            raise SmokeFailure("RESTORE_RESPONSE_INVALID")
        if restore_data.get("preRestoreDataSha256") != pre_sha:
            raise SmokeFailure("RESTORE_PRE_SHA_MISMATCH")

        post_status, post_headers, post_payload = http_json("GET", f"{base_url}/api/admin/backup/export", token=jwt)
        require_status(post_status, 200, "POST_RESTORE_EXPORT_HTTP_STATUS")
        assert_no_store(post_headers, "post-restore export")
        no_store["postRestoreExport"] = True
        post_restore = extract_api_data(post_payload)
        post_sha = str(post_restore["manifest"]["dataSha256"])
        if post_sha != original_sha or post_restore.get("data") != original_data:
            raise SmokeFailure("RESTORED_BUSINESS_DATA_MISMATCH")

        login_status, _, login_payload = http_json(
            "POST", f"{base_url}/api/auth/login", {"username": email, "password": password}
        )
        require_status(login_status, 200, "POST_RESTORE_LOGIN_HTTP_STATUS")
        login_data = extract_api_data(login_payload)
        owner_login_ok = isinstance(login_data, dict) and bool(login_data.get("token"))
        if not owner_login_ok:
            raise SmokeFailure("POST_RESTORE_LOGIN_FAILED")

        room_rows = d1_rows(workdir, f"SELECT id,line_user_id,line_display_name,line_picture_url,line_status,line_notify_token FROM rooms WHERE user_id={owner_id} AND id=101;")
        if len(room_rows) != 1:
            raise SmokeFailure("LINE_ROOM_QUERY_FAILED")
        room = room_rows[0]
        room_line_ok = (
            room.get("line_user_id") == line_user_id
            and room.get("line_display_name") == line_display_name
            and room.get("line_picture_url") == line_picture_url
            and room.get("line_status") == "linked"
            and room.get("line_notify_token") == line_notify
        )
        if not room_line_ok:
            raise SmokeFailure("LINE_ROOM_NOT_PRESERVED")

        settings_rows = d1_rows(workdir, f"SELECT line_channel_access_token,line_channel_secret,line_bot_enabled,google_spreadsheet_id FROM settings WHERE user_id={owner_id};")
        if len(settings_rows) != 1:
            raise SmokeFailure("INTEGRATION_SETTINGS_QUERY_FAILED")
        settings = settings_rows[0]
        line_settings_ok = (
            settings.get("line_channel_access_token") == line_access
            and settings.get("line_channel_secret") == line_secret
            and int(settings.get("line_bot_enabled") or 0) == 1
        )
        google_sheet_ok = settings.get("google_spreadsheet_id") == google_sheet
        if not line_settings_ok:
            raise SmokeFailure("LINE_SETTINGS_NOT_PRESERVED")
        if not google_sheet_ok:
            raise SmokeFailure("GOOGLE_SHEET_NOT_PRESERVED")

        oauth_rows = d1_rows(workdir, f"SELECT refresh_token FROM google_oauth_tokens WHERE user_id={owner_id};")
        google_refresh_ok = len(oauth_rows) == 1 and oauth_rows[0].get("refresh_token") == google_refresh
        if not google_refresh_ok:
            raise SmokeFailure("GOOGLE_REFRESH_NOT_PRESERVED")

        audit_rows = d1_rows(workdir, f"SELECT COUNT(*) AS count FROM audit_logs WHERE user_id={owner_id} AND action='RESTORE_BACKUP';")
        audit_count = int(audit_rows[0].get("count") or 0) if audit_rows else 0
        if audit_count < 1:
            raise SmokeFailure("RESTORE_AUDIT_MISSING")

        d1_execute(workdir, f"UPDATE settings SET subscription_plan='demo', subscription_status='active' WHERE user_id={owner_id};")

        demo_export_status, demo_export_headers, demo_export_payload = http_json("GET", f"{base_url}/api/admin/backup/export", token=jwt)
        require_status(demo_export_status, 200, "DEMO_EXPORT_HTTP_STATUS")
        assert_no_store(demo_export_headers, "demo export")
        no_store["demoExport"] = True
        extract_api_data(demo_export_payload)

        demo_restore_status, demo_restore_headers, demo_restore_payload = http_json(
            "POST",
            f"{base_url}/api/admin/backup/restore",
            {
                "manifest": original_manifest,
                "data": original_data,
                "restoreToken": restore_token,
                "confirmation": "RESTORE",
            },
            token=jwt,
        )
        require_status(demo_restore_status, 403, "DEMO_RESTORE_HTTP_STATUS")
        assert_no_store(demo_restore_headers, "demo restore")
        no_store["demoRestore"] = True
        error = demo_restore_payload.get("error") if isinstance(demo_restore_payload, dict) else None
        demo_code = error.get("code") if isinstance(error, dict) else None
        if demo_code != "PLAN_REQUIRED":
            raise SmokeFailure("DEMO_RESTORE_CODE_MISMATCH")

        evidence.update({
            "backup": {
                "originalDataSha256": original_sha,
                "preRestoreDataSha256": pre_sha,
                "postRestoreDataSha256": post_sha,
                "preRestoreDiffers": pre_sha != original_sha,
                "postRestoreMatchesOriginal": post_sha == original_sha and post_restore.get("data") == original_data,
                "counts": counts,
            },
            "ownerLoginAfterRestore": owner_login_ok,
            "integrations": {
                "roomLinePreserved": room_line_ok,
                "lineSettingsPreserved": line_settings_ok,
                "googleSpreadsheetPreserved": google_sheet_ok,
                "googleOAuthCredentialPreserved": google_refresh_ok,
            },
            "audit": {"restoreBackupCount": audit_count, "restoreBackupPresent": audit_count >= 1},
            "demo": {
                "backupExportAllowed": True,
                "restoreHttpStatus": demo_restore_status,
                "restoreErrorCode": demo_code,
            },
            "noStore": no_store,
            "overallPass": True,
        })
        print("V14 Task 12 D1 smoke PASS")
        return 0
    except SmokeFailure as exc:
        evidence["failureCode"] = exc.code
        print(f"V14 Task 12 D1 smoke FAIL: {exc.code}: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        evidence["failureCode"] = "UNEXPECTED_EXCEPTION"
        print(f"V14 Task 12 D1 smoke FAIL: UNEXPECTED_EXCEPTION: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(sanitize_evidence(evidence), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
