/**
 * Generates electron/icon.ico with a 64x64 Gravity BP branded icon.
 * Uses ICO format with embedded 32-bit BMP. No external deps required.
 * Run: node gen-icon.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const SIZES = [256, 64, 48, 32, 16];

function makeImageBMP(size) {
  const pixelData = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5;
      const cy = size / 2 - 0.5;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const outerR  = size / 2 - 1;
      const ringW   = Math.max(2, size * 0.12);
      const innerR  = outerR - ringW;
      const dotR    = Math.max(1, size * 0.10);

      let R = 0, G = 0, B = 0, A = 0;

      if (dist <= outerR) {
        // Outer ring: #58a6ff
        R = 0x58; G = 0xa6; B = 0xff; A = 255;

        if (dist <= innerR) {
          // Inner background: #161b22
          R = 0x16; G = 0x1b; B = 0x22; A = 255;

          // Center dot: #58a6ff
          if (dist <= dotR) {
            R = 0x58; G = 0xa6; B = 0xff; A = 255;
          }

          // Small "notch" lines at 3, 6, 9, 12 o'clock (circuit board look)
          const angle = Math.atan2(y - cy, x - cx);
          const cardinal = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
          for (const a of cardinal) {
            const diff = Math.abs(((angle - a) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
            if (diff < 0.18 && dist > innerR * 0.5 && dist < innerR * 0.85) {
              R = 0x58; G = 0xa6; B = 0xff; A = 200;
            }
          }
        }
      }

      // BMP rows are stored bottom-up
      const row = size - 1 - y;
      const i   = (row * size + x) * 4;
      pixelData[i]     = B;
      pixelData[i + 1] = G;
      pixelData[i + 2] = R;
      pixelData[i + 3] = A;
    }
  }

  const andMask = Buffer.alloc(Math.ceil(size / 8) * 4 * size, 0);

  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);   // doubled for ICO
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(pixelData.length + andMask.length, 20);

  return Buffer.concat([header, pixelData, andMask]);
}

const images  = SIZES.map(makeImageBMP);
const count   = images.length;
const headerBytes = 6 + count * 16;

const icoHeader = Buffer.alloc(6);
icoHeader.writeUInt16LE(0, 0);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(count, 4);

const dirEntries = [];
let offset = headerBytes;
for (let i = 0; i < count; i++) {
  const s = SIZES[i];
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0);
  e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  dirEntries.push(e);
  offset += images[i].length;
}

const ico = Buffer.concat([icoHeader, ...dirEntries, ...images]);
const out = path.join(__dirname, 'icon.ico');
fs.writeFileSync(out, ico);
console.log(`icon.ico written: ${ico.length} bytes (${SIZES.join('x')} px sizes)`);
