#!/usr/bin/env node
/**
 * 身份派生门禁 —— 守住"身份清单只有一份、页面上那一份必须是**派生**出来的"。
 *
 * 为什么要有这条（一次具体的实测漏洞，不是假想）：
 *   身份清单的真源是 scripts/lib/identity.cjs（IDENTITY_SAMEAS），
 *   产物里的 sameAs 与页面上看得见的身份链接都从它派生。
 *   但"派生"这件事**只有代码注释在保护**——没有任何门禁挡住有人把
 *   site.js 里的派生改回**字面量**。一旦改回字面量，站点就多出**第二份清单**：
 *   改一处忘另一处会静默漂移（这正是本仓库反复吃过的亏）。
 *
 *   同族的洞已经补过一半：check-identity-handles.cjs 的 I5 管的是**取值**
 *   （site.author 里可见的身份链接必须与登记期望集逐项一致）。本条管的是
 *   **结构**（这些取值**不许**是抄来的字面量）。两条互补：I5 抓"抄错了"，
 *   本条抓"根本不该抄"。
 *
 * 扫描面（**两个载体**，同一族问题）：
 *   · D1 数据源层：src/_data/site.js
 *   · D4 模板层：  src 下的 .njk 模板（实测 21 个）
 *   D4 的来历：只扫数据源时，模板里烤死一条身份 URL（peer 2026-10-19 16:5x
 *   实测的 W1：base.njk 里写死 "https://github.com/oldsixxiaolv"）→ 整条 build
 *   链 exit 0 全绿。数据源是干净的，页面却已经不指向本人了。
 *   实测扩面零误伤：21 个 .njk 模板里 5 条身份 URL 一条都没以字面量出现
 *   （唯一沾边的 paper.njk:77 提到的是**代码仓** URL，见下面"只查完整字面量"）。
 *
 * ⚠️ 故意**不**扫 src 下的 .md 正文：md 里确实有一条身份 URL 字面量
 *   （src/content/about.md:38 的 CSDN 链接），那是并发场次已登记的**待拍板 10**
 *   （"可见身份链接的第二条路"），且该文件 markdownTemplateEngine:false、
 *   不能写模板语法。扫了等于把待拍板变成 build 断点 —— **本门禁不代拍**。
 *
 * ⚠️ 本条只查**完整字面量**（整条 URL 被引号包住、引号内没有多余内容），
 *   不做 URL 形态匹配 —— 形态匹配会把
 *   "https://github.com/oldsixxiaolv/Manuscript_Lvyh"（代码仓，深层内容链接）
 *   误判成"抄了 GitHub 身份"。形态那条由 I5 在**数据源**上做，不混进本条。
 *
 * ⚠️ 注释里**可以**写这些 URL（那是文档，不是数据）：本条先把注释内容
 *   遮罩成空格再匹配（保留行号），所以注释里出现这些 URL 一律放行。
 *   **这个口子是刻意开的**（见日志待拍板 17），它意味着"把 URL 留在注释里、
 *   字段留空"这种写法不受本条约束。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE_JS = path.join(ROOT, "src/_data/site.js");
const SHARED = path.join(ROOT, "scripts/lib/identity.cjs");
const SRC = path.join(ROOT, "src");

/* 期望集：与 check-identity-handles.cjs 的 ORACLE_SAMEAS 同一份内容。
   本条**不**从共享模块取期望值——共享模块是产物的发射源，从它取期望值
   就是"拿被改过的东西和它自己比"（那是 16:05 场次初版踩过的坑）。 */
const ORACLE_SAMEAS = [
  "https://orcid.org/0009-0005-3511-0546",
  "https://github.com/oldsixxiaolv",
  "https://www.researchgate.net/profile/Yihang-Lyu",
  "https://blog.csdn.net/lvyihang200411",
  "https://openalex.org/A5121394231",
];
const EXPECTED_COUNT = 5;

const problems = [];
const fail = (msg) => problems.push(msg);

/* ---------- 注释遮罩：把注释内容替换成等长空格 ----------
   保留行号与列位置 → 命中位置仍然能报到"第几行"。
   JS：// 注释、/* 块注释 *／；Nunjucks/HTML：{# #}、<!-- -->。 */
