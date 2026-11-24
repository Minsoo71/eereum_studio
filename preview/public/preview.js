// 미리보기 창 (M2 + M6 화면 · PC11). 도우미(127.0.0.1:4300 → 주소는 localhost)와 약속 v1(events.md)으로 대화.
// 창 안 쇼핑몰 사본은 다른 포트라서 직접 만지지 않고, 사본 화면에 끼운 bridge.js와 postMessage로만 대화한다.
const LOCALES = ['ko', 'en', 'ja', 'zh-hans', 'zh-hant'];
const DEVICES = { phone: { w: 390, h: 844, label: '휴대폰 390×844' }, pc: { w: 1440, h: 900, label: 'PC 1440' } };

const st = {
  view: 'phone',
  locale: 'ko',
  pageId: null,
  compare: false,
  variant: null, // { id, port, state }
  config: { siteOrigin: 'http://localhost:4301', variantOrigin: 'http://localhost:4302' },
  pages: [],
  slots: [], // 약속 slots
  present: new Map(), // iframe → Set(key) (bridge가 알려 준 지금 화면의 칸)
  hidden: new Map(), // iframe → Set(key) (칸은 있지만 그 폭에서 숨음 · PC8 B-1)
  autoSwitched: null, // 숨는 칸 때문에 기기 보기를 바꾼 칸(한 번만 바꿈)
  selected: null,
  pendingSelect: null, // 페이지를 옮긴 뒤 고를 칸
  frames: [], // { el, role: 'public'|'variant', device }
  trials: new Map(), // 칸 키 → { pc: 사본 PC 그림 주소, focus: {x,y} } (놓은 그림이 있는 칸 · 초점 고르기) — 공개본
  vtrials: new Map(), // 같은 모양 — 수정안(PC2-스튜디오-7)
  place: 'public', // 대장에서 그림을 놓는 곳(도우미가 알려 줌 · place.changed)
  placeLabel: '공개본',
  // PC2-스튜디오-9: 놓은 영상(칸 키 → slot.updated 신호) — 영상은 사본 파일이 아니라 화면에 끼우는 것이라
  // 창을 다시 그리면(비교 켜기 · 페이지 · 언어) 사라짐 → 창이 준비될 때마다(studio:ready) 다시 보냄
  videos: { public: new Map(), variant: new Map() },
  applied: new Map(), // `${key}|${version}` → { role, frames, count, shown } (끼울 곳 못 찾음 · 그 폭에서 안 보임 알림)
};
const trialsOf = (place) => (place === 'variant' ? st.vtrials : st.trials);

const $ = (s) => document.querySelector(s);
const api = (p, body) =>
  fetch(`/api/${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then(
    async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error?.message || r.statusText), { code: j.error?.code });
      return j;
    },
  );

function status(text, kind = 'ok') {
  $('#status').textContent = text;
  $('#dot').className = `dot ${kind}`;
}
let toastTimer;
function toast(text, bad = false) {
  const t = $('#toast');
  t.textContent = text;
  t.className = `toast${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.textContent = ''), 4000);
}

const localePrefix = (l) => (l === 'ko' ? '' : `/${l}`);
const page = () => st.pages.find((p) => p.pageId === st.pageId) || st.pages[0];
const pagePath = () => page()?.paths?.[0] || '/';
const slotByKey = (k) => st.slots.find((s) => s.key === k);
const originOf = (role) => (role === 'variant' ? st.config.variantOrigin : st.config.siteOrigin);
const frameUrl = (role, path = pagePath()) => `${originOf(role)}${localePrefix(st.locale)}${path === '/' && st.locale !== 'ko' ? '' : path}`;

/* ---------- 그리기 ---------- */
function scaleFor(device) {
  const cols = st.compare ? 2 : 1;
  const both = st.view === 'both';
  const avail = Math.max(320, (window.innerWidth - 48 - (cols - 1) * 24) / cols - (both ? 16 : 0));
  const { w } = DEVICES[device];
  if (!both) return Math.min(device === 'phone' ? 0.9 : 0.62, avail / (w + 20));
  const total = DEVICES.phone.w + DEVICES.pc.w + 40;
  return Math.min(0.5, avail / total);
}

