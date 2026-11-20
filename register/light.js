// 빛 효과 검사판 만들기(PC2-스튜디오-2 · 사용자 상시 규칙 "AI 영상은 0.5초 프레임 빛 효과 검사")
// - 대장 창(브라우저)이 시험 파일(/api/trial-file · 같은 출처)을 읽어 0.5초마다 프레임을 그려 PNG 한 장으로 만듦
//   → 사용자 PC에 ffmpeg 같은 프로그램을 더 깔지 않아도 됨(Edge · Chrome이 mp4를 그대로 읽음)
// - 빛 효과 의심(밝은 점이 갑자기 늘거나 · 화면이 갑자기 밝아짐)은 빨간 테두리로 표시 — 도움일 뿐, 판단은 사람이 함
// 순수 계산(frameTimes · findSuspects)은 node 시험에서도 부름(test/light.test.mjs)

export const INTERVAL = 0.5; // 초
export const MAX_FRAMES = 240; // 2분 영상까지(0.5초 × 240)

/** 0초부터 0.5초마다 · 마지막 프레임이 0.25초 넘게 남으면 끝 바로 앞도 한 장 */
export function frameTimes(duration, interval = INTERVAL) {
  if (!Number.isFinite(duration) || duration <= 0) return [0];
  const out = [];
  for (let i = 0; i * interval < duration - 0.01; i++) out.push(Math.round(i * interval * 1000) / 1000);
  const end = Math.max(0, Math.round((duration - 0.05) * 1000) / 1000);
  if (end - out[out.length - 1] > interval / 2) out.push(end);
  if (out.length > MAX_FRAMES) throw new Error(`영상이 너무 길어요(${Math.round(duration)}초). 2분 이하로 잘라 주세요.`);
  return out;
}

const sec = (t) => (Number.isInteger(t * 2) ? t.toFixed(1) : t.toFixed(2)); // 0.5초 칸은 7.5 · 끝 프레임은 7.95
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
/**
 * 빛 효과 의심 프레임 번호 · stats[i] = { mean: 평균 밝기 0~255, hi: 아주 밝은 점 비율 0~1 }
 * - 아주 밝은 점이 보통(가운데 값)보다 3%p 넘게 많음(번쩍임 · 빛 번짐)
 * - 평균 밝기가 보통보다 18 넘게 밝음 · 앞 프레임보다 20 넘게 갑자기 밝아짐(빛이 쓸고 지나감)
 */
export function findSuspects(stats) {
  if (stats.length < 2) return [];
  const mm = median(stats.map((s) => s.mean));
  const mh = median(stats.map((s) => s.hi));
  const out = [];
  stats.forEach((s, i) => {
    const jump = i > 0 ? s.mean - stats[i - 1].mean : 0;
    if (s.hi > mh + 0.03 || s.mean > mm + 18 || jump > 20) out.push(i);
  });
  return out;
}

// ── 아래는 브라우저에서만 ──
function frameStats(src, w, h) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = Math.max(1, Math.round((64 * h) / w));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    sum += y; if (y > 235) hi++;
  }
  const n = d.length / 4;
  return { mean: sum / n, hi: hi / n };
}
const once = (el, ev, ms = 8000) => new Promise((ok, bad) => {
  const t = setTimeout(() => bad(new Error('영상을 읽는 데 시간이 너무 걸려요.')), ms);
  el.addEventListener(ev, () => { clearTimeout(t); ok(); }, { once: true });
  el.addEventListener('error', () => { clearTimeout(t); bad(new Error('이 영상을 브라우저가 읽지 못해요(mp4 · H.264로 다시 내보내 주세요).')); }, { once: true });
});

/** 시험 파일 → 검사판 { blob, frames, duration, suspects } · kind = 'video' | 'image' */
export async function makeSheet({ src, kind, title = '', onProgress = () => {} }) {
  const FW = 320, COLS = 6, LABEL = 24, HEAD = 56, GAP = 6;
  const shots = []; let w = 16, h = 9, duration = 0, times = [0];
  if (kind === 'video') {
    const v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true; v.src = src;
    await once(v, 'loadeddata', 30000);
    duration = v.duration; w = v.videoWidth; h = v.videoHeight;
    times = frameTimes(duration);
    for (let i = 0; i < times.length; i++) {
      if (Math.abs(v.currentTime - times[i]) > 0.001 || i > 0) { v.currentTime = times[i]; await once(v, 'seeked'); }
      const c = document.createElement('canvas'); c.width = FW; c.height = Math.round((FW * h) / w);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      shots.push({ canvas: c, stats: frameStats(v, w, h) });
      onProgress(i + 1, times.length);
    }
  } else {
    const img = new Image(); img.src = src;
    await img.decode().catch(() => { throw new Error('이 그림을 브라우저가 읽지 못해요.'); });
    w = img.naturalWidth; h = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = Math.min(FW * 3, w); c.height = Math.round((c.width * h) / w);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    shots.push({ canvas: c, stats: frameStats(img, w, h) });
  }
  const suspects = findSuspects(shots.map((s) => s.stats));
  const cols = Math.min(COLS, shots.length);
  const cw = shots[0].canvas.width, ch = shots[0].canvas.height;
  const rows = Math.ceil(shots.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cw + (cols + 1) * GAP;
  sheet.height = HEAD + rows * (ch + LABEL) + (rows + 1) * GAP;
  const x = sheet.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, sheet.width, sheet.height);
  x.fillStyle = '#151a1b'; x.font = 'bold 18px "Malgun Gothic", sans-serif'; x.textBaseline = 'top';
  x.fillText(`빛 효과 검사판 · ${title}`, GAP + 4, 8);
  x.font = '14px "Malgun Gothic", sans-serif'; x.fillStyle = '#616a6c';
  x.fillText(kind === 'video' ? `영상 ${duration.toFixed(1)}초 · ${INTERVAL}초마다 ${shots.length}장 · 의심 ${suspects.length}장(빨간 테두리) · ${new Date().toLocaleString('ko-KR')}` : `그림 1장 · 의심 ${suspects.length} · ${new Date().toLocaleString('ko-KR')}`, GAP + 4, 32);
  shots.forEach((s, i) => {
    const cx = GAP + (i % cols) * (cw + GAP), cy = HEAD + GAP + Math.floor(i / cols) * (ch + LABEL + GAP);
    x.drawImage(s.canvas, cx, cy);
    const bad = suspects.includes(i);
    if (bad) { x.strokeStyle = '#d0021b'; x.lineWidth = 4; x.strokeRect(cx + 2, cy + 2, cw - 4, ch - 4); }
    x.fillStyle = bad ? '#d0021b' : '#151a1b'; x.font = `${bad ? 'bold ' : ''}13px "Malgun Gothic", sans-serif`;
    x.fillText(kind === 'video' ? `${sec(times[i])}초${bad ? ' · 의심' : ''}` : bad ? '의심' : '', cx + 2, cy + ch + 5);
  });
  const blob = await new Promise((ok) => sheet.toBlob(ok, 'image/png'));
  return { blob, frames: shots.length, duration: kind === 'video' ? duration : null, suspects: suspects.map((i) => (kind === 'video' ? times[i] : 0)), interval: INTERVAL };
}
