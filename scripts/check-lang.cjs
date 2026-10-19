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
 *   · src/robots.njk —— 产物是 robots.txt（给爬虫读的纯文本），# 行按 robots.txt
 *     约定是给维护者看的注释；而门禁 17 / 20 又以其中的中文标记「生成时间」为锚点。
 *     单列豁免，理由写在 SOURCE_EXCLUDE_FILES 旁边。
 *
 * 第二项：U+FFFD（编码损坏）。本项目已发现 3 处——site.js / about.md /
 * verify-site.cjs 各一处中文被写坏成 "�"。它们都在注释里，不影响运行，
 * 但**没有任何构建步骤会报**，而且会让后来 grep 中文的人以为仓库里有病句。
 * 既然已经在扫文件，顺手一起报。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const SITE = path.join(ROOT, "_site");

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
const SOURCE_EXCLUDE_FILES = [
  // src/robots.njk：产物是 robots.txt（纯文本、给爬虫读），不是给人看的页面。
  //   它的 # 行按 robots.txt 约定是给维护者看的注释（模板里明说"保留在生产输出中"），
  //   而站点门禁 17 / 20（scripts/verify-site.cjs）**以其中的中文标记「生成时间」为锚点**
  //   ——把这一行英文化会直接把那两条门禁打红，属于跨门禁的连带改动，不该由本门禁顺手做。
  path.join(SRC, "robots.njk"),
];

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

function check(file, kind, label) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf-8");
  } catch (_) {
    return; // 读不动的文件（权限/编码）不归本门禁管
  }
  scanned++;
  const text = decodeEntities(strip(raw, kind));
  const rel = path.relative(ROOT, file);
  text.split("\n").forEach((line, i) => {
    if (CJK.test(line)) {
      failed++;
      console.error(`  ✗ ${rel}:${i + 1}  ${label}里出现中日韩字符`);
      console.error(`    ${line.trim().slice(0, 110)}`);
      console.error(
        `    → 全站已统一为英文（见 src/_data/site.js 的 locale 说明）：界面文案一律用英文。`
      );
    } else if (FFFD.test(line)) {
      failed++;
      console.error(`  ✗ ${rel}:${i + 1}  出现 U+FFFD 替换字符（编码损坏）`);
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
  check(file, ext.slice(1), "模板/样式/脚本");
}

// —— 产物层 ——
if (fs.existsSync(SITE)) {
  for (const file of walk(SITE)) {
    if (path.extname(file).toLowerCase() !== ".html") continue;
    check(file, "html", "产物页面");
  }
} else {
  console.log("  ! 产物层未扫描：_site 不存在（先构建）");
}

if (failed) {
  console.error(`\n文本检查失败：${failed} 处问题（扫描 ${scanned} 个文件）`);
  process.exit(1);
}
console.log(`文本检查通过（语言一致性 + 编码损坏；扫描 ${scanned} 个文件）`);
