#!/usr/bin/env node
/**
 * 引用元数据门禁 —— 守住"Google Scholar 唯一读的那套 `citation_*` 标签，
 * 必须与单一真源一致、只出现在论文页、且与 BibTeX / RIS 导出三处同口径"。
 *
 * 为什么要有这个门禁（一次具体的核对结果，不是假想）：
 *   `citation_*` 是 Highwire Press 约定、**Google Scholar 唯一认**的引用元数据
 *   形态（Scholar 不读 JSON-LD——本站 src/_includes/partials/citation-meta.njk
 *   的文件头已经写明这一点）。也就是说：**论文能不能被 Scholar 收录、
 *   收录后显示的题名/作者/卷期/页码对不对，全部只由这一整套 <meta> 决定。**
 *   而这一层此前是**零门禁看管的**：
 *     · 门禁 8 / 19 / 31 查的是 JSON-LD 实体，check-jsonld 的 J1–J10 查的
 *       也是 JSON-LD —— 它们**不看 <meta>**；
 *     · 门禁 30 查的是 /publications.ris 文件与论文页 RIS 复制块一致，
 *       查不到 <meta>；
 *     · 门禁 4b/4c/4d、check-artifact-metadata 查的是 canonical/sitemap/
 *       产出物，同样不碰 <meta>。
 *   全仓 scripts/ 下 grep "citation_" 零命中（2026-10-19 实测）——
 *   也就是说：**删掉模板里那行 citation_issn，build 照样全绿，页面照出，
 *   而 Scholar 那边少一条字段。**这类缺陷不报错、不变红、只在收录时才显形。
 *
 * 判据一览：
 *   C1 论文页的 `citation_*` 标签集合与取值，必须与 src/_data/site.js
 *      **逐条**一致（标签多一条、少一条、值改一个字都判红）；
 *   C2 **反向**判据：除论文独立页外，全站任何一个页面都不许有 `citation_*`
 *      （Scholar 建议"每篇文章一个页面"；把多篇的标签混在列表页上，
 *      Scholar 只会认其中一组，其余静默丢失）；
 *   C3 三处口径交叉核对：`citation_*` ↔ /publications.bib ↔ /publications.ris
 *      对同一字段必须给出同一个值（DOI / 题名 / 刊名 / 卷 / 期 / 页码 /
 *      ISSN / 出版方 / URL / 作者顺序 / 日期 / 关键词 / 语言）；
 *   C4 门禁自己没被卸掉 + **自证存活**——一处都没比过就判红
 *      （"没报错"和"没问题"长得一模一样）。
 *   C5 **Key Points**（AGU 版式：文章开头 3 条 bullet）——出版商随文存缴的
 *      原文。必须恰好 3 条、规范化后的整体哈希等于出版商那一份，且论文页
 *      渲染出来的 3 条与 site.js 逐条一致（顺序也一致）。
 *   C6 **Plain Language Summary**（出版商随文存缴的通俗摘要）——同上：
 *      site.js 里的正文哈希等于出版商那一份，论文页渲染的段落与之逐字一致。
 *   C7 **上线日期与出版日期的不变量**——C1–C6 的期望集全部**从 site.js 派生**，
 *      所以"site.js 里两个日期自己前后矛盾"这类错，C1 是**抓不到**的
 *      （两边一致，只是都错）。C7 补的是这条不依赖期望集的结构性约束：
 *      上线日期必须是日历上真实存在的 YYYY/MM/DD，且**不得晚于**出版日期。
 *   C8 **订阅源（feed.xml）的分类标签**——同一个作品的关键词在**第四个**
 *      出口上的取值：site.js 里有几条，feed.xml 里那条目就得有几条，
 *      逐条一致、顺序也一致。少一条 / 多一条 / 改一条 / 整条不见，都判红。
 *
 * ⚠️ 2026-10-20（缺陷清单 D14）本门禁自身修掉的一处**声明与实现不符**：
 *   C3 那一行从一开始就把「关键词」写进了核对范围，**实现却只比了
 *   「页面 ↔ RIS」两处**——BibTeX 侧当时没有 keywords 字段，订阅源侧被
 *   静默截断。于是同一个作品的关键词在五个出口上给三种条数，而本门禁
 *   **全绿**。现把关键词改成**对着 site.js 真源**核三个面（页面 / BibTeX /
 *   RIS），并新增 C8 核第四个面（订阅源）。教训写在这里：判据清单里写了
 *   的字段，必须有对应的实现，否则清单就是一句装饰。
 *
 * ⚠️ C5/C6 的期望值**只存 sha256，不存全文**，且哈希是从 **Crossref 存缴
 *   原文**算出来的（不是从 site.js 算的）——否则就变成"改数据的同时改尺子"，
 *   门禁永远绿。详见下面 C5/C6 段的注释。
 *
 * ⚠️ 本门禁的**诚实边界**（写在文件头，不写在日志里）：
 *   期望值取自 site.js，与被投影的模板**同源**。所以本门禁能挡的是
 *   "**投影走样**"（模板漏输出 / 改错值 / 顺序被改 / 多站输出），
 *   挡不住"site.js 里的数据本身写错了"（那是共同真源错了，
 *   要靠 Crossref/DataCite 权威核对 + git 历史审计）。
 *   同样，oracle + 数据源 + 产物**一致地**改 → 全链路仍然绿。
 *   本门禁**不声称**能挡有意的协同篡改。
 *
 * ⚠️ 另有一处**已知差异**（不判红，理由见下面「摘要」段）：RIS 导出**没有**
 *   AB 行，而页面发 citation_abstract。是否输出 AB 是**待本人拍板**项，
 *   本门禁只把它**登记**下来、每次 build 都点名，不替本人拍板。
 *
 * ⚠️ 为什么不写进 scripts/verify-site.cjs：那里的门禁是**一个连续编号**
 *   的整体（文件头清单 + 代码段 + 对照表三处必须一一对应，见门禁 24/29），
 *   插入新号要同时改三处、且号必须连续。本门禁是独立主题的**引用层**检查，
 *   与 check-a11y（A*）、check-wrapping（W*）、check-artifact-metadata
 *   （M1–M6）同一形态：自带编号、单独成文件。因此不占用 verify-site.cjs 的号段。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 产物目录。SITE_DIR 只是给"故障注入"用的——改产物做注入测试时如果直接改
   _site，会和并发的 build 抢同一个目录，也可能在外接卷上留下 ._* 资源叉。
   指向 /tmp 下的副本就没有这两个问题（与 verify-site.cjs 同一约定）。 */
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.join(ROOT, "_site");
const PKG = path.join(ROOT, "package.json");

