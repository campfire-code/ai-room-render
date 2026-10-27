// 画布图片处理（不用 OffscreenCanvas）：读照片、缩小、生成示例纹理。
import { swatchRGBA, type SwatchKind } from './core';

export function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

export function dataUrlToBytes(url: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) throw new Error('图片地址格式不对');
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime: m[1] };
}

const mimeOf = (name: string) => { const e = name.split('.').pop()?.toLowerCase(); return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg'; };

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('这张图片打不开，请换 JPG、PNG 或 WebP 格式的图片（苹果 HEIC 请先转成 JPG）'));
    im.src = src;
  });
}

function canvasBytes(c: HTMLCanvasElement, type: string, q: number): Promise<Uint8Array> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? b.arrayBuffer().then((a) => res(new Uint8Array(a))) : rej(new Error('图片编码失败'))), type, q));
}

export interface Photo { name: string; bytes: Uint8Array; mime: string; w: number; h: number; url: string }

/** 读入一张房间照片：长边缩到 maxSide 以内，重新编码为 JPEG，减小上传体积 */
export async function preparePhoto(raw: Uint8Array, name: string, maxSide = 1536): Promise<Photo> {
  const blobUrl = URL.createObjectURL(new Blob([raw as BlobPart], { type: mimeOf(name) }));
  try {
    const im = await loadImg(blobUrl);
    const k = Math.min(1, maxSide / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * k)), h = Math.max(1, Math.round(im.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(im, 0, 0, w, h);
    const bytes = await canvasBytes(c, 'image/jpeg', 0.9);
    return { name, bytes, mime: 'image/jpeg', w, h, url: bytesToDataUrl(bytes, 'image/jpeg') };
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** 用户上传的材质贴图：缩小到 512 以内存成 JPEG 地址，保存在设置里 */
export async function shrinkToDataUrl(raw: Uint8Array, name: string, maxSide = 512): Promise<string> {
  const p = await preparePhoto(raw, name, maxSide);
  return p.url;
}

function swatchCanvas(kind: SwatchKind, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  c.getContext('2d')!.putImageData(new ImageData(swatchRGBA(kind, size) as unknown as ImageDataArray, size, size), 0, 0);
  return c;
}
export const swatchDataUrl = (kind: SwatchKind, size = 96) => swatchCanvas(kind, size).toDataURL('image/png');
export const swatchPng = (kind: SwatchKind, size = 256) => canvasBytes(swatchCanvas(kind, size), 'image/png', 1);
