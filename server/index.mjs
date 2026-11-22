// eereum 이미지 교체 스튜디오 · 도우미 (contract/events.md v1.1)
// - http://localhost:4300 (127.0.0.1에만 열림 · 밖에서 못 들어옴)
// - 공개 사이트 · 저장소 main · 운영 DB는 바꾸지 않음. 바꾸는 것은 내 컴퓨터의 쇼핑몰 사본 그림 · 공유 폴더(_상태 · _시험 · 요청 · _로그)뿐
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { buildSlots, diffSlots } from './slots.mjs';
import { inspect, forSite, thumb, StudioError } from './images.mjs';
import { readState, ensureState, writeState, findConflicts, watchMine, freshState } from './state.mjs';
import { createVariantStore } from './variant-store.mjs';
import { subscribe, emit, clientCount, setStatusBase } from './events.mjs';
import { pendingRequests, moveToReplaced } from './requests.mjs';
import { extFor, safeExt, isLocalHost, hasDbFirewallRule } from './safety.mjs';
import { saveSheet, requireLightCheck, attachSheet } from './light.mjs';
import { startSite, stopSite, siteState, siteSwcStub, siteLog, updateSite, startData } from './site.mjs';
import { listVariants, createVariantRunner } from '../preview/variant.mjs';
import sharp from 'sharp';
import { CENTER, clampFocus, cropForMobile, hasMobileFile, mobileRatio } from '../preview/focus.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGISTER = path.join(HERE, '../register');
const PREVIEW = path.join(HERE, '../preview');
let register = null; // 지금 칸 목록
setStatusBase(() => ({ site: siteState(), repoCommit: register?.source.repoCommit }));
const safetyWarnings = []; // 대장 위 경고(R-1 방화벽 규칙 없음 등) · /api/status warnings
const thumbCache = new Map();

async function rebuild(reason = 'start') {
  const next = await buildSlots(config.site);
  const diff = register ? diffSlots(register, next) : { added: [], removed: [], moved: [] };
  register = next;
  for (const s of register.slots) ensureState(s);
  const orphanTrials = diff.removed.filter((k) => readState(k)?.trial);
  emit('register.rebuilt', { repoCommit: register.source.repoCommit, reason, ...diff, orphanTrials });
  return { ...diff, orphanTrials };
}

// ── 놓을 곳(PC2-스튜디오-7): 공개본 사본(4301 · 공유 _상태) / 수정안 사본(4302 · 그 PR 브랜치 · 이 컴퓨터 variant-state) ──
// 모든 명령은 ctx(놓을 곳)를 받음 → 칸 목록 · 사본 public 폴더 · 원래 파일 보관 · 상태 읽기/쓰기 · 시험 원본 위치가 그쪽 것
const VARIANT_DIR = path.join(config.root, 'variant'); // 수정안 사본(PC11 variant.mjs worktree)
const VARIANT_ORIGINALS = path.join(config.root, '_variant_originals'); // 수정안 사본에서 바꾸기 전 원래 파일
const vstore = createVariantStore(path.join(config.root, 'variant-state'), config.machine);
let variantInfo = null; // 켜는 중 · 켜진 수정안 { id, label, number, branch, sha, state }
let variantRegister = null; // 그 PR 코드(media.ts)로 만든 칸 목록
let place = 'public'; // 지금 놓을 곳(대장에서 고름 · 수정안이 켜지면 기본 = 수정안)

function publicCtx() {
  return {
    name: 'public', variant: null, label: '공개본', reg: register, publicDir: config.publicDir, originals: config.originals, cache: config.imageCache, trialPrefix: '',
    read: (k) => readState(k), init: (slot) => readState(slot.key) ?? ensureState(slot), save: (next, rev) => saveState(next, rev),
  };
}
function variantCtx() {
  if (!variantInfo || variantInfo.state !== 'ready' || !variantRegister) throw new StudioError('VARIANT_OFF', '수정안 사본이 켜져 있지 않아요. 미리보기 창 "공개본 | 수정안"에서 PR을 먼저 여세요.');
  const id = variantInfo.id;
  const web = path.join(VARIANT_DIR, 'apps/web');
  return {
    name: 'variant', variant: id, label: `수정안 ${variantInfo.label}`, info: variantInfo, reg: variantRegister, publicDir: path.join(web, 'public'), originals: VARIANT_ORIGINALS, cache: path.join(web, '.next/dev/cache/images'),
    trialPrefix: `_pr/${id.replace(/\//g, '_')}/`, // 공유 _시험\_pr\<수정안>\<칸 키>\ (공개본 시험과 따로)
    read: (k) => vstore.read(id, k), init: (slot) => vstore.read(id, slot.key) ?? freshState(slot), save: (next) => vstore.write(id, next),
  };
}
const ctxOf = (p) => ((p ?? place) === 'variant' ? variantCtx() : publicCtx());
const placeTag = (ctx) => (ctx.variant ? { place: 'variant', variant: ctx.variant } : { place: 'public' }); // 미리보기 창이 d.variant로 그 창에만 보냄
const placeInfo = () => ({ place, label: place === 'variant' && variantInfo ? `수정안 ${variantInfo.label}` : '공개본', variant: variantInfo ? { id: variantInfo.id, label: variantInfo.label, number: variantInfo.number ?? null, branch: variantInfo.branch ?? null, state: variantInfo.state } : null });
function setPlace(p) {
  if (p === 'variant') variantCtx(); // 켜져 있어야
  place = p === 'variant' ? 'variant' : 'public';
  emit('place.changed', placeInfo());
  return placeInfo();
}

