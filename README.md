# eereum 이미지 교체 스튜디오 (`Minsoo71/eereum_studio` · 비공개)

내 컴퓨터에서만 도는 도우미예요. 대장 창에 그림을 끌어다 놓으면 **내 컴퓨터의 쇼핑몰 사본**에서 그 칸이 바로 바뀌어 보이고, "확정"하면 공유 폴더 `요청\`에 들어가요. **공개 사이트 · 쇼핑몰 저장소 main · 운영 DB는 바뀌지 않아요.**

- 쇼핑몰 저장소(`eereum_ring`)와 따로 · 쇼핑몰은 내 컴퓨터 사본(`D:\eereum_studio\site`)으로만 읽음
- 계획 · 결정: Synology `eeruem\이미지교체\스튜디오_개발계획.md` · `G0_보고.md` · 약속 = `contract/`

## 폴더
| 폴더 | 담당 | 내용 |
|---|---|---|
| `contract/` | PC9(바꾸면 PC9만 · 진행판으로 알림) | 약속 파일(칸 모양 · 신호 · 상태 · 요청 이름 · data-slot) |
| `server/` | PC9 | 도우미(http://localhost:4300) · 칸 목록 · 놓기 · 되돌리기 · 확정 · 최신으로 |
| `register/` | PC9 | 대장 창(/register) |
| `preview/` | PC11 | 미리보기 창(/preview) · 수정안 보기 |
| `scripts/` | PC9 | 설치 · 실행 · 요청 처리(M5) |
| `test/` | 각자 | 시험 |

## 브랜치
- `integration` = 통합(하루 2번 12:00 · 18:00 · PC9가 합침) · `main` 직접 push X · 강제 push X
- `studio/server`(PC9) · `studio/preview`(PC11) → `integration`으로

## 공통 규칙 (G0 11-18 확정)
1. 쇼핑몰 사본 실행 때 `API_ORIGIN=http://localhost:4311` 고정 — 빼면 사본이 4000(개발 API · DB)을 씀
2. 웹 `--hostname localhost` · 도우미 127.0.0.1 · 사본 API · 내장 DB도 localhost만
3. 내장 DB `prisma dev` 0.16.28 고정(`prisma dev @0.16.28 …`) · 기본은 DB 없이(35칸 중 34칸)
4. `NODE_OPTIONS=--use-system-ca` · Node 26(`.nvmrc`) · 주소는 `localhost`(127.0.0.1이면 화면 스크립트 안 붙음)
5. 상태 파일 = 공유 `_상태\<칸 키>.json`
6. 비밀값 · `.env` 없음 · 운영 DB 접속 없음

## 설치 · 켜기 (M4)
| 할 일 | 명령 |
|---|---|
| 설치(한 번) | `powershell -ExecutionPolicy Bypass -File scripts\install.ps1` (데이터 화면도: `-WithDb`) |
| 켜기 | 바탕화면 "이미지 스튜디오 열기" 또는 `node server/index.mjs` |
| 대장 창 | http://localhost:4300/register |
| 미리보기 창 | http://localhost:4300/preview (PC11) |
| 쇼핑몰 사본 | http://localhost:4301 (도우미가 켬 · `next dev --hostname localhost`) |
| 데이터 화면 | 환경 변수 `STUDIO_DB=1`(내장 DB @0.16.28 + 사본 API 127.0.0.1:4311 · 예약 작업 안 켬) |

## 하는 일
| 단계 | 내용 |
|---|---|
| 칸 목록 | 사본 `content/media.ts`를 매번 새로 읽음 · 칸 ID `P페이지-순번` · 새 칸 · 없어진 칸 · 옮긴 칸 알림 |
| 놓기(M1) | 내용으로 종류 검사(jpg · png · webp · heic / mp4) · 40MB(영상 200MB) · 방향 · sRGB · 카메라/GPS 정보 지움 · 칸 최소 폭 · 사본에만 끼움 · 원래 파일 보관 · 이미지 캐시 지움 · 놓은 원본은 공유 `_시험\<키>\` |
| 되돌리기 | 사본 원래 파일로 |
| 확정(M3) | 공유 `요청\<칸ID>_<YYYYMMDD-HHMM>_<설명>` + 같은 이름 `.json`(출처 · 라이선스 · AI · 대체 글 · 메모) · CC BY-NC 막음 |
| 최신으로(M4) | 사본을 GitHub main 최신으로(읽기만 · 빨리 감기) · 시험 그림 다시 끼움 · 바뀐 점 보고 |
| 요청 처리(M5 · PC9) | `scripts/process-requests.mjs` → 쇼핑몰 저장소에 새 파일 이름(-vN) · media.ts · 이전 보관 · 상태 · 로컬 커밋 + PR 설명 초안(push · 합치기는 승인 뒤) |
| 안전 | 다른 사이트(Origin) 요청 403 · 같은 칸 동시 변경 BUSY · 비밀값 0 |

## 시험
- `pnpm test` — 단위(카메라 정보 지움 · sRGB · 형식 · 칸 목록 = 약속 샘플 · BUSY)
- `node scripts/e2e-register.mjs D:/dev/eereum_ring` — 도우미 + 사본 켠 채로 끝까지(놓기 → 되돌리기 → 확정 · 막기)
