#!/usr/bin/env node
/**
 * 打印主题门禁（PT1–PT6）
 * ============================================================================
 * 存在的理由：2026-10-19 修了一个**真 bug**——暗色模式下打印出来是
 * 「黑底黑字」，纸面上摘要 / 关键词 / 引用块（BibTeX / RIS）整段读不出来。
 * 根因不是 print.css 写错了，而是**它只覆盖了派生令牌**（--bg-* / --text-*），
 * **没覆盖上游**（tokens.css 里的 --color-neutral-* 色阶）→ 暗色模式下
 * --bg-page 解析到 #161513（暗底），而文字被强制成 #000000（黑字）。
 * 修法是「把整条中性色阶按浅色 :root 的原值重置」（print.css 的 2a 段）。
 *
 * 但**修完的代码没有护栏**：明天有人再加一条派生令牌、或把某个 --bg-*
 * 删掉、或把 --bg-page 改回暗色，纸面重新变黑，build 依然全绿。
 * → 本门禁把「打印结果与屏幕主题无关」这条不变量变成**可断言**的。
 *
 * 判据清单：
 *   PT1  print.css 里必须有 @media print 块（打印样式整体没了 → 判红）
 *   PT2  该块里的 :root 规则必须同时覆盖三种来源：
 *          · 默认 / 浅色          → 选择器里有「恰好等于 :root」的那一条
 *          · 跟随系统的暗色       → 有含 :not([data-theme="light"]) 的那条
 *          · 手动指定的暗色       → 有含 [data-theme="dark"] 的那条
 *        少一态 = 暗色模式漏进纸面（PT2 是本门禁最核心的一条）
 *   PT3  该规则声明的 token 集合必须与**本判据内独立写死的期望集**
 *        **完全相等**（不多、不少、值逐字相同）
 *   PT4  语义不变量（与期望集独立）：每个 --bg-* 的相对亮度 ≥ 0.80
 *        （纸面必须是浅的）；每个 --text-* 与 --bg-page 的对比度 ≥ 4.5:1
 *        （WCAG AA 正文级）——这一条正是「黑底黑字」那类退化的直接抓手
 *   PT5  tokens.css 的**浅色 :root** 里 --color-neutral-* 也必须等于同一份
 *        期望集 → 调色板改了不会只改一边（纸面与屏幕漂移）
 *   PT6  print.css 必须**被引用**：源侧 base.njk 要有 media="print" 的
 *        <link>，产物侧每个 HTML 也要有 —— 本门禁读的是**文件**，
 *        引用断了整套打印样式整体失效，而 PT1–PT5 会照样全绿
 *
 * ⚠️ 诚实边界（不夸大覆盖面）：
 *   · 只管 print.css 的 @media print 块里 **:root 规则的自定义属性**；
 *     不管该块里其它版面类规则（分页、隐藏 chrome、reveal 摊平……）。
 *   · 不做**浏览器渲染级**验证：没有真的导出 PDF 比对像素。判的是
 *     「令牌取值」，不是「纸面长什么样」。
 *   · PT3 的期望集**写死在本文件里**（不从 print.css 也不从 tokens.css
 *     取）：否则就是「拿自己和自己比」，永远绿。合法改动（换配色）需要
 *     同步改 ORACLE_PRINT_TOKENS 并贴回新哈希——红因里会直接给出该贴的值。
 *   · PT4 只看 --bg-* / --text-* 两类；--border-* / --color-neutral-* 自身
 *     的明暗不判（色阶本身就该有深有浅）。
 *   · 不声称能挡住「有人把期望集和哈希一起改成深色」——PT4 是唯一兜底，
 *     而 PT4 只覆盖 bg / text 两类。
 *   · 不检查 @page、print-color-adjust、浏览器兼容性。
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PRINT_CSS = path.join(ROOT, "src", "assets", "css", "print.css");
const TOKENS_CSS = path.join(ROOT, "src", "assets", "css", "tokens.css");
const BASE_NJK = path.join(ROOT, "src", "_includes", "layouts", "base.njk");
const SITE = path.join(ROOT, "_site");

/* ---------------------------------------------------------------------------
 * 期望集：打印块应当声明的**全部**自定义属性（名字 → 值）。
 * ⚠️ 这份必须与 print.css、tokens.css 都**独立**：它们是被判对象，
 *    期望值若也从那里取，就回到「拿自己和自己比」的老问题。
 *    值全部取自 tokens.css 浅色 :root 的中性色阶（design-system v1.0）。
 * -------------------------------------------------------------------------- */
