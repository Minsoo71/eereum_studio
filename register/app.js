// 대장 창 (M1 · V7 시안대로) — 도우미(같은 주소)와 이야기함 · contract/events.md v1.1
import { makeSheet, INTERVAL } from './light.js';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const KIND = { normal: '일반 그림', background: '배경 그림', share: '공유 미리보기' };
let data = null;
let selected = null;
const versions = {}; // 칸마다 썸네일 버전

async function api(pathname, body) {
  const r = await fetch(pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const j = await r.json().catch(() => ({ ok: false, error: { message: '응답을 읽지 못했어요.' } }));
  if (!j.ok) throw Object.assign(new Error(j.error?.message ?? '실패했어요.'), { code: j.error?.code, detail: j.error?.detail });
  return j;
}
function toast(msg, bad = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), bad ? 6000 : 3000);
}
// 놓을 곳(PC2-스튜디오-7): data.place = 'public'(공개본 사본) | 'variant'(수정안 PR 사본) — 도우미가 정함 · 아래 모든 명령에 같이 보냄
const placeQ = () => `place=${data?.place ?? 'public'}`;
const thumbUrl = (key) => `/api/thumb?key=${encodeURIComponent(key)}&${placeQ()}&v=${versions[`${data?.place}:${key}`] ?? 0}`;

function laneHtml(slot, lane) {
  const st = data.states[slot.key] ?? {};
  const l = st[lane] ?? { state: 'empty' };
  const accepts = slot.accepts === 'both' || slot.accepts === lane;
  if (!accepts) return `<div class="lane no"><b>${lane === 'video' ? '영상 안 됨' : '이미지 안 됨'}</b><span>이 칸은 ${slot.accepts === 'image' ? '이미지만' : '영상만'}</span></div>`;
  const trialHere = st.trial && st.trial.media === lane;
  if (l.state === 'requested') return `<div class="lane requested" data-lane="${lane}"><b>요청함</b><span>${esc(st.request?.file ?? '')}</span><span>PC9가 확인 뒤 반영해요</span></div>`;
  if (trialHere) {
    return `<div class="lane trial" data-lane="${lane}" data-drop="${lane}">${lane === 'image' ? `<img src="${thumbUrl(slot.key)}" alt="">` : ''}<b>시험 중</b><span>${esc(st.trial.file.split('/').pop())}</span><button type="button" data-revert="${esc(slot.key)}">되돌리기</button><em>다른 그림을 놓으면 바꿔요</em></div>`;
  }
  if (lane === 'image' && l.state === 'live') {
    const p = slot.current.pc;
    return `<div class="lane live" data-lane="image" data-drop="image"><span>지금 그림</span><small>${esc(p.width ?? '?')}×${esc(p.height ?? '?')} · ${esc(p.format)}</small><em>새 그림을 끌어다 놓기</em></div>`;
  }
  return `<div class="lane empty" data-lane="${lane}" data-drop="${lane}"><span>비어 있음</span><em>${lane === 'video' ? '영상(mp4) 끌어다 놓기' : '그림 끌어다 놓기'}</em></div>`;
}

function rowHtml(s) {
  const warn = [s.current.sharedWith ? `같은 파일을 쓰는 칸: ${s.current.sharedWith.join(', ')}` : '', s.inUse ? '' : '지금 화면에 안 쓰임(예비)', s.note ?? ''].filter(Boolean).map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join('');
  return `<tr data-key="${esc(s.key)}" class="${s.inUse ? '' : 'spare'}${selected === s.key ? ' sel' : ''}">
<td class="id">${esc(s.slotId)}</td>
<td class="th"><img src="${thumbUrl(s.key)}" alt="${esc(s.alt?.ko)}" loading="lazy"></td>
<td><div class="pos">${esc(s.position)}</div><span class="kind k-${s.kind}">${KIND[s.kind]}</span><div class="code">${esc(s.key)}</div>${warn}</td>
<td>${laneHtml(s, 'image')}</td><td>${laneHtml(s, 'video')}</td>
<td class="spec">${esc(s.spec.ratio)}${s.spec.displayRatio ? `<br><small>화면 ${esc(s.spec.displayRatio)}</small>` : ''}<br><small>최소 가로 ${esc(s.spec.minWidth)}px</small>${s.spec.switchWidth ? `<br><small>바뀌는 폭 ${esc(s.spec.switchWidth)}px</small>` : ''}<br><small>모바일: ${s.spec.mobileCrop === 'separate-file' ? '파일 따로' : s.spec.mobileCrop === 'focus' ? `자르기 기준 ${esc(s.spec.focus)}` : '같은 그림'}</small></td>
<td class="act"><button type="button" data-select="${esc(s.key)}" title="미리보기 창에서 이 칸으로 이동">보기</button></td></tr>`;
}

