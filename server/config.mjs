// 스튜디오 설정 (비밀값 없음 · 경로 · 포트만)
// - 바꾸려면 환경 변수로: STUDIO_ROOT · STUDIO_SHARE · STUDIO_SITE · STUDIO_MACHINE
// - 공통 규칙(G0 11-18): 주소는 localhost만 · 사본 API_ORIGIN 고정 · 상태 파일 = 칸 키
import os from 'node:os';
import path from 'node:path';

const env = process.env;

export const config = {
  /** 내 컴퓨터 작업 폴더(영문 경로) · 쇼핑몰 사본 · 원본 보관 · 캐시 */
  root: env.STUDIO_ROOT ?? 'D:/eereum_studio',
  /** Synology 공유 폴더(대장 · 상태 · 요청 · 시험 그림 · 로그) */
  share: env.STUDIO_SHARE ?? 'D:/Synology Drive VISCOM/eeruem/이미지교체',
  /** 이 컴퓨터 이름(상태 파일 · 요청에 적음) */
  machine: env.STUDIO_MACHINE ?? os.hostname(),
  /** 포트(모두 localhost만) */
  ports: { helper: 4300, site: 4301, variant: 4302, siteDev: 4351, variantDev: 4352, api: 4311 }, // 4301 · 4302 = 중계(bridge 끼움 · PC11) → next dev 4351 · 4352
};
config.site = env.STUDIO_SITE ?? path.join(config.root, 'site');
config.web = path.join(config.site, 'apps/web');
config.publicDir = path.join(config.web, 'public');
config.imageCache = path.join(config.web, '.next/dev/cache/images');
config.originals = path.join(config.root, '_스튜디오_원본'); // 사본에서 바꾸기 전 원래 파일(되돌리기용)
config.dirs = {
  state: path.join(config.share, '_상태'),
  trial: path.join(config.share, '_시험'),
  request: path.join(config.share, '요청'),
  previous: path.join(config.share, '이전'), // 바꾼 앞 요청은 이전_바뀐요청 (기능 ②)
  log: path.join(config.share, '_로그'),
  thumbs: path.join(config.share, '_썸네일'),
};
/** 사본 주소(창은 localhost로만 엶 · 127.0.0.1이면 Next 개발 서버가 HMR 거부) */
config.siteOrigin = `http://localhost:${config.ports.site}`;
config.variantOrigin = `http://localhost:${config.ports.variant}`;
config.helperOrigin = `http://localhost:${config.ports.helper}`;
/** 놓을 수 있는 파일 */
config.limits = {
  imageBytes: 40 * 1024 * 1024,
  videoBytes: 200 * 1024 * 1024,
  imageTypes: ['jpeg', 'png', 'webp', 'heif', 'avif', 'tiff'],
  videoExt: ['.mp4'],
  warnImageBytes: 600 * 1024, // 줄인 뒤 이보다 크면 경고
};
