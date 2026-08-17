#!/usr/bin/env python3
from __future__ import annotations

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
    spec = importlib.util.spec_from_file_location('v14_smoke_helpers_demo', module_path)
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
sanitize_evidence = h.sanitize_evidence


def error_code(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    error = payload.get('error')
    return str(error.get('code')) if isinstance(error, dict) and error.get('code') else None


def main() -> int:
    base_url = os.environ.get('SMOKE_BASE_URL', '').rstrip('/')
    pages_name = os.environ.get('SMOKE_PAGES_NAME', '')
    d1_name = os.environ.get('SMOKE_D1_NAME', '')
    evidence_path = Path(os.environ.get('SMOKE_EVIDENCE_PATH', 'v15-task1-demo-smoke-evidence.json'))
    candidate_sha = os.environ.get('SMOKE_CANDIDATE_SHA256', '')
    if not base_url or not pages_name or not d1_name:
        raise SmokeFailure('DEMO_SMOKE_ENVIRONMENT_INCOMPLETE')

    evidence: dict[str, Any] = {
        'runTimestamp': datetime.now(timezone.utc).isoformat(),
        'pagesProject': pages_name,
        'd1Database': d1_name,
        'candidateSha256': candidate_sha or None,
        'overallPass': False,
    }

    try:
        wait_for_health(base_url)
        evidence['health'] = True
        marker = ''.join(ch for ch in os.environ.get('GITHUB_RUN_ID', 'local') if ch.isalnum())[-12:] or 'local'
        email = f'v15-demo-{marker}@example.invalid'
        password = f'V15Demo!{secrets.token_hex(8)}Aa1'
        bootstrap_name = 'Demo Bootstrap Dorm'

        status, _, payload = http_json('POST', f'{base_url}/api/setup/init', {
            'email': email,
            'password': password,
            'displayName': 'V15 Demo Smoke',
            'dormName': bootstrap_name,
        })
        require_status(status, 201, 'DEMO_SETUP_HTTP_STATUS')
        setup = extract_api_data(payload)
        if not isinstance(setup, dict) or not setup.get('token'):
            raise SmokeFailure('DEMO_SETUP_RESPONSE_INVALID')
        jwt = str(setup['token'])

        status, _, payload = http_json('GET', f'{base_url}/api/settings', token=jwt)
        require_status(status, 200, 'DEMO_SETTINGS_GET_HTTP_STATUS')
        settings = extract_api_data(payload)
        if not isinstance(settings, dict):
            raise SmokeFailure('DEMO_SETTINGS_RESPONSE_INVALID')
        if settings.get('subscriptionPlan') != 'demo':
            raise SmokeFailure('DEMO_PACKAGE_PLAN_DEFAULT_FAILED')
        if settings.get('dormName') != bootstrap_name:
            raise SmokeFailure('DEMO_BOOTSTRAP_DORM_NAME_FAILED')
        if settings.get('whiteLabelEnabled') is not False:
            raise SmokeFailure('DEMO_WHITE_LABEL_ENTITLEMENT_FAILED')

        put_payload = {
            'dormName': 'Demo Renamed Dorm',
            'defaultElecRate': settings.get('defaultElecRate', 7),
            'defaultWaterRate': settings.get('defaultWaterRate', 13),
            'defaultDueDateDay': settings.get('defaultDueDateDay', 5),
            'defaultPenaltyRate': settings.get('defaultPenaltyRate', 100),
            'promptpayId': settings.get('promptpayId'),
            'promptpayName': settings.get('promptpayName'),
            'lineChannelAccessToken': None,
            'lineChannelSecret': None,
            'lineBotEnabled': 0,
            'googleSpreadsheetId': None,
            'fontScale': settings.get('fontScale', 'medium'),
            'brandColor': '#123456',
            'contactPhone': '081-000-0000',
            'billFooter': 'Demo cannot save this',
        }
        status, _, payload = http_json('PUT', f'{base_url}/api/settings', put_payload, token=jwt)
        require_status(status, 403, 'DEMO_WHITE_LABEL_MUTATION_HTTP_STATUS')
        code = error_code(payload)
        if code != 'PLAN_REQUIRED':
            raise SmokeFailure('DEMO_WHITE_LABEL_MUTATION_CODE_FAILED')

        status, headers, payload = http_json('GET', f'{base_url}/api/admin/backup/export', token=jwt)
        require_status(status, 200, 'DEMO_BACKUP_EXPORT_HTTP_STATUS')
        assert_no_store(headers, 'demo package backup export')
        backup = extract_api_data(payload)
        if not isinstance(backup, dict) or not isinstance(backup.get('manifest'), dict):
            raise SmokeFailure('DEMO_BACKUP_EXPORT_INVALID')
        if backup['manifest'].get('schemaVersion') != 7 or backup['manifest'].get('formatVersion') != 1:
            raise SmokeFailure('DEMO_BACKUP_SCHEMA_FAILED')

        evidence.update({
            'setup': {
                'firstDormNameAllowed': True,
                'dormName': bootstrap_name,
                'subscriptionPlan': 'demo',
            },
            'whiteLabel': {
                'enabled': False,
                'mutationHttpStatus': 403,
                'mutationErrorCode': code,
            },
            'backup': {
                'exportAllowed': True,
                'formatVersion': backup['manifest'].get('formatVersion'),
                'schemaVersion': backup['manifest'].get('schemaVersion'),
                'noStore': True,
            },
            'overallPass': True,
        })
        print('V15 Task 1 Demo bootstrap D1 smoke PASS')
        return 0
    except SmokeFailure as exc:
        evidence['failureCode'] = exc.code
        print(f'V15 Task 1 Demo D1 smoke FAIL: {exc.code}: {exc}', file=sys.stderr)
        return 1
    except Exception as exc:
        evidence['failureCode'] = 'UNEXPECTED_EXCEPTION'
        print(f'V15 Task 1 Demo D1 smoke FAIL: UNEXPECTED_EXCEPTION: {type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    finally:
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(sanitize_evidence(evidence), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    raise SystemExit(main())
