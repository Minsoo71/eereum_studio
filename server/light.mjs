// AI 그림 · 영상 빛 효과 검사(PC2-스튜디오-2 · 사용자 상시 규칙 "AI 영상은 0.5초 프레임 빛 효과 검사")
// - 대장 창이 시험 파일에서 0.5초마다 프레임을 뽑아 검사판(PNG 한 장)을 만들어 보냄 → 도우미가 _시험\<칸 키>\_검사판\ 에 저장
// - 사용자가 검사판을 보고 "빛 효과 없음"을 눌러야 확정됨(AI 예일 때) · 확정하면 검사판을 요청\_검사판\ 에 같이 둠(M5 PR 설명에 링크)
// - 요청\ 바로 아래가 아니라 _검사판\ 하위 폴더 → M5가 검사판을 교체 그림으로 착각하지 않음
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { StudioError } from './images.mjs';

export const SHEET_DIR = '_검사판';
export const FRAME_INTERVAL = 0.5; // 초
const MAX_SHEET_BYTES = 15 * 1024 * 1024;

export const isPng = (buf) => Buffer.isBuffer(buf) && buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

/** 시험 파일(_시험 기준 "<칸 키>/<이름>") → 그 검사판 PNG · 정보 JSON 경로 */
export function sheetPaths(trialDir, trialFile) {
  const dir = path.join(trialDir, path.dirname(trialFile), SHEET_DIR);
  const name = path.basename(trialFile).replace(/\.[^.]+$/, '');
  return { dir, png: path.join(dir, `${name}.png`), json: path.join(dir, `${name}.json`) };
}

/** 대장이 보낸 검사판 저장 · info = { frames, interval, duration, suspects[] } (숫자만 남김) */
export function saveSheet(trialDir, trialFile, png, info = {}) {
  if (!isPng(png)) throw new StudioError('SHEET', '검사판 그림(PNG)을 읽지 못했어요. 다시 해 주세요.');
  if (png.length > MAX_SHEET_BYTES) throw new StudioError('SHEET', '검사판이 너무 커요.');
  const p = sheetPaths(trialDir, trialFile);
  mkdirSync(p.dir, { recursive: true });
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const clean = {
    trial: trialFile,
    frames: num(info.frames),
    interval: num(info.interval) ?? FRAME_INTERVAL,
    duration: num(info.duration),
    suspects: Array.isArray(info.suspects) ? info.suspects.map(num).filter((n) => n !== null).slice(0, 500) : [],
    madeAt: new Date().toISOString(),
  };
  writeFileSync(p.png, png);
  writeFileSync(p.json, JSON.stringify(clean, null, 2));
  return clean;
}

/** 확정 전 검사: AI 예면 검사판이 있어야 하고 "빛 효과 없음"(lightOk)을 눌렀어야 함 → 검사판 정보 · AI 아니면 null */
export function requireLightCheck({ ai, lightOk, trialDir, trialFile }) {
  if (!ai) return null;
  const p = sheetPaths(trialDir, trialFile);
  if (!existsSync(p.png)) throw new StudioError('LIGHT_CHECK', 'AI로 만든 그림 · 영상은 빛 효과 검사판을 먼저 봐야 해요. 확정을 다시 눌러 주세요.');
  if (lightOk !== true) throw new StudioError('LIGHT_CHECK', '검사판에서 "빛 효과 없음"을 눌러야 확정돼요.');
  let info = {};
  try { info = JSON.parse(readFileSync(p.json, 'utf8')); } catch { /* 정보 파일이 없어도 검사판은 있음 */ }
  return { ...info, png: p.png };
}

/** 확정 때 검사판을 요청\_검사판\<요청 이름>.png 로 복사 → meta.lightCheck */
export function attachSheet(requestDir, base, check, machine) {
  if (!check) return null;
  const dir = path.join(requestDir, SHEET_DIR);
  mkdirSync(dir, { recursive: true });
  copyFileSync(check.png, path.join(dir, `${base}.png`));
  return { sheet: `${SHEET_DIR}/${base}.png`, frames: check.frames ?? null, interval: check.interval ?? FRAME_INTERVAL, duration: check.duration ?? null, suspects: check.suspects ?? [], result: '빛 효과 없음', checkedAt: new Date().toISOString(), machine };
}
