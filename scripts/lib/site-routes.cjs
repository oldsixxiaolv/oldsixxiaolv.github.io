/**
 * 站点路由的**单一真源** —— 给浏览器工具（截图 / Lighthouse / Slow 3G）用。
 *
 * 为什么要有它（一次具体的实测，不是假想）：
 *   三个测量工具各自手写了一份要测的路由字面量，写的是
 *   `/papers/trmm-lyu-2026/` —— **这个路由早就不存在了**
 *   （真实路由是 `/papers/trmm-thunderstorm-stages/`）。
 *   而且三个都**不检查 HTTP 状态码**，于是它们照常打印 `✓`、
 *   照常产出一份"可访问性 93 分"的 JSON、照常记下一组 FCP/LCP/CLS——
 *   测的却是**本站 404 页**。输出格式与真实测过的东西完全同形，
 *   所以那批"证据"是假的，而且看不出假。
 *
 *   另一条**独立的**过期事实：lighthouse-runner.js 的基址默认带 `/MeteoHub` 前缀，
 *   而站点早已改成挂在**根路径**（pathPrefix = "/"，canonical = 站点根）。
 *   → 那一档里**每个**目标 URL 都指向不存在的 `/MeteoHub/`，全是 404。
 *
 * 修法不是"记得改"，是**让工具没机会写错**：
 *   路由从 `src/_data/site.js` 派生（论文路由跟着 `publications[].slug` 走），
 *   工具自己不再拥有任何路由字面量；
 *   门禁 `scripts/check-tool-routes.cjs` 持续盯着"工具不得自己写路由"这件事，
 *   运行时的可达性自检在 `scripts/lib/page-check.cjs`。
 *
 * ⚠️ 这里**不含**"页面存不存在"的判断——那是门禁与运行时自检的职责。
 * 本模块只负责"**站点有哪些路由**"这一件事。
 */
const site = require("../../src/_data/site.js");

/* ------------------------------------------------------------------ *
 * 固定页面
 *
 * 这几个是**站点结构**（不是从数据派生的），但每一条都必须在产物里
 * 真实存在 —— 门禁 check-tool-routes.cjs 会逐条核对，
 * 少一个 / 改个名 → 判红（而不是等到工具跑出一份 404 页的截图才发现）。
 * ------------------------------------------------------------------ */
const FIXED_ROUTES = {
  home: "/",
  papers: "/papers/",
  blog: "/blog/",
  about: "/about/",
};

/* ------------------------------------------------------------------ *
 * 论文详情页
 *
 * URL 段 = `site.js` 里 `publications[].slug`。
 * 换 slug 只改数据源**一处**，页面链接、工具目标、门禁期望值同时跟着走。
 * 键用 pubKey（数据键，稳定语义），值是 URL 段（可读性优先）。
 * ------------------------------------------------------------------ */
const PAPER_ROUTES = {};
for (const p of site.publications || []) {
  if (p && p.slug) PAPER_ROUTES[p.key || p.slug] = `/papers/${p.slug}/`;
}

/* ------------------------------------------------------------------ *
 * 工具用的本地服务器基址
 *
 * 站点挂在**根路径**（`pathPrefix = "/"`），所以这里**没有前缀**。
 * 历史上工具们各自带一个 `METEO_PREFIX` 前缀默认值（lighthouse 那份还停在
 * `/MeteoHub`）—— 那是**子路径托管时代**的遗留，与现在的部署不符。
 * 既然"挂根路径"是本项目已定的前提，这个概念就在工具层**彻底移除**：
 * 少一个能写错的地方。
 * ------------------------------------------------------------------ */
const TOOL_PORT = Number(process.env.METEO_PORT || 8766);
const TOOL_BASE = `http://127.0.0.1:${TOOL_PORT}`;

/** 拼出工具要访问的完整 URL。 */
function toolUrl(route) {
  return TOOL_BASE + route;
}

/* ------------------------------------------------------------------ *
 * 三个测量工具共用的目标页清单
 *
 * 形状统一成 { name, route, viewport }：lighthouse 不需要 viewport，忽略即可。
 * 论文详情页取**第一篇**——目前只有一篇；将来多篇时，
 * 工具测的是列表里的第一篇（不静默改测别的论文）。
 * ------------------------------------------------------------------ */
const FIRST_PAPER_ROUTE = Object.values(PAPER_ROUTES)[0] || null;

const TOOL_PAGES = [
  { name: "home", route: FIXED_ROUTES.home, viewport: { width: 1280, height: 900 } },
  { name: "papers", route: FIXED_ROUTES.papers, viewport: { width: 1280, height: 900 } },
  { name: "paper-detail", route: FIRST_PAPER_ROUTE, viewport: { width: 1280, height: 1400 } },
];

/** 全部规范路由（扁平列表）—— 门禁用它逐条核对构建产物。 */
function allRoutes() {
  return [...Object.values(FIXED_ROUTES), ...Object.values(PAPER_ROUTES)];
}

module.exports = {
  FIXED_ROUTES,
  PAPER_ROUTES,
  FIRST_PAPER_ROUTE,
  TOOL_BASE,
  TOOL_PORT,
  TOOL_PAGES,
  toolUrl,
  allRoutes,
};
