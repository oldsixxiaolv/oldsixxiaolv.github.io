#!/usr/bin/env node
/**
 * check-lang · 文本层检查：语言一致性 + 编码损坏
 *
 * 为什么需要它：站点早已明文统一为英文（见 src/_data/site.js 的 locale 说明），
 * 但中文是**逐处漏网**的，而且每一处单看都"像那么回事"，不会让构建失败、
 * HTTP 也不会 404，只能靠人眼发现：
 *   ① theme.js 把主题按钮的 aria-label 覆写成"切换到深色模式"，而静态 HTML
 *      写的是英文——同一个按钮的可访问名取决于 JS 跑没跑；
 *   ② blog.njk 的阅读时长写作"{{ readingTime }} 分钟"——英文站里的中文词；
 *   ③ detail.njk 的翻页是"← 上一篇 / 篇下 / 回到博客"；
 *   ④ annotations.js 的 aria 标签里混着全角括号与全角冒号。
 * 这正是 scripts/check-css-braces.cjs 当初要拦的那一类**静默错误**：
 * 坏掉的不是"能不能跑"，而是"跑出来的东西对不对"。
 *
 * 扫描面（= 用户看得见的文本）：
 *   源文件层  src 下的 .njk / .md / .css / .js / .svg（逐个后缀匹配）
 *   产物层    _site 下的 .html
 *
 * 豁免（各有明确理由，不是留口子）：
 *   · src/_data/**  —— 数据层。site.js 刻意保留中文身份字段（alternateName /
 *     affiliation / affiliations[].name …），那正是它们该待的地方；数据层的
 *     中文不进正文，产物层扫描会兜住漏进来的。
 *   · 各类注释 —— YAML front matter 的整行注释、Nunjucks 的 {# #}、
 *     HTML 的 <!-- -->、CSS 的块注释、JS 的行注释：全都不渲染，逐类剥掉再扫。
 *     ⚠️ front matter 只剥**整行**注释，值保留：title / description 是要渲染
 *     进 <title> 和 <meta name="description"> 的，属于用户可见文本。
 *   · .cjs 与 scripts 目录 —— 构建工具链，不进产物。
 *   · src/assets/img/og/*.svg —— 三张 OG 分享图里的中文是**品牌文案**
 *     （署名「吕亦航」+ 中文格言 + 中文单位），属本人拍板范畴，已列入
 *     IMPROVEMENT-LOG 的待决策段；其它 SVG（favicon 等）仍纳入门禁。
 *   · src/robots.njk —— **2026-10-20 起不再豁免**（见 D35）。
 *     此前豁免的理由是「门禁 17 / 20 以其中的中文标记「生成时间」为锚点」——
 *     那等于把本门禁要守的硬约束「站内文字一律英文」**反向锁死**：
 *     一按硬约束把 robots.txt 英文化，那两条门禁就先红，而红因
 *     "找不到「生成时间」这一行"与"我把注释改成英文了"毫无字面关联。
 *     门禁 17 / 20 已改锚在结构化 key `# generated-at:` 上，产物行也已英文化
 *     ⇒ 这条豁免已无必要；再把它加回来就等于「硬约束在 robots.txt 上无人守」。
 *
 * 扫描面的分工：
 *   本门禁的**产物层只扫 .html** —— 非 HTML 的对外出口（robots.txt /
 *   feed.xml / publications.bib / publications.ris / sitemap.xml）由
 *   scripts/check-site-language.cjs（判据 TX1）负责，别把责任推回这里。
 *   产物里的内联 <script> / <style> 块**本门禁也不扫**（它们被剥成空白）：
 *   那是 check-block-language.cjs（BL*）的职责范围。
 *
 * 第二项：U+FFFD（编码损坏）。本项目已发现 3 处——site.js / about.md /
 *   verify-site.cjs 各一处中文被写坏成 "�"。它们都在注释里，不影响运行，
 *   但**没有任何构建步骤会报**，而且会让后来 grep 中文的人以为仓库里有病句。
 *   既然已经在扫文件，顺手一起报。
 *
 * 判据（编号 LG*，与 verify-site.cjs 的数字编号、check-a11y.cjs 的 A*、
 *       check-wrapping.cjs 的 W*、check-gates-wired.cjs 的 GW*、
 *       check-tool-routes.cjs 的 RT* 都不续接；LG 前缀全仓此前零占用）：
 *   LG1 源文件层出现中日韩字符
 *   LG2 产物层出现中日韩字符
 *   LG3 源文件层出现 U+FFFD 替换字符（编码损坏）
 *   LG4 产物层出现 U+FFFD 替换字符（编码损坏）
 *   LG5 **自证存活（源文件层）**：源文件层必须真的扫到文件；一个都没扫到 ⇒ 判红
 *   LG6 **产物层必须真的在场**：_site 不存在 ⇒ 判红（产物层压根没被扫过）
 *   LG7 **自证存活（产物层）**：_site 在场但一个 .html 都没扫到 ⇒ 判红
 *   ⚠️ LG5 / LG6 / LG7 是 2026-10-21 D59 第三批**补上的**，守的是
 *     「门禁在这一层是**空跑**」——空跑的门禁等于没有门禁。
 *     补之前：_site 不存在时本门禁只打一行「产物层未扫描」就**判绿通过**；
 *     SOURCE_EXTS 一旦被改空（源文件层一个都扫不到）也一样是「0 个 ⇒ 绿」。
 *     两种坏法的**修法不同**（前者是"没构建"，后者是"筛选器坏了"）⇒ 分号。
 *   ⚠️ LG1 与 LG3 在**同一行**上互斥（先判 CJK）：一行里既有中文又有 U+FFFD
 *     时只报 LG1。这是"一处一行只报一件事"的取舍，不是漏判。
 *
 * 用法：node scripts/check-lang.cjs   （有错 exit 1）
 *      ⚠️ 本门禁在 build 链里位于 eleventy **之后**（产物层才有东西可扫），
 *        单独在没构建的仓库上跑会判 LG6 —— 那是对的，不是故障。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const SITE = path.join(ROOT, "_site");

/* 判据开关：每条判据一个常量，**恒为 true**。
   它不是运行期后门，是给 scripts/test-lang.cjs 一个「在副本上卸掉某条判据」的把手 ——
   自测要证明「每条判据的红确实来自它自己」，唯一可靠的证明就是把那一条判据卸掉，
   看对应的注入是否转绿（**副本**上的事，仓库原件一个字节都不动）。 */
