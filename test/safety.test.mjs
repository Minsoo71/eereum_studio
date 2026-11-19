// PC6 검증 고칠 점(PC9-스튜디오-4): R-a GPS 칸 · R-b 확장자 · R-c Host · R-1 방화벽 규칙 확인
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { hasGpsTag, extFor, safeExt, isLocalHost, hasDbFirewallRule } from '../server/safety.mjs';
import { inspect } from '../server/images.mjs';

const base = () => sharp({ create: { width: 40, height: 30, channels: 3, background: '#c33' } });

test('R-a: 진짜 GPS 칸(0x8825)이 있으면 경고 · 글자 "GPS"만 있으면 경고 없음', async () => {
  const withGps = await base().jpeg().withExif({ IFD0: { Make: 'Cam' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 30/1 0/1' } }).toBuffer();
  const textOnly = await base().jpeg().withExif({ IFD0: { ImageDescription: 'GPS GPS gps 없는 사진', Make: 'GPS Camera' } }).toBuffer();
  const none = await base().jpeg().toBuffer();
  assert.equal((await inspect(withGps, 'a.jpg')).hasGps, true);
  assert.equal((await inspect(textOnly, 'b.jpg')).hasGps, false);
  assert.equal((await inspect(none, 'c.jpg')).hasGps, false);
});

test('R-a: 깨진 · 짧은 EXIF는 false(오류 없음)', () => {
  assert.equal(hasGpsTag(null), false);
  assert.equal(hasGpsTag(Buffer.from('Exif\0\0XX')), false);
  assert.equal(hasGpsTag(Buffer.from('Exif\0\0II*\0\xff\xff\0\0', 'latin1')), false);
});

test('R-b: 확장자 = 알아낸 형식 · 시험 파일 확장자가 이상하면 파일 머리로', async () => {
  assert.equal(extFor('jpeg'), '.jpg');
  assert.equal(extFor('heif'), '.heic');
  assert.equal(extFor('mp4'), '.mp4');
  assert.equal(extFor('svg'), null);
  const jpg = await base().jpeg().toBuffer();
  const png = await base().png().toBuffer();
  const webp = await base().webp().toBuffer();
  assert.equal((await inspect(jpg, 'x.html')).format, 'jpeg'); // 이름이 x.html이어도 내용은 jpeg
  assert.equal(safeExt('20261119_x.html', jpg), '.jpg');
  assert.equal(safeExt('a.HTML', png), '.png');
  assert.equal(safeExt('a.exe', webp), '.webp');
  assert.equal(safeExt('a.jpg', png), '.jpg'); // 안전 목록 확장자는 그대로(R-b 뒤 놓은 파일)
  assert.equal(safeExt('a.html', Buffer.from('<html><body>hi</body></html>')), null);
});

test('R-c: Host가 localhost · 127.0.0.1 · [::1]만 통과', () => {
  for (const h of ['localhost:4300', 'LOCALHOST:4300', '127.0.0.1:4300', '[::1]:4300', 'localhost']) assert.equal(isLocalHost(h), true, h);
  for (const h of [undefined, '', 'evil.example:4300', 'localhost.evil.example:4300', '192.168.0.5:4300', '127.0.0.1.nip.io:4300', '[::2]:4300']) assert.equal(isLocalHost(h), false, String(h));
});

test('R-1: 방화벽 규칙 확인 = 있음 · 없음 · 확인 못 함', async () => {
  if (process.platform !== 'win32') return;
  const fake = (out, err = null) => (cmd, args, opts, cb) => cb(err, out);
  assert.equal(await hasDbFirewallRule(fake('yes\r\n')), true);
  assert.equal(await hasDbFirewallRule(fake('no\r\n')), false);
  assert.equal(await hasDbFirewallRule(fake('', new Error('x'))), null);
});
