#!/usr/bin/env node
/**
 * 设计系统文档契约门禁 —— 守住「文档写的类名 / token / 构建模式 == 代码实际」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   `docs/design-system.md` 是本项目的**视觉规范**，文档自己写着「本文档是视觉规范的
 *   唯一来源」。但 2026-10-20 的 D19 实测发现它和代码**已经对不上**了：
 *     · §6.0 的组件清单里，徽标那一行把变体写成 `--brand` / `--accent` / `--sage` …，
 *       读起来像 CSS 自定义属性，实际是**类名修饰器** `.badge--brand` …；
 *     · §6.4 的示例 HTML 用的是 `.badge-brand`（**单横线**）和 `.badge-neutral`
 *       （**根本不存在**）—— 照抄就是无效类名；
 *     · §6.0 的双模表写着「dev：NODE_ENV 不等于 production（含裸跑 npm run build）」，
 *       而 `eleventy.config.js` 里是 `isProductionBuild = !isDevServer`，
 *       裸跑构建**走 prod** —— 文档把 dev/prod 的判定条件整个说反了。
 *   这类漂移的特点：**不会让站点变坏，只会让后来的人（包括 agent）照着错的规格实现**。
 *   所以它需要一道门禁，而且这道门禁还得能证明自己**不是空跑**。
 *
 * 判据：
 *   DC1 徽标类名族齐全 —— §6.0 的 `_badge.css` 行必须列出 `_badge.css` 里定义的**全部**顶层类
 *      （含 `.badge--quiet`）。漏写一个变体，后来的人就不知道它存在。
 *   DC2 不得虚构 CSS 变量 —— 文档里出现的每一个 `--token` 必须在 `src/assets/css` 下
 *      递归找到的 .css 文件里被真实定义（`--token:` 形式）。这条专治「把类名后缀当变量写」。
 *      ⚠️ 命令行开关（如 `--serve`）不是 CSS 变量，走白名单排除。
 *   DC3 partial 清单三处一致 —— §6.0 的拆分表、`eleventy.config.js` 的 `order` 数组、
 *      `src/assets/css/components/` 里的实际文件，三者必须一一对应。
 *      少一个 partial，文档就会少一整块规格。
 *   DC4 双模口径 == 代码 —— `eleventy.config.js` 的 dev 分支入口必须是 `--serve`；
 *      文档的 dev 行必须写 `--serve` 且**不得**说裸跑构建属于 dev；
 *      prod 行必须明确包含「裸跑 `npm run build`」。
 *   DC5 徽章规格的 token 要真被用 —— §6.4 点名的每个 `--token` 必须在 `_badge.css` 里
 *      被 `var()` 真正引用（否则规格写的是另一个组件的量）。
 *   DC6 覆盖度自证 —— 扫到的徽标类数 / CSS 变量数 / partial 数都要有下限，
 *      防「改空了就通过」。
 *
 * 环境变量（供 scripts/test-design-system-contract.cjs 的注入矩阵用）：
 *   DCC_DOC            —— 覆盖设计系统文档路径。
 *   DCC_CSS_DIR        —— 覆盖 CSS 根目录（递归扫描自定义属性定义）。
 *   DCC_COMPONENTS_DIR —— 覆盖 components partial 目录（默认 <DCC_CSS_DIR>/components）。
 *   DCC_CONFIG         —— 覆盖 eleventy.config.js 路径。
 *   注入必须在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOC = process.env.DCC_DOC
  ? path.resolve(process.env.DCC_DOC)
  : path.join(ROOT, "docs", "design-system.md");
const CSS_DIR = process.env.DCC_CSS_DIR
  ? path.resolve(process.env.DCC_CSS_DIR)
  : path.join(ROOT, "src", "assets", "css");
const COMPONENTS_DIR = process.env.DCC_COMPONENTS_DIR
  ? path.resolve(process.env.DCC_COMPONENTS_DIR)
  : path.join(CSS_DIR, "components");
const CONFIG = process.env.DCC_CONFIG
  ? path.resolve(process.env.DCC_CONFIG)
  : path.join(ROOT, "eleventy.config.js");

/** DC6 的覆盖度下限。 */
const MIN_BADGE_CLASSES = 6;
const MIN_CSS_VARS = 50;
const MIN_PARTIALS = 7;

/**
 * 命令行开关白名单 —— 这些 `--xxx` 长得像 CSS 变量，但它们是命令参数，
 * 不该按「CSS 里有没有定义」来判。文档里目前只有 `--serve` 一个。
 */
const CLI_FLAG_ALLOWLIST = new Set(["--serve"]);

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/** 递归列出目录下的 .css 文件（跳过 AppleDouble `._*`）。 */
function listCss(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listCss(p));
    else if (e.isFile() && e.name.endsWith(".css")) out.push(p);
  }
  return out.sort();
}

