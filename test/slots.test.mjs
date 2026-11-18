// 칸 목록 시험 · 사본(STUDIO_SITE · 기본 D:/eereum_studio/site)이 있을 때만 · 없으면 건너뜀
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildSlots, diffSlots, ratioOf } from '../server/slots.mjs';
import { config } from '../server/config.mjs';

test('비율 이름', () => {
  assert.equal(ratioOf(1750, 1400), '5:4');
  assert.equal(ratioOf(1200, 1200), '1:1');
  assert.equal(ratioOf(661, 481), '1.37:1');
});

test('칸 목록 = 약속 샘플과 같은 칸 · 같은 ID', { skip: !existsSync(config.site) }, async () => {
  const r = await buildSlots(config.site);
  const sample = JSON.parse(readFileSync(new URL('../contract/slots.sample.json', import.meta.url), 'utf8'));
  assert.equal(r.slots.length, sample.slots.length);
  for (const s of sample.slots) {
    const m = r.slots.find((x) => x.key === s.key);
    assert.ok(m, `빠진 칸 ${s.key}`);
    assert.equal(m.slotId, s.slotId, s.key);
    assert.equal(m.accepts, s.accepts, s.key);
    assert.equal(m.kind, s.kind, s.key);
  }
});

test('바뀐 점: 새 칸 · 없어진 칸 · 옮긴 칸', () => {
  const a = { slots: [{ key: 'a', slotId: 'P01-01' }, { key: 'b', slotId: 'P01-02' }] };
  const b = { slots: [{ key: 'b', slotId: 'P01-01' }, { key: 'c', slotId: 'P01-02' }] };
  assert.deepEqual(diffSlots(a, b), { added: ['c'], removed: ['a'], moved: [{ key: 'b', fromSlotId: 'P01-02', toSlotId: 'P01-01' }] });
});
