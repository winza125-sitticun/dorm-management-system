import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBillBrandingSnapshot } from '../src/utils/billBranding.ts';

test('Pro snapshot keeps effective brand and paid bill identity fields', () => {
  const snapshot = resolveBillBrandingSnapshot({
    dormName: ' Task 6 Pro Dorm ',
    brandColor: '#6d28d9',
    contactPhone: ' 0812345678 ',
    logoDataUri: ' data:image/png;base64,abc ',
    whiteLabelEnabled: true,
    billFooter: ' ชำระภายในกำหนด ',
  });

  assert.deepEqual(snapshot, {
    dormName: 'Task 6 Pro Dorm',
    brandColor: '#6D28D9',
    contactPhone: '0812345678',
    logoDataUri: 'data:image/png;base64,abc',
    billFooter: 'ชำระภายในกำหนด',
    whiteLabelEnabled: true,
  });
});

test('Demo snapshot masks dormant paid identity but keeps effective fallback color and dorm name', () => {
  const snapshot = resolveBillBrandingSnapshot({
    dormName: 'Task 6 Demo Dorm',
    brandColor: '#1DB954',
    contactPhone: '0899999999',
    logoDataUri: 'data:image/png;base64,hidden',
    whiteLabelEnabled: false,
    billFooter: 'hidden footer',
  });

  assert.equal(snapshot.dormName, 'Task 6 Demo Dorm');
  assert.equal(snapshot.brandColor, '#1DB954');
  assert.equal(snapshot.logoDataUri, null);
  assert.equal(snapshot.contactPhone, null);
  assert.equal(snapshot.billFooter, null);
  assert.equal(snapshot.whiteLabelEnabled, false);
});

test('snapshot rejects malformed runtime color by falling back safely', () => {
  const snapshot = resolveBillBrandingSnapshot({
    dormName: '',
    brandColor: 'red',
    contactPhone: null,
    logoDataUri: null,
    whiteLabelEnabled: true,
  });

  assert.equal(snapshot.dormName, 'หอพักของฉัน');
  assert.equal(snapshot.brandColor, '#1DB954');
});