const slotOf = (ctx, key) => {
  const s = ctx.reg?.slots.find((x) => x.key === key);
  if (!s) throw new StudioError('UNKNOWN_SLOT', `${ctx.label} 칸 목록에 없는 이름이에요: ${key}`);
  return s;
};
const pub = (ctx, url) => path.join(ctx.publicDir, url.split('?')[0]);
const backupPath = (ctx, url) => path.join(ctx.originals, url.split('?')[0]);
const clearCache = (ctx) => rmSync(ctx.cache, { recursive: true, force: true }); // V3 그림 캐시

/** 사본 파일을 바꾸기 전 원래 파일을 한 번만 보관 */
function backupOnce(ctx, url) {
  const b = backupPath(ctx, url);
  if (!existsSync(b) && existsSync(pub(ctx, url))) { mkdirSync(path.dirname(b), { recursive: true }); copyFileSync(pub(ctx, url), b); }
}

const stamp = () => {
  const d = new Date(Date.now() + 9 * 3600e3).toISOString(); // 한국 시각
  return `${d.slice(0, 10).replace(/-/g, '')}-${d.slice(11, 16).replace(':', '')}`;
};
const safeDesc = (s) => (s ?? '').replace(/\s+/g, '-').replace(/[^가-힣A-Za-z0-9-]/g, '').slice(0, 30) || '새그림';

/** 상태 쓰기 + V5-1 S2 대책: 몇 초 뒤 다른 컴퓨터가 덮었으면 대장에 알림(slot.overwritten · 약속 v1.4) */
function saveState(next, expectRevision) {
  const out = writeState(next, expectRevision);
  watchMine(out, (cur) => {
    const by = String(cur.updatedBy ?? '').replace(/^studio@/, '') || '다른 컴퓨터';
    emit('slot.overwritten', { key: out.key, slotId: cur.slotId ?? out.slotId, by, at: cur.updatedAt, revision: cur.revision, mine: { at: out.updatedAt, trial: out.trial?.file ?? null } });
  });
  return out;
}

// ── 명령 ──
/** 휴대폰 파일 = 휴대폰 비율로 점 둘레를 자른 뒤 줄임(PC11-스튜디오-3 · 기본 가운데) */
async function writeMobile(ctx, slot, original, focus, v) {
  const t = slot.current.mobile;
  const ratio = mobileRatio(slot);
  const src = ratio ? (await cropForMobile(sharp, original, ratio, focus)).data : original;
  const out = await forSite(src, { format: path.extname(t.url).slice(1).replace('jpeg', 'jpg'), width: Math.max(t.width ?? 0, slot.spec.minWidth) });
  backupOnce(ctx, t.url);
  writeFileSync(pub(ctx, t.url), out); // 사본에만
  return { url: `${t.url}?v=${v}`, bytes: out.length };
}

/** 놓은 그림 · 영상을 그쪽 사본 파일에 씀(상태는 안 건드림 · 놓기 · 다시 끼우기가 같이 씀) */
async function placeFiles(ctx, slot, body, info, target, focus, v) {
  const warnings = [];
  const urls = {};
  if (info.media === 'image') {
    const targets = target === 'mobile' && slot.current.mobile ? [slot.current.mobile] : target === 'pc' || !slot.current.mobile ? [slot.current.pc] : [slot.current.pc, slot.current.mobile];
    for (const t of targets) {
      if (t === slot.current.mobile) {
        const m = await writeMobile(ctx, slot, body, focus, v);
        urls.mobile = m.url;
        if (m.bytes > config.limits.warnImageBytes) warnings.push(`줄인 뒤에도 ${Math.round(m.bytes / 1024)}KB예요(600KB 넘음).`);
        continue;
      }
      const fmt = path.extname(t.url).slice(1).replace('jpeg', 'jpg');
      const width = Math.max(t.width ?? 0, slot.spec.minWidth);
      const out = await forSite(body, { format: fmt, width });
      backupOnce(ctx, t.url);
      writeFileSync(pub(ctx, t.url), out); // 사본에만
      urls.pc = `${t.url}?v=${v}`;
      if (out.length > config.limits.warnImageBytes) warnings.push(`줄인 뒤에도 ${Math.round(out.length / 1024)}KB예요(600KB 넘음).`);
    }
    if (info.width < slot.spec.minWidth) warnings.push(`그림이 작아요: 가로 ${info.width}px(권장 ${slot.spec.minWidth}px 이상).`);
    if (info.hasGps) warnings.push('위치(GPS) 정보가 있었어요 → 사본 그림에서는 지웠어요.');
    clearCache(ctx); // V3
  } else {
    // 영상: 사본 public/media/_studio/<키>.mp4로 둠(같은 주소에서 재생) · 사이트 칸 코드는 바꾸지 않음(미리보기 창이 그 자리에 영상을 끼움)
    const vurl = `/media/_studio/${slot.key}.mp4`;
    mkdirSync(path.dirname(pub(ctx, vurl)), { recursive: true });
    writeFileSync(pub(ctx, vurl), body);
    urls.video = `${vurl}?v=${v}`;
  }
  return { urls, warnings };
}

