// eereum 이미지 교체 스튜디오 · 도우미 (contract/events.md v1.1)
// - http://localhost:4300 (127.0.0.1에만 열림 · 밖에서 못 들어옴)
// - 공개 사이트 · 저장소 main · 운영 DB는 바꾸지 않음. 바꾸는 것은 내 컴퓨터의 쇼핑몰 사본 그림 · 공유 폴더(_상태 · _시험 · 요청 · _로그)뿐
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.mjs';
import { buildSlots, diffSlots } from './slots.mjs';
import { inspect, forSite, thumb, StudioError } from './images.mjs';
import { readState, ensureState, writeState, findConflicts, watchMine } from './state.mjs';
import { subscribe, emit, clientCount, setStatusBase } from './events.mjs';
import { pendingRequests, moveToReplaced } from './requests.mjs';
import { extFor, safeExt, isLocalHost, hasDbFirewallRule } from './safety.mjs';
import { startSite, stopSite, siteState, clearImageCache, siteLog, updateSite, startData } from './site.mjs';
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

const slotOf = (key) => {
  const s = register?.slots.find((x) => x.key === key);
  if (!s) throw new StudioError('UNKNOWN_SLOT', `칸 목록에 없는 이름이에요: ${key}`);
  return s;
};
const pub = (url) => path.join(config.publicDir, url.split('?')[0]);
const backupPath = (url) => path.join(config.originals, url.split('?')[0]);

/** 사본 파일을 바꾸기 전 원래 파일을 한 번만 보관 */
function backupOnce(url) {
  const b = backupPath(url);
  if (!existsSync(b) && existsSync(pub(url))) { mkdirSync(path.dirname(b), { recursive: true }); copyFileSync(pub(url), b); }
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
async function writeMobile(slot, original, focus, v) {
  const t = slot.current.mobile;
  const ratio = mobileRatio(slot);
  const src = ratio ? (await cropForMobile(sharp, original, ratio, focus)).data : original;
  const out = await forSite(src, { format: path.extname(t.url).slice(1).replace('jpeg', 'jpg'), width: Math.max(t.width ?? 0, slot.spec.minWidth) });
  backupOnce(t.url);
  writeFileSync(pub(t.url), out); // 사본에만
  return { url: `${t.url}?v=${v}`, bytes: out.length };
}

async function drop({ key, target = 'both', name = '', focus = CENTER }, body) {
  const slot = slotOf(key);
  const info = await inspect(body, name);
  if (info.media === 'video' && slot.accepts === 'image') throw new StudioError('NOT_ACCEPTED', '이 칸은 이미지만 받아요.');
  if (info.media === 'image' && slot.accepts === 'video') throw new StudioError('NOT_ACCEPTED', '이 칸은 영상만 받아요.');
  const state = readState(key) ?? ensureState(slot);
  const v = Date.now();
  // 1) 놓은 원본을 공유 폴더 _시험\<키>\에 보관(확정 때 이 원본을 요청으로 보냄)
  const trialDir = path.join(config.dirs.trial, key);
  mkdirSync(trialDir, { recursive: true });
  // R-b: 확장자 = 내용에서 알아낸 형식(놓은 이름의 확장자는 믿지 않음 · jpg를 x.html로 놓아도 .jpg) → 확정 요청도 같은 확장자
  const trialName = `${stamp()}_${safeDesc(path.parse(name).name)}${extFor(info.format) ?? (info.media === 'video' ? '.mp4' : '.jpg')}`;
  writeFileSync(path.join(trialDir, trialName), body);
  const warnings = [];
  const urls = {};
  if (info.media === 'image') {
    const targets = target === 'mobile' && slot.current.mobile ? [slot.current.mobile] : target === 'pc' || !slot.current.mobile ? [slot.current.pc] : [slot.current.pc, slot.current.mobile];
    for (const t of targets) {
      if (t === slot.current.mobile) {
        const m = await writeMobile(slot, body, focus, v);
        urls.mobile = m.url;
        if (m.bytes > config.limits.warnImageBytes) warnings.push(`줄인 뒤에도 ${Math.round(m.bytes / 1024)}KB예요(600KB 넘음).`);
        continue;
      }
      const fmt = path.extname(t.url).slice(1).replace('jpeg', 'jpg');
      const width = Math.max(t.width ?? 0, slot.spec.minWidth);
      const out = await forSite(body, { format: fmt, width });
      backupOnce(t.url);
      writeFileSync(pub(t.url), out); // 사본에만
      urls[t === slot.current.mobile ? 'mobile' : 'pc'] = `${t.url}?v=${v}`;
      if (out.length > config.limits.warnImageBytes) warnings.push(`줄인 뒤에도 ${Math.round(out.length / 1024)}KB예요(600KB 넘음).`);
    }
    if (info.width < slot.spec.minWidth) warnings.push(`그림이 작아요: 가로 ${info.width}px(권장 ${slot.spec.minWidth}px 이상).`);
    if (info.hasGps) warnings.push('위치(GPS) 정보가 있었어요 → 사본 그림에서는 지웠어요.');
    clearImageCache(); // V3
  } else {
    // 영상: 사본 public/media/_studio/<키>.mp4로 둠(같은 주소에서 재생) · 사이트 칸 코드는 바꾸지 않음(미리보기 창이 그 자리에 영상을 끼움)
    const vurl = `/media/_studio/${key}.mp4`;
    mkdirSync(path.dirname(pub(vurl)), { recursive: true });
    writeFileSync(pub(vurl), body);
    urls.video = `${vurl}?v=${v}`;
  }
  const lane = info.media;
  const next = { ...state, [lane]: { state: 'trial', file: urls.pc ?? urls.video }, trial: { file: `${key}/${trialName}`, media: lane, placedAt: new Date(v).toISOString(), machine: config.machine, ...(lane === 'image' ? { focus: clampFocus(focus) } : {}) } };
  const saved = saveState(next, state.revision);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: 'trial', url: urls.pc ?? urls.mobile ?? urls.video, urls, version: v, warnings, info: { width: info.width, height: info.height, bytes: info.bytes, format: info.format }, ...(lane === 'image' ? { focus: clampFocus(focus) } : {}) });
  return { state: saved, urls, warnings };
}

