// 휴대폰 자르기 초점 (PC11-스튜디오-3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import { parseRatio, mobileRatio, clampFocus, parseFocus, focusToCss, cropBox, cropForMobile, hasMobileFile } from '../../preview/focus.mjs';

const HERO = { current: { pc: { url: '/media/home/hero.jpg', width: 1750, height: 1400 }, mobile: { url: '/media/home/hero-mobile.jpg', width: 1320, height: 1320 } }, spec: { displayRatio: '모바일 1:1 · PC 5:4' } };

test('초점: 비율 읽기 · 휴대폰 비율(파일 크기 → displayRatio 모바일 → 없음)', () => {
  assert.equal(parseRatio('5:4'), 1.25);
  assert.equal(parseRatio('1.37:1'), 1.37);
  assert.equal(parseRatio('모름'), null);
  assert.equal(mobileRatio(HERO), 1);
  assert.equal(mobileRatio({ current: { pc: {} }, spec: { displayRatio: '모바일 4:5 · PC 16:9' } }), 0.8);
  assert.equal(mobileRatio({ current: { pc: {} }, spec: { ratio: '1200:630' } }), null);
  assert.equal(hasMobileFile(HERO), true);
  assert.equal(hasMobileFile({ current: { pc: {} } }), false);
});

test('초점: 점 바로잡기 · media.ts 글자 · CSS', () => {
  assert.deepEqual(clampFocus({ x: 1.4, y: -2 }), { x: 1, y: 0 });
  assert.deepEqual(clampFocus({ x: 'a' }), { x: 0.5, y: 0.5 });
  assert.deepEqual(parseFocus('0.97 0.5'), { x: 0.97, y: 0.5 });
  assert.deepEqual(parseFocus('top'), { x: 0.5, y: 0 });
  assert.deepEqual(parseFocus('center'), { x: 0.5, y: 0.5 });
  assert.equal(focusToCss({ x: 0.25, y: 0.8 }), '25% 80%');
});

test('초점: 자를 자리 — 가운데 기본 · 점 쪽으로 · 끝에서 멈춤 · 항상 그림 안', () => {
  assert.deepEqual(cropBox(2000, 1600, 1), { left: 200, top: 0, width: 1600, height: 1600 });
  assert.deepEqual(cropBox(2000, 1600, 1, { x: 0, y: 0.5 }), { left: 0, top: 0, width: 1600, height: 1600 });
  assert.deepEqual(cropBox(2000, 1600, 1, { x: 1, y: 0.5 }), { left: 400, top: 0, width: 1600, height: 1600 });
  assert.deepEqual(cropBox(2000, 1600, 1, { x: 0.55, y: 0.5 }), { left: 300, top: 0, width: 1600, height: 1600 });
  // 세로로 긴 휴대폰 상자(4:5) · 가로 그림 → 높이 다 쓰고 가로 자름
  assert.deepEqual(cropBox(1600, 1000, 0.8, { x: 0.9, y: 0.1 }), { left: 800, top: 0, width: 800, height: 1000 });
  // 그림보다 넓은 비율 → 세로를 자름
  const b = cropBox(1000, 1000, 2, { x: 0.5, y: 1 });
  assert.deepEqual(b, { left: 0, top: 500, width: 1000, height: 500 });
});

test('초점: 미리보기 창(preview.js)의 노란 테두리 계산 = focus.mjs와 같음', () => {
  const src = readFileSync(new URL('../../preview/public/preview.js', import.meta.url), 'utf8');
  const pick = (name) => src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0];
  const ctx = {};
  vm.runInNewContext(`${pick('mobileRatioOf')}\n${pick('cropBoxPct')}\nthis.r = mobileRatioOf; this.c = cropBoxPct;`, ctx);
  assert.equal(ctx.r(HERO), mobileRatio(HERO));
  assert.equal(ctx.r({ current: {}, spec: { displayRatio: '모바일 4:5' } }), 0.8);
  for (const [w, h, ratio, f] of [[2000, 1600, 1, { x: 0.8, y: 0.5 }], [1600, 1000, 0.8, { x: 0.1, y: 0.9 }], [1000, 1000, 2, { x: 0.5, y: 0.2 }]]) {
    const a = cropBox(w, h, ratio, f);
    const p = ctx.c(w, h, ratio, f);
    assert.ok(Math.abs((p.left / 100) * w - a.left) <= 1 && Math.abs((p.width / 100) * w - a.width) <= 1, `${w}x${h} ${ratio}`);
    assert.ok(Math.abs((p.top / 100) * h - a.top) <= 1 && Math.abs((p.height / 100) * h - a.height) <= 1);
  }
});

test('초점: 실제 그림 자르기 — 오른쪽 점을 고르면 휴대폰 그림에 오른쪽(파랑)이 남음', async () => {
  // 2000×1000: 왼쪽 절반 빨강 · 오른쪽 절반 파랑
  const half = (c) => sharp({ create: { width: 1000, height: 1000, channels: 3, background: c } }).png().toBuffer();
  const buf = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#000' } })
    .composite([{ input: await half('#ff0000'), left: 0, top: 0 }, { input: await half('#0000ff'), left: 1000, top: 0 }])
    .jpeg().toBuffer();
  const right = await cropForMobile(sharp, buf, 1, { x: 0.95, y: 0.5 });
  assert.deepEqual(right.box, { left: 1000, top: 0, width: 1000, height: 1000 });
  const meta = await sharp(right.data).metadata();
  assert.equal(meta.width, 1000);
  assert.equal(meta.height, 1000);
  const { dominant } = await sharp(right.data).stats();
  assert.ok(dominant.b > 200 && dominant.r < 60, `파랑이 남아야 함 ${JSON.stringify(dominant)}`);
  const center = await cropForMobile(sharp, buf, 1);
  assert.deepEqual(center.box, { left: 500, top: 0, width: 1000, height: 1000 }, '기본 = 가운데');
});
