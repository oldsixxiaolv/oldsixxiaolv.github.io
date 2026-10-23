#!/usr/bin/env node
/**
 * 文档现状/接入流程门禁 —— 守住「文档里写的『现状』与『接入流程』必须和代码现实一致」。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-22（D79 场次）实测：docs/implementation-notes.md 自己在开头声明
 *   「§3、§6、§9、§11 描述的实现细节已经变了，正文中已就地标注」——
 *   也就是说，那几节里的「（现状：…）」是**承诺为当前状态**的，不是历史记述。
 *   实测却发现其中两处早已漂了：
 *     · §9 写「（现状：已有 3 篇 paper，…）」；
 *     · §11 写「现在已有 3 篇（holton-rollin-1987 / microphysics-zhang / trmm-lyu-2026），
 *       下面这套流程已实际跑过多轮，可直接照用」。
 *   而仓库里**只有一篇**真实论文（trmm-thunderstorm-stages）；
 *   那三个 slug 是旧站的占位论文，2026-10-15 的站点重构里已被删除。
 *   更要紧的是 §11「接入新论文 checklist」第 1 步要求 front matter 必填
 *   slug / authors / journal / year / doi / tags —— **与真实机制相反**：
 *     · 论文的标题/作者/期刊/doi 的真源是 src/_data/site.js 的 publications 条目，
 *       front matter 只用 pubKey 指回去；
 *     · slug 由**目录名**决定（src/eleventy-helpers.cjs 的 getSlugFromData），
 *       它不是 front matter 字段；
 *     · tags 由目录数据文件自动注入，属本仓「自动注入、不要重复写」那一类
 *       （博客那边是同一条口径，blog-writing-guide §1）。
 *   ⇒ 照这份 checklist 写出来的论文页**没有标题、作者、期刊**，
 *     front matter 里多写的 tags 还会跟目录级的集合标签打架。
 *
 * 判据：
 *   DR1 论文语境段落里点名的论文标识必须真实存在 ——
 *      文档点了哪个论文目录，src/content/papers/ 下就得有它。
 *   DR2 现状陈述里不许写死会变的论文篇数 ——
 *      「现状/现有/现在/目前/现已/已有 + 数字 + 篇」判红。
 *      同一个病在 build 链段数上已经犯过一次（DS1 门禁管的是「数字 + 步」，
 *      单位不同就漏过去了 ⇒ 这里单开一条，不去动 DS1 的口径）。
 *   DR3 「必填 front matter 字段清单」里的字段必须真实存在于 front matter ——
 *      文档说必填的字段，得是 front matter 里真有的键。
 *   DR4 自动注入的字段不许被列为「必填 front matter 字段」 ——
 *      目录数据文件注入的键（layout / permalink / tags / eleventyComputed.slug）
 *      本仓的口径是「自动注入、不要重复写」。
 *   DR5 覆盖度自证 —— 活文档、真实论文、目录数据文件、必填字段清单、
 *      论文语境段落，五样都得在；缺一即判红（防「改空了通过」）。
 *      「真实论文」＝目录里真有带 front matter 的 .md 文件；空目录不算（它不产出论文页）。
 *   DR6 活文档点名的仓内路径必须真实存在 ——
 *      2026-10-23（D91 场次）实测：仓库根的 HOW_TO_RUN.md 是「仓库结构 + 怎么跑起来」
 *      的**第二份副本**，而 check-readme.cjs 自己在诚实边界里写着「本门禁只读 README.md」
 *      ⇒ 这份副本**零门禁看守**。实测它已经漂到：
 *        · 源码树里点名 `src/assets/js/nav.js`（文件已删）；
 *        · 点名 `src/assets/js/paper-reader/reading-progress.js`（模块已删）；
 *        · 点名作品集列表模板（源码树里根本没有那个文件）；
 *        · 说 og:image 是「SVG 源 + PNG 导出」（导出格式其实是 JPEG）。
 *      照着它去改文件，只会改一个不存在的东西 —— 这就是 DR6 要抓的形状。
 *      口径（刻意保守，宁可漏报也不误报）：
 *        · 只认**行内反引号 span**；围栏代码块里的 `cover.png` / `index.md`
 *          是同目录文件名，不是仓库根相对路径，一律不查；
 *        · 词元必须含 "/" 且字符集只有字母数字与 `_ . - /`
 *          （出现 < > * = 等的一律跳过 ⇒ 占位符与 glob 自动豁免）；
 *        · 不以 "/" 开头；不以 `_site` 开头（build 链里产物目录可能还不存在）；
 *        · **首段必须是仓库根下的真实条目** ⇒ 局部相对写法
 *          （`layouts/detail.njk` / `partials/hero.njk` / `assets/fonts/`）自动跳过。
 *   DR7 覆盖度自证 —— HOW_TO_RUN.md 必须在（它是这份「第二份副本」）；
 *      且**每份在的活文档**各自检出的仓内路径候选数不得低于下限
 *      （扫描面被收窄、或文档被改空 ⇒ DR6 就基本不生效）。
 *   DR8 接入指南里不许写死「会变的条目数」——
 *      HOW_TO_RUN.md 里出现「数词（值 ≥ 2）+ 量词」（如「三篇」「两处」
 *      「约 35 KB」「7 次」）判红：这些数字每接一篇内容、每改一次样式就变一次。
 *      单独一个「一」是泛指（「新增一篇博客」），不算写死了计数；
 *      「个」不在量词表里（它常用于修辞，如「两个副本」）——
 *      「N 个 partial」那类清点由 DR6 的路径清单守。
 *      口径只管 HOW_TO_RUN.md：它是接入指南，里面的计数全是仓库现状陈述；
 *      docs/implementation-notes.md 的论文篇数由 DR2 管，其余章节是设计取舍记述。
 *   DR9–DR12 计划/审计类文档的「证据」必须与代码现实对齐（详见下方独立小节）。
 *
 * ⚠️ 为什么只扫这几份活文档（**历史记录不扫**）：
 *   · docs/IMPROVEMENT-LOG.md、docs/DEFECT-BACKLOG.md、docs/ROADMAP.md 是**历史记录** ——
 *     它们必须原样保留当时的错误写法（缺陷条目里得写着当时那条错的清单），
 *     改写历史就是伪造历史。
 *   · docs/acceptance-report.md 自带「历史快照（2026-09-26）…不再随代码更新」声明。
 *   · docs/information-architecture.md 与 docs/blog-writing-guide.md 各自另有归属：
 *     前者是设计文档（明确列着「本文提到但代码里还没有」），后者是**契约**
 *     （由 check-writing-contract 那道门禁守：它核对契约文档里的判据对照表、
 *      自动注入字段表与代码现实是不是还是同一批）。
 *     ⚠️ 2026-10-23（D80 场次）订正：这里原先写的是「后者由 check-blog-frontmatter
 *     那道门禁逐条实现」—— **那个理由是假的**：check-blog-frontmatter 守的是
 *     **文章文件**（F1–F15 逐条实现），它**从不看这份文档**；
 *     「文档里的判据表与门禁源码里的判据是不是同一批」当时**没有任何门禁在看**。
 *   · implementation-notes.md 是**唯一**自称含「就地现状标注」的活文档；
 *     HOW_TO_RUN.md 是「仓库结构 + 怎么跑起来」的**第二份副本** ——
 *     2026-10-23（D91 场次）实测它已漂到点名已删文件，而 check-readme.cjs
 *     明确只读 README.md ⇒ 它此前**零门禁看守**。这两份都自称描述「现状」，
 *     别的文档的现状陈述要么是设计意图，要么由各自的门禁守。
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 这道门禁只认**语法明确的声明**（「必填 `a / b`」这种反引号字段清单、
 *     括号里的斜杠分隔标识清单、现状标记后接数字）——
 *     它**读不懂散文**，一句话里拐八道弯的说法它看不见。
 *   · 「论文语境段落」按中文词「篇 / 论文」判定；纯英文表述（paper / papers）
 *     单独出现时不算语境（§6 那种纯英文的 ESM 模块清单（main / toc / …）就不算）。
 *   · front matter 的基准取自**真实论文文件**；一篇真实论文都没有时 DR3/DR4 判不了，
 *     由 DR5 报出来（判不了不等于没问题，但也不该在这时候硬判红）。
 *   · DR6 只查**行内反引号里的仓库根相对路径**：围栏代码块里的文件名、散文里
 *     提到的路径都不在扫描面内；首段不在仓库根的局部写法（`layouts/detail.njk`
 *     这类）也不查 —— 换句话说，它查的是「照着这条路径去改文件会不会落空」。
 *   · DR6 **分不清**「文档在说某路径已经不存在」与「文档以为它存在」：
 *     文档要提到已删除的路径时，不要把它放进反引号 —— 那样 DR6 一定会把它当漂移报出来。
 *   · DR7 的下限数的是**候选路径数**，不是路径真值数：一份文档如果通篇用相对写法，
 *     候选数会低于下限而被判红 —— 这是有意的（扫描面收窄本身就是风险）。
 *   · DR8 只管 HOW_TO_RUN.md（接入指南）；docs/implementation-notes.md 的论文篇数
 *     由 DR2 管，其余章节是设计取舍记述，不在 DR8 的扫描面内。
 *   · 门禁**不联网**、不跑构建，纯静态读文件。
 *
 * 环境变量（供 scripts/test-doc-reality.cjs 的注入矩阵用）：
 *   DR_ROOT —— 覆盖仓库根（活文档、论文目录、目录数据文件都从这里找）。
 *              注入必须发生在副本上，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.DR_ROOT || path.join(__dirname, ".."));

/** 要扫的活文档（相对仓库根）。 */
const DOC_REL = "docs/implementation-notes.md";
/** 论文内容目录（相对仓库根）：真实论文目录与目录数据文件都在这儿。 */
const PAPERS_REL = "src/content/papers";
/** 论文目录数据文件（相对仓库根）：自动注入字段的真源。 */
const PAPERS_DATA_REL = "src/content/papers/papers.11tydata.cjs";
/** 论文元数据真源（相对仓库根）：标题/作者/期刊/doi 都在这儿。 */
const SITE_JS_REL = "src/_data/site.js";
/** 接入流程文档（相对仓库根）：「仓库结构 + 怎么跑起来」的说明。 */
const RUN_DOC_REL = "HOW_TO_RUN.md";
/** DR6 / DR7 一起扫的活文档（相对仓库根）。 */
const PATH_DOC_RELS = [DOC_REL, RUN_DOC_REL];
/** DR7 的覆盖度下限：每份活文档至少要检出这么多个仓内路径候选。 */
const MIN_PATH_CANDIDATES = 5;

