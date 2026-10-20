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
 * 扫描面（**载体清单**，同一族问题；清单与判据写在 ID6 段）：
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

/* ---------- ID6：载体清单 —— 扫描面必须与仓库现状一致 ----------
   为什么要有这条（2026-10-19 实测，不是假想）：
     本门禁的"找字面量"只查三个**写死**的载体（site.js / .njk 模板 /
     eleventy.config.js）。但仓库里**当时就存在** 4 个同样能承载身份 URL 的
     文件，它们**完全不在扫描面内**：
       src/content/blog/blog.11tydata.cjs
       src/content/papers/papers.11tydata.cjs
       src/content/portfolio/portfolio.11tydata.cjs
       src/eleventy-helpers.cjs
     .11tydata.cjs 是 Eleventy 的**目录数据文件**（给整个目录树提供
     front-matter），它的字段直接进模板 → 在里面烤死一条身份 URL，
     数据源与模板都干净，产物里却多出**第二份身份清单**——而本门禁全绿，
     通过文案还写着"数据源、模板层、构建配置层里没有一条以字面量出现"。
     与 2026-10-19 那次「数据源层判据是死的」是同一族，但**高一层**：
       那次是**判据自己不可能触发**；这次是**判据能触发、但它声称的覆盖面
     是假的**（读者会以为全仓都查过了）。
   所以 ID6 做三件事：
     ID6a 清单里的每个载体家族**必须非空** —— 某一族一个文件都没有，
          说明这一族载体已经消失/改名，扫描面可能已经悄悄失效。
     ID6b **候选载体必须都被认领** —— 在 Eleventy 的目录 + src 顶层 +
          仓库根里，凡是"可能承载身份 URL"的文件必须落在清单的某个家族里；
          落不进去就判红（"这个文件里的身份字面量不受管"）。
     ID6c 清单与实际扫描面**必须一致** —— 清单不能漏掉已经扫过的文件
          （那说明清单写错了），清单里的文件也必须真的被扫过。
   ⚠️ 显式豁免（写在这里，不只写在日志里）：
     · `.md`（正文页，如 src/content/about.md）**不在扫描面内** —— 那里有
       一条身份 URL 字面量，属并发场次已登记的**待拍板 10**，且该文件
       markdownTemplateEngine:false。**本门禁不代拍**：将来拍板后删掉这一行。
     · `.css` / 其它非代码扩展名（样式表、图片、纯文本）不是身份清单载体
       （里面的 URL 是资源地址，不是身份句柄）。 */
const CARRIER_EXTS = new Set([
  ".js", ".cjs", ".mjs", ".json", ".yaml", ".yml", ".njk", ".liquid", ".html",
]);
const TEMPLATE_EXTS = new Set([".njk", ".liquid", ".html"]);
const EXEMPT_EXTS = new Map([
  [".md", "待拍板 10：正文页里的身份 URL 字面量不在本门禁扫描面内（本门禁不代拍）"],
  [".css", "样式表不是身份清单载体（里面的 URL 是资源地址）"],
]);
/* 系统垃圾文件：已被 .gitignore 忽略（不跟踪），但**会出现在磁盘上**，
   listFiles 照样看得见 → 必须在门禁里显式排除，否则：
     ① 清单计数随本机 Finder 行为漂移（实测 M0 27 个 → M5 28 个）；
     ② 它们会被家族"认领"，进而在 ID6c 里成为"声称被管、实际不查"的文件。
   按**文件名**排除（不按扩展名）：path.extname(".DS_Store") 返回 ""，
   按扩展名判断会漏掉。 */
const JUNK_BASENAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".gitkeep"]);

