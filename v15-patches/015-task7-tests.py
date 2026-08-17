from pathlib import Path


def append_once(path: Path, marker: str, content: str) -> None:
    text = path.read_text(encoding='utf-8')
    if marker in text:
        raise SystemExit(f'{path}: marker already present')
    path.write_text(text.rstrip() + '\n\n' + content.rstrip() + '\n', encoding='utf-8')


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}')
    path.write_text(text.replace(old, new, 1), encoding='utf-8')


builder = Path('tests/package-builder.test.mjs')
append_once(
    builder,
    "package descriptions advertise the approved V15 White-label availability",
    r'''test('package descriptions advertise the approved V15 White-label availability', async () => {
  const { loadPlans } = await import('../scripts/build-packages.mjs');
  const plans = await loadPlans();
  assert.ok(plans.demo.features.includes('ดูตัวอย่างการตั้งค่าแบรนด์ (การแก้ไข White-label ต้อง Basic ขึ้นไป)'));
  for (const id of ['basic', 'standard', 'pro']) {
    assert.ok(plans[id].features.includes('ตั้งค่า White-label: ชื่อหอ สีแบรนด์ เบอร์ติดต่อ และข้อความท้ายบิล'), `${id} White-label copy missing`);
  }
});''',
)

parity = Path('tests/package-parity.test.mjs')
parity_anchor = r'''    for (const plan of ['basic','standard','pro']) {
      const block = blockFor(plan);
      assert.match(block, /'backupExport'/);
      assert.match(block, /'backupRestore'/);
    }
'''
parity_addition = parity_anchor + r'''    const expectedWhiteLabel = { demo: false, basic: true, standard: true, pro: true };
    const expectedPromptPay = { demo: true, basic: false, standard: true, pro: true };
    for (const packageId of ids) {
      const generatedSource = await read(roots[packageId], 'src/constants/planEntitlements.ts');
      for (const plan of ids) {
        const start = generatedSource.indexOf(`  ${plan}: {`);
        const nextIndex = ids.indexOf(plan) + 1;
        const nextPlan = nextIndex < ids.length ? ids[nextIndex] : null;
        const end = nextPlan ? generatedSource.indexOf(`  ${nextPlan}: {`, start + 1) : generatedSource.indexOf('});', start);
        const block = generatedSource.slice(start, end);
        assert.equal(/'whiteLabel'/.test(block), expectedWhiteLabel[plan], `${packageId}/${plan} whiteLabel drift`);
        assert.equal(/'promptPay'/.test(block), expectedPromptPay[plan], `${packageId}/${plan} promptPay drift`);
      }
    }
'''
replace_once(parity, parity_anchor, parity_addition)

release = Path('tests/package-release.test.mjs')
release_anchor = "      assert.equal(pkg.name, `dorm-management-system-${plan}`);\n"
release_addition = release_anchor + r'''      const entitlementSource = verified.entries.get('src/constants/planEntitlements.ts').toString('utf8');
      const ownStart = entitlementSource.indexOf(`  ${plan}: {`);
      const ownIndex = expectedPlans.indexOf(plan);
      const ownNext = ownIndex + 1 < expectedPlans.length ? expectedPlans[ownIndex + 1] : null;
      const ownEnd = ownNext ? entitlementSource.indexOf(`  ${ownNext}: {`, ownStart + 1) : entitlementSource.indexOf('});', ownStart);
      const ownBlock = entitlementSource.slice(ownStart, ownEnd);
      assert.equal(/'whiteLabel'/.test(ownBlock), plan !== 'demo', `${plan} release whiteLabel drift`);
      assert.equal(/'promptPay'/.test(ownBlock), plan !== 'basic', `${plan} release promptPay drift`);
'''
replace_once(release, release_anchor, release_addition)