function renderStage() {
  st.frames = [];
  st.present.clear();
  st.hidden.clear();
  const stage = $('#stage');
  stage.textContent = '';
  const roles = st.compare ? ['public', 'variant'] : ['public'];
  for (const role of roles) {
    const col = document.createElement('section');
    col.className = 'col';
    const title = document.createElement('div');
    title.className = 'col-title';
    const tag = document.createElement('span');
    tag.className = `tag${role === 'variant' ? ' rev' : ''}`;
    tag.textContent = role === 'variant' ? `${st.variant?.id ?? '고르기 전'} · ${st.config.variantOrigin.split(':').pop()}` : `main · ${st.config.siteOrigin.split(':').pop()}`;
    title.append(role === 'variant' ? '수정안 ' : '공개본 ', tag);
    col.append(title);
    const devs = document.createElement('div');
    devs.className = 'devices';
    const devices = st.view === 'both' ? ['phone', 'pc'] : [st.view];
    for (const device of devices) devs.append(makeScreen(role, device));
    col.append(devs);
    stage.append(col);
  }
}

function makeScreen(role, device) {
  const { w, h, label } = DEVICES[device];
  const s = scaleFor(device);
  const wrap = document.createElement('div');
  wrap.className = 'dev';
  const screen = document.createElement('div');
  screen.className = `screen ${device}`;
  screen.style.width = `${Math.round(w * s)}px`;
  screen.style.height = `${Math.round(h * s)}px`;
  if (role === 'variant' && st.variant?.state !== 'ready') {
    const wait = document.createElement('div');
    wait.className = 'wait';
    wait.textContent = !st.variant
      ? '위에서 수정안(PR · 브랜치)을 고르세요'
      : st.variant.state === 'failed'
        ? `수정안 사본을 켜지 못함 — ${st.variant.message ?? ''}`
        : `수정안 사본 준비 중… ${st.variant.message ?? '(처음엔 약 30초)'}`;
    screen.append(wait);
  } else {
    const f = document.createElement('iframe');
    f.width = String(w);
    f.height = String(h);
    f.style.transform = `scale(${s})`;
    f.title = `${role === 'variant' ? '수정안' : '공개본'} · ${label}`;
    f.src = frameUrl(role);
    screen.append(f);
    st.frames.push({ el: f, role, device });
  }
  const cap = document.createElement('small');
  cap.textContent = label;
  wrap.append(screen, cap);
  return wrap;
}

function renderChips() {
  const box = $('#slots');
  box.textContent = '';
  const present = new Set([...st.present.values()].flatMap((s) => [...s]));
  // 지금 보이는 모든 창에서 숨는 칸 = "이 폭에서는 숨음"
  const frames = [...st.present.keys()];
  const hiddenEverywhere = (k) => frames.length > 0 && frames.every((f) => !st.present.get(f).has(k) || st.hidden.get(f)?.has(k));
  const p = page();
  const keys = st.slots.filter((s) => s.pageId === p?.pageId || present.has(s.key)).map((s) => s.key);
  for (const k of new Set([...keys, ...present])) {
    const s = slotByKey(k);
    const b = document.createElement('button');
    const hiddenHere = present.has(k) && hiddenEverywhere(k);
    b.className = `chip${present.has(k) ? '' : ' absent'}${hiddenHere ? ' hidden-here' : ''}`;
    b.setAttribute('aria-pressed', String(st.selected === k));
    b.textContent = k;
    b.title = !present.has(k)
      ? `이 화면에 아직 칸 표시가 없음(data-slot) · ${s?.position ?? ''}`
      : hiddenHere
        ? `이 화면 폭에서는 숨는 칸(다른 기기 보기에서 보임) · ${s?.position ?? ''}`
        : (s?.position ?? '');
    if (s && s.kind !== 'normal') {
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = s.kind === 'background' ? '배경' : '공유';
      b.append(kind);
    }
    if (s && s.accepts !== 'image') {
      const v = document.createElement('span');
      v.className = 'kind';
      v.textContent = s.accepts === 'video' ? '영상' : '이미지·영상';
      b.append(v);
    }
    b.onclick = () => api('select', { key: k }).catch(() => selectSlot(k));
    box.append(b);
  }
}

