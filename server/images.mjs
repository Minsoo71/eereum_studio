// 놓은 그림 다루기: 검사 → 방향 바로잡기 → sRGB → 카메라 · GPS 정보 지움(sharp 기본: 메타데이터 안 씀) → 칸 규격으로 줄이기
import sharp from 'sharp';
import { config } from './config.mjs';
import { hasGpsTag } from './safety.mjs';

export class StudioError extends Error {
  constructor(code, message, detail) { super(message); this.code = code; if (detail !== undefined) this.detail = detail; }
}

/** 받은 파일 검사(내용으로 판단 · 확장자 안 믿음) */
export async function inspect(buf, fileName = '') {
  const lower = fileName.toLowerCase();
  if (config.limits.videoExt.some((e) => lower.endsWith(e))) {
    if (buf.length > config.limits.videoBytes) throw new StudioError('FILE_TOO_BIG', '영상은 200MB까지 놓을 수 있어요.');
    // mp4 머리('ftyp')로 확인
    if (buf.subarray(4, 8).toString('latin1') !== 'ftyp') throw new StudioError('FILE_TYPE', 'mp4 영상이 아니에요.');
    return { media: 'video', format: 'mp4', bytes: buf.length, ...mp4Size(buf) };
  }
  if (buf.length > config.limits.imageBytes) throw new StudioError('FILE_TOO_BIG', '그림은 40MB까지 놓을 수 있어요.');
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { throw new StudioError('FILE_TYPE', '그림 파일이 아니에요(jpg · png · webp · heic).'); }
  if (!config.limits.imageTypes.includes(meta.format)) throw new StudioError('FILE_TYPE', `받지 않는 형식이에요(${meta.format}).`);
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    media: 'image', format: meta.format, bytes: buf.length,
    width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height,
    space: meta.space, hasExif: Boolean(meta.exif), hasGps: hasGpsTag(meta.exif), // R-a: 글자 "GPS"가 아니라 EXIF GPS 칸(0x8825)
  };
}

/**
 * mp4 화면 크기(PC2-스튜디오-9 · 세로 영상 = 휴대폰 칸 고르기): 영상 트랙 'tkhd' 상자의 폭 · 높이(16.16 고정소수)
 * · 90° 돌림 행렬이면 폭 · 높이를 바꿈 · 못 찾으면 {}(크기 모름 = 예전처럼)
 */
export function mp4Size(buf) {
  const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'edts']);
  let best = null;
  const walk = (start, end, depth) => {
    let p = start;
    while (p + 8 <= end && depth < 8) {
      let size = buf.readUInt32BE(p);
      const type = buf.toString('latin1', p + 4, p + 8);
      let head = 8;
      if (size === 1) { if (p + 16 > end) break; size = Number(buf.readBigUInt64BE(p + 8)); head = 16; }
      else if (size === 0) size = end - p;
      if (size < head || p + size > end) break;
      if (CONTAINERS.has(type)) walk(p + head, p + size, depth + 1);
      else if (type === 'tkhd') {
        const body = p + head;
        const matrix = body + (buf[body] === 1 ? 52 : 40);
        const wh = matrix + 36;
        if (wh + 8 <= p + size) {
          const w = buf.readUInt32BE(wh) / 65536;
          const h = buf.readUInt32BE(wh + 4) / 65536;
          const b = buf.readInt32BE(matrix + 4); // 행렬 b ≠ 0 = 90° · 270° 돌림
          if (w > 0 && h > 0 && (!best || w * h > best.width * best.height)) best = b !== 0 ? { width: Math.round(h), height: Math.round(w) } : { width: Math.round(w), height: Math.round(h) };
        }
      }
      p += size;
    }
  };
  try { walk(0, buf.length, 0); } catch { return {}; }
  return best ?? {};
}

/** 사본에 끼울 그림 한 장(지금 파일과 같은 형식 · 같은 이름) */
export async function forSite(buf, { format, width }) {
  const img = sharp(buf, { failOn: 'none' }).rotate().toColourspace('srgb');
  const resized = img.resize({ width, withoutEnlargement: true });
  if (format === 'png') return resized.png({ compressionLevel: 9 }).toBuffer();
  if (format === 'webp') return resized.webp({ quality: 82 }).toBuffer();
  return resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

/** 확정용 묶음: webp + jpg × 960 · 1600 (원본보다 크게 늘리지 않음) */
export async function variants(buf, widths = [960, 1600], formats = ['webp', 'jpg']) {
  const out = [];
  for (const w of widths) {
    for (const f of formats) {
      const data = await sharp(buf, { failOn: 'none' }).rotate().toColourspace('srgb').resize({ width: w, withoutEnlargement: true })
        [f === 'jpg' ? 'jpeg' : f](f === 'jpg' ? { quality: 85, mozjpeg: true } : { quality: 82 }).toBuffer();
      out.push({ width: w, format: f, data });
    }
  }
  return out;
}

/** 썸네일(긴 변 240 · jpg) */
export const thumb = (buf) => sharp(buf, { failOn: 'none', density: 144 }).rotate().flatten({ background: '#ffffff' }).resize({ width: 240, height: 240, fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