/** 论文语境：中文的「篇 / 论文」。纯英文的 paper / papers 不算（见诚实边界）。 */
const PAPER_CONTEXT_RE = /篇|论文/;
/** 现状标记：后面跟着数字 + 篇，就是「写死了会变的计数」。 */
const COUNT_RE = /(现状|现有|现在|目前|现已|已有|一共|总共|共)\s*([0-9]+)\s*篇/g;
/** 「必填」后面第一个反引号里的字段清单。 */
const REQUIRED_RE = /必填[^`]*`([^`]+)`/g;
/** 括号里的清单（全角 / 半角都认）。 */
const LIST_RE = /[（(]([^（()）]*)[）)]/g;
/** kebab-case 标识：小写字母数字 + 至少一个连字符。 */
const KEBAB_RE = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
/** 行内反引号 span（DR6 的取值面）。 */
const INLINE_SPAN_RE = /`[^`\n]+`/g;
/** 围栏代码块（DR6 不查围栏里的内容：那里的文件名是同目录相对名）。 */
const FENCE_RE = /^\s*(`{3,}|~{3,})/;
/** 仓内路径词元的合法字符集：出现别的字符（占位符尖括号、glob 星号、等号…）就自动豁免。 */
const PATH_CHARS_RE = /^[A-Za-z0-9_.\-/]+$/;
/** 产物目录前缀：build 链里产物目录可能还不存在，一律不查。 */
const PRODUCT_PREFIX = "_site";
/** DR8 的量词表：这些单位后面的数字都是「会变的存量 / 体积」。
 *  刻意**不含「个」**：它是最泛的量词，行文里常用于修辞（「两个副本」），
 *  把「N 个」从判据里剔掉，判据命中的每一处就都确实是存量数字。
 *  「N 个 partial」那类清点改由 DR6 守 —— 接入指南里逐条列出 partial 的路径，
 *  增删 partial 必然让那份路径清单过期 ⇒ DR6 会报出来。 */
const COUNT_UNITS = ["篇", "次", "处", "份", "项", "条", "块", "张", "KB", "MB", "B"];
/** 中文数词：单独一个「一」是泛指（「新增一篇博客」），不算写死了计数。 */
const CN_DIGITS = "零一二三四五六七八九十百千万两";
/** DR8 的取值正则：数词 + 量词（量词长的排前面，KB 先于 B）。 */
const COUNT_UNIT_RE = new RegExp(
  "([0-9]+|[" +
    CN_DIGITS +
    "]+)\\s*(" +
    COUNT_UNITS.slice()
      .sort((a, b) => b.length - a.length)
      .join("|") +
    ")",
  "g"
);

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

/** 目录下的子目录名（跳过文件、跳过 exFAT 的 ._ 资源叉侧车）。 */
function subdirs(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return null;
  }
  return names
    .filter((d) => d.isDirectory() && !d.name.startsWith("._"))
    .map((d) => d.name)
    .sort();
}

