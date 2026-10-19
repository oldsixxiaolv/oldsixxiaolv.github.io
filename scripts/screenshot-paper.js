// screenshot-paper.js — capture paper-detail pages after Phase 2B.6 refactor
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.SITE_URL || 'http://127.0.0.1:8766';
const PREFIX = '';
const PAPER_PATH = '/papers/trmm-lyu-2026/';
const OUT_DIR = path.resolve(__dirname, '../docs/screenshots');

const variants = [
  { scheme: 'light', cond: 'default' },
  { scheme: 'dark', cond: 'default' },
  { scheme: 'light', cond: 'reduced-motion' },
];

async function setup(page, scheme, cond) {
  await page.setViewport({ width: 1280, height: 900 });
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: scheme },
    { name: 'prefers-reduced-motion', value: cond === 'reduced-motion' ? 'reduce' : 'no-preference' },
  ]);
}

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const v of variants) {
    const page = await browser.newPage();
    await setup(page, v.scheme, v.cond);

    const url = `${BASE}${PREFIX}${PAPER_PATH}`;
    await page.goto(url, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1500)); // let modules init

    // Scroll a bit to fire reading progress bar
    await page.evaluate(() => window.scrollTo(0, 400));
    await new Promise((r) => setTimeout(r, 400));

    const out = path.join(OUT_DIR, `paper-detail-${v.scheme}-${v.cond}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${out}`);
    await page.close();
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