function render() {
  $('#pages').innerHTML = data.pages.map((p) => `<a href="#${p.pageId}">${p.pageId} ${esc(p.name)} <i>${data.slots.filter((s) => s.pageId === p.pageId).length}</i></a>`).join('');
  $('#main').innerHTML = data.pages.map((p) => `<section id="${p.pageId}"><h2>${p.pageId} ${esc(p.name)} <small>${esc(p.paths.join(' · '))}${p.public === false ? ' · 개발용' : ''}</small></h2>
<div class="tbl"><table><thead><tr><th>칸 ID</th><th>지금 그림</th><th>위치 · 종류</th><th>이미지 칸</th><th>영상 칸</th><th>규격</th><th></th></tr></thead><tbody>${data.slots.filter((s) => s.pageId === p.pageId).map(rowHtml).join('')}</tbody></table></div></section>`).join('');
  renderSide();
}
function rerenderRow(key) {
  const tr = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
  const s = data.slots.find((x) => x.key === key);
  if (tr && s) tr.outerHTML = rowHtml(s);
  if (selected === key) renderSide();
}

function renderSide() {
  const s = data.slots.find((x) => x.key === selected);
  if (!s) { $('#side').innerHTML = '<p class="muted">왼쪽 표에서 칸을 고르세요.</p>'; return; }
  const st = data.states[s.key] ?? {};
  const can = Boolean(st.trial) && st[st.trial.media]?.state !== 'requested';
  const v = data.variant;
  const placeSel = v?.state === 'ready' ? `<label for="place">놓을 곳</label><select id="place"><option value="variant" ${data.place === 'variant' ? 'selected' : ''}>수정안 ${esc(v.label)}${v.branch ? ` · ${esc(v.branch)}` : ''}</option><option value="public" ${data.place === 'public' ? 'selected' : ''}>공개본(main)</option></select>` : '';
  $('#side').innerHTML = `${placeSel}<h3>고른 칸 <small class="place-tag ${esc(data.place)}">${esc(data.placeLabel ?? '공개본')}</small></h3><div class="big">${esc(s.slotId)}</div><p>${esc(s.position)}</p>
<img src="${thumbUrl(s.key)}" alt="">
<dl><dt>코드 이름</dt><dd>${esc(s.key)}</dd><dt>지금 파일</dt><dd>${esc(s.current.pc.url)}</dd><dt>모바일</dt><dd>${esc(s.current.mobile?.url ?? '같은 그림')}</dd><dt>규격</dt><dd>${esc(s.spec.displayRatio ?? s.spec.ratio)} · 최소 ${esc(s.spec.minWidth)}px${s.spec.switchWidth ? ` · 바뀌는 폭 ${esc(s.spec.switchWidth)}px` : ''}</dd><dt>출처</dt><dd>${esc(s.source)}</dd><dt>상태</dt><dd>${esc(st.trial ? '시험 중' : st.request ? '요청함' : '그대로')} · 고친 횟수 ${esc(st.revision ?? 0)}</dd></dl>
${s.current.mobile ? `<label>놓을 자리</label><select id="target"><option value="auto">알아서(세로 영상 = 휴대폰만 · 그 밖 = 둘 다)</option><option value="both">PC · 모바일 둘 다</option><option value="pc">PC만(그림 · 영상)</option><option value="mobile">휴대폰만(그림 · 영상)</option></select>` : ''}
<h3 style="margin-top:16px">확정(요청 폴더로)</h3>
<label for="lic">출처 · 라이선스</label><select id="lic"><option value="">고르세요</option><option>자체 렌더</option><option>사용자 사진</option><option>CC BY / BY-SA (출처를 메모에)</option><option disabled>CC BY-NC (쓸 수 없음)</option></select>
<label for="ai">AI로 만든 그림인가요?</label><select id="ai"><option value="">아니요</option><option value="1">예</option></select>
<p class="note" id="ai-note" hidden>예 → 확정을 누르면 ${INTERVAL}초마다 뽑은 프레임 검사판이 떠요. 빛 번쩍임 · 쓸림 · 번짐 · 빛남이 없을 때만 "빛 효과 없음"을 눌러 주세요.</p>
<label for="alt">대체 글(그림 설명) · 바꿀 때만</label><input id="alt" placeholder="${esc(s.alt?.ko)}">
<label for="memo">메모(파일 이름에도 들어감)</label><textarea id="memo" rows="2" placeholder="예: 반지가 오른쪽에 보이게"></textarea>
<p class="note">${data.place === 'variant' ? `확정하면 요청\\${esc(s.slotId)}_YYYYMMDD-HHMM_pr${esc(v?.number ?? '')}_설명 으로 들어가요 → PC4가 <b>${esc(v?.label ?? '')} 브랜치(${esc(v?.branch ?? '?')})</b>에 커밋해요(새 PR 아님). 공개 사이트는 바뀌지 않아요.` : `확정하면 요청\\${esc(s.slotId)}_YYYYMMDD-HHMM_설명 으로 들어가요. 공개 사이트는 바뀌지 않아요(PC9가 확인 · 승인 뒤 반영).`}</p>
<button type="button" class="wide primary" id="confirm" ${can ? '' : 'disabled'}>확정</button>
<div id="already" class="already" role="alertdialog" aria-labelledby="already-t" hidden></div>
${can ? '' : '<p class="note">먼저 이 칸에 그림을 놓아 보세요.</p>'}`;
  $('#place')?.addEventListener('change', (e) => api('/api/place', { place: e.target.value }).catch((x) => toast(x.message, true)));
  let lightOk = false; // 검사판에서 "빛 효과 없음"을 눌렀는지(PC2-스튜디오-2)
  $('#ai').addEventListener('change', () => { $('#ai-note').hidden = $('#ai').value !== '1'; lightOk = false; });
  const send = async (replace) => {
    const box = $('#already');
    try {
      const r = await api('/api/confirm', { place: data.place, key: s.key, license: $('#lic').value, ai: $('#ai').value === '1', altKo: $('#alt').value || null, note: $('#memo').value, replace, lightOk });
      box.hidden = true;
      toast(`${r.replaced?.length ? `앞 요청을 이전\\_바뀐요청으로 옮기고 새로 넣었어요: ${r.file}` : `요청에 넣었어요: ${r.file}`}${r.targetPR ? ` · ${data.placeLabel} 브랜치 ${r.targetPR.branch}에 넣을 요청` : ''}`);
    } catch (e) {
      if (e.code !== 'ALREADY_REQUESTED') { toast(e.message, true); return; }
      // 기능 ②: 같은 칸 확정 대기 → 앞 요청 바꾸기 / 취소
      const list = (e.detail?.pending ?? []).map((p) => `<li>${esc(p.file)}${p.machine ? ` · ${esc(p.machine)}` : ''}</li>`).join('');
      box.innerHTML = `<p id="already-t"><b>${esc(e.message)}</b></p><ul>${list}</ul><p class="note">바꾸면 앞 요청은 공유 이전\\_바뀐요청\\ 으로 옮겨요(지우지 않음).</p>
<div class="row"><button type="button" class="primary" id="already-yes">앞 요청 바꾸기</button><button type="button" id="already-no">취소</button></div>`;
      box.hidden = false;
      $('#already-yes').addEventListener('click', () => send(true));
      $('#already-no').addEventListener('click', () => { box.hidden = true; toast('취소했어요. 앞 요청은 그대로예요.'); });
      $('#already-no').focus();
    }
  };
  $('#confirm')?.addEventListener('click', async () => {
    if ($('#ai').value === '1') {
      if (!$('#lic').value) { toast('출처 · 라이선스를 골라 주세요.', true); return; }
      lightOk = await lightCheck(s, st);
      if (!lightOk) return;
    }
    send(false);
  });
}

