# 스튜디오 약속 파일 v1.1 (PC9 · 2026-11-18 · 이 저장소 `contract/`)

| 파일 | 무엇 | 누가 주로 씀 |
|---|---|---|
| `slots.schema.json` | 칸 하나의 모양(칸 ID · key · 페이지 · 위치 · 종류 · 받는 종류 · 규격 · 현재 파일 · data-slot · 쓰는 중) | 모두 |
| `slots.sample.json` | 지금 사이트(main 092694c) 39칸 · 8페이지를 위 모양으로 · **가짜 데이터 겸 첫 실데이터** · 스키마 검사 통과 | PC11(미리보기 시험) · PC10(칸 이름) · PC8 |
| `events.md` | 대장 창 ↔ 도우미(localhost:4300) ↔ 미리보기 창 신호 · 명령 7개 · 신호 7개 · 오류 코드 · SSE | PC9 · PC11 |
| `status.schema.json` | 칸마다 상태 파일 모양 · 이미지 칸 · 영상 칸 · 시험 · 요청 · 이력 | PC9 · PC8 |
| `request-naming.md` | 요청 파일 이름 `<칸ID>_<YYYYMMDD-HHMM>_<설명>.jpg` · 확정 때 같은 이름 .json · 폴더 흐름 | PC9 · 사용자 |
| `data-slot.md` | 사이트 그림의 숨은 표시 `data-slot="<key>"` · 붙이는 곳 · CI 검사 | PC10(사이트 PR) · PC11 |

## 계획과 다르게 정한 것 1개 (이유)
- 상태 파일 이름 = `_상태\<key>.json`(예: `_상태\home.hero.json`) · 계획의 `<칸ID>.json` 대신
  - 칸 ID는 화면 순서로 다시 붙기 때문에, 구역이 옮겨지면 다른 칸의 상태를 가리키게 됨
  - key(media.ts 이름)는 오래 그대로 · 파일 안에 `slotId`도 같이 적음
  - 이팀장 · 사용자가 칸 ID 이름을 원하면 바꿈(도구 한 줄)

## 바뀔 때
- 약속은 PC9만 바꿈 · `version` 올리고 진행판에 알림(통합 시각에 맞춰)

## 지금 칸 숫자 (092694c)
- 39칸: 이미지 · 영상 둘 다 24 · 이미지만 15 / 일반 37 · 배경 1(home.story.bg) · 공유 1(seo.og.default) / 쓰는 중 37 · 예비 2(ring.preview · ring.story)
- 같은 파일을 쓰는 칸: rings.featured.wish ↔ sound · ring.preview ↔ cart.line
- `data-slot`은 사이트에 아직 없음(V10) → 작은 사이트 PR에서 붙임