async function drop(ctx, { key, target = 'both', name = '', focus = CENTER }, body) {
  const slot = slotOf(ctx, key);
  const info = await inspect(body, name);
  if (info.media === 'video' && slot.accepts === 'image') throw new StudioError('NOT_ACCEPTED', '이 칸은 이미지만 받아요.');
  if (info.media === 'image' && slot.accepts === 'video') throw new StudioError('NOT_ACCEPTED', '이 칸은 영상만 받아요.');
  const state = ctx.init(slot);
  const v = Date.now();
  // 1) 놓은 원본을 공유 폴더 _시험\<키>\(수정안이면 _시험\_pr\<수정안>\<키>\)에 보관(확정 때 이 원본을 요청으로 보냄)
  const trialRel = `${ctx.trialPrefix}${key}`;
  const trialDir = path.join(config.dirs.trial, trialRel);
  mkdirSync(trialDir, { recursive: true });
  // R-b: 확장자 = 내용에서 알아낸 형식(놓은 이름의 확장자는 믿지 않음 · jpg를 x.html로 놓아도 .jpg) → 확정 요청도 같은 확장자
  const trialName = `${stamp()}_${safeDesc(path.parse(name).name)}${extFor(info.format) ?? (info.media === 'video' ? '.mp4' : '.jpg')}`;
  writeFileSync(path.join(trialDir, trialName), body);
  const { urls, warnings } = await placeFiles(ctx, slot, body, info, target, focus, v);
  const lane = info.media;
  const next = { ...state, [lane]: { state: 'trial', file: urls.pc ?? urls.video }, trial: { file: `${trialRel}/${trialName}`, media: lane, target, placedAt: new Date(v).toISOString(), machine: config.machine, ...(lane === 'image' ? { focus: clampFocus(focus) } : {}) } };
  const saved = ctx.save(next, state.revision);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: 'trial', url: urls.pc ?? urls.mobile ?? urls.video, urls, version: v, warnings, info: { width: info.width, height: info.height, bytes: info.bytes, format: info.format }, ...(lane === 'image' ? { focus: clampFocus(focus) } : {}), ...placeTag(ctx) });
  return { state: saved, urls, warnings, place: ctx.name };
}

/** 다시 끼우기(수정안을 다시 켰을 때): 남겨 둔 시험 원본을 사본 파일에만 다시 씀 · 상태(시험 · 요청함)는 그대로 */
async function reapply(ctx, slot, st) {
  const file = path.join(config.dirs.trial, st.trial.file);
  if (!existsSync(file)) return false;
  const body = readFileSync(file);
  const info = await inspect(body, path.basename(file));
  const v = Date.now();
  const focus = st.trial.focus ?? CENTER;
  const { urls } = await placeFiles(ctx, slot, body, info, st.trial.target ?? 'both', focus, v);
  emit('slot.updated', { key: slot.key, slotId: slot.slotId, lane: info.media, state: st[info.media]?.state ?? 'trial', url: urls.pc ?? urls.mobile ?? urls.video, urls, version: v, ...(info.media === 'image' ? { focus } : {}), ...placeTag(ctx) });
  return true;
}

