# 스튜디오 미리보기 창 · 수정안 보기 (M2 · M6 · PC11)

> 계획 `이미지교체\스튜디오_개발계획.md` v5 · 약속 v1.1(`../contract/` events.md · data-slot.md · slots.schema.json)
> 공개 사이트 · 저장소 main · 운영 DB는 절대 바뀌지 않음 · 사이트 코드 변화 0 · 패키지 0(Node 내장만)

## 무엇이 있나
| 파일 | 하는 일 |
|---|---|
| `public/index.html` · `preview.js` · `preview.css` | 미리보기 창(도우미가 `http://localhost:4300/preview`로 보여 줌): 휴대폰 390×844 · PC 1440 · 둘 다 · 언어 5개 · 페이지 · **공개본 \| 수정안** 나란히 · 이 화면의 칸 목록 |
| `bridge.js` | 창 안 쇼핑몰 사본 화면에 끼우는 **연결 스크립트**: `[data-slot]` 찾기 · 스크롤 + 1.5초 테두리 · 그림 · 배경 · 영상을 `?v=`로 바꿔 끼움(PC · 모바일 따로 · 옛 version 무시) · 나란히 볼 때 스크롤 맞춤 |
| `proxy.mjs` | **사본 중계**: 사본(next dev)의 HTML에 `bridge.js` 한 줄을 끼우고 나머지는 그대로 · 화면 갱신 웹소켓(`/_next/hmr`) 그대로 넘김 · localhost만 |
| `variant.mjs` | **수정안 보기**: 열린 PR · 브랜치 목록(`git ls-remote` · 읽기만) → 고른 브랜치를 공개본 사본의 `git worktree`로 → 패키지 오프라인 맞춤(lockfile 바뀔 때만) → `next dev` 4352 → 중계 4302 · 비교를 닫으면 끔 |
| `dev/fake-helper.mjs` | 시험용 가짜 도우미(약속 v1.1 흉내) — 진짜 도우미(PC9)가 없을 때 이 모듈만으로 시험 |
| `dev/test-site.mjs` (+ `../contract/slots.sample.json`) | 시험 페이지: 사이트 PR-A(칸 표시) 전에 약속 샘플로 칸마다 상자 + `data-slot` |
| `../test/preview/*.test.mjs` | `node --test test/preview/` (16개) |

## 왜 중계(proxy)인가 — 진행판 Q-S1
미리보기 창(4300)과 그 안 쇼핑몰(4301 · 4302)은 **포트가 달라 다른 출처** → 브라우저가 창 안을 만지지 못하게 막음.
그래서 사본 화면에만 `bridge.js`를 끼우고, 미리보기와 `postMessage`로만 대화한다(출처 확인: bridge는 `parent=` 출처 메시지만 받고, 미리보기는 사본 출처 메시지만 받음).

```
대장 창 ──POST──▶ 도우미 4300 ──SSE(slot.updated · slot.selected · variant.changed)──▶ 미리보기 창
                                                                                   │ postMessage
                         next dev 4351 ◀── 중계 4301(bridge 끼움) ◀── iframe ──────┤
                         next dev 4352 ◀── 중계 4302(bridge 끼움) ◀── iframe ──────┘ (수정안)
```

## 포트 (모두 localhost만)
| 포트 | 무엇 |
|---|---|
| 4300 | 도우미(PC9) · `/preview` = 이 창 |
| 4301 / 4351 | 공개본 사본: 중계 / next dev |
| 4302 / 4352 | 수정안 사본: 중계 / next dev |
| 4311 | 사본 API(PC9 · README 공통 규칙 1 · `API_ORIGIN`) |
| 4321 | 시험 페이지(가짜 도우미 시험 모드만) |

## 진짜 도우미(PC9)가 붙일 것
- `GET /preview` → `public/index.html` · `GET /preview.js` · `/preview.css`
- `GET /api/preview-config` → `{ ok, siteOrigin: "http://localhost:4301", variantOrigin: "http://localhost:4302" }`
- `GET /api/slots` → `{ ok, pages, slots }`(약속 slots) · `GET /api/variants` → `{ ok, variants: listVariants(사본 폴더) }`
- `POST /api/select {key}` · `/api/locale {locale}` · `/api/variant {variant: id|null}` → `createVariantRunner().start/stop` · 상태를 `variant.changed`로
- 공개본 사본을 켠 뒤 `createSiteProxy({ listenPort: 4301, targetPort: 4351, parentOrigin: 'http://localhost:4300' })`
- 사본 실행은 `devCommand({ port, apiOrigin })` 그대로(**`API_ORIGIN` 필수 · 4000 금지 · `--hostname localhost` · `NODE_OPTIONS=--use-system-ca`** — G0 공통 · PC11-V9 증명)

## 혼자 시험하기
```bash
node preview/dev/fake-helper.mjs                       # 시험 페이지 모드 → http://localhost:4300/preview
curl -X POST localhost:4300/api/select  -H 'content-type: application/json' -d '{"key":"home.hero"}'
curl -X POST localhost:4300/api/dev/drop -H 'content-type: application/json' -d '{"key":"home.hero"}'
# 진짜 사본: 사본 폴더에서 API_ORIGIN=http://localhost:4311 NODE_OPTIONS=--use-system-ca npx next dev --hostname localhost -p 4351
node preview/dev/fake-helper.mjs --site-port 4351 --repo D:/eereum_studio/site --api-origin http://localhost:4311
```

## 알아 둘 것
- 사이트에 `data-slot`이 붙기 전(PR-A 전)에는 진짜 사본 화면의 칸 목록이 비어 있음 → 칸 줄에 점선(“이 화면에 아직 칸 표시가 없음”)으로 보임 · 시험 페이지 모드로 시험
- 영상 칸은 비어 있어도 칸 표시(테두리 최소 크기 + 칸 이름)
- "동작 줄이기" 설정이면 미리보기 창의 움직임 끔
