// bridge.js를 아주 작은 가짜 화면에서 돌려 봄(추가 패키지 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../../preview/bridge.js', import.meta.url), 'utf8');

function el(attrs, children = []) {
  const e = {
    attrs: { ...attrs },
    style: {},
    children,
    getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null),
    removeAttribute: (k) => delete e.attrs[k],
    matches: (sel) => sel === e.attrs.tag,
    querySelector: (sel) => e.querySelectorAll(sel)[0] || null,
    querySelectorAll: (sel) => children.filter((c) => c.attrs.tag === sel),
    scrollIntoView() {
      e.scrolled = true;
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }),
  };
  Object.defineProperty(e, 'src', { get: () => e.attrs.src, set: (v) => (e.attrs.src = v) });
  Object.defineProperty(e, 'srcset', { get: () => e.attrs.srcset || '', set: (v) => (e.attrs.srcset = v) });
  return e;
}

function setup(slots) {
  const posted = [];
  const listeners = {};
  const all = slots;
  const document = {
    readyState: 'complete',
    currentScript: { src: 'http://localhost:4301/__studio/bridge.js?parent=http%3A%2F%2Flocalhost%3A4300' },
    documentElement: { scrollHeight: 2000 },
    body: { appendChild() {} },
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }),
    querySelectorAll: (sel) => {
      const m = sel.match(/^\[data-slot="(.+)"\]$/);
      if (m) return all.filter((s) => s.attrs['data-slot'] === m[1]);
      if (sel === '[data-slot]') return all;
      return [];
    },
    addEventListener() {},
  };
  const window = {
    parent: { postMessage: (m, o) => posted.push({ m, o }) },
    addEventListener: (t, fn) => (listeners[t] = fn),
    CSS: { escape: (s) => s },
  };
  const ctx = {
    window, document, location: { href: 'http://localhost:4301/', origin: 'http://localhost:4301', pathname: '/' },
    URL, setTimeout: (fn) => fn(), clearTimeout() {}, Date, Number, String, JSON, Object, Array,
    MutationObserver: class { observe() {} }, innerHeight: 800, scrollX: 0, scrollY: 0, scrollTo() {},
  };
  ctx.window.window = ctx.window;
  vm.runInNewContext(SRC, ctx);
  const send = (data, origin = 'http://localhost:4300') => listeners.message({ origin, data });
  return { posted, send, api: ctx.window.__studioBridge };
}

test('bridge: 시작하면 지금 화면의 칸 목록을 부모(4300)에만 보냄', () => {
  const img = el({ tag: 'img', src: '/media/home/hero.jpg' });
  const { posted } = setup([el({ 'data-slot': 'home.hero' }, [img]), el({ 'data-slot': 'home.story.bg', 'data-slot-kind': 'background' })]);
  const ready = posted.find((p) => p.m.type === 'studio:ready');
  assert.equal(ready.o, 'http://localhost:4300');
  assert.deepEqual(ready.m.slots.map((s) => s.key), ['home.hero', 'home.story.bg']);
});

test('bridge: 놓음 → 그림 · srcset · 배경을 ?v=로 바꿔 끼움 · 옛 version은 무시', () => {
  const img = el({ tag: 'img', src: '/_next/image?url=%2Fmedia%2Fhome%2Fhero.jpg&w=1080', srcset: '/a.jpg 1x, /b.jpg 2x', loading: 'lazy' });
  const bg = el({ 'data-slot': 'home.story.bg', 'data-slot-kind': 'background' });
  const { posted, send } = setup([el({ 'data-slot': 'home.hero' }, [img]), bg]);
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', url: '/media/home/hero.jpg', version: 5 });
  assert.equal(img.src, '/media/home/hero.jpg?v=5');
  assert.equal(img.srcset, '/media/home/hero.jpg?v=5 1x, /media/home/hero.jpg?v=5 2x');
  assert.equal(img.attrs.loading, undefined);
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', url: '/media/home/old.jpg', version: 3 });
  assert.equal(img.src, '/media/home/hero.jpg?v=5', '옛 신호 무시');
  send({ type: 'studio:update', key: 'home.story.bg', lane: 'image', url: '/media/home/story-bg.jpg', version: 9 });
  assert.equal(bg.style.backgroundImage, 'url("/media/home/story-bg.jpg?v=9")');
  assert.ok(posted.some((p) => p.m.type === 'studio:applied' && p.m.key === 'home.hero' && p.m.count === 1));
});

