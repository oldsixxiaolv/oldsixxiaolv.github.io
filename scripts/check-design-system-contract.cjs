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
 *   DC6 覆盖度自证 —— 扫到的徽标类数 / CSS 变量数 / partial 数 / 主题 token 数都要有下限，
 *      防「改空了就通过」。
 *      ⚠️ 徽标这一维的**参照系是规格真源**（§6.0 `_badge.css` 行登记了几个类），
 *      不是硬编码的绝对基线：绝对基线会随「合法删掉一个死类」而失效，逼着人改门禁。
 *      判据是「CSS 侧认出的类数 ≥ 文档侧登记的类数，且 ≥ 1」——
 *      文档多列（规格里有个幽灵变体）会判红，CSS 被裁剪也会判红，两边都空也判红；
 *      而文档**少**列一个只由 DC1 负责，两条判据不耦合，红因归属仍然唯一。
 *   DC7 §10 == tokens.css —— §10 标题写的是「CSS **完整**自定义属性（可直接复制到 global.css）」，
 *      那它就必须与 `src/assets/css/tokens.css` 里定义的变量集合**完全相等**：
 *      tokens.css 定义了而 §10 没列 ⇒ 规格漏了它（照抄的人拿不到这个量）；
 *      §10 列了而 tokens.css 没定义 ⇒ 抄进 global.css 就是一个死变量。
 *      ⚠️ **只对 tokens.css 判**：另有约 30 个 CSS 变量（--bg-card / --border / --kind-* /
 *      --ghost / --chart-stroke 等）定义在 a11y.css / pages.css / _paper.css / _button.css，
 *      属于**组件局部变量**，不在主题调色板内 —— 把它们算进来会误伤。
 *   DC8 §2.2 / §2.3 == tokens.css 的调色板真源 —— §2.2「Light 模式 CSS 变量」与
 *      §2.3「Dark 模式 CSS 变量」是**配色真源的文档副本**，必须与
 *      `src/assets/css/tokens.css` 逐条对得上。2026-10-20 的 D21 实测发现它们**已经漂了**：
 *        · §2.3 的暗色块只列了 35 个，tokens.css 的暗色块有 43 个 —— 漏掉 8 个覆写
 *          （--text-accent / --link-color / --link-hover / --shadow-focus /
 *            --color-success / --color-warning / --color-danger / --button-primary-bg）；
 *          其中 success/warning/danger 的暗色值，正是 §2.4 对比表 Dark 列写的值 ——
 *          §2.4 引用了一个在 §2.3 里**查不到出处**的量。
 *        · §2.2 也漏了 3 个（--text-accent / --button-primary-bg / --shadow-focus）。
 *      DC8 分三条子判据：
 *        (a) **取值一致** —— 文档两个块里每个变量的取值，必须与 tokens.css 对应块同名变量
 *            逐字相同（空格与换行不算差异，值本身必须一致）；
 *        (b) **暗色块集合相等** —— §2.3 暗色块与 tokens.css 暗色块的变量集合必须**双向相等**
 *            （漏一个 = 暗色下这个量根本没被覆写；多一个 = 文档里的暗色值是幻觉）；
 *        (c) **浅色调色板不得漏项** —— tokens.css `:root` 里属于调色板家族的变量，
 *            §2.2 必须全部列出（反向：§2.2 列了而 tokens.css 没有 ⇒ 死变量）。
 *            ⚠️ **只对调色板家族做反向核对**（--color-/--text-/--link-/--bg-/--border-/
 *            --shadow-/--button-）：§2.2 是**配色清单**，不是全量 token 表；全量清单在 §10
 *            （由 DC7 盯），tokens.css 里另有约 50 个 --space-* / --fs-* / --font-* /
 *            --ease-* / --dur-* 不属于调色板，算进来会误伤。
 *      ⚠️ **不判 §2.3 里的 `[data-theme="dark"]` 块**：文档那一块是**有意简写**
 *      （只示意一条，完整的一份在 tokens.css 里），不是漏项 —— 别去"修"它。
 *
 * 环境变量（供 scripts/test-design-system-contract.cjs 的注入矩阵用）：
 *   DCC_DOC            —— 覆盖设计系统文档路径。
 *   DCC_CSS_DIR        —— 覆盖 CSS 根目录（递归扫描自定义属性定义；DC7 的 tokens.css 也在其下）。
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

