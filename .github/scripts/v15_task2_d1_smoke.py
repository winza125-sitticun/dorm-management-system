#!/usr/bin/env python3
from __future__ import annotations

import base64
import copy
import importlib.util
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_helpers():
    module_path = Path(__file__).with_name('v14_task12_d1_smoke.py')
    spec = importlib.util.spec_from_file_location('v14_smoke_helpers_v15_task2', module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError('V14_HELPERS_LOAD_FAILED')
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


h = load_helpers()
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


def error_code(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    err = payload.get('error')
    return str(err.get('code')) if isinstance(err, dict) and err.get('code') else None


def data_uri(mime: str, raw: bytes) -> str:
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"


PNG = data_uri('image/png', bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]))
JPEG = data_uri('image/jpeg', bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00]))
WEBP = data_uri('image/webp', b'RIFF1234WEBP')
SVG = data_uri('image/svg+xml', b'<svg></svg>')
MISMATCH = data_uri('image/png', bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00]))
OVERSIZED = data_uri('image/png', bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + bytes(307_201 - 8))


def exact_data_sha(workdir: Path, data: dict[str, Any]) -> str:
    temp = workdir / '.v15-task2-smoke-hash.json'
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    try:
        code = (
            "import fs from 'node:fs'; "
            "import {stableStringify,sha256Hex} from './src/utils/backupFormat.ts'; "
            "const d=JSON.parse(fs.readFileSync('.v15-task2-smoke-hash.json','utf8')); "
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


def public_branding(base_url: str) -> dict[str, Any]:
    status, _, payload = http_json('GET', f'{base_url}/api/public/branding')
    require_status(status, 200, 'PUBLIC_BRANDING_HTTP_STATUS')
    if not isinstance(payload, dict):
        raise SmokeFailure('PUBLIC_BRANDING_RESPONSE_INVALID')
    return payload


def set_logo(base_url: str, jwt: str, logo: str, failure_code: str) -> dict[str, Any]:
    status, _, payload = http_json('PUT', f'{base_url}/api/settings/logo', {'logoDataUri': logo}, token=jwt)
    require_status(status, 200, failure_code)
    if not isinstance(payload, dict) or payload.get('success') is not True or payload.get('brandLogoUrl') != logo:
        raise SmokeFailure(f'{failure_code}_RESPONSE')
    if 'brandLogoKey' in payload or 'brand_logo_key' in payload:
        raise SmokeFailure('LOGO_INTERNAL_KEY_LEAK')
    return payload


def main() -> int:
    workdir = Path(os.environ.get('SMOKE_WORKDIR', '')).resolve()
    base_url = os.environ.get('SMOKE_BASE_URL', '').rstrip('/')
    pages_name = os.environ.get('SMOKE_PAGES_NAME', '')
    d1_name = os.environ.get('SMOKE_D1_NAME', '')
    evidence_path = Path(os.environ.get('SMOKE_EVIDENCE_PATH', 'v15-task2-pro-d1-smoke-evidence.json'))
    candidate_sha = os.environ.get('SMOKE_CANDIDATE_SHA256', '')
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
        marker = ''.join(ch for ch in os.environ.get('GITHUB_RUN_ID', 'local') if ch.isalnum())[-12:] or 'local'
        email = f'v15-task2-pro-{marker}@example.invalid'
        password = f'V15T2!{secrets.token_hex(10)}Aa1'
        dorm_name = 'V15 Task 2 Pro Dorm'

        status, _, payload = http_json('POST', f'{base_url}/api/setup/init', {
            'email': email,
            'password': password,
            'displayName': 'V15 Task 2 Pro Smoke',
            'dormName': dorm_name,
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

        set_logo(base_url, jwt, PNG, 'PNG_LOGO_PUT_HTTP_STATUS')
        auth_status, _, auth_payload = http_json('GET', f'{base_url}/api/settings', token=jwt)
        require_status(auth_status, 200, 'SETTINGS_AFTER_PNG_HTTP_STATUS')
        auth_settings = extract_api_data(auth_payload)
        if not isinstance(auth_settings, dict) or auth_settings.get('brandLogoUrl') != PNG:
            raise SmokeFailure('AUTH_SETTINGS_LOGO_PROJECTION_FAILED')
        auth_serialized = json.dumps(auth_settings, ensure_ascii=False)
        if 'brandLogoKey' in auth_serialized or 'brand_logo_key' in auth_serialized:
            raise SmokeFailure('AUTH_SETTINGS_INTERNAL_LOGO_KEY_LEAK')

        public = public_branding(base_url)
        if public.get('dormName') != dorm_name or public.get('logoDataUri') != PNG or public.get('whiteLabelEnabled') is not True:
            raise SmokeFailure('PUBLIC_BRANDING_INITIAL_PROJECTION_FAILED')

        set_logo(base_url, jwt, JPEG, 'JPEG_LOGO_PUT_HTTP_STATUS')
        set_logo(base_url, jwt, WEBP, 'WEBP_LOGO_PUT_HTTP_STATUS')

        invalid_matrix: dict[str, int] = {}
        for name, value in [
            ('svg', SVG),
            ('invalidBase64', 'data:image/png;base64,###'),
            ('mimeMagicMismatch', MISMATCH),
            ('oversized', OVERSIZED),
        ]:
            status, _, bad_payload = http_json('PUT', f'{base_url}/api/settings/logo', {'logoDataUri': value}, token=jwt)
            require_status(status, 400, f'INVALID_LOGO_{name}_HTTP_STATUS')
            if error_code(bad_payload) != 'VALIDATION_ERROR':
                raise SmokeFailure(f'INVALID_LOGO_{name}_ERROR_CODE')
            bad_text = json.dumps(bad_payload, ensure_ascii=False)
            if len(value) > 200 and value[:120] in bad_text:
                raise SmokeFailure(f'INVALID_LOGO_{name}_PAYLOAD_ECHO')
            invalid_matrix[name] = status

        brand_original = '#1DB954'
        phone_original = '081-234-5678'
        footer_original = 'Task 2 private bill footer'
        promptpay_secret = f'PROMPTPAY_{secrets.token_hex(8)}'
        line_token = f'LINE_TOKEN_{secrets.token_hex(12)}'
        line_secret = f'LINE_SECRET_{secrets.token_hex(12)}'
        google_sheet = f'GOOGLE_SHEET_{secrets.token_hex(8)}'
        google_refresh = f'GOOGLE_REFRESH_{secrets.token_hex(12)}'
        d1_execute(workdir, f"""
        UPDATE settings SET brand_color={sql_quote(brand_original)}, contact_phone={sql_quote(phone_original)},
          bill_footer={sql_quote(footer_original)}, promptpay_id={sql_quote(promptpay_secret)},
          line_channel_access_token={sql_quote(line_token)}, line_channel_secret={sql_quote(line_secret)},
          google_spreadsheet_id={sql_quote(google_sheet)} WHERE user_id={owner_id};
        INSERT INTO google_oauth_tokens (user_id,refresh_token) VALUES ({owner_id},{sql_quote(google_refresh)})
          ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP;
        INSERT INTO rooms (id,user_id,room_number,monthly_rent,status,tenant_name,tenant_phone)
          VALUES (101,{owner_id},'101',3000,'occupied','Task 2 Tenant','0800000101');
        """)

        public = public_branding(base_url)
        if public.get('brandColor') != brand_original or public.get('contactPhone') != phone_original or public.get('logoDataUri') != WEBP:
            raise SmokeFailure('PUBLIC_BRANDING_PAID_FIELDS_FAILED')
        public_text = json.dumps(public, ensure_ascii=False)
        for forbidden_name in ('promptpayId', 'promptpay_id', 'billFooter', 'bill_footer', 'lineChannelAccessToken', 'line_channel_access_token', 'lineChannelSecret', 'line_channel_secret', 'googleSpreadsheetId', 'google_spreadsheet_id', 'subscriptionPlan', 'subscription_plan', 'brandLogoKey', 'brand_logo_key'):
            if forbidden_name in public_text:
                raise SmokeFailure('PUBLIC_BRANDING_FORBIDDEN_FIELD_LEAK')
        for sentinel in (promptpay_secret, line_token, line_secret, google_sheet, google_refresh):
            if sentinel in public_text:
                raise SmokeFailure('PUBLIC_BRANDING_SECRET_VALUE_LEAK')

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'V7_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'task2 v7 export')
        no_store['v7Export'] = True
        original = extract_api_data(payload)
        if not isinstance(original, dict) or not isinstance(original.get('manifest'), dict) or not isinstance(original.get('data'), dict):
            raise SmokeFailure('V7_EXPORT_INVALID')
        manifest_v7 = original['manifest']
        data_v7 = original['data']
        if manifest_v7.get('format') != 'dorm-backup' or manifest_v7.get('formatVersion') != 1 or manifest_v7.get('schemaVersion') != 7:
            raise SmokeFailure('V7_FORMAT_INVARIANT_FAILED')
        backup_text = json.dumps(original, ensure_ascii=False)
        for forbidden in ('brandLogoKey', 'brand_logo_key', 'logoDataUri', 'brandLogoUrl', WEBP):
            if forbidden in backup_text:
                raise SmokeFailure('V7_LOGO_NON_PORTABILITY_FAILED')
        original_sha = str(manifest_v7.get('dataSha256') or '')

        current_logo_v7 = JPEG
        set_logo(base_url, jwt, current_logo_v7, 'V7_CURRENT_LOGO_PUT_HTTP_STATUS')
        v7_line_secret = f'V7_LINE_{secrets.token_hex(12)}'
        v7_sheet = f'V7_SHEET_{secrets.token_hex(8)}'
        v7_refresh = f'V7_REFRESH_{secrets.token_hex(12)}'
        d1_execute(workdir, f"""
        UPDATE rooms SET monthly_rent=9999, line_user_id='U_TASK2_CURRENT' WHERE id=101 AND user_id={owner_id};
        UPDATE settings SET brand_color='#AA5500', contact_phone='0890000000', bill_footer='Mutated footer',
          line_channel_secret={sql_quote(v7_line_secret)}, google_spreadsheet_id={sql_quote(v7_sheet)} WHERE user_id={owner_id};
        INSERT INTO google_oauth_tokens (user_id,refresh_token) VALUES ({owner_id},{sql_quote(v7_refresh)})
          ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP;
        """)

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/validate', {'manifest': manifest_v7, 'data': data_v7}, token=jwt)
        require_status(status, 200, 'V7_VALIDATE_HTTP_STATUS')
        assert_no_store(headers, 'task2 v7 validate')
        no_store['v7Validate'] = True
        validated = extract_api_data(payload)
        if not isinstance(validated, dict) or not validated.get('restoreToken'):
            raise SmokeFailure('V7_VALIDATE_RESPONSE_INVALID')

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/restore', {
            'manifest': manifest_v7, 'data': data_v7,
            'restoreToken': str(validated['restoreToken']), 'confirmation': 'RESTORE',
        }, token=jwt)
        require_status(status, 200, 'V7_RESTORE_HTTP_STATUS')
        assert_no_store(headers, 'task2 v7 restore')
        no_store['v7Restore'] = True

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'V7_POST_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'task2 v7 post export')
        no_store['v7PostExport'] = True
        post_v7 = extract_api_data(payload)
        if not isinstance(post_v7, dict) or str(post_v7.get('manifest', {}).get('dataSha256') or '') != original_sha or post_v7.get('data') != data_v7:
            raise SmokeFailure('V7_RESTORED_LOGICAL_HASH_MISMATCH')

        rows = d1_rows(workdir, f"SELECT brand_color,contact_phone,bill_footer,brand_logo_key,line_channel_secret,google_spreadsheet_id FROM settings WHERE user_id={owner_id};")
        if len(rows) != 1:
            raise SmokeFailure('V7_SETTINGS_QUERY_FAILED')
        row = rows[0]
        if row.get('brand_color') != brand_original or row.get('contact_phone') != phone_original or row.get('bill_footer') != footer_original:
            raise SmokeFailure('V7_PORTABLE_BRANDING_RESTORE_FAILED')
        if row.get('brand_logo_key') != current_logo_v7:
            raise SmokeFailure('V7_LOGO_PRESERVATION_FAILED')
        if row.get('line_channel_secret') != v7_line_secret or row.get('google_spreadsheet_id') != v7_sheet:
            raise SmokeFailure('V7_INTEGRATION_PRESERVATION_FAILED')
        oauth = d1_rows(workdir, f"SELECT refresh_token FROM google_oauth_tokens WHERE user_id={owner_id};")
        if len(oauth) != 1 or oauth[0].get('refresh_token') != v7_refresh:
            raise SmokeFailure('V7_GOOGLE_OAUTH_PRESERVATION_FAILED')
        room = d1_rows(workdir, f"SELECT monthly_rent,line_user_id FROM rooms WHERE id=101 AND user_id={owner_id};")
        if len(room) != 1 or int(room[0].get('monthly_rent') or 0) != 3000 or room[0].get('line_user_id') != 'U_TASK2_CURRENT':
            raise SmokeFailure('V7_BUSINESS_OR_ROOM_LINE_RESTORE_FAILED')

        manifest_v6, data_v6 = make_v6_backup(workdir, manifest_v7, data_v7)
        v6_brand = '#445566'
        v6_phone = '089-999-9999'
        v6_footer = 'Current values before v6 restore'
        current_logo_v6 = PNG
        set_logo(base_url, jwt, current_logo_v6, 'V6_CURRENT_LOGO_PUT_HTTP_STATUS')
        v6_line_secret = f'V6_LINE_{secrets.token_hex(12)}'
        v6_sheet = f'V6_SHEET_{secrets.token_hex(8)}'
        v6_refresh = f'V6_REFRESH_{secrets.token_hex(12)}'
        d1_execute(workdir, f"""
        UPDATE rooms SET monthly_rent=7777 WHERE id=101 AND user_id={owner_id};
        UPDATE settings SET brand_color={sql_quote(v6_brand)}, contact_phone={sql_quote(v6_phone)}, bill_footer={sql_quote(v6_footer)},
          line_channel_secret={sql_quote(v6_line_secret)}, google_spreadsheet_id={sql_quote(v6_sheet)} WHERE user_id={owner_id};
        INSERT INTO google_oauth_tokens (user_id,refresh_token) VALUES ({owner_id},{sql_quote(v6_refresh)})
          ON CONFLICT(user_id) DO UPDATE SET refresh_token=excluded.refresh_token, updated_at=CURRENT_TIMESTAMP;
        """)

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/validate', {'manifest': manifest_v6, 'data': data_v6}, token=jwt)
        require_status(status, 200, 'V6_VALIDATE_HTTP_STATUS')
        assert_no_store(headers, 'task2 v6 validate')
        no_store['v6Validate'] = True
        validated_v6 = extract_api_data(payload)
        if not isinstance(validated_v6, dict) or not validated_v6.get('restoreToken'):
            raise SmokeFailure('V6_VALIDATE_RESPONSE_INVALID')

        status, headers, payload = http_json('POST', f'{base_url}/api/admin/backup/restore', {
            'manifest': manifest_v6, 'data': data_v6,
            'restoreToken': str(validated_v6['restoreToken']), 'confirmation': 'RESTORE',
        }, token=jwt)
        require_status(status, 200, 'V6_RESTORE_HTTP_STATUS')
        assert_no_store(headers, 'task2 v6 restore')
        no_store['v6Restore'] = True

        rows = d1_rows(workdir, f"SELECT dorm_name,brand_color,contact_phone,bill_footer,brand_logo_key,line_channel_secret,google_spreadsheet_id FROM settings WHERE user_id={owner_id};")
        if len(rows) != 1:
            raise SmokeFailure('V6_SETTINGS_QUERY_FAILED')
        row = rows[0]
        if row.get('brand_color') != v6_brand or row.get('contact_phone') != v6_phone or row.get('bill_footer') != v6_footer:
            raise SmokeFailure('V6_NEW_BRANDING_PRESERVATION_FAILED')
        if row.get('brand_logo_key') != current_logo_v6:
            raise SmokeFailure('V6_LOGO_PRESERVATION_FAILED')
        if row.get('line_channel_secret') != v6_line_secret or row.get('google_spreadsheet_id') != v6_sheet:
            raise SmokeFailure('V6_INTEGRATION_PRESERVATION_FAILED')
        oauth = d1_rows(workdir, f"SELECT refresh_token FROM google_oauth_tokens WHERE user_id={owner_id};")
        if len(oauth) != 1 or oauth[0].get('refresh_token') != v6_refresh:
            raise SmokeFailure('V6_GOOGLE_OAUTH_PRESERVATION_FAILED')
        room = d1_rows(workdir, f"SELECT monthly_rent FROM rooms WHERE id=101 AND user_id={owner_id};")
        if len(room) != 1 or int(room[0].get('monthly_rent') or 0) != 3000:
            raise SmokeFailure('V6_BUSINESS_RESTORE_FAILED')

        status, _, payload = http_json('POST', f'{base_url}/api/auth/login', {'username': email, 'password': password})
        require_status(status, 200, 'POST_RESTORE_LOGIN_HTTP_STATUS')
        login = extract_api_data(payload)
        if not isinstance(login, dict) or not login.get('token'):
            raise SmokeFailure('POST_RESTORE_LOGIN_FAILED')

        audit = d1_rows(workdir, f"SELECT COUNT(*) AS count FROM audit_logs WHERE user_id={owner_id} AND action='RESTORE_BACKUP';")
        audit_count = int(audit[0].get('count') or 0) if audit else 0
        if audit_count < 2:
            raise SmokeFailure('RESTORE_AUDIT_COUNT_FAILED')

        status, _, payload = http_json('DELETE', f'{base_url}/api/settings/logo', token=jwt)
        require_status(status, 200, 'DELETE_LOGO_HTTP_STATUS')
        if not isinstance(payload, dict) or payload.get('brandLogoUrl', 'not-null') is not None:
            raise SmokeFailure('DELETE_LOGO_RESPONSE_FAILED')
        if public_branding(base_url).get('logoDataUri', 'not-null') is not None:
            raise SmokeFailure('PUBLIC_LOGO_DELETE_PROJECTION_FAILED')
        set_logo(base_url, jwt, WEBP, 'PRE_DEMO_LOGO_PUT_HTTP_STATUS')
        d1_execute(workdir, f"UPDATE settings SET subscription_plan='demo', brand_color='#ABCDEF', contact_phone='080-111-2222' WHERE user_id={owner_id};")
        demo_public = public_branding(base_url)
        if demo_public.get('dormName') != dorm_name:
            raise SmokeFailure('DEMO_DOWNGRADE_DORM_IDENTITY_FAILED')
        if demo_public.get('brandColor') is not None or demo_public.get('contactPhone') is not None or demo_public.get('logoDataUri') is not None or demo_public.get('whiteLabelEnabled') is not False:
            raise SmokeFailure('DEMO_DOWNGRADE_PUBLIC_MASK_FAILED')
        for method, body, label in [('PUT', {'logoDataUri': PNG}, 'PUT'), ('DELETE', None, 'DELETE')]:
            status, _, denied = http_json(method, f'{base_url}/api/settings/logo', body, token=jwt)
            require_status(status, 403, f'DEMO_{label}_LOGO_HTTP_STATUS')
            if error_code(denied) != 'PLAN_REQUIRED':
                raise SmokeFailure(f'DEMO_{label}_LOGO_CODE_FAILED')

        evidence.update({
            'logoValidation': {'png': True, 'jpeg': True, 'webp': True, 'invalidMatrix': invalid_matrix, 'decodedMaxBytes': 307200, 'internalKeyHiddenFromSettings': True},
            'publicBranding': {'unauthenticated': True, 'explicitSafeFields': True, 'secretLeakCheck': True, 'demoMaskAfterDowngrade': True},
            'backup': {
                'formatVersion': 1, 'schemaVersion': 7, 'logoPortable': False,
                'v7LogicalHashRestored': True, 'v7LogoPreserved': True,
                'v6Accepted': True, 'v6LogoPreserved': True, 'v6NewBrandingPreserved': True,
                'integrationPreservation': True, 'restoreAuditCount': audit_count, 'noStore': no_store,
            },
            'demoPlanGate': {'publicBrandingMasked': True, 'putLogoStatus': 403, 'deleteLogoStatus': 403, 'errorCode': 'PLAN_REQUIRED'},
            'ownerLoginAfterRestore': True,
            'overallPass': True,
        })
        print('V15 Task 2 Pro logo/public branding + v7/v6 D1 smoke PASS')
        return 0
    except SmokeFailure as exc:
        evidence['failureCode'] = exc.code
        print(f'V15 Task 2 Pro D1 smoke FAIL: {exc.code}: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:
        evidence['failureCode'] = 'UNEXPECTED_EXCEPTION'
        print(f'V15 Task 2 Pro D1 smoke FAIL: UNEXPECTED_EXCEPTION: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    finally:
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(sanitize_evidence(evidence), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    raise SystemExit(main())
