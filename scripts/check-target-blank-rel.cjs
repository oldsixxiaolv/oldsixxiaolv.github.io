#!/usr/bin/env node
/**
 * 门禁 GA1–GA6：新标签页打开的链接必须带 rel 安全属性（noopener + noreferrer）。
 *
 * 为什么要有这个门禁（一次注入实测坐实的看护缺口，不是假想）：
 *   `target="_blank"` 的链接会在**新标签页**里打开目标页面，而新标签页默认
 *   **持有 window.opener** —— 目标页面里的脚本可以反过来用
 *   `window.opener.location = "…"` 把本站这个标签页**导航走**
 *   （reverse tabnabbing：访客点了外链，回头一看自己的站点被换成了钓鱼页）。
 *   规范给的解法是 `rel="noopener"`（切断 opener）与 `rel="noreferrer"`
 *   （顺带不带 Referer）；两者都写成 **`rel="noopener noreferrer"`**。
 *
 *   本站的这一条安全属性此前**写在 8 个模板文件里、共 43 处**，
 *   而**全仓没有任何一道门禁覆盖它**：
 *     · `verify-site.cjs` 的通用引用正则只核**链接目标存在**，不核属性值；
 *     · `check-third-party.cjs` 只判**外域**（TD1），不判 rel；
 *     · `check-a11y.cjs` 只管可访问性；其余门禁与 rel 无关。
 *
 *   ⇒ **实测坐实**（本轮做的）：把产物复制到 /tmp，
 *     ① 把首页一个 `target="_blank"` 链接的 `rel` 属性**整个删掉**，
 *     ② 把关于页一个链接的 `rel` 改成只剩 `me`（两个保护 token 都没了），
 *     对该副本跑 **18 道产物侧门禁** ⇒ **18/18 全部 exit 0**，
 *     没有任何一道报告这件事。
 *
 *   这不是「产物现在有违规」：修之前实测产物现状 **66/66 全部合规**
 *   （`rel` 含 `noopener` 与 `noreferrer`；其中 5 处额外带 `me`）。
 *   所以本轮**只补看守、不改构造层** ⇒ **产物逐字不变**。
 *
 * 六条判据（编号用独立字母体系 GA*，**不与既有前缀冲突**：
 *   TD* 是第三方外域门禁、FX* 是订阅源显示名门禁、FZ* 是它的自测、
 *   其余各族各用各的字母体系，均不同名）：
 *   GA1 **模板层**：src/ 下每个 .njk 模板里 `target="_blank"` 的 `<a>` / `<area>`
 *      必须带 `rel` 属性，且它的 **token 集合**必须同时含 `noopener` 与
 *      `noreferrer`；`rel` 必须是**字面量**（模板变量判红 —— 静态判不出
 *      它到底带没带保护，就不能算「有保护」）。
 *      注释（Nunjucks {# #} / HTML <!-- -->）里的不算 —— 那是文档，不是数据。
 *   GA2 **产物层**：渲染后每个页面里 `target="_blank"` 的 `<a>` / `<area>`，
 *      `rel` 的 **token 集合**必须同时含 `noopener` 与 `noreferrer`。
 *   GA3 **覆盖度自证** —— 一个 .njk 模板都没扫到、模板里一处会开新上下文的
 *      链接都没找到、一个 HTML 页面都没扫到、产物里一处会开新上下文的链接
 *      都没找到 ⇒ 判据没有落到任何东西上，直接判红。
 *   GA4 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   GA5 **扫描器自证** —— 合成样例走**同一条**扫描 + 判定路径：
 *      合规样例必须判绿、少一个 token 的样例必须判红、**token 必须是精确匹配**
 *      （`noopenerx` 不算 `noopener`）、注释里的样例必须不命中、
 *      `<base target>` 必须能被检出。任何一条不成立 ⇒ 判红。
 *      理由：一条**永远不会红**的判据给出**看起来很确定的绿**，比没有判据更坏。
 *   GA6 **不许有 `<base target>`** —— `<base>` 上的 target 是**全站默认**的
 *      打开目标，等于让每一个链接都在新标签页打开、而所有链接都没有 rel 保护。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **只判静态产物**：JS 运行时改出来的 target/rel 判不了
 *     （本站没有这种用法）。
 *   · **只判「会开新浏览上下文」的目标**：`_blank` 与**命名目标**
 *     （`target="某个名字"` —— 那个名字还不存在时同样会开新窗口）。
 *     `_self` / `_parent` / `_top` / 空值不开新上下文 ⇒ 不判它们的 rel。
 *   · **只判 `<a>` 与 `<area>`**：这两个元素支持 `rel` 里的 `noopener`。
 *     `<form target>` 不受 `rel="noopener"` 保护（表单没有这个语义），
 *     本门禁也不去管它。
 *   · **不判「外链」**：站内相对路径的图片链接（点开大图）同样是新标签页打开，
 *     同样要带 rel ⇒ 判的是**会不会开新上下文**，不是**是不是外链**。
 *   · **token 按空白切分、大小写不敏感**：`rel` 的关键字在 HTML 规范里
 *     ASCII 大小写不敏感；`rel="NOOPENER NOREFERRER"` 合规，
 *     但 `rel="noopener,noreferrer"`（逗号）**不合规** —— 逗号不是 rel 的分隔符。
 *   · **比的是「当前模板 / 当前产物」**：改了模板必须先重新 build
 *     （build 链里 eleventy 跑在门禁之前，天然满足这个次序）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明 GA4「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);
const SRC = path.join(ROOT, "src");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const GA1_ON = true;
const GA2_ON = true;
const GA3_ON = true;
const GA4_ON = true;
const GA5_ON = true;
const GA6_ON = true;

/* 覆盖度下限（站点至少有首页与至少一个模板；新标签页链接至少一处）。 */
const MIN_PAGES = 1;
const MIN_TEMPLATES = 1;
const MIN_BLANK_LINKS = 1;

