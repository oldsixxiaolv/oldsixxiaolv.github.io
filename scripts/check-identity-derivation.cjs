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
 * 编号约定（⚠️ 两套编号域，不要混）：
 *   · ID1–ID5 = **本门禁的判据编号**（Identity-Derivation）。
 *   · scripts/test-gates-selfcheck.cjs 里的 D1–D6 = **自测脚本的用例编号**，
 *     与本门禁无关。本门禁原用 D1–D4，与自测脚本撞号 → 2026-10-19 改为 ID*。
 *
 * 扫描面（**三个载体**，同一族问题）：
 *   · ID1 数据源层：  src/_data/site.js
 *   · ID4 模板层：    src 下的 .njk 模板（实测 21 个）
 *   · ID5 构建配置层：eleventy.config.js（**sameAs 的发射点**在这里）
 *   ID4 的来历：只扫数据源时，模板里烤死一条身份 URL（peer 2026-10-19 16:5x
 *   实测的 W1：base.njk 里写死 "https://github.com/oldsixxiaolv"）→ 整条 build
 *   链 exit 0 全绿。数据源是干净的，页面却已经不指向本人了。
 *   ID5 的来历：同族的第三个载体——person.sameAs 的**赋值**在 eleventy.config.js
 *   （实测 910 行 `person.sameAs = [...A.sameAs]`）。那里烤死一条身份 URL，
 *   数据源与模板都干净，产物里的 sameAs 却多出一条。
 *   实测扩面零误伤：21 个 .njk 模板与 eleventy.config.js 里 5 条身份 URL
 *   一条都没以字面量出现（唯一沾边的 paper.njk:77 提到的是**代码仓** URL，
 *   见下面"只查完整字面量"）。
 *
 * ⚠️ 本门禁自己踩过的坑（2026-10-19 实测，**假保证**族）：
 *   旧的注释遮罩用一条"把行内两个斜杠到行尾整段吃掉"的正则，而**每一条绝对
 *   URL 里都有两个斜杠**（https://…）→ 遮罩把 URL 本身连同后面内容一起抹掉 →
 *   数据源层判据**结构上永远不可能命中**。实测：在 src/_data/site.js 里
 *   写死一条身份 URL，门禁仍 exit 0，并打印
 *   "5 条身份 URL **没有一条**以字面量出现" —— 一条**永远不会红**的判据
 *   给出了**看起来很确定的绿**。
 *   现在：① 遮罩改成**字符串感知**（字符串里的 // 不是注释）；
 *   ② 加一条**判据自证**（"这条判据结构上能不能触发"）——合成样例必须命中、
 *   注释里的必须不命中，任何一条不成立就**判红**（宁可 build 断，
 *   也不给假保证）。
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
const ELEVENTY_CONFIG = path.join(ROOT, "eleventy.config.js");

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

/* ---------- 注释遮罩 ----------
   两种载体两套语法：
   · JS：行注释（两个斜杠）、多行块注释（斜杠星号 … 星号斜杠），
     **字符串里的两个斜杠不是注释**（见下面 maskJsComments）
   · 模板：Nunjucks {# #}、HTML <!-- --> */
function maskTemplateComments(text) {
  const rules = [/\{#[\s\S]*?#\}/g, /<!--[\s\S]*?-->/g];
  return rules.reduce(
    (t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, " ")),
    text
  );
}

/* ---------- 字符串感知的 JS 注释遮罩 ----------
   按字符扫描，先认字符串（' " `），字符串整体跳过 —— 字符串里的 // 不是注释。
   只有字符串外的行注释与多行块注释才遮罩。
   ⚠️ 额外一条：行注释的 "//" 前面那个字符**不能是 ":"** ——
      每条绝对 URL 里都是 "https://"（斜杠前是冒号），不这么判的话
      URL 本身会被当成注释吃掉（2026-10-19 实测的那次假保证）。
   遮罩只把字符换成空格（保留换行）→ 行号与列位置不变，红因能报到"第几行"。 */
function maskJsComments(text) {
  const out = text.split("");
  const n = text.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const c = text[i];
    const c2 = i + 1 < n ? text[i + 1] : "";
    const prev = i > 0 ? text[i - 1] : "";
    if (c === "/" && c2 === "/") {
      if (prev === ":") {
        // 形如 "https://…" —— 斜杠是 URL 的一部分，不是注释。跳过一个字符继续。
        i += 2;
        continue;
      }
      let j = i;
      while (j < n && text[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const end = text.indexOf("*/", i + 2);
      const j = end === -1 ? n : end + 2;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === c) break;
        j++;
      }
      i = Math.min(j + 1, n); // 整段字符串原样保留（不改一个字符）
      continue;
    }
    i++;
  }
  return out.join("");
}

