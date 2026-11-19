// helper.status는 늘 사본 상태(site · repoCommit)를 같이 보냄 — 미리보기 띠 "사본 undefined" 방지 (PC2-스튜디오-1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.STUDIO_SHARE = mkdtempSync(path.join(os.tmpdir(), 'studio-events-')); // 로그를 진짜 공유 폴더에 쓰지 않게
const { emit, setStatusBase } = await import('../server/events.mjs');

test('helper.status: 경고 · DB 소식만 보내도 site · repoCommit이 같이 감', () => {
  setStatusBase(() => ({ site: 'ready', repoCommit: '3171d50abc' }));
  const b = emit('helper.status', { warnings: ['방화벽'] });
  assert.equal(b.site, 'ready');
  assert.equal(b.repoCommit, '3171d50abc');
  assert.deepEqual(b.warnings, ['방화벽']);
});

test('helper.status: 보내는 쪽이 정한 site가 먼저(켜는 중 · 꺼짐)', () => {
  setStatusBase(() => ({ site: 'ready', repoCommit: 'x' }));
  assert.equal(emit('helper.status', { site: 'failed', message: '꺼짐' }).site, 'failed');
});

test('다른 신호에는 사본 상태를 섞지 않음', () => {
  setStatusBase(() => ({ site: 'ready' }));
  assert.equal(emit('slot.updated', { key: 'home.hero' }).site, undefined);
});