/** 초점 고르기(PC11-스튜디오-3): 미리보기에서 누른 점 → 휴대폰 파일을 다시 자름(따로 있는 칸) · 점은 칸 상태(trial.focus)에 · reset = 가운데로 */
async function setFocus(ctx, { key, x, y, reset = false }) {
  const slot = slotOf(ctx, key);
  const state = ctx.read(key);
  if (!state?.trial || state.trial.media !== 'image') throw new StudioError('NO_TRIAL', '먼저 그림을 놓아 보세요(초점은 그림 칸만).');
  const focus = reset ? { ...CENTER } : clampFocus({ x, y });
  const v = Date.now();
  const urls = {};
  if (hasMobileFile(slot)) {
    urls.mobile = (await writeMobile(ctx, slot, readFileSync(path.join(config.dirs.trial, state.trial.file)), focus, v)).url;
    clearCache(ctx);
  }
  const saved = ctx.save({ ...state, trial: { ...state.trial, focus } }, state.revision);
  // 휴대폰 파일만 바꿈(urls.mobile) · 한 파일 칸은 focus로 화면 위치만(bridge object-position)
  emit('slot.updated', { key, slotId: slot.slotId, lane: 'image', state: 'trial', urls, focus, version: v, ...placeTag(ctx) });
  return { state: saved, focus, urls };
}

function revert(ctx, { key }) {
  const slot = slotOf(ctx, key);
  const state = ctx.init(slot);
  for (const t of [slot.current.pc, slot.current.mobile].filter(Boolean)) {
    if (existsSync(backupPath(ctx, t.url))) copyFileSync(backupPath(ctx, t.url), pub(ctx, t.url));
  }
  clearCache(ctx);
  const v = Date.now();
  const lane = state?.trial?.media ?? 'image';
  const next = { ...state, [lane]: { state: lane === 'image' ? 'live' : 'empty', ...(lane === 'image' ? { file: slot.current.pc.url } : {}) }, trial: null };
  const saved = ctx.save(next, state?.revision ?? null);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: lane === 'image' ? 'live' : 'empty', url: `${slot.current.pc.url}?v=${v}`, urls: { pc: `${slot.current.pc.url}?v=${v}`, ...(slot.current.mobile ? { mobile: `${slot.current.mobile.url}?v=${v}` } : {}) }, version: v, ...placeTag(ctx) });
  return { state: saved };
}

/** M4 최신으로(공개본만): 시험 그림을 잠깐 되돌림 → 사본 최신으로 → 사본 다시 켬 → 대장 다시 만듦 → 시험 그림 다시 끼움 */
async function update() {
  const pc = publicCtx();
  const trials = register.slots.map((s) => ({ s, st: readState(s.key) })).filter((x) => x.st?.trial && x.st.trial.machine === config.machine);
  for (const { s } of trials) {
    for (const t of [s.current.pc, s.current.mobile].filter(Boolean)) if (existsSync(backupPath(pc, t.url))) copyFileSync(backupPath(pc, t.url), pub(pc, t.url));
  }
  stopSite();
  let r;
  try { r = await updateSite(); } catch (e) { startSite(); throw new StudioError(e.code ?? 'UPDATE', e.message); }
  // 받은 새 그림이 원본 보관본이 되도록 보관본을 비움(다음 놓기 때 새로 보관)
  for (const { s } of trials) for (const t of [s.current.pc, s.current.mobile].filter(Boolean)) rmSync(backupPath(pc, t.url), { force: true });
  const diff = await rebuild('update');
  const reapplied = [];
  const lost = [];
  for (const { s, st } of trials) {
    if (!register.slots.some((x) => x.key === s.key)) { lost.push(s.key); continue; }
    const file = path.join(config.dirs.trial, st.trial.file);
    if (!existsSync(file)) { lost.push(s.key); continue; }
    await drop(publicCtx(), { key: s.key, target: st.trial.target ?? 'both', name: path.basename(file), focus: st.trial.focus ?? CENTER }, readFileSync(file)); // 고른 초점도 그대로
    reapplied.push(s.key);
  }
  startSite();
  return { ...r, ...diff, reapplied, lost };
}

/** M3 확정: 놓았던 원본 → 요청\<칸ID>_<YYYYMMDD-HHMM>_<설명>.<확장자> + 같은 이름 .json
 *  수정안에서 확정 = 이름에 _pr<번호> · .json에 targetPR(번호 · 브랜치) → M5가 그 PR 브랜치에 커밋(새 PR 아님 · PC2-스튜디오-7) */
