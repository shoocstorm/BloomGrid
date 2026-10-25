#!/usr/bin/env node
/**
 * Generates the 1024² BloomGrid app icon (src-tauri/icons/app-icon.png) without image libraries:
 * a rounded tile with a sunrise gradient and a four-petal bloom, encoded as PNG with zlib.
 * Then run `bunx tauri icon src-tauri/icons/app-icon.png` to derive every platform size.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 1024;
const px = Buffer.alloc(N * N * 4);
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const u = x / N - 0.5;
    const v = y / N - 0.5;
    // Rounded-square mask (superellipse) with a soft edge.
    const d = Math.pow(Math.abs(u) ** 5 + Math.abs(v) ** 5, 1 / 5);
    const mask = 1 - smooth(0.44, 0.452, d);
    // Background: deep teal at the bottom to a dawn mint at the top.
    const t = y / N;
    let r = mix(150, 13, t);
    let g = mix(242, 64, t);
    let b = mix(214, 58, t);
    // Four petals around the centre (pink → gold), a teal core.
    const a = Math.atan2(v, u);
    const rr = Math.hypot(u, v);
    const petal = Math.abs(Math.cos(2 * a)) ** 0.6 * 0.3 + 0.04;
    const inPetal = 1 - smooth(petal - 0.012, petal, rr);
    const pr = mix(255, 255, rr / 0.34);
    const pg = mix(183, 224, rr / 0.34);
    const pb = mix(213, 138, rr / 0.34);
    r = mix(r, pr, inPetal);
    g = mix(g, pg, inPetal);
    b = mix(b, pb, inPetal);
    const core = 1 - smooth(0.06, 0.07, rr);
    r = mix(r, 127, core);
    g = mix(g, 247, core);
    b = mix(b, 230, core);
    const o = (y * N + x) * 4;
    px[o] = r;
    px[o + 1] = g;
    px[o + 2] = b;
    px[o + 3] = Math.round(mask * 255);
  }

// PNG: signature, IHDR, IDAT (filter byte 0 per row), IEND.
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0);
ihdr.writeUInt32BE(N, 4);
ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const out = process.argv[2] ?? 'src-tauri/icons/app-icon.png';
writeFileSync(out, png);
console.log(`[icon] ${out} ${Math.round(png.length / 1024)} KB`);
