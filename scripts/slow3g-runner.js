// /Volumes/Kingston/Mac/MeteoHub/scripts/slow3g-runner.js
// Phase 2B.2: emulate Slow 3G, capture screenshots + Web Vitals.
//
// Slow 3G (Chrome DevTools "Slow 3G" preset):
//   - download: ~400 kb/s
//   - upload:   ~400 kb/s
//   - latency:  400 ms RTT
//
// We use puppeteer's CDP Emulation.setUserAgentOverride + Network.emulateNetworkConditions
// (the higher-level page.emulateNetworkConditions does not always pick up clean).

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');
const { assertPagesOk } = require('./lib/page-check.cjs');
const { TOOL_PAGES, toolUrl } = require('./lib/site-routes.cjs');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT    = path.resolve(__dirname, '../docs/screenshots');
const OUT_METRICS = path.resolve(__dirname, '../docs/lighthouse');

/* 路由来自共享真源 scripts/lib/site-routes.cjs（从 src/_data/site.js 派生），
 * 这里**不再手写任何路由**。
 * 原先写的是 /papers/trmm-lyu-2026/ —— 早已改名成
 * /papers/trmm-thunderstorm-stages/，而本脚本**不检查 HTTP 状态码**，
 * 于是照常记下一组 FCP/LCP/CLS 数字 —— 属于本站 404 页的。 */
const pages = TOOL_PAGES.map((p) => ({
  name: p.name,
  url: toolUrl(p.route),
  viewport: p.viewport,
}));
const schemes = ['light', 'dark'];

(async () => {
  /* 开浏览器**之前**先确认每个 URL 是它自己。
   * 失败就抛错退出——绝不记下一组属于 404 页的 FCP/LCP。 */
  await assertPagesOk(pages.map((p) => ({ label: p.name, url: p.url })));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const allMetrics = [];

  for (const p of pages) {
    for (const scheme of schemes) {
      const page = await browser.newPage();
      await page.setViewport(p.viewport);

      // Slow 3G profile (Chrome DevTools "Slow 3G"):
      //   offline=false, latency=400, download=400000, upload=400000
      const client = await page.target().createCDPSession();
      await client.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 400,
        downloadThroughput: 400 * 1024 / 8,   // 400 kb/s → bytes/s
        uploadThroughput:   400 * 1024 / 8,
        connectionType: 'cellular3g',
      });

      // Emulate prefers-color-scheme
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);

      // Set up performance observers before navigation
      await page.evaluateOnNewDocument(() => {
        window.__metrics = { FCP: 0, LCP: 0, TTI: 0, DCL: 0, Load: 0 };
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            if (e.name === 'first-contentful-paint') window.__metrics.FCP = e.startTime;
            if (e.entryType === 'largest-contentful-paint') window.__metrics.LCP = e.startTime;
          }
        });
        try { po.observe({ type: 'paint', buffered: true }); } catch (e) {}
        try { po.observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) {}
      });

      const t0 = Date.now();
      await page.goto(p.url, { waitUntil: 'networkidle2', timeout: 60000 });
      const tLoad = Date.now() - t0;

      // Wait a bit for LCP to settle
      await new Promise(r => setTimeout(r, 1500));

      // Pull Web Vitals via PerformanceObserver
      const metrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          const out = { ...window.__metrics };
          // Navigation timing
          const nav = performance.getEntriesByType('navigation')[0];
          if (nav) {
            out.DCL = nav.domContentLoadedEventEnd - nav.startTime;
            out.Load = nav.loadEventEnd - nav.startTime;
          }
          // Resources count / transfer size
          const rs = performance.getEntriesByType('resource');
          out.resources = rs.length;
          out.transferKB = Math.round(rs.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024);
          setTimeout(() => resolve(out), 500);
        });
      });

      // Screenshot
      const outPath = path.join(OUT, `${p.name}-${scheme}-slow3g.png`);
      await page.screenshot({ path: outPath, fullPage: false });
      const tScreenshot = Date.now() - t0;

      allMetrics.push({
        page: p.name,
        scheme,
        FCP: Math.round(metrics.FCP),
        LCP: Math.round(metrics.LCP),
        DCL: Math.round(metrics.DCL),
        Load: Math.round(metrics.Load),
        tLoad, tScreenshot,
        resources: metrics.resources,
        transferKB: metrics.transferKB,
      });

      console.log(`  ✓ ${p.name}-${scheme}-slow3g.png  FCP=${Math.round(metrics.FCP)}ms  LCP=${Math.round(metrics.LCP)}ms  Load=${Math.round(metrics.Load)}ms  res=${metrics.resources}  xfer=${metrics.transferKB}KB`);
      await page.close();
    }
  }

  await browser.close();

  // Persist metrics
  if (!fs.existsSync(OUT_METRICS)) fs.mkdirSync(OUT_METRICS, { recursive: true });
  fs.writeFileSync(path.join(OUT_METRICS, '_slow3g.json'), JSON.stringify(allMetrics, null, 2));

  console.log('\n=== Slow 3G summary ===');
  console.log('page'.padEnd(15) + 'scheme'.padEnd(8) + 'FCP     LCP     DCL     Load    resources  xfer');
  console.log('-'.repeat(80));
  for (const m of allMetrics) {
    console.log(
      m.page.padEnd(15) +
      m.scheme.padEnd(8) +
      String(m.FCP).padStart(5) + 'ms ' +
      String(m.LCP).padStart(5) + 'ms ' +
      String(m.DCL).padStart(5) + 'ms ' +
      String(m.Load).padStart(5) + 'ms ' +
      String(m.resources).padStart(8) + '  ' +
      String(m.transferKB).padStart(5) + 'KB'
    );
  }
})();
