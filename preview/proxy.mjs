// 쇼핑몰 사본 중계 (M2 · PC11 · 진행판 Q-S1 추천안)
// 미리보기 창(4300)과 사본(4301 · 4302)은 출처가 달라 창 안을 직접 만질 수 없음 → 이 중계가 사본 화면 HTML에
// 연결 스크립트(bridge.js) 한 줄을 끼우고, 미리보기는 postMessage로만 대화한다. 사이트 코드 · 사본 파일 변화 0.
// - localhost에서만 열림(V6 · V9) · 화면 갱신 연결(웹소켓 · HMR)은 그대로 넘김 · 압축은 끄고 받아 끼움
import http from 'node:http';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BRIDGE_PATH = '/__studio/bridge.js';
const bridgeSource = () => readFileSync(fileURLToPath(new URL('./bridge.js', import.meta.url)), 'utf8');

/** HTML에 연결 스크립트 한 줄 끼우기 (이미 있으면 그대로) */
export function injectBridge(html, parentOrigin) {
  if (html.includes(BRIDGE_PATH)) return html;
  const tag = `<script src="${BRIDGE_PATH}?parent=${encodeURIComponent(parentOrigin)}" data-studio-bridge></script>`;
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + tag : html.slice(0, i) + tag + html.slice(i);
}

/**
 * @param {{ listenPort: number, targetPort: number, parentOrigin?: string, host?: string }} opts
 * @returns {Promise<{ server: http.Server, close: () => Promise<void> }>}
 */
export function createSiteProxy({ listenPort, targetPort, parentOrigin = 'http://localhost:4300', host = 'localhost' }) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith(BRIDGE_PATH)) {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
      res.end(bridgeSource());
      return;
    }
    const headers = { ...req.headers, host: `localhost:${targetPort}`, 'accept-encoding': 'identity' };
    const up = http.request({ host: 'localhost', port: targetPort, method: req.method, path: req.url, headers }, (ur) => {
      const h = { ...ur.headers };
      if (h.location) h.location = h.location.replace(`localhost:${targetPort}`, `localhost:${server.address().port}`);
      const isHtml = String(h['content-type'] || '').includes('text/html');
      if (!isHtml) {
        res.writeHead(ur.statusCode, h);
        ur.pipe(res);
        return;
      }
      const chunks = [];
      ur.on('data', (c) => chunks.push(c));
      ur.on('end', () => {
        const body = Buffer.from(injectBridge(Buffer.concat(chunks).toString('utf8'), parentOrigin), 'utf8');
        delete h['content-length'];
        delete h['content-encoding'];
        delete h['transfer-encoding']; // 길이를 정해 보내므로(둘 다 있으면 브라우저가 거부)
        h['content-length'] = String(body.length);
        res.writeHead(ur.statusCode, h);
        res.end(body);
      });
    });
    up.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`SITE_NOT_READY · 사본(localhost:${targetPort})이 아직 안 켜짐 (${err.code})`);
    });
    req.pipe(up);
  });

  // 화면 갱신 연결(Next 개발 서버 웹소켓)은 그대로 넘김
  const upgraded = new Set();
  server.on('upgrade', (req, socket, head) => {
    const up = net.connect(targetPort, 'localhost', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const k = req.rawHeaders[i];
        const v = k.toLowerCase() === 'host' ? `localhost:${targetPort}` : req.rawHeaders[i + 1];
        lines.push(`${k}: ${v}`);
      }
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    const end = () => {
      socket.destroy();
      up.destroy();
      upgraded.delete(end);
    };
    upgraded.add(end);
    up.on('error', end);
    up.on('close', end);
    socket.on('error', end);
    socket.on('close', end);
  });

  // 끌 때는 열린 연결(웹소켓 포함)까지 바로 끊음 — 수정안 4302를 닫으면 바로 메모리 반납
  const close = () =>
    new Promise((r) => {
      for (const end of [...upgraded]) end();
      server.close(() => r());
      server.closeAllConnections?.();
    });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, host, () => resolve({ server, close }));
  });
}
