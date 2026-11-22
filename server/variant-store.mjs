// 수정안(PR) 쪽 칸 상태 (PC2-스튜디오-7) — 이 컴퓨터에만(공유 _상태와 섞지 않음 · 공개본 시험과 따로)
// - 파일: <작업 폴더>\variant-state\<수정안 id>.json = { [칸 키]: 상태 } (상태 모양은 공유 _상태와 같음)
// - 수정안을 끄거나 다른 PR로 바꿔도 남겨 둠 → 다시 켜면 시험 그림을 다시 끼움(공개본 "최신으로"와 같은 방식)
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import path from 'node:path';

const safeId = (id) => {
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(String(id)) || String(id).includes('..')) throw Object.assign(new Error(`수정안 이름이 이상함: ${id}`), { code: 'BAD_VARIANT' });
  return id;
};

export function createVariantStore(dir, machine = 'unknown') {
  const file = (id) => path.join(dir, `${safeId(id).replace(/\//g, '_')}.json`);
  const load = (id) => {
    const f = file(id); // 이상한 이름은 여기서 막음(아래 catch에 묻히지 않게)
    try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
  };
  const save = (id, all) => {
    mkdirSync(dir, { recursive: true });
    const tmp = `${file(id)}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(all, null, 2));
    renameSync(tmp, file(id));
  };
  return {
    all: (id) => load(id),
    read: (id, key) => load(id)[key] ?? null,
    /** 통째로 씀 · revision +1 (이 컴퓨터만 쓰므로 충돌 검사 없음) */
    write(id, next) {
      const all = load(id);
      const out = { ...next, revision: (all[next.key]?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), updatedBy: `studio@${machine}` };
      all[next.key] = out;
      save(id, all);
      return out;
    },
  };
}