const problems = [];
const note = (msg) => problems.push(msg);
/* 已知差异：不判红，只在通过时点名打印。
   用途：把"待本人拍板的差异"从**日志里**搬到**每次 build 的输出**上——
   让它不会随时间被忘掉；同时避免"把待拍板直接变成 build 断点"
   （那等于用工具替本人做决定，比不做更糟）。 */
const known = [];
const diverge = (msg) => known.push(msg);

/* ---------- 单一真源 ---------- */
let siteData = null;
try {
  siteData = require(path.join(ROOT, "src/_data/site.js"));
} catch (e) {
  note(`读不到 src/_data/site.js（${e.message}）——本门禁没有真源可比，直接判红。`);
}
if (!siteData) {
  console.error("引用元数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}
const pubs = Array.isArray(siteData.publications) ? siteData.publications : [];
const siteLocale = String(siteData.locale || "").trim();

/* ---------- HTML 实体解码（产物里的属性值是转义过的） ---------- */
const decodeEntities = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"); // 必须最后

/* ---------- 从产物 HTML 里取 citation_* ---------- */
const attrOf = (tag, name) => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : null;
};
const readCitations = (file) => {
  const html = fs.readFileSync(file, "utf8");
  const out = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const name = attrOf(m[0], "name");
    if (!name || !name.startsWith("citation_")) continue;
    const content = attrOf(m[0], "content");
    out.push([name, content === null ? "" : decodeEntities(content)]);
  }
  return out;
};

/* ---------- 期望集：从 site.js 派生，判据与模板的判空规则一致 ---------- */
const authorNames = (pub) =>
  (pub.authorList || [])
    .map((a) => a.name || [a.given, a.family].filter(Boolean).join(" "))
    .filter(Boolean);

const expectedCitations = (pub) => {
  const exp = [];
  const add = (name, value) => {
    if (value === null || value === undefined) return;
    const v = String(value);
    if (v === "") return; // 与模板一致：缺就是缺，不写空标签
    exp.push([name, v]);
  };
  add("citation_title", pub.title);
  for (const n of authorNames(pub)) add("citation_author", n);
  add(
    "citation_publication_date",
    pub.dates && pub.dates.published
      ? String(pub.dates.published).replace(/-/g, "/")
      : null
  );
  add(
    "citation_online_date",
    pub.dates && pub.dates.publishedOnline
      ? String(pub.dates.publishedOnline).replace(/-/g, "/")
      : null
  );
  add("citation_journal_title", pub.journal);
  add("citation_volume", pub.volume);
  add("citation_issue", pub.issue);
  add("citation_firstpage", pub.pages || pub.articleNumber);
  add("citation_doi", pub.doi);
  add("citation_pdf_url", pub.pdf);
  add("citation_abstract", pub.abstract);
  add("citation_issn", pub.issn && pub.issn.print ? pub.issn.print : null);
  add(
    "citation_keywords",
    Array.isArray(pub.keywords) && pub.keywords.length ? pub.keywords.join("; ") : null
  );
  add("citation_language", siteLocale || "en");
  add("citation_publisher", pub.publisher);
  add("citation_abstract_html_url", pub.url);
  return exp;
};

/* BibTeX 的 month 是三字母缩写（jun）→ 两位数字，与页面 "2026/06/01" 对齐 */
const BIB_MONTHS = ["jan", "feb", "mar", "apr", "may", "jun",
                    "jul", "aug", "sep", "oct", "nov", "dec"];
const bibMonthToNum = (m) => {
  const i = BIB_MONTHS.indexOf(String(m).trim().toLowerCase());
  return i < 0 ? null : String(i + 1).padStart(2, "0");
};

/* 红因里把取值打出来。⚠️ 这里必须同时吃两种形态：
   C1 传的是"值数组"（["2169-897X"]），C2 传的是"键值对数组"（[["citation_title","X"]]）。
   早先只按键值对解构，把值数组当字符串迭代 → "2169-897X" 被拆成 "2" / "1"，
   红因打出 `2="1"` 这种看不懂的东西（注入矩阵 I1 档实测暴露）。 */
const fmtVal = (v) => {
  const s = typeof v === "string" ? v : String(v);
  return JSON.stringify(s.length > 60 ? s.slice(0, 57) + "…" : s);
};
const show = (list) =>
  list
    .map((x) => (Array.isArray(x) ? `${x[0]}=${fmtVal(x[1])}` : fmtVal(x)))
    .join(", ");

/* ================= C1 论文页标签集合与取值 ================= */
let compared = 0;
/* ⚠️ C7 的计数器**声明在这里**（不在 C7 那段里）——
   判据被整段删掉时，下面「自证存活」那处引用不会变成 ReferenceError 崩栈，
   而是干净地判红"C7 一条都没比过"。本仓在这上面吃过亏：
   别的门禁的注入档 T1（整段删掉自证）崩成裸堆栈，而不是可读的判红。 */