/** AI 예 → 검사판 만들기 · 보내기 · 보여 주기 → "빛 효과 없음"이면 true */
async function lightCheck(s, st) {
  const b = $('#confirm'); const label = b.textContent;
  b.disabled = true; b.textContent = '검사판 만드는 중…';
  try {
    const kind = st.trial.media === 'video' ? 'video' : 'image';
    const file = await fetch(`/api/trial-file?key=${encodeURIComponent(s.key)}&${placeQ()}`);
    if (!file.ok) throw new Error((await file.json().catch(() => null))?.error?.message ?? '시험 파일을 읽지 못했어요.');
    const src = URL.createObjectURL(await file.blob());
    let sheet;
    try { sheet = await makeSheet({ src, kind, title: `${s.slotId} · ${st.trial.file.split('/').pop()}`, onProgress: (i, n) => { b.textContent = `검사판 만드는 중… ${i}/${n}`; } }); }
    finally { URL.revokeObjectURL(src); }
    const info = { frames: sheet.frames, interval: sheet.interval, duration: sheet.duration, suspects: sheet.suspects };
    const up = await fetch(`/api/light-sheet?key=${encodeURIComponent(s.key)}&${placeQ()}`, { method: 'POST', headers: { 'content-type': 'image/png', 'x-sheet-info': encodeURIComponent(JSON.stringify(info)) }, body: sheet.blob });
    const uj = await up.json().catch(() => ({ ok: false }));
    if (!uj.ok) throw new Error(uj.error?.message ?? '검사판을 저장하지 못했어요.');
    return await showSheet(s, sheet);
  } catch (e) { toast(e.message, true); return false; }
  finally { b.disabled = false; b.textContent = label; }
}

