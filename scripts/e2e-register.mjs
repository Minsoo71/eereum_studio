// 대장 창 끝까지 시험(수동 · 도우미 + 사본 켠 채로): node scripts/e2e-register.mjs <쇼핑몰 저장소 경로(@playwright/test 빌려 씀)>
// R-d: 경로는 도우미와 같은 환경 변수(STUDIO_SITE · STUDIO_ROOT · STUDIO_SHARE)를 따름 → 임시 공유 폴더로 시험 가능(진짜 공유 폴더 안 건드림)
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.mjs';
const repo = process.argv[2] ?? 'D:/dev/eereum_ring';
const { chromium } = createRequire(repo + '/')('@playwright/test');
const SITE = config.publicDir.split(path.sep).join('/');
const SHARE = config.share.split(path.sep).join('/');
console.log(`사본 ${SITE} · 공유 ${SHARE}`);
const KEY = 'home.story';
const res = [];
const ok = (n, c, note = '') => { const l = `${c ? 'PASS' : 'FAIL'} · ${n}${note ? ' · ' + note : ''}`; res.push(l); console.log(l); };

const before = readFileSync(`${SITE}/media/home/story.jpg`);
const testImg = readFileSync(`${SITE}/media/about/hero.jpg`);
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const p = await ctx.newPage();
const events = [];
await p.exposeFunction('__ev', (e) => events.push(e));
await p.goto('http://localhost:4300/register');
await p.waitForSelector(`tr[data-key="${KEY}"]`);
const slotCount = (await (await fetch('http://localhost:4300/api/slots')).json()).slots.length;
ok(`대장 창 열림 · 칸 ${slotCount}`, (await p.locator('tr[data-key]').count()) === slotCount, String(await p.locator('tr[data-key]').count()));
await p.evaluate(() => { const es = new EventSource('/api/events'); for (const n of ['slot.updated', 'slot.selected', 'register.rebuilt']) es.addEventListener(n, (e) => window.__ev({ n, d: JSON.parse(e.data) })); });
// 칸 고르기 → slot.selected
await p.locator(`tr[data-key="${KEY}"] td.pos, tr[data-key="${KEY}"] .pos`).first().click();
await p.waitForTimeout(500);
ok('칸 고르기 → slot.selected 신호', events.some((e) => e.n === 'slot.selected' && e.d.key === KEY));
// 끌어다 놓기(DataTransfer로 흉내)
const drop = async (bytes, name) => {
  await p.evaluate(async ({ key, b64, name }) => {
    const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bin], name, { type: 'image/jpeg' }));
    const z = document.querySelector(`tr[data-key="${key}"] [data-drop="image"]`);
    z.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
    z.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
  }, { key: KEY, b64: bytes.toString('base64'), name });
};
const t0 = Date.now();
await drop(testImg, '새 이야기 사진.jpg');
await p.waitForFunction((k) => document.querySelector(`tr[data-key="${k}"] .lane.trial`), KEY, { timeout: 20000 });
const ms = Date.now() - t0;
const upd = events.find((e) => e.n === 'slot.updated' && e.d.key === KEY && e.d.state === 'trial');
ok('놓기 → 대장 줄 "시험 중"', true, `${ms}ms`);
ok('slot.updated 신호(url ?v=)', Boolean(upd && /\?v=\d+/.test(upd.d.url)), upd?.d.url);
const after = readFileSync(`${SITE}/media/home/story.jpg`);
ok('사본 파일 바뀜', !after.equals(before));
ok('이미지 캐시 지움', !existsSync('D:/eereum_studio/site/apps/web/.next/dev/cache/images'));
const st = JSON.parse(readFileSync(`${SHARE}/_상태/${KEY}.json`, 'utf8'));
ok('상태 파일 trial · image=trial', st.trial?.media === 'image' && st.image.state === 'trial', `rev ${st.revision}`);
// 사본 화면에서 새 그림(원래 주소 ?v=)
const r = await p.request.get(`http://localhost:4301${upd.d.url}`);
ok('사본 주소로 새 그림 받음', r.ok() && Buffer.from(await r.body()).equals(after));
// 되돌리기
await p.locator(`tr[data-key="${KEY}"] [data-revert]`).click();
await p.waitForFunction((k) => !document.querySelector(`tr[data-key="${k}"] .lane.trial`), KEY, { timeout: 10000 });
ok('되돌리기 → 원래 파일', readFileSync(`${SITE}/media/home/story.jpg`).equals(before));
// 다시 놓고 확정
await drop(testImg, '새 이야기 사진.jpg');
await p.waitForFunction((k) => document.querySelector(`tr[data-key="${k}"] .lane.trial`), KEY, { timeout: 20000 });
await p.locator(`tr[data-key="${KEY}"] .pos`).first().click();
await p.selectOption('#lic', '자체 렌더');
await p.fill('#memo', 'PC9 시험');
const reqBefore = existsSync(`${SHARE}/요청`) ? readdirSync(`${SHARE}/요청`).length : 0;
await p.click('#confirm');
await p.waitForFunction((k) => document.querySelector(`tr[data-key="${k}"] .lane.requested`), KEY, { timeout: 10000 });
const reqFiles = readdirSync(`${SHARE}/요청`).filter((f) => f.startsWith('P01-07_') && f.includes('PC9-시험'));
ok('확정 → 요청 파일 + .json', reqFiles.some((f) => f.endsWith('.jpg')) && reqFiles.some((f) => f.endsWith('.json')), reqFiles.join(', '));
const meta = JSON.parse(readFileSync(`${SHARE}/요청/${reqFiles.find((f) => f.endsWith('.json'))}`, 'utf8'));
ok('요청 .json 내용', meta.key === KEY && meta.license === '자체 렌더' && meta.slotId === 'P01-07');
// NC 라이선스는 막힘
const nc = await p.evaluate(async () => (await fetch('/api/confirm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'home.story', license: 'CC BY-NC' }) })).json());
ok('NC 라이선스 막힘', nc.ok === false && nc.error.code === 'LICENSE');
// 이미지만 받는 칸에 mp4 → NOT_ACCEPTED
const na = await p.evaluate(async () => (await fetch('/api/drop?key=ring.angle.1', { method: 'POST', headers: { 'x-file-name': 'a.mp4' }, body: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]) })).json());
ok('이미지만 칸에 영상 → NOT_ACCEPTED', na.error?.code === 'NOT_ACCEPTED', na.error?.code);
// 그림 아닌 파일 → FILE_TYPE
const ft = await p.evaluate(async () => (await fetch('/api/drop?key=home.story', { method: 'POST', headers: { 'x-file-name': 'a.jpg' }, body: new TextEncoder().encode('not an image') })).json());
ok('그림 아닌 파일 → FILE_TYPE', ft.error?.code === 'FILE_TYPE', ft.error?.code);
// 정리: 사본 되돌림(요청 파일은 남김 · 시험용 이름)
await p.evaluate(async () => fetch('/api/revert', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'home.story' }) }));
ok('정리: 사본 원래 파일', readFileSync(`${SITE}/media/home/story.jpg`).equals(before));
await browser.close();
console.log(`\n${res.filter((x) => x.startsWith('PASS')).length}/${res.length} 통과`);
process.exit(0);
