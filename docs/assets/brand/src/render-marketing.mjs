// Renders the marketing images (README banners, social preview, share card, poster, how-it-works)
// from the HTML sources in this folder at their stated sizes, plus the website Open Graph JPEG.
// usage (from this folder, after `npm install` at the repo root for the Inter font):
//   npm i --no-save playwright-core && node render-marketing.mjs [source.html ...]   (default: all)
//   (or point PLAYWRIGHT_CORE at an existing playwright-core entry file)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE ? pathToFileURL(process.env.PLAYWRIGHT_CORE).href : 'playwright-core');
const here = path.dirname(fileURLToPath(import.meta.url));
const brand = path.join(here, '..');
const repo = path.join(brand, '..', '..', '..');

// [source html, output, width, height, deviceScaleFactor]
const jobs = [
  ['banner.html', 'readme-banner.png', 1280, 400, 2],
  ['banner-zh.html', 'readme-banner-zh.png', 1280, 400, 2],
  ['social-preview.html', 'social-preview.png', 1280, 640, 1],
  ['share-card-en.html', 'share-card-en.png', 1200, 630, 1],
  ['poster-zh.html', 'poster-zh-parents.png', 1080, 1440, 1],
  ['how-it-works.html', 'how-it-works.png', 1280, 620, 2],
  ['social-preview.html', path.join(repo, 'website/assets/og-image.jpg'), 1280, 640, 1],
];

const browser = await chromium.launch({ channel: 'chrome', timeout: 30000 });
try {
  const only = process.argv.slice(2);
  for (const [src, out, w, h, dpr] of jobs.filter(([src]) => !only.length || only.includes(src))) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    page.setDefaultTimeout(30000);
    await page.goto(pathToFileURL(path.join(here, src)).href, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const file = path.isAbsolute(out) ? out : path.join(brand, out);
    const jpeg = file.endsWith('.jpg');
    await page.screenshot({ path: file, ...(jpeg ? { type: 'jpeg', quality: 86 } : {}) });
    await page.close();
    console.log('saved', path.relative(repo, file));
  }
} finally {
  await browser.close();
}