/** 目录下的 .md 文件名（跳过资源叉侧车）。 */
function mdFiles(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".md") && !d.name.startsWith("._"))
      .map((d) => d.name)
      .sort();
  } catch (e) {
    return [];
  }
}

/** front matter 的顶层键（只取键名，值一律不读）。 */
function frontMatterKeys(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const keys = [];
  for (const line of m[1].split("\n")) {
    const km = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:/.exec(line);
    if (km) keys.push(km[1]);
  }
  return keys;
}

/**
 * 目录数据文件自动注入的键：顶层键 + eleventyComputed 的内层键。
 * 刻意**不 require 这个文件** —— 它是被检查方，门禁不 import 被检查方。
 */
function injectedKeys(text) {
  const keys = new Set();
  const lines = text.split("\n");
  let inExport = false;
  let inComputed = false;
  for (const line of lines) {
    if (!inExport) {
      if (/module\.exports\s*=\s*\{/.test(line)) inExport = true;
      continue;
    }
    if (/^\}\s*;?\s*$/.test(line)) break; // module.exports 结束
    const m = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line);
    if (!m) continue;
    const indent = m[1].length;
    if (indent === 2) {
      inComputed = m[2] === "eleventyComputed";
      keys.add(m[2]);
    } else if (indent >= 4 && inComputed) {
      keys.add(m[2]);
    }
  }
  return keys;
}

/**
 * 去掉围栏代码块：围栏内的行替换成空串，**行号保持不变**。
 * DR6 只看行内反引号 span —— 围栏代码块里写的是命令与字段清单，
 * 里面的 `cover.png` / `index.md` 是同目录文件名，不是仓库根相对路径。
 */