function maskComments(text, kind) {
  const rules =
    kind === "njk"
      ? [/\{#[\s\S]*?#\}/g, /<!--[\s\S]*?-->/g]
      : [/\/\*[\s\S]*?\*\//g, /\/\/[^\n]*/g];
  return rules.reduce(
    (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, " ")),
    text
  );
}

/* ---------- 找"被抄成字面量的身份 URL" ----------
   判据形状：整条 URL 必须**被引号包住**且引号内**没有多余内容**
   （允许末尾一个斜杠 —— 同一个 URL 的常见写法变体）。
   于是 "…/oldsixxiaolv/Manuscript_Lvyh"（代码仓）不会命中，
   "…/oldsixxiaolv"（身份句柄）会命中。 */
function findLiteralCopies(text, urls) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (const url of urls) {
    const needles = [`"${url}"`, `'${url}'`, `"${url}/"`, `'${url}/'`];
    for (let i = 0; i < lines.length; i++) {
      if (needles.some((n) => lines[i].includes(n))) hits.push({ line: i + 1, url });
    }
  }
  return hits;
}

/* ---------- 递归列出 .njk 模板 ---------- */
function listNjkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listNjkFiles(p));
    else if (entry.name.endsWith(".njk")) out.push(p);
  }
  return out;
}

/* ---------- D1：身份 URL 不得在 site.js 里以字面量出现 ---------- */
let siteChecked = 0;
let siteSource = "";
try {
  siteSource = fs.readFileSync(SITE_JS, "utf8");
} catch (e) {
  fail(`读不到 src/_data/site.js（${e.message}）——本门禁没有判断对象，直接判红。`);
}

if (siteSource) {
  siteChecked = ORACLE_SAMEAS.length;
  for (const h of findLiteralCopies(maskComments(siteSource, "js"), ORACLE_SAMEAS)) {
    fail(
      `src/_data/site.js 第 ${h.line} 行把身份 URL ${h.url} **写成了字面量**——` +
        `身份清单的真源是 scripts/lib/identity.cjs，页面上的身份链接必须从它派生` +
        `（否则就多出第二份清单，改一处忘另一处会静默漂移）。`
    );
  }

  /* ---------- D2：真源必须真的被引用（结构上的另一半） ---------- */
  if (!/require\(\s*["'][^"']*lib\/identity\.cjs["']\s*\)/.test(siteSource)) {
    fail(
      `src/_data/site.js 没有 require 共享身份清单 scripts/lib/identity.cjs——` +
        `身份链接与 sameAs 就没有共同真源，本条的前提不成立。`
    );
  }

  /* ---------- D3：共享模块自身必须存在（锚失效即判红） ---------- */
  if (!fs.existsSync(SHARED)) {
    fail(`共享身份清单 scripts/lib/identity.cjs 不存在——真源没了，本门禁无从判断。`);
  }
}

/* ---------- D4：模板层同样不许抄字面量（peer W1 的洞） ---------- */
let templateFiles = 0;
let templateChecked = 0;
try {
  const njkFiles = listNjkFiles(SRC);
  templateFiles = njkFiles.length;
  if (!templateFiles) {
    fail(
      `src/ 下找不到任何 .njk 模板——模板层这条判据没有判断对象（扫描面空跑），直接判红。`
    );
  }
  templateChecked = ORACLE_SAMEAS.length;
  for (const file of njkFiles) {
    const rel = path.relative(ROOT, file);
    const text = maskComments(fs.readFileSync(file, "utf8"), "njk");
    for (const h of findLiteralCopies(text, ORACLE_SAMEAS)) {
      fail(
        `模板 ${rel} 第 ${h.line} 行把身份 URL ${h.url} **写成了字面量**——` +
          `身份链接必须从 scripts/lib/identity.cjs 派生；模板里烤死一份就是` +
          `站点上的第二份身份清单（数据源是干净的，页面却已经不指向本人了）。`
      );
    }
  }
} catch (e) {
  fail(`扫不到 src/ 下的 .njk 模板（${e.message}）——模板层这条判据没跑起来，直接判红。`);
}

/* ---------- 自证存活：一条都没查 = 判据本身没生效 ---------- */
if (siteSource && siteChecked !== EXPECTED_COUNT) {
  fail(
    `数据源层只查了 ${siteChecked} 条身份 URL（应为 ${EXPECTED_COUNT} 条）——` +
      `期望集被改动了，本条没有生效。`
  );
}
if (templateFiles && templateChecked !== EXPECTED_COUNT) {
  fail(
    `模板层只查了 ${templateChecked} 条身份 URL（应为 ${EXPECTED_COUNT} 条）——` +
      `期望集被改动了，本条没有生效。`
  );
}

if (problems.length) {
  console.error("身份派生门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `身份派生门禁通过：数据源（src/_data/site.js）与模板层（${templateFiles} 个 .njk）里，` +
    `${ORACLE_SAMEAS.length} 条身份 URL **没有一条**以字面量出现` +
    `（页面可见链接与 sameAs 全部派生自 scripts/lib/identity.cjs，站点只有一份身份清单）。`
);
