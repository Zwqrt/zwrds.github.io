// Сжатие фото на клиенте: до 1600 px по длинной стороне, JPEG ~80%.

export interface Compressed {
  blob: Blob;
  width: number;
  height: number;
}

const MAX = 1600;

async function decode(file: Blob): Promise<{ src: CanvasImageSource; w: number; h: number; close(): void }> {
  if ('createImageBitmap' in window) {
    try {
      const bm = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { src: bm, w: bm.width, h: bm.height, close: () => bm.close() };
    } catch {
      /* fallback ниже */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

export async function compressImage(file: Blob, max = MAX, quality = 0.8): Promise<Compressed> {
  const d = await decode(file);
  const k = Math.min(1, max / Math.max(d.w, d.h));
  const width = Math.round(d.w * k);
  const height = Math.round(d.h * k);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(d.src, 0, 0, width, height);
  d.close();
  const blob = await new Promise<Blob>((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Не удалось сжать фото'))), 'image/jpeg', quality),
  );
  return { blob, width, height };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} КБ`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} МБ`;
  return `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} ГБ`;
}