/** DC6 的覆盖度下限。
 *  徽标类数没有这里的绝对下限 —— 它的参照系是文档 §6.0 登记的类数（见下方 docBadgeClasses）。 */
const MIN_CSS_VARS = 50;
const MIN_PARTIALS = 7;
/** DC7 的覆盖度下限（§10 与 tokens.css 的主题 token 规模）。 */
const MIN_THEME_VARS = 100;
/** DC8 的覆盖度下限（§2.2 浅色调色板 / §2.3 暗色块 / tokens.css 暗色块）。 */
const MIN_DOC_LIGHT_VARS = 50;
const MIN_DOC_DARK_VARS = 40;
const MIN_TOKENS_DARK_VARS = 40;

/** DC8：暗色块的选择器（文档与 tokens.css 用的是同一个）。 */
const DARK_SEL = ':root:not([data-theme="light"])';
/**
 * DC8：调色板家族 —— §2.2 是**配色清单**，只对这几个前缀做「不得漏」的反向核对。
 * tokens.css 里其余约 50 个（--space-* / --fs-* / --font-* / --ease-* / --dur-*）
 * 不是配色量，归 §10（DC7）管。
 */
const PALETTE_FAMILIES = [
  "--color-",
  "--text-",
  "--link-",
  "--bg-",
  "--border-",
  "--shadow-",
  "--button-",
];

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

/* ---------------- DC8 的 CSS 块解析工具 ---------------- */

/** 取出一段 markdown 里的第一个 ```css 代码块正文（没有就返回空串）。 */
function cssFence(sectionText) {
  const m = /```css[^\n]*\n([\s\S]*?)```/.exec(sectionText || "");
  return m ? m[1] : "";
}

