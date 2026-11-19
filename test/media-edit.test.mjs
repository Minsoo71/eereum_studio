// M5 초점 반영(약속 v1.3): media.ts 그 칸의 focus만 바꿈
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setFocusInMedia } from '../server/media-edit.mjs';

const SRC = `export const media = {
  'about.hero': { pc: '/media/about/hero.jpg', alt: 'media.about.hero', focus: 'center' },
  'about.design': { pc: '/media/about/design.jpg', alt: 'media.about.design', focus: 'center' },
  'home.hero': {
    pc: '/media/home/hero.jpg',
    mobile: '/media/home/hero-mobile.jpg',
    alt: 'media.home.hero',
    focus: 'center',
  },
  'dev.nofocus': { pc: '/x.jpg', alt: 'x' },
};`;

test('한 줄 항목: 그 칸의 focus만 바뀜 · 다른 칸 그대로', () => {
  const out = setFocusInMedia(SRC, 'about.hero', { x: 0.72, y: 0.5 });
  assert.match(out, /'about\.hero': \{ pc: '\/media\/about\/hero\.jpg', alt: 'media\.about\.hero', focus: '0\.72 0\.5' \}/);
  assert.match(out, /'about\.design': .*focus: 'center'/);
  assert.equal(out.length, SRC.length + '0.72 0.5'.length - 'center'.length);
});

test('여러 줄 항목도 · 이름이 겹치는 칸(about.hero ↔ home.hero) 헷갈리지 않음', () => {
  const out = setFocusInMedia(SRC, 'home.hero', { x: 0.3, y: 0.1 });
  assert.match(out, /mobile: '\/media\/home\/hero-mobile\.jpg',\n\s+alt: 'media\.home\.hero',\n\s+focus: '0\.3 0\.1',/);
  assert.match(out, /'about\.hero': .*focus: 'center'/);
});

test('없는 칸 · focus 줄이 없는 칸 → null(조용히 바꾸지 않음)', () => {
  assert.equal(setFocusInMedia(SRC, 'nope', { x: 0.5, y: 0.5 }), null);
  assert.equal(setFocusInMedia(SRC, 'dev.nofocus', { x: 0.5, y: 0.5 }), null);
});