function stripFences(lines) {
  const out = [];
  let fence = null;
  for (const line of lines) {
    const m = FENCE_RE.exec(line);
    if (fence) {
      out.push("");
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      out.push("");
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * 一份活文档里的仓内路径候选（DR6 的取值面）。
 * 口径（刻意保守，宁可漏报也不误报，详见文件头）：
 *   · 只认行内反引号 span；
 *   · 词元必须含 "/" 且字符集只有字母数字与 `_ . - /`
 *     （出现 < > * = 等的一律跳过 ⇒ 占位符与 glob 自动豁免）；
 *   · 不以 "/" 开头；不以 `_site` 开头（产物目录，build 前可能还不存在）；
 *   · 首段必须是仓库根下的真实条目 ⇒ 局部相对写法自动跳过。
 */
function pathCandidates(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const lines = stripFences(fs.readFileSync(abs, "utf8").split("\n"));
  const out = [];
  lines.forEach((line, i) => {
    INLINE_SPAN_RE.lastIndex = 0;
    let m;
    while ((m = INLINE_SPAN_RE.exec(line)) !== null) {
      for (const raw of m[0].slice(1, -1).split(/\s+/)) {
        const tok = raw.trim();
        if (!tok.includes("/")) continue;
        if (!PATH_CHARS_RE.test(tok)) continue;
        if (tok.startsWith("/")) continue;
        if (tok === PRODUCT_PREFIX || tok.startsWith(PRODUCT_PREFIX + "/")) continue;
        const first = tok.split("/")[0];
        if (first === "." || first === "..") continue;
        if (!fs.existsSync(path.join(ROOT, first))) continue; // 局部相对写法
        const target = path.join(ROOT, tok.replace(/\/+$/, ""));
        out.push({ rel, lineNo: i + 1, tok, exists: fs.existsSync(target) });
      }
    }
  });
  return out;
}

/** 数词的值：单独一个「一」是泛指（值 1），其余中文数词都 ≥ 2。 */
function countValue(num) {
  if (/^[0-9]+$/.test(num)) return parseInt(num, 10);
  if (num === "一") return 1;
  if (num === "零") return 0;
  return 2;
}

/* ---------------- 读现场 ---------------- */

const docFile = path.join(ROOT, DOC_REL);
const docExists = fs.existsSync(docFile);
const docText = docExists ? fs.readFileSync(docFile, "utf8") : "";
const docLines = docText.split("\n");

const papersDir = path.join(ROOT, PAPERS_REL);
const paperDirs = subdirs(papersDir) || [];

/**
 * 真实论文 = 目录里**真有**带 front matter 的 .md 文件。
 * 光有个空目录不算（空目录不产出任何论文页）⇒
 * 计数（DR5）与存在性判据（DR1）都以这份清单为准，不以目录数为准。
 */
const realPaperSlugs = [];
/** 真实论文的 front matter 键（所有论文合起来）。 */
const fmKeys = new Set();
let fmPapers = 0;
for (const slug of paperDirs) {
  const dir = path.join(papersDir, slug);
  let isReal = false;
  for (const name of mdFiles(dir)) {
    const keys = frontMatterKeys(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!keys) continue;
    fmPapers += 1;
    isReal = true;
    for (const k of keys) fmKeys.add(k);
  }
  if (isReal) realPaperSlugs.push(slug);
}

const dataFile = path.join(ROOT, PAPERS_DATA_REL);
const dataExists = fs.existsSync(dataFile);
const injected = dataExists ? injectedKeys(fs.readFileSync(dataFile, "utf8")) : new Set();

/* ---------------- 扫描 ---------------- */

/** 论文语境段落（按空行断块，记住起止行号）。 */
function paperParagraphs() {
  const out = [];
  let start = 0;
  let buf = [];
  const flush = (endLine) => {
    if (!buf.length) return;
    const text = buf.join("\n");
    if (PAPER_CONTEXT_RE.test(text)) out.push({ text, startLine: start + 1, endLine });
    buf = [];
  };
  docLines.forEach((line, i) => {
    if (!line.trim()) {
      flush(i);
      start = i + 1;
      return;
    }
    if (!buf.length) start = i;
    buf.push(line);
  });
  flush(docLines.length);
  return out;
}

/* ---------------- DR1：点名的论文标识必须真实存在 ---------------- */

for (const para of paperParagraphs()) {
  para.text.split("\n").forEach((line, k) => {
    const lineNo = para.startLine + k;
    LIST_RE.lastIndex = 0;
    let m;
    while ((m = LIST_RE.exec(line)) !== null) {
      const parts = m[1]
        .split(/\s*\/\s*/)
        .map((x) => x.trim())
        .filter((x) => KEBAB_RE.test(x));
      if (parts.length < 2) continue; // 不是「斜杠分隔的标识清单」
      for (const token of parts) {
        if (realPaperSlugs.includes(token)) continue;
        fail(
          `DR1 ${where(DOC_REL, lineNo)} 论文语境段落里点名的「${token}」没有对应的论文目录` +
            `（${PAPERS_REL}/ 下只有 ${realPaperSlugs.join(" / ") || "（空）"}）—— ` +
            `文档列的论文已经不存在，或名字写错了；照着它去改论文页，只会改一个不存在的东西。`
        );
      }
    }
  });
}

/* ---------------- DR2：现状陈述里不许写死论文篇数 ---------------- */

docLines.forEach((line, i) => {
  COUNT_RE.lastIndex = 0;
  let m;
  while ((m = COUNT_RE.exec(line)) !== null) {
    fail(
      `DR2 ${where(DOC_REL, i + 1)} 现状陈述里写死了会变的论文篇数（「${m[1]} ${m[2]} 篇」）—— ` +
        `论文数量每接一篇就变一次，写死在现状陈述里必然漂（同一个病在 build 链段数上已经犯过一次）。` +
        `改成指向 ${PAPERS_REL}/ 的写法，让真源只有一个。`
    );
  }
});

/* ---------------- DR3 / DR4：必填字段清单必须真实 ---------------- */

const requiredLists = [];
docLines.forEach((line, i) => {
  REQUIRED_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRED_RE.exec(line)) !== null) {
    const fields = m[1]
      .split("/")
      .map((x) => x.trim())
      .filter((x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x));
    if (fields.length) requiredLists.push({ fields, lineNo: i + 1 });
  }
});

if (fmPapers > 0) {
  for (const req of requiredLists) {
    for (const field of req.fields) {
      if (injected.has(field)) {
        fail(
          `DR4 ${where(DOC_REL, req.lineNo)} 「必填」清单里的字段「${field}」由目录数据文件自动注入` +
            `（${PAPERS_DATA_REL}）—— 自动注入的字段不该在 front matter 里再写一遍（写了就是覆盖）；` +
            `本仓对博客那边也是同一条口径（自动注入、不要重复写）。`
        );
        continue;
      }
      if (!fmKeys.has(field)) {
        fail(
          `DR3 ${where(DOC_REL, req.lineNo)} 「必填」清单里的字段「${field}」不在真实论文的 front matter 里` +
            `（真实 front matter 的键是 ${[...fmKeys].join(" / ") || "（空）"}）—— ` +
            `它根本不是 front matter 字段：论文的标题/作者/期刊/doi 的真源是 ${SITE_JS_REL} 的 publications 条目，` +
            `front matter 只用 pubKey 指回去；slug 由目录名决定，也不是 front matter 字段。`
        );
      }
    }
  }
}

/* ---------------- DR5 覆盖度自证 ---------------- */

if (!docExists) {
  fail(
    `DR5 要扫的活文档不在：${DOC_REL} —— 扫描面被收窄了，` +
      `这道门禁已经看不到那份「现状 + 接入流程」契约，等于没在检查。`
  );
}
if (realPaperSlugs.length < 1) {
  fail(
    `DR5 ${PAPERS_REL}/ 一篇真实论文都没检出 —— front matter 的基准读不到，` +
      `「文档说的必填字段对不对」就判不了（判不了不等于没问题，必须报出来）。`
  );
}
if (!dataExists) {
  fail(
    `DR5 读不到论文目录数据文件：${PAPERS_DATA_REL} —— ` +
      `「哪些字段是自动注入的」判不了（判不了不等于有问题，必须报出来）。`
  );
}
if (docExists && requiredLists.length < 1) {
  fail(
    `DR5 一处「必填字段清单」都没检出 —— 接入流程必须把「front matter 必填哪些字段」` +
      `写成可核对的清单，否则「文档说的必填字段对不对」这件事无从判断。`
  );
}
if (docExists && paperParagraphs().length < 1) {
  fail(
    `DR5 一个论文语境段落都没检出 —— 论文相关的现状陈述与接入流程都看不见` +
      `（判不了不等于没问题，必须报出来）。`
  );
}

/* ---------------- DR6：活文档点名的仓内路径必须真实存在 ---------------- */

const pathCandidatesByDoc = new Map();
const missingPaths = [];
for (const rel of PATH_DOC_RELS) {
  const cands = pathCandidates(rel);
  pathCandidatesByDoc.set(rel, cands);
  for (const c of cands) {
    if (!c.exists) missingPaths.push(c);
  }
}

if (missingPaths.length) {
  fail(
    `DR6 活文档点名的仓内路径在仓库里不存在（${missingPaths.length} 处）：` +
      missingPaths.map((m) => where(m.rel, m.lineNo) + " 的「" + m.tok + "」").join("；") +
      ` —— 照着它去改文件，只会改一个不存在的东西：要么路径写错了，要么它已经被删掉/搬走了。`
  );
}

/* ---------------- DR7：覆盖度自证 ---------------- */

if (!fs.existsSync(path.join(ROOT, RUN_DOC_REL))) {
  fail(
    `DR7 接入流程文档不在：${RUN_DOC_REL} —— 它是「仓库结构 + 怎么跑起来」的第二份副本，` +
      `没有门禁看守就等于没有：里面的路径、命令、产物形态都会漂。`
  );
}
for (const rel of PATH_DOC_RELS) {
  if (!fs.existsSync(path.join(ROOT, rel))) continue; // 文档不在由 DR5a / 上面那条报
  const n = (pathCandidatesByDoc.get(rel) || []).length;
  if (n < MIN_PATH_CANDIDATES) {
    fail(
      `DR7 ${rel} 里检出的仓内路径候选太少（${n} 个，要求至少 ${MIN_PATH_CANDIDATES} 个）—— ` +
        `候选太少意味着扫描面被收窄或文档被改空了：DR6 那种「照着改文件会不会落空」的检查就基本不生效。`
    );
  }
}

/* ---------------- DR8：接入指南里不许写死会变的条目数 ---------------- */

const runDocPath = path.join(ROOT, RUN_DOC_REL);
if (fs.existsSync(runDocPath)) {
  const runLines = stripFences(fs.readFileSync(runDocPath, "utf8").split("\n"));
  const countHits = [];
  runLines.forEach((line, i) => {
    COUNT_UNIT_RE.lastIndex = 0;
    let m;
    while ((m = COUNT_UNIT_RE.exec(line)) !== null) {
      if (countValue(m[1]) < 2) continue;
      countHits.push({ lineNo: i + 1, text: m[0] });
    }
  });
  if (countHits.length) {
    fail(
      `DR8 接入指南里写死了会变的条目数（${countHits.length} 处）：` +
        countHits.map((h) => where(RUN_DOC_REL, h.lineNo) + " 的「" + h.text + "」").join("；") +
        ` —— 这些数字描述的是会变的现状（内容条目数、配置位置数、产物体积），` +
        `每接一篇内容、每改一次样式、每挪一次配置都可能变；写死在接入指南里必然漂。` +
        `改成指向真源的写法（如「以 src/content/papers/ 下的实际目录为准」）。`
    );
  }
}

/* ---------------- DR9–DR12：计划文档的「证据」必须与代码现实对齐 ---------------- */

/**
 * 计划/审计类文档（相对仓库根）。
 *
 * 2026-10-23（D93 场次）实测：这份文档写于 2026-10-19，每条改进项都带一行「**证据**」——
 * 那些证据描述的是**当时**的代码状态。几天之后，打印样式、换行规则、数据可视化、
 * 尺寸占位这四条陆续在代码里落地，那几行证据却还停在写完当时的样子：
 *   · 打印样式那一条写「@media print 零命中」，而 src/assets/css/print.css 已存在且已引入；
 *   · 断点那一条写「6 个散落断点 640/720/760/768/820/1024」，720 已不存在、新增 360 与 860；
 *   · 换行那一条写「base.css 用 overflow-wrap: break-word」，早已换成 anywhere；
 *   · 数据可视化那一条写「无任何数据图表」，首页的极端降水图已落地；
 *   · 尺寸占位那一条写「项目无 <img width/height> 占位约定」，模板里每个 <img> 都已带上。
 * 照着这些证据去改代码，会去改一个已经做完的东西（或者以为站点还缺能力）。
 * 而这一族文档此前**零门禁看守**：docs/ 下十几份 md 里，它是唯一一份既没有快照声明、
 * 又通篇由「证据」行驱动、却没有任何判据读它的活文档。
 *
 * 修法：让它**每条改进项都必须自报现状**，并且现状必须是**机器可核对**的断言。
 *   DR9  结构 —— 每个改进项小节都必须同时有「当时的证据」与「当前状态」两个标记；
 *        「当时的」那一半是历史记录，**不得改写**；缺任一个标记即判红。
 *        三个红因点：
 *          （a）计划文档不在 ⇒ 扫描面被收窄；
 *          （b）某个小节缺标记 ⇒ 判红；
 *          （c）**已知 token 一个都没被断言** ⇒ 覆盖度自证（防「把断言全删掉就蒙混过关」）。
 *   DR10 token 必须登记 —— 断言里的 token 必须在门禁的已知清单内；
 *        拼错或杜撰的 token 一律判红（否则「拼错的 token」会静默地不被检查）。
 *   DR11 取值必须与现实一致 —— 每个 token 的实测取值与文档里写的取值不一致即判红。
 *        这条才是真正防漂的那一条：代码改了而本文没跟上 ⇒ 直接红。
 *   DR12 不许写死会变的篇幅数 —— 本文是活文档，不许出现「数词 + 行」那类存量数。
 *        ⚠️ 明确标为「当时的」的历史记录行**豁免**（历史不得改写，改了就是伪造历史）。
 *
 * ⚠️ 诚实边界：
 *   · DR9–DR12 只认**语法明确的声明**（标记行 + `token=取值`），
 *     散文里拐弯的说法它看不见；token 的取值域是门禁里写死的那几个，
 *     文档若讨论门禁没登记的维度，就不在看守范围内。
 *   · DR10–DR11 的「现实」是**源码层面**的实测（文件在不在、内容里有没有某个写法），
 *     不跑构建、不联网；产物层面的事实另有门禁管。
 *   · DR12 的豁免口径是「该行明确写着「当时的」」——
 *     历史记录那一半允许出现当时的篇幅数，改它就是伪造历史。
 */
const PLAN_REL = "docs/ui-ux-pro-max-improvement-plan.md";
/** 改进项小节的标题行（### 开头，编号形如 P1 / P2 …）。 */
const P_SECTION_RE = /^###\s+P(\d+)\b/;
/** 「现状断言」行的行首（冒号后是若干个 `token=取值`）。 */
const PLAN_ASSERT_LINE_RE = /^\s*[-*]\s*现状断言[：:]/;
/** 两个必需标记：历史那一半与当前这一半。 */
const PLAN_MARK_HISTORY = "当时的证据";
const PLAN_MARK_CURRENT = "当前状态";
/** DR12 的历史行豁免标记：明确标为「当时的」的行是历史记录，不得改写。 */
const PLAN_HISTORY_MARK = "当时的";
/** DR12 的取值正则：数词 + 「行」（只有篇幅数这一种量词）。 */
const PLAN_COUNT_RE = new RegExp("([0-9]+|[" + CN_DIGITS + "]+)\\s*行", "g");

/** 读仓库里的一个文件（相对仓库根）；读不到返回 null。 */
function readRel(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (e) {
    return null;
  }
}

/** 仓库里某个路径在不在（相对仓库根）。 */
function existsRel(rel) {
  try {
    fs.statSync(path.join(ROOT, rel));
    return true;
  } catch (e) {
    return false;
  }
}

/** 递归列出目录下的文件（跳过 exFAT 的 ._ 资源叉侧车）。 */
function listFiles(dir, out) {
  out = out || [];
  let names;
  try {
    names = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const d of names) {
    if (d.name.startsWith("._")) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) listFiles(p, out);
    else if (d.isFile()) out.push(p);
  }
  return out;
}

