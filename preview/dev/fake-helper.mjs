#!/usr/bin/env node
// 시험용 가짜 도우미 (PC11 · 약속 v1.1 contract/events.md 흉내) — 진짜 도우미(PC9 · server/)가 붙기 전 미리보기 시험용.
// 쓰는 법(eereum_studio 저장소 맨 위에서):
//   node preview/dev/fake-helper.mjs                                   → 시험 페이지(칸 상자 + data-slot) 모드
//   node preview/dev/fake-helper.mjs --site-port 4351                  → 켜 둔 쇼핑몰 사본(next dev 4351)을 중계(4301)
//   ... --repo D:/eereum_studio/site --api-origin http://localhost:4311 → 수정안 보기(4302 · next dev 4352)도 진짜로
//   --site-dir D:/eereum_studio/site  → 시험 페이지 그림(apps/web/public/media)을 읽을 쇼핑몰 사본(기본값)
// 열기: http://localhost:4300/preview   · 시험 신호: POST /api/select {key} · POST /api/dev/drop {key}
// localhost에서만 열림 · 비밀값 · push 0
import http from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSiteProxy } from '../proxy.mjs';
import { listVariants, createVariantRunner } from '../variant.mjs';
import { testPageHtml } from './test-site.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? dflt : process.argv[i + 1];
};
const SITE_DIR = arg('site-dir', arg('repo', 'D:/eereum_studio/site'));
const HELPER_PORT = Number(arg('port', 4300));
const SITE_PORT = Number(arg('site-port', 0)); // 0 = 시험 페이지
const PUBLIC_PORT = 4301;
const REPO = arg('repo', '');
const API_ORIGIN = arg('api-origin', '');
const PARENT = `http://localhost:${HELPER_PORT}`;
const contract = JSON.parse(readFileSync(path.join(here, '../../contract/slots.sample.json'), 'utf8'));

/* ---------- SSE ---------- */
const clients = new Set();
let seq = 0;
function emit(event, data) {
  const msg = { v: 1, at: new Date().toISOString(), from: 'helper', seq: ++seq, ...data };
  const line = `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(msg)}\n\n`;
  for (const c of clients) c.write(line);
  console.log(`[signal] ${event}`, JSON.stringify(data));
}
setInterval(() => {
  for (const c of clients) c.write('event: ping\ndata: {}\n\n');
}, 15000).unref();

/* ---------- 수정안 ---------- */
let variants = [];
const runner = REPO && API_ORIGIN
  ? createVariantRunner({
      repoDir: REPO,
      worktreeDir: path.join(path.dirname(REPO), 'variant'),
      apiOrigin: API_ORIGIN,
      parentOrigin: PARENT,
      onState: (s) => emit('variant.changed', { variant: s.variant ?? null, port: 4302, state: s.state, message: s.message }),
    })
  : null;