/** 取出某个 `### x.y` 小节的内容（到下一个 `##`/`###` 标题为止）。 */
function section(text, heading) {
  const re = new RegExp(`^#{2,3}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*$`, "m");
  const m = re.exec(text);
  if (!m) return null;
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^#{2,3}\s+/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** 把 markdown 表格行拆成单元格数组（首尾空单元格丢掉）。 */
function tableRows(sectionText) {
  return sectionText
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
    );
}

/** CSS 里定义的顶层类选择器（只取行首的 `.foo`，不含 `[data-theme=...] .foo` 这类后代写法）。 */
function topLevelClasses(css) {
  const out = new Set();
  for (const line of css.split("\n")) {
    const m = /^\.([A-Za-z][A-Za-z0-9_-]*)/.exec(line);
    if (m) out.add(`.${m[1]}`);
  }
  return out;
}

/** 文档里出现的 CSS 自定义属性名。
 *  负向前瞻排除「类名里的双横线」（`.badge--brand` 里的 `--brand` 不是变量）。 */
function docTokens(text) {
  const m = text.match(/(?<![A-Za-z0-9_-])(--[A-Za-z][A-Za-z0-9_-]*)/g);
  return new Set(m || []);
}

/* ---------------- 读文件 ---------------- */

if (!fs.existsSync(DOC)) {
  console.error(`设计系统文档契约门禁未通过：\n\n  ✗ 找不到设计系统文档 ${DOC}\n`);
  process.exit(1);
}
const docText = fs.readFileSync(DOC, "utf8");
const s60 = section(docText, "6.0");
const s64 = section(docText, "6.4");
const badgePath = path.join(COMPONENTS_DIR, "_badge.css");
const badgeCss = fs.existsSync(badgePath) ? fs.readFileSync(badgePath, "utf8") : "";

/* ---------------- DC1：徽标类名族齐全 ---------------- */

const badgeClasses = topLevelClasses(badgeCss);
if (!s60) {
  fail("DC1 设计系统文档里找不到 §6.0 小节 —— 这道门禁要盯的就是那节组件清单表。");
} else {
  const badgeRow = tableRows(s60).find((r) => r[0].replace(/`/g, "") === "_badge.css");
  if (!badgeRow) {
    fail("DC1 §6.0 的拆分表里找不到 `_badge.css` 那一行 —— 组件清单缺了徽标这一块。");
  } else {
    const listed = badgeRow.join(" ");
    for (const cls of badgeClasses) {
      if (!listed.includes(cls)) {
        fail(
          `DC1 §6.0 的 \`_badge.css\` 行没有列出 \`${cls}\` —— ` +
            `该类在 src/assets/css/components/_badge.css 里真实存在，文档漏写就等于规格里没有它。`
        );
      }
    }
  }
}

/* ---------------- DC2：不得虚构 CSS 变量 ---------------- */

const cssVars = new Set();
for (const f of listCss(CSS_DIR)) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/(--[A-Za-z][A-Za-z0-9_-]*)\s*:/g)) cssVars.add(m[1]);
}
for (const tok of docTokens(docText)) {
  if (CLI_FLAG_ALLOWLIST.has(tok)) continue;
  if (!cssVars.has(tok)) {
    fail(
      `DC2 文档里出现了 \`${tok}\`，但 src/assets/css 下的 .css 里没有定义它 —— ` +
        `要么它其实是**类名后缀**（本项目的类名一律双横线分隔，如 \`.badge--brand\`），` +
        `要么它是被写错的 CSS 变量。两种情况都会让照抄文档的人写错代码。`
    );
  }
}

/* ---------------- DC3：partial 清单三处一致 ---------------- */

let order = [];
if (!fs.existsSync(CONFIG)) {
  fail(`DC3 找不到 ${CONFIG} —— 读不到 eleventy.config.js 就没法核对 partial 清单。`);
} else {
  const cfg = fs.readFileSync(CONFIG, "utf8");
  const m = /const\s+order\s*=\s*\[([^\]]*)\]/.exec(cfg);
  if (!m) {
    fail("DC3 eleventy.config.js 里找不到 `const order = [...]` —— 拼接顺序数组被改名或删了？");
  } else {
    order = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
}
const actualPartials = fs.existsSync(COMPONENTS_DIR)
  ? fs
      .readdirSync(COMPONENTS_DIR)
      .filter((f) => /^_[a-z0-9_-]+\.css$/.test(f))
      .map((f) => f.replace(/\.css$/, ""))
  : [];
