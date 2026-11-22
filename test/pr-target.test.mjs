// M5 --target-pr 안전장치 (PC2-스튜디오-8 · PC6-C 판 9 경우 0 · A · B · C · D · E → 정상만 통과)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkBranchName, resolveTarget, preparePrWorktree, defaultBranchOf } from '../server/pr-target.mjs';

const g = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe', encoding: 'utf8' }).trim();
const SHA = 'a'.repeat(40);
const pr = (over = {}) => ({ number: 101, state: 'OPEN', headRefName: 'pc1/pr-101', baseRefName: 'main', headRefOid: SHA, isCrossRepository: false, ...over });
const req = (branch, sha = SHA, file = 'P01-01_x_pr101_a.jpg') => ({ file, meta: { key: 'home.hero', targetPR: { id: 'pr-101', number: 101, branch, sha } } });
const code = (fn) => { try { fn(); return 'OK'; } catch (e) { return e.code ?? e.message; } };

test('경우 0 정상: 브랜치 = GitHub PR 브랜치 · .json과 같음 → 통과', () => {
  const t = resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr() });
  assert.equal(t.branch, 'pc1/pr-101');
  assert.equal(t.headSha, SHA);
});

test('경우 A main: .json이 main이면 멈춤 · PR 브랜치 자체가 main/기본/base면 멈춤', () => {
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('main')], pr: pr() })), 'BRANCH_MISMATCH');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('main')], pr: pr({ headRefName: 'main' }) })), 'PROTECTED_BRANCH');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('dev')], pr: pr({ headRefName: 'dev' }), defaultBranch: 'dev' })), 'PROTECTED_BRANCH');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('release')], pr: pr({ headRefName: 'release', baseRefName: 'release' }) })), 'PROTECTED_BRANCH');
});

test('경우 B 번호 ≠ 브랜치: 남의 PR 브랜치면 멈춤(하나라도)', () => {
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc7/pr-102')], pr: pr() })), 'BRANCH_MISMATCH');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101'), req('pc7/pr-102', SHA, 'b.jpg')], pr: pr() })), 'BRANCH_MISMATCH');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr({ number: 102 }) })), 'PR_MISMATCH');
});

test('경우 C · D: 옵션 같은 이름 · 경로 같은 이름은 이름 검사에서 멈춤(git을 부르기 전)', () => {
  for (const bad of ['--upload-pack=echo PWNED > x; git-upload-pack', '-x', '../../evil', 'a/../b', '.hidden', 'a/.b', 'x.lock', 'a b', 'a;b', '$(x)', 'a//b', 'a/', '', 'HEAD:main']) {
    assert.equal(code(() => checkBranchName(bad)), 'BAD_BRANCH', bad);
  }
  for (const ok of ['pc1/pr-101', 'pc1/hero-fullbleed', 'laptop/s9-locale_base.2']) assert.equal(checkBranchName(ok), ok);
  // GitHub이 이상한 이름을 줘도 멈춤
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('--upload-pack=x')], pr: pr({ headRefName: '--upload-pack=x' }) })), 'BAD_BRANCH');
  // .json만 이상하면 = 브랜치 다름으로 멈춤(.json 값은 git에 안 감)
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('../../evil')], pr: pr() })), 'BRANCH_MISMATCH');
});

test('닫힘 · 합쳐짐 · 포크 PR · 끝 커밋 모름 → 멈춤', () => {
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr({ state: 'MERGED' }) })), 'PR_NOT_OPEN');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr({ state: 'CLOSED' }) })), 'PR_NOT_OPEN');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr({ isCrossRepository: true }) })), 'PR_FORK');
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101')], pr: pr({ headRefOid: 'x' }) })), 'PR_SHA');
});

test('확정 뒤 PR에 새 커밋(.json sha ≠ PR 끝) → "확인 필요"로 멈춤 · --accept-new-head면 진행', () => {
  const old = 'b'.repeat(40);
  assert.equal(code(() => resolveTarget({ number: 101, requests: [req('pc1/pr-101', old)], pr: pr() })), 'HEAD_MOVED');
  assert.match((() => { try { resolveTarget({ number: 101, requests: [req('pc1/pr-101', old)], pr: pr() }); } catch (e) { return e.message; } })(), /^확인 필요/);
  const t = resolveTarget({ number: 101, requests: [req('pc1/pr-101', old)], pr: pr(), acceptNewHead: true });
  assert.deepEqual(t.moved, ['P01-01_x_pr101_a.jpg']);
});

