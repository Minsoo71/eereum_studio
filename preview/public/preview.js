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
  selected: null,
  pendingSelect: null, // 페이지를 옮긴 뒤 고를 칸
  frames: [], // { el, role: 'public'|'variant', device }
};

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
  const p = page();
  const keys = st.slots.filter((s) => s.pageId === p?.pageId || present.has(s.key)).map((s) => s.key);
  for (const k of new Set([...keys, ...present])) {
    const s = slotByKey(k);
    const b = document.createElement('button');
    b.className = `chip${present.has(k) ? '' : ' absent'}`;
    b.setAttribute('aria-pressed', String(st.selected === k));
    b.textContent = k;
    b.title = present.has(k) ? (s?.position ?? '') : `이 화면에 아직 칸 표시가 없음(data-slot) · ${s?.position ?? ''}`;
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
    renderChips();
    if (st.pendingSelect) {
      const k = st.pendingSelect;
      if (st.present.get(frame.el).has(k)) {
        st.pendingSelect = null;
        broadcast({ type: 'studio:select', key: k });
      }
    }
  } else if (m.type === 'studio:missing') {
    toast(`“${m.key}” — 이 화면에 없는 칸`, true);
  } else if (m.type === 'studio:applied') {
    status(`“${m.key}” 새 그림 반영 · ${m.count}곳`);
  } else if (m.type === 'studio:scroll' && st.compare) {
    for (const f of st.frames) if (f.el !== frame.el && f.device === frame.device) postTo(f, { type: 'studio:scrollTo', ratio: m.ratio });
  }
});

/* ---------- 신호 처리 (도우미 SSE · events.md) ---------- */
function selectSlot(key, paths) {
  st.selected = key;
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
  broadcast({ type: 'studio:select', key });
}

const handlers = {
  'slot.selected': (d) => selectSlot(d.key, d.paths),
  'slot.updated': (d) => {
    // variant(수정안)에서 놓은 그림은 수정안 창에만 · 아니면 공개본 창에만 (약속: 확정은 그 PR의 요청으로)
    const target = d.variant ? 'variant' : 'public';
    for (const f of st.frames) if (f.role === target) postTo(f, { type: 'studio:update', ...d });
  },
  'register.rebuilt': (d) => {
    loadSlots().then(() => toast(`칸 목록 다시 만듦 · 새 칸 ${d.added?.length ?? 0} · 없어진 칸 ${d.removed?.length ?? 0}`));
  },
  'variant.changed': (d) => {
    st.variant = d.variant ? { id: d.variant, port: d.port, state: d.state, message: d.message } : null;
    if (d.state === 'failed') toast(`수정안 사본 실패: ${d.message ?? ''}`, true);
    if (st.compare) renderStage();
  },
  'helper.status': (d) => status(d.site === 'ready' ? `사본 ${d.repoCommit?.slice(0, 7) ?? ''} · 연결됨` : `사본 ${d.site}`, d.site === 'ready' ? 'ok' : d.site === 'failed' ? 'bad' : 'busy'),
  error: (d) => toast(`${d.code}: ${d.message}`, true),
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
  renderPages();
}

async function loadVariants() {
  const sel = $('#variant');
  sel.textContent = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '수정안 고르기…';
  sel.append(none);
  try {
    const j = await api('variants');
    for (const v of j.variants || []) {
      const o = document.createElement('option');
      o.value = v.id;
      o.textContent = v.title ? `${v.label} ${v.title}` : v.label;
      sel.append(o);
    }
  } catch (err) {
    toast(`수정안 목록을 못 받음: ${err.message}`, true);
  }
  if (st.variant) sel.value = st.variant.id;
}

async function init() {
  try {
    st.config = { ...st.config, ...(await api('preview-config')) };
  } catch {}
  seg('#view', 'v', (v) => ((st.view = v), renderStage()));
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
  let rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(renderStage, 200);
  });
  await loadSlots().catch((err) => toast(`칸 목록을 못 받음: ${err.message}`, true));
  renderStage();
  renderChips();
  connectEvents();
}

init();
