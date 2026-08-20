from pathlib import Path
import sys
if len(sys.argv)!=2: raise SystemExit('usage: align-v17-release-tests.py MASTER_DIR')
r=Path(sys.argv[1])
# Customer-facing builder content must identify the V17 delivery, not the immutable baseline's old label.
p=r/'scripts/build-packages.mjs'; s=p.read_text()
s=s.replace('ไม่มี Downgrade อัตโนมัติใน V14','ไม่มี Downgrade อัตโนมัติใน V17')
p.write_text(s)
# Existing builder tests are baseline assertions. Move only version/migration expectations to the new contract.
for rel in ['tests/package-parity.test.mjs','tests/package-release.test.mjs']:
    p=r/rel; s=p.read_text()
    s=s.replace('Customer Delivery V14','Customer Delivery V17')
    s=s.replace('PREVIEW V14 — NOT FOR PRODUCTION','PREVIEW V17 — NOT FOR PRODUCTION')
    s=s.replace("'d1-migrations/0007_add_license_state.sql'","'d1-migrations/0008_add_update_state.sql'")
    s=s.replace('V16 Task 6 must add exactly the license-state migration after V15 0006','V17 must add exactly the update-state migration after V16 0007')
    old="assert.equal(verified.names.some((name) => /^d1-migrations\\/000[8-9]/.test(name) || /^d1-migrations\\/00[1-9][0-9]/.test(name)), false, `${plan} release contains migration after V16 Task 6 ceiling 0007`);"
    new="assert.equal(verified.names.some((name) => /^d1-migrations\\/0009(?:_|\\.)/.test(name) || /^d1-migrations\\/00[1-9][0-9]/.test(name)), false, `${plan} release contains migration after V17 ceiling 0008`);"
    if rel.endswith('package-release.test.mjs'):
        if old not in s: raise RuntimeError('package-release migration ceiling anchor missing')
        s=s.replace(old,new)
    p.write_text(s)
print('V17 release tests aligned')
