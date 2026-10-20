#!/usr/bin/env node
/**
 * 工具路由门禁 —— 守住"浏览器工具量的是**真页面**，不是本站 404 页"。
 *
 * 为什么要有这条（一次具体的实测，不是假想）：
 *   scripts/screenshot.js、scripts/lighthouse-runner.js、scripts/slow3g-runner.js
 *   三个工具各自手写了一份要测的路由字面量，写的是 `/papers/trmm-lyu-2026/`
 *   —— **这个路由早就不存在了**（真实路由 `/papers/trmm-thunderstorm-stages/`）。
 *   三者都**不检查 HTTP 状态码**，于是：
 *     · screenshot.js 照样打印 `✓ paper-detail-light-default.png`，
 *       存下来的却是**本站 404 页的截图**；
 *     · lighthouse-runner.js 照样产出一份"可访问性 93 分"的 JSON，测的也是 404 页；
 *     · slow3g-runner.js 照样记下一组 FCP/LCP/CLS 数字，属于 404 页的。
 *   也就是说，这批工具产出的"证据"是 404 页的，而它们的输出格式
 *   （✓ / 分数 / 指标）与真实测过的东西**完全同形**。
 *
 *   与本仓库反复吃过的亏是同一族：「看起来在、其实不生效」。
 *
 * 四条判据：
 *   TR1 产物在场 —— _site/ 必须存在（没有判断对象就判红，不静默放行）。
 *   TR2 规范路由都真实存在 —— 共享路由表里的每一条都能在 _site/ 里找到。
 *   TR3 工具从共享路由表取路由 —— 每个浏览器工具都必须 require
 *       scripts/lib/site-routes.cjs，且必须调用可达性自检
 *       （scripts/lib/page-check.cjs）—— 否则"路由改错了"没人拦。
 *   TR4 工具不得自己写站点路径 —— 工具脚本里**不允许**再出现站点路径字面量
 *       （真实存在的本地文件系统路径除外）。
 *
 * TR4 为什么用"排除文件系统路径"而不是"白名单站点路径"：
 *   工具里还有 Chrome 路径、输出目录这类**本地文件系统路径**，
 *   它们不是站点路由，却长得像。判据用**存在性**区分：
 *   `fs.existsSync(字面量)` 为真 → 是真实文件系统路径 → 放行；
 *   否则它就是**声称的站点路径** → 判红。
 *   这条比"是不是站点路由"更严，目的正是堵住"写个恰好存在的真路由绕过共享表"
 *   —— 哪怕写的是 /papers/，也该走共享模块，否则"工具自己写路由"又回来了，
 *   只是碰巧还没写错。
 *   配套：本地输出目录请用 path.join(__dirname, ...) 拼，不要写死绝对路径
 *   （写死绝对路径既不可移植，也会让本条判据难判）。
 *
 * 与既有门禁的编号关系：本门禁用独立字母编号 TR*，
 * 不与 verify-site.cjs 的数字编号体系、check-a11y.cjs 的 A1–A4、
 * check-wrapping.cjs 的 W1–W3、check-gates-wired.cjs 的 GW* 续接或冲突。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const SITE = path.join(ROOT, "_site");
const ROUTES_MODULE = path.join(SCRIPTS_DIR, "lib", "site-routes.cjs");

/* 浏览器工具：会开浏览器去访问本站页面的脚本。
   形状判据用**文件名**（screenshot / lighthouse / slow3g），
   不用内容特征 —— 内容特征会被"工具写法变了"骗过去，
   而文件名判据在这一类脚本上是稳定的。 */
const TOOL_RE = /^(screenshot.*|lighthouse-runner|slow3g-runner)\.js$/;

const problems = [];
const fail = (msg) => problems.push(msg);

/* ---------- TR1：产物在场 ---------- */
if (!fs.existsSync(SITE)) {
  console.error("工具路由门禁未通过：\n");
  console.error(
    "  ✗ 找不到 _site/ —— 本门禁要拿构建产物核对路由，没有判断对象，直接判红。\n" +
    "    请先跑一次 npm run build（本门禁接在 eleventy 之后）。"
  );
  console.error("");
  process.exit(1);
}

