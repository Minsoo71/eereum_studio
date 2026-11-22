// swc 대역(PC2-스튜디오-6): 스마트 앱 컨트롤이 @swc/core 네이티브를 막는 PC에서도 사본(next dev)이 켜지게
// 가짜 next-intl · @swc/core 묶음을 임시 폴더에 만들어 "막힘" · "보통"을 흉내 냄(쇼핑몰 사본 없이)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { siteEnv } from '../server/site.mjs';

const GUARD = new URL('../server/swc-guard.mjs', import.meta.url).href;

function fakeSite(blocked) {
  const d = mkdtempSync(path.join(tmpdir(), 'swc-guard-'));
  const pkg = (name, main, body) => {
    const p = path.join(d, 'node_modules', name);
    mkdirSync(p, { recursive: true });
    writeFileSync(path.join(p, 'package.json'), JSON.stringify({ name, main }));
    writeFileSync(path.join(p, main), body);
  };
  // 노트북과 같은 실패: @swc/core가 읽힐 때 바로 터짐
  pkg('@swc/core', 'index.js', blocked
    ? "const e = new Error('Failed to load native binding'); e.code = 'ERR_SWC_NATIVE_LOAD'; throw e;"
    : 'module.exports = { real: true };');
  // next-intl/plugin.cjs처럼 맨 위에서 @swc/core를 부름
  pkg('next-intl', 'plugin.cjs', "const core = require('@swc/core'); module.exports = { core };");
  return d;
}
function run(dir, code, withGuard = true) {
  const args = [...(withGuard ? [`--import=${GUARD}`] : []), '-e', code];
  try { return { out: execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), ok: true }; }
  catch (e) { return { out: String(e.stdout) + String(e.stderr), ok: false }; }
}
const LOAD = "const p = require('next-intl'); console.log(p.core.__studioStub ? 'STUB' : p.core.real ? 'REAL' : 'NONE')";

test('siteEnv: NODE_OPTIONS에 swc 대역 훅(--import) · 파일 있음', () => {
  const opt = siteEnv().NODE_OPTIONS;
  const m = opt.match(/--import=(file:\S+swc-guard\.mjs)/);
  assert.ok(m, opt);
  assert.ok(existsSync(fileURLToPath(m[1])));
  assert.match(opt, /--use-system-ca/);
});

test('swc 대역: 막힌 PC = next-intl이 대역을 받음(설정 읽기 계속) · 보통 PC = 진짜 그대로 · 범위는 next-intl만', () => {
  const blocked = fakeSite(true);
  assert.equal(run(blocked, LOAD, false).ok, false, '대역 없으면 노트북처럼 터져야 함');
  const g = run(blocked, LOAD);
  assert.equal(g.ok, true, g.out);
  assert.match(g.out, /STUB/);
  // next-intl 밖에서 부르면 대역 안 씀(원래 오류 그대로)
  assert.equal(run(blocked, "require('@swc/core')").ok, false);
  // 대역 함수가 불리면 분명한 오류
  const t = run(blocked, "require('next-intl').core.transformSync()");
  assert.equal(t.ok, false); assert.match(t.out, /swc-guard/);

  const normal = fakeSite(false);
  const n = run(normal, LOAD);
  assert.equal(n.ok, true, n.out);
  assert.match(n.out, /REAL/);
});
