// 사본 API를 이 컴퓨터 안(127.0.0.1)에서만 여는 시작 파일(G0 공통 ②)
// - 사이트 코드(apps/api/src/server.ts)는 모든 주소로 열고 메일 · 환율 예약 작업도 켬 → 스튜디오는 그 대신 이것으로 app만 띄움
// - 실행: 사본 apps/api 폴더에서 `node --import tsx <이 파일>` (site.mjs가 함) · DATABASE_URL = 내장 DB(localhost)
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const site = process.env.STUDIO_SITE;
const port = Number(process.env.API_PORT ?? 4311);
const { serve } = await import(pathToFileURL(path.join(site, 'apps/api/node_modules/@hono/node-server/dist/index.mjs')).href);
const { app } = await import(pathToFileURL(path.join(site, 'apps/api/src/app.ts')).href);
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`studio api: http://localhost:${info.port}/api/health (127.0.0.1만)`);
});