let c7Compared = 0;
for (const pub of pubs) {
  if (!pub || !pub.slug) continue;
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) {
    note(`论文页产物不存在：${rel}（site.js 里有 ${pub.slug} 这条论文，但没有对应页面）`);
    continue;
  }
  const actual = readCitations(file);
  const expected = expectedCitations(pub);
  compared++;

  if (!actual.length) {
    note(
      `${rel}：一个 citation_* 标签都没有 —— Scholar 认不到这篇论文。` +
        `（本页 front-matter 的 pubKey 是否还在？）`
    );
    continue;
  }

  // 逐名对比：多出的 / 少了的 / 值不同的，分开报，别混成一句。
  const actualMap = new Map();
  for (const [n, v] of actual) {
    if (!actualMap.has(n)) actualMap.set(n, []);
    actualMap.get(n).push(v);
  }
  const expectedMap = new Map();
  for (const [n, v] of expected) {
    if (!expectedMap.has(n)) expectedMap.set(n, []);
    expectedMap.get(n).push(v);
  }

  for (const name of new Set([...actualMap.keys(), ...expectedMap.keys()])) {
    const a = actualMap.get(name) || [];
    const e = expectedMap.get(name) || [];
    compared++;
    if (a.length === e.length && a.every((v, i) => v === e[i])) continue;
    if (!a.length) {
      note(
        `${rel}：少了 ${name} —— 期望 ${e.length} 条（${show(e)}），产物里一条都没有。` +
          `Scholar 那边就是缺这一项。`
      );
    } else if (!e.length) {
      note(
        `${rel}：多出了 ${name} —— 产物里有 ${a.length} 条（${show(a)}），` +
          `但 site.js 的这篇论文没有对应数据，模板不该输出它。`
      );
    } else if (a.length !== e.length) {
      note(
        `${rel}：${name} 的条数不对 —— 产物 ${a.length} 条，期望 ${e.length} 条` +
          `（期望：${show(e)}；产物：${show(a)}）。`
      );
    } else {
      const diffs = a
        .map((v, i) => (v === e[i] ? null : `第 ${i + 1} 条：产物 ${JSON.stringify(v)} ≠ 期望 ${JSON.stringify(e[i])}`))
        .filter(Boolean);
      note(`${rel}：${name} 的取值与 site.js 不一致 —— ${diffs.join("；")}。`);
    }
  }
}

/* ================= C2 非论文页不得有 citation_* ================= */
const paperPages = new Set(pubs.filter((p) => p && p.slug).map((p) => `papers/${p.slug}/index.html`));
const walkHtml = (dir, out = []) => {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkHtml(full, out);
    else if (e.isFile() && e.name.endsWith(".html")) out.push(full);
  }
  return out;
};
let nonPaperScanned = 0;
for (const file of walkHtml(SITE)) {
  const rel = path.relative(SITE, file).split(path.sep).join("/");
  if (paperPages.has(rel)) continue;
  nonPaperScanned++;
  const hits = readCitations(file);
  if (hits.length) {
    note(
      `${rel}：页面上有 ${hits.length} 个 citation_* 标签（${show(hits)}）—— ` +
        `Scholar 建议"每篇文章一个页面"，标签混在非论文页上会被它只认走一组、其余静默丢弃。`
    );
  }
}
if (!nonPaperScanned) {
  note("_site 下一个非论文页的 HTML 都没扫到——C2 这条判据没生效（可能产物目录不对）。");
}

