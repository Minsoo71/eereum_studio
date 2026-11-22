// M5 --target-pr 안전장치 (PC2-스튜디오-8 · PC6-C 판 9 R-2 · R-3)
// - 브랜치는 요청 .json을 믿지 않고 GitHub(gh pr view)에서 얻음 · .json의 branch · sha는 비교용만
// - 열린 PR만 · 다른 저장소(포크) PR X · main · master · 기본 브랜치 · base와 같은 브랜치 X
// - 브랜치 이름은 허용 문자만 · git 호출은 모두 `--` / `--end-of-options`로 옵션 끝 표시(이름이 옵션으로 읽히지 않게)
// - 작업 폴더는 되감지 않음(-B X): 로컬 브랜치가 있으면 빨리 감기만 · 로컬이 앞서 있으면 멈춤
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export class TargetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const stop = (code, msg) => { throw new TargetError(code, msg); };

const PROTECTED = new Set(['main', 'master', 'HEAD']);

/** 브랜치 이름 검사(허용 문자 · `-`로 시작 X · `..` X · 끝이 / . .lock X · 빈 칸 X) */
export function checkBranchName(b) {
  const s = String(b ?? '');
  if (!/^[A-Za-z0-9._/-]{1,200}$/.test(s) || s.startsWith('-') || s.startsWith('/') || s.includes('..') || s.includes('//') || /[/.]$/.test(s) || s.endsWith('.lock') || s.split('/').some((p) => p.startsWith('.'))) {
    stop('BAD_BRANCH', `브랜치 이름이 이상해요: ${JSON.stringify(s).slice(0, 80)} → 처리하지 않음`);
  }
  return s;
}

