#!/usr/bin/env node
/**
 * 设计系统组件清单契约门禁 —— 守住「docs/design-system.md §6 组件清单里写的
 * 类名 / 规格 token / 尺寸 == 代码实际」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-23（D82 场次）实测：`docs/design-system.md` §6「组件清单」是本项目
 *   唯一的组件规格来源（文档结尾自己写着「本文档是视觉规范的**唯一来源**」），
 *   但 §6.1 / §6.2 / §6.5 / §6.6 四节与代码**已经全面对不上**：
 *     · §6.1 按钮：写 `.btn-primary` / `.btn-accent` / `.btn-ghost` / `.btn-link` /
 *       `.btn-sm` / `.btn-md` / `.btn-lg`，代码里真实的是 `.btn--primary` /
 *       `.btn--ghost` / `.btn--sm`（**只有这一个尺寸档**），`.btn-accent`、
 *       `.btn-link`、`.btn--md`、`.btn--lg` **全仓不存在**；示例 HTML 写的
 *       `class="btn btn-primary"` 也是无效类名；min-height 规格写 40/44/52px，
 *       代码里 `.btn--sm` 是 **36px**、`.btn` 是 44px，没有 lg。
 *     · §6.2 卡片：写「`--space-4` 内边距、`--shadow-1` → hover `--shadow-2`」，
 *       而 `.card` **既没有内边距也没有阴影**（hover 只改背景 + 边框）；
 *       变体写 `.card-image` / `.card-horizontal` / `.card-flag`，代码里真实的是
 *       `.card__media` + `.card__img`，强调条不是 `border-inline-start: 4px`，
 *       而是 `.card::before` 的 2px 竖条。
 *     · §6.5 引用块：示例写 `<blockquote class="quote">`，而代码**没有 `.quote` 类**，
 *       样式直接挂在 `blockquote` 元素上。
 *     · §6.6 代码块：写「顶部带文件名（`.filename`）装饰」「深色底色 `#15141A`」，
 *       而 `.filename` **全仓不存在**、`#15141A` **全仓不存在**（暗色底色其实是
 *       `--bg-muted` 在 `tokens.css` 暗色块里的取值）。
 *   这族漂移不会让站点变坏，只会让后来的人（包括 agent）照着**无效类名**实现，
 *   或者照着**不存在的能力**提需求。已有的 `check-design-system-contract.cjs`
 *   只守 §6.0 徽标 / §6.4 徽标 token / §10 / §2.2 / §2.3，**§6.1/§6.2/§6.5/§6.6
 *   一节都没有门禁看着**。
 *   ⚠️ 修法是**改文档**而不是往 CSS 里补类：补上去的类没有落点，会被
 *   死类门禁（死 CSS 检查那道）当场判红。
 *
 * 判据：
 *   DCX1 §6.1 / §6.2 / §6.5 / §6.6 点名的类名必须真实存在 ——
 *      类名从三处收：表格里的 `.class`、正文行内代码里的 `.class`、
 *      HTML 示例里 `class="..."` 的每个 token。类名必须在 `src/assets/css` 下
 *      递归找到的 .css 文件里**作为类选择器出现过**（`.btn--primary` 这种形态算）。
 *      ⚠️ 含「规划中」的行**整体豁免** —— 文档有权写「这个类还没落地」，
 *      但必须**明写**是规划中（§6.7 的 `.annot-inline` 就是这个写法）。
 *   DCX2 这些小节点名的规格 token（`--radius-md` 之类）必须**被该组件真正用上** ——
 *      「token 在代码里存在」不等于「这个组件用了它」：`.card` 从来没有过内边距，
 *      所以「`.card` 用 `--space-4`」这种话必须判红。
 *      作用域 = 该小节点名的**类**（表格 + 正文 + HTML 块）∪ 该小节出现的
 *      **元素标签**（HTML 块与行内代码里的 `<tag>`）：§6.5 引用块没有类，
 *      它的样式挂在 `blockquote` 元素上，作用域就该是元素。
 *   DCX3 §6.1 变体表的 min-height 必须与 CSS **逐行一致** ——
 *      变体自己没写 min-height 时取基础类 `.btn` 的值（所有变体都与 `.btn`
 *      同元素使用）。CSS 里根本找不到该类（或基础类）的 min-height ⇒ 判红。
 *   DCX4 覆盖度自证 —— 扫到的类名数 / 规格 token 数 / §6.1 表行数 / CSS 规则数
 *      都不得低于门槛；四个小节也都得扫出东西。防止「把文档改空了就能过」。
 *
 * ⚠️ 诚实边界（写清楚才算数）：
 *   · 静态检查，不联网，不 import 被检查方（读文件 + 自己解析）。
 *   · 只扫 §6.1 / §6.2 / §6.5 / §6.6 四节 —— 这四节带类名或可量化的规格；
 *     §6.3 表单 / §6.7 批注侧栏 / §6.8 顶栏 / §6.9 面包屑不在本门禁范围
 *     （它们的规格要么没有类名锚点，要么整节是「规划中」）。
 *   · DCX1 只判「类名有没有被定义」，**不判**「这个类当前有没有落点」
 *     （那是 `check-dead-css.cjs` 的活）。
 *   · DCX2 的作用域是**文档自己声明的**：文档写 `.card` 用某个 token，
 *     门禁只要求「`.card` 自己的 CSS 规则里真的 var() 了它」，不判「这是不是
 *     最合适的写法」。
 *   · DCX3 只认 §6.1 那张带 min-height 列的表；§6.2 的 padding / shadow 这类
 *     「有没有某个属性」的说法**机器判不了**（文档说的是「没有」，不是「有」），
 *     不在本门禁范围。
 *
 * 环境变量（供 scripts/test-design-components.cjs 的注入矩阵用）：
 *   DCX_DOC     —— 覆盖设计系统文档路径。
 *   DCX_CSS_DIR —— 覆盖 CSS 根目录（递归扫描类选择器 / var() 引用 / min-height）。
 *   注入必须在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOC = process.env.DCX_DOC || path.join(ROOT, "docs", "design-system.md");
const CSS_DIR = process.env.DCX_CSS_DIR || path.join(ROOT, "src", "assets", "css");

/* 本门禁只看的四个小节，以及每节要用的 min-height 表。 */
const SECTIONS = ["6.1", "6.2", "6.5", "6.6"];
const SIZES_SECTION = "6.1";

