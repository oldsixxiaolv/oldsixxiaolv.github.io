#!/usr/bin/env node
/**
 * 门禁 CS1–CS8：**CSS 发布清单**必须与「源样式各自的角色」严格对齐
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   `eleventy.config.js` 的 assetGlobs 曾经用两条通配把源目录里的 CSS
 *   **原样直拷**进产物：
 *     · "src/assets/css/*.css"          —— 顶层 7 个文件全拷
 *     · "src/assets/css/components/*.css" —— 8 个文件全拷
 *   而这 15 个源文件里，**有 4 个的产物副本没有任何页面引用**：
 *     · tokens.css（8,164 B）/ base.css（6,448 B）/ paper-reader.css（14,003 B）
 *       —— 它们的**唯一消费路径**是模板里的 {% inlineCss %}（内联进 HTML，
 *         省一次往返）；独立副本纯属通配的副作用。
 *     · components/index.css（232 B）—— partial 顺序的**书面声明**
 *         （浏览器从不加载它：dev 模式的 hub 是 components.css，
 *           由 eleventy.after 钩子生成，里面才是 @import）。
 *   合计 28,847 B 的「访客下载得到、却没有任何页面引用」的文件。
 *
 *   更要紧的是**没有门禁守着「发布清单」**：
 *     · 源里新增一个 CSS，忘了在模板里引用 ⇒ 它照样进产物（死副本）；
 *     · 源里新增一个 CSS，模板里引用了，但构建清单漏了 ⇒ 页面样式 404，
 *       门禁却一句都不说。
 *   ⇒ 本门禁把「源 CSS 的角色」钉死：
 *     每个源样式**必须**有角色（内联 / 外链 / partial / 顺序声明），
 *     每个角色的样式**必须**（或**不得**）出现在产物里。
 *
 * D51 起（见 docs/DEFECT-BACKLOG.md）：门禁自己先犯过一次「把 dev 的需求
 *   当成 prod 的需求」的错 —— CS3 当时无条件要求 partial 出现在产物里，
 *   而 prod 的 components.css 是 concat 后的单文件，7 个分片（40,881 B）
 *   没有任何页面引用。于是**判据本身在要求发布死副本**。
 *   现在 partial 的发布规则**随产物形态走**：prod 不发布（CS2 拦），
 *   dev 必须发布（CS3 拦），模式从产物自身判（见下）。
 *
 * 八条判据（编号用独立字母体系 CS*，**不与既有前缀冲突**：
 *   CF* / CQ* / CV* / CW* / C1–C8 / DC* / DI* / DS* / GA* / GB* / GW* /
 *   HC* / IA* / ID* / IL* / IS* / JS* / JT* / LM* / LS* / LT* / MC* /
 *   MT* / NA* / NT* / PT* / RD* / SP* / SR* / ST* / TD* / TR* / TS* /
 *   TX* / AV* / AT* 均不同名）：
 *   CS1 **角色穷尽** —— src/assets/css/** 下每个 .css 都必须归入四类之一：
 *        inline（被模板 {% inlineCss "src/assets/css/X.css" %} 内联）
 *        link （被模板 <link> 指向）
 *        partial（components/ 下 `_` 前缀的组件分片）
 *        declared（components/index.css —— partial 顺序的书面声明）
 *      一个都归不进去 ⇒ 判红（它要么是没人用的死文件，要么是漏了引用）。
 *      ⚠️ 归类**先剥注释**再匹配：注释里的一句「见 xxx.css」不算引用。
 *   CS2 **死副本** —— 「不发布类」出现在产物里 ⇒ 判红（没人引用，却占着部署体积）。
 *      「不发布类」**随模式变**（见下）：
 *        · inline-only（被内联没外链）+ declared（顺序声明）—— 两种模式都不发布；
 *        · partial —— **只在 prod 不发布**（prod 的 components.css 是 concat
 *          后的单文件，分片本身没人请求）；dev 要发布（hub 按相对路径指向它）。
 *   CS3 **漏拷** —— 「发布类」没出现在产物里 ⇒ 判红（页面会拿它当 <link href>，
 *      直接 404；dev 下的 partial 缺失则 hub 的 @import 直接断）。
 *   CS4 **孤儿** —— 产物里出现源目录已经没有了的 CSS ⇒ 判红。
 *   CS5 **顺序真源不分叉** —— 磁盘上的 partial 清单、components/index.css 的
 *      @import 清单、eleventy.config.js 的 order 数组，三者必须**集合相同且
 *      同序**（DC3 只管集合，顺序没人管 ⇒ 渲染层级会悄悄变）。
 *   CS6 **覆盖度自证** —— 四类角色各至少比过一处；一处都没认到说明
 *      枚举器坏了，不是「没问题」。
 *   CS7 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   CS8 **模式判得出** —— 产物里必须有 components.css；没有它就判不出
 *      dev/prod，partial 该不该发布无从核对（CS2/CS3 会失去依据）。
 *
 * ================= dev / prod 模式：**从产物自身判** =================
 *   components.css 是双模合成产物：
 *     · prod = 7 个 partial 顺序 concat 后的单文件（**0 条 @import**）；
 *     · dev  = @import hub（浏览器按相对路径 ./components/ 去拉分片）。
 *   所以「产物里有没有 @import」本身就是模式的唯一可靠证据。
 *   ⚠️ 判据的取值范围必须与被检查方的实际行为**同源**：不读 process.argv
 *     （门禁跑在 build 链里，那时没有 --serve），不读 env（谁跑都可能不一样），
 *     更不去解析 eleventy.config.js 的清单 —— 只看产物自己的形态。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **不判 CSS 的内容对不对**（选择器是否有效、样式好不好看）——
 *     那是别的门禁与人的事；本门禁只管「谁该出现在产物里」。
 *   · **不判 dev 模式之外的东西** —— dev 产物里 partial 必须存在（CS3 覆盖），
 *     prod 产物里 partial 必须不存在（CS2 覆盖），两种形态都有判据。
 *   · **不判 components.css（合成产物）的内容** —— 它由 eleventy.after 钩子
 *     拼接/生成，源目录里没有对应文件；内容一致性由 CQ2 管。
 *   · **不判别的资源族**（JS / 图片 / 字体）—— 各有各的约定，混进来会误判。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR   —— 产物目录（默认 _site）
 *   PKG_PATH   —— package.json 的路径（默认仓库根的 package.json）
 *   REPO_ROOT  —— 仓库根（默认本文件所在目录的上一级）——
 *                 自测用它把「源」「模板」「产物」整体指向夹具站。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const REPO = process.env.REPO_ROOT ? path.resolve(process.env.REPO_ROOT) : ROOT;
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(REPO, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(REPO, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const CS1_ON = true;
const CS2_ON = true;
const CS3_ON = true;
const CS4_ON = true;
const CS5_ON = true;
const CS6_ON = true;
const CS7_ON = true;
const CS8_ON = true;

/* CS6 的覆盖度下限（只要本站还在，这四类角色每一类都得**比过至少一处**；
   一处都没有说明枚举器坏了，不是「没问题」）。
   ⚠️ 下限刻意取 1 而不是更大：下限取大会与其它判据**耦合** ——
   故意制造「少一个文件」这类缺陷形态时，覆盖度也会跟着红，
   于是同一档出现两条判据的编号，红因归属就不可判定了。 */
