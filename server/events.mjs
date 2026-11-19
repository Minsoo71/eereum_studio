// 신호 허브(contract/events.md): SSE로 모든 창에 보냄 · 모든 신호를 공유 폴더 _로그\events-<날짜>.jsonl에 한 줄씩
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const clients = new Set();
const recent = []; // 다시 연결 때 Last-Event-ID 뒤로 보내기(최근 200개)
let seq = 0;
// helper.status는 늘 지금 사본 상태(site · repoCommit)를 같이 보냄(contract/events.md) — 경고 · DB · 충돌 소식만 보내면
// 미리보기 위 띠가 "사본 undefined"로 바뀌던 문제(PC2-스튜디오-1)
let statusBase = () => ({});
export const setStatusBase = (fn) => { statusBase = fn; };

export function subscribe(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write('retry: 2000\n\n');
  const last = Number(req.headers['last-event-id'] ?? 0);
  for (const e of recent) if (e.id > last) res.write(e.text);
  clients.add(res);
  const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 15000);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

/** 신호 보내기 · from = register | preview | helper */
export function emit(event, data, from = 'helper') {
  if (event === 'helper.status') data = { ...statusBase(), ...data };
  seq += 1;
  const body = { v: 1, at: new Date().toISOString(), from, seq, ...data };
  const text = `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify(body)}\n\n`;
  recent.push({ id: seq, text });
  if (recent.length > 200) recent.shift();
  for (const c of clients) c.write(text);
  try {
    mkdirSync(config.dirs.log, { recursive: true });
    appendFileSync(path.join(config.dirs.log, `events-${body.at.slice(0, 10)}.jsonl`), JSON.stringify({ event, ...body }) + '\n');
  } catch { /* 로그 실패는 무시 */ }
  return body;
}

export const clientCount = () => clients.size;
