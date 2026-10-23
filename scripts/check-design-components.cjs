#!/usr/bin/env node
/**
 * 设计系统组件清单契约门禁 —— 守住「docs/design-system.md §6 组件清单里写的
 * 类名 / 规格 token / 高度规格 == 代码实际」这条线。
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
 *   2026-10-23（D83 场次）实测：§6 **剩下四节同样对不上**，而且它们从来没被任何
 *   门禁看过（既有那道设计系统契约门禁只守 §6.0 / §6.4 / §10 / §2.2 / §2.3）：
 *     · §6.3 表单：写「必填项加 `*` 红色非品牌色」，而**全仓没有任何 required
 *       相关样式**；写「高度 40px」，但 `textarea` 是 `height: auto` +
 *       `min-height: 120px`（例外被漏掉），`label` 另有 `font-weight: 600` 与
 *       `margin-bottom: 4px` 没写；整节**没有任何类名或元素锚点**，机器核不到。
 *     · §6.8 顶栏：写「高度 64px」，代码里是 **56px**；写「桌面端不 sticky、
 *       首次滚动后 sticky」，代码里是**始终** `position: sticky; top: 0`；
 *       写「水平导航 5 项 + 搜索图标」，代码里导航项数由 `site.nav` 决定、
 *       **根本没有搜索入口**；写「站点 Logo」，实际是内联 SVG 标记 + 文字站名。
 *     · §6.9：写「圆点分隔符」「左右按钮带 SVG」，但站内**面包屑根本不存在**
 *       （无 CSS、无模板，且它是中央台账里一条待拍板事项的备选方案），
 *       分页方向标记其实是**字符箭头**（不是 SVG），而**标签云 `.tag-cloud`
 *       标题里点名了、正文一个字没提**。
 *   这族漂移不会让站点变坏，只会让后来的人（包括 agent）照着**无效类名**实现，
 *   或者照着**不存在的能力**提需求。
 *   ⚠️ 修法是**改文档**而不是往 CSS 里补类：补上去的类没有落点，会被
 *   死类门禁（死 CSS 检查那道）当场判红。
 *
 * 判据：
 *   DCX1 被点名的小节里的类名必须真实存在 ——
 *      类名从三处收：表格里的 `.class`、正文行内代码里的 `.class`、
 *      HTML 示例里 `class="..."` 的每个 token。类名必须在 `src/assets/css` 下
 *      递归找到的 .css 文件里**作为类选择器出现过**（`.btn--primary` 这种形态算）。
 *      ⚠️ 含「规划中」的行**整体豁免** —— 文档有权写「这个类还没落地」，
 *      但必须**明写**是规划中（§6.7 的 `.annot-inline` 就是这个写法）。
 *   DCX2 小节点名的规格 token（`--radius-md` 之类）必须**被该组件真正用上** ——
 *      「token 在代码里存在」不等于「这个组件用了它」：`.card` 从来没有过内边距，
 *      所以「`.card` 用 `--space-4`」这种话必须判红。
 *      作用域 = 该小节点名的**类**（表格 + 正文 + HTML 块）∪ 该小节出现的
 *      **元素标签**（HTML 块与行内代码里的 `<tag>`）：§6.5 引用块没有类，
 *      它的样式挂在 `blockquote` 元素上，作用域就该是元素。
 *      作用域为空（既无类名也无元素）时**跳过**，不产生假红 ——
 *      这种情况由 DCX4 报「没有锚点，核不到」。
 *   DCX3 **带高度列的表**里的高度必须与 CSS **逐行一致** ——
 *      表头第一列 ∈ {变体, 元素, 选择器}，某一列的列头文本恰为 `min-height`
 *      或 `height`（**列名自报要核对哪个属性**，不是门禁写死）⇒ 这一列的数值
 *      就是该行在 CSS 里该有的高度。行键可以是点号类名（`.btn--sm`），
 *      也可以是元素名（`input` / `select` / `textarea`）。
 *      类行在 CSS 里找不到该属性时回退到**本表首行**（基础行）：变体与基础类
 *      同元素使用（`.btn--primary` 继承 `.btn` 的高度）；元素行**不回退**
 *      （元素之间不互相继承）。
 *      CSS 里根本找不到（或有多处取值）⇒ 判红。
 *   DCX4 覆盖度自证 —— 扫到的类名数 / 规格 token 数 / 高度表张数 / 高度表行数 /
 *      CSS 规则数都不得低于门槛；每个小节也都得扫出东西；每个小节都得有
 *      类名或元素锚点。防止「把文档改空了」「把表头改名让门禁看不见」就能过。
 *
 * ⚠️ 诚实边界（写清楚才算数）：
 *   · 静态检查，不联网，不 import 被检查方（读文件 + 自己解析）。
 *   · 只扫 §6 的八个带类名或可量化规格的小节：6.1 / 6.2 / 6.3 / 6.5 / 6.6 /
 *     6.7 / 6.8 / 6.9。§6.0（文件拆分）与 §6.4（徽章）由**另一道**门禁守着，
 *     本门禁不重复。
 *   · DCX1 只判「类名有没有被定义」，**不判**「这个类当前有没有落点」
 *     （那是死 CSS 那道门禁的活）。
 *   · DCX2 的作用域是**文档自己声明的**：文档写 `.card` 用某个 token，
 *     门禁只要求「`.card` 自己的 CSS 规则里真的 var() 了它」，不判「这是不是
 *     最合适的写法」。
 *   · DCX3 只认**带高度列**的表；「有没有 padding / shadow」这类「有没有某个
 *     属性」的说法**机器判不了**（文档说的是「没有」，不是「有」），
 *     不在本门禁范围。
 *   · 高度只认 **px**；`height: auto`、`min-height: 120%` 这类非 px 写法
 *     不参与比对（但它们**存在**这件事会影响「多处取值」的判定）。
 *   · 元素行只认「主体就是该元素」的选择器（`input[type="text"]` 算），
 *     写在后代里的同名元素（`.annot-pane__head input[type="search"]`）
 *     是**另一个组件**的尺寸，不参与本行的比对。
 *
 * 环境变量（供 scripts/test-design-components.cjs 的注入矩阵用）：
 *   DCX_DOC     —— 覆盖设计系统文档路径。
 *   DCX_CSS_DIR —— 覆盖 CSS 根目录（递归扫描类选择器 / var() 引用 / 高度）。
 *   注入必须在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOC = process.env.DCX_DOC || path.join(ROOT, "docs", "design-system.md");
const CSS_DIR = process.env.DCX_CSS_DIR || path.join(ROOT, "src", "assets", "css");

/* 本门禁看的八个小节。 */
const SECTIONS = ["6.1", "6.2", "6.3", "6.5", "6.6", "6.7", "6.8", "6.9"];