const MIN_INLINE = 1;
const MIN_LINK = 1;
const MIN_PARTIAL = 1;
const MIN_DECLARED = 1;

/* 合成产物：dev/prod 双模生成的 components.css（源目录里没有对应文件）。 */
const BUNDLE_REL = "components.css";
/* 顺序声明文件：partial 顺序的书面真源（浏览器从不加载它）。 */
const DECLARED_REL = "components/index.css";

const SRC_CSS = path.join(REPO, "src", "assets", "css");
const SRC_DIR = path.join(REPO, "src");
const PROD_CSS = path.join(SITE, "assets", "css");
const ELEVENTY = path.join(REPO, "eleventy.config.js");

const problems = [];
/** 记一条判红。id 是判据编号（CSn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}
function report() {
  console.error("CSS 发布清单门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：文件枚举 ================= */

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

/** 目录下的 .css 相对路径（正斜杠风格，排序，跳过 AppleDouble 资源叉）。 */
function cssRels(dir) {
  const out = [];
  for (const f of walk(dir)) {
    if (!f.toLowerCase().endsWith(".css")) continue;
    out.push(path.relative(dir, f).split(path.sep).join("/"));
  }
  out.sort();
  return out;
}

/* ================= 工具：剥注释（引用检测前必做） ================= */