/* 覆盖度门槛（自证用，防止「改空了就通过」）。 */
const MIN_CLASSES = 6;
const MIN_TOKENS = 10;
const MIN_SIZE_ROWS = 3;
const MIN_CSS_RULES = 8;

const problems = [];
function fail(m) {
  problems.push(m);
}

/* ==================== CSS 解析 ==================== */

/** 递归列出 CSS 文件（跳过 exFAT 侧车 `._*`）。 */
function listCssFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listCssFiles(p));
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

/** 去掉 CSS 注释。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** 一条规则的选择器里出现的类名（不含前导点）。 */
function classTokensOf(selector) {
  const out = new Set();
  for (const m of selector.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.add(m[1]);
  return out;
}

/** 一条规则的选择器里出现的元素类型名（不含伪类 / 属性 / 类）。 */
function typeSelectorsOf(selector) {
  const out = new Set();
  for (const compound of selector.split(/[\s,>+~]+/)) {
    const m = compound.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** 规则体里 var() 引用到的自定义属性。 */
function varTokensOf(body) {
  const out = new Set();
  for (const m of body.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) out.add(m[1]);
  return out;
}

/** 规则体里的 min-height（px）。 */
function minHeightOf(body) {
  const m = body.match(/min-height\s*:\s*([0-9.]+)px/);
  return m ? Number(m[1]) : null;
}

function parseCss() {
  const rules = [];
  for (const file of listCssFiles(CSS_DIR)) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    // 只匹配「没有嵌套花括号」的规则体；@media 之类的外层壳自然被跳过，
    // 里面的规则照样能被匹配到。
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      if (!selector || selector.startsWith("@")) continue;
      const body = m[2];
      rules.push({
        file,
        selector,
        classes: classTokensOf(selector),
        types: typeSelectorsOf(selector),
        vars: varTokensOf(body),
        minHeight: minHeightOf(body),
      });
    }
  }
  return rules;
}

/* ==================== 文档解析 ==================== */

/** 取某个小节的正文行（标题行之后、下一条标题之前）。 */
function sectionLines(docLines, sec) {
  const re = new RegExp("^###\\s+" + sec.replace(".", "\\.") + "\\s");
  let start = -1;
  for (let i = 0; i < docLines.length; i++) {
    if (re.test(docLines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start < 0) return null;
  let end = docLines.length;
  for (let i = start; i < docLines.length; i++) {
    if (/^#{2,4}\s/.test(docLines[i])) {
      end = i;
      break;
    }
  }
  return docLines.slice(start, end);
}

/** 行内代码 `` `...` `` 里的内容。 */
function inlineSpans(line) {
  const out = [];
  for (const m of line.matchAll(/`([^`]+)`/g)) out.push(m[1]);
  return out;
}

/** 一个字符串里的类名（去掉伪类 / 伪元素后缀）。 */
function classNameIn(text) {
  const cut = text.split("::")[0].split(":")[0].trim();
  const m = cut.match(/^\.([A-Za-z_][A-Za-z0-9_-]*)$/);
  return m ? m[1] : null;
}

/** HTML class 属性里的一个 token（**没有**前导点）。 */
function classAttrName(text) {
  const m = text.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)$/);
  return m ? m[1] : null;
}

/** 一个字符串里的 HTML 标签名。 */
function tagsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b/g)) out.add(m[1]);
  return out;
}

/** 一个字符串里的自定义属性名。 */
function tokensIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/--[A-Za-z0-9_-]+/g)) out.add(m[0]);
  return out;
}

/**
 * 收集一个小节的类名 / 规格 token / 元素标签。
 * 规则：含「规划中」的行整体豁免（文档明说还没落地就不算漂移）。
 */
function collectSection(lines) {
  const classes = new Set();
  const tokens = new Set();
  const tags = new Set();
  let inFence = false;
  let fenceLang = "";
  for (const line of lines) {
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[1];
      } else {
        inFence = false;
        fenceLang = "";
      }
      continue;
    }
    if (line.includes("规划中")) continue;
    if (inFence) {
      // 代码块里：HTML 块取 class 属性；任何块都取标签名与 token。
      for (const m of line.matchAll(/class\s*=\s*"([^"]*)"/g)) {
        for (const t of m[1].split(/\s+/)) {
          const c = classAttrName(t);
          if (c) classes.add(c);
        }
      }
      for (const t of tagsIn(line)) tags.add(t);
      continue;
    }
    // 普通正文行：行内代码里的类名 / 标签 / token；表格行里的 `.class`。
    for (const span of inlineSpans(line)) {
      const c = classNameIn(span);
      if (c) {
        // 这一段是**类名**（如 `.btn--ghost`）⇒ 只当类名收，
        // 不能把类名里的 `--ghost` 后缀误当成自定义属性。
        classes.add(c);
        continue;
      }
      for (const t of tagsIn(span)) tags.add(t);
      for (const tk of tokensIn(span)) tokens.add(tk);
    }
    if (/^\s*\|/.test(line)) {
      for (const cell of line.split("|")) {
        const c = classNameIn(cell.trim().replace(/`/g, ""));
        if (c) classes.add(c);
      }
    }
  }
  return { classes, tokens, tags, fenceLang };
}