function renderPages() {
  const sel = $('#page');
  sel.textContent = '';
  for (const p of st.pages) {
    const o = document.createElement('option');
    o.value = p.pageId;
    o.textContent = `${p.name} ${p.paths[0]}`;
    sel.append(o);
  }
  sel.value = st.pageId ?? st.pages[0]?.pageId ?? '';
}

/* ---------- 놓은 영상 다시 끼우기 · 알림 (PC2-스튜디오-9) ---------- */
const TARGET_NAME = { mobile: '휴대폰', pc: 'PC' };

/** 영상 신호 기억(시험 · 요청함) · 되돌림이나 그림을 놓으면 지움 */
function rememberVideo(role, d) {
  if (!d.key) return;
  const map = st.videos[role];
  if (d.lane === 'video' && d.urls?.video && (d.state === 'trial' || d.state === 'requested' || !d.state)) map.set(d.key, d);
  else if (d.lane === 'video' && d.state === 'requested' && map.has(d.key)) map.set(d.key, { ...map.get(d.key), state: 'requested' });
  else if (d.lane === 'video' || (d.lane === 'image' && d.state === 'trial')) map.delete(d.key);
}

/** 처음 열 때: 상태 파일의 영상 시험(trial · requested)을 기억 → 창이 준비되면 끼움 */
function seedVideos(role, slots, states) {
  for (const slot of slots ?? []) {
    const s = states?.[slot.key];
    const file = s?.video?.file;
    if (!file || !['trial', 'requested'].includes(s.video.state) || s.trial?.media !== 'video') continue;
    st.videos[role].set(slot.key, { key: slot.key, lane: 'video', state: s.video.state, urls: { video: file }, version: Date.parse(s.trial.placedAt) || 1, target: s.trial.target ?? 'both' });
  }
}

/** 창이 (다시) 준비됨 → 그 창 쪽(공개본 · 수정안)에 놓아 둔 영상을 다시 보냄(같은 version이면 bridge가 무시) */
function replayVideos(frame, slots) {
  const keys = new Set((slots ?? []).map((s) => s.key));
  for (const d of st.videos[frame.role].values()) if (keys.has(d.key)) postTo(frame, { type: 'studio:update', ...d, quiet: true });
}

/** 같은 신호에 대한 창들의 결과를 모아 한 번만 알림: 끼울 곳 0 = 빨간 알림 · 영상이 그 폭에서 안 보임 = 안내 */
function noteApplied(frame, m) {
  if (m.quiet) return;
  const id = `${m.key}|${m.version}`;
  const a = st.applied.get(id) ?? { role: frame.role, frames: 0, count: 0, shown: 0, lane: m.lane, target: m.target };
  a.frames++;
  a.count += m.count || 0;
  a.shown += m.shown || 0;
  st.applied.set(id, a);
  clearTimeout(a.timer);
  a.timer = setTimeout(() => {
    st.applied.delete(id);
    if (a.count === 0) toast(`“${m.key}” — 이 화면에서 ${a.lane === 'video' ? '영상' : '그림'}을 끼울 곳을 못 찾았어요(서버에는 들어감 · 다른 페이지나 기기 보기에서 확인하거나 PC2에게 알려 주세요)`, true);
    else if (a.lane === 'video' && a.shown === 0 && a.target && a.target !== 'both') toast(`“${m.key}” 영상은 ${TARGET_NAME[a.target]} 화면에만 보여요 · 위 보기에서 "${TARGET_NAME[a.target]}"을 골라 확인하세요`);
  }, 700);
}

/** 수정안에 놓았는데 수정안 창이 없음(공개본만 보기) → 수정안이 켜져 있으면 비교 보기로 열고, 아니면 알림 */
function ensureFrameFor(role, d) {
  if (st.frames.some((f) => f.role === role)) return;
  const what = d.lane === 'video' ? '영상' : '그림';
  const label = st.variant?.id ? `수정안 ${st.variant.id.replace(/^pr-/, '#')}` : '수정안';
  if (role === 'variant' && st.variant?.state === 'ready') {
    $('#compare [data-c="on"]')?.click(); // 비교 켜기 → 창이 준비되면 replayVideos가 다시 끼움(그림은 사본 파일이라 바로 보임)
    toast(`${label}에 놓은 ${what}이라 "공개본 | 수정안" 보기로 열었어요 · 오른쪽 수정안 창에서 보세요`);
  } else if (role === 'variant') {
    toast(`${label}에 ${what}을 놓았지만 수정안 창이 꺼져 있어요 · 위 "공개본 | 수정안"을 누르고 수정안을 골라 주세요`, true);
  }
}

