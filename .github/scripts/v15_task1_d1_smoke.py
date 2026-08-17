#!/usr/bin/env python3
from __future__ import annotations

import copy
import importlib.util
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_v14_helpers():
    module_path = Path(__file__).with_name('v14_task12_d1_smoke.py')
    spec = importlib.util.spec_from_file_location('v14_smoke_helpers', module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError('V14_HELPERS_LOAD_FAILED')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


h = load_v14_helpers()
SmokeFailure = h.SmokeFailure
http_json = h.http_json
extract_api_data = h.extract_api_data
assert_no_store = h.assert_no_store
require_status = h.require_status
wait_for_health = h.wait_for_health
d1_execute = h.d1_execute
d1_rows = h.d1_rows
sql_quote = h.sql_quote
run_command = h.run_command
sanitize_evidence = h.sanitize_evidence
business_counts = h.business_counts


def api_error_code(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    error = payload.get('error')
    return str(error.get('code')) if isinstance(error, dict) and error.get('code') else None


def settings_payload(dorm_name: str, brand_color: str, phone: str, footer: str) -> dict[str, Any]:
    return {
        'dormName': dorm_name,
        'defaultElecRate': 7,
        'defaultWaterRate': 13,
        'defaultDueDateDay': 5,
        'defaultPenaltyRate': 100,
        'promptpayId': None,
        'promptpayName': None,
        'lineChannelAccessToken': None,
        'lineChannelSecret': None,
        'lineBotEnabled': 0,
        'googleSpreadsheetId': None,
        'fontScale': 'medium',
        'brandColor': brand_color,
        'contactPhone': phone,
        'billFooter': footer,
    }


def exact_data_sha(workdir: Path, data: dict[str, Any]) -> str:
    temp = workdir / '.v15-smoke-hash.json'
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    try:
        code = (
            "import fs from 'node:fs'; "
            "import {stableStringify,sha256Hex} from './src/utils/backupFormat.ts'; "
            "const d=JSON.parse(fs.readFileSync('.v15-smoke-hash.json','utf8')); "
            "sha256Hex(stableStringify(d)).then(x=>process.stdout.write(x));"
        )
        output = run_command(['npx', 'tsx', '-e', code], workdir)
        value = output.strip().splitlines()[-1] if output.strip() else ''
        if len(value) != 64:
            raise SmokeFailure('V6_HASH_INVALID')
        return value
    finally:
        temp.unlink(missing_ok=True)


def make_v6_backup(workdir: Path, manifest_v7: dict[str, Any], data_v7: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    data_v6 = copy.deepcopy(data_v7)
    settings = data_v6.get('settings')
    if not isinstance(settings, dict):
        raise SmokeFailure('V6_SETTINGS_INVALID')
    for key in ('brandColor', 'contactPhone', 'billFooter'):
        settings.pop(key, None)
    manifest_v6 = copy.deepcopy(manifest_v7)
    manifest_v6['schemaVersion'] = 6
    manifest_v6['createdAt'] = datetime.now(timezone.utc).isoformat()
    manifest_v6['dataSha256'] = exact_data_sha(workdir, data_v6)
    return manifest_v6, data_v6


def main() -> int:
    workdir = Path(os.environ.get('SMOKE_WORKDIR', '')).resolve()
    base_url = os.environ.get('SMOKE_BASE_URL', '').rstrip('/')
    evidence_path = Path(os.environ.get('SMOKE_EVIDENCE_PATH', 'v15-task1-d1-smoke-evidence.json'))
    candidate_sha = os.environ.get('SMOKE_CANDIDATE_SHA256', '')
    pages_name = os.environ.get('SMOKE_PAGES_NAME', '')
    d1_name = os.environ.get('SMOKE_D1_NAME', '')
    if not workdir.is_dir() or not base_url or not pages_name or not d1_name:
        raise SmokeFailure('SMOKE_ENVIRONMENT_INCOMPLETE')

    evidence: dict[str, Any] = {
        'runTimestamp': datetime.now(timezone.utc).isoformat(),
        'pagesProject': pages_name,
        'd1Database': d1_name,
        'candidateSha256': candidate_sha or None,
        'overallPass': False,
    }
    no_store: dict[str, bool] = {}

    try:
        wait_for_health(base_url)
        evidence['health'] = True
        run_marker = ''.join(ch for ch in os.environ.get('GITHUB_RUN_ID', 'local') if ch.isalnum())[-12:] or 'local'
        email = f'v15-pro-{run_marker}@example.invalid'
        password = f'V15Smoke!{secrets.token_hex(8)}Aa1'

        status, _, payload = http_json('POST', f'{base_url}/api/setup/init', {
            'email': email, 'password': password, 'displayName': 'V15 Pro Smoke', 'dormName': 'V15 Pro Bootstrap Dorm',
        })
        require_status(status, 201, 'SETUP_HTTP_STATUS')
        setup = extract_api_data(payload)
        if not isinstance(setup, dict) or not isinstance(setup.get('user'), dict) or not setup.get('token'):
            raise SmokeFailure('SETUP_RESPONSE_INVALID')
        owner_id = int(setup['user']['id'])
        jwt = str(setup['token'])
        evidence['ownerId'] = owner_id

        status, _, payload = http_json('GET', f'{base_url}/api/settings', token=jwt)
        require_status(status, 200, 'INITIAL_SETTINGS_HTTP_STATUS')
        initial_settings = extract_api_data(payload)
        if not isinstance(initial_settings, dict) or initial_settings.get('subscriptionPlan') != 'pro':
            raise SmokeFailure('PRO_PLAN_DEFAULT_FAILED')
        if initial_settings.get('whiteLabelEnabled') is not True:
            raise SmokeFailure('PRO_WHITE_LABEL_ENTITLEMENT_FAILED')

        brand_original = '#1DB954'
        phone_original = '081-234-5678'
        footer_original = 'V15 Task 1 smoke footer'
        status, _, payload = http_json('PUT', f'{base_url}/api/settings', settings_payload(
            'V15 Branded Dorm', '#1db954', phone_original, footer_original,
        ), token=jwt)
        require_status(status, 200, 'PRO_SETTINGS_PUT_HTTP_STATUS')
        saved = extract_api_data(payload)
        if not isinstance(saved, dict):
            raise SmokeFailure('PRO_SETTINGS_PUT_RESPONSE_INVALID')
        if saved.get('brandColor') != brand_original or saved.get('contactPhone') != phone_original or saved.get('billFooter') != footer_original:
            raise SmokeFailure('PRO_SETTINGS_NORMALIZATION_FAILED')

        seed_sql = f"""
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status,tenant_name,tenant_phone)
          VALUES (101,{owner_id},'101',3000,'occupied','V15 Tenant','0800000101');
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status)
          VALUES (102,{owner_id},'102',3500,'vacant');
        INSERT INTO bills (id,user_id,room_id,bill_month,prior_elec,current_elec,elec_deduct,elec_unit_cost,elec_cost,prior_water,current_water,water_unit_cost,water_cost,rent_cost,deposit_cost,other_cost,other_description,total_cost,due_date,status,slip_status)
          VALUES (201,{owner_id},101,'2026-08',100,150,0,7,350,20,25,13,65,3000,0,0,NULL,3415,'2026-08-05','unpaid','none');
        INSERT INTO recurring_charge_templates (id,user_id,name,description,default_amount,frequency,billing_months,is_active)
          VALUES (301,{owner_id},'Internet','V15 recurring',300,'monthly','[1,2,3,4,5,6,7,8,9,10,11,12]',1);
        INSERT INTO room_recurring_charges (id,user_id,room_id,template_id,amount_override,is_enabled)
          VALUES (401,{owner_id},101,301,250,1);
        INSERT INTO bill_charge_items (id,bill_id,assignment_id,label,amount,kind,sort_order)
          VALUES (501,201,401,'Internet',250,'recurring',1);
        INSERT INTO notes (id,user_id,created_by,room_id,title,content,color,is_pinned)
          VALUES (601,{owner_id},{owner_id},101,'V15 note','Original V15 note','yellow',1);
        """
        d1_execute(workdir, seed_sql)

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'V7_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'v7 export')
        no_store['v7Export'] = True
        original = extract_api_data(payload)
        if not isinstance(original, dict) or not isinstance(original.get('manifest'), dict) or not isinstance(original.get('data'), dict):
            raise SmokeFailure('V7_EXPORT_INVALID')
        manifest_v7 = original['manifest']
        data_v7 = original['data']
        if manifest_v7.get('format') != 'dorm-backup' or manifest_v7.get('formatVersion') != 1 or manifest_v7.get('schemaVersion') != 7:
            raise SmokeFailure('V7_FORMAT_INVARIANT_FAILED')
        backup_settings = data_v7.get('settings') if isinstance(data_v7, dict) else None
        if not isinstance(backup_settings, dict):
            raise SmokeFailure('V7_BACKUP_SETTINGS_INVALID')
        if backup_settings.get('brandColor') != brand_original or backup_settings.get('contactPhone') != phone_original or backup_settings.get('billFooter') != footer_original:
            raise SmokeFailure('V7_WHITE_LABEL_EXPORT_FAILED')
        if 'brandLogoKey' in backup_settings:
            raise SmokeFailure('V7_LOGO_KEY_LEAK')
        original_sha = str(manifest_v7.get('dataSha256') or '')
        counts = business_counts(data_v7)

        line_user_id = f'U15_{secrets.token_hex(8)}'
        line_secret = f'line-secret-{secrets.token_hex(16)}'
        google_sheet = f'sheet-{secrets.token_hex(8)}'
        google_refresh = f'refresh-{secrets.token_hex(16)}'
        logo_after_backup = f'logo-current-{secrets.token_hex(8)}'
        mutate_sql = f"""
        UPDATE rooms SET monthly_rent=9999, line_user_id={sql_quote(line_user_id)}, line_display_name='Current LINE',
          line_status='linked' WHERE id=101 AND user_id={owner_id};
        UPDATE notes SET content='Mutated V15 note' WHERE id=601 AND user_id={owner_id};
        UPDATE settings SET brand_color='#AA5500', contact_phone='0890000000', bill_footer='Mutated footer',
          brand_logo_key={sql_quote(logo_after_backup)}, line_channel_secret={sql_quote(line_secret)},
          line_bot_enabled=1, google_spreadsheet_id={sql_quote(google_sheet)} WHERE user_id={owner_id};
        INSERT INTO google_oauth_tokens (user_id,refresh_token) VALUES ({owner_id},{sql_quote(google_refresh)})
          ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP;
        """
        d1_execute(workdir, mutate_sql)

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/validate', {
            'manifest': manifest_v7, 'data': data_v7,
        }, token=jwt)
        require_status(status, 200, 'V7_VALIDATE_HTTP_STATUS')
        assert_no_store(headers, 'v7 validate')
        no_store['v7Validate'] = True
        validated = extract_api_data(payload)
        if not isinstance(validated, dict) or not validated.get('restoreToken'):
            raise SmokeFailure('V7_VALIDATE_RESPONSE_INVALID')

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'V7_PRE_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'v7 pre restore export')
        no_store['v7PreRestoreExport'] = True
        pre = extract_api_data(payload)
        pre_sha = str(pre['manifest']['dataSha256'])
        if pre_sha == original_sha:
            raise SmokeFailure('V7_MUTATION_NOT_REFLECTED')

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/restore', {
            'manifest': manifest_v7, 'data': data_v7, 'restoreToken': str(validated['restoreToken']), 'confirmation': 'RESTORE',
        }, token=jwt)
        require_status(status, 200, 'V7_RESTORE_HTTP_STATUS')
        assert_no_store(headers, 'v7 restore')
        no_store['v7Restore'] = True
        restored = extract_api_data(payload)
        if not isinstance(restored, dict) or restored.get('restored') is not True:
            raise SmokeFailure('V7_RESTORE_RESPONSE_INVALID')

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'V7_POST_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'v7 post restore export')
        no_store['v7PostRestoreExport'] = True
        post_v7 = extract_api_data(payload)
        post_v7_sha = str(post_v7['manifest']['dataSha256'])
        if post_v7_sha != original_sha or post_v7.get('data') != data_v7:
            raise SmokeFailure('V7_RESTORED_DATA_MISMATCH')

        rows = d1_rows(workdir, f"SELECT brand_color,contact_phone,bill_footer,brand_logo_key,line_channel_secret,google_spreadsheet_id FROM settings WHERE user_id={owner_id};")
        if len(rows) != 1:
            raise SmokeFailure('V7_SETTINGS_QUERY_FAILED')
        row = rows[0]
        v7_brand_ok = row.get('brand_color') == brand_original and row.get('contact_phone') == phone_original and row.get('bill_footer') == footer_original
        logo_ok = row.get('brand_logo_key') == logo_after_backup
        integration_ok = row.get('line_channel_secret') == line_secret and row.get('google_spreadsheet_id') == google_sheet
        if not v7_brand_ok:
            raise SmokeFailure('V7_BRAND_RESTORE_FAILED')
        if not logo_ok:
            raise SmokeFailure('V7_LOGO_PRESERVATION_FAILED')
        if not integration_ok:
            raise SmokeFailure('V7_INTEGRATION_PRESERVATION_FAILED')
        room_rows = d1_rows(workdir, f"SELECT line_user_id FROM rooms WHERE id=101 AND user_id={owner_id};")
        if len(room_rows) != 1 or room_rows[0].get('line_user_id') != line_user_id:
            raise SmokeFailure('V7_ROOM_LINE_PRESERVATION_FAILED')
        oauth_rows = d1_rows(workdir, f"SELECT refresh_token FROM google_oauth_tokens WHERE user_id={owner_id};")
        if len(oauth_rows) != 1 or oauth_rows[0].get('refresh_token') != google_refresh:
            raise SmokeFailure('V7_GOOGLE_OAUTH_PRESERVATION_FAILED')

        login_status, _, login_payload = http_json('POST', f'{base_url}/api/auth/login', {'username': email, 'password': password})
        require_status(login_status, 200, 'POST_V7_LOGIN_HTTP_STATUS')
        login_data = extract_api_data(login_payload)
        owner_login_ok = isinstance(login_data, dict) and bool(login_data.get('token'))
        if not owner_login_ok:
            raise SmokeFailure('POST_V7_LOGIN_FAILED')

        manifest_v6, data_v6 = make_v6_backup(workdir, manifest_v7, data_v7)
        v6_brand = '#445566'
        v6_phone = '0899999999'
        v6_footer = 'Current V15 values before v6 restore'
        logo_before_v6 = f'logo-v6-{secrets.token_hex(8)}'
        d1_execute(workdir, f"""
          UPDATE rooms SET monthly_rent=7777 WHERE id=101 AND user_id={owner_id};
          UPDATE notes SET content='Mutated before v6 restore' WHERE id=601 AND user_id={owner_id};
          UPDATE settings SET brand_color={sql_quote(v6_brand)}, contact_phone={sql_quote(v6_phone)},
            bill_footer={sql_quote(v6_footer)}, brand_logo_key={sql_quote(logo_before_v6)} WHERE user_id={owner_id};
        """)

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/validate', {
            'manifest': manifest_v6, 'data': data_v6,
        }, token=jwt)
        require_status(status, 200, 'V6_VALIDATE_HTTP_STATUS')
        assert_no_store(headers, 'v6 validate')
        no_store['v6Validate'] = True
        v6_validated = extract_api_data(payload)
        if not isinstance(v6_validated, dict) or not v6_validated.get('restoreToken'):
            raise SmokeFailure('V6_VALIDATE_RESPONSE_INVALID')

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/restore', {
            'manifest': manifest_v6, 'data': data_v6, 'restoreToken': str(v6_validated['restoreToken']), 'confirmation': 'RESTORE',
        }, token=jwt)
        require_status(status, 200, 'V6_RESTORE_HTTP_STATUS')
        assert_no_store(headers, 'v6 restore')
        no_store['v6Restore'] = True
        v6_restored = extract_api_data(payload)
        if not isinstance(v6_restored, dict) or v6_restored.get('restored') is not True:
            raise SmokeFailure('V6_RESTORE_RESPONSE_INVALID')

        rows = d1_rows(workdir, f"SELECT brand_color,contact_phone,bill_footer,brand_logo_key,line_channel_secret,google_spreadsheet_id FROM settings WHERE user_id={owner_id};")
        row = rows[0] if rows else {}
        v6_brand_preserved = row.get('brand_color') == v6_brand and row.get('contact_phone') == v6_phone and row.get('bill_footer') == v6_footer
        v6_logo_preserved = row.get('brand_logo_key') == logo_before_v6
        v6_integrations_preserved = row.get('line_channel_secret') == line_secret and row.get('google_spreadsheet_id') == google_sheet
        if not v6_brand_preserved:
            raise SmokeFailure('V6_BRAND_PRESERVATION_FAILED')
        if not v6_logo_preserved:
            raise SmokeFailure('V6_LOGO_PRESERVATION_FAILED')
        if not v6_integrations_preserved:
            raise SmokeFailure('V6_INTEGRATION_PRESERVATION_FAILED')
        business_rows = d1_rows(workdir, f"SELECT monthly_rent FROM rooms WHERE id=101 AND user_id={owner_id};")
        note_rows = d1_rows(workdir, f"SELECT content FROM notes WHERE id=601 AND user_id={owner_id};")
        if not business_rows or int(business_rows[0].get('monthly_rent') or 0) != 3000 or not note_rows or note_rows[0].get('content') != 'Original V15 note':
            raise SmokeFailure('V6_BUSINESS_RESTORE_FAILED')

        audit_rows = d1_rows(workdir, f"SELECT COUNT(*) AS count FROM audit_logs WHERE user_id={owner_id} AND action='RESTORE_BACKUP';")
        audit_count = int(audit_rows[0].get('count') or 0) if audit_rows else 0
        if audit_count < 2:
            raise SmokeFailure('RESTORE_AUDIT_COUNT_FAILED')

        d1_execute(workdir, f"UPDATE settings SET subscription_plan='demo', subscription_status='active' WHERE user_id={owner_id};")
        status, _, payload = http_json('GET', f'{base_url}/api/settings', token=jwt)
        require_status(status, 200, 'DEMO_SETTINGS_GET_HTTP_STATUS')
        demo_settings = extract_api_data(payload)
        if not isinstance(demo_settings, dict) or demo_settings.get('whiteLabelEnabled') is not False:
            raise SmokeFailure('DEMO_WHITE_LABEL_GET_FAILED')
        demo_put = settings_payload('Demo cannot rename', '#ABCDEF', v6_phone, v6_footer)
        status, _, payload = http_json('PUT', f'{base_url}/api/settings', demo_put, token=jwt)
        require_status(status, 403, 'DEMO_WHITE_LABEL_PUT_HTTP_STATUS')
        demo_white_label_code = api_error_code(payload)
        if demo_white_label_code != 'PLAN_REQUIRED':
            raise SmokeFailure('DEMO_WHITE_LABEL_PUT_CODE_FAILED')

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'DEMO_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'demo export')
        no_store['demoExport'] = True
        extract_api_data(payload)
        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/restore', {
            'manifest': manifest_v7, 'data': data_v7, 'restoreToken': str(validated['restoreToken']), 'confirmation': 'RESTORE',
        }, token=jwt)
        require_status(status, 403, 'DEMO_RESTORE_HTTP_STATUS')
        assert_no_store(headers, 'demo restore')
        no_store['demoRestore'] = True
        demo_restore_code = api_error_code(payload)
        if demo_restore_code != 'PLAN_REQUIRED':
            raise SmokeFailure('DEMO_RESTORE_CODE_FAILED')

        evidence.update({
            'backupV7': {
                'formatVersion': manifest_v7.get('formatVersion'),
                'schemaVersion': manifest_v7.get('schemaVersion'),
                'originalDataSha256': original_sha,
                'preRestoreDataSha256': pre_sha,
                'postRestoreDataSha256': post_v7_sha,
                'postRestoreMatchesOriginal': post_v7_sha == original_sha and post_v7.get('data') == data_v7,
                'counts': counts,
                'portableWhiteLabelRestored': v7_brand_ok,
                'brandLogoKeyExcluded': 'brandLogoKey' not in backup_settings,
            },
            'backupV6Compatibility': {
                'validated': True,
                'restored': True,
                'portableWhiteLabelPreserved': v6_brand_preserved,
                'brandLogoKeyPreserved': v6_logo_preserved,
                'businessDataRestored': True,
            },
            'integrations': {
                'v7Preserved': integration_ok,
                'v6Preserved': v6_integrations_preserved,
                'roomLinePreserved': True,
                'googleOAuthPreserved': True,
            },
            'ownerLoginAfterRestore': owner_login_ok,
            'audit': {'restoreBackupCount': audit_count, 'twoRestoresPresent': audit_count >= 2},
            'demoAfterPlanSwitch': {
                'whiteLabelEnabled': False,
                'whiteLabelPutHttpStatus': 403,
                'whiteLabelPutErrorCode': demo_white_label_code,
                'backupExportAllowed': True,
                'restoreHttpStatus': 403,
                'restoreErrorCode': demo_restore_code,
            },
            'noStore': no_store,
            'overallPass': True,
        })
        print('V15 Task 1 Pro D1 smoke PASS')
        return 0
    except SmokeFailure as exc:
        evidence['failureCode'] = exc.code
        print(f'V15 Task 1 Pro D1 smoke FAIL: {exc.code}: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:
        evidence['failureCode'] = 'UNEXPECTED_EXCEPTION'
        print(f'V15 Task 1 Pro D1 smoke FAIL: UNEXPECTED_EXCEPTION: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    finally:
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(sanitize_evidence(evidence), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    raise SystemExit(main())
