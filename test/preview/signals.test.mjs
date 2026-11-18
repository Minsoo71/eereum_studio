// 미리보기 창이 받는 신호 이름 = 약속(contract/events.md)의 신호 이름 (v1.2 helper.error 같은 바뀜을 놓치지 않게)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const events = readFileSync(new URL('../../contract/events.md', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../../preview/public/preview.js', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../../preview/dev/fake-helper.mjs', import.meta.url), 'utf8');

const signalTable = events.slice(events.indexOf('## 3.'), events.indexOf('## 4.'));
const contractSignals = new Set([...signalTable.matchAll(/^\| `([a-z.]+)` \|/gm)].map((m) => m[1]));
const handlersBlock = preview.slice(preview.indexOf('const handlers = {'), preview.indexOf('};', preview.indexOf('const handlers = {')));
const handled = [...handlersBlock.matchAll(/^\s+'?([a-z.]+)'?: \(d\)/gm)].map((m) => m[1]);

test('약속 표에서 신호 이름을 읽음', () => {
  for (const s of ['slot.updated', 'slot.selected', 'variant.changed', 'helper.status', 'helper.error']) assert.ok(contractSignals.has(s), s);
});

test('미리보기 창이 받는 신호는 모두 약속에 있음 · 이름이 error인 신호는 받지 않음(EventSource 연결 끊김과 섞임 · v1.2)', () => {
  assert.ok(handled.length >= 6, handled.join(','));
  for (const h of handled) assert.ok(contractSignals.has(h), `약속에 없는 신호: ${h}`);
  assert.ok(!handled.includes('error'));
});

test('가짜 도우미가 보내는 신호도 약속에 있음', () => {
  const sent = [...helper.matchAll(/emit\('([a-z.]+)'/g)].map((m) => m[1]);
  for (const s of sent) assert.ok(contractSignals.has(s), `약속에 없는 신호: ${s}`);
});