/* 表头第一列允许的写法（行键要么是点号类名，要么是元素名）。 */
const KEY_HEADERS = ["变体", "元素", "选择器"];

/* 高度列的列头文本（自报属性）。 */
const HEIGHT_PROPS = ["min-height", "height"];

/* 覆盖度门槛（自证用，防止「改空了就通过」「改表头就绕过」）。 */
const MIN_CLASSES = 8;
const MIN_TOKENS = 12;
const MIN_SIZE_ROWS = 8;
const MIN_HEIGHT_TABLES = 5;
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

/**
 * 一条规则里「主体就是该元素」的选择器部分。
 * 例：`input[type="text"], select` ⇒ {input, select}；
 *     `.annot-pane__head input[type="search"]` ⇒ 空（后代里的同名元素
 *     是另一个组件的尺寸，不该参与本行的比对）。
 */
function bareTypeSubjectsOf(selector) {
  const out = new Set();
  for (const part of selector.split(",")) {
    const p = part.trim();
    if (!p || /[\s>+~]/.test(p)) continue;
    const m = p.match(/^([a-zA-Z][a-zA-Z0-9-]*)/);
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

/**
 * 规则体里的 height（px）。
 * ⚠️ 负向后视排除 min-height / max-height / line-height（它们的 "height"
 * 前面是连字符，不是本属性）。
 */
function heightOf(body) {
  const m = body.match(/(?<![a-z-])height\s*:\s*([0-9.]+)px/);
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
        bareTypes: bareTypeSubjectsOf(selector),
        vars: varTokensOf(body),
        minHeight: minHeightOf(body),
        height: heightOf(body),
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

/** 表格行拆成单元格（去掉首尾的空壳）。 */
function splitCells(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((x) => x.trim().replace(/`/g, ""));
}

/**
 * 找出小节里所有「带高度列」的表。
 * 表头第一列 ∈ {变体, 元素, 选择器}；某一列的列头文本恰为 min-height / height
 * ⇒ 这一列自报要核对哪个高度属性。行键：点号类名（kind=class）或元素名（kind=type）。
 */
function parseHeightTables(lines) {
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!/^\s*\|/.test(l)) continue;
    const header = splitCells(l);
    if (header.length < 3) continue;
    if (!KEY_HEADERS.includes(header[0])) continue;
    let col = -1;
    let prop = "";
    for (let c = 1; c < header.length; c++) {
      const t = header[c].toLowerCase();
      if (HEIGHT_PROPS.includes(t)) {
        col = c;
        prop = t;
        break;
      }
    }
    if (col < 0) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length; j++) {
      const r = lines[j];
      if (!/^\s*\|/.test(r)) break;
      const cells = splitCells(r);
      if (cells.length <= col) continue;
      const raw = cells[0].trim();
      const cls = classNameIn(raw);
      const isType = !cls && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(raw);
      if (!cls && !isType) continue;
      const h = cells[col].match(/^([0-9.]+)px$/);
      if (!h) continue;
      rows.push({
        kind: cls ? "class" : "type",
        key: cls ? cls : raw,
        prop,
        docHeight: Number(h[1]),
      });
    }
    if (rows.length) tables.push({ prop, rows });
  }
  return tables;
}

/* ==================== 判据 ==================== */

/** 某一行键（类名或元素名）在 CSS 里对应的高度值；null = 找不到，"冲突" = 多处取值。 */
function heightValue(rules, kind, key, prop) {
  const vals = new Set();
  for (const r of rules) {
    const owns = kind === "class" ? r.classes.has(key) : r.bareTypes.has(key);
    if (!owns) continue;
    const v = prop === "min-height" ? r.minHeight : r.height;
    if (v !== null) vals.add(v);
  }
  if (vals.size === 1) return [...vals][0];
  if (vals.size > 1) return "冲突";
  return null;
}

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
    sections[sec] =
      lines === null ? null : { lines, ...collectSection(lines), tables: parseHeightTables(lines) };
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
    /* 作用域为空（既无类名也无元素）⇒ 这一节的 token 核不到，
       不在这里产生误导性红因，由 DCX4 报「没有锚点」。 */
    if (scope.size === 0) continue;
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

  /* --- DCX3 带高度列的表逐行与 CSS 对齐 --- */
  let sizeRows = 0;
  let tableCount = 0;
  for (const sec of SECTIONS) {
    const s = sections[sec];
    if (!s) continue;
    for (const table of s.tables) {
      tableCount += 1;
      const base = table.rows[0];
      for (const row of table.rows) {
        sizeRows += 1;
        const label = row.kind === "class" ? `.${row.key}` : row.key;
        let cssH = heightValue(rules, row.kind, row.key, table.prop);
        /* 类行在 CSS 里没有该属性时回退到本表首行（基础行）：
           变体与基础类同元素使用（`.btn--primary` 继承 `.btn` 的高度）。
           元素行**不回退** —— 元素之间不互相继承。 */
        if (cssH === null && row.kind === "class" && base.kind === "class" && base.key !== row.key) {
          cssH = heightValue(rules, base.kind, base.key, table.prop);
        }
        if (cssH === null) {
          fail(`DCX3 §${sec} 表里 ${label} 的高度规格在 CSS 里找不到`);
        } else if (cssH === "冲突") {
          fail(`DCX3 §${sec} 表里 ${label} 的高度规格在 CSS 里有多处取值`);
        } else if (cssH !== row.docHeight) {
          fail(
            `DCX3 §${sec} 表里 ${label} 的高度规格写的是 ${row.docHeight}px，CSS 实际是 ${cssH}px`
          );
        }
      }
    }
  }

  /* --- DCX4 覆盖度自证 --- */
  let classCount = 0;
  let tokenCount = 0;
  const emptySections = [];
  const anchorlessSections = [];
  for (const sec of SECTIONS) {
    const s = sections[sec];
    /* 小节整个不见了由 DCX1 报（归属唯一）；这里不重复计入覆盖度。 */
    if (!s) continue;
    classCount += s.classes.size;
    tokenCount += s.tokens.size;
    if (s.classes.size === 0 && s.tokens.size === 0) emptySections.push(sec);
    if (s.classes.size === 0 && s.tags.size === 0) anchorlessSections.push(sec);
  }
  const short = [];
  if (classCount < MIN_CLASSES) short.push(`类名 ${classCount} < ${MIN_CLASSES}`);
  if (tokenCount < MIN_TOKENS) short.push(`规格 token ${tokenCount} < ${MIN_TOKENS}`);
  if (sizeRows < MIN_SIZE_ROWS) short.push(`尺寸表行 ${sizeRows} < ${MIN_SIZE_ROWS}`);
  if (tableCount < MIN_HEIGHT_TABLES) {
    short.push(`带高度列的表 ${tableCount} < ${MIN_HEIGHT_TABLES}`);
  }
  if (rules.length < MIN_CSS_RULES) short.push(`CSS 规则 ${rules.length} < ${MIN_CSS_RULES}`);
  if (emptySections.length) short.push(`这些小节没扫出任何东西：${emptySections.join("、")}`);
  if (anchorlessSections.length) {
    short.push(`这些小节没有类名/元素锚点，规格 token 核对不到：${anchorlessSections.join("、")}`);
  }
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
      `高度表 ${tableCount} 张 / ${sizeRows} 行 · CSS 规则 ${rules.length} 条）`
  );
}

main();
