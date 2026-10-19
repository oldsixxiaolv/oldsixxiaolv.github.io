// /Volumes/Kingston/Mac/MeteoHub/scripts/screenshot.js
// Phase 2A.3 a11y scenario capture via puppeteer-core + system Chrome.
// Captures 3 pages × 4 a11y conditions (default / reduced-motion / contrast / forced-colors) × 2 themes.
//
// Usage:
//   1. Start local server:  cd _site && python3 -m http.server 8765
//   2. Run:                node scripts/screenshot.js
//
// Notes:
//   - puppeteer-core must be installed (`npm i puppeteer-core` somewhere on disk)
//   - System Chrome path is hardcoded for macOS dev machine
//   - prefers-contrast + forced-colors go via raw CDP because puppeteer 23.x rejects them in the wrapper

const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT    = '/Volumes/Kingston/Mac/MeteoHub/docs/screenshots';
const BASE   = 'http://127.0.0.1:8766';

const pages = [
  { name: 'home',          url: BASE + '/',                          viewport: { width: 1280, height: 900 } },
  { name: 'papers',        url: BASE + '/papers/',                   viewport: { width: 1280, height: 900 } },
  { name: 'paper-detail',  url: BASE + '/papers/trmm-lyu-2026/',     viewport: { width: 1280, height: 1400 } },
];

const schemes = ['light', 'dark'];

const conditions = [
  { tag: 'default',         features: [] },
  { tag: 'reduced-motion',  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
  { tag: 'contrast-more',   features: [{ name: 'prefers-contrast',       value: 'more' }],       useCdp: true },
  { tag: 'forced-colors',   features: [{ name: 'forced-colors',          value: 'active' }],     useCdp: true },
];

// emulateMediaFeatures with bypass for unsupported names (puppeteer-core 23.x doesn't
// accept prefers-contrast / forced-colors in the wrapper, so we fall back to raw CDP).
async function applyMedia(page, baseFeatures, extraFeatures, useCdp) {
  const all = [...baseFeatures, ...extraFeatures];
  if (useCdp) {
    // raw CDP bypasses puppeteer's allowlist
    const session = await page.target().createCDPSession();
    await session.send('Emulation.setEmulatedMedia', {
      features: all.map(f => ({ name: f.name, value: f.value })),
    });
  } else {
    await page.emulateMediaFeatures(all);
  }
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  for (const cond of conditions) {
    for (const scheme of schemes) {
      for (const p of pages) {
        const page = await browser.newPage();
        await page.setViewport(p.viewport);
        await applyMedia(
          page,
          [{ name: 'prefers-color-scheme', value: scheme }],
          cond.features,
          cond.useCdp,
        );
        await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(r => setTimeout(r, 500));

        const outPath = path.join(OUT, `${p.name}-${scheme}-${cond.tag}.png`);
        await page.screenshot({ path: outPath, fullPage: false });
        console.log(`  ✓ ${path.basename(outPath)}`);
        await page.close();
      }
    }
  }

  // CLS measurement in reduced-motion mode (sanity-check that reveal-on-scroll
  // doesn't fight reduced-motion — should be 0 because reveal is gated by no-preference)
  console.log('\n=== CLS under reduced-motion (light only) ===');
  for (const p of pages) {
    const page = await browser.newPage();
    await page.setViewport(p.viewport);
    await applyMedia(
      page,
      [{ name: 'prefers-color-scheme', value: 'light' }],
      [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      false,
    );
    await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 30000 });
    const cls = await page.evaluate(() => {
      return new Promise((resolve) => {
        let cls = 0;
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (!e.hadRecentInput) cls += e.value;
          }
        });
        try { po.observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
        setTimeout(() => resolve(cls), 1500);
      });
    });
    console.log(`  ${p.name.padEnd(15)} CLS=${cls.toFixed(4)}`);
    await page.close();
  }

  await browser.close();
})();
