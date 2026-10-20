/**
 * 页面可达性自检 —— 给**浏览器工具**用（screenshot / lighthouse / slow3g）。
 *
 * 为什么需要它（一次具体的实测，不是假想）：
 *   2026-10-19 复核发现，scripts/screenshot.js、scripts/lighthouse-runner.js、
 *   scripts/slow3g-runner.js 三个工具里写死的论文路由是
 *   `/papers/trmm-lyu-2026/` —— **这个路由早就不存在了**（真实路由是
 *   `/papers/trmm-thunderstorm-stages/`）。三者都**不检查 HTTP 状态码**，
 *   于是：
 *     · screenshot.js 照样打印 `✓ paper-detail-light-default.png`，
 *       存下来的却是**本站 404 页的截图**；
 *     · lighthouse-runner.js 照样产出一份"访问性 93 分"的 JSON，
 *       测的也是 404 页；
 *     · slow3g-runner.js 照样记下一组 FCP/LCP/CLS 数字，属于 404 页的。
 *   也就是说，**这批工具产出的"证据"是404 页的，而它们的输出格式
 *   （✓ / 分数 / 指标）与真实测过的东西完全同形**。
 *   这与本仓反复吃过的亏是同一族：「看起来在、其实不生效」。
 *
 * 这个模块的职责就一条：**在测之前先确认"要测的那个 URL 真的是它自己"**。
 * 它只做可达性判断，不做任何度量——度量是各工具自己的事。
 */

/* 404 页的识别特征。本站 404 页有两个稳定标记：
 *   ① <title>404 · Page not found · MeteoHub</title>
 *   ② <meta name="robots" content="...noindex...">
 * 两者都取自 src/404.njk 的实际输出（实测过），不是猜的。
 * 单看 HTTP 状态码不够：有些静态服务器对自定义 404 也回 200。 */
const NOT_FOUND_MARKERS = [
  /<title>\s*404\s*·/i,
  /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i,
];

/**
 * 断言一个 URL 确实可达、且返回的不是本站的 404 页。
 * 失败时**抛错**（不静默继续）——工具脚本的失败必须是响亮的。
 *
 * @param {string} url 待检查的绝对地址
 * @returns {Promise<string>} 页面 HTML 文本
 */
async function assertPageOk(url) {
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    throw new Error(
      `连不上 ${url}（${(e && e.message) || e}）。` +
        `工具脚本依赖一个跑在本地静态服务器上的 _site/；先起服务器再跑。`
    );
  }

  if (res.status !== 200) {
    throw new Error(
      `${url} 返回 HTTP ${res.status}（不是 200）。` +
        `工具脚本拒绝对着错误页测度——那样产出的是"404 页的分数"，` +
        `而它的输出格式与真实测过的东西完全同形。`
    );
  }

  const body = await res.text();
  for (const re of NOT_FOUND_MARKERS) {
    if (re.test(body)) {
      throw new Error(
        `${url} 返回的其实是本站的 404 页（命中标记 ${re}）。` +
          `路由多半已经改名了——请核对 scripts/lib/page-check.cjs 的注释里` +
          `记的那个真实路由，再改工具脚本里的那一条。`
      );
    }
  }

  return body;
}

/**
 * 一次性检查一组 URL。任一条不通过即整体失败，并**列出全部坏掉的**，
 * 而不是遇到第一条就停（改的时候要一次改完）。
 *
 * @param {Array<{label: string, url: string}>} targets
 * @returns {Promise<void>}
 */
async function assertPagesOk(targets) {
  const failures = [];
  for (const t of targets) {
    try {
      await assertPageOk(t.url);
    } catch (e) {
      failures.push(`  ✗ ${t.label}  ${t.url}\n      ${(e && e.message) || e}`);
    }
  }
  if (failures.length) {
    throw new Error(
      `有 ${failures.length} 个待测 URL 不是它自己（多半是路由已改名）：\n` +
        failures.join("\n")
    );
  }
}

module.exports = { assertPageOk, assertPagesOk, NOT_FOUND_MARKERS };
