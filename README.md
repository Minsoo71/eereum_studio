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