/** 초점 고르기(PC11-스튜디오-3): 미리보기에서 누른 점 → 휴대폰 파일을 다시 자름(따로 있는 칸) · 점은 칸 상태(trial.focus)에 · reset = 가운데로 */
async function setFocus({ key, x, y, reset = false }) {
  const slot = slotOf(key);
  const state = readState(key);
  if (!state?.trial || state.trial.media !== 'image') throw new StudioError('NO_TRIAL', '먼저 그림을 놓아 보세요(초점은 그림 칸만).');
  const focus = reset ? { ...CENTER } : clampFocus({ x, y });
  const v = Date.now();
  const urls = {};
  if (hasMobileFile(slot)) {
    urls.mobile = (await writeMobile(slot, readFileSync(path.join(config.dirs.trial, state.trial.file)), focus, v)).url;
    clearImageCache();
  }
  const saved = saveState({ ...state, trial: { ...state.trial, focus } }, state.revision);
  // 휴대폰 파일만 바꿈(urls.mobile) · 한 파일 칸은 focus로 화면 위치만(bridge object-position)
  emit('slot.updated', { key, slotId: slot.slotId, lane: 'image', state: 'trial', urls, focus, version: v });
  return { state: saved, focus, urls };
}

function revert({ key }) {
  const slot = slotOf(key);
  const state = readState(key);
  for (const t of [slot.current.pc, slot.current.mobile].filter(Boolean)) {
    if (existsSync(backupPath(t.url))) copyFileSync(backupPath(t.url), pub(t.url));
  }
  clearImageCache();
  const v = Date.now();
  const lane = state?.trial?.media ?? 'image';
  const next = { ...state, [lane]: { state: lane === 'image' ? 'live' : 'empty', ...(lane === 'image' ? { file: slot.current.pc.url } : {}) }, trial: null };
  const saved = saveState(next, state?.revision ?? null);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: lane === 'image' ? 'live' : 'empty', url: `${slot.current.pc.url}?v=${v}`, urls: { pc: `${slot.current.pc.url}?v=${v}`, ...(slot.current.mobile ? { mobile: `${slot.current.mobile.url}?v=${v}` } : {}) }, version: v });
  return { state: saved };
}

