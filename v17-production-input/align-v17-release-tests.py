from pathlib import Path
import sys
if len(sys.argv)!=2: raise SystemExit('usage: align-v17-release-tests.py MASTER_DIR')
r=Path(sys.argv[1])
p=r/'scripts/build-packages.mjs'; s=p.read_text(); s=s.replace('ไม่มี Downgrade อัตโนมัติใน V14','ไม่มี Downgrade อัตโนมัติใน V17'); p.write_text(s)
for rel in ['tests/package-parity.test.mjs','tests/package-release.test.mjs']:
    p=r/rel; s=p.read_text()
    s=s.replace('Customer Delivery V14','Customer Delivery V17').replace('PREVIEW V14 — NOT FOR PRODUCTION','PREVIEW V17 — NOT FOR PRODUCTION')
    s=s.replace("'d1-migrations/0007_add_license_state.sql'","'d1-migrations/0008_add_update_state.sql'")
    s=s.replace('V16 Task 6 must add exactly the license-state migration after V15 0006','V17 must add exactly the update-state migration after V16 0007')
    old="assert.equal(verified.names.some((name) => /^d1-migrations\\/000[8-9]/.test(name) || /^d1-migrations\\/00[1-9][0-9]/.test(name)), false, `${plan} release contains migration after V16 Task 6 ceiling 0007`);"
    new="assert.equal(verified.names.some((name) => /^d1-migrations\\/0009(?:_|\\.)/.test(name) || /^d1-migrations\\/00[1-9][0-9]/.test(name)), false, `${plan} release contains migration after V17 ceiling 0008`);"
    if rel.endswith('package-release.test.mjs'):
        if old not in s: raise RuntimeError('package-release migration ceiling anchor missing')
        s=s.replace(old,new)
    p.write_text(s)
for rel in ['tests/task5-login-app-shell-branding.test.mjs','tests/task6-bill-branding.test.mjs','tests/task7-tenant-portal-branding.test.mjs']:
    p=r/rel
    if not p.exists(): raise RuntimeError(f'missing portable test: {rel}')
    s=p.read_text()
    if s.count("assert.equal(migrations.at(-1), '0007_add_license_state.sql');") != 1: raise RuntimeError(f'{rel}: migration ceiling anchor mismatch')
    if s.count("assert.equal(migrations.some((name) => /^000[8-9]_/.test(name) || /^00[1-9][0-9]_/.test(name)), false);") != 1: raise RuntimeError(f'{rel}: migration regex anchor mismatch')
    s=s.replace("assert.equal(migrations.at(-1), '0007_add_license_state.sql');","assert.equal(migrations.at(-1), '0008_add_update_state.sql');")
    s=s.replace("assert.equal(migrations.some((name) => /^000[8-9]_/.test(name) || /^00[1-9][0-9]_/.test(name)), false);","assert.equal(migrations.some((name) => /^0009_/.test(name) || /^00[1-9][0-9]_/.test(name)), false);")
    p.write_text(s)
print('V17 release tests aligned')
