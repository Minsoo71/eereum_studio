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
    getBoundingClientRect: () => (attrs.hidden ? { left: 0, top: 0, width: 0, height: 0 } : { left: 0, top: 0, width: 100, height: 80 }),
  };
  Object.defineProperty(e, 'src', { get: () => e.attrs.src, set: (v) => (e.attrs.src = v) });
  Object.defineProperty(e, 'srcset', { get: () => e.attrs.srcset || '', set: (v) => (e.attrs.srcset = v) });
  return e;
}

function setup(slots, opts = {}) {
  const posted = [];
  const listeners = {};
  const all = slots;
  const document = {
    readyState: 'complete',
    currentScript: { src: 'http://localhost:4301/__studio/bridge.js?parent=http%3A%2F%2Flocalhost%3A4300' },
    documentElement: { scrollHeight: 2000 },
    body: { appendChild() {} },
    createElement: opts.createElement ?? (() => ({ style: {}, setAttribute() {}, remove() {} })),
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
    MutationObserver: class { observe() {} }, innerHeight: 800, innerWidth: 390, scrollX: 0, scrollY: 0, scrollTo() {},
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

test('bridge: 이 폭에서 숨는 칸 — ready에 visible 0 · 고르면 studio:hidden (PC8 B-1)', () => {
  const hiddenBox = el({ 'data-slot': 'home.story', hidden: true });
  const shown = el({ 'data-slot': 'home.hero' });
  const { posted, send } = setup([hiddenBox, shown]);
  const ready = posted.find((p) => p.m.type === 'studio:ready').m;
  assert.equal(ready.slots.find((s) => s.key === 'home.story').visible, 0);
  assert.equal(ready.slots.find((s) => s.key === 'home.hero').visible, 1);
  send({ type: 'studio:select', key: 'home.story' });
  assert.ok(posted.some((p) => p.m.type === 'studio:hidden' && p.m.key === 'home.story'));
  assert.notEqual(hiddenBox.scrolled, true, '숨은 칸으로는 스크롤하지 않음');
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

test('bridge: 초점(PC11-스튜디오-3) — 한 파일 칸은 object-position · <picture> 칸은 그대로 · 배경은 background-position', () => {
  const single = el({ tag: 'img', src: '/media/rings/hero.jpg' });
  single.style = {};
  const picImg = el({ tag: 'img', src: '/media/home/hero.jpg' });
  picImg.style = {};
  const src = el({ tag: 'source', srcset: '/media/home/hero-mobile.jpg' });
  src.media = '(max-width: 767px)';
  const bg = el({ 'data-slot': 'home.story.bg', 'data-slot-kind': 'background' });
  const { send } = setup([el({ 'data-slot': 'rings.hero' }, [single]), el({ 'data-slot': 'home.hero' }, [src, picImg]), bg]);
  send({ type: 'studio:update', key: 'rings.hero', lane: 'image', urls: {}, focus: { x: 0.25, y: 0.8 }, version: 10 });
  assert.equal(single.style.objectPosition, '25% 80%');
  assert.equal(single.src, '/media/rings/hero.jpg', '주소가 없으면 그림은 그대로');
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', urls: { mobile: '/media/home/hero-mobile.jpg' }, focus: { x: 0.9, y: 0.5 }, version: 11 });
  assert.equal(picImg.style.objectPosition, undefined, 'PC 그림 위치는 바꾸지 않음(휴대폰 파일을 도우미가 다시 자름)');
  assert.equal(src.srcset, '/media/home/hero-mobile.jpg?v=11');
  send({ type: 'studio:update', key: 'home.story.bg', lane: 'image', urls: {}, focus: { x: 0, y: 1 }, version: 12 });
  assert.equal(bg.style.backgroundPosition, '0% 100%');
});

test('bridge: 사이트 <picture>(PC8 B-10) — <source min-width:1280px> = PC 파일 · <img> = 휴대폰 파일 · 초점(휴대폰만 다시 자름)이 휴대폰 그림에 들어감', () => {
  // apps/web/components/ui/Media.tsx · HeroPicture.tsx 모양 그대로
  const pcSrc = el({ tag: 'source', media: '(min-width: 1280px)', srcset: '/_next/image?url=%2Fmedia%2Fhome%2Fhero.jpg&w=1920 1920w' });
  pcSrc.media = '(min-width: 1280px)';
  const img = el({ tag: 'img', src: '/_next/image?url=%2Fmedia%2Fhome%2Fhero-mobile.jpg&w=828', srcset: '/_next/image?url=%2Fmedia%2Fhome%2Fhero-mobile.jpg&w=640 640w, /_next/image?url=%2Fmedia%2Fhome%2Fhero-mobile.jpg&w=828 828w' });
  img.style = {};
  const { send } = setup([el({ 'data-slot': 'home.hero' }, [pcSrc, img])]);
  // 놓기: PC · 휴대폰 둘 다
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', urls: { pc: '/media/home/hero.jpg', mobile: '/media/home/hero-mobile.jpg' }, version: 20 });
  assert.equal(img.src, '/media/home/hero-mobile.jpg?v=20', '<img> = 휴대폰 파일');
  assert.equal(img.srcset, '/media/home/hero-mobile.jpg?v=20 640w, /media/home/hero-mobile.jpg?v=20 828w');
  assert.equal(pcSrc.srcset, '/media/home/hero.jpg?v=20 1920w', '<source min-width> = PC 파일');
  // 초점: 도우미가 휴대폰 파일만 다시 자름(urls.mobile만) → 휴대폰 그림만 바뀌고 PC <source>는 그대로
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', state: 'trial', urls: { mobile: '/media/home/hero-mobile.jpg' }, focus: { x: 0.9, y: 0.5 }, version: 21 });
  assert.equal(img.src, '/media/home/hero-mobile.jpg?v=21', '초점이 휴대폰 창 그림에 반영');
  assert.equal(pcSrc.srcset, '/media/home/hero.jpg?v=20 1920w', 'PC 그림은 안 바뀜');
  assert.equal(img.style.objectPosition, undefined, '<picture> 칸은 위치를 바꾸지 않음(파일을 다시 자름)');
  // PC만 놓기 → 휴대폰 그림은 그대로
  send({ type: 'studio:update', key: 'home.hero', lane: 'image', urls: { pc: '/media/_studio/p.jpg' }, version: 22 });
  assert.equal(img.src, '/media/home/hero-mobile.jpg?v=21');
  assert.equal(pcSrc.srcset, '/media/_studio/p.jpg?v=22 1920w');
});

test('bridge: HeroPicture에서 PC = 휴대폰 같은 그림이면 <source> 없음 → <img>에 받은 그림', () => {
  const img = el({ tag: 'img', src: '/media/rings/hero.jpg' });
  const { send } = setup([el({ 'data-slot': 'rings.hero' }, [img])]);
  send({ type: 'studio:update', key: 'rings.hero', lane: 'image', urls: { pc: '/media/rings/hero.jpg' }, version: 5 });
  assert.equal(img.src, '/media/rings/hero.jpg?v=5');
});

// 작은 DOM(B-6 시험용): 태그 · [속성] 찾기 · 끼우기 · 빼기
function node(tag, attrs = {}, kids = []) {
  const n = {
    tag, attrs: { ...attrs }, style: {}, children: [], parentNode: null, className: attrs.class ?? '',
    getAttribute: (k) => (k in n.attrs ? n.attrs[k] : null),
    setAttribute: (k, v) => { n.attrs[k] = String(v); },
    removeAttribute: (k) => { delete n.attrs[k]; },
    is: (sel) => { const m = sel.match(/^\[([\w-]+)\]$/); return m ? m[1] in n.attrs : sel === n.tag; },
    matches: (sel) => n.is(sel),
    querySelectorAll: (sel) => n.children.flatMap((c) => [...(c.is(sel) ? [c] : []), ...c.querySelectorAll(sel)]),
    querySelector: (sel) => n.querySelectorAll(sel)[0] ?? null,
    insertBefore: (x, ref) => { x.parentNode = n; const i = ref ? n.children.indexOf(ref) : -1; i < 0 ? n.children.push(x) : n.children.splice(i, 0, x); return x; },
    removeChild: (x) => { n.children = n.children.filter((c) => c !== x); x.parentNode = null; },
    get firstChild() { return n.children[0] ?? null; },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 80 }),
    scrollIntoView() {},
    load() { n.loaded = (n.loaded ?? 0) + 1; },
    play() { n.playing = true; return Promise.resolve(); },
    pause() { n.playing = false; },
  };
  for (const k of kids) n.insertBefore(k, null);
  if ('src' in attrs) n.src = attrs.src;
  return n;
}

test('bridge: 그림 칸에 mp4(PC8 B-6) — <video muted loop playsinline> 끼움 · 그림은 숨겨 포스터로 · "0곳" 아님 · 되돌리면 그림으로', () => {
  const img = node('img', { src: '/_next/image?url=%2Fmedia%2Fhome%2Fstory.jpg&w=828', class: 'object-cover' });
  const pic = node('picture', {}, [node('source', { media: '(min-width: 1280px)' }), img]);
  const slot = node('div', { 'data-slot': 'home.story', 'data-slot-kind': 'normal' }, [pic]);
  const { posted, send } = setup([slot], { createElement: (t) => node(t) });
  send({ type: 'studio:update', key: 'home.story', lane: 'video', state: 'trial', urls: { video: '/media/_studio/home.story.mp4' }, version: 30 });
  const v = slot.querySelector('video');
  assert.ok(v, '<video>를 끼움');
  assert.equal(v.src, '/media/_studio/home.story.mp4?v=30');
  for (const a of ['muted', 'loop', 'playsinline', 'autoplay']) assert.ok(a in v.attrs, a);
  assert.equal(v.muted, true);
  assert.equal(v.poster, img.src, '포스터 = 지금 그림');
  assert.equal(v.className, 'object-cover');
  assert.equal(pic.style.display, 'none', '그림은 숨김(지우지 않음)');
  assert.equal(v.playing, true);
  const applied = posted.filter((p) => p.m.type === 'studio:applied').pop().m;
  assert.equal(applied.count, 1, '"0곳" 아님');
  // 다시 놓음: 새 영상 하나만(두 개 끼우지 않음)
  send({ type: 'studio:update', key: 'home.story', lane: 'video', urls: { video: '/media/_studio/home.story.mp4' }, version: 31 });
  assert.equal(slot.querySelectorAll('video').length, 1);
  assert.equal(slot.querySelector('video').src, '/media/_studio/home.story.mp4?v=31');
  // 되돌림(도우미 revert: lane video · urls에 video 없음) → 영상 빼고 그림 다시
  send({ type: 'studio:update', key: 'home.story', lane: 'video', state: 'empty', url: '/media/home/story.jpg?v=32', urls: { pc: '/media/home/story.jpg?v=32' }, version: 32 }); // 도우미 revert 신호 그대로
  assert.equal(slot.querySelectorAll('video').length, 0);
  assert.equal(pic.style.display, '');
});

test('bridge: 영상 뒤 그림을 놓으면 끼운 영상을 빼고 그림으로 · 배경 칸에도 영상', () => {
  const img = node('img', { src: '/media/about/hero.jpg' });
  const slot = node('div', { 'data-slot': 'about.hero' }, [img]);
  const bg = node('section', { 'data-slot': 'home.story.bg', 'data-slot-kind': 'background' }, [node('h2')]);
  const { send } = setup([slot, bg], { createElement: (t) => node(t) });
  send({ type: 'studio:update', key: 'about.hero', lane: 'video', urls: { video: '/v.mp4' }, version: 1 });
  assert.equal(slot.querySelectorAll('video').length, 1);
  send({ type: 'studio:update', key: 'about.hero', lane: 'image', urls: { pc: '/media/about/new.jpg' }, version: 2 });
  assert.equal(slot.querySelectorAll('video').length, 0);
  assert.equal(img.style.display, '');
  assert.equal(img.src, '/media/about/new.jpg?v=2');
  send({ type: 'studio:update', key: 'home.story.bg', lane: 'video', urls: { video: '/bg.mp4' }, version: 3 });
  const v = bg.querySelector('video');
  assert.ok(v && bg.children[0] === v, '배경 칸 맨 뒤(첫 자식)');
  assert.equal(v.style.zIndex, '-1');
  assert.equal(bg.style.isolation, 'isolate');
});