function confirm(ctx, { key, license, ai = false, altKo = null, note = '', replace = false, lightOk = false }) {
  const slot = slotOf(ctx, key);
  const state = ctx.read(key);
  if (!state?.trial) throw new StudioError('NO_TRIAL', '먼저 그림을 놓아 보세요.');
  if (!license) throw new StudioError('LICENSE', '출처 · 라이선스를 골라 주세요.');
  if (/NC/i.test(license)) throw new StudioError('LICENSE', 'CC BY-NC(비영리) 그림은 쓸 수 없어요.');
  const pr = ctx.info ? { id: ctx.info.id, number: ctx.info.number ?? null, branch: ctx.info.branch ?? null, sha: ctx.info.sha ?? null } : null;
  if (pr && !pr.branch) throw new StudioError('NO_BRANCH', `${ctx.label}의 브랜치 이름을 알 수 없어 그 PR에 넣을 수 없어요(다른 저장소에서 온 PR 등). PC9에게 알려 주세요.`);
  // PC2-스튜디오-2: AI 예 → 0.5초 프레임 검사판을 보고 "빛 효과 없음"을 눌러야 확정(앞 요청을 옮기기 전에 확인)
  const light = requireLightCheck({ ai: Boolean(ai), lightOk, trialDir: config.dirs.trial, trialFile: state.trial.file });
  // 기능 ②: 같은 칸 · 같은 곳(공개본 / 같은 PR)에 확정 대기 요청이 있으면 경고 → 대장에서 "앞 요청 바꾸기"(replace) / "취소"
  const pending = pendingRequests(config.dirs.request, key).filter((p) => (p.targetPR?.id ?? null) === (pr?.id ?? null));
  if (pending.length && !replace) {
    throw new StudioError('ALREADY_REQUESTED', `이 칸은 이미 ${ctx.label}에 확정 대기 중입니다.`, { pending: pending.map((p) => ({ file: p.files[0] ?? p.json, requestedAt: p.requestedAt, machine: p.machine, note: p.note })) });
  }
  const replaced = pending.length ? moveToReplaced(config.dirs.request, config.dirs.previous, pending) : [];
  const src = path.join(config.dirs.trial, state.trial.file);
  const ext = safeExt(src, existsSync(src) ? readFileSync(src).subarray(0, 32) : null); // R-b
  if (!ext) throw new StudioError('FILE_TYPE', '시험 그림의 형식을 알 수 없어요. 다시 놓아 주세요.');
  const prTag = pr ? `_pr${pr.number ?? safeDesc(pr.branch).slice(0, 20)}` : '';
  const base = `${slot.slotId}_${stamp()}${prTag}_${safeDesc(note || slot.position.split(/[ ·(]/)[0])}`;
  mkdirSync(config.dirs.request, { recursive: true });
  copyFileSync(src, path.join(config.dirs.request, `${base}${ext}`));
  const meta = { version: 1, key, slotId: slot.slotId, media: state.trial.media, files: { [state.trial.media === 'video' ? 'video' : 'pc']: `${base}${ext}` }, license, ai: Boolean(ai), altKo: altKo || null, note, ...(state.trial.focus ? { focus: state.trial.focus } : {}), ...(pr ? { targetPR: pr } : {}), machine: config.machine, requestedAt: new Date().toISOString() };
  if (light) meta.lightCheck = attachSheet(config.dirs.request, base, light, config.machine);
  writeFileSync(path.join(config.dirs.request, `${base}.json`), JSON.stringify(meta, null, 2));
  const lane = state.trial.media;
  const saved = ctx.save({ ...state, [lane]: { ...state[lane], state: 'requested' }, request: { file: `${base}${ext}`, requestedAt: meta.requestedAt, license, ai: Boolean(ai), ...(altKo ? { altKo } : {}), ...(pr ? { targetPR: pr } : {}) } }, state.revision);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: 'requested', file: `${base}${ext}`, version: Date.now(), ...placeTag(ctx) });
  return { file: `${base}${ext}`, state: saved, replaced, place: ctx.name, ...(pr ? { targetPR: pr } : {}) };
}

/** 수정안 사본에서 바꾼 파일을 원래대로(다른 PR로 바꾸거나 끄기 전 · 다음 PR 사본에 섞이지 않게)
 *  시험 원본 · 상태(variant-state)는 남겨 둠 → 그 PR을 다시 켜면 다시 끼움 */
function restoreVariantFiles() {
  const pubDir = path.join(VARIANT_DIR, 'apps/web/public');
  if (existsSync(VARIANT_ORIGINALS)) {
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(VARIANT_ORIGINALS)) {
      const to = path.join(pubDir, path.relative(VARIANT_ORIGINALS, f));
      if (existsSync(path.dirname(to))) copyFileSync(f, to);
    }
    rmSync(VARIANT_ORIGINALS, { recursive: true, force: true });
  }
  rmSync(path.join(pubDir, 'media/_studio'), { recursive: true, force: true }); // 수정안에 놓은 영상(저장소에 없는 폴더)
  rmSync(path.join(VARIANT_DIR, 'apps/web/.next/dev/cache/images'), { recursive: true, force: true });
}