/* ---------- 找"被抄成字面量的身份 URL" ----------
   判据形状：整条 URL 必须**被引号包住**且引号内**没有多余内容**
   （允许末尾一个斜杠 —— 同一个 URL 的常见写法变体）。
   三种引号都认：' " ` —— 构建配置里反引号是惯用引号，只认前两种会直接漏。
   于是 "…/oldsixxiaolv/Manuscript_Lvyh"（代码仓）不会命中，
   "…/oldsixxiaolv"（身份句柄）会命中。 */
function findLiteralCopies(text, urls) {
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (const url of urls) {
    const needles = [
      `"${url}"`,
      `'${url}'`,
      `\`${url}\``,
      `"${url}/"`,
      `'${url}/'`,
      `\`${url}/\``,
    ];
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

/* ---------- ID0：判据自证 —— 这条判据**结构上能不能触发** ----------
   2026-10-19 实测：旧的 JS 遮罩把 URL 里的 "//" 当注释 → 数据源层判据
   永远不可能命中，而门禁一直打印"5 条身份 URL 没有一条以字面量出现"。
   一条**永远不会红**的判据给出**看起来很确定的绿**，比没有判据更坏。
   现在把"能不能触发"变成判据的一部分：合成样例（走**同一条**遮罩+匹配
   路径）必须命中、注释里的必须不命中，任何一条不成立 → 判红。 */
const SELF_TEST_URL = ORACLE_SAMEAS[1]; // GitHub 句柄
const SELF_TESTS = [
  {
    name: "字符串里的字面量必须命中",
    text: `const x = "${SELF_TEST_URL}";`,
    want: 1,
  },
  {
    name: "反引号形态必须命中",
    text: "const x = `" + SELF_TEST_URL + "`;",
    want: 1,
  },
  {
    name: "行注释里的必须不命中（注释豁免）",
    text: `// const x = "${SELF_TEST_URL}";`,
    want: 0,
  },
  {
    name: "块注释里的必须不命中（注释豁免）",
    text: `/* const x = "${SELF_TEST_URL}"; */`,
    want: 0,
  },
  {
    name: "字符串里的 // 不能吃掉同一行后面的字面量",
    text: `const s = "a//b"; const x = "${SELF_TEST_URL}";`,
    want: 1,
  },
];
for (const t of SELF_TESTS) {
  const got = findLiteralCopies(maskJsComments(t.text), ORACLE_SAMEAS).length;
  if (got !== t.want) {
    fail(
      `判据自证失败：${t.name} —— 期望命中 ${t.want} 条，实际 ${got} 条。` +
        `本门禁的"找字面量"这一步结构上已经失效，继续跑只会给出**假保证**。`
    );
  }
}

/* 遮罩层的断言：遮罩**只该吃掉注释**，不该吃掉 URL 本体。
   （检测器只看"带引号的字面量"，所以"URL 本体有没有被遮罩吃掉"必须在
     遮罩层单独断言 —— 否则这条性质没人看守。） */
const MASK_TESTS = [
  {
    name: "字符串里的 URL 本体不被吃掉",
    text: `const u = "${SELF_TEST_URL}";`,
    mustKeep: SELF_TEST_URL,
  },
  {
    name: "字符串外的 URL 本体不被吃掉（冒号规则）",
    text: "const u = https://example.com/path;",
    mustKeep: "https://example.com/path",
  },
  {
    name: "行注释里的 URL 被吃掉（注释豁免）",
    text: `// 文档里提到 ${SELF_TEST_URL}`,
    mustDrop: SELF_TEST_URL,
  },
];
for (const t of MASK_TESTS) {
  const masked = maskJsComments(t.text);
  if (t.mustKeep && !masked.includes(t.mustKeep)) {
    fail(
      `遮罩自证失败：${t.name} —— 遮罩把不该动的文本吃掉了（URL 本体消失）。` +
        `本门禁会因此**看不见**合法形态下的字面量。`
    );
  }
  if (t.mustDrop && masked.includes(t.mustDrop)) {
    fail(
      `遮罩自证失败：${t.name} —— 遮罩**没有**吃掉注释里的内容（注释豁免失效）。`
    );
  }
}

/* ---------- ID1：身份 URL 不得在 site.js 里以字面量出现 ---------- */
let siteChecked = 0;
let siteSource = "";
try {
  siteSource = fs.readFileSync(SITE_JS, "utf8");
} catch (e) {
  fail(`读不到 src/_data/site.js（${e.message}）——本门禁没有判断对象，直接判红。`);
}

if (siteSource) {
  siteChecked = ORACLE_SAMEAS.length;
  for (const h of findLiteralCopies(maskJsComments(siteSource), ORACLE_SAMEAS)) {
    fail(
      `src/_data/site.js 第 ${h.line} 行把身份 URL ${h.url} **写成了字面量**——` +
        `身份清单的真源是 scripts/lib/identity.cjs，页面上的身份链接必须从它派生` +
        `（否则就多出第二份清单，改一处忘另一处会静默漂移）。`
    );
  }

  /* ---------- ID2：真源必须真的被引用（结构上的另一半） ---------- */
  if (!/require\(\s*["'][^"']*lib\/identity\.cjs["']\s*\)/.test(siteSource)) {
    fail(
      `src/_data/site.js 没有 require 共享身份清单 scripts/lib/identity.cjs——` +
        `身份链接与 sameAs 就没有共同真源，本条的前提不成立。`
    );
  }
}

/* ---------- ID3：共享模块自身必须存在（锚失效即判红） ---------- */
if (!fs.existsSync(SHARED)) {
  fail(`共享身份清单 scripts/lib/identity.cjs 不存在——真源没了，本门禁无从判断。`);
}

/* ---------- ID4：模板层同样不许抄字面量（peer W1 的洞） ---------- */
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
    const text = maskTemplateComments(fs.readFileSync(file, "utf8"));
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

/* ---------- ID5：构建配置层同样不许抄字面量（sameAs 的发射点） ---------- */
let configChecked = 0;
try {
  const configSource = fs.readFileSync(ELEVENTY_CONFIG, "utf8");
  configChecked = ORACLE_SAMEAS.length;
  for (const h of findLiteralCopies(maskJsComments(configSource), ORACLE_SAMEAS)) {
    fail(
      `eleventy.config.js 第 ${h.line} 行把身份 URL ${h.url} **写成了字面量**——` +
        `这里正是 person.sameAs 的发射点（实测 910 行 person.sameAs = [...A.sameAs]）；` +
        `在这里烤死一份，数据源与模板都干净，产物里的 sameAs 却会多出一条。` +
        `身份 URL 必须从 scripts/lib/identity.cjs 派生。`
    );
  }
} catch (e) {
  fail(
    `读不到 eleventy.config.js（${e.message}）——构建配置层这条判据没有判断对象，直接判红。`
  );
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
if (configChecked !== EXPECTED_COUNT) {
  fail(
    `构建配置层只查了 ${configChecked} 条身份 URL（应为 ${EXPECTED_COUNT} 条）——` +
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
  `身份派生门禁通过：数据源（src/_data/site.js）、模板层（${templateFiles} 个 .njk）与` +
    `构建配置层（eleventy.config.js）里，${ORACLE_SAMEAS.length} 条身份 URL ` +
    `**没有一条**以字面量出现（页面可见链接与 sameAs 全部派生自` +
    ` scripts/lib/identity.cjs，站点只有一份身份清单）。`
);