/** M4 최신으로: 시험 그림을 잠깐 되돌림 → 사본 최신으로 → 사본 다시 켬 → 대장 다시 만듦 → 시험 그림 다시 끼움 */
async function update() {
  const trials = register.slots.map((s) => ({ s, st: readState(s.key) })).filter((x) => x.st?.trial && x.st.trial.machine === config.machine);
  for (const { s } of trials) {
    for (const t of [s.current.pc, s.current.mobile].filter(Boolean)) if (existsSync(backupPath(t.url))) copyFileSync(backupPath(t.url), pub(t.url));
  }
  stopSite();
  let r;
  try { r = await updateSite(); } catch (e) { startSite(); throw new StudioError(e.code ?? 'UPDATE', e.message); }
  // 받은 새 그림이 원본 보관본이 되도록 보관본을 비움(다음 놓기 때 새로 보관)
  for (const { s } of trials) for (const t of [s.current.pc, s.current.mobile].filter(Boolean)) rmSync(backupPath(t.url), { force: true });
  const diff = await rebuild('update');
  const reapplied = [];
  const lost = [];
  for (const { s, st } of trials) {
    if (!register.slots.some((x) => x.key === s.key)) { lost.push(s.key); continue; }
    const file = path.join(config.dirs.trial, st.trial.file);
    if (!existsSync(file)) { lost.push(s.key); continue; }
    await drop({ key: s.key, target: 'both', name: path.basename(file), focus: st.trial.focus ?? CENTER }, readFileSync(file)); // 고른 초점도 그대로
    reapplied.push(s.key);
  }
  startSite();
  return { ...r, ...diff, reapplied, lost };
}

/** M3 확정: 놓았던 원본 → 요청\<칸ID>_<YYYYMMDD-HHMM>_<설명>.<확장자> + 같은 이름 .json */
function confirm({ key, license, ai = false, altKo = null, note = '', replace = false }) {
  const slot = slotOf(key);
  const state = readState(key);
  if (!state?.trial) throw new StudioError('NO_TRIAL', '먼저 그림을 놓아 보세요.');
  if (!license) throw new StudioError('LICENSE', '출처 · 라이선스를 골라 주세요.');
  if (/NC/i.test(license)) throw new StudioError('LICENSE', 'CC BY-NC(비영리) 그림은 쓸 수 없어요.');
  // 기능 ②: 같은 칸에 확정 대기 요청이 있으면 경고 → 대장에서 "앞 요청 바꾸기"(replace) / "취소"
  const pending = pendingRequests(config.dirs.request, key);
  if (pending.length && !replace) {
    throw new StudioError('ALREADY_REQUESTED', '이 칸은 이미 확정 대기 중입니다.', { pending: pending.map((p) => ({ file: p.files[0] ?? p.json, requestedAt: p.requestedAt, machine: p.machine, note: p.note })) });
  }
  const replaced = pending.length ? moveToReplaced(config.dirs.request, config.dirs.previous, pending) : [];
  const src = path.join(config.dirs.trial, state.trial.file);
  const ext = safeExt(src, existsSync(src) ? readFileSync(src).subarray(0, 32) : null); // R-b
  if (!ext) throw new StudioError('FILE_TYPE', '시험 그림의 형식을 알 수 없어요. 다시 놓아 주세요.');
  const base = `${slot.slotId}_${stamp()}_${safeDesc(note || slot.position.split(/[ ·(]/)[0])}`;
  mkdirSync(config.dirs.request, { recursive: true });
  copyFileSync(src, path.join(config.dirs.request, `${base}${ext}`));
  const meta = { version: 1, key, slotId: slot.slotId, media: state.trial.media, files: { [state.trial.media === 'video' ? 'video' : 'pc']: `${base}${ext}` }, license, ai: Boolean(ai), altKo: altKo || null, note, ...(state.trial.focus ? { focus: state.trial.focus } : {}), machine: config.machine, requestedAt: new Date().toISOString() };
  writeFileSync(path.join(config.dirs.request, `${base}.json`), JSON.stringify(meta, null, 2));
  const lane = state.trial.media;
  const saved = saveState({ ...state, [lane]: { ...state[lane], state: 'requested' }, request: { file: `${base}${ext}`, requestedAt: meta.requestedAt, license, ai: Boolean(ai), ...(altKo ? { altKo } : {}) } }, state.revision);
  emit('slot.updated', { key, slotId: slot.slotId, lane, state: 'requested', file: `${base}${ext}`, version: Date.now() });
  return { file: `${base}${ext}`, state: saved, replaced };
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
    if (req.method === 'GET' && url.pathname === '/api/status') return send(res, 200, { ok: true, site: siteState(), siteOrigin: config.siteOrigin, repoCommit: register?.source.repoCommit, machine: config.machine, clients: clientCount(), conflicts: findConflicts(), warnings: safetyWarnings });
    if (req.method === 'GET' && url.pathname === '/api/site-log') return send(res, 200, siteLog(), 'text/plain; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/slots') {
      return send(res, 200, { ok: true, ...register, states: Object.fromEntries(register.slots.map((s) => [s.key, readState(s.key)])), siteOrigin: config.siteOrigin });
    }
    if (req.method === 'GET' && url.pathname === '/api/thumb') {
      const slot = slotOf(url.searchParams.get('key'));
      const which = url.searchParams.get('which') === 'mobile' && slot.current.mobile ? slot.current.mobile : slot.current.pc;
      const f = pub(which.url);
      const ck = `${f}|${existsSync(f) ? readFileSync(f).length : 0}|${url.searchParams.get('v') ?? ''}`;
      if (!thumbCache.has(ck)) thumbCache.set(ck, await thumb(readFileSync(f)));
      return send(res, 200, thumbCache.get(ck), 'image/jpeg');
    }
    if (req.method === 'POST' && url.pathname === '/api/drop') {
      const body = await readBody(req, config.limits.videoBytes);
      return send(res, 200, { ok: true, ...(await drop({ key: url.searchParams.get('key'), target: url.searchParams.get('target') ?? 'both', name: decodeURIComponent(req.headers['x-file-name'] ?? '') }, body)) });
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const raw = await readBody(req, 1024 * 1024);
      const data = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      const cmd = url.pathname.slice(5);
      if (cmd === 'revert') return send(res, 200, { ok: true, ...revert(data) });
      if (cmd === 'confirm') return send(res, 200, { ok: true, ...confirm(data) });
      if (cmd === 'focus') return send(res, 200, { ok: true, ...(await setFocus(data)) });
      if (cmd === 'select') { const s = slotOf(data.key); emit('slot.selected', { key: s.key, slotId: s.slotId, paths: s.paths ?? register.pages.find((p) => p.pageId === s.pageId)?.paths ?? ['/'] }, data.from ?? 'register'); return send(res, 200, { ok: true }); }
      if (cmd === 'refresh') return send(res, 200, { ok: true, ...(await rebuild('refresh')) });
      if (cmd === 'update') return send(res, 200, { ok: true, ...(await update()) });
      if (cmd === 'locale') { emit('preview.locale', { locale: data.locale }, 'preview'); return send(res, 200, { ok: true }); }
      if (cmd === 'variant') {
        // 수정안 보기(M6 · PC11 variant.mjs): 고른 PR 브랜치 → worktree → next dev 4352 → 중계 4302 · null이면 끔
        if (!data.variant) { await variants.stop(); return send(res, 200, { ok: true }); }
        const v = (await listVariants(config.site, { all: true })).find((x) => x.id === data.variant); // '모든 브랜치'에서 고른 것도 찾음
        if (!v) throw new StudioError('NO_VARIANT', '그 수정안(브랜치)을 찾지 못했어요.');
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
  onState: (st) => emit('variant.changed', { variant: st.variant ?? null, port: st.port ?? config.ports.variant, state: st.state, message: st.message }, 'helper'),
});
const stopAll = async () => { await variants.stop().catch(() => {}); stopSite(); process.exit(0); };
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);