/** 수정안 사본 상태가 바뀔 때(variant.mjs onState) · 켜지면 그 PR 코드로 칸 목록 → 남겨 둔 시험 그림 다시 끼움 → 놓을 곳 = 수정안 */
let wantedVariant = null; // 켜 달라고 한 수정안(목록 줄)
async function onVariantState(st) {
  emit('variant.changed', { variant: st.variant ?? null, port: st.port ?? config.ports.variant, state: st.state, message: st.message }, 'helper');
  if (st.state === 'ready' && wantedVariant && st.variant === wantedVariant.id) {
    try {
      variantRegister = await buildSlots(VARIANT_DIR);
      variantInfo = { ...wantedVariant, state: 'ready' };
      const ctx = variantCtx();
      let n = 0;
      for (const [key, s] of Object.entries(vstore.all(ctx.variant))) {
        const slot = variantRegister.slots.find((x) => x.key === key);
        if (slot && s?.trial && (await reapply(ctx, slot, s).catch(() => false))) n++;
      }
      setPlace('variant');
      emit('register.rebuilt', { repoCommit: variantRegister.source.repoCommit, reason: 'variant', place: 'variant', reapplied: n, added: [], removed: [], moved: [] });
    } catch (e) {
      variantInfo = null; variantRegister = null;
      emit('helper.error', { code: 'VARIANT', message: `수정안 칸 목록을 못 만듦: ${e.message}` });
    }
  } else if (st.state === 'starting') {
    variantInfo = wantedVariant ? { ...wantedVariant, state: 'starting' } : null;
    variantRegister = null;
    if (place === 'variant') setPlace('public');
  } else if (st.state === 'failed' || st.state === 'stopped') {
    variantInfo = null; variantRegister = null;
    if (place === 'variant') setPlace('public');
  }
}

/** 시험 파일 그대로(대장이 검사판을 만들 때 · 같은 출처라 그림 · 영상 프레임을 읽을 수 있음) */
const TRIAL_TYPE = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.heic': 'image/heic', '.tif': 'image/tiff' };
function trialFile(ctx, key) {
  slotOf(ctx, key);
  const st = ctx.read(key);
  if (!st?.trial) throw new StudioError('NO_TRIAL', '먼저 그림을 놓아 보세요.');
  const f = path.join(config.dirs.trial, st.trial.file);
  if (!path.resolve(f).startsWith(path.resolve(config.dirs.trial)) || !existsSync(f)) throw new StudioError('NO_TRIAL', '시험 파일을 찾지 못했어요. 다시 놓아 주세요.');
  return { st, f };
}

// ── 데이터 화면(내장 DB) 켜기 · PC2-스튜디오-2 R-1b: 바로 가기는 DB 없이 열고 · 필요할 때 대장 단추로 ──
let dataState = 'off'; // off | starting | ready | failed
const FIREWALL_WARN = '내장 DB 관리 포트(51213)를 막는 방화벽 규칙이 없어요 → 같은 망의 다른 컴퓨터가 들어올 수 있어요. 데이터 화면이 필요 없으면 이 창을 닫고 DB 없이 여세요. 규칙을 다시 만들려면 PC2에게 알려 주세요(db-firewall.ps1 -Force · 관리자 허락 한 번). Windows 방화벽 허용 창이 뜨면 "허용 안 함".';
async function startDataScreen() {
  if (dataState === 'starting' || dataState === 'ready') return dataState;
  dataState = 'starting';
  emit('helper.status', { data: 'starting' });
  if (process.platform === 'win32') {
    // 규칙 확인은 관리자 없이(COM) · 처음 한 번만 관리자 허락 창(만든 뒤 표시 파일) — scripts/db-firewall.ps1
    const { execFile } = await import('node:child_process');
    await new Promise((r) => execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, '../scripts/db-firewall.ps1'), '-Quiet'], { timeout: 120000, windowsHide: true }, () => r()));
    const has = await hasDbFirewallRule();
    if (has === false && !safetyWarnings.includes(FIREWALL_WARN)) { safetyWarnings.push(FIREWALL_WARN); emit('helper.status', { warnings: safetyWarnings }); }
  }
  try { await startData(); dataState = 'ready'; emit('helper.status', { data: 'ready' }); }
  catch (e) { dataState = 'failed'; emit('helper.status', { data: 'failed', message: e.message }); }
  return dataState;
}

