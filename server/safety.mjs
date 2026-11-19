// 안전 점검 도우미(PC6 검증 11-19 고칠 점 R-1 · R-a · R-b · R-c)
import { execFile } from 'node:child_process';

/**
 * R-a: EXIF 안에 진짜 GPS 칸(IFD0의 태그 0x8825 = GPS 정보 위치)이 있는지.
 * 글자 "GPS"를 찾지 않음(설명 · 카메라 이름에 "GPS"가 있어도 경고 X · 진짜 GPS 칸이면 경고 O).
 * buf = sharp metadata().exif ("Exif\0\0" + TIFF) 또는 TIFF 그대로.
 */
export function hasGpsTag(buf) {
  if (!buf || buf.length < 8) return false;
  let t = 0;
  if (buf.subarray(0, 4).toString('latin1') === 'Exif') t = 6;
  if (buf.length < t + 8) return false;
  const order = buf.subarray(t, t + 2).toString('latin1');
  if (order !== 'II' && order !== 'MM') return false;
  const le = order === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(t + 2) !== 42) return false;
  const ifd0 = t + u32(t + 4);
  if (ifd0 + 2 > buf.length) return false;
  const n = u16(ifd0);
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > buf.length) return false;
    if (u16(e) === 0x8825) return u32(e + 8) > 0; // 위치가 0이 아니면 GPS 칸 있음
  }
  return false;
}

/** R-b: 알아낸 형식 → 저장 · 확정 확장자(놓은 파일 이름은 믿지 않음) */
const EXT = { jpeg: '.jpg', png: '.png', webp: '.webp', heif: '.heic', avif: '.avif', tiff: '.tif', mp4: '.mp4' };
export const extFor = (format) => EXT[format] ?? null;
const SAFE_EXT = new Set(Object.values(EXT));
/** 확정 때: 시험 파일 확장자가 안전 목록이면 그대로 · 아니면(R-b 전에 놓은 옛 파일) 파일 머리로 알아냄 · 모르면 null */
export function safeExt(fileName, head) {
  const e = (fileName.match(/\.[^.\\/]+$/)?.[0] ?? '').toLowerCase();
  if (SAFE_EXT.has(e)) return e;
  if (!head || head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return '.jpg';
  if (head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return '.png';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp';
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('latin1');
    if (/^(heic|heix|mif1|msf1|heis)$/.test(brand)) return '.heic';
    if (/^avi[fs]$/.test(brand)) return '.avif';
    return '.mp4';
  }
  return null;
}

/** R-c: Host 머리글이 이 컴퓨터(localhost)인지 — 다른 이름으로 들어오는 요청(DNS 바꿔치기 등)은 거절 */
export function isLocalHost(host) {
  if (!host) return false;
  const m = String(host).trim().toLowerCase().match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!m) return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(m[1]);
}

/** R-1: 내장 DB 관리 포트(51213 · prisma dev가 모든 주소로 엶)를 밖에서 못 들어오게 막는 Windows 방화벽 규칙 */
export const DB_FIREWALL_RULE = 'eereum studio - block DB 51213';
/** 규칙이 있는지(읽기만 · 관리자 권한 필요 없음) → true · false · null(확인 못 함) */
export function hasDbFirewallRule(run = execFile) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `if (Get-NetFirewallRule -DisplayName '${DB_FIREWALL_RULE}' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' }) { 'yes' } else { 'no' }`], { timeout: 15000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null);
      resolve(String(out).trim() === 'yes');
    });
  });
}
