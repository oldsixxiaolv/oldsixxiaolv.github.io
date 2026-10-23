#!/usr/bin/env node
/**
 * 论文精读交互契约门禁 —— 守住「批注 kind 配色契约与类名清单必须和代码现实一致」。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-23（D81 场次）实测：docs/papers-interaction.md 是全仓**唯一**没有任何门禁读它的
 *   活文档（附录 B 类清单里那些名字只是被字符串匹配命中，不是真读）。实测它与代码现实有六处漂移：
 *     · §3.4 的 kind→颜色表：6 个 kind 里 5 个对不上 —— critique 与 typo 在文档里**正好互换**
 *       （文档 critique=warning / typo=danger，代码 critique=danger / typo=warning），
 *       link 的色系也不同（文档 sage-500，代码 neutral-500/600）；figure 的边条与文字色
 *       在代码里是 sage-500 的 86% 混色 + sage-700 两档，文档只写了一个 sage-700；
 *     · §5.2「关键样式」给的是**从来没匹配上**的死规则：文档里的 4 条
 *       `.annot-item[data-kind="…"]` —— annotations.js 把 data-kind 写在
 *       `<article class="annot-card">` 上，带 annot-item 的是内层 `<button>`，它只有
 *       data-annotation-id；真正的 kind→颜色接线在 `.annot-card[data-kind]` /
 *       `.annot-filter[data-kind]` / `.paper-anchor--X` 上。同一段里 `.annot-pane` 的
 *       max-height / background / border-radius 与 paper-reader.css 的真实值也不一致；
 *     · 附录 C 自称「最终版」的 kind→token 表与代码不符（figure 是 sage 族、link 是中性灰、
 *       critique 是 danger、typo 是琥珀），末尾那段「⚠️ 与代码现状的差异（未收敛）… 这一处需要
 *       owner 拍板」三处现状陈述说错（说「代码仍按 v1.0 渲染」——实际代码已经是第三次改版；
 *       说「link 走 sage-500」——实际是 neutral-500/600 且代码注释写明那是**故意**；
 *       说「要落地 v1.1 就改 .annot-item[data-kind="figure"]」——那处接线根本不在 .annot-item 上）；
 *     · C.2 / C.3 的语义推理与代码现状相反（C.2 的理由「figure 与 link 太接近」在代码里
 *       已不成立 —— link 早就改成中性灰了；C.3 说 typo 用 danger 红「与其他 kind 形成最大色距」
 *       —— 代码里 typo 是琥珀 + 虚线边条，danger 红是 critique）；
 *     · 附录 B「CSS 类一览」列着 `.paper-tabs` / `.tab` —— 这两个类**早在 D54 场次就被当死类
 *       删掉了**（_paper.css 里还留着说明这件事的注释），而附录 B 还把它们当在用的类写着；
 *       同一张表里 `.annot-item` 的语义也**反了**（它其实是批注卡头部的内层按钮，
 *       真正的「单条批注」是 `.annot-card`），且漏列了 JS 实际生成的一批核心类；
 *     · README.md 的 kind 配色表是**同一张错表**，还自称「上表与 _paper.css 保持一致」；
 *       docs/design-system.md §6.7 把附录 C 当作 kind 配色映射的出处。
 *
 *   ⇒ 更要紧的是**零门禁看守**：没有任何一道门禁核对「文档里的 kind 配色契约与类名清单
 *     是否还是代码现状」。
 *
 * 判据：
 *   PI1 文档的两张 kind 表（docs §3.4 与 README）里的 kind 集合
 *      == 代码里的 kind 集合（annotations.js 的 KIND_LABELS），**双向**。
 *      少列 ⇒ 读者不知道有这一类；多列 ⇒ 文档指向一个不存在的 kind。
 *   PI2 kind 集合与调色板在**代码内部**自洽：KIND_LABELS 与 KIND_ICONS 键集合相同；
 *      _paper.css 定义的 kind 集合 == 代码 kind 集合；每个 kind 的 edge + ink **成对**齐全。
 *   PI3 文档表里出现的每个 `--kind-<kind>-edge|ink` token，必须在 _paper.css 里真实定义。
 *   PI4 文档的 kind 表里**不得出现 `--color-*` token**。
 *      这是本轮修法的根因锁：文档曾把 CSS 的**唯一真源**复制了一份，两份各自漂移。
 *      修法是**去重**（文档只列 token 名，指向真源），这条判据把「又抄了一份」钉死。
 *   PI5 文档里的批注类名必须**真实存在**：附录 B 类名表 + §5.2 代码块。
 *      带 `{kind}` 的模板按前缀匹配（JS 里是模板串）；普通类名必须**精确命中**
 *      （不靠前缀蒙混过关 —— 否则 `.tab` 会被 `table` 之类的类放过）。
 *   PI6 文档里带 `[data-kind="…"]` 的选择器，必须用**代码里真正承载 data-kind 的那个类**。
 *      真源是 CSS 里带 `[data-kind` 的那条规则（当前是 .annot-card 与 .annot-filter；
 *      `.annot-kind` 只是它们的后代，不承载该属性）。
 *      这条判据专治「类名都存在、规则却永远匹配不上」—— 文档 §5.2 里的
 *      6 条 `.annot-item[data-kind="…"]` 属于这一族。
 *   PI7 覆盖度自证 —— 真源 JS、真源 CSS、docs §3.4 表、README 表、附录 B 表、§5.2 代码块，
 *      六样各一份，缺一即红（防「改空了通过」）。
 *
 * ⚠️ 为什么只扫这几处（**不扫整份文档**）：
 *   docs/papers-interaction.md 里 §4.2 / §6.1 / §7 / §9.2 / §11 混着**已实现与规划**内容
 *   （例如 §7 的移动端 Tab Bar 三件套在 D54 已被当死类删掉，但 §7 仍把它当规划写）——
 *   拿整份文档对代码会假红（前序场次因此判过「不宜做」）。
 *   ⇒ 本门禁只扫**被改写成明确契约**的四处：§3.4 表、§5.2 代码块、附录 B 表、README 表。
 *     其余段落是设计稿，不受本门禁约束。
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 本门禁是**静态**的：不联网、不跑构建、不 require 被检查方，纯读文本。
 *   · PI1 认的是「表的第一列是反引号包的小写标识符」；PI3 / PI4 认的是「表里出现的 token」。
 *     散文里拐八道弯的写法它读不懂（判不了不等于没问题，但它不会假装判过）。
 *   · PI5 的「真实存在」= 在 CSS（**剥掉注释后**）或 JS 的 class 串里出现过。
 *     它**不判断**这个类当前有没有落点（那是 check-dead-css 的活）。
 *   · §十一 那份全未勾选的验收清单、附录 A 的示例 JSON，机器判不了，本门禁也不假装能判。
 *
 * 环境变量（供 scripts/test-paper-interaction.cjs 的注入矩阵用）：
 *   PI_ROOT —— 覆盖仓库根（文档、CSS、JS 都从这里找）。注入必须发生在副本上。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.PI_ROOT || path.join(__dirname, ".."));

/** 论文精读交互契约文档（相对仓库根）—— §3.4 表与附录 B 表、§5.2 代码块在这里。 */
const DOC_REL = "docs/papers-interaction.md";
/** 站点 README（相对仓库根）—— 另一张 kind 配色表在这里。 */
const README_REL = "README.md";
/** kind 调色板真源（相对仓库根）—— 12 个 --kind-* token 的唯一定义处。 */
const CSS_REL = "src/assets/css/components/_paper.css";
/** 批注 JS（相对仓库根）—— kind 集合的真源（KIND_LABELS / KIND_ICONS）。 */
const JS_REL = "src/assets/js/paper-reader/annotations.js";
/** 样式表根目录（相对仓库根）—— 类名普查用。 */
const CSS_DIR_REL = "src/assets/css";
/** 脚本根目录（相对仓库根）—— 类名普查用。 */
const JS_DIR_REL = "src/assets/js";

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 读取 ---------------- */