// ── HTTP ──
const send = (res, code, obj, type = 'application/json; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
};
const readBody = (req, limit) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > limit) { reject(new StudioError('FILE_TOO_BIG', '파일이 너무 커요.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const STATIC = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${config.ports.helper}`);
  // 같은 컴퓨터의 창만(다른 사이트가 이 도우미를 부르지 못하게)
  // R-c: Host가 이 컴퓨터(localhost · 127.0.0.1 · [::1])가 아니면 거절(DNS 바꿔치기로 다른 이름을 붙여 읽는 것 막음)
  if (!isLocalHost(req.headers.host)) return send(res, 403, { ok: false, error: { code: 'HOST', message: '이 컴퓨터(localhost) 주소로만 열 수 있어요.' } });
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/localhost:(4300|4301|4302)$/.test(origin)) return send(res, 403, { ok: false, error: { code: 'ORIGIN', message: '이 컴퓨터의 스튜디오 창에서만 쓸 수 있어요.' } });
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/register')) return send(res, 200, readFileSync(path.join(REGISTER, 'index.html')), STATIC['.html']);
    if (req.method === 'GET' && url.pathname.startsWith('/register/')) {
      const f = path.join(REGISTER, path.basename(url.pathname));
      if (!existsSync(f)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, readFileSync(f), STATIC[path.extname(f)] ?? 'application/octet-stream');
    }
    // 미리보기 창(M2 · PC11 · preview/public/) — index.html이 preview.js · preview.css를 상대 주소로 부름 → /preview.js · /preview.css
    if (req.method === 'GET' && ['/preview', '/preview/', '/preview.js', '/preview.css'].includes(url.pathname)) {
      const name = url.pathname.startsWith('/preview.') ? url.pathname.slice(1) : 'index.html';
      const f = path.join(PREVIEW, 'public', name);
      if (!existsSync(f)) return send(res, 404, 'not found', 'text/plain');
      return send(res, 200, readFileSync(f), STATIC[path.extname(f)] ?? 'application/octet-stream');
    }
    if (req.method === 'GET' && url.pathname === '/api/preview-config') return send(res, 200, { ok: true, siteOrigin: config.siteOrigin, variantOrigin: config.variantOrigin });
    if (req.method === 'GET' && url.pathname === '/api/variants') return send(res, 200, { ok: true, variants: await listVariants(config.site, { all: url.searchParams.get('all') === '1' }) });
    if (req.method === 'GET' && url.pathname === '/api/events') return subscribe(req, res);
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { ok: true, site: siteState(), swcStub: siteSwcStub(), data: dataState, siteOrigin: config.siteOrigin, repoCommit: register?.source.repoCommit, machine: config.machine, clients: clientCount(), conflicts: findConflicts(), warnings: safetyWarnings, ...placeInfo() });
    if (req.method === 'GET' && url.pathname === '/api/site-log') return send(res, 200, siteLog(), 'text/plain; charset=utf-8');
    // ?place=public|variant(없으면 지금 놓을 곳) — 아래 명령 모두 같음(PC2-스튜디오-7)
    const q = (k) => url.searchParams.get(k);
    if (req.method === 'GET' && url.pathname === '/api/slots') {
      const ctx = ctxOf(q('place') ?? undefined);
      return send(res, 200, { ok: true, ...ctx.reg, states: Object.fromEntries(ctx.reg.slots.map((s) => [s.key, ctx.variant ? ctx.init(s) : readState(s.key)])), siteOrigin: ctx.variant ? config.variantOrigin : config.siteOrigin, ...placeInfo(), place: ctx.name, placeLabel: ctx.label });
    }
    if (req.method === 'GET' && url.pathname === '/api/thumb') {
      const ctx = ctxOf(q('place') ?? undefined);
      const slot = slotOf(ctx, q('key'));
      const which = q('which') === 'mobile' && slot.current.mobile ? slot.current.mobile : slot.current.pc;
      const f = pub(ctx, which.url);
      const ck = `${f}|${existsSync(f) ? readFileSync(f).length : 0}|${q('v') ?? ''}`;
      if (!thumbCache.has(ck)) thumbCache.set(ck, await thumb(readFileSync(f)));
      return send(res, 200, thumbCache.get(ck), 'image/jpeg');
    }
    if (req.method === 'GET' && url.pathname === '/api/trial-file') {
      const { f } = trialFile(ctxOf(q('place') ?? undefined), q('key'));
      return send(res, 200, readFileSync(f), TRIAL_TYPE[path.extname(f).toLowerCase()] ?? 'application/octet-stream');
    }
    if (req.method === 'POST' && url.pathname === '/api/light-sheet') {
      const { st } = trialFile(ctxOf(q('place') ?? undefined), q('key'));
      const body = await readBody(req, 16 * 1024 * 1024);
      let info = {};
      try { info = JSON.parse(decodeURIComponent(req.headers['x-sheet-info'] ?? '{}')); } catch { /* 정보 없이도 저장 */ }
      return send(res, 200, { ok: true, ...saveSheet(config.dirs.trial, st.trial.file, body, info) });
    }
    if (req.method === 'POST' && url.pathname === '/api/drop') {
      const ctx = ctxOf(q('place') ?? undefined);
      const body = await readBody(req, config.limits.videoBytes);
      return send(res, 200, { ok: true, ...(await drop(ctx, { key: q('key'), target: q('target') ?? 'both', name: decodeURIComponent(req.headers['x-file-name'] ?? '') }, body)) });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const raw = await readBody(req, 1024 * 1024);
      const data = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      const cmd = url.pathname.slice(5);
      if (cmd === 'revert') return send(res, 200, { ok: true, ...revert(ctxOf(data.place), data) });
      if (cmd === 'confirm') return send(res, 200, { ok: true, ...confirm(ctxOf(data.place), data) });
      if (cmd === 'focus') return send(res, 200, { ok: true, ...(await setFocus(ctxOf(data.place), data)) });
      if (cmd === 'place') return send(res, 200, { ok: true, ...setPlace(data.place) });
      if (cmd === 'select') { const s = register.slots.find((x) => x.key === data.key) ?? slotOf(ctxOf(), data.key); emit('slot.selected', { key: s.key, slotId: s.slotId, paths: s.paths ?? register.pages.find((p) => p.pageId === s.pageId)?.paths ?? ['/'] }, data.from ?? 'register'); return send(res, 200, { ok: true }); }
      if (cmd === 'data-start') { if (process.env.STUDIO_NO_SITE === '1') throw new StudioError('NO_SITE', '사본 없이 켠 도우미예요(시험용).'); startDataScreen(); return send(res, 200, { ok: true, data: dataState }); }
      if (cmd === 'refresh') return send(res, 200, { ok: true, ...(await rebuild('refresh')) });
      if (cmd === 'update') return send(res, 200, { ok: true, ...(await update()) });
      if (cmd === 'locale') { emit('preview.locale', { locale: data.locale }, 'preview'); return send(res, 200, { ok: true }); }
      if (cmd === 'variant') {
        // 수정안 보기(M6 · PC11 variant.mjs): 고른 PR 브랜치 → worktree → next dev 4352 → 중계 4302 · null이면 끔
        // PC2-스튜디오-7: 끄거나 다른 PR로 바꾸기 전에 수정안 사본에 놓은 그림을 원래대로(시험 원본 · 상태는 남김 → 다시 켜면 다시 끼움)
        if (!data.variant) { wantedVariant = null; restoreVariantFiles(); await variants.stop(); return send(res, 200, { ok: true }); }
        const v = (await listVariants(config.site, { all: true })).find((x) => x.id === data.variant); // '모든 브랜치'에서 고른 것도 찾음
        if (!v) throw new StudioError('NO_VARIANT', '그 수정안(브랜치)을 찾지 못했어요.');
        wantedVariant = v;
        restoreVariantFiles();
        variants.start(v).catch(() => {}); // 진행은 variant.changed 신호로
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '없는 주소예요.' } });
  } catch (e) {
    const code = e instanceof StudioError ? e.code : 'INTERNAL';
    if (code === 'INTERNAL') console.error(e);
    emit('helper.error', { code, message: e.message }); // 'error'는 EventSource 연결 오류와 섞임(약속 v1.2)
    return send(res, code === 'INTERNAL' ? 500 : 400, { ok: false, error: { code, message: code === 'INTERNAL' ? '도우미 안에서 문제가 생겼어요.' : e.message, ...(e.detail ? { detail: e.detail } : {}) } });
  }
});

