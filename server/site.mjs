// 쇼핑몰 사본 켜기 · 끄기(공통 규칙 G0 11-18)
// ① API_ORIGIN = 사본 자기 API(4311)로 고정 — 빼면 사본이 4000(개발 API · DB)을 씀
// ② 웹은 --hostname localhost(같은 와이파이 · 방화벽 노출 X)
// ④ NODE_OPTIONS=--use-system-ca(백신 인증서) · 주소는 localhost
// 기본 = DB 없이(V4 (다) · 35칸 중 34칸) · 데이터 화면도 보려면 STUDIO_DB=1(내장 DB · prisma dev 0.16.28)
import { spawn, execFileSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from './config.mjs';
import { emit } from './events.mjs';
import { createSiteProxy } from '../preview/proxy.mjs';

let web = null;
let proxy = null;
let state = 'stopped';
const tail = [];

export function siteEnv() {
  return {
    ...process.env,
    API_ORIGIN: `http://localhost:${config.ports.api}`, // ① 고정(4000 금지)
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' '),
    // .env 값은 넘기지 않음(사본 폴더에는 .env가 없음 · 비밀값 0)
    DATABASE_URL: '', SESSION_SECRET: '', PORTONE_API_SECRET: '',
  };
}

export function startSite() {
  if (web) return;
  if (!existsSync(path.join(config.web, 'package.json'))) {
    state = 'failed';
    emit('helper.status', { site: 'failed', message: `쇼핑몰 사본이 없어요: ${config.site} (설치 스크립트를 먼저)` });
    return;
  }
  state = 'starting';
  emit('helper.status', { site: 'starting' });
  const nextBin = path.join(config.web, 'node_modules/next/dist/bin/next');
  web = spawn(process.execPath, [nextBin, 'dev', '--hostname', 'localhost', '--port', String(config.ports.siteDev)], { cwd: config.web, env: siteEnv(), windowsHide: true });
  const onLine = (b) => {
    const s = b.toString();
    tail.push(s); if (tail.length > 50) tail.shift();
    if (state === 'starting' && /Ready in|ready started|Local:/i.test(s)) {
      state = 'proxy';
      // 중계 4301 → next dev 4351 (사본 HTML에 미리보기 연결 스크립트 끼움 · PC11 preview/proxy.mjs)
      createSiteProxy({ listenPort: config.ports.site, targetPort: config.ports.siteDev, parentOrigin: config.helperOrigin })
        .then((p) => { proxy = p; state = 'ready'; emit('helper.status', { site: 'ready' }); })
        .catch((e) => { state = 'failed'; emit('helper.status', { site: 'failed', message: `중계(${config.ports.site})를 못 켬: ${e.code ?? e.message}` }); });
    }
  };
  web.stdout.on('data', onLine);
  web.stderr.on('data', onLine);
  web.on('exit', (code) => { web = null; state = 'stopped'; emit('helper.status', { site: 'failed', message: `사본이 꺼졌어요(코드 ${code})` }); });
}

export function stopSite() {
  proxy?.close().catch(() => {}); proxy = null;
  if (web) { web.kill(); web = null; }
  api?.kill(); api = null;
  if (db) stopData();
  state = 'stopped';
}

/** 내장 DB는 강제로 끄면 잠금 파일이 남아 다음 켜기가 실패함 → `prisma dev stop`으로 정상 종료 */
export function stopData() {
  const dbDir = path.join(config.site, 'packages/db');
  try {
    execFileSync(process.execPath, [path.join(dbDir, 'node_modules/prisma/build/index.js'), 'dev', `@${PRISMA_DEV_VERSION}`, 'stop', 'eereum_studio'], { cwd: dbDir, env: siteEnv(), stdio: 'ignore', timeout: 30000 });
  } catch { /* 이미 꺼짐 */ }
  db?.kill(); db = null;
}

// ── 데이터 화면도 보기(선택 · STUDIO_DB=1): 내장 DB(prisma dev @0.16.28 고정) + 사본 API(127.0.0.1:4311) ──
let api = null;
let db = null;
export const PRISMA_DEV_VERSION = '0.16.28';
const DB_URL = 'postgres://postgres:postgres@localhost:51214/template1?sslmode=disable&connection_limit=10&connect_timeout=0'; // 내 컴퓨터 안 내장 DB(비밀값 아님)