/** src/ 下指定后缀的文件。 */
function srcFiles(...exts) {
  const want = exts.map((e) => e.toLowerCase());
  return listFiles(path.join(ROOT, "src")).filter((f) =>
    want.includes(path.extname(f).toLowerCase())
  );
}

/** 去掉模板里的注释：Nunjucks {# … #}、HTML <!-- … -->、CSS /* … *\/。 */
function stripTemplateComments(text) {
  return text.replace(/\{#[\s\S]*?#\}/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
}

/**
 * 计划文档的现状断言 → 代码现实里的实测取值（取值是字符串，门禁只比字符串）。
 * ⚠️ 这张表是**门禁与文档之间的契约**：token 名写在这里，文档里就只准写这些名字。
 */
const PLAN_TOKEN_VALUES = {
  "print-style": () => (existsRel("src/assets/css/print.css") ? "present" : "absent"),
  "print-media": () => {
    const t = readRel("src/assets/css/print.css");
    return t && /@media\s+print/.test(t) ? "yes" : "no";
  },
  "print-imported": () => {
    const t = readRel("src/_includes/layouts/base.njk");
    return t && t.includes("print.css") ? "yes" : "no";
  },
  "print-page-rule": () => {
    const t = readRel("src/assets/css/print.css");
    return t && /@page/.test(t) ? "yes" : "no";
  },
  "breakpoints": () => {
    const set = new Set();
    for (const f of srcFiles(".css", ".njk")) {
      const t = fs.readFileSync(f, "utf8");
      const re = /@media[^{]*?\((?:min|max)-width:\s*([0-9.]+)px\)/g;
      let m;
      while ((m = re.exec(t)) !== null) set.add(m[1]);
    }
    if (!set.size) return "none";
    return [...set].sort((a, b) => parseFloat(a) - parseFloat(b)).join(",");
  },
  "overflow-wrap-anywhere": () => {
    const t = readRel("src/assets/css/base.css");
    return t && /overflow-wrap:\s*anywhere/.test(t) ? "yes" : "no";
  },
  "min-inline-size-zero": () => {
    let n = 0;
    for (const f of srcFiles(".css")) {
      n += (fs.readFileSync(f, "utf8").match(/min-inline-size:\s*0(?![.\w])/g) || []).length;
    }
    return String(n);
  },
  "data-chart-module": () => (existsRel("src/assets/js/home-chart.js") ? "present" : "absent"),
  "data-chart-data": () => (existsRel("src/_data/extremePrecip.json") ? "present" : "absent"),
  "paper-reader-progress-module": () =>
    existsRel("src/assets/js/paper-reader/reading-progress.js") ? "present" : "absent",
  "img-size-placeholder": () => {
    const imgs = [];
    for (const f of srcFiles(".njk")) {
      const t = stripTemplateComments(fs.readFileSync(f, "utf8"));
      const re = /<img\b[^>]*>/g;
      let m;
      while ((m = re.exec(t)) !== null) imgs.push(m[0]);
    }
    if (!imgs.length) return "none";
    return imgs.every((s) => /\bwidth\s*=/.test(s) && /\bheight\s*=/.test(s)) ? "yes" : "no";
  },
};

const planAbs = path.join(ROOT, PLAN_REL);
const planExists = fs.existsSync(planAbs);
const planLines = planExists ? fs.readFileSync(planAbs, "utf8").split("\n") : [];
/** 围栏代码块里的内容不查（那是示例，不是现状陈述）。 */
const planBody = stripFences(planLines);

/* DR9a：计划文档必须在。 */
if (!planExists) {
  fail(
    `DR9 计划文档不在：${PLAN_REL} —— 扫描面被收窄了，` +
      `这道门禁就看不到那份「逐条自报现状」的改进计划，等于没在检查。`
  );
}

/* 改进项小节：从「### P<n>」标题行到下一个 ## / ### 标题之前。 */
const planSections = [];
planLines.forEach((line, i) => {
  const m = P_SECTION_RE.exec(line);
  if (!m) return;
  planSections.push({ id: m[1], start: i, end: planLines.length });
});
for (const s of planSections) {
  for (let i = s.start + 1; i < s.end; i++) {
    if (/^#{2,3}\s/.test(planLines[i])) {
      s.end = i;
      break;
    }
  }
}

/* DR9b：每个小节都要有「当时的证据」与「当前状态」两个标记。 */
if (planExists) {
  const missing = [];
  for (const s of planSections) {
    const body = planLines.slice(s.start, s.end).join("\n");
    const hasHistory = body.includes(PLAN_MARK_HISTORY);
    const hasCurrent = body.includes(PLAN_MARK_CURRENT);
    if (hasHistory && hasCurrent) continue;
    const lack = [];
    if (!hasHistory) lack.push(PLAN_MARK_HISTORY);
    if (!hasCurrent) lack.push(PLAN_MARK_CURRENT);
    missing.push({ id: s.id, lineNo: s.start + 1, lack: lack.join(" 与 ") });
  }
  if (missing.length) {
    fail(
      `DR9 改进项小节缺标记（${missing.length} 处）：` +
        missing.map((m) => `${PLAN_REL}:${m.lineNo}（改进项 ${m.id}）缺「${m.lack}」`).join("；") +
        ` —— 每个改进项都必须同时写出「当时的证据」（历史记录，不得改写）与「当前状态」（现状陈述），` +
        `否则读者分不清哪一半还成立。`
    );
  }
}

/* 现状断言：`- 现状断言：`token=value` · `token=value`` */
const planAsserts = [];
planBody.forEach((line, i) => {
  if (!PLAN_ASSERT_LINE_RE.test(line)) return;
  INLINE_SPAN_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_SPAN_RE.exec(line)) !== null) {
    const raw = m[0].slice(1, -1).trim();
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    planAsserts.push({ lineNo: i + 1, token: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim() });
  }
});

/* DR10：断言里的 token 必须在已知清单内。 */
const unknownTokens = planAsserts.filter((a) => !(a.token in PLAN_TOKEN_VALUES));
if (unknownTokens.length) {
  fail(
    `DR10 现状断言里的 token 不在已知清单内（${unknownTokens.length} 处）：` +
      unknownTokens.map((a) => `${PLAN_REL}:${a.lineNo} 的「${a.token}」`).join("；") +
      ` —— 门禁只认自己登记过的 token（${Object.keys(PLAN_TOKEN_VALUES).join(" / ")}）；` +
      `没登记的 token 不会被检查，写了等于没写。`
  );
}

/* DR11：每个 token 的取值必须与代码现实一致。 */
const mismatched = [];
for (const a of planAsserts) {
  if (!(a.token in PLAN_TOKEN_VALUES)) continue;
  const real = PLAN_TOKEN_VALUES[a.token]();
  if (real === a.value) continue;
  mismatched.push({ lineNo: a.lineNo, token: a.token, value: a.value, real });
}
if (mismatched.length) {
  fail(
    `DR11 现状断言的取值与代码现实不一致（${mismatched.length} 处）：` +
      mismatched
        .map((m) => `${PLAN_REL}:${m.lineNo} 写的是「${m.token}=${m.value}」，实测是「${m.token}=${m.real}」`)
        .join("；") +
      ` —— 代码已经变了而本文没跟上：照着本文去改，会去改一个已经做完的东西（或者以为站点还缺能力）。`
  );
}

/* DR9c：覆盖度自证 —— 已知的 token 一个都没被断言 ⇒ 这道门禁在这一族维度上失效了。 */
const assertedTokens = new Set(planAsserts.map((a) => a.token));
const neverAsserted = Object.keys(PLAN_TOKEN_VALUES).filter((t) => !assertedTokens.has(t));
if (planExists && neverAsserted.length) {
  fail(
    `DR9 已知 token 没有被断言（${neverAsserted.length} 个）：${neverAsserted.join(" / ")} —— ` +
      `断言被删光就等于这道门禁在这些维度上失效了（覆盖度自证）。`
  );
}

/* DR12：计划文档里不许写死会变的篇幅数（明确标为「当时的」的历史行豁免）。 */
const planCountHits = [];
planBody.forEach((line, i) => {
  if (line.includes(PLAN_HISTORY_MARK)) return; // 历史记录行：不得改写
  PLAN_COUNT_RE.lastIndex = 0;
  let m;
  while ((m = PLAN_COUNT_RE.exec(line)) !== null) {
    if (countValue(m[1]) < 2) continue;
    planCountHits.push({ lineNo: i + 1, text: m[0] });
  }
});
if (planCountHits.length) {
  fail(
    `DR12 计划文档里写死了会变的篇幅数（${planCountHits.length} 处）：` +
      planCountHits.map((h) => `${PLAN_REL}:${h.lineNo} 的「${h.text}」`).join("；") +
      ` —— 篇幅每改一次样式就变一次；改成「全文见该文件」这类指向真源的写法。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("文档现状/接入流程门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    "  判据出处：docs/DEFECT-BACKLOG.md D78（D79 场次实测：文档的「现状」标注与「接入新论文 checklist」在站点重构后与代码现实脱节）；" +
      "D90（D91 场次实测：HOW_TO_RUN.md 这份「第二份副本」已漂到点名已删文件，且此前零门禁看守）；" +
      "D92（D93 场次实测：计划/审计类文档的「证据」行随代码漂移，而这一族此前零门禁看守）。"
  );
  console.error("");
  process.exit(1);
}

console.log(
  `文档现状/接入流程门禁通过：${DOC_REL} 里检出 ${paperParagraphs().length} 个论文语境段落、` +
    `${requiredLists.length} 处必填字段清单；真实论文 ${realPaperSlugs.length} 篇` +
    `（front matter 键 ${[...fmKeys].join(" / ") || "（空）"}），` +
    `目录数据文件自动注入 ${[...injected].join(" / ") || "（空）"}。`
);
console.log(
  `  · 本门禁是静态的：只认语法明确的声明（反引号字段清单、括号里的斜杠标识清单、现状标记后接数字）；散文里拐弯的说法它看不见。`
);
console.log(
  `  · 仓内路径候选：${PATH_DOC_RELS.map((r) => r + " " + (pathCandidatesByDoc.get(r) || []).length + " 个").join(" / ")}` +
    `（下限 ${MIN_PATH_CANDIDATES} 个）—— 文档用行内反引号点名的仓库根相对路径都真实存在。`
);
console.log(`  · 论文元数据的真源是 ${SITE_JS_REL} 的 publications 条目，front matter 只用 pubKey 指回去。`);
console.log(
  `  · 计划文档 ${PLAN_REL}：改进项 ${planSections.length} 个、现状断言 ${planAsserts.length} 条` +
    `（已知 token ${Object.keys(PLAN_TOKEN_VALUES).length} 个）—— 断言的取值已与代码现实逐条比对。`
);
