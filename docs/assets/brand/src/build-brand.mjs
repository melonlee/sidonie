// Regenerates every Sidonie 伴学 icon, favicon and logo lockup from the reading-rabbit (玉兔) masters.
//
// Masters (./mascot, part of the FantasyAI Lab mascot family; edit these, not the outputs):
//   rabbit-book.svg        full-detail icon: cream rabbit reading an open book in front of the amber moon
//   rabbit-book-small.svg  simplified glyph for 16–48 px (big head + book edge; favicons, in-app mark, header logo)
//   rabbit-book-flat.svg   two-tone version for one-colour-ish print / embroidery / stickers
//
// usage (from this folder):
//   npm i --no-save playwright-core opentype.js@1 && node build-brand.mjs
//   (or point PLAYWRIGHT_CORE / OPENTYPE at existing entry files)
// Needs a local Google Chrome (channel: 'chrome'). Writes into docs/assets/brand and copies the
// web icons into public/ (app) and website/ (landing page).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const load = (env, name) => import(process.env[env] ? pathToFileURL(process.env[env]).href : name);
const { chromium } = await load('PLAYWRIGHT_CORE', 'playwright-core');
const ot = await load('OPENTYPE', 'opentype.js');
const opentype = ot.parse ? ot : ot.default;

const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.join(here, '..');
const repo = path.join(brand, '..', '..', '..');
const master = (name) => fs.readFileSync(path.join(here, 'mascot', `${name}.svg`), 'utf8');
const write = (name, text) => fs.writeFileSync(path.join(brand, name), text);

const FULL = master('rabbit-book');
const SMALL = master('rabbit-book-small');
const FLAT = master('rabbit-book-flat');

// ------------------------------------------------------------------ derived SVGs
const TITLE = '<title>Sidonie 伴学</title>';
const RIM = /<use href="#squircle" fill="none" stroke="url\(#rim\)"[^>]*\/>\n?/;
const SQUIRCLE_D = /(<path id="(?:squircle|tile)" d=")[^"]+"/;

/** Root <svg> tag with an accessible name; keeps the 100..924 tile viewBox of the masters. */
const titled = (svg) => svg.replace(/<svg [^>]*>/, (tag) =>
  tag.replace(/ (width|height)="\d+"/g, '').replace('>', ` role="img" aria-label="Sidonie 伴学">${TITLE}`));

/** Full-bleed square (iOS / Android apply their own mask): tile → square, no rim light. */
const square = (svg) => svg.replace(SQUIRCLE_D, '$1M100 100 H924 V924 H100 Z"').replace(RIM, '');

/** Maskable: square tile, art scaled about the bottom centre so the ears, moon and book sit in the 80 % safe zone. */
const maskable = (svg) => {
  const s = square(svg).replace('<g clip-path="url(#clip)">',
    '<g clip-path="url(#clip)"><g transform="translate(512 924) scale(0.8) translate(-512 -924)">');
  const i = s.lastIndexOf('</g>');
  return s.slice(0, i) + '</g></g>' + s.slice(i + 4);
};

/**
 * The reading rabbit without its tile: transparent, moon disc behind (no glow halo), the whole
 * rounded body visible so it can sit on any light surface (website, banners, poster).
 */
const READING_VIEWBOX = '190 96 644 884';
const reading = (svg) => svg
  .replace(SQUIRCLE_D, '$1M0 0 H1024 V1024 H0 Z"')
  .replace(/<use href="#squircle" fill="url\(#bg\)"\/>\n?/, '')
  .replace(/<circle [^>]*fill="url\(#glow\)"\/>\n?/, '')
  .replace(RIM, '');

/** Nest a master as a sized child <svg> (used by the wordmark lockups). */
const nested = (svg, x, y, size) => svg
  .replace(/<svg [^>]*>/, `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="100 100 824 824">`)
  .replace(/<\?xml[^>]*>/, '');