/** 解析 CSS 文本里的顶层块 —— 嵌套块按**内层**选择器算（`@media` 里的那个）。 */
function cssBlocks(css) {
  const out = [];
  for (const m of (css || "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ sel: m[1].trim().split("\n").pop().trim(), body: m[2] });
  }
  return out;
}

/** 块里的自定义属性：名字 → {raw, norm}。norm 去掉全部空白，只用于比值。 */
function blockVars(body) {
  const out = new Map();
  for (const m of (body || "").matchAll(/(--[A-Za-z][A-Za-z0-9_-]*)\s*:\s*([^;]+);/g)) {
    const raw = m[2].trim().replace(/\s+/g, " ");
    out.set(m[1], { raw, norm: raw.replace(/\s+/g, "") });
  }
  return out;
}

/** 按选择器**精确**取一个块里的变量表；取不到返回空表。 */
function pickBlockVars(css, sel) {
  for (const b of cssBlocks(css)) {
    if (b.sel === sel) return blockVars(b.body);
  }
  return new Map();
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

/* ---------------- DC7 的输入：§10 与主题 token 真源 ---------------- */

/** 从 CSS 文本里取出「被定义」的自定义属性名（只认 `--name:` 形式，不认 var() 里的引用）。 */
function definedVars(css) {
  return new Set([...css.matchAll(/(--[A-Za-z][A-Za-z0-9_-]*)\s*:/g)].map((m) => m[1]));
}

const s10 = section(docText, "十、CSS 完整自定义属性");
const TOKENS_CSS = path.join(CSS_DIR, "tokens.css");
const tokensCss = fs.existsSync(TOKENS_CSS) ? fs.readFileSync(TOKENS_CSS, "utf8") : "";
const themeDocVars = s10 ? definedVars(s10) : new Set();
const themeTokenVars = definedVars(tokensCss);

/* ---------------- DC8 的输入：§2.2 / §2.3 与 tokens.css 的调色板 ---------------- */

const s22 = section(docText, "2.2");
const s23 = section(docText, "2.3");
const docLight = pickBlockVars(cssFence(s22), ":root");
const docDark = pickBlockVars(cssFence(s23), DARK_SEL);
const tokLight = pickBlockVars(tokensCss, ":root");
const tokDark = pickBlockVars(tokensCss, DARK_SEL);

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

/* DC6 用：文档 §6.0 的 `_badge.css` 行登记了几个徽标类 —— 这是徽标覆盖度的**规格真源**。
   只扫「类名族」那几列（第 3 列起），别把第 1 列 `_badge.css` 里的 `.css` 当成类名。 */
const docBadgeClasses = (() => {
  if (!s60) return new Set();
  const row = tableRows(s60).find((r) => r[0].replace(/`/g, "") === "_badge.css");
  if (!row) return new Set();
  const cell = row.slice(2).join(" ");
  return new Set([...cell.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)].map((m) => `.${m[1]}`));
})();

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

if (badgeClasses.size < Math.max(docBadgeClasses.size, 1)) {
  fail(
    `DC6 _badge.css 只认出 ${badgeClasses.size} 个顶层类，但 §6.0 的 \`_badge.css\` 行登记了 ${docBadgeClasses.size} 个 —— ` +
      `扫描面比规格窄了：要么文档登记的类在 CSS 里根本不存在（规格里有个幽灵变体），` +
      `要么 CSS 被裁剪了（改空了就通过）。`
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
if (themeDocVars.size < MIN_THEME_VARS) {
  fail(
    `DC6 §10 只认出 ${themeDocVars.size} 个自定义属性（要求至少 ${MIN_THEME_VARS} 个）—— ` +
      `§10 被裁剪了，DC7 已经失去覆盖面。`
  );
}
if (themeTokenVars.size < MIN_THEME_VARS) {
  fail(
    `DC6 tokens.css 只认出 ${themeTokenVars.size} 个自定义属性（要求至少 ${MIN_THEME_VARS} 个）—— ` +
      `扫描面被收窄了，DC7 已经失去覆盖面。`
  );
}
if (docLight.size < MIN_DOC_LIGHT_VARS) {
  fail(
    `DC6 §2.2 只认出 ${docLight.size} 个调色板变量（要求至少 ${MIN_DOC_LIGHT_VARS} 个）—— ` +
      `§2.2 被裁剪了，DC8 已经失去覆盖面。`
  );
}
if (docDark.size < MIN_DOC_DARK_VARS) {
  fail(
    `DC6 §2.3 只认出 ${docDark.size} 个暗色变量（要求至少 ${MIN_DOC_DARK_VARS} 个）—— ` +
      `§2.3 的暗色块被裁剪了，DC8 已经失去覆盖面。`
  );
}
if (tokDark.size < MIN_TOKENS_DARK_VARS) {
  fail(
    `DC6 tokens.css 只认出 ${tokDark.size} 个暗色变量（要求至少 ${MIN_TOKENS_DARK_VARS} 个）—— ` +
      `暗色块被收窄了，DC8 已经失去覆盖面。`
  );
}

/* ---------------- DC7：§10 == tokens.css 的变量集合 ---------------- */

if (!s10) {
  fail(
    "DC7 设计系统文档里找不到 §10「CSS 完整自定义属性」小节 —— " +
      "这道门禁要盯的就是那节变量清单。"
  );
} else if (!fs.existsSync(TOKENS_CSS)) {
  fail(`DC7 找不到 ${TOKENS_CSS} —— 读不到主题 token 的真源就没法核对 §10。`);
} else {
  for (const v of [...themeTokenVars].filter((x) => !themeDocVars.has(x)).sort()) {
    fail(
      `DC7 §10 里没有 \`${v}\`，但 src/assets/css/tokens.css 里真实定义了它 —— ` +
        `§10 标题写的是「CSS **完整**自定义属性（可直接复制到 global.css）」，` +
        `缺一项就等于这份规格不是完整的，照抄的人会拿不到这个量。`
    );
  }
  for (const v of [...themeDocVars].filter((x) => !themeTokenVars.has(x)).sort()) {
    fail(
      `DC7 §10 里列了 \`${v}\`，但 src/assets/css/tokens.css 里没有定义它 —— ` +
        `照抄 §10 到 global.css 会得到一个永远取不到值的死变量。`
    );
  }
}

/* ---------------- DC8：§2.2 / §2.3 == tokens.css 的调色板真源 ---------------- */

if (!s22 || !docLight.size) {
  fail(
    "DC8 设计系统文档里找不到 §2.2 的 `:root` 变量块 —— " +
      "这道门禁要盯的就是那份浅色调色板清单。"
  );
}
if (!s23 || !docDark.size) {
  fail(
    `DC8 设计系统文档里找不到 §2.3 的 \`${DARK_SEL}\` 变量块 —— ` +
      "读不到暗色覆写表就无从核对（§2.3 末尾的 `[data-theme=\"dark\"]` 块是有意简写，不在核对范围内）。"
  );
}

// (a) 取值一致 —— 文档写的每个量，值必须和 tokens.css 逐字相同
for (const [name, v] of docLight) {
  const t = tokLight.get(name);
  if (t && v.norm !== t.norm) {
    fail(
      `DC8 §2.2 里 \`${name}\` 的取值是 \`${v.raw}\`，但 tokens.css 的 \`:root\` 里是 \`${t.raw}\` —— ` +
        `同一份浅色调色板，两处写了两个值；照文档实现的人会拿到和线上不一样的那一个。`
    );
  }
}
for (const [name, v] of docDark) {
  const t = tokDark.get(name);
  if (t && v.norm !== t.norm) {
    fail(
      `DC8 §2.3 暗色块里 \`${name}\` 的取值是 \`${v.raw}\`，但 tokens.css 的暗色块里是 \`${t.raw}\` —— ` +
        `同一份暗色调色板，两处写了两个值。`
    );
  }
}

// (b) 暗色块集合相等（双向）—— 漏一个覆写 = 暗色下这个量根本没被改
for (const name of [...tokDark.keys()].filter((n) => !docDark.has(n)).sort()) {
  fail(
    `DC8 §2.3 暗色块里没有 \`${name}\`，但 tokens.css 的暗色块里真实定义了它 —— ` +
      `暗色下这个量压根没被覆写，文档漏的这一条就是规格的缺口。`
  );
}
for (const name of [...docDark.keys()].filter((n) => !tokDark.has(n)).sort()) {
  fail(
    `DC8 §2.3 暗色块里列了 \`${name}\`，但 tokens.css 的暗色块里没有它 —— ` +
      `文档里写的这个暗色值是幻觉，tokens.css 里根本不存在。`
  );
}

// (c) 浅色调色板不得漏项 —— tokens.css 里的调色板变量，§2.2 必须全部列出
const tokPalette = new Set(
  [...tokLight.keys()].filter((n) => PALETTE_FAMILIES.some((f) => n.startsWith(f)))
);
for (const name of [...tokPalette].filter((n) => !docLight.has(n)).sort()) {
  fail(
    `DC8 §2.2 浅色调色板清单里没有 \`${name}\`，但 tokens.css 的 \`:root\` 里真实定义了它 —— ` +
      `§2.2 是这份调色板的文档副本，漏一项就等于规格里没有它。`
  );
}
for (const name of [...docLight.keys()].filter((n) => !tokLight.has(n)).sort()) {
  fail(
    `DC8 §2.2 里列了 \`${name}\`，但 tokens.css 的 \`:root\` 里没有定义它 —— ` +
      `照抄 §2.2 会得到一个永远取不到值的死变量。`
  );
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("设计系统文档契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    `  判据出处：docs/DEFECT-BACKLOG.md D19 / D20 / D21（设计系统文档 §6 的类名族 / token / 构建模式、` +
    `§10 的 token 集合与 tokens.css 对不上、§2.2 / §2.3 的调色板与 tokens.css 对不上）。`
  );
  console.error("");
  process.exit(1);
}

console.log(
  `设计系统文档契约门禁通过：${badgeClasses.size} 个徽标类全部在 §6.0 列出（§6.0 登记 ${docBadgeClasses.size} 个），` +
    `文档的 ${docTokens(docText).size} 个 token 全部在 CSS 里真实定义。`
);
console.log(`  · ${actualPartials.length} 个 partial 的清单三处一致；dev/prod 判定与 eleventy.config.js 一致。`);
console.log(
  `  · §10 与 tokens.css 的主题 token 集合相等（各 ${themeDocVars.size} 个）。`
);
console.log(
  `  · §2.2 浅色（${docLight.size} 个）与 §2.3 暗色（${docDark.size} 个）调色板与 tokens.css 逐条一致。`
);