function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (e) {
    return null;
  }
}

function walkFiles(rel, ext) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(ext)) out.push(p);
    }
  };
  walk(path.join(ROOT, rel));
  return out;
}

const docText = readText(DOC_REL);
const readmeText = readText(README_REL);
const cssText = readText(CSS_REL);
const jsText = readText(JS_REL);

const docLines = docText === null ? [] : docText.split("\n");
const readmeLines = readmeText === null ? [] : readmeText.split("\n");

/* ---------------- Markdown 解析 ---------------- */

/** 拆一行表格：按未转义的 | 分格（支持 \| 字面竖线）。 */
function splitCells(line) {
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (c === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(cells) {
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/`/g, "").trim()))
  );
}

function parseTable(rows) {
  if (!rows || rows.length < 2) return null;
  const cells = rows.map(splitCells);
  const header = cells[0];
  const body = cells.slice(1).filter((r) => !isSeparatorRow(r));
  return { header, body, raw: rows };
}

/** 在某个标题之后找第一张表；遇到下一个标题就停（找不到返回 null）。 */
function findTableAfter(lines, headingRe) {
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx < 0) return null;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\s*#{1,6}\s/.test(lines[i])) return null;
    if (lines[i].trim().startsWith("|")) {
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        rows.push(lines[j]);
        j++;
      }
      return parseTable(rows);
    }
  }
  return null;
}

/** 在整份文档里找所有「首列表头 == key」的表。 */
function findTablesByHeaderKey(lines, key) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith("|")) {
      const rows = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith("|")) {
        rows.push(lines[j]);
        j++;
      }
      const t = parseTable(rows);
      if (t && t.header[0].replace(/`/g, "").trim() === key) out.push(t);
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

/** 在某个标题之后找第一个 ```css 围栏块。 */
function findCssBlockAfter(lines, headingRe) {
  const idx = lines.findIndex((l) => headingRe.test(l));
  if (idx < 0) return null;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\s*#{1,6}\s/.test(lines[i])) return null;
    if (lines[i].trim() === "```css") {
      const body = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trim().startsWith("```")) {
        body.push(lines[j]);
        j++;
      }
      return body;
    }
  }
  return null;
}

