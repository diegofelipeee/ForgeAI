#!/usr/bin/env node
/**
 * Generate ForgeAI Companion icons from the SVG source.
 * Uses sharp to render forge-icon.svg into PNG and ICO at all required sizes.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, '..', 'src-tauri', 'icons');
const svgPath = join(iconsDir, 'forge-icon.svg');

if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

/** Create multi-resolution ICO file from PNG buffers */
function createICO(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirSize = 16 * count;
  let dataOffset = 6 + dirSize;

  const entries = [];
  for (const { size, data } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry[0] = size < 256 ? size : 0; // 0 means 256
    entry[1] = size < 256 ? size : 0;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry);
    dataOffset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers.map(p => p.data)]);
}

console.log('Generating ForgeAI Companion icons from SVG...');

const svgBuffer = readFileSync(svgPath);

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
  { name: 'tray-icon.png', size: 32 },
];

for (const { name, size } of sizes) {
  const png = await sharp(svgBuffer, { density: Math.round(72 * size / 32) })
    .resize(size, size)
    .png()
    .toBuffer();
  writeFileSync(join(iconsDir, name), png);
  console.log(`  ✓ ${name} (${size}x${size})`);
}

// ICO with multiple resolutions (16, 32, 48, 256)
const icoSizes = [16, 32, 48, 256];
const icoBuffers = [];
for (const s of icoSizes) {
  const data = await sharp(svgBuffer, { density: Math.round(72 * s / 32) })
    .resize(s, s)
    .png()
    .toBuffer();
  icoBuffers.push({ size: s, data });
}
const ico = createICO(icoBuffers);
writeFileSync(join(iconsDir, 'icon.ico'), ico);
console.log('  ✓ icon.ico (16, 32, 48, 256)');

console.log('Done!');