/** 剥掉 Nunjucks 注释 {# … #} 与 HTML 注释 <!-- … -->。 */
function stripMarkupComments(src) {
  return src.replace(/\{#[\s\S]*?#\}/g, " ").replace(/<!--[\s\S]*?-->/g, " ");
}

/* ================= 工具：模板扫描 ================= */

/** 模板文件清单（src/ 下所有 .njk）。 */
function templateFiles() {
  return walk(SRC_DIR).filter((f) => f.toLowerCase().endsWith(".njk"));
}

/** 剥掉注释后的模板正文（拼成一个大字符串，逐条判据再从里面取）。 */
function templateCode() {
  const chunks = [];
  for (const f of templateFiles()) {
    let text;
    try {
      text = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    chunks.push(stripMarkupComments(text));
  }
  return chunks.join("\n");
}

/* ================= 事实采集 ================= */

if (!fs.existsSync(SRC_CSS)) {
  console.error("CSS 发布清单门禁未通过：\n");
  console.error(`  ✗ 找不到源 CSS 目录 src/assets/css —— 无法核对发布清单。`);
  console.error("");
  process.exit(1);
}
if (!fs.existsSync(PROD_CSS)) {
  console.error("CSS 发布清单门禁未通过：\n");
  console.error(`  ✗ 找不到产物 CSS 目录 ${PROD_CSS} —— 先构建产物再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const srcRels = cssRels(SRC_CSS);
const prodRels = cssRels(PROD_CSS);
const srcSet = new Set(srcRels);
const prodSet = new Set(prodRels);
const code = templateCode();

/* ---- dev / prod 模式：**从产物自身判** ----
 * components.css 是双模合成产物：
 *   prod = 7 个 partial 顺序 concat 后的单文件（0 条 @import）；
 *   dev  = @import hub（浏览器按相对路径 ./components/ 去拉分片）。
 * 「产物里有没有 @import」本身就是模式的唯一可靠证据 ⇒ 不读 process.argv
 * （门禁跑在 build 链里，那时没有 --serve）、不读 env、不解析构建清单。
 * 判不出模式时 siteMode = null ⇒ partial 的发布规则暂时无从核对（CS8 判红）。
 */
const bundleFile = path.join(PROD_CSS, BUNDLE_REL);
let siteMode = null; // "dev" | "prod" | null（判不出）
if (fs.existsSync(bundleFile)) {
  const bundleText = fs.readFileSync(bundleFile, "utf8");
  siteMode = /@import\s+url\(/.test(bundleText) ? "dev" : "prod";
}

/* ---- 角色 1：inline（被 {% inlineCss %} 内联） ---- */
const inlineSet = new Set();
{
  const re = /\{%\s*inlineCss\s+"([^"]+)"\s*%\}/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const p = m[1].split(path.sep).join("/");
    const prefix = "src/assets/css/";
    if (!p.startsWith(prefix)) continue;
    inlineSet.add(p.slice(prefix.length));
  }
}

/* ---- 角色 2：link（被模板 <link> 指向） ---- */
const linkSet = new Set();
{
  // 只认 <link> 标签里的 href；模板里 href 的值常写成
  // {{ '/assets/css/layout.css' | relUrl }}，取其中的字面量路径。
  const tagRe = /<link\b[^>]*>/gi;
  /* ⚠️ href 的值写成 `{{ '/assets/css/layout.css' | relUrl }}` ——
     **值里有单引号**。用 ["']([^"']*)["'] 去取会取到第一个单引号就停，
     整条 href 永远取不到 ⇒ 一个外链都认不出（CS6 会当场报出来）。
     所以这里只认双引号定界的属性值。 */
  const hrefRe = /href\s*=\s*"([^"]*)"/gi;
  const pathRe = /\/assets\/css\/([A-Za-z0-9_./-]+\.css)/;
  let tag;
  while ((tag = tagRe.exec(code)) !== null) {
    const inner = tag[0];
    hrefRe.lastIndex = 0;
    let h;
    while ((h = hrefRe.exec(inner)) !== null) {
      const mm = pathRe.exec(h[1]);
      if (!mm) continue;
      const rel = mm[1];
      if (!srcSet.has(rel)) continue; // components.css 等合成产物没有源文件
      linkSet.add(rel);
    }
  }
}

/* ---- 角色 3：partial（components/ 下 `_` 前缀的组件分片） ---- */
const partialSet = new Set();
const diskPartialNames = [];
for (const rel of srcRels) {
  const m = /^components\/(_[^/]+\.css)$/.exec(rel);
  if (!m) continue;
  partialSet.add(rel);
  diskPartialNames.push(m[1]);
}

/* ---- 角色 4：declared（partial 顺序的书面声明） ---- */
const declaredSet = new Set([DECLARED_REL]);

/* ---- 顺序真源三件：磁盘 partial / index.css 的 @import / order 数组 ---- */
const declaredNames = [];
{
  const hub = path.join(SRC_CSS, "components", "index.css");
  if (fs.existsSync(hub)) {
    const text = fs.readFileSync(hub, "utf8");
    const re = /@import\s+url\(\s*["']\.\/(_[^"']+\.css)["']\s*\)/g;
    let m;
    while ((m = re.exec(text)) !== null) declaredNames.push(m[1]);
  }
}
const orderNames = [];
{
  if (fs.existsSync(ELEVENTY)) {
    const text = fs.readFileSync(ELEVENTY, "utf8");
    const arr = /const\s+order\s*=\s*\[([^\]]*)\]/.exec(text);
    if (arr) {
      const re = /["']([^"']+)["']/g;
      let m;
      while ((m = re.exec(arr[1])) !== null) orderNames.push(m[1] + ".css");
    }
  }
}

/* ---- 派生集合（**随模式变化**） ---- */
/**
 * 发布类：必须出现在产物里。
 *   · 外链类（被 <link> 指向）—— 两种模式都必须发布；
 *   · partial —— **只在 dev 发布**：dev 的 components.css 是 @import hub，
 *     按相对路径 ./components/ 指向分片，缺一个就断；prod 的 components.css
 *     是 concat 后的单文件，分片本身没人请求（D51）。
 */
const publishSet = new Set([...linkSet]);
if (siteMode === "dev") for (const rel of partialSet) publishSet.add(rel);
/**
 * 不发布类：不得出现在产物里。
 *   · inline-only（被内联没外链）+ declared（顺序声明）—— 两种模式都不发布；
 *   · partial —— **只在 prod 不发布**（见上）。
 */
const nonPublishSet = new Set();
for (const rel of inlineSet) if (!linkSet.has(rel)) nonPublishSet.add(rel);
for (const rel of declaredSet) nonPublishSet.add(rel);
if (siteMode === "prod") for (const rel of partialSet) nonPublishSet.add(rel);

/* ================= CS1：角色穷尽 ================= */

if (CS1_ON) {
  for (const rel of srcRels) {
    const roles = [];
    if (inlineSet.has(rel)) roles.push("内联");
    if (linkSet.has(rel)) roles.push("外链");
    if (partialSet.has(rel)) roles.push("partial");
    if (declaredSet.has(rel)) roles.push("顺序声明");
    if (roles.length === 0) {
      fail("CS1",
        `源样式 src/assets/css/${rel} **归不进任何角色** —— ` +
          `它既没被模板 {% inlineCss %} 内联，也没被任何 <link> 指向，` +
          `也不是 components/ 下的 partial（\`_\` 前缀），也不是顺序声明文件。` +
          `这样的文件要么是没人用的死样式，要么是漏了在模板里引用它；` +
          `无论哪一种，它都不该原样出现在产物里。`
      );
    }
  }
}

/* ================= CS2：死副本（不发布类不得出现在产物） ================= */

if (CS2_ON) {
  for (const rel of [...nonPublishSet].sort()) {
    if (!prodSet.has(rel)) continue;
    const isPartial = partialSet.has(rel);
    const why = isPartial
      ? "prod 的 components.css 是 7 个 partial 顺序拼接后的**单文件**，" +
        "没有任何页面会去请求分片本身（dev 的 @import hub 才需要它们）"
      : rel === DECLARED_REL
        ? "它是 partial 顺序的书面声明，浏览器从不加载它"
        : "它被模板 {% inlineCss %} 内联进 HTML，内联才是它的唯一消费路径";
    const how = isPartial
      ? "请把它从 prod 的直拷清单里去掉 —— partial 只在 dev 直拷" +
        "（eleventy.config.js 里 `if (isDevServer)` 那一段）"
      : "请把它从构建的直拷清单里去掉（eleventy.config.js 的 assetGlobs）";
    fail("CS2",
      `产物 _site/assets/css/${rel} 是**没人引用的副本** —— ${why}。` +
        `它占着部署体积，却没有任何页面会去请求它。${how}。`
    );
  }
}

/* ================= CS3：漏拷（发布类必须出现在产物） ================= */

if (CS3_ON) {
  for (const rel of [...publishSet].sort()) {
    if (prodSet.has(rel)) continue;
    const why = partialSet.has(rel)
      ? "dev 模式的 components.css 是 @import hub，按相对路径 ./components/ 指向它，副本不在就断"
      : "模板用 <link> 指向它，副本不在就直接 404";
    const how = partialSet.has(rel)
      ? "请确认 eleventy.config.js 里 dev-only 的直拷那一段还在（partial 只在 dev 发布）"
      : "请把它加进 eleventy.config.js 的 assetGlobs 直拷清单";
    fail("CS3",
      `源样式 src/assets/css/${rel} **该出现在产物里却没有** —— ${why}。${how}。`
    );
  }
}

/* ================= CS4：孤儿（产物里的 CSS 必须有源） ================= */

if (CS4_ON) {
  for (const rel of prodRels) {
    if (rel === BUNDLE_REL) continue; // 合成产物，源目录里没有对应文件
    if (srcSet.has(rel)) continue;
    fail("CS4",
      `产物 _site/assets/css/${rel} **在源目录 src/assets/css/ 里已经不存在了** —— ` +
        `这是没人认领的残留副本（源文件删了、构建清单没跟着改）。`
    );
  }
}

/* ================= CS5：顺序真源不分叉 ================= */

if (CS5_ON) {
  const disk = [...diskPartialNames].sort();
  const decl = [...declaredNames].sort();
  const ord = [...orderNames].sort();
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(disk, decl)) {
    fail("CS5",
      `磁盘上的 partial 清单与 components/index.css 的 @import 清单**不一致** —— ` +
        `磁盘 ${disk.length} 个（${disk.join(" / ")}）vs 声明 ${decl.length} 个（${decl.join(" / ")}）。` +
        `两份真源对不上，拼接顺序与 dev 的 @import 顺序就会分叉。`
    );
  }
  if (!same(disk, ord)) {
    fail("CS5",
      `磁盘上的 partial 清单与 eleventy.config.js 的 order 数组**不一致** —— ` +
        `磁盘 ${disk.length} 个（${disk.join(" / ")}）vs order ${ord.length} 个（${ord.join(" / ")}）。` +
        `order 数组是拼接顺序的机器镜像，对不上就意味着有一份漏改。`
    );
  }
  if (declaredNames.length !== orderNames.length ||
      declaredNames.some((n, i) => n !== orderNames[i])) {
    fail("CS5",
      `components/index.css 的 @import 顺序与 eleventy.config.js 的 order 数组**不同序** —— ` +
        `声明 ${declaredNames.join(" → ")} vs order ${orderNames.join(" → ")}。` +
        `集合相同但顺序不同 ⇒ 渲染层级（nav → button → badge → card → list → paper → misc）会悄悄变。`
    );
  }
}

