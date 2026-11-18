// pnpm test (이 저장소에서)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspect, forSite, variants, StudioError } from '../server/images.mjs';

const exifJpeg = () =>
  sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#2b6370' } })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'PC9' } })
    .jpeg()
    .toBuffer();

test('카메라 정보가 있는 jpg → 사본용 그림에는 메타데이터 없음 · sRGB · 폭 맞춤', async () => {
  const src = await exifJpeg();
  assert.ok((await sharp(src).metadata()).exif, '시험 그림에 exif가 있어야 함');
  const out = await forSite(src, { format: 'jpg', width: 1600 });
  const m = await sharp(out).metadata();
  assert.equal(m.exif, undefined);
  assert.equal(m.width, 1600);
  assert.equal(m.space, 'srgb');
});

test('작은 그림은 늘리지 않음', async () => {
  const src = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#fff' } }).png().toBuffer();
  const out = await forSite(src, { format: 'webp', width: 1600 });
  assert.equal((await sharp(out).metadata()).width, 500);
});

test('확정용 묶음 = webp · jpg × 960 · 1600', async () => {
  const v = await variants(await exifJpeg());
  assert.deepEqual(v.map((x) => `${x.format}@${x.width}`).sort(), ['jpg@1600', 'jpg@960', 'webp@1600', 'webp@960'].sort());
});

test('그림이 아니면 FILE_TYPE · mp4 머리 없으면 FILE_TYPE', async () => {
  await assert.rejects(inspect(Buffer.from('hello'), 'a.jpg'), (e) => e instanceof StudioError && e.code === 'FILE_TYPE');
  await assert.rejects(inspect(Buffer.from('hello world!'), 'a.mp4'), (e) => e.code === 'FILE_TYPE');
});

test('mp4 머리(ftyp)는 영상으로', async () => {
  const r = await inspect(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]), 'a.mp4');
  assert.equal(r.media, 'video');
});