/* ================= C3 citation_* ↔ BibTeX ↔ RIS 三处口径 ================= */
/* --- BibTeX 解析 --- */
const unescapeBib = (v) => String(v).replace(/\\([&%$#_])/g, "$1");
const parseBib = (text) => {
  const entries = [];
  const re = /@(\w+)\s*\{([^,]*),\n([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const fields = {};
    for (const line of m[3].split("\n")) {
      const fm = line.match(/^\s*(\w+)\s*=\s*\{((?:[^{}]|\{[^{}]*\})*)\}\s*,?\s*$/);
      if (fm) fields[fm[1]] = unescapeBib(fm[2]);
    }
    entries.push({ type: m[1], key: m[2].trim(), fields });
  }
  return entries;
};
/* --- RIS 解析（一条记录一行一个字段） --- */
const parseRis = (text) => {
  const records = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) continue;
    const tag = m[1];
    const value = m[2];
    if (tag === "ER") {
      if (cur) records.push(cur);
      cur = null;
      continue;
    }
    if (!cur) cur = {};
    (cur[tag] = cur[tag] || []).push(value);
  }
  return records;
};

const BIB_FILE = path.join(SITE, "publications.bib");
const RIS_FILE = path.join(SITE, "publications.ris");
let bibEntries = [];
let risRecords = [];
if (!fs.existsSync(BIB_FILE)) {
  note("产物里没有 publications.bib —— 引用导出缺失，C3 无法核对。");
} else {
  bibEntries = parseBib(fs.readFileSync(BIB_FILE, "utf8"));
}
if (!fs.existsSync(RIS_FILE)) {
  note("产物里没有 publications.ris —— 引用导出缺失，C3 无法核对。");
} else {
  risRecords = parseRis(fs.readFileSync(RIS_FILE, "utf8"));
}

/* 作者名归一：meta 是"名 姓"，bib/ris 是"姓, 名" → 统一成"名 姓" */
const toGivenFamily = (s) => {
  const t = String(s).trim();
  if (t.includes(",")) {
    const [last, ...rest] = t.split(",").map((x) => x.trim());
    return `${rest.join(" ")} ${last}`.trim();
  }
  return t;
};
const bibAuthors = (f) =>
  String(f.author || "")
    .split(/\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(toGivenFamily);
const risAuthors = (r) => (r.AU || []).map(toGivenFamily);

/* 三方共有的字段。meta 侧是 citation_* 标签名，bib/ris 侧是各自的键。 */
const TRI_FIELDS = [
  { key: "题名", meta: "citation_title", bib: "title", ris: "TI" },
  { key: "刊名", meta: "citation_journal_title", bib: "journal", ris: "T2" },
  { key: "卷", meta: "citation_volume", bib: "volume", ris: "VL" },
  { key: "期", meta: "citation_issue", bib: "number", ris: "IS" },
  { key: "页码/文章号", meta: "citation_firstpage", bib: "pages", ris: "SP" },
  { key: "DOI", meta: "citation_doi", bib: "doi", ris: "DO" },
  { key: "URL", meta: "citation_abstract_html_url", bib: "url", ris: "UR" },
  { key: "ISSN", meta: "citation_issn", bib: "issn", ris: "SN" },
  { key: "出版方", meta: "citation_publisher", bib: "publisher", ris: "PB" },
];

for (const pub of pubs) {
  if (!pub || !pub.slug || !pub.doi) continue;
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) continue;

  const actual = readCitations(file);
  const metaMap = new Map();
  for (const [n, v] of actual) {
    if (!metaMap.has(n)) metaMap.set(n, []);
    metaMap.get(n).push(v);
  }
  const metaVal = (n) => {
    const a = metaMap.get(n) || [];
    return a.length ? a[0] : null;
  };

  const bib = bibEntries.find((e) => e.fields.doi === pub.doi);
  if (!bib) {
    note(`publications.bib：没有 DOI = ${pub.doi} 的条目 —— 引用导出里这篇论文不见了。`);
    continue;
  }
  const ris = risRecords.find((r) => (r.DO || []).includes(pub.doi));
  if (!ris) {
    note(`publications.ris：没有 DOI = ${pub.doi} 的记录 —— 引用导出里这篇论文不见了。`);
    continue;
  }
  const risVal = (tag) => {
    const a = ris[tag] || [];
    return a.length ? a[0] : null;
  };

  for (const f of TRI_FIELDS) {
    const vals = [
      { src: `页面 ${f.meta}`, v: metaVal(f.meta) },
      { src: `BibTeX ${f.bib}`, v: bib.fields[f.bib] === undefined ? null : bib.fields[f.bib] },
      { src: `RIS ${f.ris}`, v: risVal(f.ris) },
    ].filter((x) => x.v !== null && x.v !== "");
    if (!vals.length) continue;
    compared++;
    const distinct = [...new Set(vals.map((x) => String(x.v)))];
    if (distinct.length > 1) {
      note(
        `${rel}：${f.key} 三处口径不一致 —— ` +
          vals.map((x) => `${x.src} = ${JSON.stringify(x.v)}`).join("，") +
          `。同一篇论文的同一字段，读者从 Scholar 拿到的和从 .bib/.ris 导入的会不一样。`
      );
    }
  }

  /* 作者：顺序也要一致（Scholar 与文献管理器都按位置配对） */
  const metaAuthors = (metaMap.get("citation_author") || []).slice();
  const bAuthors = bibAuthors(bib.fields);
  const rAuthors = risAuthors(ris);
  if (metaAuthors.length) {
    compared++;
    if (metaAuthors.join(" | ") !== bAuthors.join(" | ")) {
      note(
        `${rel}：作者顺序与 BibTeX 不一致 —— 页面 ${JSON.stringify(metaAuthors)}，` +
          `BibTeX ${JSON.stringify(bAuthors)}。`
      );
    }
    compared++;
    if (metaAuthors.join(" | ") !== rAuthors.join(" | ")) {
      note(
        `${rel}：作者顺序与 RIS 不一致 —— 页面 ${JSON.stringify(metaAuthors)}，` +
          `RIS ${JSON.stringify(rAuthors)}。`
      );
    }
  }

  /* 日期：页面 "2026/06/01" ↔ RIS DA "2026/06/01" ↔ BibTeX year+month */
  const metaDate = metaVal("citation_publication_date");
  if (metaDate) {
    compared++;
    const risDate = risVal("DA");
    if (risDate && risDate !== metaDate) {
      note(
        `${rel}：发表日期两处不一致 —— 页面 citation_publication_date = ${JSON.stringify(metaDate)}，` +
          `RIS DA = ${JSON.stringify(risDate)}。`
      );
    }
    const bibYear = bib.fields.year;
    if (bibYear && metaDate.slice(0, 4) !== String(bibYear)) {
      note(
        `${rel}：发表日期两处不一致 —— 页面 citation_publication_date = ${JSON.stringify(metaDate)}，` +
          `BibTeX year = ${JSON.stringify(bibYear)}。`
      );
    }
    const bibMonth = bib.fields.month;
    if (bibMonth && metaDate.slice(5, 7) !== bibMonthToNum(bibMonth)) {
      note(
        `${rel}：发表月份两处不一致 —— 页面 citation_publication_date = ${JSON.stringify(metaDate)}，` +
          `BibTeX month = ${JSON.stringify(bibMonth)}。`
      );
    }
  }

  /* 关键词：**三个面**都对着真源 site.js 核 —— 页面 citation_keywords ↔
     BibTeX keywords ↔ RIS 的多条 KW。

     ⚠️ 2026-10-20 实测发现的缺口（缺陷清单 D14）：这条判据此前只比
     「页面 ↔ RIS」两处，而
       · BibTeX 侧**压根没有** keywords 字段（RIS 有 8 条 KW）；
       · 订阅源 feed.xml 侧被 .slice(0, 5) **静默截**到 5 条。
     也就是说：同一个作品的关键词在五个出口上给三种条数，而门禁**全绿**。
     更难看的是本文件头 C3 一行明明写着「关键词」在核对范围内 ——
     **声明的范围与实现的范围不一致**，这本身就是一门禁的失效点。

     为什么改成「对着真源核」而不是「三处互比」：互比只能挡住"两处一起改坏"，
     挡不住"三处一致地错"；本门禁的期望集一律从 site.js 派生（C1–C7 同源），
     关键词也照这条规矩办。

     比对方式：页面与 BibTeX 都是**一整串**（分隔符分别是 "; " 与 ", "），
     直接与 site.js 拼出的同一串逐字比 —— 不拆成词元，这样即使某个关键词
     本身含逗号，也不会被误拆成两个词而误报。RIS 是逐条 KW，比数组。 */
  const expectedKw = Array.isArray(pub.keywords) ? pub.keywords.map((k) => String(k)) : [];
  if (expectedKw.length) {
    const kwSurfaces = [
      {
        src: "页面 citation_keywords",
        got: metaVal("citation_keywords"),
        want: expectedKw.join("; "),
      },
      {
        src: "BibTeX keywords",
        got: bib.fields.keywords === undefined ? null : String(bib.fields.keywords),
        want: expectedKw.join(", "),
      },
      {
        src: "RIS KW",
        got: (ris.KW || []).map((s) => s.trim()).filter(Boolean).join(" | "),
        want: expectedKw.join(" | "),
      },
    ];
    for (const s of kwSurfaces) {
      compared++;
      /* ⚠️ 页面这一面与 C1 有重叠（C1 已把 citation_* 逐条对着真源核过）。
         留着是为了**红因里能点名是哪个面出的问题** —— "关键词不一致"这种
         话，读者需要知道是页面、BibTeX 还是 RIS 出的问题，才知道去哪儿改。 */
      if (s.got === null || s.got === "") {
        note(
          `${rel}：关键词在 ${s.src} 上**缺失** —— 真源 site.js 里有 ${expectedKw.length} 条` +
            `（${JSON.stringify(expectedKw)}），这个出口一个都没给。`
        );
      } else if (String(s.got) !== s.want) {
        note(
          `${rel}：关键词与真源不一致 —— ${s.src} = ${JSON.stringify(s.got)}，` +
            `site.js = ${JSON.stringify(s.want)}。`
        );
      }
    }
  }

  /* 语言：页面 citation_language ↔ RIS LA */
  const metaLang = metaVal("citation_language");
  const risLang = risVal("LA");
  if (metaLang && risLang) {
    compared++;
    if (metaLang !== risLang) {
      note(`${rel}：语言两处不一致 —— 页面 ${JSON.stringify(metaLang)}，RIS ${JSON.stringify(risLang)}。`);
    }
  }

  /* 摘要：页面 citation_abstract ↔ RIS AB。
     ⚠️ 现状（2026-10-19 实测）：eleventy.config.js 的 `ris` filter **不输出
        摘要**（RIS 记录里没有 AB 行），而页面发 citation_abstract —— 同一篇
        论文的摘要在"Scholar 看到的"与"导入文献管理器得到的"两处口径不同。
        这属于**待本人拍板**项（日志「待决策」段的"RIS 的 AB/SP 两条"）：
        输出 AB 会让论文页与 /publications.ris 的 <pre> 里多出一条约 2000 字符
        的单行，可读性要本人看一眼再定。
        所以本条**不**把"RIS 缺 AB"判红 —— 那等于用工具替本人做决定，
        比不做更糟。本条只做两件事：
          ① RIS 里**有** AB 时，它必须与页面 citation_abstract 逐字一致；
             漂移（有人补了 AB 却写错了）即判红；
          ② RIS 里**没有** AB 时，登记成"已知差异"，在通过信息里点名，
             让这道差异不会随着时间被忘掉。 */
  const metaAbs = metaVal("citation_abstract");
  const risAbs = risVal("AB");
  if (metaAbs) {
    compared++;
    if (risAbs !== null) {
      if (risAbs !== metaAbs) {
        note(
          `${rel}：摘要两处不一致 —— 页面 citation_abstract = ${JSON.stringify(metaAbs)}，` +
            `RIS AB = ${JSON.stringify(risAbs)}。`
        );
      }
    } else {
      diverge(
        `${rel}：RIS 记录**没有** AB（摘要）行，而页面发了 citation_abstract —— ` +
          `已知差异，待本人拍板（是否输出 AB），本门禁不代拍。`
      );
    }
  }
}

/* ================= C8 订阅源（feed.xml）的分类标签 =================
 *
 * 为什么单列一条：feed.xml 是**第四个**给出关键词的出口（前三：C3 里的
 * 页面 / BibTeX / RIS），而它是**对外订阅口** —— RSS 客户端与聚合器
 * 按 <category> 做主题归类与过滤。实测（2026-10-20）：此前它的
 * <category> 被 .slice(0, 5) 静默截到 5 条（真源 8 条），丢掉的三个是
 * "data assimilation" / "machine learning" / "tropical Africa" ——
 * 订阅者因此**按 "tropical Africa" 检索这篇论文会找不到**。
 *
 * 判据：site.js 里每篇带关键词的论文，在 feed.xml 里都必须有一条指向它
 * 的条目，且该条目的 <category> 列表与真源**逐条一致**（顺序也一致）。
 * 少一条、多一条、改一条、整条不见，都判红。
 *
 * 为什么单列而不是并进 C3：C3 的定义是"页面 ↔ BibTeX ↔ RIS"**三处**，
 * 订阅源不在其中；硬塞进去会让 C3 这个名字与它的实现对不上。
 * （这个"名字与实现对不上"的毛病，本轮已经在 C3 的关键词那一段发现过一次
 * —— 声明含关键词、实现只覆盖两处。见 C3 段内的说明。）
 */
const FEED_FILE = path.join(SITE, "feed.xml");
let feedItems = [];
if (!fs.existsSync(FEED_FILE)) {
  note("产物里没有 feed.xml —— 订阅源缺失，C8 无法核对。");
} else {
  const feedText = fs.readFileSync(FEED_FILE, "utf8");
  for (const m of feedText.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const body = m[1];
    const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "";
    const cats = [...body.matchAll(/<category>([\s\S]*?)<\/category>/g)]
      .map((x) => x[1].trim())
      .filter(Boolean);
    feedItems.push({ link: link.trim(), categories: cats });
  }
}
let c8Compared = 0;
for (const pub of pubs) {
  if (!pub || !pub.slug) continue;
  const expectedKw = Array.isArray(pub.keywords) ? pub.keywords.map((k) => String(k)) : [];
  if (!expectedKw.length) continue;
  const pathSuffix = `/papers/${pub.slug}/`;
  const item = feedItems.find((it) => it.link.endsWith(pathSuffix));
  compared++;
  c8Compared++;
  if (!item) {
    note(
      `feed.xml：没有指向 ${pathSuffix} 的条目 —— 订阅源里这篇论文不见了，` +
        `它的 ${expectedKw.length} 个关键词无从核对。`
    );
    continue;
  }
  if (item.categories.join(" | ") !== expectedKw.join(" | ")) {
    note(
      `feed.xml：${pathSuffix} 的分类标签与真源不一致 —— ` +
        `feed = ${JSON.stringify(item.categories)}，site.js = ${JSON.stringify(expectedKw)}。`
    );
  }
}

/* ================= C5 / C6 出版商存缴的 Key Points 与 Plain Language Summary =================
 *
 * 这两段是 AGU 论文的**标准版式**（Key Points 3 条 + Plain Language Summary），
 * 出版商随文一起存缴，Crossref 的 unixref 里有对应记录：
 *   abstract-type="short"             → Key Points
 *   abstract-type="executive-summary" → Plain Language Summary
 *
 * ⚠️ 本门禁怎么用它们：**只存规范化后的 sha256，不存全文**。
 *   · 哈希是**独立于被测数据**算出来的 —— 从 Crossref 原文算，不是从 site.js 算。
 *     否则就变成"改 site.js 的同时改尺子"，门禁永远绿（判据的期望集
 *     不能由它要守的对象派生）。
 *   · 全文不抄进判据文件：抄全文 = 多一份副本 = 多一处会漂移的地方。
 *     真要核对全文，对着 Crossref 原始记录核，不对着判据文件核。
 *   · 归一化：U+2010 HYPHEN → ASCII "-"，空白折叠为单空格，trim。
 *     U+2010 的归一是站内既有惯例（出版商原文用 U+2010 写连字符，站内一律
 *     写 ASCII "-"，site.js 里 abstract 是同一处理）。
 *
 * 两条判据：
 *   C5 Key Points —— 必须是数组、**恰好 3 条**（AGU 版式约定，不是"凑 3 条"）、
 *      每条非空、规范化后的整体哈希等于出版商那一份；且论文页渲染出来的
 *      3 条与 site.js 逐条一致（顺序也一致）。
 *   C6 Plain Language Summary —— site.js 里的正文哈希等于出版商那一份；
 *      且论文页渲染出来的段落与之逐字一致。
 */
const ORACLE_KEY_POINTS_SHA256 =
  "3ee648a46e7ca53ddea1acc2a5e58e412ba15115e1c9066db5cbeee37497c154";
const ORACLE_PLAIN_LANGUAGE_SHA256 =
  "8fcebee6a05dab6613bdeab28d80a8be7fc1c6634c86590718d6af0661707ae5";
const KEY_POINTS_COUNT = 3; // AGU 版式约定：固定 3 条

const canonicalText = (s) =>
  String(s == null ? "" : s).replace(/‐/g, "-").replace(/\s+/g, " ").trim();
const sha256 = (s) =>
  require("crypto").createHash("sha256").update(s, "utf8").digest("hex");

/* 从产物 HTML 里取出一节里的列表项 / 段落文本 */
const readSectionItems = (html, cls) => {
  const sec = html.match(
    new RegExp(`<section class="${cls}"[^>]*>([\\s\\S]*?)</section>`, "i")
  );
  if (!sec) return null;
  return [...sec[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) =>
    canonicalText(decodeEntities(m[1].replace(/<[^>]+>/g, "")))
  );
};
const readSectionParagraph = (html, cls) => {
  const sec = html.match(
    new RegExp(`<section class="${cls}"[^>]*>([\\s\\S]*?)</section>`, "i")
  );
  if (!sec) return null;
  const p = sec[1].match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  return p ? canonicalText(decodeEntities(p[1].replace(/<[^>]+>/g, ""))) : null;
};

let kpCompared = 0;
let plsCompared = 0;
for (const pub of pubs) {
  if (!pub || !pub.slug) continue;
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) continue; // C1 已经为这个缺页报过红
  const html = fs.readFileSync(file, "utf8");

  /* ---------- C5 Key Points ---------- */
  const hasKp = Array.isArray(pub.keyPoints) && pub.keyPoints.length > 0;
  const renderedKp = readSectionItems(html, "paper-keypoints");
  if (!hasKp) {
    if (renderedKp) {
      note(
        `${rel}：页面上有 Key Points 区块，但 site.js 里没有 keyPoints —— ` +
          `这一节渲染的内容没有真源可比（多半是模板写死了）。`
      );
    }
    continue;
  }
  if (!Array.isArray(pub.keyPoints)) {
    note(`${rel}：site.js 的 keyPoints 不是数组 —— 应当是 3 条 bullet 的数组。`);
    continue;
  }
  if (pub.keyPoints.length !== KEY_POINTS_COUNT) {
    note(
      `${rel}：Key Points 是 ${pub.keyPoints.length} 条，AGU 的版式是固定 ${KEY_POINTS_COUNT} 条 —— ` +
        `条数不对就说明不是出版商那一份了。`
    );
  }
  const emptyKp = pub.keyPoints.findIndex((k) => !canonicalText(k));
  if (emptyKp >= 0) {
    note(`${rel}：Key Points 第 ${emptyKp + 1} 条是空的。`);
  }
  const kpCanonical = pub.keyPoints.map((k) => canonicalText(k)).join("\n");
  const kpHash = sha256(kpCanonical);
  kpCompared++;
  if (kpHash !== ORACLE_KEY_POINTS_SHA256) {
    note(
      `${rel}：Key Points 与出版商存缴的那一份对不上（规范化后 sha256 = ${kpHash}，` +
        `期望 ${ORACLE_KEY_POINTS_SHA256}）—— 出版商原文见 Crossref unixref 的 ` +
        `abstract-type="short" 段（DOI ${pub.doi}）。`
    );
  }
  if (!renderedKp) {
    note(
      `${rel}：site.js 里有 keyPoints，但论文页上没有渲染 Key Points 区块 —— ` +
        `读者看不到这一节。`
    );
  } else {
    if (renderedKp.length !== pub.keyPoints.length) {
      note(
        `${rel}：页面渲染了 ${renderedKp.length} 条 Key Points，site.js 里是 ` +
          `${pub.keyPoints.length} 条 —— 两处条数不一致。`
      );
    }
    pub.keyPoints.forEach((k, i) => {
      const want = canonicalText(k);
      if (renderedKp[i] === undefined) {
        note(`${rel}：页面上的 Key Points 缺第 ${i + 1} 条。`);
      } else if (renderedKp[i] !== want) {
        note(
          `${rel}：页面上的 Key Points 第 ${i + 1} 条与 site.js 不一致 —— ` +
            `页面 ${JSON.stringify(renderedKp[i])}，site.js ${JSON.stringify(want)}。`
        );
      }
    });
  }

  /* ---------- C6 Plain Language Summary ---------- */
  const hasPls = Boolean(canonicalText(pub.plainLanguageSummary));
  const renderedPls = readSectionParagraph(html, "paper-plain-language");
  if (!hasPls) {
    if (renderedPls !== null) {
      note(
        `${rel}：页面上有 Plain Language Summary 区块，但 site.js 里没有 ` +
          `plainLanguageSummary —— 这一节渲染的内容没有真源可比。`
      );
    }
    continue;
  }
  const plsHash = sha256(canonicalText(pub.plainLanguageSummary));
  plsCompared++;
  if (plsHash !== ORACLE_PLAIN_LANGUAGE_SHA256) {
    note(
      `${rel}：Plain Language Summary 与出版商存缴的那一份对不上（规范化后 ` +
        `sha256 = ${plsHash}，期望 ${ORACLE_PLAIN_LANGUAGE_SHA256}）—— 出版商原文见 ` +
        `Crossref unixref 的 abstract-type="executive-summary" 段（DOI ${pub.doi}）。`
    );
  }
  if (renderedPls === null) {
    note(
      `${rel}：site.js 里有 plainLanguageSummary，但论文页上没有渲染 ` +
        `Plain Language Summary 区块 —— 读者看不到这一节。`
    );
  } else if (renderedPls !== canonicalText(pub.plainLanguageSummary)) {
    note(
      `${rel}：页面上的 Plain Language Summary 与 site.js 不一致 —— ` +
        `页面 ${JSON.stringify(renderedPls.slice(0, 80))}…，site.js ` +
        `${JSON.stringify(canonicalText(pub.plainLanguageSummary).slice(0, 80))}…。`
    );
  }
}

/* ================= C7 上线日期与出版日期的不变量 =================
 *
 * 为什么需要这条：前面 C1–C6 全部是"**期望集** vs **产物**"的逐条比对，
 * 期望集又是**从 site.js 派生的**。也就是说：site.js 里两个日期字段
 * **自己前后矛盾**（例如把上线日写成 2027-01-01、出版日写成 2026-06-01），
 * C1 会**全绿**——两边一致，只是都错。
 * 而"上线日不可能晚于出版日"是一条**不依赖期望集**的结构性约束，
 * 正是 C1 抓不到的那一类。
 *
 * 两条：
 *   C7-1 数据侧：site.js 的 dates.publishedOnline 必须是个真日期
 *        （YYYY/MM/DD，且日历上真的存在），且不得晚于 dates.published；
 *   C7-2 产物侧：论文页上 citation_online_date 与 citation_publication_date
 *        同样要满足"前者 ≤ 后者"——模板或数据被改坏时，产物上先暴露。
 */
const parseSlashDate = (s) => {
  const m = String(s == null ? "" : s).match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  // 日历回环校验：Date.UTC 会把 2 月 30 日滚成 3 月 2 日，那种"日期"要判红
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d
  ) {
    return null;
  }
  return t;
};

for (const pub of pubs) {
  if (!pub || !pub.slug) continue;
  const rel = `papers/${pub.slug}/index.html`;
  const online = pub.dates && pub.dates.publishedOnline;
  const published = pub.dates && pub.dates.published;

  /* ---------- C7-1 数据侧 ---------- */
  if (online) {
    c7Compared++;
    const tOnline = parseSlashDate(String(online).replace(/-/g, "/"));
    const tPublished = published ? parseSlashDate(String(published).replace(/-/g, "/")) : null;
    if (tOnline === null) {
      note(
        `${rel}：site.js 的 dates.publishedOnline = ${JSON.stringify(online)} ` +
          `不是一个日历上真实存在的 YYYY/MM/DD 日期。`
      );
    } else if (tPublished !== null && tOnline > tPublished) {
      note(
        `${rel}：上线日期晚于出版日期 —— dates.publishedOnline = ${JSON.stringify(online)}，` +
          `dates.published = ${JSON.stringify(published)}。上线日不可能晚于出版日。`
      );
    }
  }

  /* ---------- C7-2 产物侧 ---------- */
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) continue; // C1 已经为这个缺页报过红
  const actual = readCitations(file);
  const firstOf = (name) => {
    const hit = actual.find(([n]) => n === name);
    return hit ? hit[1] : null;
  };
  const onMeta = firstOf("citation_online_date");
  const pubMeta = firstOf("citation_publication_date");
  if (onMeta && pubMeta) {
    c7Compared++;
    const tOnline = parseSlashDate(onMeta);
    const tPublished = parseSlashDate(pubMeta);
    if (tOnline === null) {
      note(
        `${rel}：citation_online_date = ${JSON.stringify(onMeta)} ` +
          `不是一个日历上真实存在的 YYYY/MM/DD 日期。`
      );
    } else if (tPublished !== null && tOnline > tPublished) {
      note(
        `${rel}：citation_online_date 晚于 citation_publication_date —— ` +
          `${JSON.stringify(onMeta)} > ${JSON.stringify(pubMeta)}。上线日不可能晚于出版日。`
      );
    }
  }
}