/* ---------- 창 안 대화 (bridge.js) ---------- */
function postTo(frame, msg) {
  frame.el.contentWindow?.postMessage(msg, originOf(frame.role));
}
function broadcast(msg) {
  for (const f of st.frames) postTo(f, msg);
}

window.addEventListener('message', (e) => {
  const frame = st.frames.find((f) => f.el.contentWindow === e.source);
  if (!frame || e.origin !== originOf(frame.role) || !e.data?.type) return;
  const m = e.data;
  if (m.type === 'studio:ready') {
    st.present.set(frame.el, new Set(m.slots.map((s) => s.key)));
    st.hidden.set(frame.el, new Set(m.slots.filter((s) => s.visible === 0).map((s) => s.key)));
    renderChips();
    replayVideos(frame, m.slots);
    if (st.pendingSelect) {
      const k = st.pendingSelect;
      if (st.present.get(frame.el).has(k)) {
        st.pendingSelect = null;
        broadcast({ type: 'studio:select', key: k });
      }
    }
  } else if (m.type === 'studio:hidden') {
    onHidden(m.key, frame);
  } else if (m.type === 'studio:missing') {
    toast(`“${m.key}” — 이 화면에 없는 칸`, true);
  } else if (m.type === 'studio:applied') {
    status(`“${m.key}” 새 ${m.lane === 'video' ? '영상' : '그림'} 반영 · ${m.count}곳`);
    noteApplied(frame, m);
  } else if (m.type === 'studio:scroll' && st.compare) {
    for (const f of st.frames) if (f.el !== frame.el && f.device === frame.device) postTo(f, { type: 'studio:scrollTo', ratio: m.ratio });
  }
});

/* ---------- 숨는 칸 (PC8 B-1) ---------- */
const DEVICE_NAME = { phone: '휴대폰', pc: 'PC' };
function setView(v) {
  st.view = v;
  for (const b of $('#view').children) b.setAttribute('aria-pressed', String(b.dataset.v === v));
  renderStage();
}
function onHidden(key, frame) {
  if (st.view === 'both') {
    // 다른 기기 창에서는 보이므로 바꾸지 않고 알려만 줌
    toast(`“${key}”는 ${DEVICE_NAME[frame.device]}에서 숨는 칸이에요 · 옆 창에서 보세요`);
    return;
  }
  if (st.autoSwitched === key) {
    toast(`“${key}”는 휴대폰 · PC 어느 쪽에서도 지금 안 보여요`, true);
    return;
  }
  const other = frame.device === 'phone' ? 'pc' : 'phone';
  st.autoSwitched = key;
  st.pendingSelect = key;
  toast(`“${key}”는 ${DEVICE_NAME[frame.device]}에서 숨는 칸이라 ${DEVICE_NAME[other]} 보기로 바꿨어요`);
  setView(other);
}

