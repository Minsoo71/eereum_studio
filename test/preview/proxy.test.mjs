import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { injectBridge, createSiteProxy } from '../../preview/proxy.mjs';

test('injectBridge: </body> 앞에 한 줄 · 두 번 넣지 않음 · body 없으면 끝에', () => {
  const out = injectBridge('<html><body><p>x</p></body></html>', 'http://localhost:4300');
  assert.match(out, /<script src="\/__studio\/bridge\.js\?parent=http%3A%2F%2Flocalhost%3A4300" data-studio-bridge><\/script><\/body>/);
  assert.equal(injectBridge(out, 'http://localhost:4300'), out);
  assert.match(injectBridge('<p>no body</p>', 'x'), /<p>no body<\/p><script/);
});

function target() {
  const seen = [];
  const s = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host, enc: req.headers['accept-encoding'] });
    if (req.url === '/redir') return res.writeHead(307, { location: `http://localhost:${s.address().port}/ko` }), res.end();
    if (req.url === '/data.json') return res.writeHead(200, { 'content-type': 'application/json' }), res.end('{"a":1}');
    const body = '<html><body><h1>사본</h1></body></html>';
    if (req.url === '/chunked') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); // 길이 없이 = chunked (next dev와 같음)
      res.write(body.slice(0, 10));
      return res.end(body.slice(10));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) });
    res.end(body);
  });
  s.on('upgrade', (req, socket) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
    socket.on('data', (d) => socket.write(`echo:${d}`));
  });
  return new Promise((r) => s.listen(0, 'localhost', () => r({ s, seen, port: s.address().port })));
}

test('중계: HTML에 끼움 · 다른 파일은 그대로 · 옮김 주소 바꿈 · bridge.js 제공 · localhost만', async () => {
  const t = await target();
  const p = await createSiteProxy({ listenPort: 0, targetPort: t.port, parentOrigin: 'http://localhost:4300' });
  const port = p.server.address().port;
  try {
    assert.ok(['127.0.0.1', '::1'].includes(p.server.address().address), `localhost만: ${p.server.address().address}`);
    const html = await (await fetch(`http://localhost:${port}/`)).text();
    assert.match(html, /<h1>사본<\/h1><script src="\/__studio\/bridge\.js/);
    assert.equal(t.seen[0].enc, 'identity');
    assert.equal(t.seen[0].host, `localhost:${t.port}`);
    const chunked = await (await fetch(`http://localhost:${port}/chunked`)).text();
    assert.match(chunked, /<h1>사본<\/h1><script src="\/__studio\/bridge\.js/, 'chunked HTML도 끼움');
    assert.equal(await (await fetch(`http://localhost:${port}/data.json`)).text(), '{"a":1}');
    const r = await fetch(`http://localhost:${port}/redir`, { redirect: 'manual' });
    assert.equal(r.headers.get('location'), `http://localhost:${port}/ko`);
    const js = await fetch(`http://localhost:${port}/__studio/bridge.js?parent=x`);
    assert.match(js.headers.get('content-type'), /javascript/);
    assert.match(await js.text(), /studio:ready/);
  } finally {
    await p.close();
    t.s.close();
  }
});

test('중계: 사본이 꺼져 있으면 502 SITE_NOT_READY', async () => {
  const free = await new Promise((r) => {
    const s = net.createServer().listen(0, 'localhost', () => {
      const port = s.address().port;
      s.close(() => r(port));
    });
  });
  const p = await createSiteProxy({ listenPort: 0, targetPort: free });
  try {
    const r = await fetch(`http://localhost:${p.server.address().port}/`);
    assert.equal(r.status, 502);
    assert.match(await r.text(), /SITE_NOT_READY/);
  } finally {
    await p.close();
  }
});

test('중계: 화면 갱신 연결(웹소켓 upgrade)을 그대로 넘김', async () => {
  const t = await target();
  const p = await createSiteProxy({ listenPort: 0, targetPort: t.port });
  try {
    const got = await new Promise((resolve, reject) => {
      const c = net.connect(p.server.address().port, 'localhost', () => {
        c.write('GET /_next/webpack-hmr HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
      });
      let buf = '';
      c.on('data', (d) => {
        buf += d;
        if (buf.includes('101') && !buf.includes('echo:')) c.write('ping');
        if (buf.includes('echo:ping')) c.end(), resolve(buf);
      });
      c.on('error', reject);
      setTimeout(() => reject(new Error('timeout ' + buf)), 3000);
    });
    assert.match(got, /101 Switching Protocols/);
    assert.match(got, /echo:ping/);
  } finally {
    await p.close();
    t.s.close();
  }
});