export async function startData() {
  const { spawn, execFileSync } = await import('node:child_process');
  const dbDir = path.join(config.site, 'packages/db');
  const prismaBin = path.join(dbDir, 'node_modules/prisma/build/index.js');
  const bin = path.join(dbDir, 'node_modules/.bin');
  const env = { ...siteEnv(), DATABASE_URL: DB_URL, PATH: [bin, process.env.PATH ?? process.env.Path].join(path.delimiter), Path: [bin, process.env.PATH ?? process.env.Path].join(path.delimiter) };
  const tryStart = () => new Promise((resolve, reject) => {
    db = spawn(process.execPath, [prismaBin, 'dev', `@${PRISMA_DEV_VERSION}`, '--name', 'eereum_studio', '--port', '51213', '--db-port', '51214', '--shadow-db-port', '51215'], { cwd: dbDir, env, windowsHide: true });
    let out = '';
    const t = setTimeout(() => reject(new Error('내장 DB가 60초 안에 안 켜졌어요.')), 60000);
    const on = (b) => { out += b.toString(); if (/is now running/.test(out)) { clearTimeout(t); resolve(); } };
    db.stdout.on('data', on); db.stderr.on('data', on);
    db.on('exit', (c) => { clearTimeout(t); reject(Object.assign(new Error(`내장 DB가 꺼졌어요(코드 ${c})`), { locked: /Lock file is already being held/.test(out) })); });
  });
  for (let i = 0; ; i++) {
    try { await tryStart(); break; } catch (e) {
      if (!e.locked || i >= 3) throw e;
      await new Promise((r) => setTimeout(r, 12000)); // 남은 잠금이 풀릴 때까지(약 10초)
    }
  }
  const prismaRun = (...a) => execFileSync(process.execPath, [prismaBin, ...a], { cwd: dbDir, env, stdio: 'ignore' });
  prismaRun('migrate', 'deploy');
  prismaRun('db', 'seed'); // 관리자 계정은 SEED_ADMIN_* 없으면 안 만듦(비밀값 0)
  const tsx = path.join(config.site, 'apps/api/node_modules/tsx/dist/loader.mjs');
  api = spawn(process.execPath, ['--import', pathToFileURL(tsx).href, path.join(path.dirname(fileURLToPath(import.meta.url)), 'api-local.mjs')], {
    cwd: path.join(config.site, 'apps/api'), env: { ...env, STUDIO_SITE: config.site, API_PORT: String(config.ports.api), APP_ENV: 'development' }, windowsHide: true,
  });
}

export const siteState = () => state;
export const siteLog = () => tail.join('').slice(-4000);

/** "최신으로"(M4): 사본을 원격(GitHub · 읽기만)의 같은 가지 최신으로 · 빨리 감기만(사본에서 바꾼 그림 파일은 먼저 원래대로 되돌려 둬야 함)
 *  돌려줌: { before, after, installed } */
export async function updateSite() {
  const { execFileSync } = await import('node:child_process');
  const git = (...a) => execFileSync('git', a, { cwd: config.site, encoding: 'utf8', env: siteEnv() }).trim();
  const before = git('rev-parse', '--short', 'HEAD');
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const dirty = git('status', '--porcelain', '--untracked-files=no');
  if (dirty) throw Object.assign(new Error(`사본에 바뀐 파일이 남아 있어요(되돌린 뒤 다시):\n${dirty}`), { code: 'DIRTY' });
  git('fetch', '--quiet', 'origin', branch);
  const lockBefore = git('rev-parse', 'HEAD:pnpm-lock.yaml');
  git('merge', '--ff-only', '--quiet', `origin/${branch}`);
  const after = git('rev-parse', '--short', 'HEAD');
  let installed = false;
  if (git('rev-parse', 'HEAD:pnpm-lock.yaml') !== lockBefore) {
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['install', '--frozen-lockfile'], { cwd: config.site, env: siteEnv(), stdio: 'ignore', shell: process.platform === 'win32' });
    installed = true;
  }
  return { before, after, branch, installed };
}

/** 사본의 이미지 최적화 캐시 지우기(V3: 같은 파일 이름이면 옛 그림을 계속 줌) */
export function clearImageCache() {
  rmSync(config.imageCache, { recursive: true, force: true });
}