/* rel 里必须同时具备的两个 token。 */
const REQUIRED_TOKENS = ["noopener", "noreferrer"];

/* 不开新浏览上下文的 target 取值。 */
const SAME_CONTEXT_TARGETS = new Set(["", "_self", "_parent", "_top"]);

const problems = [];
/** 记一条判红。 */
function fail(msg) {
  problems.push(msg);
}
/** 打印全部判红并退出。 */
function report() {
  console.error("新标签页链接 rel 门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：枚举文件 ================= */

function walk(dir, acc, filter) {
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
    if (e.isDirectory()) walk(p, acc, filter);
    else if (!filter || filter(p)) acc.push(p);
  }
  return acc;
}

/* ================= 工具：HTML 标签扫描（自带，不 import 被检查方代码） ================= */

/** 文本里某个下标所在的行号（1 起）。 */
function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

/** 把一段文本里的换行留下、其余换成空格 ⇒ 长度与行号都不变。 */
function blankOut(s) {
  return s.replace(/[^\n]/g, " ");
}

/**
 * 先把三类「里面不该出现标签」的噪声抹掉，**保持长度不变**（行号不漂）：
 *   · HTML 注释 `<!-- ... -->`
 *   · `<script>` / `<style>` 的原始文本内容（里面的 `<` 不是标签）
 */
function stripNoise(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, blankOut)
    .replace(/<script\b[\s\S]*?<\/script>/gi, blankOut)
    .replace(/<style\b[\s\S]*?<\/style>/gi, blankOut);
}

/**
 * 遮罩掉模板里的注释：**只该吃掉注释里的内容**。
 *   · Nunjucks 注释 `{# ... #}`
 *   · HTML 注释 `<!-- ... -->`
 * 遮罩只把字符换成空格（保留换行）⇒ 行号不漂，红因能报到「第几行」。
 */
function maskTemplateComments(text) {
  const rules = [/\{#[\s\S]*?#\}/g, /<!--[\s\S]*?-->/g];
  return rules.reduce((t, re) => t.replace(re, (m) => m.replace(/[^\n]/g, " ")), text);
}

/**
 * 顺序扫标签：**跳过整个标签区域**（含引号内的内容），
 * ⇒ 属性值里出现的 `<link ...>` 不会被误当成真标签。
 */
function scanTags(html, wanted) {
  const out = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 32));
    if (!m) {
      i = lt + 1;
      continue;
    }
    let j = lt + m[0].length;
    let quote = null;
    while (j < html.length) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    const tag = m[1].toLowerCase();
    if (wanted.has(tag)) {
      out.push({ tag, attrSrc: html.slice(lt + m[0].length, j), start: lt });
    }
    i = j + 1; // 关键：跨过整个标签，别把属性值里的 '<' 当成新标签
  }
  return out;
}