/* ---------- 정적 파일 ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
function sendFile(res, file) {
  if (!existsSync(file) || !statSync(file).isFile()) return notFound(res);
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}
const notFound = (res) => (res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }), res.end('not found'));
const json = (res, code, body) => (res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }), res.end(JSON.stringify(body)));
const fail = (res, code, message, status = 400) => json(res, status, { ok: false, error: { code, message } });
const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        resolve(s ? JSON.parse(s) : {});
      } catch {
        resolve({});
      }
    });
  });

/* ---------- 도우미 ---------- */
const helper = http.createServer(async (req, res) => {
  const url = new URL(req.url, PARENT);
  const p = url.pathname;
  if (p === '/' || p === '/preview' || p === '/preview/') return sendFile(res, path.join(here, '../public/index.html'));
  if (p.startsWith('/preview/') || ['/preview.js', '/preview.css'].includes(p))
    return sendFile(res, path.join(here, '../public', path.basename(p)));
  if (p === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': hello\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    emit('helper.status', { site: 'ready', repoCommit: contract.source?.repoCommit ?? 'sample', message: SITE_PORT ? '사본 중계' : '시험 페이지' });
    return;
  }
  if (p === '/api/preview-config') return json(res, 200, { ok: true, siteOrigin: `http://localhost:${PUBLIC_PORT}`, variantOrigin: 'http://localhost:4302' });
  if (p === '/api/slots') return json(res, 200, { ok: true, version: contract.version, pages: contract.pages, slots: contract.slots });
  if (p === '/api/variants') {
    if (!REPO) return json(res, 200, { ok: true, variants: [{ id: 'demo', label: '#0', title: '(시험) --repo 를 주면 진짜 PR 목록' }] });
    try {
      variants = await listVariants(REPO);
      return json(res, 200, { ok: true, variants });
    } catch (err) {
      return fail(res, 'GIT', String(err.message), 500);
    }
  }
  if (req.method !== 'POST') return notFound(res);
  const body = await readBody(req);
  if (p === '/api/select') {
    if (!contract.slots.some((s) => s.key === body.key)) return fail(res, 'UNKNOWN_SLOT', `칸 목록에 없음: ${body.key}`);
    emit('slot.selected', { key: body.key, slotId: contract.slots.find((s) => s.key === body.key).slotId });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/locale') {
    emit('preview.locale', { locale: body.locale });
    return json(res, 200, { ok: true });
  }
  if (p === '/api/variant') {
    json(res, 200, { ok: true });
    if (!runner) {
      emit('variant.changed', body.variant ? { variant: body.variant, port: 4302, state: 'failed', message: '시험 모드: --repo · --api-origin 을 주면 진짜로 켬' } : { variant: null, port: 4302, state: 'stopped' });
      return;
    }
    if (!body.variant) return runner.stop();
    const v = variants.find((x) => x.id === body.variant);
    if (!v) return emit('error', { code: 'UNKNOWN_VARIANT', message: body.variant });
    runner.start(v).catch(() => {});
    return;
  }
  if (p === '/api/dev/drop') {
    // 대장 창에서 그림을 놓은 것처럼: 같은 페이지의 다른 그림으로 바꿔 끼우는 신호
    const s = contract.slots.find((x) => x.key === body.key);
    if (!s) return fail(res, 'UNKNOWN_SLOT', body.key);
    const other = contract.slots.find((x) => x.key !== s.key && x.current?.pc?.url && x.current.pc.url !== s.current?.pc?.url);
    emit('slot.updated', { key: s.key, slotId: s.slotId, lane: 'image', state: 'trial', url: body.url || other.current.pc.url, version: Date.now(), variant: body.variant ?? null });
    return json(res, 200, { ok: true });
  }
  return notFound(res);
});
helper.listen(HELPER_PORT, 'localhost', () => console.log(`가짜 도우미 http://localhost:${HELPER_PORT}/preview`));

/* ---------- 공개본 사본: 진짜 사본 중계 또는 시험 페이지 ---------- */
if (SITE_PORT) {
  await createSiteProxy({ listenPort: PUBLIC_PORT, targetPort: SITE_PORT, parentOrigin: PARENT });
  console.log(`사본 중계 http://localhost:${PUBLIC_PORT} → localhost:${SITE_PORT}`);
} else {
  const TEST_PORT = 4321;
  const pub = path.join(SITE_DIR, 'apps/web/public');
  http
    .createServer((req, res) => {
      const u = new URL(req.url, `http://localhost:${TEST_PORT}`);
      if (u.pathname.startsWith('/media/')) return sendFile(res, path.join(pub, decodeURIComponent(u.pathname)));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(testPageHtml(contract, u.pathname));
    })
    .listen(TEST_PORT, 'localhost');
  await createSiteProxy({ listenPort: PUBLIC_PORT, targetPort: TEST_PORT, parentOrigin: PARENT });
  console.log(`시험 페이지 http://localhost:${PUBLIC_PORT} (칸 상자 + data-slot · 약속 샘플)`);
}

const shutdown = async () => {
  await runner?.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