/* ================= CS6：覆盖度自证 ================= */

if (CS6_ON) {
  if (inlineSet.size < MIN_INLINE) {
    fail("CS6",
      `一个被内联的源样式都没认出（认出 ${inlineSet.size} 个）—— 枚举器可能坏了，不是「没问题」。`
    );
  }
  if (linkSet.size < MIN_LINK) {
    fail("CS6",
      `一个被 <link> 引用的源样式都没认出（认出 ${linkSet.size} 个）—— 枚举器可能坏了，不是「没问题」。`
    );
  }
  if (partialSet.size < MIN_PARTIAL) {
    fail("CS6",
      `一个 partial 都没认出（认出 ${partialSet.size} 个）—— 枚举器可能坏了，不是「没问题」。`
    );
  }
  if (declaredSet.size < MIN_DECLARED) {
    fail("CS6",
      `顺序声明文件没认出来（${DECLARED_REL}）—— 枚举器可能坏了，不是「没问题」。`
    );
  }
  if (prodRels.length === 0) {
    fail("CS6",
      `产物 _site/assets/css/ 一个文件都没认出来 —— 枚举器可能坏了，不是「没问题」。`
    );
  }
}

/* ================= CS7：门禁自己没被卸掉 ================= */

if (CS7_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("CS7", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
  }
  if (pkg) {
    const SCRIPTS = pkg.scripts || {};
    const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
    const seen = new Set();
    const queue = ["build"];
    while (queue.length) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      const cmd = SCRIPTS[name] || "";
      NPM_RUN_RE.lastIndex = 0;
      let m;
      while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
        if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
      }
    }
    const wired = Object.keys(SCRIPTS).filter(
      (n) => seen.has(n) && (SCRIPTS[n] || "").includes(SELF)
    );
    if (!wired.length) {
      fail("CS7", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= CS8：模式判得出 ================= */

if (CS8_ON) {
  if (siteMode === null) {
    fail("CS8",
      `产物 _site/assets/css/${BUNDLE_REL} 不存在（或读不出）—— ` +
        `判不出 dev/prod 模式，partial 该不该发布就无从核对` +
        `（prod 不许有、dev 必须有）。` +
        `请先构建产物再跑本门禁。`
    );
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

console.log(
  `CSS 发布清单门禁通过：源样式 ${srcRels.length} 个` +
    `（内联 ${inlineSet.size} / 外链 ${linkSet.size} / partial ${partialSet.size} / 顺序声明 ${declaredSet.size}）、` +
    `产物 ${prodRels.length} 个 —— **发布类与产物严格一致**：` +
    `没有没人引用的副本，也没有漏拷的样式。`
);
console.log(
  `  · 产物形态判为 **${siteMode === "dev" ? "dev（@import hub）" : "prod（concat 单文件）"}**` +
    `（依据：${BUNDLE_REL} 里${siteMode === "dev" ? "有" : "没有"} @import）`
);
console.log(
  `  · 发布清单：${[...publishSet].sort().join(" / ")}`
);
console.log(
  `  · 不发布（内联 / 顺序声明${siteMode === "prod" ? " / prod 的 partial" : ""}）：` +
    `${[...nonPublishSet].sort().join(" / ")}`
);
console.log(
  `  · 顺序真源三处一致（**声明顺序**，磁盘清单与 order 数组已核对为同序）：` +
    `${declaredNames.join(" → ")}`
);
console.log(
  `  · 判据出处：docs/DEFECT-BACKLOG.md D50（产物里的无人引用 CSS 副本）` +
    `与 D51（partial 只在 dev 发布，prod 不许留死副本）。`
);
