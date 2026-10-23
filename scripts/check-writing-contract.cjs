#!/usr/bin/env node
/**
 * 站内写作契约门禁 —— 守住「docs/blog-writing-guide.md 这份写作契约必须和代码现实一致」。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-23（D80 场次）实测：docs/blog-writing-guide.md 是站内博客文章的**唯一契约**，
 *   它自称「条款全部来自仓库实测（模板消费字段、门禁判据、构建产物），不是设想」。
 *   实测却发现四处早已漂了：
 *     · §2.5 写「check:tag-leak-selftest（7 档注入矩阵）」——
 *       那个自测**早已重写成四件套**：11 档注入（N0–N10）+ 5 条判据级负对照（NC1–NC5）
 *       + 红因归属表 + 覆盖度自证；「7 档」是它被重写**之前**的样子；
 *     · §2.4 写「20 档 —— 其中 M15–M19 是封面这一档」——
 *       档数会随自测增删而变，写死就是个会过期的数字；
 *     · §4 自查清单写「front matter 没有 layout / permalink / tags（自动注入的，别覆盖）」——
 *       与 §2 的字段表（tags 那一行的「必需」列写的是「可选」）和 §2.2
 *       （「tags 不是覆盖，是合并」「主题标签照常写即可」）**直接矛盾**：
 *       tags 是**数组型**注入，Eleventy 把它与 front matter 里的标签**合并**，
 *       所以写 tags 是有效的（列表卡的主题标签就靠它）；照 §4 写，文章就没有主题标签，
 *       而 §4 自己的下一条自查项却要求「/blog/ 列表卡出现主题标签」—— **自查清单自相矛盾**；
 *     · §5「已知缺陷」表里封面开关关着的**原因**仍写着
 *       「（历史文件扩展名骗服务器导致裂图）」——§2.3 在 2026-10-21 已经把这条订正为
 *       **过时事实**（那批文件早就不在仓库里了，真正原因是「开关还没到开的时候」）。
 *
 *   ⇒ 更要紧的是**零门禁看守**：
 *     scripts/check-blog-frontmatter.cjs 守的是**文章文件**（它的全部判据逐条实现），
 *     它**从不看这份文档**；check-tag-leak.cjs 同理。
 *     D79 场次新立的 check-doc-reality.cjs 在文件头里把 blog-writing-guide.md
 *     排除在扫描面之外，理由写的是「后者是契约（由 check-blog-frontmatter 那道门禁逐条实现）」——
 *     **那个理由是假的**：那道门禁实现的是判据，**没有一道门禁核对「文档里的判据表
 *     与门禁源码里的判据是否还是同一批」**。
 *
 * 判据：
 *   WC1 §2.4「判据对照表」里列出的 F 编号集合
 *      == scripts/check-blog-frontmatter.cjs 源码里真实存在的 F 编号集合（双向）。
 *      少列 ⇒ 读者查不到那条判据；多列 ⇒ 文档指向一条不存在的判据。
 *   WC2 §2.5 的 T 编号集合 == scripts/check-tag-leak.cjs 里真实存在的 T 编号集合（双向）。
 *   WC3 契约文档里**表格之外**提及的 F/T 编号必须真实存在（单向）。
 *      表格被核对过，正文提及（「写错了现在会被门禁拦下」）没人管 ⇒ 单独一条。
 *   WC4 §1「自动注入的字段」表列出的字段
 *      == src/content/blog/blog.11tydata.cjs 实际注入的字段（双向）。
 *      双向的含义：数据文件多注入一个字段而文档没更新 ⇒ 判红（这是**新字段**最常见的漂法）。
 *   WC5 §2 字段表里标为「可写」的字段，不得出现在 §4 自查清单的「别写」清单里。
 *      「可选」意味着写了有效，「别写」意味着写了不该写 ⇒ 同一字段两处互斥 ⇒ 判红。
 *   WC6 契约文档不得写死「自测档数」这类**每轮都会变**的数字。
 *      （与 D79 的 DR2 同一手法：DS1 门禁管的是「数字 + 步」，单位不同就漏过去了。）
 *   WC7 覆盖度自证 —— 活文档、两道门禁源码、目录数据文件、§1 注入字段表、
 *      §2 字段表、§2.4 的 F 表、§2.5 的 T 表、§4 自查清单段，八样都得在；缺一即红
 *      （防「改空了通过」）。
 *
 * ⚠️ 为什么只扫 docs/blog-writing-guide.md（**历史记录不扫**）：
 *   docs/IMPROVEMENT-LOG.md、docs/DEFECT-BACKLOG.md、docs/ROADMAP.md 是**历史记录** ——
 *   它们必须原样保留当时的错误写法（缺陷条目里得写着当时那条错的清单），
 *   改写历史就是伪造历史。
 *   docs/information-architecture.md 是设计文档（明确列着「本文提到但代码里还没有」）；
 *   docs/acceptance-report.md、docs/lighthouse-include.md 等是**历史快照**
 *   （README 里已声明「只反映各自标注日期的实测状态，不随代码更新」）。
 *   ⇒ 承载「现在时」写作契约的只有 blog-writing-guide.md 这一份。
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 本门禁是**静态**的：不联网、不跑构建、不 require 被检查方，
 *     纯读四份文件的文本（契约文档 + 两道门禁源码 + 目录数据文件）。
 *   · 「门禁实现了哪些判据」是从**源码里出现的编号 token**推出来的
 *     （`F<n>` / `T<n>`）—— 它认的是「源码里有没有这个编号」，不认「它到底判没判红」。
 *     两道门禁的编号在源码里都有明确的标记行（`// F<n>` / `*   F<n>`），口径一致。
 *   · WC5 只认**「front matter … 没有 / 别写 / 不要写」**这种句式引导的字段清单；
 *     散文里拐八道弯的写法它读不懂（判不了不等于没问题，但它不会假装判过）。
 *   · WC6 只在「自测 / 注入 / 矩阵」语境里判档数，避免误伤别处正当的数字表述。
 *
 * 环境变量（供 scripts/test-writing-contract.cjs 的注入矩阵用）：
 *   WC_ROOT —— 覆盖仓库根（契约文档、两道门禁源码、目录数据文件都从这里找）。
 *              注入必须发生在副本上，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.WC_ROOT || path.join(__dirname, ".."));

/** 站内写作契约（相对仓库根）—— 本门禁唯一扫的活文档。 */
const DOC_REL = "docs/blog-writing-guide.md";
/** 博客 front matter 契约门禁源码（相对仓库根）—— F 判据的真源。 */
const FM_GATE_REL = "scripts/check-blog-frontmatter.cjs";
/** 集合名标签泄漏门禁源码（相对仓库根）—— T 判据的真源。 */
const TL_GATE_REL = "scripts/check-tag-leak.cjs";
/** 博客目录数据文件（相对仓库根）—— 自动注入字段的真源。 */
const DATA_REL = "src/content/blog/blog.11tydata.cjs";