const ORACLE_PRINT_TOKENS = {
  "color-neutral-0": "#ffffff",
  "color-neutral-50": "#faf8f5",
  "color-neutral-100": "#f2efea",
  "color-neutral-200": "#e6e2db",
  "color-neutral-300": "#d1ccc3",
  "color-neutral-400": "#a8a298",
  "color-neutral-500": "#6b665d",
  "color-neutral-600": "#575049",
  "color-neutral-700": "#38332d",
  "color-neutral-800": "#221f1b",
  "color-neutral-900": "#0f0d0a",
  "bg-page": "#ffffff",
  "bg-surface": "#ffffff",
  "bg-elevated": "#ffffff",
  "bg-muted": "#f4f4f5",
  "bg-subtle": "#fafafa",
  "text-primary": "#000000",
  "text-secondary": "#1a1a1a",
  "text-muted": "#4a4a4a",
  "border-subtle": "#d4d4d8",
  "border-default": "#a1a1aa",
  "border-strong": "#52525b",
};
const ORACLE_TOKEN_COUNT = 22;

/* 期望集自身的锚：条数 + 哈希（规范形式 = 按名排序后 "name=value" 用 \n 连接）。
 * 期望集被改过（哪怕等长替换）而没同步哈希 → 判红。 */
const ORACLE_SET_SHA256 =
  "ae9e5a5c7fb6a14ea40c5da9a99b5be7d213288103f8a52ba14d73ca3d888156";

/* 语义阈值 */
const BG_MIN_LUMINANCE = 0.8; // 纸面背景的相对亮度下限
const TEXT_MIN_CONTRAST = 4.5; // WCAG AA 正文级对比度

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

/* ---------------- 工具：CSS 解析 ---------------- */

/** 去掉注释（注释里可能有 { } 与选择器字样，会打乱后面的配对与匹配） */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * 按括号配对取出某个标记后面的整块内容。
 * ⚠️ 不能用「下一个 }」当结束标记 —— 块内可能嵌套花括号。
 */
function extractBlock(css, marker) {
  const re = new RegExp(
    "^[ \\t]*" + marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*\\{",
    "m"
  );
  const m = re.exec(css);
  if (!m) return null;
  const open = css.indexOf("{", m.index);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

/**
 * 取出包含 marker 的那一条规则（选择器 + 块体）。
 * 选择器起点向前找最近的 '{' 或 '}'（规则边界），避免把上一条规则的尾巴
 * 一起当成选择器。
 */
function extractRule(css, marker) {
  const at = css.indexOf(marker);
  if (at === -1) return null;
  const open = css.indexOf("{", at);
  if (open === -1) return null;
  let start = open - 1;
  while (start >= 0 && css[start] !== "{" && css[start] !== "}") start--;
  start++;
  const selector = css.slice(start, open);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return { selector, body: css.slice(open + 1, i) };
    }
  }
  return null;
}

/** 取出块里的 --token: value 声明 */
function parseTokens(block) {
  const out = {};
  if (!block) return out;
  const re = /--([a-z0-9-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(block))) out[m[1]] = m[2].trim();
  return out;
}

/* ---------------- 工具：颜色 ---------------- */

