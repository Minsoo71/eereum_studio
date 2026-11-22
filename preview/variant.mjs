// 수정안 보기 (M6 · PC11 · V12 (가) 추천안): PR 브랜치를 내 컴퓨터 두 번째 사본으로 띄워 공개본과 나란히
// - GitHub는 읽기만(git ls-remote · git fetch) · push 0 · 로그인 · 비밀값 다루지 않음
// - 두 번째 사본 = 공개본 사본의 git worktree(디스크 · 시간 작음 · V12 측정: 3초 · 약 0.3GB)
// - 실행 명령에 G0 공통 규칙을 고정: API_ORIGIN = 사본 자기 API · --hostname localhost · NODE_OPTIONS=--use-system-ca
//   (API_ORIGIN을 빼면 사본이 localhost:4000 = 개발 API · DB를 씀 · PC11-V9 증명)
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createSiteProxy } from './proxy.mjs';

const run = promisify(execFile);
const git = (cwd, ...args) => run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024, windowsHide: true });

/** 브랜치 이름 검사: 영문 · 숫자 · / . _ - 만 (명령에 그대로 들어가므로) */
export function safeRef(ref) {
  if (typeof ref !== 'string' || !/^[A-Za-z0-9._\/-]{1,120}$/.test(ref) || ref.includes('..') || ref.startsWith('-'))
    throw Object.assign(new Error(`브랜치 이름이 이상함: ${ref}`), { code: 'BAD_REF' });
  return ref;
}

/**
 * 수정안 목록(읽기만 · git ls-remote). main은 공개본이므로 뺌.
 * 기본 = **열린 PR만**(PC8 B-2: 모든 브랜치면 385개) — GitHub는 열린 PR에만 refs/pull/N/merge를 남김(닫힌 PR은 지움)
 * all: true = 모든 PR · 모든 브랜치
 */
export async function listVariants(repoDir, { all = false } = {}) {
  const { stdout } = await git(repoDir, 'ls-remote', 'origin', 'refs/heads/*', 'refs/pull/*/head', 'refs/pull/*/merge');
  const lines = stdout.trim().split(/\r?\n/).map((l) => l.split('\t'));
  const open = new Set(lines.map(([, ref]) => ref?.match(/^refs\/pull\/(\d+)\/merge$/)?.[1]).filter(Boolean));
  // PC2-스튜디오-7: PR의 브랜치 이름(확정 요청 targetPR · M5가 그 브랜치에 커밋) = 같은 커밋을 가리키는 브랜치가 main 말고 딱 하나일 때만
  const heads = lines.filter(([, r]) => r?.startsWith('refs/heads/') && r !== 'refs/heads/main');
  const branchOf = (sha) => { const m = heads.filter(([s]) => s === sha); return m.length === 1 ? m[0][1].slice(11) : null; };
  const out = [];
  for (const [sha, ref] of lines) {
    if (!ref) continue;
    const pr = ref.match(/^refs\/pull\/(\d+)\/head$/);
    if (pr) {
      if (all || open.has(pr[1])) out.push({ kind: 'pr', id: `pr-${pr[1]}`, label: `#${pr[1]}`, number: Number(pr[1]), branch: branchOf(sha), open: open.has(pr[1]), fetchRef: ref, sha });
    } else if (all && ref.startsWith('refs/heads/') && ref !== 'refs/heads/main')
      out.push({ kind: 'branch', id: ref.slice(11), label: ref.slice(11), number: null, branch: ref.slice(11), fetchRef: ref, sha });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.label.localeCompare(a.label, 'en', { numeric: true }) : a.kind === 'pr' ? -1 : 1));
}

/** next dev 실행 명령 · 환경 (시험에서 확인 · G0 규칙 고정) */
export function devCommand({ port, apiOrigin }) {
  if (!apiOrigin) throw Object.assign(new Error('API_ORIGIN이 없음 — 사본이 개발 API(4000)를 쓰게 됨'), { code: 'NO_API_ORIGIN' });
  if (/localhost:4000\b|127\.0\.0\.1:4000\b/.test(apiOrigin))
    throw Object.assign(new Error('API_ORIGIN이 개발 API(4000)를 가리킴'), { code: 'DEV_API' });
  return {
    args: ['next', 'dev', '--hostname', 'localhost', '-p', String(port)],
    // PC2-스튜디오-7: 수정안 사본에도 swc 대역(스마트 앱 컨트롤 PC · server/swc-guard.mjs · 막힘 없으면 그대로)
    env: { API_ORIGIN: apiOrigin, NODE_OPTIONS: `--use-system-ca --import=${new URL('../server/swc-guard.mjs', import.meta.url).href}`, NEXT_TELEMETRY_DISABLED: '1' },
  };
}