test('bridge: 다른 출처에서 온 메시지는 무시 · 없는 칸은 missing', () => {
  const img = el({ tag: 'img', src: '/x.jpg' });
  const { posted, send } = setup([el({ 'data-slot': 'home.hero' }, [img])]);
  send({ type: 'studio:update', key: 'home.hero', url: '/evil.jpg', version: 1 }, 'http://evil.example');
  assert.equal(img.src, '/x.jpg');
  send({ type: 'studio:select', key: 'ring.angle.3' });
  assert.ok(posted.some((p) => p.m.type === 'studio:missing' && p.m.key === 'ring.angle.3'));
});

test('bridge: 칸 고름 → 그 칸으로 스크롤', () => {
  const box = el({ 'data-slot': 'home.hero' });
  const { send } = setup([box]);
  send({ type: 'studio:select', key: 'home.hero' });
  assert.equal(box.scrolled, true);
});

test('bridge: 약속 v1.1 urls — <picture> 모바일 · PC 따로 바꿈 · 모바일만 오면 PC 그림은 그대로', () => {
  const mobileSrc = el({ tag: 'source', media: '(max-width: 767px)', srcset: '/media/home/hero-mobile.jpg' });
  mobileSrc.media = '(max-width: 767px)';
  const img = el({ tag: 'img', src: '/media/home/hero.jpg' });
  const pic = el({ 'data-slot': 'home.hero' }, [mobileSrc, img]);
  const { send } = setup([pic]);
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', urls: { mobile: '/media/_studio/m.jpg' }, version: 2 });
  assert.equal(mobileSrc.srcset, '/media/_studio/m.jpg?v=2');
  assert.equal(img.src, '/media/home/hero.jpg', 'PC 그림은 안 바뀜');
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', urls: { pc: '/media/_studio/p.jpg', mobile: '/media/_studio/m2.jpg' }, version: 3 });
  assert.equal(img.src, '/media/_studio/p.jpg?v=3');
  assert.equal(mobileSrc.srcset, '/media/_studio/m2.jpg?v=3');
});

test('bridge: pickUrls — v1.1 urls 먼저 · v1 url+target도 받음', () => {
  const { api } = setup([]);
  assert.deepEqual({ ...api.pickUrls({ urls: { pc: '/p.jpg' } }) }, { pc: '/p.jpg', mobile: undefined, video: undefined });
  assert.deepEqual({ ...api.pickUrls({ url: '/a.jpg', target: 'mobile' }) }, { pc: undefined, mobile: '/a.jpg', video: undefined });
  assert.deepEqual({ ...api.pickUrls({ url: '/a.jpg' }) }, { pc: '/a.jpg', mobile: '/a.jpg', video: undefined });
  assert.equal(api.pickUrls({ lane: 'video', urls: { video: '/v.mp4' } }).video, '/v.mp4');
});

test('bridge: matchesTarget(모바일 · PC <source>)', () => {
  const { api } = setup([]);
  assert.equal(api.matchesTarget('(min-width: 768px)', 'pc'), true);
  assert.equal(api.matchesTarget('(max-width: 767px)', 'pc'), false);
  assert.equal(api.matchesTarget('(max-width: 767px)', 'mobile'), true);
  assert.equal(api.matchesTarget('(min-width: 768px)', 'both'), true);
});
