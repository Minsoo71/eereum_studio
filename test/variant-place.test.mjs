// 수정안 위에 그림 놓기 (PC2-스튜디오-7): 수정안 상태 · 바뀌는 폭 · 비율 · PR 요청 나누기 · 같은 칸 경고는 같은 곳끼리
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createVariantStore } from '../server/variant-store.mjs';
import { readMediaTs, ratioOf } from '../server/slots.mjs';
import { splitByTarget } from '../server/request-groups.mjs';
import { pendingRequests } from '../server/requests.mjs';

const tmp = (p) => mkdtempSync(path.join(tmpdir(), p));

test('수정안 상태: 수정안마다 따로 · revision +1 · 브랜치 이름(/)도 · 이상한 이름은 막음', () => {
  const dir = tmp('studio-vstore-');
  const s = createVariantStore(dir, 'PC2');
  assert.equal(s.read('pr-101', 'home.hero'), null);
  const a = s.write('pr-101', { key: 'home.hero', image: { state: 'trial' }, trial: { file: '_pr/pr-101/home.hero/x.jpg' } });
  assert.equal(a.revision, 1);
  assert.equal(a.updatedBy, 'studio@PC2');
  assert.equal(s.write('pr-101', { ...a, image: { state: 'requested' } }).revision, 2);
  assert.equal(s.read('pr-101', 'home.hero').image.state, 'requested');
  assert.equal(s.read('pr-93', 'home.hero'), null, '다른 PR과 섞이지 않음');
  s.write('pc1/story', { key: 'home.story', trial: null });
  assert.ok(existsSync(path.join(dir, 'pc1_story.json')));
  assert.deepEqual(Object.keys(s.all('pr-101')), ['home.hero']);
  for (const bad of ['../x', 'a b', '', 'x'.repeat(200)]) assert.throws(() => s.read(bad, 'k'), { code: 'BAD_VARIANT' });
});

test('바뀌는 폭: 칸 설명의 "768px부터" · 없으면 null · 비율 9:19.5 · 2:1', () => {
  const site = tmp('studio-media-');
  mkdirSync(path.join(site, 'content'));
  writeFileSync(path.join(site, 'content/media.ts'), [
    'export const media = {',
    "  // 첫 화면 · 768px부터 PC 그림",
    "  'home.hero': { pc: '/media/home/hero.jpg', mobile: '/media/home/hero-m.jpg', alt: 'a' },",
    "  'home.story': { pc: '/media/home/story.jpg', alt: 'b' },",
    '};',
  ].join('\n'));
  const m = readMediaTs(site);
  assert.equal(m['home.hero'].switchAt, 768);
  assert.equal(m['home.story'].switchAt, null, '앞 칸 설명을 다음 칸에 끌고 가지 않음');
  assert.equal(ratioOf(780, 1690), '9:19.5');
  assert.equal(ratioOf(2880, 1440), '2:1');
});

test('M5 요청 나누기: 기본 = 공개본만(PR 요청은 남겨 둠) · --target-pr = 그 PR만 · 브랜치 하나', () => {
  const pub = { file: 'P01-01_20261122-1200_a.jpg', meta: { key: 'home.hero' } };
  const memo = { file: 'P01-02_20261122-1200_b.jpg', meta: null };
  const pr = { file: 'P01-01_20261122-1300_pr101_c.jpg', meta: { key: 'home.hero', targetPR: { id: 'pr-101', number: 101, branch: 'pc1/hero' } } };
  const pr2 = { file: 'P01-03_20261122-1300_pr93_d.jpg', meta: { key: 'home.x', targetPR: { id: 'pr-93', number: 93, branch: 'pc1/story' } } };
  const def = splitByTarget([pub, memo, pr, pr2]);
  assert.deepEqual(def.chosen.map((r) => r.file), [pub.file, memo.file]);
  assert.deepEqual(def.waiting.map((w) => [w.number, w.branch, w.files.length]), [[101, 'pc1/hero', 1], [93, 'pc1/story', 1]]);
  const one = splitByTarget([pub, pr, pr2], 101);
  assert.deepEqual(one.chosen.map((r) => r.file), [pr.file]);
  assert.equal(one.branch, 'pc1/hero');
  assert.deepEqual(one.problems, []);
  const mixed = splitByTarget([pr, { ...pr, file: 'z.jpg', meta: { ...pr.meta, targetPR: { number: 101, branch: 'other' } } }], 101);
  assert.equal(mixed.branch, null);
  assert.equal(mixed.problems.length, 1, '브랜치가 둘이면 멈춤');
  assert.deepEqual(splitByTarget([pub], 101).chosen, []);
});

test('확정 대기 요청에 targetPR이 같이 나옴(같은 칸 경고는 공개본 · 같은 PR끼리만)', () => {
  const req = tmp('studio-req-pr-');
  const put = (base, extra = {}) => {
    writeFileSync(path.join(req, `${base}.jpg`), 'img');
    writeFileSync(path.join(req, `${base}.json`), JSON.stringify({ version: 1, key: 'home.hero', files: { pc: `${base}.jpg` }, requestedAt: base, ...extra }));
  };
  put('P01-01_20261122-1200_a');
  put('P01-01_20261122-1300_pr101_b', { targetPR: { id: 'pr-101', number: 101, branch: 'pc1/hero' } });
  const p = pendingRequests(req, 'home.hero');
  assert.deepEqual(p.map((x) => x.targetPR?.number ?? null), [null, 101]);
  // 도우미 confirm과 같은 거르기
  const same = (id) => p.filter((x) => (x.targetPR?.id ?? null) === id);
  assert.equal(same(null).length, 1);
  assert.equal(same('pr-101').length, 1);
  assert.equal(same('pr-93').length, 0);
  assert.ok(readFileSync(path.join(req, 'P01-01_20261122-1300_pr101_b.json'), 'utf8').includes('pc1/hero'));
});
