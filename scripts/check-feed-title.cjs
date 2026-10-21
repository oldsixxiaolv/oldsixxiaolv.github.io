#!/usr/bin/env node
/**
 * 门禁 FX1–FX6：订阅源的显示名必须**只有一份**，且页面对外报的名字与
 * feed 对外报的名字必须逐字一致。
 *
 * 为什么要有这个门禁（一次注入实测坐实的看护缺口，不是假想）：
 *   订阅源的显示名在本站有**两个出口**：
 *     ① 每页 head 里的 RSS 自动发现
 *        <link rel="alternate" type="application/rss+xml" title="…">
 *        —— 浏览器的「订阅本页」按钮里显示的就是这个属性；
 *     ② feed.xml 的频道级 <title> —— 订阅器里显示的是这个。
 *   此前这**同一串字面量在两个源文件里各写了一遍**
 *   （src/_includes/layouts/base.njk 与 src/feed.njk）⇒ **同一事实两份副本**：
 *   改一处忘另一处，浏览器里显示的订阅名与订阅器里 feed 自己的名字就对不上
 *   （访客看着像订了两个不同的源），而**没有任何东西核对二者一致**。
 *
 *   ⇒ **实测坐实**（本轮做的）：把产物复制到 /tmp，把首页的自动发现 title
 *     改成与 feed 频道 title 不一致的一串，对该副本跑 **16 道产物侧门禁**
 *     ⇒ **16 道全部 exit 0**，没有任何一道报告这件事。
 *     （其中 D44 场次新加的 FD 门禁也放行 —— 它判的是「入口在不在、指向谁、
 *     频道三件套齐不齐」，**不判两处报的名字一不一样**。）
 *
 *   ⇒ 这不是「产物现在有违规」。修之前实测产物现状：6 个页面的自动发现
 *     title 与 feed 频道 title **逐字相同**。所以本轮做两件事：
 *       ① 把这串字面量收敛到**单一真源**（src/_data/site.js 的 site.feedTitle），
 *          两个模板都从它派生 —— 站内一个字都没多写，**产物逐字不变**；
 *       ② 加本门禁，守住「只有一份」与「对外报的名字一致」。
 *
 * 六条判据（编号用独立字母体系 FX*，**不与既有前缀冲突**：
 *   FD* 是订阅自描述门禁、FT* 是它的自测、ID* 是身份派生门禁、
 *   其余各族各用各的字母体系，均不同名）：
 *   FX1 **真源契约**：src/_data/site.js 必须导出 site.feedTitle，且它
 *      **存在、非空、包含 site.title、且严格长于 site.title** ——
 *      即它是「站点名 + 自己的后缀」派生出来的，而不是另一份独立字面量。
 *      读不到 site.js / 字段缺失 / 形状不对 ⇒ 判红，**不猜**。
 *   FX2 **模板层不许烤死**：src/ 下的 .njk 模板里不得出现 feed 显示名的
 *      **后缀片段**（由真源派生）。注释（Nunjucks {# #} / HTML <!-- -->）
 *      里的不算 —— 那是文档，不是数据。
 *   FX3 **三处一致**：每页 RSS 自动发现的 title 属性、feed.xml 频道级
 *      <title>、site.feedTitle **三者必须逐字相同**（且非空）。
 *      真源不可用时（FX1 已经报过）只比前两处。
 *   FX4 **覆盖度自证** —— 一个页面都没扫到、没找到一处 RSS 自动发现、
 *      没读到 feed.xml / 频道 title / site.feedTitle、或一个 .njk 模板都
 *      没扫到 ⇒ 判据没有落到任何东西上，直接判红。
 *   FX5 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   FX6 **扫描器自证** —— 合成样例（正文里放一句**固定探针 token**）必须命中、
 *      注释里的同句必须不命中，任何一条不成立 ⇒ 判红。
 *      探针**不**取自真源：真源坏了要由 FX1 单独负责，FX6 只证明扫描器还活着。
 *      理由：一条**永远不会红**的判据给出**看起来很确定的绿**，比没有判据更坏。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **只判静态产物**：JS 运行时改出来的标题判不了（本站没有这种用法）。
 *   · **FX2 只扫模板层**（.njk）：数据层（src/_data）与构建配置层
 *     （eleventy.config.js）里若烤死同一字面量，本门禁不查；
 *     但只要**有一处**与别处不一致，FX3 仍会抓到。
 *   · **比较的是「渲染后的文字」**：产物里的 HTML 实体（&amp; 等）先解码再比，
 *     否则标题里出现 & 时会误判成不一致。
 *   · **比的是「当前真源」与「当前产物」**：改了 site.js 必须先重新 build
 *     （build 链里 eleventy 跑在门禁之前，天然满足这个次序）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明 FX5「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");
const SRC = path.join(ROOT, "src");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const FX1_ON = true;
const FX2_ON = true;
const FX3_ON = true;
const FX4_ON = true;
const FX5_ON = true;
const FX6_ON = true;

/* 覆盖度下限（站点至少有首页与至少一个模板；RSS 自动发现入口至少一处）。 */
const MIN_PAGES = 1;
const MIN_DISCOVERY = 1;
const MIN_TEMPLATES = 1;