/* ---------- 判断一个站点路径在产物里是否存在 ---------- */
function existsInSite(route) {
  const rel = String(route).replace(/^\/+/, "");
  if (rel === "") return fs.existsSync(path.join(SITE, "index.html"));
  const p = path.join(SITE, rel);
  if (!fs.existsSync(p)) return false;
  if (fs.statSync(p).isDirectory()) return fs.existsSync(path.join(p, "index.html"));
  return true;
}

/* ---------- TR2：规范路由表里的每条都真实存在 ---------- */
let routes = null;
if (!fs.existsSync(ROUTES_MODULE)) {
  fail(
    "scripts/lib/site-routes.cjs 不存在 —— 共享路由表没了，工具就没有路由来源。"
  );
} else {
  try {
    const mod = require(ROUTES_MODULE);
    routes = mod.allRoutes();
    if (!Array.isArray(routes) || routes.length === 0) {
      fail("共享路由表是空的 —— 没有可核对的路由。");
      routes = null;
    }
  } catch (e) {
    fail(`读 scripts/lib/site-routes.cjs 失败（${e.message}）。`);
  }
}

if (routes) {
  for (const r of routes) {
    if (!existsInSite(r)) {
      fail(
        `规范路由 ${r} 在构建产物里不存在（_site${r}）—— ` +
          `要么路由改了名，要么产物没重建。`
      );
    }
  }
}

/* ---------- TR3 + TR4：逐个检查浏览器工具 ---------- */
const toolFiles = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && TOOL_RE.test(e.name))
  .map((e) => e.name)
  .sort();

if (!toolFiles.length) {
  fail(
    "scripts/ 下没找到任何浏览器工具（screenshot*.js / lighthouse-runner.js / " +
      "slow3g-runner.js）—— 工具清单判据本身失效了（也许工具被改名或移走）。"
  );
}

/* 去掉注释后再扫字面量：注释里提到旧路由是**文档**，不是代码行为。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

/* 取单引号 / 双引号 / 无插值的反引号字面量 */
function stringLiterals(src) {
  const out = [];
  const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\$]|\\.)*)`/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const v = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3];
    if (v === undefined) continue;
    out.push({ value: v, index: m.index });
  }
  return out;
}

for (const file of toolFiles) {
  const full = path.join(SCRIPTS_DIR, file);
  const src = fs.readFileSync(full, "utf8");
  const code = stripComments(src);

  /* TR3-a：路由必须来自共享模块 */
  if (!/require\(\s*["'][^"']*lib\/site-routes\.cjs["']\s*\)/.test(code)) {
    fail(
      `scripts/${file} 没有从 scripts/lib/site-routes.cjs 取路由 —— ` +
        `工具自己写路由字面量，就会有"路由改了名、工具还在测旧路由"的老问题。`
    );
  }

  /* TR3-b：运行前必须做可达性自检 */
  if (!/assertPages?Ok\s*\(/.test(code)) {
    fail(
      `scripts/${file} 没有调用可达性自检（assertPageOk / assertPagesOk）—— ` +
        `对着错误页测度，产出的分数与真实测过的东西完全同形，事后分辨不出来。`
    );
  }

  /* TR4：不得自己写站点路径。
     规则只有一条：**以 "/" 开头的字面量，除非是真实存在的本地文件系统路径，
     否则一律判红。**
     这比"是不是站点路由"更严，目的正是**堵住"写个恰好存在的路由绕过共享表"**：
     哪怕写的是 /papers/（真路由、真存在），也该走共享模块 —— 否则
     "工具自己写路由"这件事又回来了，只是碰巧还没写错。 */
  for (const lit of stringLiterals(code)) {
    const v = lit.value;
    if (!v.startsWith("/") || v.length < 2) continue;
    if (fs.existsSync(v)) continue; // 真实存在的本地文件系统路径（Chrome、输出目录…）
    fail(
      `scripts/${file} 里出现了路径字面量 "${v}" —— 它不是本地文件系统路径，` +
        `所以它是在声称一个站点路径。路由请从 scripts/lib/site-routes.cjs 取` +
        `（本地输出目录请用 path.join(__dirname, ...) 拼，不要写死绝对路径）。`
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("工具路由门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `工具路由门禁通过：${routes.length} 条规范路由在 _site/ 里都真实存在；` +
    `${toolFiles.length} 个浏览器工具（${toolFiles.join(" / ")}）` +
    `全部从共享路由表取路由、且都在测度前做可达性自检。`
);
