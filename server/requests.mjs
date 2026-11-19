// 요청 폴더 다루기 (PC9-스튜디오-3 · 기능 ② 같은 칸 다시 확정 경고)
// - "확정 대기" = 공유 요청\ 안에 아직 남아 있는 그 칸의 .json (M5가 처리하면 요청\에서 빠짐)
// - 칸 ID는 바뀔 수 있어서(칸 옮김) 파일 이름이 아니라 .json 안의 key로 찾음 · 두 컴퓨터가 각각 확정한 것도 모두 찾음
// - 바꾸기: 앞 요청(.json + 그림)을 이전\_바뀐요청\으로 옮김 · 지우지 않음
//   (이전\<칸 키>\는 M5가 옛 사이트 파일을 2개 판만 남기는 곳이라 섞지 않음)
import { readFileSync, readdirSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

export const REPLACED_DIR = '_바뀐요청';

/** 그 칸의 확정 대기 요청 목록 (오래된 것 먼저) */
export function pendingRequests(requestDir, key) {
  let names = [];
  try { names = readdirSync(requestDir); } catch { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    let meta;
    try { meta = JSON.parse(readFileSync(path.join(requestDir, n), 'utf8')); } catch { continue; } // 반쯤 받은 파일 · 다른 파일은 건너뜀
    if (meta?.key !== key) continue;
    out.push({ json: n, files: Object.values(meta.files ?? {}), slotId: meta.slotId, requestedAt: meta.requestedAt ?? null, machine: meta.machine ?? null, note: meta.note ?? '' });
  }
  return out.sort((a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)));
}

/** 같은 이름이 이미 있으면 _2, _3 … 을 붙임(덮어쓰지 않음) */
function freeName(dir, name) {
  if (!existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name); const base = name.slice(0, name.length - ext.length);
  for (let i = 2; ; i++) { const n = `${base}_${i}${ext}`; if (!existsSync(path.join(dir, n))) return n; }
}

/** 앞 요청들을 이전\_바뀐요청\으로 옮김 · 옮긴 파일 이름(공유 폴더 기준) 목록을 돌려줌 */
export function moveToReplaced(requestDir, previousDir, pending) {
  const dest = path.join(previousDir, REPLACED_DIR);
  mkdirSync(dest, { recursive: true });
  const moved = [];
  for (const p of pending) {
    for (const f of [...p.files, p.json]) {
      const src = path.join(requestDir, f);
      if (!existsSync(src)) continue; // 그사이 다른 컴퓨터가 옮겼으면 건너뜀
      const to = freeName(dest, f);
      renameSync(src, path.join(dest, to));
      moved.push(`이전/${REPLACED_DIR}/${to}`);
    }
  }
  return moved;
}
