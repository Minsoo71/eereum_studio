import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devCommand, safeRef, listVariants } from '../../preview/variant.mjs';

test('devCommand: API_ORIGIN 필수 · 4000(개발 API) 금지 · localhost만 · 인증서 옵션 (G0 규칙 · PC11-V9)', () => {
  assert.throws(() => devCommand({ port: 4312 }), { code: 'NO_API_ORIGIN' });
  assert.throws(() => devCommand({ port: 4312, apiOrigin: 'http://localhost:4000' }), { code: 'DEV_API' });
  assert.throws(() => devCommand({ port: 4312, apiOrigin: 'http://127.0.0.1:4000/' }), { code: 'DEV_API' });
  const c = devCommand({ port: 4312, apiOrigin: 'http://localhost:4401' });
  assert.deepEqual(c.args, ['next', 'dev', '--hostname', 'localhost', '-p', '4312']);
  assert.equal(c.env.API_ORIGIN, 'http://localhost:4401');
  assert.match(c.env.NODE_OPTIONS, /^--use-system-ca --import=file:\S+\/server\/swc-guard\.mjs$/); // PC2-스튜디오-7: 수정안 사본도 swc 대역
});

test('safeRef: 이상한 브랜치 이름은 막음', () => {
  assert.equal(safeRef('pc1/story-names'), 'pc1/story-names');
  assert.equal(safeRef('pull/93/head'), 'pull/93/head');
  for (const bad of ['', '-x', 'a..b', 'a b', 'a;rm', '$(x)', 'x'.repeat(200)]) assert.throws(() => safeRef(bad), { code: 'BAD_REF' });
});

test('listVariants: PR refs + 브랜치(읽기만) · main 뺌 · PR 먼저', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'studio-variant-'));
  const origin = path.join(dir, 'origin.git');
  const work = path.join(dir, 'work');
  const g = (cwd, ...a) => execFileSync('git', a, { cwd, stdio: 'pipe' }).toString().trim();
  g(dir, 'init', '-q', '--bare', origin);
  g(dir, 'init', '-q', '-b', 'main', work);
  g(work, 'config', 'user.email', 'test@example.invalid');
  g(work, 'config', 'user.name', 'test');
  writeFileSync(path.join(work, 'a.txt'), '1');
  g(work, 'add', '.');
  g(work, 'commit', '-q', '-m', 'one');
  g(work, 'remote', 'add', 'origin', origin);
  // #93 = 열린 PR(merge ref 있음) · #7 = 닫힌 PR(head만)
  g(work, 'push', '-q', 'origin', 'main', 'main:refs/heads/pc1/story', 'main:refs/pull/93/head', 'main:refs/pull/93/merge', 'main:refs/pull/7/head');
  const open = await listVariants(work);
  assert.deepEqual(open.map((v) => v.id), ['pr-93'], '기본은 열린 PR만(PC8 B-2)');
  assert.equal(open[0].fetchRef, 'refs/pull/93/head');
  assert.equal(open[0].open, true);
  assert.equal(open[0].number, 93);
  assert.equal(open[0].branch, 'pc1/story', 'PR 브랜치 = 같은 커밋의 main 아닌 브랜치 하나(PC2-스튜디오-7 targetPR)');
  const all = await listVariants(work, { all: true });
  assert.deepEqual(all.map((v) => v.id), ['pr-93', 'pr-7', 'pc1/story']);
  assert.equal(all.find((v) => v.id === 'pr-7').open, false);
  assert.ok(!all.some((v) => v.id === 'main'));
});