/* ---------- 휴대폰 초점 고르기 (PC11-스튜디오-3) ---------- */
// preview/focus.mjs와 같은 계산(이 창은 도우미가 preview.js 한 파일만 주므로 여기 따로 둠 · 시험 focus.test가 둘을 맞춰 봄)
function mobileRatioOf(slot) {
  const m = slot?.current?.mobile;
  if (m?.width && m?.height) return m.width / m.height;
  const d = String(slot?.spec?.displayRatio ?? '').match(/모바일\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  return d ? Number(d[1]) / Number(d[2]) : null;
}
function cropBoxPct(w, h, ratio, f) {
  let cw = w;
  let ch = w / ratio;
  if (ch > h) {
    ch = h;
    cw = h * ratio;
  }
  const left = Math.min(w - cw, Math.max(0, f.x * w - cw / 2));
  const top = Math.min(h - ch, Math.max(0, f.y * h - ch / 2));
  return { left: (left / w) * 100, top: (top / h) * 100, width: (cw / w) * 100, height: (ch / h) * 100 };
}
const newTrial = () => ({ pc: null, focus: { x: 0.5, y: 0.5 } });
const clamp01 = (n) => Math.round(Math.min(1, Math.max(0, Number(n) || 0)) * 1000) / 1000;

/* ---------- 놓을 곳 표시 (PC2-스튜디오-7) ---------- */
function renderPlacing() {
  const el = $('#placing');
  el.textContent = st.place === 'variant' ? `${st.placeLabel}에 놓는 중` : '공개본에 놓는 중';
  el.className = `placing${st.place === 'variant' ? ' variant' : ''}`;
}
async function loadPlace() {
  try {
    const s = await api('status');
    st.place = s.place ?? 'public';
    st.placeLabel = s.label ?? '공개본';
    st.vslots = [];
    st.vtrials.clear();
    if (st.place === 'variant') {
      const j = await api('slots?place=variant');
      st.vslots = j.slots || [];
      seedVideos('variant', st.vslots, j.states); // PC2-스튜디오-9
      for (const slot of st.vslots) {
        const t = trialFromState(slot, j.states?.[slot.key]);
        if (t) st.vtrials.set(slot.key, t);
      }
    }
  } catch {}
  renderPlacing();
  renderFocus();
}

function renderFocus() {
  const box = $('#focus');
  const key = st.selected;
  const t = key && trialsOf(st.place).get(key);
  // 수정안이면 그 PR 칸 목록의 규격(휴대폰 비율 · 파일 따로)으로
  const slot = key && ((st.place === 'variant' && st.vslots?.find((s) => s.key === key)) || slotByKey(key));
  if (!t || !slot || !t.pc) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $('#fkey').textContent = `${slot.slotId ?? ''} ${key}${st.place === 'variant' ? ` · ${st.placeLabel}` : ''}`;
  const img = $('#fimg');
  const src = `${st.place === 'variant' ? st.config.variantOrigin : st.config.siteOrigin}${t.pc}`;
  if (img.dataset.src !== src) {
    img.dataset.src = src;
    img.src = src;
  }
  const f = t.focus ?? { x: 0.5, y: 0.5 };
  $('#fdot').style.left = `${f.x * 100}%`;
  $('#fdot').style.top = `${f.y * 100}%`;
  const ratio = mobileRatioOf(slot);
  const fb = $('#fbox');
  if (ratio && img.naturalWidth) {
    const b = cropBoxPct(img.naturalWidth, img.naturalHeight, ratio, f);
    Object.assign(fb.style, { left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%` });
    fb.hidden = false;
  } else fb.hidden = true;
  $('#fhint').textContent = slot.current?.mobile
    ? '꼭 보여야 할 곳을 누르세요 → 휴대폰 그림을 그 점 둘레로 다시 잘라요(노란 테두리 = 휴대폰에 남는 곳).'
    : '꼭 보여야 할 곳을 누르세요 → 화면이 그림을 자를 때 그 점을 남겨요(휴대폰 · PC 같은 그림).';
  $('#fval').textContent = `점 x ${Math.round(f.x * 100)}% · y ${Math.round(f.y * 100)}%${f.x === 0.5 && f.y === 0.5 ? ' (가운데 · 기본)' : ''}`;
}

let focusTimer;
function sendFocus(key, focus, reset = false) {
  const place = st.place;
  const t = trialsOf(place).get(key);
  if (!t) return;
  t.focus = reset ? { x: 0.5, y: 0.5 } : { x: clamp01(focus.x), y: clamp01(focus.y) };
  renderFocus();
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    api('focus', reset ? { key, reset: true, place } : { key, ...t.focus, place })
      .then(() => status(`“${key}” 초점 저장 · 휴대폰 화면에 반영`))
      .catch((err) => toast(`초점: ${err.message}`, true));
  }, 120);
}

function trialFromState(slot, s) {
  if (!s?.trial || s.trial.media !== 'image' || s.image?.state !== 'trial') return null;
  const v = Date.parse(s.trial.placedAt) || Date.now();
  return { pc: s.image?.file?.includes('?') ? s.image.file : `${slot.current?.pc?.url}?v=${v}`, focus: s.trial.focus ?? { x: 0.5, y: 0.5 } };
}

/* ---------- 신호 처리 (도우미 SSE · events.md) ---------- */
function selectSlot(key, paths) {
  st.selected = key;
  if (st.autoSwitched !== key) st.autoSwitched = null;
  const s = slotByKey(key);
  const onScreen = [...st.present.values()].some((set) => set.has(key));
  if (!onScreen && s) {
    const target = st.pages.find((p) => p.pageId === s.pageId);
    // 약속 v1.1: slot.selected.paths(그 칸이 보이는 주소)를 먼저
    const path = paths?.[0] || s.paths?.[0] || target?.paths?.[0];
    if (target && target.pageId !== st.pageId) {
      st.pageId = target.pageId;
      st.pendingSelect = key;
      renderPages();
      renderStage();
      renderChips();
      return;
    }
    if (path && path !== pagePath()) {
      st.pendingSelect = key;
      for (const f of st.frames) f.el.src = frameUrl(f.role, path);
      return;
    }
  }
  renderChips();
  renderFocus();
  broadcast({ type: 'studio:select', key });
}

const handlers = {
  'slot.selected': (d) => selectSlot(d.key, d.paths),
  'slot.updated': (d) => {
    // variant(수정안)에서 놓은 그림은 수정안 창에만 · 아니면 공개본 창에만 (약속: 확정은 그 PR의 요청으로)
    const target = d.variant ? 'variant' : 'public';
    rememberVideo(target, d); // PC2-스튜디오-9: 창을 다시 그려도 영상이 남게
    for (const f of st.frames) if (f.role === target) postTo(f, { type: 'studio:update', ...d });
    if (d.state === 'trial' || (d.lane === 'video' && d.urls?.video)) ensureFrameFor(target, d); // 보낼 창이 없으면 열거나 알림(조용히 버리지 않음)
    // 초점 고르기: 놓은 그림(시험)이 있는 칸 기억 · 확정 · 되돌리기면 지움 (공개본 · 수정안 따로 · PC2-스튜디오-7)
    if (d.key) {
      const map = trialsOf(target);
      if (d.state === 'trial' && d.lane !== 'video') {
        const t = map.get(d.key) || newTrial();
        if (d.urls?.pc) t.pc = d.urls.pc;
        if (d.focus) t.focus = d.focus;
        map.set(d.key, t);
      } else if (d.state) map.delete(d.key);
      if (d.key === st.selected) renderFocus();
    }
  },
  'place.changed': (d) => {
    st.place = d.place ?? 'public';
    st.placeLabel = d.label ?? '공개본';
    renderPlacing();
    loadPlace();
    if (st.place === 'variant') toast(`${st.placeLabel}에 놓는 중 · 대장에서 놓은 그림은 수정안 창에 보여요`);
  },
  'register.rebuilt': (d) => {
    loadSlots().then(() => toast(`칸 목록 다시 만듦 · 새 칸 ${d.added?.length ?? 0} · 없어진 칸 ${d.removed?.length ?? 0}`));
  },
  'variant.changed': (d) => {
    if (st.variant?.id && (d.variant ?? null) !== st.variant.id) st.videos.variant.clear(); // 다른 수정안으로 바꿈 = 그 영상은 새 사본에 없음
    st.variant = d.variant ? { id: d.variant, port: d.port, state: d.state, message: d.message } : null;
    if (d.state === 'failed') toast(`수정안 사본 실패: ${d.message ?? ''}`, true);
    if (st.compare) renderStage();
  },
  'helper.status': (d) => {
    // 사본 상태가 없는 소식(경고 · DB · 충돌)은 띠를 바꾸지 않음 — "사본 undefined" 방지(PC2-스튜디오-1)
    if (!d.site) return;
    const name = { starting: '켜는 중…', failed: `꺼짐${d.message ? ' · ' + d.message : ''}`, stopped: '꺼짐' }[d.site] ?? d.site;
    status(d.site === 'ready' ? `사본 ${d.repoCommit?.slice(0, 7) ?? ''} · 연결됨`.replace('  ', ' ') : `사본 ${name}`, d.site === 'ready' ? 'ok' : d.site === 'starting' ? 'busy' : 'bad');
  },
  'helper.error': (d) => toast(`${d.code}: ${d.message}`, true),
};

function connectEvents() {
  const es = new EventSource('/api/events');
  es.onopen = () => status('도우미 연결됨');
  es.onerror = () => status('도우미 연결 끊김 · 다시 연결 중…', 'bad');
  for (const [name, fn] of Object.entries(handlers))
    es.addEventListener(name, (e) => {
      try {
        fn(JSON.parse(e.data));
      } catch (err) {
        console.warn('signal', name, err);
      }
    });
}

/* ---------- 조작 ---------- */
function seg(id, attr, apply) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const x of e.currentTarget.children) x.setAttribute('aria-pressed', String(x === b));
    apply(b.dataset[attr]);
  });
}

async function loadSlots() {
  const j = await api('slots');
  st.pages = j.pages || [];
  st.slots = j.slots || [];
  st.pageId ??= st.pages[0]?.pageId;
  st.trials.clear();
  if ((j.place ?? 'public') === 'public') seedVideos('public', st.slots, j.states); // PC2-스튜디오-9
  for (const slot of st.slots) {
    const t = trialFromState(slot, j.states?.[slot.key]);
    if (t) st.trials.set(slot.key, t);
  }
  renderPages();
  renderFocus();
}

async function loadVariants(all = false) {
  const sel = $('#variant');
  sel.textContent = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '수정안 고르기…';
  sel.append(none);
  try {
    const j = await api(all ? 'variants?all=1' : 'variants');
    if (!all && !(j.variants || []).length) none.textContent = '열린 PR 없음';
    for (const v of j.variants || []) {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.title ? `${v.label} ${v.title}` : v.label;
      sel.append(o);
    }
  } catch (err) {
    toast(`수정안 목록을 못 받음: ${err.message}`, true);
  }
  if (!all) {
    // 기본은 열린 PR만 · 필요하면 모든 브랜치(PC8 B-2)
    const more = document.createElement('option');
    more.value = '__all__';
    more.textContent = '모든 브랜치 보기…';
    sel.append(more);
  }
  if (st.variant) sel.value = st.variant.id;
}

async function init() {
  try {
    st.config = { ...st.config, ...(await api('preview-config')) };
  } catch {}
  seg('#view', 'v', (v) => setView(v));
  seg('#locale', 'l', (l) => {
    if (!LOCALES.includes(l)) return;
    st.locale = l;
    api('locale', { locale: l }).catch(() => {});
    for (const f of st.frames) f.el.src = frameUrl(f.role);
  });
  seg('#compare', 'c', (c) => {
    st.compare = c === 'on';
    $('#variant').disabled = !st.compare;
    if (st.compare) loadVariants();
    else if (st.variant) api('variant', { variant: null }).catch(() => {}); // 비교를 닫으면 4302 끔(메모리 · V12)
    renderStage();
  });
  $('#variant').onchange = (e) => {
    if (e.target.value === '__all__') {
      e.target.value = st.variant?.id ?? '';
      loadVariants(true);
      return;
    }
    const id = e.target.value || null;
    st.variant = id ? { id, state: 'starting' } : null;
    renderStage();
    api('variant', { variant: id }).catch((err) => toast(`수정안: ${err.message}`, true));
  };
  $('#page').onchange = (e) => {
    st.pageId = e.target.value;
    st.selected = null;
    renderStage();
    renderChips();
  };
  // 초점: 그림을 누름 → 점 · 키보드(화살표 5%씩) · 가운데로
  const fpic = $('#fpic');
  fpic.tabIndex = 0;
  fpic.addEventListener('click', (e) => {
    const r = $('#fimg').getBoundingClientRect();
    if (!st.selected || !r.width) return;
    sendFocus(st.selected, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
  });
  fpic.addEventListener('keydown', (e) => {
    const t = st.selected && trialsOf(st.place).get(st.selected);
    const d = { ArrowLeft: [-0.05, 0], ArrowRight: [0.05, 0], ArrowUp: [0, -0.05], ArrowDown: [0, 0.05] }[e.key];
    if (!t || !d) return;
    e.preventDefault();
    const f = t.focus ?? { x: 0.5, y: 0.5 };
    sendFocus(st.selected, { x: f.x + d[0], y: f.y + d[1] });
  });
  $('#fimg').addEventListener('load', renderFocus);
  $('#freset').onclick = () => st.selected && sendFocus(st.selected, null, true);
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(renderStage, 200);
  });
  await loadSlots().catch((err) => toast(`칸 목록을 못 받음: ${err.message}`, true));
  await loadPlace();
  renderStage();
  renderChips();
  connectEvents();
}

init();