/* ---------------- 真源解析 ---------------- */

/** JS 里的 kind 集合：KIND_LABELS 的键。 */
function jsKindLabels(text) {
  if (!text) return [];
  const m = text.match(/const\s+KIND_LABELS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split("\n")) {
    const km = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (km) out.push(km[1]);
  }
  return out;
}

/** JS 里的 kind 集合：KIND_ICONS 的键。 */
function jsKindIcons(text) {
  if (!text) return [];
  const m = text.match(/const\s+KIND_ICONS\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) return [];
  const out = [];
  for (const line of m[1].split("\n")) {
    const km = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:/);
    if (km) out.push(km[1]);
  }
  return out;
}

/** CSS 里**定义**（带冒号）的 --kind-<kind>-edge|ink token 集合。 */
function cssKindTokens(text) {
  const set = new Set();
  if (!text) return set;
  for (const m of text.matchAll(/--kind-([a-z0-9-]+)-(edge|ink)\s*:/g)) {
    set.add(`--kind-${m[1]}-${m[2]}`);
  }
  return set;
}

/** CSS 里定义过 --kind-* 的 kind 集合。 */
function cssKindNames(tokens) {
  const out = new Set();
  for (const t of tokens) {
    const m = /^--kind-([a-z0-9-]+)-(edge|ink)$/.exec(t);
    if (m) out.add(m[1]);
  }
  return out;
}

/** 剥掉 CSS 注释（/* ... *\/ 跨行也算）。 */
function stripCssComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** 全站 CSS 里的类名（剥注释后）。 */
function cssClassNames() {
  const set = new Set();
  for (const f of walkFiles(CSS_DIR_REL, ".css")) {
    let t = "";
    try {
      t = stripCssComments(fs.readFileSync(f, "utf8"));
    } catch (e) {
      continue;
    }
    for (const m of t.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) set.add(m[1]);
  }
  return set;
}