function showSheet(s, sheet) {
  return new Promise((done) => {
    const url = URL.createObjectURL(sheet.blob);
    const d = document.createElement('dialog');
    d.className = 'sheet';
    d.setAttribute('aria-labelledby', 'sheet-t');
    d.innerHTML = `<h3 id="sheet-t">${esc(s.slotId)} 빛 효과 검사판 · ${sheet.duration ? `${sheet.duration.toFixed(1)}초 · ` : ''}${sheet.interval}초마다 ${sheet.frames}장</h3>
<p>모든 프레임에서 <b>빛 번쩍임 · 빛이 쓸고 지나감 · 빛 번짐 · 빛남</b>이 없는지 봐 주세요. 하나라도 있으면 쓰지 않아요(다시 만들기는 한 번까지).</p>
${sheet.suspects.length ? `<p class="sus">⚠ 자동으로 의심한 프레임 ${sheet.suspects.length}장(빨간 테두리): ${sheet.suspects.map((t) => `${Number(t).toFixed(1)}초`).join(' · ')} — 꼭 크게 봐 주세요.</p>` : '<p class="muted">자동 의심 프레임 없음 · 그래도 한 장씩 봐 주세요.</p>'}
<p class="muted">그림을 누르면 원래 크기로 크게(창 안에서 스크롤) · 다시 누르면 창에 맞춤</p>
<div class="sheet-img"><img src="${url}" alt="${esc(s.slotId)} 프레임 검사판" title="누르면 크게 · 다시 누르면 맞춤"></div>
<div class="row"><button type="button" class="primary" data-ok>빛 효과 없음 · 확정</button><button type="button" data-no>빛 효과 있음 · 확정 안 함</button></div>`;
    document.body.append(d);
    let finished = false;
    const close = (ok) => {
      if (finished) return; finished = true;
      d.close(); d.remove(); URL.revokeObjectURL(url); done(ok);
      if (!ok) toast('확정하지 않았어요. 다른 파일을 놓거나 다시 만들어 주세요(다시 만들기는 한 번까지).');
    };
    d.querySelector('.sheet-img img').addEventListener('click', (e) => e.currentTarget.classList.toggle('zoom')); // PC2-스튜디오-3: 크게 보기
    d.querySelector('[data-ok]').addEventListener('click', () => close(true));
    d.querySelector('[data-no]').addEventListener('click', () => close(false));
    d.addEventListener('cancel', (e) => { e.preventDefault(); close(false); });
    d.showModal();
    d.querySelector('[data-no]').focus(); // 기본은 "확정 안 함"(습관처럼 누르지 않게)
  });
}

async function select(key, tell = true) {
  selected = key;
  document.querySelectorAll('tr.sel').forEach((t) => t.classList.remove('sel'));
  document.querySelector(`tr[data-key="${CSS.escape(key)}"]`)?.classList.add('sel');
  renderSide();
  if (tell) api('/api/select', { key }).catch(() => {});
}

