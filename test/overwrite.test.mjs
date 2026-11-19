// V5-1 S2 대책: 쓴 뒤 다른 컴퓨터가 덮으면 한 번 알림 (watchMine)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchMine } from '../server/state.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mine = { key: 'home.story', revision: 34, updatedBy: 'studio@DESKTOP', updatedAt: '2026-11-19T02:38:00.050Z' };

test('다른 컴퓨터가 같은 번호(r34)로 덮음 → 한 번만 알림', async () => {
  let file = { ...mine };
  const seen = [];
  watchMine(mine, (cur) => seen.push(cur), [10, 30, 50], () => file);
  file = { ...mine, updatedBy: 'studio@PC11', updatedAt: '2026-11-19T02:38:00.745Z' }; // V5 S2 그대로
  await wait(80);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].updatedBy, 'studio@PC11');
});

test('그대로 내 것 · 내가 또 씀(놓기 → 확정) → 알림 없음', async () => {
  let file = { ...mine };
  const seen = [];
  watchMine(mine, (cur) => seen.push(cur), [10, 30], () => file);
  await wait(15);
  file = { ...mine, revision: 35, updatedAt: '2026-11-19T02:38:05.000Z' };
  await wait(30);
  assert.equal(seen.length, 0);
});

test('파일을 못 읽음(동기화 중) → 알림 없음 · 멈추기 함수', async () => {
  const seen = [];
  const stop = watchMine(mine, (cur) => seen.push(cur), [10], () => null);
  await wait(20);
  assert.equal(seen.length, 0);
  let file = { ...mine, updatedBy: 'studio@PC11' };
  const stop2 = watchMine(mine, (cur) => seen.push(cur), [20], () => file);
  stop2();
  await wait(30);
  assert.equal(seen.length, 0);
  stop();
});
