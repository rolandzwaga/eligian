// Writes packages/extension/resources/icon.png: the Marketplace icon (a PNG of
// at least 128x128 px; the Marketplace refuses SVG). Three timeline bars and a
// playhead on a dark rounded square, the motif of resources/timeline.svg.
// No image library: shapes are sampled 4x4 per pixel and written with zlib.
//
//   node scripts/generate-extension-icon.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZE = 256;
const SAMPLES = 4;

const hex = h => [1, 3, 5].map(i => Number.parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const inRoundedRect = (x, y, { x0, y0, x1, y1, r }) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
const inCircle = (x, y, { cx, cy, r }) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const top = hex('#3730a3');
const bottom = hex('#1e1b4b');
/** Painted in order, the last on top */
const shapes = [
  { color: hex('#a5b4fc'), test: (x, y) => inRoundedRect(x, y, { x0: 40, y0: 64, x1: 150, y1: 98, r: 14 }) },
  { color: hex('#f9a8d4'), test: (x, y) => inRoundedRect(x, y, { x0: 96, y0: 111, x1: 216, y1: 145, r: 14 }) },
  { color: hex('#67e8f9'), test: (x, y) => inRoundedRect(x, y, { x0: 64, y0: 158, x1: 176, y1: 192, r: 14 }) },
  { color: hex('#fbbf24'), test: (x, y) => inRoundedRect(x, y, { x0: 124, y0: 44, x1: 132, y1: 212, r: 4 }) },
  { color: hex('#fbbf24'), test: (x, y) => inCircle(x, y, { cx: 128, cy: 44, r: 11 }) },
];
const background = { x0: 0, y0: 0, x1: SIZE, y1: SIZE, r: 48 };

const rgba = Buffer.alloc(SIZE * SIZE * 4);
for (let py = 0; py < SIZE; py++) {
  for (let px = 0; px < SIZE; px++) {
    const sum = [0, 0, 0];
    let covered = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const x = px + (sx + 0.5) / SAMPLES;
        const y = py + (sy + 0.5) / SAMPLES;
        if (!inRoundedRect(x, y, background)) continue;
        let color = mix(top, bottom, y / SIZE);
        for (const shape of shapes) {
          if (shape.test(x, y)) color = shape.color;
        }
        for (let i = 0; i < 3; i++) sum[i] += color[i];
        covered++;
      }
    }
    const at = (py * SIZE + px) * 4;
    for (let i = 0; i < 3; i++) rgba[at + i] = covered ? Math.round(sum[i] / covered) : 0;
    rgba[at + 3] = Math.round((covered / (SAMPLES * SAMPLES)) * 255);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buffer => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 6; // RGBA
const rows = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  rows[y * (SIZE * 4 + 1)] = 0; // no filter
  rgba.copy(rows, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = new URL('../packages/extension/resources/icon.png', import.meta.url);
writeFileSync(out, png);
console.log(`Wrote ${out.pathname} (${SIZE}x${SIZE}, ${png.length} bytes)`);
