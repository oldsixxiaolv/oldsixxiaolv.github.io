#!/usr/bin/env node
/**
 * 首页降水图门禁的**自测**（注入矩阵）—— 证明 HC1–HC7 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。这道门禁判的是 HTML 结构与数据一致性，
 *   而"注入没生效"（锚点变了、正则没匹配上）恰恰是最容易发生、也最不容易
 *   看出来的失败模式。所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把产物首页、数据 JSON、交互模块、样式表**各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用环境变量把门禁指向副本，断言门禁**确实**报出了
 *   对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *   （这正是门禁里留 SITE_DIR / CHART_DATA_PATH / CHART_JS_PATH / CHART_CSS_PATH
 *     这四个开关的原因：没有它们，自测就只能去改仓库文件，改坏了就是事故。）
 *
 * 十四档：
 *   M0 基线（原样）                  → 必须**全绿**（证明这套判据不是空跑）
 *   M1 读数里的数与数据文件对不上     → HC2
 *   M2 画布不可聚焦（删掉 tabindex）  → HC3
 *   M3 少一个交互钩子（删掉数据点）   → HC1
 *   M4 样式踩了 [hidden] 的坑（加 display）→ HC5
 *   M5 交互模块语法坏了              → HC4
 *   M6 读数里少了十年均值             → HC2
 *   M7 动态 import 的 specifier 写成 bare → HC6（真实踩过的坑）
 *   M8 论文 DOI 写成预印本/讨论页形态   → HC7-1（DOI 形态读不出卷/首页/年）
 *   M9 数据里的卷号与 DOI 对不上      → HC7-1（DOI 与真源不自洽）
 *   M10 数据里的论文标题被截断        → HC7-1（不是数据集登记标题的后缀）
 *   M11 产物里的论文标题被截断        → HC7-2（产物与真源不一致）
 *   M12 产物里少一位创作者           → HC7-2（产物与真源不一致）
 *   M13 **边界负对照**：真源与产物**一起**少一位创作者 → **必须判绿**
 *
 * ⚠️ M13 这一档是**故意判绿**的，理由写在这里，别当成漏网：
 *   HC7 守的是「产物与真源不漂移」。如果有人把**两边一起**改错
 *   （比如从 creators 里删掉一位注册创作者，然后重新构建），
 *   产物与真源仍然自洽 ⇒ 门禁**抓不到**。这是**已知边界**，不是缺陷；
 *   把它写成一条会跑的自测，是为了让这个边界**可证**，而不是只在注释里说说。
 *   真源正确性靠人工核 + 外部登记核对（DataCite / 出版商页面）。
 *
 * 用法：node scripts/test-home-chart.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-home-chart.cjs");
const SITE_HOME = path.join(ROOT, "_site", "index.html");
const DATA = path.join(ROOT, "src/_data/extremePrecip.json");
const JS = path.join(ROOT, "src/assets/js/home-chart.js");
const CSS = path.join(ROOT, "src/assets/css/pages.css");

for (const [label, p] of [
  ["_site/index.html", SITE_HOME],
  ["src/_data/extremePrecip.json", DATA],
  ["src/assets/js/home-chart.js", JS],
  ["src/assets/css/pages.css", CSS],
]) {
  if (!fs.existsSync(p)) {
    console.error(`首页图表自测失败：找不到 ${label}（${p}）。`);
    process.exit(1);
  }
}

const original = {
  html: fs.readFileSync(SITE_HOME, "utf8"),
  data: fs.readFileSync(DATA, "utf8"),
  js: fs.readFileSync(JS, "utf8"),
  css: fs.readFileSync(CSS, "utf8"),
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-homechart-selftest-"));

/** 在副本上注入 → 跑门禁 → 返回 {code, out} */
function run(mutate) {
  const siteDir = fs.mkdtempSync(path.join(tmp, "site-"));
  const dataPath = path.join(tmp, "extremePrecip.json");
  const jsPath = path.join(tmp, "home-chart.js");
  const cssPath = path.join(tmp, "pages.css");

  const parts = { ...original };
  if (mutate) {
    const next = mutate(parts);
    if (!next) throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    Object.assign(parts, next);
  }

  fs.writeFileSync(path.join(siteDir, "index.html"), parts.html);
  fs.writeFileSync(dataPath, parts.data);
  fs.writeFileSync(jsPath, parts.js);
  fs.writeFileSync(cssPath, parts.css);

  const r = spawnSync(process.execPath, [GATE], {
    env: {
      ...process.env,
      SITE_DIR: siteDir,
      CHART_DATA_PATH: dataPath,
      CHART_JS_PATH: jsPath,
      CHART_CSS_PATH: cssPath,
    },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"） */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

let failed = 0;
function expectRed(label, mutate, expect) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 1) {
    console.log(`  ✗ ${label} → 期望判红（exit 1），实测 exit ${r.code}`);
    failed += 1;
    return;
  }
  if (!r.out.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但红因里没有「${expect}」`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判红 exit 1，红因命中「${expect}」`);
}

function expectGreen(label, mutate) {
  const r = run(mutate);
  if (r.code !== 0) {
    console.log(`  ✗ ${label} → 期望判绿（exit 0），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判绿 exit 0`);
}

/* ---------- 矩阵 ---------- */
console.log("首页降水图门禁 · 本地注入矩阵：\n");

expectGreen("M0 基线（原样）", null);

expectRed(
  "M1 读数里的数与数据文件对不上",
  (parts) => {
    const before = parts.html;
    // 产物里 data-chart 的引号是 HTML 转义后的 &quot;，锚点要按转义形态写
    const after = before.replace(/&quot;values&quot;:\[([0-9.]+)/, (m, first) =>
      `&quot;values&quot;:[${Number(first) + 1}`
    );
    if (after === before) throw new Error("注入锚点不存在：data-chart 的 values");
    return { html: after };
  },
  "HC2"
);

expectRed(
  "M2 画布不可聚焦（删掉 tabindex）",
  (parts) => {
    const after = replaceOnce(parts.html, ' tabindex="0" role="group"', ' role="group"');
    return { html: after };
  },
  "HC3"
);

expectRed(
  "M3 少一个交互钩子（删掉数据点）",
  (parts) => {
    const after = replaceOnce(parts.html, " data-chart-dot", " data-chart-dotX");
    return { html: after };
  },
  "HC1"
);

expectRed(
  "M4 样式踩了 [hidden] 的坑（给数据点加 display）",
  (parts) => {
    const after = replaceOnce(
      parts.css,
      ".chart__dot { position: absolute;",
      ".chart__dot { display: block; position: absolute;"
    );
    return { css: after };
  },
  "HC5"
);

expectRed(
  "M5 交互模块语法坏了",
  (parts) => {
    const after = replaceOnce(parts.js, "export function initHomeChart(root) {", "export function initHomeChart(root) {{");
    return { js: after };
  },
  "HC4"
);

expectRed(
  "M6 读数里少了十年均值",
  (parts) => {
    const before = parts.html;
    const after = replaceOnce(before, "decades", "decadeX");
    if (after === before) throw new Error("注入锚点不存在：decades");
    return { html: after };
  },
  "HC2"
);

expectRed(
  "M7 动态 import 的 specifier 写成 bare（去掉 ./ 前缀）",
  (parts) => {
    // 这就是 2026-10-20 实测踩到的那个坑：模块在浏览器里加载失败，
    // 而 build 与静态门禁当时都还是绿的。HC6 必须能抓住它。
    const after = replaceOnce(
      parts.html,
      'import("./assets/js/home-chart.js")',
      'import("assets/js/home-chart.js")'
    );
    return { html: after };
  },
  "HC6"
);

expectRed(
  "M8 论文 DOI 写成预印本 / 讨论页形态",
  (parts) => {
    // 这就是 D27 的原始症状：10.5194/essd-2025-20 落点是同行评审往返记录页
    // （...-discussion.html），不是论文页 —— 链接照样打得开，没人会发现。
    const after = replaceOnce(
      parts.data,
      '"doi": "10.5194/essd-17-3987-2025"',
      '"doi": "10.5194/essd-2025-20"'
    );
    return { data: after };
  },
  "预印本"
);

expectRed(
  "M9 数据里的卷号与 DOI 对不上",
  (parts) => {
    const after = replaceOnce(parts.data, '"volume": "17"', '"volume": "18"');
    return { data: after };
  },
  "DOI 里读出的卷是 17"
);

expectRed(
  "M10 数据里的论文标题被截断",
  (parts) => {
    const after = replaceOnce(
      parts.data,
      '      "title": "An upgraded high-precision gridded precipitation dataset for the Chinese mainland considering spatial autocorrelation and covariates",',
      '      "title": "An upgraded high-precision gridded precipitation dataset for the Chinese mainland",'
    );
    return { data: after };
  },
  "不是 source.datasetTitle"
);

expectRed(
  "M11 产物里的论文标题被截断",
  (parts) => {
    const after = replaceOnce(
      parts.html,
      "An upgraded high-precision gridded precipitation dataset for the Chinese mainland considering spatial autocorrelation and covariates</a>",
      "An upgraded high-precision gridded precipitation dataset for the Chinese mainland</a>"
    );
    return { html: after };
  },
  "没有完整的论文标题"
);

expectRed(
  "M12 产物里少一位创作者",
  (parts) => {
    const after = replaceOnce(
      parts.html,
      "Jinlong Hu, Chiyuan Miao, Qi Zhang",
      "Jinlong Hu, Chiyuan Miao"
    );
    return { html: after };
  },
  "没有创作者 Qi Zhang"
);

expectGreen(
  "M13 边界负对照：真源与产物**一起**少一位创作者（已知边界，必须判绿）",
  (parts) => {
    // 产物与真源一起改错 ⇒ 两者仍然自洽 ⇒ HC7 抓不到。
    // 这一档刻意判绿：把「门禁守不了什么」变成**可证**的事实，而不是注释里的一句话。
    const data = replaceOnce(
      parts.data,
      '"creators": ["Jinlong Hu", "Chiyuan Miao", "Qi Zhang"]',
      '"creators": ["Jinlong Hu", "Chiyuan Miao"]'
    );
    const html = replaceOnce(
      parts.html,
      "Jinlong Hu, Chiyuan Miao, Qi Zhang",
      "Jinlong Hu, Chiyuan Miao"
    );
    return { data, html };
  }
);

/* ---------- 收尾 ---------- */
if (failed) {
  console.error(`\n首页降水图门禁自测**未通过**：${failed} 项不符预期。`);
  process.exit(1);
}
console.log(
  "\n注入矩阵通过：14 档全部符合预期（基线绿；六类交互缺陷 + 六类出处缺陷各自判红；" +
    "末档是**边界负对照**——真源与产物一起改错时门禁**判绿**，这是已知边界、不是漏网）。"
);