const docPartials = s60
  ? tableRows(s60)
      .map((r) => r[0].replace(/`/g, ""))
      .filter((c) => /^_[a-z0-9_-]+\.css$/.test(c))
      .map((c) => c.replace(/\.css$/, ""))
  : [];

const setOf = (a) => [...new Set(a)].sort();
const asSet = (s) => setOf(s);
if (asSet(docPartials).join(",") !== asSet(order).join(",")) {
  fail(
    `DC3 §6.0 的 partial 清单（${docPartials.join(", ") || "空"}）与 eleventy.config.js 的 ` +
      `order 数组（${order.join(", ") || "空"}）对不上 —— ` +
      `构建真正拼的是 order 数组，文档必须跟它一致。`
  );
}
if (asSet(docPartials).join(",") !== asSet(actualPartials).join(",")) {
  fail(
    `DC3 §6.0 的 partial 清单（${docPartials.join(", ") || "空"}）与 components/ 目录里的实际文件` +
      `（${actualPartials.join(", ") || "空"}）对不上 —— 少一个 partial，文档就少一整块规格。`
  );
}

/* ---------------- DC4：双模口径 == 代码 ---------------- */

if (!fs.existsSync(CONFIG)) {
  fail(`DC4 找不到 ${CONFIG} —— 读不到 eleventy.config.js 就没法核对 dev/prod 判定。`);
} else {
  const cfg = fs.readFileSync(CONFIG, "utf8");
  if (!/process\.argv\.includes\(\s*["']--serve["']\s*\)/.test(cfg)) {
    fail(
      `DC4 eleventy.config.js 里找不到 dev 分支的入口 process.argv.includes("--serve") —— ` +
        `判定条件变了，文档的 dev/prod 表必须跟着改。`
    );
  }
}
if (!s60) {
  fail("DC4 设计系统文档里找不到 §6.0 小节 —— 读不到双模表就无从核对。");
} else {
  const modes = tableRows(s60);
  const devRow = modes.find((r) => r[0] === "dev");
  const prodRow = modes.find((r) => r[0] === "prod");
  if (!devRow || !prodRow) {
    fail("DC4 §6.0 里找不到 dev / prod 两行 —— 双模说明缺行或改写了表头。");
  } else {
    const devTxt = devRow.join(" ");
    const prodTxt = prodRow.join(" ");
    if (!devTxt.includes("--serve")) {
      fail(
        `DC4 §6.0 的 dev 行没提 \`--serve\` —— 代码里 dev 的唯一入口是 \`eleventy --serve\`，` +
          `判据写错就会让人以为裸跑构建会得到 dev 产物。`
      );
    }
    if (devTxt.includes("npm run build")) {
      fail(
        `DC4 §6.0 的 dev 行把「npm run build」算成了 dev —— ` +
          `代码里 \`isProductionBuild = !isDevServer\`，裸跑构建（不带 --serve）走的是 **prod** 分支。`
      );
    }
    if (!prodTxt.includes("npm run build")) {
      fail(
        `DC4 §6.0 的 prod 行没有点明「npm run build」—— ` +
          `裸跑构建就是 prod（只有带 --serve 才走 dev），这一条必须写清楚。`
      );
    }
  }
}

/* ---------------- DC5：徽章规格的 token 要真被用 ---------------- */

if (!s64) {
  fail("DC5 设计系统文档里找不到 §6.4 小节 —— 读不到徽章规格就无从核对。");
} else {
  const usedInBadge = new Set(
    [...badgeCss.matchAll(/var\(\s*(--[A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => m[1])
  );
  for (const tok of docTokens(s64)) {
    if (CLI_FLAG_ALLOWLIST.has(tok)) continue;
    if (!usedInBadge.has(tok)) {
      fail(
        `DC5 §6.4 的徽章规格点了 \`${tok}\`，但 _badge.css 里没有 var() 引用它 —— ` +
          `规格写的要么是别的组件的量，要么是已经废弃的变量。`
      );
    }
  }
}

/* ---------------- DC6：覆盖度自证（防空跑） ---------------- */

if (badgeClasses.size < MIN_BADGE_CLASSES) {
  fail(
    `DC6 只在 _badge.css 里认出 ${badgeClasses.size} 个顶层类（要求至少 ${MIN_BADGE_CLASSES} 个）—— ` +
      `扫描面被收窄了，DC1 已经看不到大部分变体，等于没在检查。`
  );
}
if (cssVars.size < MIN_CSS_VARS) {
  fail(
    `DC6 只扫到 ${cssVars.size} 个 CSS 自定义属性定义（要求至少 ${MIN_CSS_VARS} 个）—— ` +
      `CSS 目录被指错了，DC2 已经失去覆盖面。`
  );
}
if (actualPartials.length < MIN_PARTIALS) {
  fail(
    `DC6 components/ 目录里只认出 ${actualPartials.length} 个 partial（要求至少 ${MIN_PARTIALS} 个）—— ` +
      `目录被指错了，DC3 已经失去覆盖面。`
  );
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("设计系统文档契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    `  判据出处：docs/DEFECT-BACKLOG.md D19（设计系统文档 §6 的类名族 / token / 构建模式与代码脱节）。`
  );
  console.error("");
  process.exit(1);
}

console.log(
  `设计系统文档契约门禁通过：${badgeClasses.size} 个徽标类全部在 §6.0 列出，` +
    `文档的 ${docTokens(docText).size} 个 token 全部在 CSS 里真实定义。`
);
console.log(`  · ${actualPartials.length} 个 partial 的清单三处一致；dev/prod 判定与 eleventy.config.js 一致。`);
