// 시험 페이지 (data-slot.md 5장): 사이트 PR-A(칸 표시) 전에 약속 샘플로 칸마다 상자 + data-slot을 그린다.
// 주소 앞 언어(/en · /ja · /zh-hans · /zh-hant)는 떼고 한국어 주소로 찾음.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function stripLocale(pathname) {
  const m = pathname.match(/^\/(en|ja|zh-hans|zh-hant)(\/.*)?$/);
  return { locale: m ? m[1] : 'ko', path: m ? m[2] || '/' : pathname || '/' };
}

export function testPageHtml(contract, pathname) {
  const { locale, path } = stripLocale(pathname);
  const page = contract.pages.find((p) => p.paths.includes(path));
  const slots = contract.slots.filter((s) => (s.paths ? s.paths.includes(path) : page && s.pageId === page.pageId) && s.kind !== 'share');
  const box = (s) => {
    const pc = s.current?.pc?.url;
    const mo = s.current?.mobile?.url;
    const head = `<p class="k">${esc(s.slotId)} · <b>${esc(s.key)}</b> · ${esc(s.kind)} · ${esc(s.accepts)}</p>`;
    if (s.kind === 'background')
      return `<section class="bg" data-slot="${esc(s.key)}" data-slot-kind="background" style="background-image:url('${esc(pc)}')">${head}<p>글 아래 배경 그림</p></section>`;
    const pic = pc
      ? `<picture>${mo ? `<source media="(max-width: 767px)" srcset="${esc(mo)}">` : ''}<img src="${esc(pc)}" alt="${esc(s.alt?.ko ?? '')}" loading="lazy"></picture>`
      : '<div class="empty">비어 있는 칸</div>';
    const video = s.accepts !== 'image' ? `<video class="vid" muted playsinline aria-label="영상 칸(비어 있음)"></video>` : '';
    return `<figure data-slot="${esc(s.key)}" data-slot-kind="normal">${head}${pic}${video}</figure>`;
  };
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>시험 페이지 ${esc(path)}</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f6f7f5;color:#151a1b}
header{height:58px;background:#151a1b;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-size:13px;letter-spacing:.08em}
main{padding:16px;display:grid;gap:16px}@media(min-width:1024px){main{grid-template-columns:repeat(2,1fr);padding:40px 120px}}
figure{margin:0;background:#fff;border:1px solid #dde2e1;border-radius:6px;padding:8px}figure img{display:block;width:100%;height:auto;max-height:520px;object-fit:cover}
.k{margin:0 0 6px;font-size:12px;color:#616a6c}.empty{height:160px;display:grid;place-items:center;color:#616a6c;background:#eee}
.vid{display:block;width:100%;height:0}.bg{min-height:260px;background-size:cover;background-position:center;border-radius:6px;padding:12px;color:#151a1b}
</style></head><body><header><span>MENU [${locale.toUpperCase()}]</span><span>eereum · 시험 페이지</span><span>${esc(path)}</span></header>
<main>${slots.length ? slots.map(box).join('') : `<p>이 주소(${esc(path)})에 칸이 없음</p>`}</main></body></html>`;
}