/** GitHub에서 PR 정보 읽기(읽기만) */
export function ghPrView(repo, number) {
  if (!Number.isInteger(number) || number <= 0) stop('BAD_PR', `PR 번호가 이상해요: ${number}`);
  let out;
  try {
    out = execFileSync('gh', ['pr', 'view', String(number), '--json', 'number,state,headRefName,baseRefName,headRefOid,isCrossRepository'], { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    stop('GH', `GitHub에서 PR #${number}을 읽지 못했어요(gh 로그인 · 번호 확인): ${String(e.stderr ?? e.message).trim().slice(0, 200)}`);
  }
  return JSON.parse(out);
}

/**
 * 요청들과 GitHub PR 정보를 맞춰 봄 → 커밋할 브랜치 · PR 끝(sha)
 * @param {{ number: number, requests: { file: string, meta: any }[], pr: { number, state, headRefName, baseRefName, headRefOid, isCrossRepository }, defaultBranch?: string, acceptNewHead?: boolean }} o
 */
export function resolveTarget({ number, requests, pr, defaultBranch = 'main', acceptNewHead = false }) {
  if (!pr || Number(pr.number) !== Number(number)) stop('PR_MISMATCH', `GitHub PR 정보가 #${number}이 아니에요.`);
  if (pr.state !== 'OPEN') stop('PR_NOT_OPEN', `PR #${number}은 ${pr.state === 'MERGED' ? '이미 합쳐졌어요' : '닫혔어요'}(${pr.state}) → 그 브랜치에 넣지 않음 · 공개본으로 다시 확정해 주세요.`);
  if (pr.isCrossRepository) stop('PR_FORK', `PR #${number}은 다른 저장소(포크)에서 왔어요 → 넣지 않음.`);
  const branch = checkBranchName(pr.headRefName);
  const blocked = new Set([...PROTECTED, defaultBranch, pr.baseRefName].filter(Boolean));
  if (blocked.has(branch)) stop('PROTECTED_BRANCH', `PR #${number}의 브랜치가 ${branch}예요(main · 기본 · base 브랜치) → 넣지 않음.`);
  if (!/^[0-9a-f]{40}$/.test(String(pr.headRefOid))) stop('PR_SHA', `PR #${number}의 끝 커밋을 알 수 없어요.`);
  const wrongBranch = requests.filter((r) => r.meta?.targetPR?.branch !== branch);
  if (wrongBranch.length) stop('BRANCH_MISMATCH', `요청에 적힌 브랜치가 PR #${number}의 진짜 브랜치(${branch})와 달라요 → 처리하지 않음:\n${wrongBranch.map((r) => `  - ${r.file}: ${JSON.stringify(String(r.meta?.targetPR?.branch ?? '(없음)')).slice(0, 80)}`).join('\n')}`);
  const moved = requests.filter((r) => r.meta?.targetPR?.sha && r.meta.targetPR.sha !== pr.headRefOid);
  if (moved.length && !acceptNewHead) {
    stop('HEAD_MOVED', `확인 필요: 확정한 뒤 PR #${number}에 새 커밋이 올라왔어요(확정 때 ${moved.map((r) => String(r.meta.targetPR.sha).slice(0, 7)).join(', ')} → 지금 ${pr.headRefOid.slice(0, 7)}).\n  새 PR 화면에서도 그 그림이 맞는지 본 뒤 --accept-new-head를 붙여 다시 돌리거나, 대장에서 다시 확정해 주세요.`);
  }
  return { branch, headSha: pr.headRefOid, moved: moved.map((r) => r.file) };
}

const defaultGit = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** origin의 기본 브랜치 이름(모르면 main) */
export function defaultBranchOf(repo, git = defaultGit) {
  try { return git(repo, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, '') || 'main'; } catch { return 'main'; }
}

/**
 * PR 브랜치 작업 폴더 준비(되감기 없음)
 * - origin에서 그 브랜치만 받음(`--` 뒤 refspec) → 끝이 GitHub PR 끝(headSha)과 같아야
 * - 로컬 브랜치 없음 → origin 끝에서 새로 · 있음 → 빨리 감기만(로컬이 앞서 있거나 갈라졌으면 멈춤)
 */
export function preparePrWorktree({ repo, wt, branch, headSha, git = defaultGit }) {
  checkBranchName(branch);
  const remoteRef = `refs/remotes/origin/${branch}`;
  const localRef = `refs/heads/${branch}`;
  try { git(repo, 'fetch', '--quiet', '--no-tags', 'origin', '--', `+${localRef}:${remoteRef}`); } catch (e) {
    stop('FETCH', `origin에서 ${branch} 브랜치를 받지 못했어요: ${String(e.stderr ?? e.message).trim().slice(0, 200)}`);
  }
  const tip = git(repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${remoteRef}^{commit}`);
  if (headSha && tip !== headSha) stop('HEAD_DIFF', `확인 필요: origin의 ${branch} 끝(${tip.slice(0, 7)})이 GitHub PR 끝(${headSha.slice(0, 7)})과 달라요.`);
  let local = null;
  try { local = git(repo, 'rev-parse', '--verify', '--quiet', '--end-of-options', `${localRef}^{commit}`); } catch { local = null; }
  if (local && local !== tip) {
    let behind = true;
    try { git(repo, 'merge-base', '--is-ancestor', '--end-of-options', local, tip); } catch { behind = false; }
    if (!behind) stop('LOCAL_AHEAD', `이 컴퓨터의 ${branch} 브랜치에 origin에 없는 커밋이 있어요(앞서 있거나 갈라짐) → 되감지 않고 멈춤. 먼저 그 커밋을 확인해 주세요(앞 M5 실행 결과를 아직 push하지 않았을 수 있음).`);
  }
  if (!existsSync(wt)) {
    if (local) git(repo, 'worktree', 'add', '--quiet', '--', wt, branch);
    else git(repo, 'worktree', 'add', '--quiet', '-b', branch, '--', wt, remoteRef);
  } else {
    if (git(wt, 'status', '--porcelain')) stop('WT_DIRTY', `작업 폴더 ${wt}에 커밋 안 한 변경이 있어요 → 멈춤.`);
    if (local) git(wt, 'checkout', '--quiet', branch, '--');
    else git(wt, 'checkout', '--quiet', '-b', branch, remoteRef, '--');
  }
  git(wt, 'merge', '--quiet', '--ff-only', '--end-of-options', remoteRef); // 빨리 감기만(되감기 X)
  const now = git(wt, 'rev-parse', 'HEAD');
  if (now !== tip) stop('WT_HEAD', `작업 폴더가 PR 끝(${tip.slice(0, 7)})에 있지 않아요(${now.slice(0, 7)}) → 멈춤.`);
  return { tip };
}
