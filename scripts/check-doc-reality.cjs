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
 *
 * ⚠️ 为什么只扫 docs/implementation-notes.md（**历史记录不扫**）：
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
 *   · implementation-notes.md 是**唯一**自称含「就地现状标注」的活文档 ⇒ 只有它需要
 *     这道门禁；别的文档的现状陈述要么是设计意图，要么由各自的门禁守。
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 这道门禁只认**语法明确的声明**（「必填 `a / b`」这种反引号字段清单、
 *     括号里的斜杠分隔标识清单、现状标记后接数字）——
 *     它**读不懂散文**，一句话里拐八道弯的说法它看不见。
 *   · 「论文语境段落」按中文词「篇 / 论文」判定；纯英文表述（paper / papers）
 *     单独出现时不算语境（§6 那种「6 个 ESM 模块（main / toc / …）」就不算）。
 *   · front matter 的基准取自**真实论文文件**；一篇真实论文都没有时 DR3/DR4 判不了，
 *     由 DR5 报出来（判不了不等于没问题，但也不该在这时候硬判红）。
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

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("文档现状/接入流程门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    "  判据出处：docs/DEFECT-BACKLOG.md D78（D79 场次实测：文档的「现状」标注与「接入新论文 checklist」在站点重构后与代码现实脱节）。"
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
console.log(`  · 论文元数据的真源是 ${SITE_JS_REL} 的 publications 条目，front matter 只用 pubKey 指回去。`);
