import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return (c ^ ~0) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const chunk = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])));
  return Buffer.concat([len, chunk, crc]);
}

function createPng(size, r, g, b) {
  const bgR = 15, bgG = 15, bgB = 20;
  const raw = [];
  const half = size / 2;

  const sqSize = 0.92;
  const sqFeather = 0.04;
  const diInner = 0.70;
  const diFeather = 0.08;

  function sqDist(cx, cy) {
    const ax = Math.abs(cx);
    const ay = Math.abs(cy);
    return Math.pow(Math.pow(ax, 4) + Math.pow(ay, 4), 0.25) - sqSize;
  }

  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const cx = (x - half) / half;
      const cy = (y - half) / half;

      const sd = sqDist(cx, cy);

      if (sd < -sqFeather) {
        const dDist = Math.abs(cx) + Math.abs(cy);
        if (dDist < diInner) {
          const t = (cy + 1) / 2;
          const light = 1.25 - t * 0.4;
          const rr = Math.min(255, Math.round(r * light));
          const gg = Math.min(255, Math.round(g * light));
          const bb = Math.min(255, Math.round(b * light));
          raw.push(rr, gg, bb, 255);
        } else if (dDist < diInner + diFeather) {
          const alpha = (diInner + diFeather - dDist) / diFeather;
          const a255 = Math.round(Math.min(1, alpha) * 255);
          const rr = Math.round((r * a255 + bgR * (255 - a255)) / 255);
          const gg = Math.round((g * a255 + bgG * (255 - a255)) / 255);
          const bb = Math.round((b * a255 + bgB * (255 - a255)) / 255);
          raw.push(rr, gg, bb, 255);
        } else {
          raw.push(bgR, bgG, bgB, 255);
        }
      } else if (sd < sqFeather) {
        const sqAlpha = Math.round(255 * (0.5 - sd / (2 * sqFeather)));
        const dDist = Math.abs(cx) + Math.abs(cy);
        let cR, cG, cB;
        if (dDist < diInner) {
          const t = (cy + 1) / 2;
          const light = 1.25 - t * 0.4;
          cR = Math.min(255, Math.round(r * light));
          cG = Math.min(255, Math.round(g * light));
          cB = Math.min(255, Math.round(b * light));
        } else if (dDist < diInner + diFeather) {
          const alpha = (diInner + diFeather - dDist) / diFeather;
          const a255 = Math.round(Math.min(1, alpha) * 255);
          cR = Math.round((r * a255 + bgR * (255 - a255)) / 255);
          cG = Math.round((g * a255 + bgG * (255 - a255)) / 255);
          cB = Math.round((b * a255 + bgB * (255 - a255)) / 255);
        } else {
          cR = bgR;
          cG = bgG;
          cB = bgB;
        }
        raw.push(cR, cG, cB, sqAlpha);
      } else {
        raw.push(0, 0, 0, 0);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const idat = deflateSync(Buffer.from(raw));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('extension/icons', { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`extension/icons/icon${size}.png`, createPng(size, 108, 92, 231));
}
console.log('Icons generated.');
