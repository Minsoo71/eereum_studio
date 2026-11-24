// PC2-스튜디오-9: 세로 영상 = 휴대폰 칸(auto) · mp4 화면 크기 읽기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTarget, autoMobileNote } from '../server/drop-target.mjs';
import { mp4Size, inspect } from '../server/images.mjs';

const twoFiles = { current: { pc: { url: '/media/home/pc.webp' }, mobile: { url: '/media/home/m.webp' } } };
const oneFile = { current: { pc: { url: '/media/about/hero.jpg' } } };

test('놓을 자리: auto = 세로 영상 + 휴대폰 파일 있는 칸이면 mobile · 그 밖은 both · 고른 값은 그대로', () => {
  const tall = { media: 'video', width: 1080, height: 2340 };
  const wide = { media: 'video', width: 1920, height: 1080 };
  assert.deepEqual(resolveTarget('auto', tall, twoFiles), { target: 'mobile', auto: true });
  assert.deepEqual(resolveTarget('auto', wide, twoFiles), { target: 'both', auto: true });
  assert.deepEqual(resolveTarget('auto', tall, oneFile), { target: 'both', auto: true }, '파일 하나 칸은 둘 다');
  assert.deepEqual(resolveTarget('auto', { media: 'video' }, twoFiles), { target: 'both', auto: true }, '크기 모름 = 예전처럼');
  assert.deepEqual(resolveTarget('auto', { media: 'image', width: 1290, height: 2796 }, twoFiles), { target: 'both', auto: true }, '그림은 auto여도 둘 다(휴대폰 파일은 잘라 씀)');
  assert.deepEqual(resolveTarget('both', tall, twoFiles), { target: 'both', auto: false }, '"둘 다"를 고르면 세로여도 둘 다');
  assert.deepEqual(resolveTarget('pc', tall, twoFiles), { target: 'pc', auto: false });
  assert.deepEqual(resolveTarget('--x', tall, twoFiles), { target: 'both', auto: false }, '모르는 값 = both');
  assert.match(autoMobileNote(tall), /1080×2340.*휴대폰 화면에만/);
});

// 아주 작은 mp4: ftyp + moov > trak > tkhd(v0/v1 · 행렬 · 폭 · 높이 16.16)
function box(type, ...parts) {
  const body = Buffer.concat(parts);
  const h = Buffer.alloc(8);
  h.writeUInt32BE(8 + body.length);
  h.write(type, 4, 'latin1');
  return Buffer.concat([h, body]);
}
function tkhd(w, h, rot90 = false, version = 0) {
  const b = Buffer.alloc(version === 1 ? 96 : 84); // v0 = 84바이트(행렬 40 · 폭 76) · v1 = 96(행렬 52 · 폭 88)
  b[0] = version;
  const m = version === 1 ? 52 : 40;
  // 행렬 a b u c d v x y w (보통 a = d = 1.0 · 90° 돌림 = b 1 · c −1)
  b.writeInt32BE(rot90 ? 0 : 0x10000, m);
  b.writeInt32BE(rot90 ? 0x10000 : 0, m + 4);
  b.writeInt32BE(rot90 ? -0x10000 : 0, m + 12);
  b.writeInt32BE(rot90 ? 0 : 0x10000, m + 16);
  b.writeInt32BE(0x40000000, m + 32);
  b.writeUInt32BE(w * 65536, m + 36);
  b.writeUInt32BE(h * 65536, m + 40);
  return box('tkhd', b);
}
const mp4 = (...tracks) => Buffer.concat([box('ftyp', Buffer.from('isom0000isom', 'latin1')), box('moov', ...tracks.map((t) => box('trak', t)))]);

test('mp4 크기: tkhd 폭 · 높이 · 소리 트랙(0×0) 무시 · 90° 돌림이면 바꿈 · v1 상자 · 망가진 파일 = {}', async () => {
  assert.deepEqual(mp4Size(mp4(tkhd(1080, 2340))), { width: 1080, height: 2340 });
  assert.deepEqual(mp4Size(mp4(tkhd(0, 0), tkhd(1920, 1080))), { width: 1920, height: 1080 }, '소리 트랙 건너뜀');
  assert.deepEqual(mp4Size(mp4(tkhd(1920, 1080, true))), { width: 1080, height: 1920 }, '휴대폰으로 세워 찍은 영상');
  assert.deepEqual(mp4Size(mp4(tkhd(1280, 720, false, 1))), { width: 1280, height: 720 });
  assert.deepEqual(mp4Size(Buffer.from('0000000c66747970', 'hex')), {});
  assert.deepEqual(mp4Size(mp4(tkhd(1080, 2340)).subarray(0, 40)), {}, '잘린 파일');
  const info = await inspect(mp4(tkhd(1080, 2340)), 'a.mp4');
  assert.deepEqual([info.media, info.width, info.height], ['video', 1080, 2340]);
});