async function dropFile(key, lane, file) {
  const s = data.slots.find((x) => x.key === key);
  // PC2-스튜디오-9: 고르지 않았으면 "알아서"(세로 영상 = 휴대폰만) · 고른 칸이면 그 칸의 놓을 자리
  const target = selected === key ? ($('#target')?.value ?? 'auto') : 'auto';
  const zone = document.querySelector(`tr[data-key="${CSS.escape(key)}"] [data-drop="${lane}"]`);
  zone?.classList.add('busy');
  try {
    const r = await fetch(`/api/drop?key=${encodeURIComponent(key)}&target=${target}&${placeQ()}`, { method: 'POST', headers: { 'x-file-name': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error?.message ?? '놓지 못했어요.');
    const where = (file.type?.startsWith('video') || /\.mp4$/i.test(file.name)) && j.target && j.target !== 'both' ? ` · ${j.target === 'mobile' ? '휴대폰' : 'PC'} 화면에만` : '';
    toast(`${s.slotId} ${data.placeLabel ?? '공개본'} 사본에 바꿔 끼웠어요${where}${j.warnings?.length ? ' · ' + j.warnings.join(' ') : ''}`, Boolean(j.warnings?.length));
  } catch (e) { toast(e.message, true); zone?.classList.remove('busy'); }
}

// 이벤트 위임
document.addEventListener('click', (e) => {
  const rv = e.target.closest('[data-revert]');
  if (rv) { e.stopPropagation(); api('/api/revert', { key: rv.dataset.revert, place: data.place }).then(() => toast('원래 그림으로 되돌렸어요.')).catch((x) => toast(x.message, true)); return; }
  const sb = e.target.closest('[data-select]');
  const tr = e.target.closest('tr[data-key]');
  if (sb || tr) select((sb ?? tr).dataset.select ?? tr.dataset.key);
});
document.addEventListener('dragover', (e) => {
  const z = e.target.closest('[data-drop]');
  if (z) { e.preventDefault(); z.classList.add('over'); } else e.preventDefault();
});
document.addEventListener('dragleave', (e) => e.target.closest('[data-drop]')?.classList.remove('over'));
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const z = e.target.closest('[data-drop]');
  if (!z) return;
  z.classList.remove('over');
  const file = e.dataTransfer.files?.[0];
  const key = z.closest('tr').dataset.key;
  if (!file) return toast('파일을 놓아 주세요.', true);
  dropFile(key, z.dataset.drop, file);
});
$('#refresh').addEventListener('click', () => api('/api/refresh').then((r) => toast(`다시 읽었어요 · 새 칸 ${r.added.length} · 없어진 칸 ${r.removed.length} · 옮긴 칸 ${r.moved.length}`)).catch((x) => toast(x.message, true)));

async function load() {
  const r = await fetch('/api/slots'); data = await r.json(); // 도우미의 지금 놓을 곳 기준
  $('#commit-pill').textContent = data.place === 'variant' ? `수정안 ${data.variant?.label ?? ''} · ${data.source.repoCommit} · ${data.variant?.branch ?? ''}` : `사이트 ${data.source.repoCommit} · ${data.source.branch || 'main'}`;
  const pp = $('#place-pill');
  pp.textContent = `놓을 곳: ${data.placeLabel ?? '공개본'}`;
  pp.className = `pill${data.place === 'variant' ? ' rev' : ''}`;
  $('#open-site').href = data.siteOrigin;
  render();
}
async function status() {
  const s = await (await fetch('/api/status')).json();
  $('#machine-pill').textContent = `이 컴퓨터: ${s.machine}`;
  const p = $('#site-pill');
  p.textContent = s.site === 'ready' ? `쇼핑몰 사본 켜짐 · ${s.siteOrigin.replace('http://', '')}` : s.site === 'starting' ? '쇼핑몰 사본 켜는 중…' : '쇼핑몰 사본 꺼짐';
  p.className = `pill ${s.site === 'ready' ? 'ok' : s.site === 'starting' ? '' : 'bad'}`;
  // 데이터 화면(내장 DB · 장바구니 그림 칸만 필요) — 바로 가기는 DB 없이 열고 여기서 켬(PC2-스튜디오-2 R-1b)
  const db = $('#data');
  db.textContent = { starting: '데이터 화면 켜는 중…', ready: '데이터 화면 켜짐', failed: '데이터 화면 다시 켜기' }[s.data] ?? '데이터 화면 켜기';
  db.disabled = s.data === 'starting' || s.data === 'ready';
  // V5 S2: Synology 충돌 사본(자동으로 지우지 않음 · 사용자가 어느 쪽을 남길지 고름)
  let warn = $('#conflicts');
  if (!warn) { warn = document.createElement('div'); warn.id = 'conflicts'; warn.className = 'conflicts'; warn.setAttribute('role', 'alert'); $('#pages').before(warn); }
  const c = s.conflicts ?? [];
  warn.hidden = !c.length;
  warn.innerHTML = c.length ? `<b>⚠ 두 컴퓨터가 같은 파일을 동시에 고쳐 충돌 사본 ${c.length}개가 생겼어요.</b> 자동으로 지우지 않아요 — 어느 쪽을 남길지 PC9에게 알려 주세요.<ul>${c.map((x) => `<li><code>이미지교체/${esc(x)}</code></li>`).join('')}</ul>` : '';
  // R-1 등 안전 경고(도우미가 시작 때 확인)
  let safe = $('#safety');
  if (!safe) { safe = document.createElement('div'); safe.id = 'safety'; safe.className = 'conflicts'; safe.setAttribute('role', 'alert'); $('#pages').before(safe); }
  const w = s.warnings ?? [];
  safe.hidden = !w.length;
  safe.innerHTML = w.map((x) => `<b>⚠</b> ${esc(x)}`).join('<br>');
}

