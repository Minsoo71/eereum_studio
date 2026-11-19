// 놓은 그림 다루기: 검사 → 방향 바로잡기 → sRGB → 카메라 · GPS 정보 지움(sharp 기본: 메타데이터 안 씀) → 칸 규격으로 줄이기
import sharp from 'sharp';
import { config } from './config.mjs';

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
    return { media: 'video', format: 'mp4', bytes: buf.length };
  }
  if (buf.length > config.limits.imageBytes) throw new StudioError('FILE_TOO_BIG', '그림은 40MB까지 놓을 수 있어요.');
  let meta;
  try { meta = await sharp(buf).metadata(); } catch { throw new StudioError('FILE_TYPE', '그림 파일이 아니에요(jpg · png · webp · heic).'); }
  if (!config.limits.imageTypes.includes(meta.format)) throw new StudioError('FILE_TYPE', `받지 않는 형식이에요(${meta.format}).`);
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    media: 'image', format: meta.format, bytes: buf.length,
    width: rotated ? meta.height : meta.width, height: rotated ? meta.width : meta.height,
    space: meta.space, hasExif: Boolean(meta.exif), hasGps: Boolean(meta.exif && /GPS/i.test(meta.exif.toString('latin1'))),
  };
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
