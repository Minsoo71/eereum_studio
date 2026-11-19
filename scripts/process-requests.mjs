// M5 요청 처리(PC9 · 필요할 때마다 · 하루 최대 한 묶음) — 요청\ → 사이트 브랜치(로컬 커밋까지) · push · PR · 합치기는 하지 않음(승인 필요)
// 쓰는 법(이 저장소에서): node scripts/process-requests.mjs --repo D:/dev/eereum_ring [--dry-run]  (--repo = 쇼핑몰 저장소 · PR 브랜치를 만들 곳)
// 하는 일:
//  1) 요청\의 <칸ID>_<시각>_<설명>.<확장자> (+ 같은 이름 .json · 없으면 .txt 메모) 모으기
//  2) 사이트 저장소에 작업 폴더(git worktree) D:\eereum_studio\m5 · 브랜치 pc9/images-<YYYYMMDD-HHMM> (origin/main에서)
//  3) 칸마다: 새 파일 이름(-v2, -v3 …)으로 칸 규격 그림 만들기 · content/media.ts 주소 바꾸기 · 옛 파일은 이전\<키>\(최근 2개 판 · 더 오래된 것은 _보관\)
//  4) 요청 파일 → 작업중\ · 상태 파일 image = in-progress · history
//  5) 로컬 커밋 + PR 설명 초안 작업중\M5_<시각>.md
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, copyFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { config } from '../server/config.mjs';
import { buildSlots } from '../server/slots.mjs';
import { forSite } from '../server/images.mjs';
import { readState, writeState } from '../server/state.mjs';
import sharp from 'sharp';
import { clampFocus, cropForMobile, hasMobileFile, mobileRatio } from '../preview/focus.mjs';
import { setFocusInMedia } from '../server/media-edit.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DRY = args.includes('--dry-run');
const REPO = opt('--repo', 'D:/dev/eereum_ring');
const WT = opt('--worktree', path.join(config.root, 'm5'));
const kst = new Date(Date.now() + 9 * 3600e3).toISOString();
const STAMP = `${kst.slice(0, 10).replace(/-/g, '')}-${kst.slice(11, 16).replace(':', '')}`;
const BRANCH = `pc9/images-${STAMP}`;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
const IMG = /\.(jpe?g|png|webp|heic|heif)$/i;

// 1) 요청 모으기
const reqDir = config.dirs.request;
const files = existsSync(reqDir) ? readdirSync(reqDir).filter((f) => /^P\d{2}-\d{2}_/.test(f) && IMG.test(f)) : [];
if (!files.length) { console.log('요청이 없어요.'); process.exit(0); }
const requests = files.map((f) => {
  const base = f.replace(/\.[^.]+$/, '');
  const metaPath = path.join(reqDir, `${base}.json`);
  const memoPath = path.join(reqDir, `${base}.txt`);
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : null;
  const target = /-모바일$/.test(base) ? 'mobile' : 'pc';
  return { file: f, base, slotId: f.slice(0, 6), meta, metaPath: existsSync(metaPath) ? metaPath : null, memo: existsSync(memoPath) ? readFileSync(memoPath, 'utf8').trim() : '', memoPath: existsSync(memoPath) ? memoPath : null, target };
});

// 2) 작업 폴더(worktree)
if (!DRY) {
  git(REPO, 'fetch', '--quiet', 'origin', 'main');
  if (!existsSync(WT)) git(REPO, 'worktree', 'add', '--quiet', '-b', BRANCH, WT, 'origin/main');
  else { git(WT, 'checkout', '--quiet', '-B', BRANCH, 'origin/main'); }
}
const site = DRY ? config.site : WT;
const reg = await buildSlots(site);
const mediaPath = path.join(site, 'content/media.ts');
let mediaTs = readFileSync(mediaPath, 'utf8');
const nextName = (url) => {
  const ext = path.extname(url);
  const stem = url.slice(0, -ext.length);
  const m = stem.match(/^(.*)-v(\d+)$/);
  let n = m ? Number(m[2]) + 1 : 2;
  const root = m ? m[1] : stem;
  while (existsSync(path.join(site, 'apps/web/public', `${root}-v${n}${ext}`))) n++;
  return `${root}-v${n}${ext}`;
};

