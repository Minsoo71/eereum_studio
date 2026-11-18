// 상태 파일 시험 · 임시 공유 폴더(STUDIO_SHARE)로 · 실제 공유 폴더는 건드리지 않음
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.STUDIO_SHARE = mkdtempSync(path.join(os.tmpdir(), 'studio-share-'));
const { ensureState, readState, writeState } = await import('../server/state.mjs');
const slot = { key: 'home.hero', slotId: 'P01-01', accepts: 'both', current: { pc: { url: '/media/home/hero.jpg' } } };

test('새 상태 파일 · 칸 키 이름 · 이미지 live · 영상 empty', () => {
  const s = ensureState(slot);
  assert.equal(s.revision, 1);
  assert.equal(s.image.state, 'live');
  assert.equal(s.video.state, 'empty');
  assert.ok(readFileSync(path.join(process.env.STUDIO_SHARE, '_상태', 'home.hero.json'), 'utf8').includes('"slotId": "P01-01"'));
});

test('두 컴퓨터가 같은 칸을 동시에: 늦은 쪽은 BUSY', () => {
  const a = readState('home.hero');
  const b = readState('home.hero');
  writeState({ ...a, trial: { file: 'x.jpg', media: 'image', placedAt: new Date().toISOString(), machine: 'A' } }, a.revision);
  assert.throws(() => writeState({ ...b, trial: { file: 'y.jpg', media: 'image', placedAt: new Date().toISOString(), machine: 'B' } }, b.revision), (e) => e.code === 'BUSY');
  assert.equal(readState('home.hero').trial.machine, 'A');
});

test('칸 ID가 바뀌면(구역 이동) 같은 파일에 slotId만 고침', () => {
  const before = readState('home.hero').revision;
  const s = ensureState({ ...slot, slotId: 'P01-02' });
  assert.equal(s.slotId, 'P01-02');
  assert.equal(s.revision, before + 1);
});

test('V5 S2: Synology 충돌 사본을 찾음(지우지 않음)', async () => {
  const { writeFileSync, mkdirSync, existsSync } = await import('node:fs');
  const { findConflicts } = await import('../server/state.mjs');
  const st = path.join(process.env.STUDIO_SHARE, '_상태');
  writeFileSync(path.join(st, 'home.hero (Conflict 2026-11-19).json'), '{}');
  mkdirSync(path.join(process.env.STUDIO_SHARE, '요청'), { recursive: true });
  writeFileSync(path.join(process.env.STUDIO_SHARE, '요청', 'P01-01_20261119-0300_a_충돌.jpg'), 'x');
  const c = findConflicts();
  assert.deepEqual(c, ['_상태/home.hero (Conflict 2026-11-19).json', '요청/P01-01_20261119-0300_a_충돌.jpg']);
  assert.ok(existsSync(path.join(st, 'home.hero (Conflict 2026-11-19).json')));
});