const es = new EventSource('/api/events');
es.addEventListener('slot.updated', async (ev) => {
  const d = JSON.parse(ev.data);
  versions[`${d.place ?? 'public'}:${d.key}`] = d.version;
  if ((d.place ?? 'public') !== data.place) return; // 다른 쪽(공개본 · 수정안) 소식은 표를 안 바꿈
  const st = await (await fetch(`/api/slots?${placeQ()}`)).json();
  data.states = st.states;
  rerenderRow(d.key);
});
// V5-1 S2 대책(약속 v1.4): 같은 칸을 거의 동시에 다른 컴퓨터가 바꿔서 내 것이 덮였을 때
es.addEventListener('slot.overwritten', async (ev) => {
  const d = JSON.parse(ev.data);
  toast(`${d.slotId}: 다른 컴퓨터(${d.by})가 방금 이 칸을 바꿨어요. 지금 상태는 그쪽 것이에요 — 내 그림을 쓰려면 다시 놓아 주세요(놓은 원본은 _시험 폴더에 그대로).`, true);
  if (data.place !== 'public') return; // 덮어씀 = 공유 _상태(공개본)만
  const st = await (await fetch('/api/slots?place=public')).json();
  data.states = st.states;
  rerenderRow(d.key);
});
// 놓을 곳이 바뀜(수정안이 켜짐 · 꺼짐 · 고름) → 그쪽 칸 목록 · 상태로 다시 그림
es.addEventListener('place.changed', () => load().then(() => toast(`놓을 곳: ${data.placeLabel}`)));
es.addEventListener('slot.selected', (ev) => { const d = JSON.parse(ev.data); if (d.from !== 'register' && d.key !== selected) select(d.key, false); });
es.addEventListener('register.rebuilt', (ev) => { const d = JSON.parse(ev.data); if (d.reason !== 'start') load(); });
es.addEventListener('helper.status', () => status());
es.addEventListener('helper.error', (ev) => { if (ev.data) { const d = JSON.parse(ev.data); if (d.message) toast(d.message, true); } });

await load();
await status();
setInterval(status, 10000);

$('#data').addEventListener('click', async () => {
  try {
    await api('/api/data-start');
    toast('데이터 화면(내장 DB)을 켜는 중이에요(1분쯤). 처음 한 번은 Windows "변경 허용" 창이 뜰 수 있어요 → [예](방화벽 규칙).');
    status();
  } catch (e) { toast(e.message, true); }
});

$('#update').addEventListener('click', async () => {
  const b = $('#update'); b.disabled = true; b.textContent = '최신으로 맞추는 중…';
  try {
    const r = await api('/api/update');
    toast(`사본 ${r.before} → ${r.after}${r.installed ? ' · 설치함' : ''} · 새 칸 ${r.added.length} · 없어진 칸 ${r.removed.length} · 옮긴 칸 ${r.moved.length} · 시험 그림 다시 끼움 ${r.reapplied.length}${r.lost.length ? ' · ⚠ 칸이 없어져 못 끼움: ' + r.lost.join(', ') : ''}`, r.lost.length > 0);
    await load();
  } catch (e) { toast(e.message, true); }
  b.disabled = false; b.textContent = '최신으로';
});