/** 判据编号 token：F 系列与 T 系列（各自的门禁源码里各取各的）。 */
const F_TOKEN_RE = /\bF(\d+)\b/g;
const T_TOKEN_RE = /\bT(\d+)\b/g;
/** front matter 字段名的形态：小写开头的驼峰标识符。 */
const FIELD_RE = /^[A-Za-z][A-Za-z0-9]*$/;
/** 「别写」句式的引导词。 */
const DONT_WRITE_MARKERS = ["没有", "别写", "不要写", "不写"];
/** 字段表「必需」列里表示「不可写」的取值。 */
const NOT_WRITABLE_RE = /^(否|禁止|不要写|不可|不写)$/;
/** 「自测档数」语境：这几个词附近出现的「N 档」才算易变数字。 */
const VOLATILE_CONTEXT_RE = /自测|注入|矩阵/;
/** 「N 档」本身。 */
const VOLATILE_COUNT_RE = /(\d+)\s*档/g;

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/** 文件在仓库根之内时给「相对路径:行号」，否则给绝对路径（自测副本会跑到仓库外）。 */
function where(rel, lineNo) {
  const abs = path.join(ROOT, rel);
  const r = path.relative(ROOT, abs);
  const base = r.startsWith("..") ? abs : r;
  return `${base}:${lineNo}`;
}