/** 全站 JS 里的类名与模板前缀（annot-card-- 这类）。 */
function jsClassNames() {
  const names = new Set();
  const prefixes = new Set();
  for (const f of walkFiles(JS_DIR_REL, ".js")) {
    let t = "";
    try {
      t = fs.readFileSync(f, "utf8");
    } catch (e) {
      continue;
    }
    const lits = [];
    for (const m of t.matchAll(/class(?:Name)?\s*[:=]\s*([`'"](?:[^`'"])*[`'"])/g)) {
      lits.push(m[1]);
    }
    for (const m of t.matchAll(/classList\.(?:add|toggle)\(\s*([`'"](?:[^`'"])*[`'"])/g)) {
      lits.push(m[1]);
    }
    for (const lit of lits) {
      const body = lit.slice(1, -1).replace(/\$\{[^}]*\}/g, "~");
      for (const w of body.split(/\s+/)) {
        if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(w)) names.add(w);
        else if (w.includes("~")) {
          const p = w.split("~")[0];
          if (p) prefixes.add(p);
        }
      }
    }
  }
  return { names, prefixes };
}

/** 全站 CSS 里**真正承载** data-kind 属性的类（属性选择器所在的复合选择器里的类）。 */
function cssDataKindClasses() {
  const set = new Set();
  for (const f of walkFiles(CSS_DIR_REL, ".css")) {
    let t = "";
    try {
      t = stripCssComments(fs.readFileSync(f, "utf8"));
    } catch (e) {
      continue;
    }
    /* 逐条规则：选择器 { 声明 }。选择器里不含嵌套大括号，
       所以 @media 内部的规则会被正确地单独捕获。 */
    for (const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1];
      if (!/\[data-kind/.test(sel)) continue;
      for (const part of sel.split(",")) {
        if (!/\[data-kind/.test(part)) continue;
        /* 后代组合子里只有**含属性选择器的那一个**才承载 data-kind：
           `.annot-card[data-kind] .annot-kind` 里承载者是 annot-card，不是 annot-kind。 */
        for (const compound of part.trim().split(/\s+(?![^()]*\))/)) {
          if (!/\[data-kind/.test(compound)) continue;
          for (const cm of compound.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
            set.add(cm[1]);
          }
        }
      }
    }
  }
  return set;
}

/* ---------------- 表内容提取 ---------------- */

/** 表的 kind 列：第一列里反引号包的小写标识符。 */
function tableKinds(table) {
  const out = [];
  if (!table) return out;
  for (const row of table.body) {
    if (!row.length) continue;
    const v = row[0].replace(/`/g, "").trim();
    if (/^[a-z][a-z0-9-]*$/.test(v)) out.push(v);
  }
  return out;
}

/** 表里出现的所有 --kind-* token。 */
function tableKindTokens(table) {
  const out = [];
  if (!table) return out;
  const text = table.raw.join("\n");
  for (const m of text.matchAll(/--kind-[a-z0-9-]*-(?:edge|ink)\b/g)) out.push(m[0]);
  return Array.from(new Set(out));
}

/** 表里出现的所有 --color-* token。 */
function tableColorTokens(table) {
  const out = [];
  if (!table) return out;
  const text = table.raw.join("\n");
  for (const m of text.matchAll(/--color-[a-z0-9-]+/g)) out.push(m[0]);
  return Array.from(new Set(out));
}

/** 文件扩展名（文档里出现 `annotations.js` / `_paper.css` 时会被误当成类名）。 */
const FILE_EXT_RE = /^(?:js|mjs|cjs|jsx|ts|tsx|css|scss|md|markdown|json|yml|yaml|njk|html|htm|xml|svg|png|jpe?g|gif|webp|ico|txt|pdf|py|sh)$/i;

/** 文本里出现的所有类名（.xxx 形态）；文件扩展名不算类名。 */
function textClassNames(text) {
  const out = [];
  for (const m of text.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    if (FILE_EXT_RE.test(m[1])) continue;
    out.push(m[1]);
  }
  return Array.from(new Set(out));
}

/** 文本里出现的所有模板类名（.xxx--{kind} 形态 —— 取 -- 之前的部分）。 */
function textTemplateClassNames(text) {
  const out = [];
  for (const m of text.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*?--)\{/g)) out.push(m[1]);
  return Array.from(new Set(out));
}

/* ---------------- 取件 ---------------- */

const docKindTable = findTableAfter(docLines, /^###\s*3\.4\b/);
const docAppBTable = findTableAfter(docLines, /^##\s*附录 B\b/);
const docCssBlock = findCssBlockAfter(docLines, /^###\s*5\.2\b/);
const readmeKindTables = findTablesByHeaderKey(readmeLines, "kind");
const readmeKindTable = readmeKindTables.length === 1 ? readmeKindTables[0] : null;

const codeKinds = jsKindLabels(jsText);
const iconKinds = jsKindIcons(jsText);
const definedTokens = cssKindTokens(cssText);
const cssKinds = cssKindNames(definedTokens);

const cssClasses = cssClassNames();
const jsClasses = jsClassNames();

/* ---------------- PI1 文档 kind 表 ↔ 代码 kind 集合（双向） ---------------- */

function checkKindSet(table, label, where) {
  if (!table) return;
  const docKinds = tableKinds(table);
  const missing = codeKinds.filter((k) => !docKinds.includes(k));
  const extra = docKinds.filter((k) => !codeKinds.includes(k));
  if (missing.length) {
    fail(
      `PI1 ${where} 少列了 kind「${missing.join("」「")}」—— 代码里 ${JS_REL} 的 KIND_LABELS 有这一类，` +
        `表里没有 ⇒ 读者按表实现会漏掉它。补上，或改代码。`
    );
  }
  if (extra.length) {
    fail(
      `PI1 ${where} 多列了 kind「${extra.join("」「")}」—— 代码里 ${JS_REL} 的 KIND_LABELS 没有这一类，` +
        `表里写了 ⇒ 读者照表去实现会撞上不存在的 kind。删掉，或改代码。`
    );
  }
  if (!docKinds.length) {
    fail(
      `PI1 ${where} 一行 kind 都没检出 —— 「文档的 kind 集合 ↔ 代码的 kind 集合」这条判据` +
        `没有基准可比，等于没在检查。`
    );
  }
}

checkKindSet(docKindTable, "docs §3.4", `${DOC_REL} §3.4 表`);
checkKindSet(readmeKindTable, "README", `${README_REL} 的 kind 表`);

/* ---------------- PI2 代码内部自洽 ---------------- */

const labelsOnly = codeKinds.filter((k) => !iconKinds.includes(k));
const iconsOnly = iconKinds.filter((k) => !codeKinds.includes(k));
if (labelsOnly.length || iconsOnly.length) {
  fail(
    `PI2 ${JS_REL} 内部的 kind 集合自相矛盾 —— KIND_LABELS 独有「${labelsOnly.join("」「") || "无"}」，` +
      `KIND_ICONS 独有「${iconsOnly.join("」「") || "无"}」⇒ 标签与图标对不上，改代码。`
  );
}

const cssOnly = [...cssKinds].filter((k) => !codeKinds.includes(k));
const codeOnly = codeKinds.filter((k) => !cssKinds.has(k));
if (cssOnly.length || codeOnly.length) {
  fail(
    `PI2 kind 调色板与代码 kind 集合对不上 —— ${CSS_REL} 多出「${cssOnly.join("」「") || "无"}」，` +
      `代码多出「${codeOnly.join("」「") || "无"}」⇒ 调色板与代码各有一半，改代码让两边一致。`
  );
}

const incompleteKinds = codeKinds.filter(
  (k) =>
    !definedTokens.has(`--kind-${k}-edge`) || !definedTokens.has(`--kind-${k}-ink`)
);
if (incompleteKinds.length) {
  fail(
    `PI2 kind 调色板不成对 —— 「${incompleteKinds.join("」「")}」缺 edge 或 ink 两条 token，` +
      `（每 kind 一条 edge + 一条 ink 是 ${CSS_REL} 的约定）⇒ 补齐定义。`
  );
}

/* ---------------- PI3 文档表里的 --kind-* token 必须真实存在 ---------------- */

function checkKindTokens(table, where) {
  if (!table) return;
  const unknown = tableKindTokens(table).filter((t) => !definedTokens.has(t));
  if (unknown.length) {
    fail(
      `PI3 ${where} 写了 ${CSS_REL} 里没有定义的 token「${unknown.join("」「")}」—— ` +
        `文档指着一个不存在的变量，读者照抄会拿到空值。改成真实 token 名。`
    );
  }
}

checkKindTokens(docKindTable, `${DOC_REL} §3.4 表`);
checkKindTokens(readmeKindTable, `${README_REL} 的 kind 表`);

/* ---------------- PI4 文档表里不得复制色值真源 ---------------- */

function checkNoColorTokens(table, where) {
  if (!table) return;
  const hits = tableColorTokens(table);
  if (hits.length) {
    fail(
      `PI4 ${where} 里出现了色值 token「${hits.join("」「")}」—— kind 配色的**唯一真源**是 ` +
        `${CSS_REL} 的 kind 调色板段，文档只该列 --kind-* token 名。` +
        `把色值抄进文档等于多了一份会各自漂移的副本（这一族漂移就是这么发生的）。`
    );
  }
}

checkNoColorTokens(docKindTable, `${DOC_REL} §3.4 表`);
checkNoColorTokens(readmeKindTable, `${README_REL} 的 kind 表`);

/* ---------------- PI5 文档里的批注类名必须真实存在 ---------------- */

/** 普通类名：必须**精确命中** CSS 或 JS 的 class 串（不靠前缀蒙混过关）。 */
function classExistsExact(name) {
  return cssClasses.has(name) || jsClasses.names.has(name);
}

/** 模板类名（.annot-kind--{kind} 形态）：按前缀匹配。 */
function classPrefixExists(prefix) {
  for (const p of jsClasses.prefixes) if (p === prefix || p.startsWith(prefix)) return true;
  for (const c of cssClasses) if (c.startsWith(prefix)) return true;
  return false;
}

/** 一段 CSS 文本里的规则选择器（先剥注释；选择器里不含嵌套大括号）。 */
function cssRuleSelectors(text) {
  const out = [];
  const t = stripCssComments(text);
  for (const m of t.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel) out.push(sel);
  }
  return out;
}

/** 选择器里带 [data-kind="…"] 的**复合选择器**用了哪些类。
 *  与 cssDataKindClasses 用同一套解析口径（只取承载该属性的那一个复合选择器）。 */
function textDataKindClasses(selectors) {
  const out = [];
  for (const sel of selectors) {
    for (const part of sel.split(",")) {
      for (const compound of part.trim().split(/\s+(?![^()]*\))/)) {
        if (!/\[data-kind/.test(compound)) continue;
        for (const c of compound.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) out.push(c[1]);
      }
    }
  }
  return Array.from(new Set(out));
}

function checkDocClasses(text, where) {
  const tmpl = textTemplateClassNames(text);
  const exact = textClassNames(text).filter((n) => !tmpl.includes(n));
  const missExact = exact.filter((n) => !classExistsExact(n));
  const missTmpl = tmpl.filter((n) => !classPrefixExists(n));
  const missing = missExact.concat(missTmpl);
  if (missing.length) {
    fail(
      `PI5 ${where} 里的类名「${missing.join("」「")}」在 CSS（剥注释后）与 JS 的 class 串里都找不到 —— ` +
        `文档列了一个不存在的类，读者照着写会什么也匹配不上。删掉，或把类补进代码。`
    );
  }
}

if (docAppBTable) {
  const text = docAppBTable.body.map((r) => r.join(" ")).join("\n");
  checkDocClasses(text, `${DOC_REL} 附录 B 类名表`);
}

if (docCssBlock) {
  const sels = cssRuleSelectors(docCssBlock.join("\n"));
  checkDocClasses(sels.join("\n"), `${DOC_REL} §5.2 代码块`);
}

/* ---------------- PI6 带 data-kind 的选择器必须用真正承载它的类 ---------------- */

const dataKindCarriers = cssDataKindClasses();

if (docCssBlock) {
  const sels = cssRuleSelectors(docCssBlock.join("\n"));
  const used = textDataKindClasses(sels);
  const wrong = used.filter((c) => !dataKindCarriers.has(c));
  if (wrong.length) {
    fail(
      `PI6 ${DOC_REL} §5.2 代码块里带 [data-kind="…"] 的选择器用了「${wrong.join("」「")}」—— ` +
        `代码里真正承载 data-kind 的是「${[...dataKindCarriers].join("」「") || "无"}」，` +
        `挂到别的类上那条规则**永远匹配不上**（历史版本的 6 条 .annot-item[data-kind="…"] 就是这么死的）。`
    );
  }
}

/* ---------------- PI7 覆盖度自证 ---------------- */

/* 六项各自一条 fail()：这样「哪一项缺了」在红因里一眼可见，自测也能逐项验证。 */

if (jsText === null || !jsText.length) {
  fail(
    `PI7 覆盖度自证 · kind 真源 JS 不在 —— ${JS_REL} 读不出内容，` +
      `「文档的 kind 集合 ↔ 代码的 kind 集合」没有基准可比。`
  );
}
if (cssText === null || !cssText.length) {
  fail(
    `PI7 覆盖度自证 · 调色板真源 CSS 不在 —— ${CSS_REL} 读不出内容，` +
      `token 是否真实存在没法判。`
  );
}
if (!docKindTable) {
  fail(
    `PI7 覆盖度自证 · §3.4 表没检出 —— ${DOC_REL} 的 §3.4 表找不到，` +
      `kind 契约那张表等于没被检查。`
  );
}
if (!readmeKindTable) {
  fail(
    `PI7 覆盖度自证 · README 表没检出 —— ${README_REL} 里首列表头为 kind 的表` +
      `${readmeKindTables.length > 1 ? `检出 ${readmeKindTables.length} 张（不唯一，没法判）` : "找不到"}，` +
      `README 上那张 kind 表等于没被检查。`
  );
}
if (!docAppBTable) {
  fail(
    `PI7 覆盖度自证 · 附录 B 表没检出 —— ${DOC_REL} 的附录 B 类名表找不到，` +
      `类名清单等于没被检查。`
  );
}
if (!docCssBlock) {
  fail(
    `PI7 覆盖度自证 · §5.2 代码块没检出 —— ${DOC_REL} 的 §5.2 代码块找不到，` +
      `样式接线那段等于没被检查。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("论文精读交互契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    "  判据出处：docs/DEFECT-BACKLOG.md D80（D81 场次实测：kind 配色契约与类名清单与代码现实脱节，且零门禁看守）。"
  );
  console.error("");
  process.exit(1);
}

console.log(
  `论文精读交互契约门禁通过：kind 集合 ${codeKinds.length} 个（${codeKinds.join(" ")}），` +
    `调色板 token ${definedTokens.size} 条成对齐全；docs §3.4 表与 README 表的 kind 集合与代码一致，` +
    `表里只列 --kind-* token 名（没有复制色值）；附录 B 与 §5.2 的类名全部真实存在。`
);
console.log(
  `  · kind 真源：${JS_REL}（KIND_LABELS / KIND_ICONS）；调色板真源：${CSS_REL}（kind 调色板段）。`
);
console.log(
  "  · 本门禁是静态的：不联网、不跑构建、不 require 被检查方，纯读文档与样式表/脚本的文本。"
);
console.log(
  "  · 扫描面只有被改写成明确契约的四处（§3.4 表 / §5.2 代码块 / 附录 B 表 / README 表）；" +
    "文档里其余混合了规划内容的段落不在扫描面内。"
);