/* 递归 / 非递归列文件；只收普通文件，目录本身不算载体 */
function listFiles(dir, recursive) {
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (recursive) out.push(...listFiles(p, true));
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

/* 载体家族清单：改这一处就改了扫描面（清单即账本，不是声明） */
const CARRIER_FAMILIES = [
  {
    id: "数据源层",
    files: () => listFiles(path.join(ROOT, "src/_data"), true),
  },
  {
    id: "目录数据层",
    files: () =>
      listFiles(path.join(ROOT, "src/content"), true).filter((f) =>
        /\.11ty/.test(path.basename(f))
      ),
  },
  {
    id: "模板层",
    files: () => listFiles(SRC, true).filter((f) => TEMPLATE_EXTS.has(path.extname(f))),
  },
  {
    id: "构建辅助层",
    files: () =>
      listFiles(SRC, false).filter((f) => /\.(js|cjs|mjs)$/.test(path.basename(f))),
  },
  {
    id: "构建配置层",
    files: () => [ELEVENTY_CONFIG],
  },
];

/* 按扩展名选遮罩：不同载体的注释语法不同 */
const maskYamlComments = (text) =>
  text.replace(/^\s*#[^\n]*/gm, (m) => m.replace(/[^\n]/g, " "));
const maskFor = (file) => {
  const ext = path.extname(file);
  if (ext === ".njk" || ext === ".liquid" || ext === ".html") return maskTemplateComments;
  if (ext === ".yaml" || ext === ".yml") return maskYamlComments;
  if (ext === ".json") return (t) => t; // JSON 语法里没有注释
  return maskJsComments;
};

const familyFiles = new Map(); // 绝对路径 → 家族 id
for (const fam of CARRIER_FAMILIES) {
  let files = [];
  try {
    files = fam.files();
  } catch (e) {
    fail(`载体家族「${fam.id}」列文件失败（${e.message}）——本门禁没有完整判断对象，直接判红。`);
    continue;
  }
  /* ID6a：家族必须非空 */
  if (!files.length) {
    fail(
      `载体家族「${fam.id}」一个文件都没有 —— 这一族载体已经消失或改名，` +
        `扫描面可能已经悄悄失效（门禁还在按老清单跑）。`
    );
  }
  for (const f of files) {
    if (JUNK_BASENAMES.has(path.basename(f))) continue; // 系统垃圾文件不是载体
    if (!familyFiles.has(f)) familyFiles.set(f, fam.id);
  }
}

/* ID6b：候选载体必须都被认领 */
const claimRoots = [
  { dir: path.join(ROOT, "src/_data"), recursive: true },
  { dir: path.join(ROOT, "src/_includes"), recursive: true },
  { dir: path.join(ROOT, "src/content"), recursive: true },
  { dir: SRC, recursive: false },
];
const exemptByExt = new Map(); // 扩展名 → 豁免文件集合（用集合去重，避免两处重复计数）
const markExempt = (file) => {
  const ext = path.extname(file) || "（无扩展名）";
  if (!exemptByExt.has(ext)) exemptByExt.set(ext, new Set());
  exemptByExt.get(ext).add(file);
};
for (const root of claimRoots) {
  for (const file of listFiles(root.dir, root.recursive)) {
    if (JUNK_BASENAMES.has(path.basename(file))) continue; // 系统垃圾文件不是候选载体
    const ext = path.extname(file);
    if (!CARRIER_EXTS.has(ext)) {
      if (EXEMPT_EXTS.has(ext)) markExempt(file);
      continue; // 非候选扩展名（.md/.css/图片…）→ 按文件头登记的豁免放行
    }
    if (familyFiles.has(file)) continue; // 已被某个家族认领
    const rel = path.relative(ROOT, file);
    fail(
      `载体 ${rel} 不在任何已登记的载体家族里 —— 里面的身份 URL 字面量**不受本门禁管**` +
        `（本门禁只查清单里的文件；这份清单在 scripts/check-identity-derivation.cjs 的` +
        ` CARRIER_FAMILIES）。要么把它登记进某个家族（改 CARRIER_FAMILIES 一处），` +
        `要么把它挪到不受 Eleventy 管线处理的位置。`
    );
  }
}
/* 仓库根：只认 eleventy.config.* —— 别的根级 .js（postcss 之类）与身份清单无关 */
for (const file of listFiles(ROOT, false)) {
  if (!/^eleventy\.config\./.test(path.basename(file))) continue;
  if (familyFiles.has(file)) continue;
  fail(
    `构建配置 ${path.relative(ROOT, file)} 不在载体清单里 —— 它同样参与构建，` +
      `身份 URL 写在这里不会被本门禁发现。请登记进 CARRIER_FAMILIES（或改用` +
      ` eleventy.config.js）。`
  );
}

/* ID6c：清单与实际扫描面必须一致 —— 清单不能漏掉已经扫过的文件 */
const alreadyScanned = new Set();
if (siteSource) alreadyScanned.add(SITE_JS);
try {
  for (const f of listNjkFiles(SRC)) alreadyScanned.add(f);
} catch (e) {
  /* 上面 ID4 段已经判过红了，这里不再重复报 */
}
alreadyScanned.add(ELEVENTY_CONFIG);
for (const f of alreadyScanned) {
  if (!familyFiles.has(f)) {
    fail(
      `载体清单漏掉了正在被扫描的文件 ${path.relative(ROOT, f)} —— ` +
        `清单与实际扫描面不一致，清单不能作为"覆盖范围"来读。`
    );
  }
}

/* ID6c（续）：清单里**每个**文件都要真的接受"不许抄字面量"的检查
   ⚠️ 这里自己踩过一次洞（2026-10-19 实测，**低一层的"假保证"**）：
     家族认领是按**目录**收的（如 数据源层 = src/_data 下所有文件），
     而"逐字检查"是按**扩展名**筛的。两者之间的差集 = "清单说它被管、
     实际没人查"的文件。实测：src/_data/notes.txt 里烤死一条身份 URL →
     它被数据源层认领（清单里有它）→ 但 .txt 不在候选扩展名里 → 没被扫 →
     门禁 **exit 0**（通过文案还写着"载体清单里的文件里没有一条以字面量出现"）。
     修法：认领了就必须被扫；扫不了的必须**逐个**在 EXEMPT_EXTS 里登记理由，
     否则判红（"要么把它的扩展名加进候选集，要么登记豁免"）。 */
let carrierScanned = 0;
for (const [file, famId] of familyFiles) {
  if (alreadyScanned.has(file)) continue; // ID1/ID4/ID5 已经扫过
  const ext = path.extname(file);
  if (!CARRIER_EXTS.has(ext)) {
    if (EXEMPT_EXTS.has(ext)) {
      markExempt(file);
      continue; // 登记在案的显式豁免
    }
    fail(
      `载体 ${path.relative(ROOT, file)}（${famId}）**在载体清单里，却不受检查** —— ` +
        `它的扩展名 ${ext || "（无）"} 不在候选集里，本门禁不会读它；` +
        `清单说它被管，实际没人查（身份 URL 写在这里不会被发现）。` +
        `要么把 ${ext || "该扩展名"} 加进 CARRIER_EXTS，要么在 EXEMPT_EXTS 里登记豁免理由。`
    );
    continue;
  }  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (e) {
    fail(`读不到载体 ${path.relative(ROOT, file)}（${e.message}）——该载体没被检查，直接判红。`);
    continue;
  }
  carrierScanned++;
  const rel = path.relative(ROOT, file);
  for (const h of findLiteralCopies(maskFor(file)(text), ORACLE_SAMEAS)) {
    fail(
      `载体 ${rel}（${famId}）第 ${h.line} 行把身份 URL ${h.url} **写成了字面量**——` +
        `这个文件在 ID6 的载体清单里，身份清单的真源是 scripts/lib/identity.cjs；` +
        `在这里烤死一份就是站点上的第二份身份清单（改一处忘另一处会静默漂移）。`
    );
  }
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

/* 豁免说明按扩展名逐类给出（数量与理由都从实际集合算，不手写）——
   写死"另有 2 个 .md"这类文案，会在豁免集合变化时变成"日志说假话"。 */
const exemptSummary =
  [...exemptByExt.entries()]
    .map(([ext, set]) => {
      const reason = EXEMPT_EXTS.get(ext) || "未登记理由（不该出现）";
      return `${set.size} 个 ${ext}（${reason}）`;
    })
    .join("；") || "无";
const familySummary = [...new Set(familyFiles.values())].join(" / ");

console.log(
  `身份派生门禁通过：数据源（src/_data/site.js）、模板层（${templateFiles} 个 .njk）、` +
    `构建配置层（eleventy.config.js）与 ID6 载体清单里的另外 ${carrierScanned} 个载体文件里，` +
    `${ORACLE_SAMEAS.length} 条身份 URL **没有一条**以字面量出现` +
    `（页面可见链接与 sameAs 全部派生自 scripts/lib/identity.cjs，站点只有一份身份清单）。` +
    `载体清单共 ${familyFiles.size} 个文件（${familySummary}），其中 ${carrierScanned} 个被逐字检查；` +
    `不在扫描面内的显式豁免：${exemptSummary}。`
);
