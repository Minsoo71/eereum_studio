// content/media.ts 고치기(M5 · 글자 바꾸기만 · 다른 칸은 그대로)

/** 그 칸(key) 항목 안의 focus: '…'를 'x y'로 바꾼 새 글 · 못 찾으면 null */
export function setFocusInMedia(src, key, focus) {
  const start = src.indexOf(`'${key}':`);
  if (start < 0) return null;
  // 항목 끝 = 여는 { 와 짝이 맞는 }
  const open = src.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0; let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { end = i; break; }
  }
  if (end < 0) return null;
  const body = src.slice(open, end + 1);
  const value = `focus: '${focus.x} ${focus.y}'`;
  const nextBody = /focus:\s*'[^']*'/.test(body) ? body.replace(/focus:\s*'[^']*'/, value) : null;
  return nextBody ? src.slice(0, open) + nextBody + src.slice(end + 1) : null;
}