// V5 S2: 충돌 사본이 생기거나 없어지면 대장에 알림(30초마다 · helper.status → 대장이 /api/status 다시 읽음)
let lastConflicts = '';
setInterval(() => { const c = findConflicts().join('|'); if (c !== lastConflicts) { lastConflicts = c; emit('helper.status', { site: siteState(), conflicts: c ? c.split('|') : [] }); } }, 30000).unref();

await rebuild('start');
server.listen(config.ports.helper, '127.0.0.1', () => {
  console.log(`스튜디오 도우미: http://localhost:${config.ports.helper}/register  (칸 ${register.slots.length}개 · 사이트 ${register.source.repoCommit})`);
  if (process.env.STUDIO_NO_SITE !== '1') {
    if (process.env.STUDIO_DB === '1') {
      // R-1: 내장 DB 관리 포트 51213은 prisma dev가 모든 주소로 엶 → 설치 때 만든 방화벽 규칙이 없으면 대장에 경고
      hasDbFirewallRule().then((has) => {
        if (has === false) { safetyWarnings.push('내장 DB 관리 포트(51213)를 막는 방화벽 규칙이 없어요 → 같은 망의 다른 컴퓨터가 들어올 수 있어요. 설치를 -WithDb로 다시 하거나(관리자 허락 한 번) 데이터 화면이 필요 없으면 DB 없이 여세요. Windows 방화벽 허용 창이 뜨면 "허용 안 함".'); emit('helper.status', { warnings: safetyWarnings }); }
      });
    }
    if (process.env.STUDIO_DB === '1') startData().then(() => emit('helper.status', { data: 'ready' })).catch((e) => emit('helper.status', { data: 'failed', message: e.message }));
    startSite();
  }
});