write('app-icon.svg', titled(FULL));
write('app-icon-square.svg', titled(square(FULL)));
write('app-icon-maskable.svg', titled(maskable(FULL)));
write('favicon.svg', titled(SMALL));
write('logo-mark.svg', titled(SMALL));
write('logo-mark-flat.svg', titled(FLAT));
write('mascot-reading.svg', titled(reading(FULL)).replace(/ viewBox="[^"]+"/, ` viewBox="${READING_VIEWBOX}"`));

// "Sidonie" in Fraunces SemiBold as outlines, mark on the left (64 units tall)
const ttf = fs.readFileSync(path.join(here, 'fonts/Fraunces-SemiBold.ttf'));
const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
const bb = font.getPath('Sidonie', 0, 0, 54, { kerning: true }).getBoundingBox();
const tx = 82 - bb.x1;
const ty = 32 - (bb.y1 + bb.y2) / 2 + 1.5;
const word = font.getPath('Sidonie', tx, ty, 54, { kerning: true }).toPathData(2);
const W = Math.ceil(82 + (bb.x2 - bb.x1) + 2);
const wordmark = (fill) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 64" role="img" aria-label="Sidonie">`
  + `<title>Sidonie</title>\n${nested(SMALL, 0, 0, 64)}\n<path d="${word}" fill="${fill}"/>\n</svg>\n`;
write('logo-wordmark.svg', wordmark('#1C1917'));
write('logo-wordmark-dark.svg', wordmark('#FFFCF9'));
console.log('svg masters derived');

// ------------------------------------------------------------------ PNG exports
// [source svg, output png, width, opaque background colour]
const jobs = [
  ['app-icon.svg', 'app-icon.png', 1024],
  ['app-icon.svg', 'app-icon-512.png', 512],
  ['app-icon.svg', 'app-icon-256.png', 256],
  ['app-icon.svg', 'app-icon-128.png', 128],
  ['app-icon-square.svg', 'apple-touch-icon.png', 180, '#1C1917'],
  ['app-icon.svg', 'icon-192.png', 192],
  ['app-icon.svg', 'icon-512.png', 512],
  ['app-icon-maskable.svg', 'icon-maskable-512.png', 512, '#1C1917'],
  ['favicon.svg', 'favicon-48.png', 48],
  ['favicon.svg', 'favicon-32.png', 32],
  ['favicon.svg', 'favicon-16.png', 16],
  ['logo-mark.svg', 'logo-mark.png', 512],
  ['logo-mark-flat.svg', 'logo-mark-flat.png', 512],
  ['mascot-reading.svg', 'mascot-reading.png', 1024],
  ['logo-wordmark.svg', 'logo-wordmark.png', 1024],
  ['logo-wordmark-dark.svg', 'logo-wordmark-dark.png', 1024],
];

const browser = await chromium.launch({ channel: 'chrome', timeout: 30000 });
try {
  for (const [src, dst, w, bg] of jobs) {
    const svg = fs.readFileSync(path.join(brand, src), 'utf8');
    const [, , , vw, vh] = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
    const h = Math.round((w * +vh) / +vw);
    // <img> keeps each SVG's ids private; a fresh page per size avoids stale tiles between captures
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(20000);
    const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    await page.setContent(`<body style="margin:0;background:${bg || 'transparent'}"><img src="${data}" style="display:block;width:${w}px;height:${h}px"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(brand, dst), omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log('png', dst, `${w}x${h}`);
  }
  // Chinese lockups (system CJK font, so PNG only): render #mark at 4x on a transparent background
  for (const [q, dst] of [['', 'logo-wordmark-zh.png'], ['?dark', 'logo-wordmark-zh-dark.png']]) {
    const p = await browser.newPage({ viewport: { width: 900, height: 200 }, deviceScaleFactor: 4 });
    p.setDefaultTimeout(20000);
    await p.goto(pathToFileURL(path.join(here, 'wordmark-zh.html')).href + q, { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#mark').screenshot({ path: path.join(brand, dst), omitBackground: true });
    await p.close();
    console.log('png', dst);
  }
} finally {
  await browser.close();
}

// favicon.ico with PNG-compressed 16/32/48 entries (supported by every current browser)
const sizes = [16, 32, 48];
const pngs = sizes.map((s) => fs.readFileSync(path.join(brand, `favicon-${s}.png`)));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e); header.writeUInt8(s, e + 1); header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
fs.writeFileSync(path.join(brand, 'favicon.ico'), Buffer.concat([header, ...pngs]));
console.log('ico favicon.ico');

// ------------------------------------------------------------------ web copies
const copy = (src, ...dsts) => dsts.forEach((d) => fs.copyFileSync(path.join(brand, src), path.join(repo, d)));
copy('favicon.svg', 'public/favicon.svg', 'website/favicon.svg');
copy('favicon.ico', 'public/favicon.ico', 'website/favicon.ico');
copy('apple-touch-icon.png', 'public/apple-touch-icon.png', 'website/apple-touch-icon.png');
copy('logo-mark.svg', 'website/assets/logo-mark.svg');
copy('app-icon.svg', 'website/assets/app-icon.svg');
copy('mascot-reading.svg', 'website/assets/mascot-reading.svg');
console.log('copied web icons to public/ and website/');