const LG1_ON = true;
const LG2_ON = true;
const LG3_ON = true;
const LG4_ON = true;
const LG5_ON = true;
const LG6_ON = true;
const LG7_ON = true;

/* 判据开关表：编号 → 开关。 */
const LG_ON = {
  LG1: LG1_ON,
  LG2: LG2_ON,
  LG3: LG3_ON,
  LG4: LG4_ON,
  LG5: LG5_ON,
  LG6: LG6_ON,
  LG7: LG7_ON,
};

// 中日韩文字 + 全角标点（U+FF00–FFEF 段也含 U+FFFD，本身会被下面单独报）
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;
const FFFD = /\ufffd/; // U+FFFD 替换字符

// front matter：只到第一个收尾的 --- 为止
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?=\r?\n|$)/;
const YAML_COMMENT_LINE = /^[ \t]*#[^\n]*/gm;
const NJK_COMMENT = /\{#[\s\S]*?#\}/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const JS_LINE_COMMENT = /^[ \t]*\/\/[^\n]*/gm;
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script>/gi;
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style>/gi;

const SOURCE_EXTS = new Set([".njk", ".md", ".css", ".js", ".svg"]);

// 豁免目录（理由见文件头）
const SOURCE_EXCLUDE = [
  path.join(SRC, "_data"), // 数据层：刻意保留中文身份字段
  path.join(SRC, "assets", "img", "og"), // OG 品牌文案：待本人拍板
];

// 豁免单文件（逐个写明理由，不搞"整个目录不看"）
// ⚠️ src/robots.njk 曾在此豁免，2026-10-20（D35）已删除：门禁 17 / 20 原以
//   中文标记「生成时间」为锚点 ⇒ 反向锁死「站内文字一律英文」；
//   两处锚点已改用结构化 key `# generated-at:`，src/robots.njk 的产物行已英文化。
//   ⇒ 现在它**必须**被本门禁扫到；再把它加回来就是「硬约束在 robots.txt 上无人守」。
const SOURCE_EXCLUDE_FILES = [];

function* walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of entries) {
    // ⚠️ 必须跳过 `._*`：本项目在外接 exFAT 盘上开发，macOS 会给每个文件
    // 留一份 AppleDouble 资源叉（`._pages.css`），它也以原扩展名结尾、
    // 且是二进制——脚本会指向用户从没写过的文件，极具误导性。
    if (e.name.startsWith("._")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

function isExcluded(p) {
  if (SOURCE_EXCLUDE_FILES.includes(p)) return true;
  return SOURCE_EXCLUDE.some((d) => p === d || p.startsWith(d + path.sep));
}

/** 把一段文本涂白但保留换行 —— 行号必须对得上，报错才指得准 */
function blank(s) {
  return s.replace(/[^\n]/g, " ");
}

function strip(src, kind) {
  let out = src;
  if (kind === "njk" || kind === "md") {
    out = out.replace(FRONT_MATTER, (block) => block.replace(YAML_COMMENT_LINE, blank));
    out = out.replace(NJK_COMMENT, blank);
    out = out.replace(HTML_COMMENT, blank);
    out = out.replace(SCRIPT_BLOCK, blank);
    out = out.replace(STYLE_BLOCK, blank);
  } else if (kind === "css") {
    out = out.replace(CSS_COMMENT, blank);
  } else if (kind === "js") {
    out = out.replace(CSS_COMMENT, blank);
    out = out.replace(JS_LINE_COMMENT, blank);
  } else if (kind === "svg") {
    out = out.replace(HTML_COMMENT, blank);
  } else if (kind === "html") {
    out = out.replace(HTML_COMMENT, blank);
    out = out.replace(SCRIPT_BLOCK, blank);
    out = out.replace(STYLE_BLOCK, blank);
  }
  return out;
}

/** 数字实体先解回字符再判：产物里出现 &#x4e2d; 也算中文 */
function decodeEntities(s) {
  return s.replace(/&#(x[0-9a-fA-F]+|[0-9]+);/g, (m, g) => {
    const cp = g[0].toLowerCase() === "x" ? parseInt(g.slice(1), 16) : parseInt(g, 10);
    return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}

let failed = 0;
let scanned = 0;
let scannedSrc = 0;
let scannedSite = 0;

/**
 * 扫一个文件。
 * @param layer "src" | "site" —— 决定判据编号（源文件层 LG1/LG3，产物层 LG2/LG4）。
 */
function check(file, kind, label, layer) {
  const cjkId = layer === "src" ? "LG1" : "LG2";
  const fffdId = layer === "src" ? "LG3" : "LG4";
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (_) {
    return; // 读不动的文件（权限/编码）不归本门禁管
  }
  scanned++;
  if (layer === "src") scannedSrc++;
  else scannedSite++;
  const text = decodeEntities(strip(raw, kind));
  const rel = path.relative(ROOT, file);
  text.split("\n").forEach((line, i) => {
    if (CJK.test(line)) {
      if (!LG_ON[cjkId]) return;
      failed++;
      console.error(`  ✗ 门禁 ${cjkId}：${rel}:${i + 1}  ${label}里出现中日韩字符`);
      console.error(`    ${line.trim().slice(0, 110)}`);
      console.error(
        `    → 全站已统一为英文（见 src/_data/site.js 的 locale 说明）：界面文案一律用英文。`
      );
    } else if (FFFD.test(line)) {
      if (!LG_ON[fffdId]) return;
      failed++;
      console.error(`  ✗ 门禁 ${fffdId}：${rel}:${i + 1}  出现 U+FFFD 替换字符（编码损坏）`);
      console.error(`    ${line.trim().slice(0, 110)}`);
      console.error(
        `    → 坏字节被解码后的残骸：不会让构建失败，但 grep 中文时会当成病句；按上下文改回原字。`
      );
    }
  });
}

// —— 源文件层 ——
for (const file of walk(SRC)) {
  if (isExcluded(file)) continue;
  const ext = path.extname(file).toLowerCase();
  if (!SOURCE_EXTS.has(ext)) continue;
  check(file, ext.slice(1), "模板/样式/脚本", "src");
}

/* —— LG5：源文件层自证存活 ——
   源文件层一个文件都没扫到 ⇒ 这一层是**空跑**。空跑的门禁等于没有门禁：
   "没报错"和"没问题"长得一模一样。 */
if (scannedSrc === 0) {
  if (LG_ON.LG5) {
    failed++;
    console.error(
      `  ✗ 门禁 LG5：源文件层一个文件都没扫到（${SRC} 下没有 .njk / .md / .css / .js / .svg）——`
    );
    console.error(
      `    → 这一层是**空跑**：筛子坏了（后缀集合被改空 / 目录被搬走）时，"没报错"会被读成"没问题"。`
    );
  }
}

// —— 产物层 ——
if (!fs.existsSync(SITE)) {
  /* —— LG6：产物层必须真的在场 ——
     补之前这里只打一行「产物层未扫描」就判绿通过 ⇒ 产物层可以被静默跳过。 */
  if (LG_ON.LG6) {
    failed++;
    console.error(`  ✗ 门禁 LG6：找不到产物目录 ${SITE} —— 产物层从未被扫过。`);
    console.error(
      `    → 本门禁在 build 链里位于 eleventy **之后**；产物层没被扫时，"通过"是**空跑**。`
    );
  }
} else {
  for (const file of walk(SITE)) {
    if (path.extname(file).toLowerCase() !== ".html") continue;
    check(file, "html", "产物页面", "site");
  }
  /* —— LG7：产物层自证存活 ——
     _site 在场却一个 .html 都没有 ⇒ 产物层是**空跑**。 */
  if (scannedSite === 0) {
    if (LG_ON.LG7) {
      failed++;
      console.error(`  ✗ 门禁 LG7：产物目录 ${SITE} 在场，但一个 .html 都没扫到 —— 产物层是**空跑**。`);
      console.error(
        `    → 产物层被静默跳过时，"通过"会被读成"页面里没有中文"——那不是事实。`
      );
    }
  }
}

if (failed) {
  console.error(`\n文本检查失败：${failed} 处问题（扫描 ${scanned} 个文件）`);
  process.exit(1);
}
console.log(
  `文本检查通过（语言一致性 + 编码损坏；门禁 LG1–LG7；扫描 ${scanned} 个文件）`
);
