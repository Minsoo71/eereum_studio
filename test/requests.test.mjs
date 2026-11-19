// 기능 ② 같은 칸 다시 확정 경고 (PC9-스튜디오-3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pendingRequests, moveToReplaced, REPLACED_DIR } from '../server/requests.mjs';

function share() {
  const root = mkdtempSync(path.join(tmpdir(), 'studio-req-'));
  const req = path.join(root, '요청'); const prev = path.join(root, '이전');
  mkdirSync(req); mkdirSync(prev);
  const put = (base, key, at, machine = 'PC9') => {
    writeFileSync(path.join(req, `${base}.jpg`), 'img');
    writeFileSync(path.join(req, `${base}.json`), JSON.stringify({ version: 1, key, slotId: base.split('_')[0], files: { pc: `${base}.jpg` }, requestedAt: at, machine, note: '' }));
  };
  return { root, req, prev, put };
}

test('확정 대기 요청: 같은 칸(key)만 · 오래된 것 먼저 · 다른 칸 · 깨진 .json은 건너뜀', () => {
  const s = share();
  s.put('P01-07_20261119-1200_b', 'home.story', '2026-11-19T03:00:00Z', 'PC11');
  s.put('P01-07_20261119-1100_a', 'home.story', '2026-11-19T02:00:00Z');
  s.put('P01-01_20261119-1100_x', 'home.hero', '2026-11-19T02:00:00Z');
  writeFileSync(path.join(s.req, 'P01-07_깨짐.json'), '{반쯤');
  const p = pendingRequests(s.req, 'home.story');
  assert.deepEqual(p.map((x) => x.json), ['P01-07_20261119-1100_a.json', 'P01-07_20261119-1200_b.json']);
  assert.equal(p[1].machine, 'PC11');
  assert.deepEqual(pendingRequests(s.req, 'about.hero'), []);
  assert.deepEqual(pendingRequests(path.join(s.root, '없음'), 'home.story'), []);
});

test('칸 ID가 바뀌어도(칸 옮김) .json 안의 key로 찾음', () => {
  const s = share();
  s.put('P01-06_20261119-1100_a', 'home.story', '2026-11-19T02:00:00Z'); // 옛 칸 ID
  assert.equal(pendingRequests(s.req, 'home.story').length, 1);
});

test('앞 요청 바꾸기: 그림 + .json을 이전\\_바뀐요청\\으로 옮김 · 지우지 않음 · 같은 이름이면 _2', () => {
  const s = share();
  s.put('P01-07_20261119-1100_a', 'home.story', '2026-11-19T02:00:00Z');
  const moved = moveToReplaced(s.req, s.prev, pendingRequests(s.req, 'home.story'));
  assert.deepEqual(moved, [`이전/${REPLACED_DIR}/P01-07_20261119-1100_a.jpg`, `이전/${REPLACED_DIR}/P01-07_20261119-1100_a.json`]);
  assert.deepEqual(readdirSync(s.req), []);
  assert.ok(existsSync(path.join(s.prev, REPLACED_DIR, 'P01-07_20261119-1100_a.jpg')));
  // 같은 이름을 또 옮기면 덮어쓰지 않고 _2
  s.put('P01-07_20261119-1100_a', 'home.story', '2026-11-19T02:00:00Z');
  const again = moveToReplaced(s.req, s.prev, pendingRequests(s.req, 'home.story'));
  assert.deepEqual(again, [`이전/${REPLACED_DIR}/P01-07_20261119-1100_a_2.jpg`, `이전/${REPLACED_DIR}/P01-07_20261119-1100_a_2.json`]);
  assert.equal(readdirSync(path.join(s.prev, REPLACED_DIR)).length, 4);
});

test('그사이 다른 컴퓨터가 옮긴 파일은 건너뜀(오류 없음)', () => {
  const s = share();
  s.put('P01-07_20261119-1100_a', 'home.story', '2026-11-19T02:00:00Z');
  const p = pendingRequests(s.req, 'home.story');
  p[0].files.push('없는그림.jpg');
  assert.equal(moveToReplaced(s.req, s.prev, p).length, 2);
});