const done = [];
const problems = [];
for (const r of requests) {
  const slot = reg.slots.find((s) => s.slotId === r.slotId && (!r.meta || s.key === r.meta.key)) ?? (r.meta ? reg.slots.find((s) => s.key === r.meta.key) : null);
  if (!slot) { problems.push(`${r.file}: 칸을 찾지 못함(칸 ID가 바뀌었으면 .json의 key로 찾음)`); continue; }
  if (r.meta?.license && /NC/i.test(r.meta.license)) { problems.push(`${r.file}: NC 라이선스 → 쓸 수 없음`); continue; }
  const cur = r.target === 'mobile' && slot.current.mobile ? slot.current.mobile : slot.current.pc;
  const newUrl = nextName(cur.url);
  const width = Math.max(cur.width ?? 0, slot.spec.minWidth);
  const src = readFileSync(path.join(reqDir, r.file));
  const out = await forSite(src, { format: path.extname(cur.url).slice(1).replace('jpeg', 'jpg'), width });
  const row = { key: slot.key, slotId: slot.slotId, from: cur.url, to: newUrl, bytes: out.length, license: r.meta?.license ?? '(메모 확인)', ai: r.meta?.ai ?? null, altKo: r.meta?.altKo ?? null, note: r.meta?.note || r.memo };
  if (!DRY) {
    writeFileSync(path.join(site, 'apps/web/public', newUrl), out);
    if (!mediaTs.includes(`'${cur.url}'`)) { problems.push(`${r.file}: media.ts에서 '${cur.url}'를 못 찾음`); continue; }
    mediaTs = mediaTs.replace(`'${cur.url}'`, `'${newUrl}'`);
    // 초점(약속 v1.3 · 기능 ①): 휴대폰 파일이 따로 있는 칸 = 그 점 둘레로 잘라 새 휴대폰 파일 · 한 파일 칸 = media.ts focus 'x y'
    if (r.meta?.focus && r.target === 'pc') {
      const f = clampFocus(r.meta.focus);
      if (hasMobileFile(slot)) {
        const m = slot.current.mobile;
        const ratio = mobileRatio(slot);
        const cut = ratio ? (await cropForMobile(sharp, src, ratio, f)).data : src;
        const mOut = await forSite(cut, { format: path.extname(m.url).slice(1).replace('jpeg', 'jpg'), width: Math.max(m.width ?? 0, slot.spec.minWidth) });
        const mUrl = nextName(m.url);
        writeFileSync(path.join(site, 'apps/web/public', mUrl), mOut);
        if (mediaTs.includes(`'${m.url}'`)) { mediaTs = mediaTs.replace(`'${m.url}'`, `'${mUrl}'`); row.mobile = { from: m.url, to: mUrl, focus: f }; }
        else problems.push(`${r.file}: media.ts에서 휴대폰 파일 '${m.url}'를 못 찾음(초점 반영 못 함)`);
      } else if (f.x !== 0.5 || f.y !== 0.5) { // 가운데면 그대로(놓기 기본값 · 'center'를 '0.5 0.5'로 괜히 바꾸지 않음)
        const next = setFocusInMedia(mediaTs, slot.key, f);
        if (next) { mediaTs = next; row.focus = f; } else problems.push(`${r.file}: media.ts에서 '${slot.key}'의 focus를 못 찾음(초점 반영 못 함)`);
      }
    }
    // 옛 파일 보관(이전\<키>\ · 최근 2개 판)
    const keep = path.join(config.share, '이전', slot.key);
    mkdirSync(keep, { recursive: true });
    const oldFile = path.join(site, 'apps/web/public', cur.url);
    if (existsSync(oldFile)) copyFileSync(oldFile, path.join(keep, `${STAMP}_${path.basename(cur.url)}`));
    const kept = readdirSync(keep).filter((f) => !f.startsWith('_')).sort();
    if (kept.length > 2) { mkdirSync(path.join(config.share, '이전', '_보관'), { recursive: true }); for (const f of kept.slice(0, kept.length - 2)) renameSync(path.join(keep, f), path.join(config.share, '이전', '_보관', `${slot.key}_${f}`)); }
    // 요청 → 작업중
    const wip = path.join(config.share, '작업중');
    mkdirSync(wip, { recursive: true });
    for (const p of [path.join(reqDir, r.file), r.metaPath, r.memoPath].filter(Boolean)) renameSync(p, path.join(wip, path.basename(p)));
    // 상태
    const st = readState(slot.key);
    if (st) writeState({ ...st, image: { state: 'in-progress', file: newUrl }, trial: null, history: [{ at: new Date().toISOString(), from: cur.url, to: newUrl, backup: `${STAMP}_${path.basename(cur.url)}` }, ...(st.history ?? [])].slice(0, 20) }, st.revision);
  }
  done.push(row);
}

// 5) 커밋 + PR 설명 초안
const body = `# 그림 교체 ${STAMP} (M5 · PC9)\n\n| 칸 | 키 | 바뀐 파일 | 크기 | 출처 · 라이선스 | AI | 메모 |\n|---|---|---|---|---|---|---|\n${done.map((d) => `| ${d.slotId} | \`${d.key}\` | \`${d.from}\` → \`${d.to}\`${d.mobile ? ` · 휴대폰 \`${d.mobile.to}\`(초점 ${d.mobile.focus.x} ${d.mobile.focus.y})` : ''}${d.focus ? ` · 초점 ${d.focus.x} ${d.focus.y}` : ''} | ${Math.round(d.bytes / 1024)}KB | ${d.license} | ${d.ai === null ? '?' : d.ai ? '예' : '아니요'} | ${d.note ?? ''} |`).join('\n')}\n\n- 새 파일 이름(-vN)이라 손님 브라우저 캐시에 옛 그림이 남지 않음\n- 옛 파일은 저장소에 남겨 둠(지우기는 별도 승인) · 원본 보관 \`이전\\<키>\\\`\n${done.some((d) => d.altKo) ? '- ⚠ 대체 글 바꾸기 요청 있음 → 번역(en · ja · zh) 같이 고쳐야 해서 이 PR에 넣지 않음(따로)\n' : ''}- 확인: B(화면) · \`pnpm test:content\` · 사용자 승인 뒤 합치기\n${problems.length ? `\n## 처리 못 한 요청\n${problems.map((p) => `- ${p}`).join('\n')}\n` : ''}`;
if (!DRY && done.length) {
  writeFileSync(mediaPath, mediaTs);
  git(WT, 'add', '-A', 'apps/web/public/media', 'content/media.ts');
  git(WT, 'commit', '--quiet', '-m', `chore(media): 그림 교체 ${STAMP} · ${done.map((d) => d.slotId).join(' ')} (M5 · 스튜디오 요청)`, '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>');
  writeFileSync(path.join(config.share, '작업중', `M5_${STAMP}.md`), body);
}
console.log(DRY ? '(시험 · 바꾼 것 없음)' : `브랜치 ${BRANCH} · 작업 폴더 ${WT} · 커밋 ${done.length ? git(WT, 'log', '-1', '--format=%h') : '-'}`);
console.log(body);