function hexToRgb(hex) {
  const h = String(hex).trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(h);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

/** WCAG 相对亮度 */
function relLuminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 对比度 */
function contrastRatio(a, b) {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ---------------- 主流程 ---------------- */

if (!fs.existsSync(PRINT_CSS)) {
  console.error(
    "✗ 打印主题门禁：找不到 src/assets/css/print.css —— 打印样式整体没了。"
  );
  process.exit(1);
}

const printCss = stripComments(fs.readFileSync(PRINT_CSS, "utf8"));

/* ---------- PT1：@media print 块存在 ---------- */
const printBlock = extractBlock(printCss, "@media print");
if (!printBlock) {
  fail(
    "PT1：print.css 里找不到 @media print 块——整套打印样式（强制浅色、" +
      "摊平 reveal、隐藏 chrome、三栏塌一栏、外链补 URL）全部失效，" +
      "而屏幕上看不出来（这是本门禁存在的理由）。"
  );
}

/* ---------- PT2：:root 规则覆盖三种来源 ---------- */
let printRule = null;
let printTokens = {};
let printSelectors = [];

if (printBlock) {
  printRule = extractRule(printBlock, ":root");
  if (!printRule) {
    fail(
      "PT2：@media print 块里找不到 :root 规则——打印时不会强制回浅色，" +
        "暗色屏幕上打印出来是一整页深底。"
    );
  } else {
    printTokens = parseTokens(printRule.body);
    printSelectors = printRule.selector
      .split(",")
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    const hasBase = printSelectors.some((s) => s === ":root");
    const hasSystemDark = printSelectors.some((s) =>
      s.includes(':not([data-theme="light"])')
    );
    const hasForcedDark = printSelectors.some((s) =>
      s.includes('[data-theme="dark"]')
    );

    if (!hasBase) {
      fail(
        'PT2：打印块的 :root 规则里没有「恰好等于 :root」的那一条选择器' +
          `（实际选择器：${printSelectors.join(" / ") || "（空）"}）——` +
          "默认 / 浅色这一路没被强制覆盖。"
      );
    }
    if (!hasSystemDark) {
      fail(
        'PT2：打印块的 :root 规则里没有含 :not([data-theme="light"]) 的选择器' +
          `（实际选择器：${printSelectors.join(" / ") || "（空）"}）——` +
          "「跟随系统的暗色」会漏进纸面（用户没手动选主题时就是这一路）。"
      );
    }
    if (!hasForcedDark) {
      fail(
        'PT2：打印块的 :root 规则里没有含 [data-theme="dark"] 的选择器' +
          `（实际选择器：${printSelectors.join(" / ") || "（空）"}）——` +
          "「手动指定暗色」会漏进纸面。"
      );
    }
  }
}

/* ---------- PT3：打印块的 token 集合 == 独立写死的期望集 ---------- */
const oracleEntries = Object.entries(ORACLE_PRINT_TOKENS).sort(([a], [b]) =>
  a < b ? -1 : a > b ? 1 : 0
);
const oracleCanonical = oracleEntries.map(([k, v]) => `${k}=${v}`).join("\n");
const oracleHash = crypto
  .createHash("sha256")
  .update(oracleCanonical)
  .digest("hex");

/* 期望集自身的锚失守时，不拿它去比（拿一把自己坏掉的尺子量东西，报出来的是假阳性） */
let oracleTrustworthy = true;
if (oracleEntries.length !== ORACLE_TOKEN_COUNT) {
  oracleTrustworthy = false;
  fail(
    `PT3：本判据里的期望集有 ${oracleEntries.length} 条，与锚定的 ` +
      `${ORACLE_TOKEN_COUNT} 条不符——期望集被改短（或改长）时判据就跟着变，` +
      `红不了了。确要增删，请同步改 ORACLE_TOKEN_COUNT。`
  );
}
if (oracleHash !== ORACLE_SET_SHA256) {
  oracleTrustworthy = false;
  fail(
    `PT3：期望集的哈希锚对不上：现在算出来是 ${oracleHash}，` +
      `本文件锚着 ${ORACLE_SET_SHA256}——期望集被改过而哈希锚没同步` +
      `（改期望集是合法操作，但要把上面这串新哈希贴回 ORACLE_SET_SHA256）。`
  );
}

if (!oracleTrustworthy) {
  note(
    "期望集自身失守（条数锚或哈希锚已判红）→ 本轮**跳过** PT3 的集合比对与 " +
      "PT5 的色阶比对：此刻的期望集不可信，拿它去比文件，报出来的" +
      "「打印块与期望不一致」是**假阳性**。"
  );
} else if (printRule) {
  const declared = Object.keys(printTokens);
  for (const [k, v] of oracleEntries) {
    if (!(k in printTokens)) {
      fail(
        `PT3：打印块**没有**声明 --${k}（期望值 ${v}）——` +
          "少一条覆盖就可能让暗色令牌漏进来。"
      );
    } else if (printTokens[k] !== v) {
      fail(
        `PT3：打印块的 --${k} = ${printTokens[k]}，与期望值 ${v} 不一致。`
      );
    }
  }
  for (const k of declared) {
    if (!(k in ORACLE_PRINT_TOKENS)) {
      fail(
        `PT3：打印块多出**未登记**的 token --${k} = ${printTokens[k]}——` +
          "新增打印变量必须同步登记到本判据的 ORACLE_PRINT_TOKENS 并贴回新哈希，" +
          "否则它不受任何判据看守。"
      );
    }
  }
}

/* ---------- PT4：语义不变量（背景浅 / 文字与纸面对比够） ---------- */
if (printRule) {
  for (const [k, v] of Object.entries(printTokens)) {
    if (!k.startsWith("bg-")) continue;
    const lum = relLuminance(v);
    if (lum === null) {
      note(
        `PT4：打印块的 --${k} = ${v} 不是十六进制色，无法判定明暗` +
          "（期望集比对 PT3 仍会逐字核它）。"
      );
      continue;
    }
    if (lum < BG_MIN_LUMINANCE) {
      fail(
        `PT4：打印背景 --${k} = ${v} 太深（相对亮度 ${lum.toFixed(3)} < ` +
          `${BG_MIN_LUMINANCE}）——纸面上会是暗底。这正是 2026-10-19 修掉的那个` +
          "「黑底黑字」退化的同一形态。"
      );
    }
  }

  if (!("bg-page" in printTokens)) {
    note(
      "PT4：打印块里没有 --bg-page，跳过「文字 vs 纸面」对比度判定" +
        "（PT3 已就该缺失判红）。"
    );
  } else {
    for (const [k, v] of Object.entries(printTokens)) {
      if (!k.startsWith("text-")) continue;
      const cr = contrastRatio(v, printTokens["bg-page"]);
      if (cr === null) {
        note(`PT4：打印块的 --${k} = ${v} 无法与 --bg-page 比对比度，跳过。`);
        continue;
      }
      if (cr < TEXT_MIN_CONTRAST) {
        fail(
          `PT4：打印文字 --${k} = ${v} 与纸面 --bg-page = ` +
            `${printTokens["bg-page"]} 的对比度只有 ${cr.toFixed(2)}:1` +
            `（要求 ≥ ${TEXT_MIN_CONTRAST}:1）——纸面上读不出来。`
        );
      }
    }
  }
}

/* ---------- PT5：tokens.css 浅色 :root 的中性色阶 == 同一份期望集 ---------- */
if (oracleTrustworthy) {
  if (!fs.existsSync(TOKENS_CSS)) {
    fail("PT5：找不到 src/assets/css/tokens.css——本判据无法核对浅色真值。");
  } else {
    const tokensCss = stripComments(fs.readFileSync(TOKENS_CSS, "utf8"));
    const lightBlock = extractBlock(tokensCss, ":root");
    const lightTokens = parseTokens(lightBlock);
    if (Object.keys(lightTokens).length === 0) {
      fail(
        "PT5：没能从 tokens.css 解析出浅色 :root 的 token" +
          "（解析器坏了，不是样式坏了）——本条判不出真值，只能判红。"
      );
    } else {
      for (const [k, v] of oracleEntries) {
        if (!k.startsWith("color-neutral-")) continue;
        if (!(k in lightTokens)) {
          fail(
            `PT5：tokens.css 的浅色 :root 里没有 --${k}——` +
              "纸面与屏幕的色阶对不上了。"
          );
        } else if (lightTokens[k] !== v) {
          fail(
            `PT5：tokens.css 浅色 :root 的 --${k} = ${lightTokens[k]}，` +
              `与期望值 ${v} 不一致——改配色时要同步 print.css（纸面会留旧值）。`
          );
        }
      }
    }
  }
}

/* ---------- PT6：print.css 必须被引用（源侧 + 产物侧） ---------- */
if (!fs.existsSync(BASE_NJK)) {
  fail("PT6：找不到 src/_includes/layouts/base.njk——无法核对 print.css 的引用。");
} else {
  const base = fs.readFileSync(BASE_NJK, "utf8");
  const links = base.match(/<link[^>]*print\.css[^>]*>/g) || [];
  if (links.length === 0) {
    fail(
      "PT6：base.njk 里没有引用 print.css 的 <link>——整套打印样式整体失效，" +
        "而本门禁读的是文件，PT1–PT5 会照样全绿。"
    );
  } else if (!links.some((l) => /media\s*=\s*["']print["']/.test(l))) {
    fail(
      "PT6：base.njk 引用了 print.css，但那条 <link> 上没有 media=\"print\"——" +
        "浏览器会在屏幕上也下载并应用它，打印专用规则会污染屏幕显示。"
    );
  }
}

if (!fs.existsSync(SITE)) {
  fail(
    "PT6：找不到 _site/——无法核对产物侧是否真的带了 print.css 的引用。" +
      "请先跑 npm run build（或 npx eleventy）再跑本门禁。"
  );
} else {
  const htmlFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) htmlFiles.push(p);
    }
  })(SITE);
  for (const file of htmlFiles) {
    const rel = path.relative(SITE, file);
    const html = fs.readFileSync(file, "utf8");
    const hasPrint = /<link[^>]*media=["']print["'][^>]*>/i.test(html);
    const hasPrintFile = /<link[^>]*print\.css[^>]*>/i.test(html);
    if (!hasPrint || !hasPrintFile) {
      fail(
        `PT6：产物 ${rel} 里没有带 media="print" 的 print.css 引用` +
          "——打印样式没进到最终页面。"
      );
    }
  }
}

/* ---------------- 输出 ---------------- */

if (notes.length) {
  console.log("说明：");
  for (const n of notes) console.log(`  · ${n}`);
  console.log("");
}

if (problems.length) {
  console.error("✗ 打印主题门禁未通过：");
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

console.log(
  "打印主题门禁通过：打印块覆盖默认/系统暗色/手动暗色三态；" +
    `${ORACLE_TOKEN_COUNT} 个打印 token 与独立期望集逐字一致；` +
    "背景亮度与文字对比度（WCAG AA）达标；tokens.css 浅色色阶与期望集一致；" +
    "print.css 在源侧与产物侧都已被引用。"
);
