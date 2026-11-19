// 칸 상태 파일: 공유 폴더 _상태\<칸 키>.json (contract/status.schema.json · G0 결정 2)
// - 통째로 새로 씀 · revision +1 · 다른 컴퓨터가 그사이 바꿨으면(revision 다름) BUSY
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';
import { StudioError } from './images.mjs';

const file = (key) => path.join(config.dirs.state, `${key}.json`);

export function readState(key) {
  try { return JSON.parse(readFileSync(file(key), 'utf8')); } catch { return null; }
}

/** 없으면 칸 목록 기준으로 새로 만듦 */
export function ensureState(slot) {
  const cur = readState(slot.key);
  if (cur) {
    if (cur.slotId !== slot.slotId) writeState({ ...cur, slotId: slot.slotId }, cur.revision);
    return readState(slot.key);
  }
  const isVideo = /\.(mp4|webm)$/i.test(slot.current.pc.url);
  const lane = (st) => (st === 'live' ? { state: st, file: slot.current.pc.url } : { state: st });
  const image = slot.accepts === 'video' ? 'not-accepted' : isVideo ? 'empty' : 'live';
  const video = slot.accepts === 'image' ? 'not-accepted' : isVideo ? 'live' : 'empty';
  const fresh = { version: 1, key: slot.key, slotId: slot.slotId, image: lane(image), video: lane(video), trial: null, request: null, history: [], revision: 0 };
  writeState(fresh, null);
  return readState(slot.key);
}

/** 쓰기 · expectRevision이 지금 파일과 다르면 BUSY(동시 사용 충돌) */
export function writeState(next, expectRevision) {
  mkdirSync(config.dirs.state, { recursive: true });
  const cur = readState(next.key);
  if (cur && expectRevision !== null && cur.revision !== expectRevision) {
    throw new StudioError('BUSY', '다른 컴퓨터가 같은 칸을 바꾸는 중이에요. 잠시 뒤 다시 해 주세요.');
  }
  const out = { ...next, revision: (cur?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: `studio@${config.machine}` };
  const tmp = `${file(next.key)}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(out, null, 2));
  renameSync(tmp, file(next.key)); // 반쯤 쓴 파일이 동기화되지 않게
  return out;
}

export const stateExists = (key) => existsSync(file(key));

/** V5-1 S2 대책: 두 컴퓨터가 1초 안에 같은 칸을 쓰면 BUSY가 못 막고 Synology가 충돌 사본 없이 조용히 덮음
 *  → 쓴 뒤 몇 초 뒤 다시 읽어 쓴 컴퓨터(updatedBy)가 내가 아니면 onLost(지금 파일) 한 번 부름 */
export function watchMine(written, onLost, delays = [5000, 15000], read = readState) {
  const timers = [];
  let done = false;
  for (const ms of delays) {
    const t = setTimeout(() => {
      if (done) return;
      const cur = read(written.key);
      if (cur && cur.updatedBy !== written.updatedBy) { // 내가 또 쓴 것(놓기 → 확정)은 알림 아님
        done = true; timers.forEach(clearTimeout); onLost(cur);
      }
    }, ms);
    t.unref?.();
    timers.push(t);
  }
  return () => { done = true; timers.forEach(clearTimeout); };
}

/** V5 S2: Synology 동기화 충돌 사본 찾기(자동으로 지우지 않음 · 대장 맨 위 경고만)
 *  찾는 곳: _상태 · 요청 · _시험(한 단계 아래까지) · 이름에 (Conflict · _Conflict · _충돌 · conflicted copy */
const CONFLICT = /\(conflict|_conflict|_충돌|conflicted copy/i;
export function findConflicts() {
  const out = [];
  const scan = (dir, depth) => {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names) {
      if (CONFLICT.test(d.name)) out.push(path.relative(config.share, path.join(dir, d.name)).split(path.sep).join('/'));
      else if (d.isDirectory() && depth > 0 && !d.name.startsWith('_자동시험')) scan(path.join(dir, d.name), depth - 1);
    }
  };
  scan(config.dirs.state, 0);
  scan(config.dirs.request, 0);
  scan(config.dirs.trial, 1);
  return out.sort();
}
