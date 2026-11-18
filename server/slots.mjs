// 칸 목록 만들기 — 쇼핑몰 사본의 content/media.ts를 매번 새로 읽음(사이트 구조가 바뀌어도 따라감)
// 모양 = contract/slots.schema.json · 칸 ID = P페이지번호-순번(그 페이지 안 화면 위 → 아래)
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

/** 페이지(이름 앞부분 → 페이지) · 순서 = 대장 칸 ID 순서 */
export const PAGES = [
  { pageId: 'P01', name: '홈', paths: ['/'], prefixes: ['home.'] },
  { pageId: 'P02', name: '반지 둘러보기 · 전체 반지 · 검색', paths: ['/rings', '/rings/all', '/search'], prefixes: ['rings.'] },
  { pageId: 'P03', name: '반지 상세(이니셜 고르기)', paths: ['/ring/mine', '/ring/couple', '/ring/wish', '/ring/sound'], prefixes: ['ring.'] },
  { pageId: 'P04', name: '브랜드 스토리', paths: ['/about'], prefixes: ['about.'] },
  { pageId: 'P05', name: '이름 이야기', paths: ['/story'], prefixes: ['story.'] },
  { pageId: 'P06', name: '장바구니 · 주문서 · 주문 완료', paths: ['/cart', '/checkout'], prefixes: ['cart.'] },
  { pageId: 'P07', name: '공유 미리보기(카카오톡 · SNS)', paths: ['/'], prefixes: ['seo.'] },
  { pageId: 'P08', name: '디자인 확인(개발용)', paths: ['/dev/look'], prefixes: ['dev.'], public: false },
  { pageId: 'P09', name: '기타(새 칸)', paths: ['/'], prefixes: [] },
];

/** 화면 위치(사람이 읽는 말) · 화면 순서. 없는 칸은 맨 뒤 · 이름 그대로(새 칸 알림) */
const POSITIONS = [
  ['home.hero', '첫 화면 큰 사진(모바일 정사각 · PC 5:4)'],
  ['home.case.mine', '이름 반지 카드 ① 그대 이름'], ['home.case.ours', '이름 반지 카드 ② 우리 이름'],
  ['home.case.wish', '이름 반지 카드 ③ 소망 이름'], ['home.case.sound', '이름 반지 카드 ④ 소리 이름'],
  ['home.story.bg', '이름 이야기 칸 · 모바일 글 뒤 바탕'], ['home.story', '이름 이야기 칸 · PC 오른쪽 사진'],
  ['rings.hero', '/rings 첫 화면 큰 사진'],
  ['rings.featured.mine', '/rings 추천 카드 ① 그대 이름'], ['rings.featured.ours', '/rings 추천 카드 ② 우리 이름'],
  ['rings.featured.wish', '/rings 추천 카드 ③ 소망 이름'], ['rings.featured.sound', '/rings 추천 카드 ④ 소리 이름'],
  ['rings.list.single', '/rings/all · /search 목록 카드 · 단품'], ['rings.list.couple', '/rings/all · /search 목록 카드 · 커플'],
  ['ring.birth.font', '① 반지의 탄생 1/4 · 훈민정음 글자'], ['ring.birth.sketch', '① 반지의 탄생 2/4 · 스케치'],
  ['ring.birth.model', '① 반지의 탄생 3/4 · 3D 모델링'], ['ring.birth.complete', '① 반지의 탄생 4/4 · 완성'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => [`ring.angle.${i}`, `② 여러 각도에서 ${i}/8(밀어서 넘기기)`]),
  ['ring.preview', '(지금 화면에 안 쓰임 · 예비) 3D 미리보기 포스터 자리'],
  ['ring.story', '(지금 화면에 안 쓰임 · 예비) 옛 디자인 스토리 사진'],
  ['about.hero', '첫 화면 큰 사진'], ['about.design', '02 디자인 스토리 사진'],
  ['about.tile.workshop', '04 만드는 방식 타일 1/4'], ['about.tile.diamond', '04 만드는 방식 타일 2/4'],
  ['about.tile.material', '04 만드는 방식 타일 3/4'], ['about.tile.finish', '04 만드는 방식 타일 4/4'],
  ['story.ring', '맨 위 브랜드 메시지 반지'], ['story.tablet', '점토판(이름의 시작) 사진'],
  ['cart.line', '상품 줄 작은 그림(88×100)'],
  ['seo.og.default', '공유 미리보기 기본 그림(1200×630)'],
  ['dev.sample', '견본 칸(로고)'],
];
const POS = new Map(POSITIONS);
const ORDER = new Map(POSITIONS.map(([k], i) => [k, i]));