const RSS_TYPE = "application/rss+xml";
const problems = [];
/** 记一条判红。 */
function fail(msg) {
  problems.push(msg);
}
/** 打印全部判红并退出。 */
function report() {
  console.error("订阅源显示名门禁未通过：\n");
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

/* ================= 工具：HTML 实体解码（比的是「渲染后的文字」） ================= */

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  middot: "·",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

/** 把产物里的 HTML 实体解回字符（`&amp;` → `&`），免得标题里出现 & 时误判。 */
function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, name) => {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)) return NAMED_ENTITIES[key];
    if (key.startsWith("#x")) {
      const n = parseInt(key.slice(2), 16);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    if (key.startsWith("#")) {
      const n = parseInt(key.slice(1), 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

/* ================= 工具：模板注释遮罩（FX2 用） ================= */

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

/** 在（已遮罩的）文本里逐行找 needle，回报行号。 */
function findNeedle(text, needle) {
  const hits = [];
  if (!needle) return hits;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(needle)) hits.push(i + 1);
  }
  return hits;
}

/* ================= 读真源：site.title / site.feedTitle ================= */

let siteData = null;
let siteError = "";
try {
  siteData = require(SITE_JS);
} catch (e) {
  siteError = e.message;
}
const SITE_TITLE = siteData ? String(siteData.title || "") : "";
const FEED_TITLE = siteData ? String(siteData.feedTitle || "") : "";

/**
 * 真源**可用**：feed 显示名确实存在，且形状是「站点名 + 自己的后缀」。
 * ⚠️ 这个判定**故意放在 FX1 的开关之外** —— 它同时供 FX3 决定
 * 「三方比较里的第三方能不能参与」。若它跟着 FX1 一起被卸掉，
 * 自测的负对照一关 FX1，FX3 的比较范围也跟着变，
 * 「红因到底来自哪一条判据」就说不清了。
 */
function feedTitleUsable() {
  if (!FEED_TITLE) return false;
  if (!SITE_TITLE) return false;
  if (FEED_TITLE.length <= SITE_TITLE.length) return false;
  if (!FEED_TITLE.includes(SITE_TITLE)) return false;
  return true;
}

/**
 * feed 显示名的**后缀片段**（"站点名"之后的那截），用作 FX2 的 needle。
 * 从真源派生 ⇒ 不需要在本门禁里另写一份期望值（改名字只改 site.js 一处）。
 *
 * ⚠️ 分隔符（"·"）**不算**显示名的实质部分 ⇒ needle 取**去掉分隔符之后**的
 * 那截。否则有人只烤死「Publications and notes」（不带分隔符）这一档，
 * 带分隔符的 needle 抓不到 ⇒ 模板层会出现一个看不出来的盲区。
 */
function suffixFragment() {
  if (!FEED_TITLE || !SITE_TITLE) return "";
  const idx = FEED_TITLE.lastIndexOf(SITE_TITLE);
  if (idx < 0) return "";
  let rest = FEED_TITLE.slice(idx + SITE_TITLE.length).trim();
  rest = rest.replace(/^[·•・\-–—|:]+/, "").trim();
  return rest;
}

const NEEDLE = suffixFragment();
const FEED_TITLE_USABLE = feedTitleUsable();
/* 真源字段**存在**（不等于 undefined）。注意它与「非空」是两件事：
   字段在但值是空串 ⇒ 由 FX1 负责判红（那是真源的形状问题），
   FX4 只管「判据有没有扫到该扫的对象」⇒ 两者不互相牵连。 */
const FEED_TITLE_PRESENT = !!(siteData && Object.prototype.hasOwnProperty.call(siteData, "feedTitle"));

/* ================= FX1：真源契约 ================= */

if (FX1_ON) {
  if (!siteData) {
    fail(
      `FX1：读不到 site.js（${SITE_JS}${siteError ? "：" + siteError : ""}）—— ` +
        `判据求不出订阅源的显示名从哪来，直接判红，不猜。`
    );
  } else {
    if (!SITE_TITLE) {
      fail(`FX1：site.js 里没有 site.title —— 订阅源的显示名无从派生，直接判红。`);
    }
    if (!FEED_TITLE) {
      fail(
        `FX1：site.js 里的 site.feedTitle 缺失或为空 —— 订阅源的显示名**没有真源**，` +
          `两个模板只能各写一份字面量（同一事实两份副本），直接判红。`
      );
    } else if (!FEED_TITLE_USABLE) {
      fail(
        `FX1：site.feedTitle（「${FEED_TITLE}」）的形状不对 —— 它必须**包含** ` +
          `site.title（「${SITE_TITLE}」）且**严格长于**它，即「站点名 + 自己的后缀」` +
          `派生出来的，而不是另一份独立字面量。`
      );
    } else if (!NEEDLE) {
      fail(
        `FX1：site.feedTitle（「${FEED_TITLE}」）去掉站点名之后**没有剩下任何后缀** —— ` +
          `它就是站点名本身，订阅源与站点同名，读者分不出订阅的是什么，直接判红。`
      );
    }
  }
}

/* ================= FX2：模板层不许烤死后缀片段 ================= */

/* 覆盖度计数**无条件**做（判定受开关控制，计数不受）—— 见文件头与 FX4 的说明。 */
const templateFiles = walk(SRC, [], (f) => path.extname(f).toLowerCase() === ".njk");
const templateHits = [];

if (FX2_ON) {
  if (!NEEDLE) {
    /* needle 求不出来（真源不可用）⇒ 本条没有判断对象。
       上面 FX1 已经报过真源的问题，这里**不重复报**，只把事实记下来。 */
    templateHits.note = "真源不可用，FX2 没有判断对象（由 FX1 报）";
  } else {
    for (const file of templateFiles) {
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const text = maskTemplateComments(fs.readFileSync(file, "utf8"));
      for (const line of findNeedle(text, NEEDLE)) {
        templateHits.push({ file: rel, line });
      }
    }
    for (const h of templateHits) {
      fail(
        `FX2：模板 ${h.file} 第 ${h.line} 行把订阅源显示名的后缀片段「${NEEDLE}」` +
          `**写成了字面量**—— 显示名必须从 site.feedTitle 派生（src/_data/site.js）；` +
          `模板里烤死一份就是第二份副本，改一处忘另一处，浏览器里显示的订阅名与` +
          `订阅器里 feed 自己的名字会对不上。`
      );
    }
  }
}

/* ================= FX3：三处一致 ================= */

let discoveryCount = 0;
const htmlFiles = walk(SITE, [], (f) => path.extname(f).toLowerCase() === ".html").sort();

const feedPath = path.join(SITE, "feed.xml");
const feedExists = fs.existsSync(feedPath);
const feedXml = feedExists ? fs.readFileSync(feedPath, "utf8") : "";

/** 取 feed 频道头（<channel> 到第一个 <item> 之间）的 <title>。 */
function channelTitleOf(xml) {
  const cm = /<channel[^>]*>([\s\S]*)/i.exec(xml);
  if (!cm) return "";
  const inner = cm[1];
  const itemAt = inner.search(/<item[\s>]/i);
  const head = itemAt >= 0 ? inner.slice(0, itemAt) : inner;
  const m = /<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i.exec(head);
  return m ? decodeEntities(m[1].trim()) : "";
}

const CHANNEL_TITLE = channelTitleOf(feedXml);

/**
 * 扫描产物里每个页面的 RSS 自动发现入口。
 *
 * ⚠️ 扫描与计数**无条件**做（判定受开关控制，计数不受）——
 *    覆盖度计数若写在 FX3 的开关里，卸掉 FX3 之后 FX4 就会因为
 *    「一处入口都没找到」而**连带判红** ⇒ 判据级负对照永远转不了绿，
 *    「红因到底来自哪一条判据」也就说不清了。
 */
function collectDiscoveries() {
  const out = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const clean = stripNoise(html);
    const pageRel = path.relative(SITE, file).split(path.sep).join("/");
    for (const t of scanTags(clean, new Set(["link"]))) {
      const attrs = parseAttrs(t.attrSrc);
      const rel = String(attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
      if (!rel.includes("alternate")) continue;
      if (String(attrs.type || "").trim().toLowerCase() !== RSS_TYPE) continue;
      out.push({
        pageRel,
        line: lineOf(html, t.start),
        title: attrs.title === undefined ? "" : decodeEntities(String(attrs.title).trim()),
        hasTitle: attrs.title !== undefined,
      });
    }
  }
  return out;
}

const DISCOVERIES = collectDiscoveries();
discoveryCount = DISCOVERIES.length;

if (FX3_ON) {
  if (!feedExists) {
    fail(`FX3：产物里没有 feed.xml —— 订阅源自己的显示名无从核对，直接判红。`);
  } else if (!CHANNEL_TITLE) {
    fail(`FX3：读不到 feed.xml 的频道级 <title> —— 没有可比对的订阅源显示名，直接判红。`);
  } else {
    for (const f of DISCOVERIES) {
      if (!f.hasTitle || !f.title) {
        fail(
          `FX3：${f.pageRel}:${f.line} 的 RSS 自动发现入口没有 title 属性 —— ` +
            `浏览器「订阅本页」按钮里显示不出订阅源的名字。`
        );
        continue;
      }
      if (f.title !== CHANNEL_TITLE) {
        fail(
          `FX3：${f.pageRel}:${f.line} 的 RSS 自动发现 title 是「${f.title}」，` +
            `而 feed.xml 频道级 <title> 是「${CHANNEL_TITLE}」—— **同一份订阅源，` +
            `两处对外报的名字不一样**（浏览器里显示一个、订阅器里显示另一个）。`
        );
        continue;
      }
      if (FEED_TITLE_USABLE && f.title !== FEED_TITLE) {
        fail(
          `FX3：${f.pageRel}:${f.line} 的 RSS 自动发现 title 是「${f.title}」，` +
            `但真源 site.feedTitle 是「${FEED_TITLE}」—— 产物没有从真源派生。`
        );
      }
    }
  }
  /* 真源这一侧也要对一次：feed 频道 title 必须等于真源（模板没从真源派生时，
     页面与 feed 可能"一致地错"——两处都写成了 site.title，页面↔feed 那条比不出来）。 */
  if (FEED_TITLE_USABLE && CHANNEL_TITLE && CHANNEL_TITLE !== FEED_TITLE) {
    fail(
      `FX3：feed.xml 频道级 <title> 是「${CHANNEL_TITLE}」，但真源 site.feedTitle 是` +
        `「${FEED_TITLE}」—— 产物里的订阅源显示名没有从真源派生。`
    );
  }
}

/* ================= FX4：覆盖度自证 ================= */

if (FX4_ON) {
  if (htmlFiles.length < MIN_PAGES) {
    fail(
      `FX4：本门禁一个页面都没扫到（产物里 ${htmlFiles.length} 个 HTML）—— ` +
        `判据没有落到任何东西上，直接判红。`
    );
  }
  if (discoveryCount < MIN_DISCOVERY) {
    fail(
      `FX4：一处 RSS 自动发现入口都没找到（扫了 ${htmlFiles.length} 个页面）—— ` +
        `要么判据没跑到，要么产物真的一个订阅入口都没有，直接判红。`
    );
  }
  if (!feedExists) fail(`FX4：读不到 feed.xml —— 判据没有落到任何东西上，直接判红。`);
  if (!CHANNEL_TITLE) fail(`FX4：读不到 feed.xml 的频道级 <title> —— 判据没有落到任何东西上，直接判红。`);
  if (!FEED_TITLE_PRESENT) {
    fail(
      `FX4：site.js 里**没有 feedTitle 这个字段** —— 判据找不到「订阅源显示名的真源」` +
        `这个东西，无从核对，直接判红。`
    );
  }
  if (templateFiles.length < MIN_TEMPLATES) {
    fail(
      `FX4：一个 .njk 模板都没扫到（src/ 下 ${templateFiles.length} 个）—— ` +
        `模板层那条判据没有判断对象，直接判红。`
    );
  }
}

/* ================= FX5：门禁自己没被卸掉 ================= */

if (FX5_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail(`FX5：读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail(`FX5：门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= FX6：扫描器自证 ================= */

/**
 * 证明 FX2 的「找字面量」这一步**结构上还能触发**。
 * 合成样例走**同一条**遮罩 + 匹配路径：正文里的必须命中、注释里的必须不命中。
 * 任何一条不成立 ⇒ 判红（宁可 build 断，也不给假保证）。
 *
 * ⚠️ 这里用**固定的探针 token**，**不**用真源派生出来的 NEEDLE。
 * 理由：FX6 证明的是「扫描器还活着」，与「真源形状对不对」是两件事。
 * 若它跟着真源走，真源一旦坏掉（FX1 判红），FX6 会连带判红 ⇒
 * 自测里「关掉 FX1 ⇒ 应当转绿」的那一档就永远转不了绿，
 * 「红因到底来自哪一条判据」也就说不清了。
 */
const FX6_PROBE = "MhFeedTitleSelfProbe";

if (FX6_ON) {
  const samples = [
    { name: "模板正文里的探针 token 必须命中", text: `<p>${FX6_PROBE}</p>`, want: 1 },
    { name: "Nunjucks 注释里的必须不命中（注释豁免）", text: `{# ${FX6_PROBE} #}`, want: 0 },
    { name: "HTML 注释里的必须不命中（注释豁免）", text: `<!-- ${FX6_PROBE} -->`, want: 0 },
  ];
  for (const s of samples) {
    const got = findNeedle(maskTemplateComments(s.text), FX6_PROBE).length;
    if (got !== s.want) {
      fail(
        `FX6：扫描器自证失败：${s.name} —— 期望命中 ${s.want} 条，实际 ${got} 条。` +
          `本门禁的「找字面量」这一步结构上已经失效，继续跑只会给出**假保证**。`
      );
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

console.log(
  `订阅源显示名门禁通过：真源 site.feedTitle = 「${FEED_TITLE}」` +
    `（= site.title 「${SITE_TITLE}」 + 后缀派生）；` +
    `src/ 下 ${templateFiles.length} 个 .njk 模板里没有烤死这个后缀片段；` +
    `产物 ${htmlFiles.length} 个页面共 ${discoveryCount} 处 RSS 自动发现入口，` +
    `其 title 属性、feed.xml 频道级 <title> 与真源三者逐字一致；本门禁接在 build 链上。`
);