/** 读文件；不存在或读不出来返回 null（判不了由覆盖度自证报出来）。 */
function readText(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (e) {
    return null;
  }
}

/** 标题行（# ~ ####）。 */
const HEADING_RE = /^(#{1,4})\s+(.*)$/;

/** 从 startRe 命中的标题行开始，到下一个标题行之前（不含）。找不到返回 null。 */
function sectionRange(lines, startRe) {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** 两个标题之间的行区间（两个都命中才返回；endRe 找不到就用文档末尾）。 */
function rangeBetween(lines, startRe, endRe) {
  const start = lines.findIndex((l) => startRe.test(l));
  if (start < 0) return null;
  const end = endRe ? lines.findIndex((l, i) => i > start && endRe.test(l)) : -1;
  return { start, end: end < 0 ? lines.length : end };
}

/** 把一行 Markdown 表格拆成单元格（去掉首尾空单元格）。 */
function cells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const parts = t.split("|").map((s) => s.trim());
  if (parts.length && parts[0] === "") parts.shift();
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/** 表格分隔行（`|---|---|`）。 */
function isSeparatorRow(cs) {
  return cs.every((c) => /^:?-{2,}:?$/.test(c));
}

/** 区间内的表格行（已排除表头与分隔行）。 */
function tableRows(lines, range) {
  const out = [];
  for (let i = range.start; i < range.end; i++) {
    const cs = cells(lines[i]);
    if (!cs || isSeparatorRow(cs)) continue;
    out.push({ cells: cs, line: i + 1 });
  }
  return out;
}

/** 单元格里所有反引号 token（去反引号、trim）。 */
function backtickTokens(cell) {
  const out = [];
  for (const m of String(cell || "").matchAll(/`([^`]+)`/g)) out.push(m[1].trim());
  return out;
}

/* ---------------- 读源 ---------------- */

const docText = readText(DOC_REL);
const fmText = readText(FM_GATE_REL);
const tlText = readText(TL_GATE_REL);
const dataText = readText(DATA_REL);

const docLines = docText === null ? [] : docText.split("\n");

/** 门禁源码里出现的判据编号集合（去重、升序）。 */
function criteriaSet(text, re) {
  const set = new Set();
  /* 读不到源码时返回**空数组**（不是空 Set）—— 下游一律按数组用
     （filter / includes / join），早退成 Set 会让门禁自己崩掉，
     崩掉 ≠ 判红：真源缺失该由覆盖度自证报出来，不是让门禁抛异常。 */
  if (text === null) return [];
  for (const m of text.matchAll(re)) set.add(m[0]);
  return [...set].sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
}

const fmCriteria = criteriaSet(fmText, F_TOKEN_RE);
const tlCriteria = criteriaSet(tlText, T_TOKEN_RE);

/** 目录数据文件实际注入的字段（`eleventyComputed` 展开一层）。 */
function injectedFields(text) {
  if (text === null) return null;
  const idx = text.indexOf("module.exports");
  if (idx < 0) return null;
  const body = text.slice(idx);
  const out = new Set();
  const topRe = /^ {2}([A-Za-z_$][\w$]*)\s*:/gm;
  let m;
  const topKeys = [];
  while ((m = topRe.exec(body))) topKeys.push({ key: m[1], at: m.index });
  for (const t of topKeys) {
    /* `eleventyComputed` 本身不是一个「字段」—— 契约 §1 列的是它里面的 prev / next。
       所以它是**展开替换**，不是并列（并列的话文档得写 eleventyComputed，实际不是那个意思）。 */
    if (t.key === "eleventyComputed") {
      const rest = body.slice(t.at);
      const blockEnd = rest.indexOf("\n  },");
      const block = blockEnd < 0 ? rest : rest.slice(0, blockEnd);
      const innerRe = /^ {4}([A-Za-z_$][\w$]*)\s*:/gm;
      let im;
      while ((im = innerRe.exec(block))) out.add(im[1]);
      continue;
    }
    out.add(t.key);
  }
  return [...out].sort();
}

/* ---------------- 文档侧抽取 ---------------- */

/** §1「自动注入的字段」表：字段名集合。 */
function docInjectedFields() {
  const range = sectionRange(docLines, /自动注入的字段/);
  if (!range) return null;
  const out = new Set();
  for (const row of tableRows(docLines, range)) {
    for (const tok of backtickTokens(row.cells[0])) {
      if (FIELD_RE.test(tok)) out.add(tok);
    }
  }
  return [...out].sort();
}

/** §2 的 front matter 字段表：{ 字段: 必需列取值 }。 */
function docFieldTable() {
  const range = rangeBetween(docLines, /^##\s*2\.\s*front matter 契约/, /^###\s*2\.1/);
  if (!range) return null;
  const out = new Map();
  for (const row of tableRows(docLines, range)) {
    const names = backtickTokens(row.cells[0]).filter((t) => FIELD_RE.test(t));
    if (!names.length) continue;
    const required = String(row.cells[1] || "")
      .replace(/\*\*/g, "")
      .trim();
    for (const n of names) out.set(n, required);
  }
  return out;
}

/** §2.4 的 F 判据对照表：行号 + 编号。 */
function docFTable() {
  const range = rangeBetween(docLines, /^###\s*2\.4/, /^###\s*2\.5/);
  if (!range) return [];
  const out = [];
  for (const row of tableRows(docLines, range)) {
    const id = row.cells[0];
    if (/^F\d+$/.test(id)) out.push({ id, line: row.line });
  }
  return out;
}

/** §2.5 的 T 判据对照表：行号 + 编号。 */
function docTTable() {
  const range = rangeBetween(docLines, /^###\s*2\.5/, /^##\s*3\./);
  if (!range) return [];
  const out = [];
  for (const row of tableRows(docLines, range)) {
    const id = row.cells[0];
    if (/^T\d+$/.test(id)) out.push({ id, line: row.line });
  }
  return out;
}

/** §4 自查清单：清单正文所在的代码块行区间。 */
function checklistRange() {
  const range = rangeBetween(docLines, /^##\s*4\./, /^##\s*5\./);
  if (!range) return null;
  let inFence = false;
  let start = -1;
  for (let i = range.start; i < range.end; i++) {
    const line = docLines[i];
    if (/^\s*(?:```|~~~)/.test(line)) {
      if (!inFence) {
        inFence = true;
        start = i + 1;
      } else {
        inFence = false;
        return { start, end: i };
      }
    }
  }
  return null;
}

