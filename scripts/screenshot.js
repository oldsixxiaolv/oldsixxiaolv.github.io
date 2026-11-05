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
const { assertPagesOk } = require('./lib/page-check.cjs');
const { TOOL_BASE, TOOL_PAGES, toolUrl } = require('./lib/site-routes.cjs');

const CHROME = process.env.CHROME_PATH || path.join(path.sep, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome');
const OUT    = path.resolve(__dirname, '../docs/screenshots');

/* 路由来自共享真源 scripts/lib/site-routes.cjs（从 src/_data/site.js 派生），
 * 这里**不再手写任何路由**。
 *
 * 为什么必须这样（一次具体的实测，不是假想）：
 *   这里原先写的是 /papers/trmm-lyu-2026/ —— 该路由早已改名成
 *   /papers/trmm-thunderstorm-stages/，而本脚本**不检查 HTTP 状态码**，
 *   于是 16 张 "paper-detail" 截图存下来的全是**本站 404 页**，
 *   输出格式（✓ 文件名）却与真实截到的东西完全同形。
 *   现在路由从数据源派生 + 开浏览器前先做可达性自检（page-check.cjs），
 *   路由改名会**立刻**在这里炸出来，而不是留到看截图时才发现。
 *   门禁 scripts/check-tool-routes.cjs 持续盯着"工具不得自己写路由"。 */
const pages = TOOL_PAGES.map((p) => ({
  name: p.name,
  url: toolUrl(p.route),
  viewport: p.viewport,
}));

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
  /* 开浏览器**之前**先确认每个 URL 是它自己。
   * 失败就抛错退出——绝不"对着 404 页截一组图还打印 ✓"。 */
  await assertPagesOk(pages.map((p) => ({ label: p.name, url: p.url })));

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
