// 휴대폰 자르기 초점 (PC11-스튜디오-3 · 사용자 승인 11-19 11:36)
// 그림을 놓은 뒤 미리보기에서 "꼭 보여야 할 점"을 누르면 → 휴대폰 비율로 자를 때 그 점을 남긴다.
// - 점 = { x, y } (0~1 · 그림 왼쪽 위가 0,0) · 기본 = 가운데(0.5, 0.5)
// - 휴대폰 파일이 따로 있는 칸(separate-file): 그 파일을 휴대폰 비율로 다시 자름
// - 한 파일을 같이 쓰는 칸: 화면이 CSS로 자르므로 object-position만 바꿔 보여 줌(사이트 media.ts focus와 같은 뜻)
// 계산만 있는 부분은 node · 브라우저 모두에서 씀(패키지 없음)

export const CENTER = Object.freeze({ x: 0.5, y: 0.5 });

/** "5:4" · "1.37:1" · "1200:630" · "88:100" → 가로/세로 (못 읽으면 null) */
export function parseRatio(text) {
  const m = String(text ?? '').match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const r = Number(m[1]) / Number(m[2]);
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** 휴대폰 자르기 비율: 휴대폰 파일 크기 → spec.displayRatio의 "모바일 a:b" → null(자를 비율 없음) */
export function mobileRatio(slot) {
  const m = slot?.current?.mobile;
  if (m?.width && m?.height) return m.width / m.height;
  const d = String(slot?.spec?.displayRatio ?? '').match(/모바일\s*(\d+(?:\.\d+)?\s*:\s*\d+(?:\.\d+)?)/);
  return d ? parseRatio(d[1]) : null;
}

/** 휴대폰 파일이 따로 있는 칸인가(있으면 파일을 다시 자름 · 없으면 object-position만) */
export const hasMobileFile = (slot) => Boolean(slot?.current?.mobile);

/** 점 바로잡기: 숫자 아님 → 가운데 · 0~1 밖 → 끝으로 · 소수 셋째 자리 */
export function clampFocus(f) {
  const one = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.5;
    return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
  };
  return { x: one(f?.x), y: one(f?.y) };
}

/** media.ts focus 글자("center" · "top" · "0.97 0.5") → 점 */
export function parseFocus(text) {
  const t = String(text ?? 'center').trim();
  if (t === 'top') return { x: 0.5, y: 0 };
  if (t === 'bottom') return { x: 0.5, y: 1 };
  const m = t.match(/^(-?\d*\.?\d+)\s+(-?\d*\.?\d+)$/);
  return m ? clampFocus({ x: m[1], y: m[2] }) : { ...CENTER };
}

/** 점 → CSS object-position 글자 */
export const focusToCss = (f) => `${Math.round(clampFocus(f).x * 1000) / 10}% ${Math.round(clampFocus(f).y * 1000) / 10}%`;

/**
 * w×h 그림에서 ratio(가로/세로) 상자 중 가장 큰 것을, 점이 가운데에 오도록(끝에 닿으면 밀어서) 자를 자리.
 * 정수 픽셀 · 항상 그림 안.
 */
export function cropBox(w, h, ratio, focus = CENTER) {
  const f = clampFocus(focus);
  let cw = w;
  let ch = Math.round(w / ratio);
  if (ch > h) {
    ch = h;
    cw = Math.round(h * ratio);
  }
  cw = Math.max(1, Math.min(w, cw));
  ch = Math.max(1, Math.min(h, ch));
  const left = Math.round(Math.min(w - cw, Math.max(0, f.x * w - cw / 2)));
  const top = Math.round(Math.min(h - ch, Math.max(0, f.y * h - ch / 2)));
  return { left, top, width: cw, height: ch };
}

/**
 * 놓은 원본을 휴대폰 비율로 자른 그림(Buffer) — 방향 바로잡은 뒤의 크기로 계산.
 * sharp는 부르는 쪽(도우미)이 넘김(미리보기 창 · 시험이 sharp 없이도 이 파일을 읽게)
 */
export async function cropForMobile(sharp, buf, ratio, focus = CENTER) {
  const upright = await sharp(buf, { failOn: 'none' }).rotate().toBuffer({ resolveWithObject: true });
  const { width, height } = upright.info;
  const box = cropBox(width, height, ratio, focus);
  const data = await sharp(upright.data, { failOn: 'none' }).extract(box).toBuffer();
  return { data, box, width, height };
}