/** §4 自查清单里被列为「别写」的 front matter 字段。 */
function docDontWriteFields() {
  const range = checklistRange();
  if (!range) return null;
  const out = new Set();
  for (let i = range.start; i < range.end; i++) {
    const line = docLines[i];
    if (!line.includes("front matter")) continue;
    let cut = -1;
    let tail = -1;
    for (const mk of DONT_WRITE_MARKERS) {
      const at = line.indexOf(mk);
      if (at >= 0 && (cut < 0 || at < cut)) {
        cut = at;
        tail = at + mk.length;
      }
    }
    if (cut < 0) continue;
    /* 引导词之后、第一个全角括号之前的那一串，就是「别写的字段清单」。 */
    const stop = line.indexOf("（", tail);
    const seg = line.slice(tail, stop < 0 ? line.length : stop);
    for (const tok of seg.split("/")) {
      const t = tok.trim().replace(/[`]/g, "");
      if (FIELD_RE.test(t)) out.add(t);
    }
  }
  return [...out].sort();
}

/* ---------------- WC1 / WC2 判据对照表 ---------------- */

const fTable = docFTable();
const tTable = docTTable();

if (fTable.length) {
  const docIds = fTable.map((r) => r.id);
  const missing = fmCriteria.filter((c) => !docIds.includes(c));
  const extra = docIds.filter((id) => !fmCriteria.includes(id));
  if (missing.length || extra.length) {
    fail(
      `WC1 ${DOC_REL} §2.4 的 F 判据对照表与 ${FM_GATE_REL} 的实际判据对不上 —— ` +
        (missing.length ? `门禁已实现但文档没列：${missing.join(" / ")}；` : "") +
        (extra.length ? `文档列了但门禁里没有：${extra.join(" / ")}；` : "") +
        `读者照文档找不到对应判据，或被指向一条不存在的判据。`
    );
  }
}

if (tTable.length) {
  const docIds = tTable.map((r) => r.id);
  const missing = tlCriteria.filter((c) => !docIds.includes(c));
  const extra = docIds.filter((id) => !tlCriteria.includes(id));
  if (missing.length || extra.length) {
    fail(
      `WC2 ${DOC_REL} §2.5 的 T 判据对照表与 ${TL_GATE_REL} 的实际判据对不上 —— ` +
        (missing.length ? `门禁已实现但文档没列：${missing.join(" / ")}；` : "") +
        (extra.length ? `文档列了但门禁里没有：${extra.join(" / ")}；` : "") +
        `集合名泄漏这一族契约，读者没有可查的判据清单。`
    );
  }
}

/* ---------------- WC3 正文提及的判据编号 ---------------- */

/* 表格行里的编号由 WC1/WC2 负责；这里只看**表格之外**的正文提及。 */
const tableLines = new Set([...fTable.map((r) => r.line), ...tTable.map((r) => r.line)]);
const unknownRefs = [];
docLines.forEach((line, i) => {
  if (tableLines.has(i + 1)) return;
  for (const m of line.matchAll(/\b([FT]\d+)\b/g)) {
    const id = m[1];
    const known = id.startsWith("F") ? fmCriteria.includes(id) : tlCriteria.includes(id);
    if (!known) unknownRefs.push({ id, where: where(DOC_REL, i + 1) });
  }
});
if (unknownRefs.length) {
  fail(
    `WC3 ${DOC_REL} 正文提及了不存在的判据编号：` +
      unknownRefs.map((u) => `${u.id}（${u.where}）`).join(" / ") +
      ` —— 读者按这个编号去门禁里找会找不到。`
  );
}

/* ---------------- WC4 自动注入字段表 ---------------- */

const docInj = docInjectedFields();
const realInj = injectedFields(dataText);
if (docInj && realInj) {
  const missing = realInj.filter((f) => !docInj.includes(f));
  const extra = docInj.filter((f) => !realInj.includes(f));
  if (missing.length || extra.length) {
    fail(
      `WC4 ${DOC_REL} §1「自动注入的字段」表与 ${DATA_REL} 的实际注入对不上 —— ` +
        (missing.length ? `数据文件注入了但文档没列：${missing.join(" / ")}；` : "") +
        (extra.length ? `文档列了但数据文件没有：${extra.join(" / ")}；` : "") +
        `写文章的人要么漏写一个自动注入的字段，要么照着写一个根本没人注入的字段。`
    );
  }
}

/* ---------------- WC5 「可写」与「别写」互斥 ---------------- */

const fieldTable = docFieldTable();
const dontWrite = docDontWriteFields();
if (fieldTable && dontWrite) {
  const writable = [...fieldTable.entries()]
    .filter(([, req]) => !NOT_WRITABLE_RE.test(req))
    .map(([name]) => name);
  const conflict = writable.filter((f) => dontWrite.includes(f));
  if (conflict.length) {
    fail(
      `WC5 ${DOC_REL} §4 自查清单把 ${conflict.join(" / ")} 列为「别写」，` +
        `但 §2 的字段表里这些字段的「必需」列写的是「可写」（不是「否」）—— ` +
        `两处口径互斥：照 §4 写就没有主题标签，§4 自己的下一条自查项却要求列表卡出现主题标签。`
    );
  }
}

/* ---------------- WC6 易变数字 ---------------- */

const volatileHits = [];
docLines.forEach((line, i) => {
  VOLATILE_COUNT_RE.lastIndex = 0;
  let m;
  while ((m = VOLATILE_COUNT_RE.exec(line))) {
    const ctx = line.slice(Math.max(0, m.index - 90), m.index + 90);
    if (!VOLATILE_CONTEXT_RE.test(ctx)) continue;
    volatileHits.push({ n: m[1], where: where(DOC_REL, i + 1) });
  }
});
if (volatileHits.length) {
  /* 拼好的字符串先落到变量里：fail() 的第一个模板字面量里不能有嵌套反引号 ——
     自测要靠「fail( 后的第一个字面量」反查判据号，嵌套反引号会把字面量截断。 */
  const volatileText = volatileHits.map((v) => `${v.n} 档`).join(" / ");
  const volatileWhere = volatileHits.map((v) => v.where).join(" / ");
  fail(
    `WC6 ${DOC_REL} 写死了「${volatileText}」这种每轮都会变的数字 —— ` +
      `${volatileWhere}；` +
      `自测档位一增删，这个数字就变成过期的口径（同一个病在 build 链段数上犯过一次）。` +
      `改成指向档位清单本身（例如「档位清单见该自测脚本文件头」），别把数字写进文档。`
  );
}

/* ---------------- WC7 覆盖度自证 ---------------- */

/* 九项各自一条 fail()：这样「哪一项缺了」在红因里一眼可见，
   自测也能逐项验证（把某一项拿掉 ⇒ 恰好那一条红）。 */

if (docText === null) {
  fail(
    `WC7 活文档 ${DOC_REL} 不在 —— 扫描面被收窄了，这道门禁已经看不到站内写作契约，等于没在检查。`
  );
}
if (fmText === null || !fmText.length) {
  fail(
    `WC7 F 判据真源 ${FM_GATE_REL} 不在或读不出内容 —— 没有它就核不了契约文档 §2.4 的 F 判据对照表。`
  );
}
if (tlText === null || !tlText.length) {
  fail(
    `WC7 T 判据真源 ${TL_GATE_REL} 不在或读不出内容 —— 没有它就核不了契约文档 §2.5 的 T 判据对照表。`
  );
}
if (dataText === null || !dataText.length) {
  fail(
    `WC7 注入字段真源 ${DATA_REL} 不在或读不出内容 —— 没有它就核不了契约文档 §1 的自动注入字段表。`
  );
}
if (!docInj || !docInj.length) {
  fail(
    `WC7 ${DOC_REL} §1 的自动注入字段表一行都没检出 —— 「文档列的注入字段 ↔ 数据文件实际注入」` +
      `这条判据没有基准可比，等于没在检查。`
  );
}
if (!fieldTable || !fieldTable.size) {
  fail(
    `WC7 ${DOC_REL} §2 的 front matter 字段表一行都没检出 —— 「可写 / 别写」互斥这条判据` +
      `没有基准可比，等于没在检查。`
  );
}
if (!fTable.length) {
  fail(
    `WC7 ${DOC_REL} §2.4 的 F 判据对照表一行都没检出 —— 读者在文档里查不到任何一条 F 判据。`
  );
}
if (!tTable.length) {
  fail(
    `WC7 ${DOC_REL} §2.5 的 T 判据对照表一行都没检出 —— 读者在文档里查不到任何一条 T 判据。`
  );
}
if (!checklistRange()) {
  fail(
    `WC7 ${DOC_REL} §4 的自查清单段没检出 —— 「别写」清单读不到，那条互斥判据没有基准可比。`
  );
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("站内写作契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    "  判据出处：docs/DEFECT-BACKLOG.md D79（D80 场次实测：站内写作契约与代码现实脱节，且零门禁看守）。"
  );
  console.error("");
  process.exit(1);
}

console.log(
  `站内写作契约门禁通过：契约文档的 F 判据表 ${fTable.length} 条、T 判据表 ${tTable.length} 条、` +
    `自动注入字段 ${(docInj || []).length} 个、字段表 ${(fieldTable || new Map()).size} 个字段，` +
    `都与代码现实一致；§4 自查清单没有与字段表互斥的「别写」项，文档里也没有写死的易变数字。`
);
console.log(
  `  · F 判据真源：${FM_GATE_REL}（${fmCriteria.length} 条：${fmCriteria.join(" ")}）；` +
    `T 判据真源：${TL_GATE_REL}（${tlCriteria.length} 条：${tlCriteria.join(" ")}）。`
);
console.log("  · 本门禁是静态的：不联网、不跑构建、不 require 被检查方，纯读四份文件的文本。");
