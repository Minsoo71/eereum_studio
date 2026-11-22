// M5 요청 나누기(PC2-스튜디오-7): 공개본 요청(targetPR 없음) / 수정안 요청(targetPR = 그 PR 브랜치에 커밋)
// - 기본 실행(--target-pr 없음) = 공개본 요청만 · 수정안 요청은 남겨 두고 "--target-pr N으로" 알려 줌
// - --target-pr N = 그 PR 요청만 · 브랜치는 요청 .json의 targetPR.branch(모두 같아야)

/** @param {{ meta?: { targetPR?: { number?: number, branch?: string } } | null }[]} requests
 *  @param {number | null} targetPR */
export function splitByTarget(requests, targetPR = null) {
  const prOf = (r) => r.meta?.targetPR ?? null;
  if (targetPR == null) {
    const chosen = requests.filter((r) => !prOf(r));
    const waiting = new Map(); // 나온 차례대로
    for (const r of requests.filter(prOf)) {
      const n = prOf(r).number ?? '?';
      if (!waiting.has(n)) waiting.set(n, { number: n, branch: prOf(r).branch ?? null, files: [] });
      waiting.get(n).files.push(r.file);
    }
    return { chosen, branch: null, waiting: [...waiting.values()], problems: [] };
  }
  const chosen = requests.filter((r) => Number(prOf(r)?.number) === Number(targetPR));
  const branches = [...new Set(chosen.map((r) => prOf(r).branch).filter(Boolean))];
  const problems = [];
  if (chosen.length && branches.length !== 1) problems.push(`#${targetPR} 요청의 브랜치가 ${branches.length ? branches.join(', ') + '로 여러 개' : '없어요'} → 대장에서 그 PR을 다시 열고 다시 확정해 주세요.`);
  return { chosen, branch: branches.length === 1 ? branches[0] : null, waiting: [], problems };
}
