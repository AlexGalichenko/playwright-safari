import { inflateSync, deflateSync } from 'zlib';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) crc = (CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Crop a PNG buffer to the sub-rectangle (x, y, w, h).
// Handles RGBA, RGB, grayscale+alpha, and grayscale color types.
export function cropPng(src: Buffer, x: number, y: number, w: number, h: number): Buffer {
  let pos = 8;
  let srcW = 0, srcH = 0, bpp = 4;
  const idats: Buffer[] = [];

  while (pos < src.length - 4) {
    const len = src.readUInt32BE(pos);
    const type = src.toString('ascii', pos + 4, pos + 8);
    const data = src.slice(pos + 8, pos + 8 + len);
    pos += 12 + len;

    if (type === 'IHDR') {
      srcW = data.readUInt32BE(0);
      srcH = data.readUInt32BE(4);
      const ct = data[9];
      bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
    } else if (type === 'IDAT') {
      idats.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idats));
  const srcStride = 1 + srcW * bpp;
  const pixels = Buffer.alloc(srcH * srcW * bpp);

  for (let row = 0; row < srcH; row++) {
    const filter = raw[row * srcStride];
    const dstOff = row * srcW * bpp;
    const prevOff = (row - 1) * srcW * bpp;

    for (let i = 0; i < srcW * bpp; i++) {
      const a = i >= bpp ? pixels[dstOff + i - bpp] : 0;
      const b = row > 0 ? pixels[prevOff + i] : 0;
      const c = row > 0 && i >= bpp ? pixels[prevOff + i - bpp] : 0;
      let v = raw[row * srcStride + 1 + i];
      if (filter === 1)      v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(a, b, c)) & 0xff;
      pixels[dstOff + i] = v;
    }
  }

  // Clamp crop to image bounds
  const cx = Math.max(0, Math.min(x, srcW));
  const cy = Math.max(0, Math.min(y, srcH));
  const cw = Math.min(w, srcW - cx);
  const ch = Math.min(h, srcH - cy);

  // Re-encode with filter 0 (None) for simplicity
  const dstStride = 1 + cw * bpp;
  const dstRaw = Buffer.alloc(ch * dstStride);
  for (let row = 0; row < ch; row++) {
    dstRaw[row * dstStride] = 0;
    pixels.copy(dstRaw, row * dstStride + 1, ((cy + row) * srcW + cx) * bpp, ((cy + row) * srcW + cx + cw) * bpp);
  }

  const colorType = bpp === 4 ? 6 : bpp === 3 ? 2 : bpp === 2 ? 4 : 0;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cw, 0);
  ihdr.writeUInt32BE(ch, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;

  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(dstRaw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
