// 칸 상태 파일: 공유 폴더 _상태\<칸 키>.json (contract/status.schema.json · G0 결정 2)
// - 통째로 새로 씀 · revision +1 · 다른 컴퓨터가 그사이 바꿨으면(revision 다름) BUSY
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
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
