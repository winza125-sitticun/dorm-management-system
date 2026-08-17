import json
from pathlib import Path

copy = {
    'demo': 'ดูตัวอย่างการตั้งค่าแบรนด์ (การแก้ไข White-label ต้อง Basic ขึ้นไป)',
    'basic': 'ตั้งค่า White-label: ชื่อหอ สีแบรนด์ เบอร์ติดต่อ และข้อความท้ายบิล',
    'standard': 'ตั้งค่า White-label: ชื่อหอ สีแบรนด์ เบอร์ติดต่อ และข้อความท้ายบิล',
    'pro': 'ตั้งค่า White-label: ชื่อหอ สีแบรนด์ เบอร์ติดต่อ และข้อความท้ายบิล',
}

for plan, feature in copy.items():
    path = Path('package-plans') / f'{plan}.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    features = data.get('features')
    if not isinstance(features, list) or not features:
        raise SystemExit(f'{path}: invalid features')
    if any('White-label' in str(item) or 'ตั้งค่าแบรนด์' in str(item) for item in features):
        raise SystemExit(f'{path}: White-label copy already present')
    features.append(feature)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
