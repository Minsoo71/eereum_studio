# `data-slot` 숨은 표시 규칙 (약속 v1 · PC9 · 2026-11-17)

사이트 그림마다 붙이는 숨은 표시. 미리보기 창은 화면 위치가 아니라 이 표시로 칸을 찾는다(사이트 구조가 바뀌어도 따라감). 사이트 PR(PC10)과 미리보기(PC11)가 같이 따른다.

## 1. 값
- `data-slot="<key>"` · key = `content/media.ts` 키 그대로(예: `home.hero` · `ring.angle.3`)
- 칸 ID(`P01-01`)는 쓰지 않음(화면 순서가 바뀌면 다시 붙으므로)
- 기준 커밋 092694c에는 아직 없음(V10) → 작은 사이트 PR에서 붙임

## 2. 붙이는 곳
| 그리는 방식 | 붙이는 요소 |
|---|---|
| `<Media>` (이미지 · 영상) | 바깥 상자 `div`(그림 · 영상을 감싼 것) |
| `HeroPicture` (`<picture>`) | `<picture>` 바깥 상자 |
| `DeferredMedia` (화면 가까이 올 때 붙는 사진) | 자리 상자(그림이 아직 없어도 표시가 있어야 함) |
| CSS 배경 그림(`background-image`) | 그 배경을 가진 요소 + `data-slot-kind="background"` |
| 공유 미리보기(`og:image`) | 화면에 없음 → `<meta property="og:image" data-slot="seo.og.default">` 대신 도우미가 칸 목록의 `kind: share`로 처리 |

- 한 요소에 칸 하나. 같은 칸이 한 화면에 여러 번 나오면(예: 목록 카드) 모두 같은 값을 붙이고 `data-slot-index="0,1,…"`(화면 순서)를 더함
- 같은 파일을 여러 칸이 써도(예: `cart.line` · `ring.preview`) 표시는 칸 이름대로

## 3. 함께 붙이는 값(선택)
| 속성 | 값 | 쓰임 |
|---|---|---|
| `data-slot-kind` | `normal` · `background` · `share` | 미리보기 테두리 색 |
| `data-slot-src` | 지금 화면이 쓰는 파일 주소(모바일/PC 중 실제 고른 것) | 미리보기가 바꿔 끼울 대상 확인 |

## 4. 지키는 법
- 운영 사이트에도 그대로 둠(보이는 변화 0 · 화면 읽기 프로그램에 영향 없음 · 용량 몇 바이트)
- 사이트 CI 검사(작은 사이트 PR ④): 모든 주소 × 390 · 1440 × 5개 언어 렌더에서
  - ① 화면에 나온 그림(`img` · `video` · `picture` · CSS `background-image`)마다 가장 가까운 조상에 `data-slot`이 있어야 함(로고 · 아이콘 SVG · 3D 뷰어 캔버스는 제외 목록)
  - ② `data-slot` 값이 media.ts 키여야 함
  - ③ media.ts의 `inUse: true` 칸이 어딘가에 나와야 함
- 미리보기(PC11)는 `document.querySelectorAll('[data-slot="<key>"]')`로 찾고, 없으면 "이 화면에 없는 칸" 안내

## 5. 시험 페이지(PC11이 먼저 씀)
- 사이트 PR 전에는 `slots.sample.json`으로 만든 가짜 페이지(칸마다 상자 + `data-slot`)로 시험