/**
 * 수정안 사본 하나를 관리. start(ref) → 준비 · 실행 · 중계(4302) / stop() → 끔(비교를 닫으면 메모리 반납 · V12)
 * @param {{ repoDir: string, worktreeDir: string, apiOrigin: string, sitePort?: number, proxyPort?: number,
 *           parentOrigin?: string, onState?: (s: object) => void }} opts
 */
export function createVariantRunner(opts) {
  const { repoDir, worktreeDir, apiOrigin, sitePort = 4352, proxyPort = 4302, parentOrigin = 'http://localhost:4300' } = opts;
  const onState = opts.onState ?? (() => {});
  let child = null;
  let proxy = null;
  let current = null;

  async function prepare(fetchRef, variantId) {
    await git(repoDir, 'fetch', '--quiet', 'origin', `+${fetchRef}:refs/studio/variant`);
    if (!existsSync(worktreeDir)) await git(repoDir, 'worktree', 'add', '--detach', worktreeDir, 'refs/studio/variant');
    const before = existsSync(path.join(worktreeDir, 'pnpm-lock.yaml'))
      ? (await git(worktreeDir, 'rev-parse', 'HEAD:pnpm-lock.yaml').catch(() => ({ stdout: '' }))).stdout.trim()
      : '';
    await git(worktreeDir, 'checkout', '--quiet', '--detach', 'refs/studio/variant');
    const after = (await git(worktreeDir, 'rev-parse', 'HEAD:pnpm-lock.yaml')).stdout.trim();
    if (before !== after || !existsSync(path.join(worktreeDir, 'node_modules'))) {
      onState({ state: 'starting', variant: variantId, port: proxyPort, message: '패키지 맞추는 중(약 45초)' });
      await run('pnpm', ['install', '--offline', '--frozen-lockfile'], {
        cwd: worktreeDir,
        shell: process.platform === 'win32',
        env: { ...process.env, NODE_OPTIONS: '--use-system-ca' },
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      });
    }
  }

  function launch() {
    const { args, env } = devCommand({ port: sitePort, apiOrigin });
    child = spawn('npx', args, {
      cwd: path.join(worktreeDir, 'apps', 'web'),
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.on('exit', (code) => {
      if (child && current) onState({ state: 'failed', variant: current, message: `사본이 꺼짐(code ${code})` });
      child = null;
    });
  }

  async function waitReady(timeoutMs = 120000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      try {
        const r = await fetch(`http://localhost:${sitePort}/`, { signal: AbortSignal.timeout(5000) });
        if (r.status < 500) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  return {
    get current() {
      return current;
    },
    async start(variant) {
      safeRef(variant.fetchRef.replace(/^refs\//, ''));
      const fetchRef = variant.fetchRef;
      await this.stop();
      current = variant.id;
      onState({ state: 'starting', variant: current, port: proxyPort });
      try {
        await prepare(fetchRef, current);
        launch();
        if (!(await waitReady())) throw new Error('사본이 2분 안에 안 켜짐');
        proxy = await createSiteProxy({ listenPort: proxyPort, targetPort: sitePort, parentOrigin });
        onState({ state: 'ready', variant: current, port: proxyPort });
      } catch (err) {
        onState({ state: 'failed', variant: current, port: proxyPort, message: String(err.message || err) });
        await this.stop();
        throw err;
      }
    },
    async stop() {
      const was = current;
      current = null;
      if (proxy) await proxy.close().catch(() => {});
      proxy = null;
      if (child) {
        const c = child;
        child = null;
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(c.pid), '/T', '/F'], { windowsHide: true });
        else c.kill('SIGTERM');
      }
      if (was) onState({ state: 'stopped', variant: null });
    },
  };
}
