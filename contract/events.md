# 신호 약속 · 대장 창 ↔ 도우미 ↔ 미리보기 창 (약속 v1.4 · PC9 · 2026-11-18 · v1.3 PC11 · v1.4 PC9 11-19)

> v1.1 바뀐 점(11-18 · 1단계): ① 놓기 = 한 번(`POST /api/drop?key=&target=` · 몸통 = 파일 그대로 · 머리 `x-file-name`) — v1의 upload + drop 두 번을 합침 ② `slot.updated`에 `urls: { pc, mobile, video }` · `warnings` 추가 ③ `slot.selected`에 `paths` 추가(그 칸이 보이는 주소) ④ 명령 주소 = `POST /api/<명령>` 그대로
> v1.2 바뀐 점(11-18 18:00 통합): 오류 신호 이름 `error` → **`helper.error`**(EventSource는 이름이 `error`인 신호를 연결 끊김과 구별하지 못함 → 미리보기 창에 "연결 끊김"이 잘못 뜸) · 미리보기 창(PC11)은 `helper.error`로 받아 주세요
> v1.3 바뀐 점(11-19 · PC11-스튜디오-3 · PC9 확인 11-19 17:20): 휴대폰 자르기 **초점** — ① 명령 `focus` 추가 ② `slot.updated`에 `focus?: { x, y }`(0~1 · 그림 왼쪽 위 = 0,0) ③ 상태 `trial.focus` ④ 확정 `.json`에 `focus` · 모두 **있어도 되고 없어도 되는** 칸(없으면 가운데) → v1.2 창 · 도우미와 그대로 맞음
> v1.4 바뀐 점(11-19 · PC9 · G1 판): ① `confirm`에 `replace?: true` — 같은 칸에 확정 대기 요청(요청\ 안 그 칸 .json)이 있으면 오류 `ALREADY_REQUESTED` + `error.detail.pending[]` → 대장 "앞 요청 바꾸기"(replace) / "취소" · 바꾸면 앞 요청은 `이전\_바뀐요청\`(지우지 않음) ② 신호 `slot.overwritten` `{ key, slotId, by, at, revision, mine }` — 내가 쓴 상태 파일을 5 · 15초 뒤 다시 읽어 다른 컴퓨터가 덮었으면(V5 S2 · 1초 안 동시 쓰기) · 미리보기는 무시해도 됨 ③ 오류 응답에 `detail?` · 모두 있어도 되고 없어도 되는 칸 → v1.3 창과 그대로 맞음

## 1. 연결
| 쪽 | 주소 |
|---|---|
| 도우미(서버 · PC9) | `http://localhost:4300` (이 컴퓨터 안에서만 · 밖에서 못 들어옴) |
| 대장 창 | `http://localhost:4300/register` |
| 미리보기 창 | `http://localhost:4300/preview` (안에 쇼핑몰 사본 `http://localhost:4301` · 수정안은 4302) |

- ⚠ 주소는 **`localhost`로만**(127.0.0.1 X): Next 개발 서버가 다른 주소에서 온 실시간 연결(HMR)을 거부해 화면 자바스크립트가 안 붙음(PC9 V2 · 11-17 시험) · 도우미는 4300을 127.0.0.1에만 열되 창은 localhost로 엶
- 창 → 도우미: `POST /api/<명령>` (JSON) — 응답 `{ ok: true, ... }` 또는 `{ ok: false, error: { code, message } }`
- 도우미 → 창(모두에게): `GET /api/events` **SSE**(Server-Sent Events · 한 줄 = 한 신호)
  - `event: <이름>` · `data: <JSON>` · `id: <순번>`(다시 연결 때 `Last-Event-ID`로 놓친 것부터)
  - 15초마다 `event: ping`
- 모든 신호에 공통 칸: `{ "v": 1, "at": "<ISO 시각>", "from": "register" | "preview" | "helper", "seq": <순번> }`
- 시험용: 도우미는 모든 신호를 `이미지교체\_로그\events-<날짜>.jsonl`에 한 줄씩 기록(미리보기 없이 대장만으로 시험 가능)