/** 解析标签的属性区。引号值整体被吃掉，值里的 '=' 不会拆散属性。 */
function parseAttrs(attrSrc) {
  const attrs = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(attrSrc)) !== null) {
    const name = m[1].toLowerCase();
    if (attrs[name] !== undefined) continue; // 重复属性取第一个
    if (m[2] !== undefined) attrs[name] = m[2];
    else if (m[3] !== undefined) attrs[name] = m[3];
    else if (m[4] !== undefined) attrs[name] = m[4];
    else attrs[name] = "";
  }
  return attrs;
}

/* ================= 工具：rel 的判定 ================= */

/**
 * rel 的 token 集合：按**空白**切分、大小写不敏感。
 * ⚠️ 逗号不是 rel 的分隔符 ⇒ `rel="noopener,noreferrer"` 会被切成
 *    一个 token `noopener,noreferrer` ⇒ 判它缺两个 token（正确）。
 */
function relTokens(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/** 这个 target 会不会开一个新的浏览上下文？ */
function opensNewContext(targetValue) {
  const t = String(targetValue === undefined ? "" : targetValue).trim().toLowerCase();
  if (SAME_CONTEXT_TARGETS.has(t)) return false;
  return true;
}

/** rel 里还缺哪些必需 token。 */
function missingTokens(relValue) {
  const have = new Set(relTokens(relValue));
  return REQUIRED_TOKENS.filter((t) => !have.has(t));
}

/* ================= 收集：会开新上下文的链接 ================= */

/** 支持 rel=noopener 的元素。 */
const REL_CAPABLE = new Set(["a", "area"]);

/**
 * 扫描一个文本里所有「会开新浏览上下文」的 `<a>` / `<area>`。
 * 计数与收集**无条件**做（判定受开关控制，计数不受）—— 见文件头与 GA3 的说明。
 */
function collectBlankLinks(text) {
  const out = [];
  for (const t of scanTags(text, REL_CAPABLE)) {
    const attrs = parseAttrs(t.attrSrc);
    if (attrs.target === undefined) continue;
    if (!opensNewContext(attrs.target)) continue;
    out.push({
      tag: t.tag,
      target: String(attrs.target).trim(),
      hasRel: attrs.rel !== undefined,
      rel: attrs.rel === undefined ? "" : String(attrs.rel),
      start: t.start,
    });
  }
  return out;
}

/** 扫描一个文本里所有带 target 的 `<base>`（全站默认打开目标）。 */
function collectBaseTargets(text) {
  const out = [];
  for (const t of scanTags(text, new Set(["base"]))) {
    const attrs = parseAttrs(t.attrSrc);
    if (attrs.target === undefined) continue;
    out.push({ target: String(attrs.target).trim(), start: t.start });
  }
  return out;
}

/* ================= GA1：模板层 ================= */

/* 覆盖度计数**无条件**做（判定受开关控制，计数不受）。 */
const templateFiles = walk(SRC, [], (f) => path.extname(f).toLowerCase() === ".njk").sort();
const templateLinks = [];
for (const file of templateFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const masked = maskTemplateComments(stripNoise(raw));
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  for (const l of collectBlankLinks(masked)) {
    templateLinks.push({ file: rel, line: lineOf(masked, l.start), link: l });
  }
}

if (GA1_ON) {
  for (const t of templateLinks) {
    const where = `模板 ${t.file} 第 ${t.line} 行`;
    if (!t.link.hasRel) {
      fail(
        `GA1：${where} 的 <${t.link.tag}> 用 target="${t.link.target}" 在新标签页打开，` +
          `却**没有 rel 属性** —— 目标页面可以反过来用 window.opener 把本站这个标签页` +
          `导航走（reverse tabnabbing），必须写 rel="noopener noreferrer"。`
      );
      continue;
    }
    if (t.link.rel.includes("{{") || t.link.rel.includes("{%")) {
      fail(
        `GA1：${where} 的 <${t.link.tag}> 的 rel 是**模板变量**（「${t.link.rel}」）—— ` +
          `本门禁要求新标签页链接的 rel 写成**字面量**（noopener + noreferrer）：` +
          `变量形态静态判不出它到底带没带保护，不能算「有保护」。`
      );
      continue;
    }
    const miss = missingTokens(t.link.rel);
    if (miss.length) {
      fail(
        `GA1：${where} 的 <${t.link.tag}> 用 target="${t.link.target}" 在新标签页打开，` +
          `但 rel="${t.link.rel}" **缺少 ${miss.join(" 与 ")}** —— ` +
          `缺 noopener ⇒ 目标页面能用 window.opener 把本站这个标签页导航走；` +
          `缺 noreferrer ⇒ 会把本站访客的来源页带出去。`
      );
    }
  }
}

/* ================= GA2：产物层 ================= */

const htmlFiles = walk(SITE, [], (f) => path.extname(f).toLowerCase() === ".html").sort();
const productLinks = [];
for (const file of htmlFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const clean = stripNoise(raw);
  const pageRel = path.relative(SITE, file).split(path.sep).join("/");
  for (const l of collectBlankLinks(clean)) {
    productLinks.push({ page: pageRel, line: lineOf(raw, l.start), link: l });
  }
}

if (GA2_ON) {
  for (const p of productLinks) {
    const where = `${p.page}:${p.line}`;
    if (!p.link.hasRel) {
      fail(
        `GA2：${where} 的 <${p.link.tag}> 用 target="${p.link.target}" 在新标签页打开，` +
          `却**没有 rel 属性** —— 目标页面可以反过来用 window.opener 把本站这个标签页` +
          `导航走（reverse tabnabbing），必须写 rel="noopener noreferrer"。`
      );
      continue;
    }
    const miss = missingTokens(p.link.rel);
    if (miss.length) {
      fail(
        `GA2：${where} 的 <${p.link.tag}> 用 target="${p.link.target}" 在新标签页打开，` +
          `但 rel="${p.link.rel}" **缺少 ${miss.join(" 与 ")}** —— ` +
          `缺 noopener ⇒ 目标页面能用 window.opener 把本站这个标签页导航走；` +
          `缺 noreferrer ⇒ 会把本站访客的来源页带出去。`
      );
    }
  }
}

/* ================= GA3：覆盖度自证 ================= */

if (GA3_ON) {
  if (templateFiles.length < MIN_TEMPLATES) {
    fail(
      `GA3：一个 .njk 模板都没扫到（src/ 下 ${templateFiles.length} 个）—— ` +
        `模板层那条判据没有判断对象，直接判红。`
    );
  }
  if (templateLinks.length < MIN_BLANK_LINKS) {
    fail(
      `GA3：模板里一处「会开新上下文」的链接都没找到（扫了 ${templateFiles.length} 个模板）—— ` +
        `要么判据没跑到，要么模板真的一个都没有，直接判红。`
    );
  }
  if (htmlFiles.length < MIN_PAGES) {
    fail(
      `GA3：本门禁一个页面都没扫到（产物里 ${htmlFiles.length} 个 HTML）—— ` +
        `判据没有落到任何东西上，直接判红。`
    );
  }
  if (productLinks.length < MIN_BLANK_LINKS) {
    fail(
      `GA3：产物里一处「会开新上下文」的链接都没找到（扫了 ${htmlFiles.length} 个页面）—— ` +
        `要么判据没跑到，要么产物真的一个都没有，直接判红。`
    );
  }
}

/* ================= GA4：门禁自己没被卸掉 ================= */

if (GA4_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail(`GA4：读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail(`GA4：门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= GA5：扫描器自证 ================= */

/**
 * 证明 GA1 / GA2 用的「扫标签 → 读 rel → 判 token」这条路径**结构上还能触发**。
 * 合成样例走**同一条**路径：合规样例必须判绿、少一个 token 的必须判红、
 * **token 必须精确匹配**（`noopenerx` 不算 `noopener`）、注释里的必须不命中、
 * `<base target>` 必须能被检出。任何一条不成立 ⇒ 判红（宁可 build 断，
 * 也不给假保证）。
 *
 * ⚠️ 这里的期望值是**写死在样例表里**的，**不**由被检出的那套函数算出来
 * ⇒ 「判定被弄坏」时这条判据仍会红（否则它就是一句「看起来在跑」的保证）。
 */
if (GA5_ON) {
  const samples = [
    {
      name: "合规样例（rel 带 noopener + noreferrer）必须判绿",
      html: `<a href="https://example.com/" target="_blank" rel="noopener noreferrer">x</a>`,
      wantLinks: 1,
      wantMissing: [],
    },
    {
      name: "少一个 token（只有 noopener）必须判红",
      html: `<a href="https://example.com/" target="_blank" rel="noopener">x</a>`,
      wantLinks: 1,
      wantMissing: ["noreferrer"],
    },
    {
      name: "token 必须是精确匹配（noopenerx 不算 noopener）",
      html: `<a href="https://example.com/" target="_blank" rel="noopenerx noreferrer">x</a>`,
      wantLinks: 1,
      wantMissing: ["noopener"],
    },
    {
      name: "HTML 注释里的链接必须不命中（注释豁免）",
      html: `<!-- <a href="https://example.com/" target="_blank" rel="noopener">x</a> -->`,
      wantLinks: 0,
      wantMissing: [],
    },
    {
      name: "Nunjucks 注释里的链接必须不命中（注释豁免）",
      html: `{# <a href="https://example.com/" target="_blank" rel="noopener">x</a> #}`,
      wantLinks: 0,
      wantMissing: [],
    },
  ];
  for (const s of samples) {
    const masked = maskTemplateComments(stripNoise(s.html));
    const links = collectBlankLinks(masked);
    if (links.length !== s.wantLinks) {
      fail(
        `GA5：扫描器自证失败：${s.name} —— 期望找到 ${s.wantLinks} 处会开新上下文的链接，` +
          `实际 ${links.length} 处。本门禁的「扫标签」这一步结构上已经失效，` +
          `继续跑只会给出**假保证**。`
      );
      continue;
    }
    if (s.wantMissing.length) {
      const got = missingTokens(links[0].rel);
      const same =
        got.length === s.wantMissing.length && s.wantMissing.every((t) => got.includes(t));
      if (!same) {
        fail(
          `GA5：扫描器自证失败：${s.name} —— 期望判出缺少 ${s.wantMissing.join(" 与 ")}，` +
            `实际判出「${got.join(" 与 ") || "（无缺项）"}」。本门禁的「判 token」这一步` +
            `结构上已经失效，继续跑只会给出**假保证**。`
        );
      }
    }
  }
  /* <base target> 的检出能力也要自证（GA6 守的就是它）。 */
  const baseProbe = collectBaseTargets(stripNoise(`<base href="https://example.com/" target="_blank">`));
  if (baseProbe.length !== 1) {
    fail(
      `GA5：扫描器自证失败：带 target 的 <base> 必须能被检出 —— 期望 1 处，实际 ` +
        `${baseProbe.length} 处。GA6 守的就是这个，检出能力没了它就是一句空话。`
    );
  }
}

/* ================= GA6：不许有 <base target> ================= */

/* 计数与收集**无条件**做（判定受开关控制，计数不受）。 */
const templateBases = [];
for (const file of templateFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const masked = maskTemplateComments(stripNoise(raw));
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  for (const b of collectBaseTargets(masked)) {
    templateBases.push({ file: rel, line: lineOf(masked, b.start), base: b });
  }
}
const productBases = [];
for (const file of htmlFiles) {
  const raw = fs.readFileSync(file, "utf8");
  const clean = stripNoise(raw);
  const pageRel = path.relative(SITE, file).split(path.sep).join("/");
  for (const b of collectBaseTargets(clean)) {
    productBases.push({ page: pageRel, line: lineOf(raw, b.start), base: b });
  }
}

if (GA6_ON) {
  for (const t of templateBases) {
    fail(
      `GA6：模板 ${t.file} 第 ${t.line} 行有 <base> 带 target="${t.base.target}" —— ` +
        `<base> 上的 target 是**全站默认**的打开目标，等于让每一个链接都在新标签页打开、` +
        `而所有链接都没有 rel 保护，不许存在。`
    );
  }
  for (const p of productBases) {
    fail(
      `GA6：产物 ${p.page}:${p.line} 有 <base> 带 target="${p.base.target}" —— ` +
        `<base> 上的 target 是**全站默认**的打开目标，等于让每一个链接都在新标签页打开、` +
        `而所有链接都没有 rel 保护，不许存在。`
    );
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

console.log(
  `新标签页链接 rel 门禁通过：src/ 下 ${templateFiles.length} 个 .njk 模板里 ` +
    `${templateLinks.length} 处会开新上下文的链接全部带 rel（noopener + noreferrer）；` +
    `产物 ${htmlFiles.length} 个页面共 ${productLinks.length} 处会开新上下文的链接全部带 rel` +
    `（noopener + noreferrer）；模板与产物都没有 <base target>；本门禁接在 build 链上。`
);
