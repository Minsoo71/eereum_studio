// 빛 효과 검사판(PC2-스튜디오-2): 0.5초 프레임 · 의심 표시 · AI 확정은 검사판 + "빛 효과 없음"이 있어야 함
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { frameTimes, findSuspects, INTERVAL } from '../register/light.js';
import { isPng, sheetPaths, saveSheet, requireLightCheck, attachSheet, SHEET_DIR } from '../server/light.mjs';
import { pendingRequests, moveToReplaced } from '../server/requests.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

test('0.5초마다 · 8초 영상 = 0 ~ 7.5초 16장 + 끝 7.95초(마지막 0.5초도 봄)', () => {
  assert.equal(INTERVAL, 0.5);
  const t = frameTimes(8);
  assert.equal(t.length, 17);
  assert.deepEqual([t[0], t[1], t.at(-2), t.at(-1)], [0, 0.5, 7.5, 7.95]);
  const u = frameTimes(8.4);
  assert.equal(u.at(-2), 8);
  assert.equal(u.at(-1), 8.35); // 마지막 0.4초도 봄
  assert.deepEqual(frameTimes(NaN), [0]);
  assert.throws(() => frameTimes(600), /너무 길어요/);
});

test('의심 프레임: 밝은 점이 갑자기 늘거나 · 화면이 확 밝아지면 표시 · 고른 화면은 표시 없음', () => {
  const calm = Array.from({ length: 10 }, () => ({ mean: 120, hi: 0.01 }));
  assert.deepEqual(findSuspects(calm), []);
  const flare = calm.map((s, i) => (i === 4 ? { mean: 125, hi: 0.09 } : s));
  assert.deepEqual(findSuspects(flare), [4]);
  const sweep = calm.map((s, i) => (i === 7 ? { mean: 160, hi: 0.01 } : s));
  assert.deepEqual(findSuspects(sweep), [7]);
  assert.deepEqual(findSuspects([{ mean: 250, hi: 0.9 }]), []); // 한 장(그림)은 비교할 것이 없음
});

function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'studio-light-'));
  const trial = path.join(root, '_시험'); const req = path.join(root, '요청'); const prev = path.join(root, '이전');
  mkdirSync(path.join(trial, 'home.hero'), { recursive: true });
  writeFileSync(path.join(trial, 'home.hero', '20261120-1100_veo.mp4'), 'x');
  return { trial, req, prev, file: 'home.hero/20261120-1100_veo.mp4' };
}

test('검사판 저장: PNG만 · _시험\\<칸>\\_검사판\\ 에 그림 + 정보', () => {
  const { trial, file } = setup();
  assert.equal(isPng(PNG), true);
  assert.throws(() => saveSheet(trial, file, Buffer.from('not png')), /PNG/);
  const info = saveSheet(trial, file, PNG, { frames: 16, interval: 0.5, duration: 8, suspects: [2, 'x', 3.5] });
  const p = sheetPaths(trial, file);
  assert.equal(path.basename(path.dirname(p.png)), SHEET_DIR);
  assert.ok(existsSync(p.png) && existsSync(p.json));
  assert.deepEqual(info.suspects, [2, 3.5]);
  assert.equal(info.frames, 16);
});

test('AI 예: 검사판 없으면 · "빛 효과 없음" 안 눌렀으면 확정 막음 · AI 아니면 검사 없음', () => {
  const { trial, file } = setup();
  assert.equal(requireLightCheck({ ai: false, lightOk: false, trialDir: trial, trialFile: file }), null);
  assert.throws(() => requireLightCheck({ ai: true, lightOk: true, trialDir: trial, trialFile: file }), (e) => e.code === 'LIGHT_CHECK' && /검사판/.test(e.message));
  saveSheet(trial, file, PNG, { frames: 16 });
  assert.throws(() => requireLightCheck({ ai: true, lightOk: false, trialDir: trial, trialFile: file }), (e) => e.code === 'LIGHT_CHECK' && /빛 효과 없음/.test(e.message));
  const ok = requireLightCheck({ ai: true, lightOk: true, trialDir: trial, trialFile: file });
  assert.equal(ok.frames, 16);
});

test('확정: 검사판이 요청\\_검사판\\<요청 이름>.png 로 · .json lightCheck · 앞 요청 바꾸기 때 검사판도 같이 옮김', () => {
  const { trial, req, prev, file } = setup();
  saveSheet(trial, file, PNG, { frames: 16, suspects: [3] });
  const check = requireLightCheck({ ai: true, lightOk: true, trialDir: trial, trialFile: file });
  const base = 'P01-01_20261120-1101_히어로';
  mkdirSync(req, { recursive: true });
  const lc = attachSheet(req, base, check, 'PC-TEST');
  assert.equal(lc.sheet, `${SHEET_DIR}/${base}.png`);
  assert.equal(lc.result, '빛 효과 없음');
  assert.deepEqual(readFileSync(path.join(req, lc.sheet)), PNG);
  writeFileSync(path.join(req, `${base}.mp4`), 'v');
  writeFileSync(path.join(req, `${base}.json`), JSON.stringify({ key: 'home.hero', files: { video: `${base}.mp4` }, lightCheck: lc, requestedAt: 'a' }));
  const pending = pendingRequests(req, 'home.hero');
  assert.deepEqual(pending[0].files, [`${base}.mp4`, lc.sheet]);
  const moved = moveToReplaced(req, prev, pending);
  assert.ok(moved.includes(`이전/_바뀐요청/${base}.png`));
  assert.equal(existsSync(path.join(req, lc.sheet)), false);
});