const variants = createVariantRunner({
  repoDir: config.site,
  worktreeDir: path.join(config.root, 'variant'),
  apiOrigin: `http://localhost:${config.ports.api}`,
  sitePort: config.ports.variantDev,
  proxyPort: config.ports.variant,
  parentOrigin: config.helperOrigin,
  onState: (st) => { onVariantState(st).catch((e) => console.error(e)); },
});
const stopAll = async () => { try { restoreVariantFiles(); } catch { /* */ } await variants.stop().catch(() => {}); stopSite(); process.exit(0); };
// 지난번에 꺼지지 않고 끝났으면(수정안 사본에 시험 그림이 남음) 시작할 때 원래대로
if (existsSync(VARIANT_DIR)) { try { restoreVariantFiles(); } catch (e) { console.error('수정안 사본 되돌리기 실패', e.message); } }
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

// V5 S2: 충돌 사본이 생기거나 없어지면 대장에 알림(30초마다 · helper.status → 대장이 /api/status 다시 읽음)
let lastConflicts = '';
setInterval(() => { const c = findConflicts().join('|'); if (c !== lastConflicts) { lastConflicts = c; emit('helper.status', { site: siteState(), conflicts: c ? c.split('|') : [] }); } }, 30000).unref();

await rebuild('start');
server.listen(config.ports.helper, '127.0.0.1', () => {
  console.log(`스튜디오 도우미: http://localhost:${config.ports.helper}/register  (칸 ${register.slots.length}개 · 사이트 ${register.source.repoCommit})`);
  if (process.env.STUDIO_NO_SITE !== '1') {
    // R-1: 내장 DB 관리 포트 51213은 prisma dev가 모든 주소로 엶 → 방화벽 규칙이 없으면 대장에 경고(startDataScreen)
    // 옛 바로 가기(-WithDb → STUDIO_DB=1)는 처음부터 켬 · 새 바로 가기는 대장 "데이터 화면 켜기" 단추로
    if (process.env.STUDIO_DB === '1') startDataScreen();
    startSite();
  }
});