/* ---------- C4 门禁自己没被卸掉 + 自证存活 ---------- */
const GATE_FILE = "check-citation-meta.cjs";
if (!fs.existsSync(PKG)) {
  note("找不到 package.json，无法确认本门禁是否接在 build 上。");
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  const scripts = pkg.scripts || {};
  /* 可达性：与 check-gates-wired.cjs 同一套算法（沿 npm run X 这条边走） */
  const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
  const seen = new Set();
  const queue = ["build"];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const cmd = scripts[name] || "";
    NPM_RUN_RE.lastIndex = 0;
    let m;
    while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
      if (scripts[m[1]] !== undefined) queue.push(m[1]);
    }
  }
  const refs = Object.keys(scripts).filter((n) => (scripts[n] || "").includes(GATE_FILE));
  const live = refs.filter((n) => seen.has(n));
  if (!refs.length) {
    note(
      `门禁自己被卸掉了：package.json 里没有任何 script 指向 scripts/${GATE_FILE} —— ` +
        `这个门禁永远不会执行。`
    );
  } else if (!live.length) {
    note(
      `门禁自己被卸掉了：scripts/${GATE_FILE} 只被 npm script「${refs.join(" / ")}」引用，` +
        `但那些 script 不在 build 链上。`
    );
  }
}
if (!compared) {
  note(
    "本门禁一处都没比过——判据可能已经失效" +
      "（与「没报错」和「没问题」长得一模一样是同一类病）。"
  );
}
/* C5/C6 也要自证存活：site.js 里既然有 keyPoints / plainLanguageSummary，
   这两条判据就必须真的跑过并比过一次。少一次 → 判据被卸掉了（而不是
   "没发现问题"）。 */
{
  const kpExpected = pubs.filter(
    (p) => p && Array.isArray(p.keyPoints) && p.keyPoints.length > 0
  ).length;
  const plsExpected = pubs.filter(
    (p) => p && canonicalText(p.plainLanguageSummary)
  ).length;
  if (kpExpected > 0 && kpCompared < kpExpected) {
    note(
      `C5（Key Points）一条都没比过——site.js 里有 ${kpExpected} 篇论文带 keyPoints，` +
        `但判据没有对任何一篇做过比对（判据被卸掉了，而不是「没问题」）。`
    );
  }
  if (plsExpected > 0 && plsCompared < plsExpected) {
    note(
      `C6（Plain Language Summary）一条都没比过——site.js 里有 ${plsExpected} 篇论文带 ` +
        `plainLanguageSummary，但判据没有对任何一篇做过比对（判据被卸掉了）。`
    );
  }
  /* C7 同理：site.js 里既然有 publishedOnline，判据就必须真的对每一篇
     比过一次（含数据侧与产物侧各一次）。少一次 → 判据被卸掉了。 */
  const c7Expected = pubs.filter((p) => p && p.dates && p.dates.publishedOnline).length;
  if (c7Expected > 0 && c7Compared < c7Expected) {
    note(
      `C7（上线/出版日期的不变量）一条都没比过——site.js 里有 ${c7Expected} 篇论文带 ` +
        `dates.publishedOnline，但判据没有对任何一篇做过比对（判据被卸掉了）。`
    );
  }
  /* C8 同理：site.js 里既然有论文带关键词，订阅源这一条就必须真的比对过。
     少一次 → 判据被卸掉了（而不是"订阅源恰好没问题"）。 */
  const c8Expected = pubs.filter(
    (p) => p && p.slug && Array.isArray(p.keywords) && p.keywords.length > 0
  ).length;
  if (c8Expected > 0 && c8Compared < c8Expected) {
    note(
      `C8（订阅源的分类标签）一条都没比过——site.js 里有 ${c8Expected} 篇论文带 ` +
        `keywords，但判据没有对任何一篇做过比对（判据被卸掉了）。`
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("引用元数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `引用元数据门禁通过：${pubs.length} 篇论文的 citation_* 标签集合与取值与 site.js 逐条一致；` +
    `非论文页零 citation_*；页面 / BibTeX / RIS 三处口径一致；共比对 ${compared} 处。` +
    (kpCompared || plsCompared
      ? `Key Points 与 Plain Language Summary 与出版商存缴原文一致（比对了 ` +
        `${kpCompared} + ${plsCompared} 处）。`
      : "") +
    (c7Compared
      ? `上线日期不晚于出版日期（比对了 ${c7Compared} 处）。`
      : "")
);
if (known.length) {
  console.log(
    `已知差异（**不判红**，待本人拍板，本门禁不代拍）：\n` +
      known.map((k) => `  · ${k}`).join("\n")
  );
}