// 받는 종류(V8 · 화면 코드 확인): <Media>/HeroPicture = both · DeferredMedia(반지 상세 ① ②) · 공유 미리보기 = image
const IMAGE_ONLY = (k) => k.startsWith('ring.birth.') || k.startsWith('ring.angle.') || k === 'seo.og.default';
const UNUSED = new Set(['ring.preview', 'ring.story']);
const KIND = (k) => (k === 'home.story.bg' ? 'background' : k === 'seo.og.default' ? 'share' : 'normal');
const DISPLAY = { 'home.hero': '모바일 1:1 · PC 5:4', 'cart.line': '88:100', 'seo.og.default': '1200:630' };
const BIG = (k) => /^(home|rings|about)\.hero$/.test(k) || k === 'story.ring' || k.startsWith('ring.birth.');
const MIN_W = (k) => (BIG(k) ? 1600 : k === 'seo.og.default' ? 1200 : 960);
const SOURCE = (k) =>
  k === 'story.tablet' ? '위키미디어 공용(CC BY-SA 3.0)' : k === 'story.ring' ? '자체 렌더' :
  k.startsWith('ring.birth.') ? '사용자 제공' : k.startsWith('ring.angle.') ? '사용자 턴테이블 렌더' :
  k === 'seo.og.default' ? '임시 그림(로고만)' : k === 'dev.sample' ? '로고 svg' : 'Figma 임시 렌더';

/** media.ts 읽기 → { key: { pc, mobile, poster, alt, focus } } */
export function readMediaTs(siteDir) {
  const src = readFileSync(path.join(siteDir, 'content/media.ts'), 'utf8');
  const slots = {};
  for (const m of src.matchAll(/'([a-z0-9.]+)':\s*\{([^}]*)\}/g)) {
    const val = (k) => (m[2].match(new RegExp(`${k}:\\s*'([^']+)'`)) || [])[1] ?? null;
    slots[m[1]] = { pc: val('pc'), mobile: val('mobile'), poster: val('poster'), alt: val('alt'), focus: val('focus') };
  }
  return slots;
}

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function ratioOf(w, h) {
  const known = [[1, 1], [5, 4], [4, 5], [4, 3], [3, 4], [3, 2], [2, 3], [16, 9], [9, 16], [1.91, 1]];
  const k = known.find(([a, b]) => Math.abs(w / h - a / b) < 0.02);
  if (k) return `${k[0]}:${k[1]}`;
  const g = gcd(w, h);
  return w / g <= 50 ? `${w / g}:${h / g}` : `${(w / h).toFixed(2)}:1`;
}

async function fileInfo(siteDir, url) {
  if (!url) return undefined;
  const f = path.join(siteDir, 'apps/web/public', url);
  if (!existsSync(f)) return { url };
  try {
    const m = await sharp(f).metadata();
    return { url, width: m.width, height: m.height, format: path.extname(f).slice(1), bytes: statSync(f).size };
  } catch {
    return { url, format: path.extname(f).slice(1), bytes: statSync(f).size };
  }
}

