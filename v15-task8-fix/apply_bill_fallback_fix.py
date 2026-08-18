from __future__ import annotations

import hashlib
import sys
from pathlib import Path

BASE_APP_SHA256 = 'd2d8e43f291a53f63b8712ee60377c9470d783262b456bc6065c29393f9e69bd'
FIXED_APP_SHA256 = '70769ae729b1390e7aa3adfd5e4588a13f2e95ba6dd1a9e8c27deee83d5c137e'
FIXED_HELPER_SHA256 = '7595afe39a3709791c896af62567cc2a7e8c682af98b6ad8fdd2b450b49dcfa5'

HELPER = """export function billListFromApiPayload(payload) {\n  if (Array.isArray(payload)) return payload;\n  if (payload && Array.isArray(payload.data)) return payload.data;\n  return [];\n}\n\nexport function findBillInApiPayload(payload, billId) {\n  const targetId = Number(billId);\n  if (!Number.isFinite(targetId)) return undefined;\n  return billListFromApiPayload(payload).find((bill) => Number(bill?.id) === targetId);\n}\n"""

IMPORT_NEEDLE = "import { normalizeFontScale } from './utils/settings.ts';\n"
IMPORT_REPLACEMENT = IMPORT_NEEDLE + "import { findBillInApiPayload } from './utils/billApi';\n"

OLD_BLOCK = """  const onViewBillById = (billId: number) => {\n    const bill = bills.find(b => b.id === billId);\n    if (bill) {\n      setSelectedInvoice(bill);\n    } else {\n      // If bills not loaded or found, do a quick fetch\n      fetch(`/api/bills`, { headers: getHeaders() })\n        .then(res => res.json())\n        .then(data => {\n          const found = data.find((b: any) => b.id === billId);\n          if (found) setSelectedInvoice(found);\n        });\n    }\n  };\n"""

NEW_BLOCK = """  const onViewBillById = (billId: number) => {\n    const bill = findBillInApiPayload(bills, billId);\n    if (bill) {\n      setSelectedInvoice(bill);\n    } else {\n      // If bills not loaded or found, do a quick fetch\n      fetch(`/api/bills`, { headers: getHeaders() })\n        .then(res => res.json())\n        .then(data => {\n          const found = findBillInApiPayload(data, billId);\n          if (found) setSelectedInvoice(found);\n        });\n    }\n  };\n"""


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    app = root / 'src' / 'App.tsx'
    helper = root / 'src' / 'utils' / 'billApi.ts'
    if not app.is_file():
        raise SystemExit(f'missing {app}')
    if sha256(app) != BASE_APP_SHA256:
        raise SystemExit(f'unexpected App.tsx preimage sha256={sha256(app)}')
    if helper.exists():
        raise SystemExit(f'helper already exists: {helper}')

    text = app.read_text()
    if text.count(IMPORT_NEEDLE) != 1:
        raise SystemExit('expected exactly one import anchor')
    if text.count(OLD_BLOCK) != 1:
        raise SystemExit('expected exactly one unsafe onViewBillById block')

    text = text.replace(IMPORT_NEEDLE, IMPORT_REPLACEMENT, 1)
    text = text.replace(OLD_BLOCK, NEW_BLOCK, 1)
    app.write_text(text)
    helper.write_text(HELPER)

    if sha256(app) != FIXED_APP_SHA256:
        raise SystemExit(f'unexpected fixed App.tsx sha256={sha256(app)}')
    if sha256(helper) != FIXED_HELPER_SHA256:
        raise SystemExit(f'unexpected helper sha256={sha256(helper)}')
    print(f'fixed_app_sha256={FIXED_APP_SHA256}')
    print(f'helper_sha256={FIXED_HELPER_SHA256}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