/** 取 §6.1 那张带 min-height 列的表：返回 [{cls, docHeight}]。 */
function parseSizeTable(lines) {
  const rows = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*\|/.test(l) && l.includes("min-height") && l.includes("变体")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return rows;
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l)) break;
    const cells = l
      .split("|")
      .slice(1, -1)
      .map((x) => x.trim().replace(/`/g, ""));
    if (cells.length < 3) continue;
    const cls = classNameIn(cells[0]);
    const h = cells[2].match(/^([0-9.]+)px$/);
    if (cls && h) rows.push({ cls, docHeight: Number(h[1]) });
  }
  return rows;
}

/* ==================== 判据 ==================== */

function main() {
  if (!fs.existsSync(DOC)) {
    console.log(`✗ DCX4 覆盖度自证不足：找不到设计系统文档 ${DOC}`);
    process.exit(1);
  }
  const docLines = fs.readFileSync(DOC, "utf8").split("\n");
  const rules = parseCss();

  const definedClasses = new Set();
  for (const r of rules) for (const c of r.classes) definedClasses.add(c);

  const sections = {};
  for (const sec of SECTIONS) {
    const lines = sectionLines(docLines, sec);
    sections[sec] = lines === null ? null : { lines, ...collectSection(lines) };
  }

  /* --- DCX1 类名必须真实存在 --- */
  for (const sec of SECTIONS) {
    const s = sections[sec];
    if (!s) {
      fail(`DCX1 §${sec} 这一节在设计系统文档里没有找到`);
      continue;
    }
    for (const c of [...s.classes].sort()) {
      if (!definedClasses.has(c)) {
        fail(`DCX1 §${sec} 点名的类名 .${c} 在 CSS 里没有对应的类选择器`);
      }
    }
  }

  /* --- DCX2 规格 token 必须被该组件真正用上 --- */
  for (const sec of SECTIONS) {
    const s = sections[sec];
    if (!s) continue;
    const scope = new Set([...s.classes, ...s.tags]);
    for (const tk of [...s.tokens].sort()) {
      /* 作用域里的**类**或**元素**命中即可：
         §6.5 引用块没有自己的类，样式挂在 `blockquote` 元素上 —— 只认类会误伤。 */
      const hit = rules.some(
        (r) =>
          ([...r.classes].some((c) => scope.has(c)) ||
            [...r.types].some((t) => scope.has(t))) &&
          r.vars.has(tk)
      );
      if (!hit) {
        fail(
          `DCX2 §${sec} 点名的规格 token ${tk} 在该组件的 CSS 规则里没有被 var() 引用`
        );
      }
    }
  }

  /* --- DCX3 §6.1 的 min-height 逐行与 CSS 对齐 --- */
  const sizeSec = sections[SIZES_SECTION];
  const sizeRows = sizeSec ? parseSizeTable(sizeSec.lines) : [];
  const baseClass = sizeRows.length ? sizeRows[0].cls : "btn";
  const heightOf = (cls, depth) => {
    const vals = new Set();
    for (const r of rules) {
      if (!r.classes.has(cls)) continue;
      if (r.minHeight !== null) vals.add(r.minHeight);
    }
    if (vals.size === 1) return [...vals][0];
    if (vals.size > 1) return "冲突";
    if (depth < 3 && cls !== baseClass) return heightOf(baseClass, depth + 1);
    return null;
  };
  for (const row of sizeRows) {
    const cssH = heightOf(row.cls, 0);
    if (cssH === null) {
      fail(`DCX3 §${SIZES_SECTION} 表里 .${row.cls} 的 min-height 在 CSS 里找不到`);
    } else if (cssH === "冲突") {
      fail(`DCX3 §${SIZES_SECTION} 表里 .${row.cls} 的 min-height 在 CSS 里有多处取值`);
    } else if (cssH !== row.docHeight) {
      fail(
        `DCX3 §${SIZES_SECTION} 表里 .${row.cls} 的 min-height 写的是 ${row.docHeight}px，CSS 实际是 ${cssH}px`
      );
    }
  }

  /* --- DCX4 覆盖度自证 --- */
  let classCount = 0;
  let tokenCount = 0;
  const emptySections = [];
  for (const sec of SECTIONS) {
    const s = sections[sec];
    /* 小节整个不见了由 DCX1 报（归属唯一）；这里不重复计入覆盖度。 */
    if (!s) continue;
    classCount += s.classes.size;
    tokenCount += s.tokens.size;
    if (s.classes.size === 0 && s.tokens.size === 0) emptySections.push(sec);
  }
  const short = [];
  if (classCount < MIN_CLASSES) short.push(`类名 ${classCount} < ${MIN_CLASSES}`);
  if (tokenCount < MIN_TOKENS) short.push(`规格 token ${tokenCount} < ${MIN_TOKENS}`);
  if (sizeRows.length < MIN_SIZE_ROWS) short.push(`尺寸表行 ${sizeRows.length} < ${MIN_SIZE_ROWS}`);
  if (rules.length < MIN_CSS_RULES) short.push(`CSS 规则 ${rules.length} < ${MIN_CSS_RULES}`);
  if (emptySections.length) short.push(`这些小节没扫出任何东西：${emptySections.join("、")}`);
  if (short.length) {
    fail(`DCX4 覆盖度自证不足：${short.join("；")}`);
  }

  if (problems.length) {
    console.log("设计系统组件清单契约门禁未通过：");
    for (const p of problems) console.log(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `设计系统组件清单契约门禁通过（类名 ${classCount} 个 · 规格 token ${tokenCount} 个 · ` +
      `尺寸表 ${sizeRows.length} 行 · CSS 规则 ${rules.length} 条）`
  );
}

main();
