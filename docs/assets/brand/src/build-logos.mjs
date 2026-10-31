// Regenerates the logo SVGs in docs/assets/brand.
// usage (from this folder): npm i --no-save opentype.js@1 && node build-logos.mjs [outDir=..]
import opentype from 'opentype.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(here, '..');
fs.mkdirSync(out, { recursive: true });

const markInner = (tile, tileStroke, sun, child, page1, page2) => `
  <rect width="64" height="64" rx="15" fill="${tile}"/>${tileStroke ? `
  <rect x=".75" y=".75" width="62.5" height="62.5" rx="14.25" fill="none" stroke="${tileStroke}" stroke-width="1.5"/>` : ''}
  <circle cx="27" cy="23" r="6.5" fill="${sun}"/>
  <circle cx="39.5" cy="28" r="4.2" fill="${child}"/>
  <path d="M32 44C27 38.4 20.4 35.7 13 36M32 44C37 38.4 43.6 35.7 51 36" fill="none" stroke="${page1}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M32 50.5C27 44.9 20.4 42.2 13 42.5M32 50.5C37 44.9 43.6 42.2 51 42.5" fill="none" stroke="${page2}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;

const DARK = markInner('#1C1917', null, '#F2B45C', '#F7D3A1', '#FFFCF9', '#A8A29E');
const LIGHT = markInner('#FFFCF9', '#E7E5E4', '#E79A3B', '#F2C48A', '#1C1917', '#A8A29E');

const svg = (vb, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}\n</svg>\n`;

fs.writeFileSync(`${out}/logo-mark.svg`, svg('0 0 64 64', DARK, 'Sidonie'));
fs.writeFileSync(`${out}/logo-mark-light.svg`, svg('0 0 64 64', LIGHT, 'Sidonie'));

const font = opentype.loadSync(path.join(here, 'fonts/Fraunces-SemiBold.ttf'));
const fontSize = 54;
const p = font.getPath('Sidonie', 0, 0, fontSize, { kerning: true });
const bb = p.getBoundingBox();
// place text: mark 64x64 at x=0; text starts at x=80; vertically center cap-height area on 32
const textW = bb.x2 - bb.x1;
const tx = 82 - bb.x1;
const ty = 32 - (bb.y1 + bb.y2) / 2 + 1.5;
const d = font.getPath('Sidonie', tx, ty, fontSize, { kerning: true }).toPathData(2);
const W = Math.ceil(82 + textW + 2);
const word = (fill, mark) => svg(`0 0 ${W} 64`, `${mark}\n  <path d="${d}" fill="${fill}"/>`, 'Sidonie');
fs.writeFileSync(`${out}/logo-wordmark.svg`, word('#1C1917', DARK));
fs.writeFileSync(`${out}/logo-wordmark-dark.svg`, word('#FFFCF9', LIGHT));
console.log('wordmark width', W);