## 2. 명령 (창 → 도우미)
| 명령 | 보내는 창 | 몸통 | 도우미가 하는 일 | 뒤따르는 신호 |
|---|---|---|---|---|
| `drop` (놓음) | 대장 | `POST /api/drop?key=<키>&target=pc\|mobile\|both` · 몸통 = 파일 그대로(`application/octet-stream`) · 머리 `x-file-name: <encodeURIComponent(이름)>` | 종류 · 크기 검사(내용으로) → 방향 바로잡기 · sRGB · 카메라/GPS 정보 지움 → 지금 파일과 같은 형식 · 칸 최소 폭으로 → 사본에만 끼움(원래 파일은 `D:\eereum_studio\_스튜디오_원본\`) → 이미지 캐시 지움 → 놓은 원본은 공유 `_시험\<키>\` → 상태 `trial` · 영상은 사본 `/media/_studio/<키>.mp4` | `slot.updated` |
| `revert` (되돌림) | 대장 | `{ key, variant? }` | 사본의 원래 파일로 되돌림 · 상태 `trial: null` | `slot.updated` |
| `select` (칸 고름) | 대장 | `{ key }` | (없음 · 전달만) | `slot.selected` |
| `refresh` (갱신 요청) | 둘 다 | `{ scope: "slots" \| "all" }` | 대장 다시 만들기(사이트 코드 다시 읽음) | `register.rebuilt` |
| `locale` (언어 바꿈) | 미리보기 | `{ locale: "ko"\|"en"\|"ja"\|"zh-hans"\|"zh-hant" }` | (없음 · 전달만 · 대장은 대체 글 언어 표시에 씀) | `preview.locale` |
| `variant` (수정안 바꿈) | 미리보기 · 대장 | `{ variant: null \| "<PR 브랜치>" }` | 그 브랜치 사본 실행(4302 · V12) 또는 공개본으로 | `variant.changed` |
| `confirm` (확정) | 대장 | `{ key, license, ai, altKo?, note?, replace? }` | 요청\에 이름 규칙대로 복사(request-naming.md) · 고른 초점도 `.json`에 · 상태 `requested` | `slot.updated` |
| `focus` (초점 · v1.3) | 미리보기 | `{ key, x, y }`(0~1) 또는 `{ key, reset: true }`(가운데로) | 놓은 그림(`trial`)이 있는 그림 칸만 · 휴대폰 파일이 따로 있는 칸 = 놓은 원본을 **휴대폰 비율로 그 점 둘레를 다시 잘라** 사본 휴대폰 파일에 · 한 파일 칸 = 점만 저장(화면 위치) · 상태 `trial.focus` · 놓기(drop)는 가운데로 자름 | `slot.updated`(`urls.mobile?` · `focus`) |

## 3. 신호 (도우미 → 모든 창)
| 신호 | data | 받는 창이 할 일 |
|---|---|---|
| `slot.updated` | `{ key, slotId, lane: "image"\|"video", state, url, urls: { pc?, mobile?, video? }, version, warnings?, focus?: { x, y } }` | 미리보기: `[data-slot="key"]`의 그림을 `url?v=<version>`으로 바꿔 끼움(새로 고침 없이 · V3) / 대장: 줄 썸네일 · 상태 갱신 |
| `slot.selected` | `{ key, slotId, paths }` | 미리보기: 그 칸으로 스크롤 + 1.5초 테두리 · 화면에 없으면 그 칸 페이지로 이동(slots의 paths 첫 번째) |
| `register.rebuilt` | `{ repoCommit, added: [key], removed: [key], moved: [{ key, fromSlotId, toSlotId }], orphanTrials: [key] }` | 대장: 다시 그림 + 바뀐 점 보고 / 미리보기: 칸 표시 다시 찾기 |
| `slot.overwritten` (v1.4) | `{ key, slotId, by, at, revision, mine: { at, trial } }` | 대장: "다른 컴퓨터(by)가 방금 이 칸을 바꿨어요" + 줄 다시 그림 / 미리보기: 무시(그 뒤 그림은 slot.updated로 옴) |
| `preview.locale` | `{ locale }` | 대장: 대체 글 칸을 그 언어로(있으면) |
| `variant.changed` | `{ variant, port, state: "starting"\|"ready"\|"failed", message? }` | 미리보기: 나란히 보기 열기/닫기 |
| `helper.status` | `{ site: "starting"\|"ready"\|"failed", repoCommit, message? }` | 두 창 위쪽 띠에 표시 |
| `helper.error` | `{ code, message, key? }` | 창에 짧게 표시 · **v1.2: 이름이 `error`면 브라우저 EventSource의 연결 끊김(onerror)과 섞여 '연결 끊김'으로 보임 → `helper.error`로 바꿈** |

## 4. 오류 코드
| code | 뜻 |
|---|---|
| `FILE_TYPE` | 받지 않는 파일 종류(이미지: jpg · png · webp · heic / 영상: mp4) |
| `FILE_TOO_BIG` | 놓을 수 있는 크기 넘음(이미지 40MB · 영상 200MB) |
| `NOT_ACCEPTED` | 이 칸이 그 종류를 안 받음(accepts) |
| `UNKNOWN_SLOT` | 칸 목록에 없는 key |
| `SITE_NOT_READY` | 쇼핑몰 사본이 아직 안 켜짐 |
| `BUSY` | 같은 칸을 다른 컴퓨터가 바꾸는 중(상태 파일 revision 충돌) |

## 5. 규칙
- 순서: 같은 칸에 대한 명령은 도우미가 한 줄로 차례대로 처리
- 미리보기는 `slot.updated`의 `version`이 지금보다 클 때만 바꿈(늦게 온 옛 신호 무시)
- 신호에 비밀값 · 개인정보 없음 · 파일 경로는 이미지교체 폴더 안 이름만
