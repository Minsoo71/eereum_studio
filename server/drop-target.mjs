// 놓을 자리(PC2-스튜디오-9 · 휴대폰 히어로에 세로 영상): both | pc | mobile | auto(대장 기본)
// auto = 휴대폰 · PC 파일이 따로 있는 칸에 **세로 영상**(높이 > 폭 · 예 1080×2340)이면 휴대폰만 · 그 밖은 둘 다

export const TARGETS = ['both', 'pc', 'mobile', 'auto'];

/** @returns {{ target: 'both'|'pc'|'mobile', auto: boolean }} */
export function resolveTarget(wanted, info, slot) {
  const t = TARGETS.includes(wanted) ? wanted : 'both';
  if (t !== 'auto') return { target: t, auto: false };
  const portrait = info?.media === 'video' && info.width > 0 && info.height > info.width;
  return { target: portrait && slot?.current?.mobile ? 'mobile' : 'both', auto: true };
}

/** 세로 영상을 알아서 휴대폰만으로 넣었을 때 대장에 보일 알림 */
export function autoMobileNote(info) {
  return `세로 영상(${info.width}×${info.height})이라 휴대폰 화면에만 보여요. PC에도 보이게 하려면 놓을 자리를 "PC · 모바일 둘 다"로 골라 다시 놓아 주세요.`;
}