/** 칸 목록 전체(contract/slots.schema.json 모양) */
export async function buildSlots(siteDir) {
  const media = readMediaTs(siteDir);
  let ko = {};
  try { ko = JSON.parse(readFileSync(path.join(siteDir, 'content/locales/ko/content.json'), 'utf8')); } catch { /* 대체 글 없이 */ }
  const get = (o, k) => k?.split('.').reduce((x, p) => (x == null ? x : x[p]), o);
  let commit = '0000000';
  try { commit = execFileSync('git', ['log', '-1', '--format=%h'], { cwd: siteDir, encoding: 'utf8' }).trim(); } catch { /* 저장소 아님 */ }
  let branch = '';
  try { branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: siteDir, encoding: 'utf8' }).trim(); } catch { /* */ }

  const pageOf = (k) => PAGES.find((p) => p.prefixes.some((x) => k.startsWith(x))) ?? PAGES.at(-1);
  const keys = Object.keys(media).sort((a, b) => {
    const pa = PAGES.indexOf(pageOf(a)), pb = PAGES.indexOf(pageOf(b));
    return pa - pb || (ORDER.get(a) ?? 999) - (ORDER.get(b) ?? 999) || a.localeCompare(b);
  });
  const urlUsers = {};
  for (const k of keys) for (const u of [media[k].pc, media[k].mobile].filter(Boolean)) (urlUsers[u] ??= []).push(k);
  const counter = {};
  const slots = [];
  for (const key of keys) {
    const s = media[key];
    const page = pageOf(key);
    counter[page.pageId] = (counter[page.pageId] ?? 0) + 1;
    const pc = (await fileInfo(siteDir, s.pc ?? s.mobile)) ?? { url: '/' };
    const mobile = s.mobile && s.pc ? await fileInfo(siteDir, s.mobile) : undefined;
    const shared = [...new Set([s.pc, s.mobile].filter(Boolean).flatMap((u) => urlUsers[u]))].filter((k) => k !== key);
    const spec = {
      ratio: pc.width ? ratioOf(pc.width, pc.height) : '1:1',
      minWidth: MIN_W(key),
      outputWidths: [960, 1600],
      outputFormats: KIND(key) === 'share' ? ['jpg'] : ['webp', 'jpg'],
      mobileCrop: mobile ? 'separate-file' : s.focus && s.focus !== 'center' ? 'focus' : 'same',
      focus: s.focus ?? 'center',
    };
    if (DISPLAY[key]) spec.displayRatio = DISPLAY[key];
    const slot = {
      slotId: `${page.pageId}-${String(counter[page.pageId]).padStart(2, '0')}`,
      key, pageId: page.pageId, position: POS.get(key) ?? `(새 칸) ${key}`,
      kind: KIND(key), accepts: IMAGE_ONLY(key) || UNUSED.has(key) ? 'image' : 'both', acceptsVerified: POS.has(key),
      spec, current: { pc, ...(mobile ? { mobile } : {}), ...(shared.length ? { sharedWith: shared } : {}) },
      alt: { key: s.alt ?? '', ko: get(ko, s.alt) ?? '' },
      source: SOURCE(key), dataSlot: key, inUse: !UNUSED.has(key),
    };
    if (key.startsWith('rings.list.')) slot.paths = ['/rings/all', '/search'];
    if (!POS.has(key)) slot.note = '새 칸 · 위치 이름을 slots.mjs POSITIONS에 더해 주세요';
    slots.push(slot);
  }
  const pages = PAGES.filter((p) => slots.some((s) => s.pageId === p.pageId)).map(({ prefixes, ...p }) => p);
  return { version: 1, source: { repoCommit: commit, branch, generatedAt: new Date().toISOString() }, pages, slots };
}

/** 두 칸 목록 비교(최신으로 뒤 바뀐 점 보고 · events.md register.rebuilt) */
export function diffSlots(before, after) {
  const b = new Map(before.slots.map((s) => [s.key, s]));
  const a = new Map(after.slots.map((s) => [s.key, s]));
  return {
    added: [...a.keys()].filter((k) => !b.has(k)),
    removed: [...b.keys()].filter((k) => !a.has(k)),
    moved: [...a.values()].filter((s) => b.has(s.key) && b.get(s.key).slotId !== s.slotId).map((s) => ({ key: s.key, fromSlotId: b.get(s.key).slotId, toSlotId: s.slotId })),
  };
}
