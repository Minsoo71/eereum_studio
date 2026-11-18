// 신호 허브(contract/events.md): SSE로 모든 창에 보냄 · 모든 신호를 공유 폴더 _로그\events-<날짜>.jsonl에 한 줄씩
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.mjs';

const clients = new Set();
const recent = []; // 다시 연결 때 Last-Event-ID 뒤로 보내기(최근 200개)
let seq = 0;

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