function origin() {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-prt-'));
  const bare = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  g(dir, 'init', '-q', '--bare', '-b', 'main', bare);
  g(dir, 'init', '-q', '-b', 'main', work);
  g(work, 'config', 'user.email', 'test@example.invalid');
  g(work, 'config', 'user.name', 'test');
  writeFileSync(path.join(work, 'a.txt'), '1');
  g(work, 'add', '.');
  g(work, 'commit', '-q', '-m', 'one');
  g(work, 'checkout', '-q', '-b', 'pc1/pr-101');
  writeFileSync(path.join(work, 'b.txt'), '2');
  g(work, 'add', '.');
  g(work, 'commit', '-q', '-m', 'pr');
  g(work, 'remote', 'add', 'origin', bare);
  g(work, 'push', '-q', 'origin', 'main', 'pc1/pr-101');
  const repo = path.join(dir, 'repo');
  g(dir, 'clone', '-q', bare, repo);
  g(repo, 'config', 'user.email', 'test@example.invalid');
  g(repo, 'config', 'user.name', 'test');
  return { dir, work, repo, head: g(work, 'rev-parse', 'HEAD') };
}

test('작업 폴더: 정상 = PR 끝에 · 옵션 같은 이름은 git 실행 전 멈춤(파일 안 생김) · origin에 없는 이름(경우 E) 멈춤', () => {
  const o = origin();
  const wt = path.join(o.dir, 'wt');
  assert.deepEqual(preparePrWorktree({ repo: o.repo, wt, branch: 'pc1/pr-101', headSha: o.head }), { tip: o.head });
  assert.equal(g(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'pc1/pr-101');
  const flag = path.join(o.dir, 'PWNED.txt');
  assert.equal(code(() => preparePrWorktree({ repo: o.repo, wt: path.join(o.dir, 'wt2'), branch: `--upload-pack=echo PWNED > ${flag}; git-upload-pack` })), 'BAD_BRANCH');
  assert.ok(!existsSync(flag), '명령이 실행되지 않음');
  assert.equal(code(() => preparePrWorktree({ repo: o.repo, wt: path.join(o.dir, 'wt3'), branch: 'pc6/local-work' })), 'FETCH');
  assert.equal(code(() => preparePrWorktree({ repo: o.repo, wt: path.join(o.dir, 'wt4'), branch: 'pc1/pr-101', headSha: 'c'.repeat(40) })), 'HEAD_DIFF');
  assert.equal(defaultBranchOf(o.repo), 'main');
});

test('되감기 없음: 로컬이 뒤면 빨리 감기 · 로컬이 앞서 있으면 멈춤(커밋 그대로) · main은 그대로', () => {
  const o = origin();
  const wt = path.join(o.dir, 'wt');
  preparePrWorktree({ repo: o.repo, wt, branch: 'pc1/pr-101', headSha: o.head });
  // origin에 새 커밋 → 다시 준비하면 빨리 감기
  writeFileSync(path.join(o.work, 'c.txt'), '3');
  g(o.work, 'add', '.');
  g(o.work, 'commit', '-q', '-m', 'pr2');
  g(o.work, 'push', '-q', 'origin', 'pc1/pr-101');
  const head2 = g(o.work, 'rev-parse', 'HEAD');
  assert.equal(preparePrWorktree({ repo: o.repo, wt, branch: 'pc1/pr-101', headSha: head2 }).tip, head2);
  assert.equal(g(wt, 'rev-parse', 'HEAD'), head2);
  // 로컬 M5 커밋(아직 push 안 함) → 다음 실행은 되감지 않고 멈춤
  writeFileSync(path.join(wt, 'm5.txt'), 'img');
  g(wt, 'add', '.');
  g(wt, 'commit', '-q', '-m', 'm5');
  const mine = g(wt, 'rev-parse', 'HEAD');
  assert.equal(code(() => preparePrWorktree({ repo: o.repo, wt, branch: 'pc1/pr-101', headSha: head2 })), 'LOCAL_AHEAD');
  assert.equal(g(wt, 'rev-parse', 'HEAD'), mine, '내 커밋이 그대로');
  assert.equal(readFileSync(path.join(wt, 'm5.txt'), 'utf8'), 'img');
  assert.equal(g(o.repo, 'rev-parse', 'main'), g(o.repo, 'rev-parse', 'origin/main'), 'main은 안 건드림');
});
