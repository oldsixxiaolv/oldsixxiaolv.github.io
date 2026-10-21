#!/usr/bin/env node
/**
 * 门禁 FD1–FD6：订阅与爬虫的**自我描述入口**必须存在，且必须指向本站
 *
 * 为什么要有这个门禁（一次注入实测坐实的看护缺口，不是假想）：
 *   本站有四个对外出口（publications.bib / publications.ris / feed.xml /
 *   sitemap.xml）。其中三个要靠「**自描述**」才能被机器找到：
 *     ① **每页的 RSS 自动发现** —— `<link rel="alternate" type="application/rss+xml">`
 *        ⇒ 浏览器的「订阅本页」/ 阅读器列表里才会出现这个站；
 *     ② **feed.xml 的 `<atom:link rel="self">`** ⇒ 聚合器据此知道「这个 feed
 *        自己的正式地址是哪个」，多源抓取时不会把它当成别人的；
 *     ③ **robots.txt 的 `Sitemap:` 行** ⇒ 爬虫据此知道站点地图在哪。
 *
 *   而这三条**从来没有被任何一道门禁核过**。实测（全仓门禁逐条 grep 过）：
 *     · `grep -l 'rss+xml' scripts/check-*.cjs scripts/verify-*.cjs` ⇒ **0 命中**
 *       ⇒ 每页有没有 RSS 自动发现入口，**没人看**。
 *     · `grep -l 'atom' …` ⇒ **0 命中** ⇒ feed 的 `atom:link rel="self"`，
 *       **没人看**。
 *     · `grep -l 'Sitemap:' …` ⇒ **0 命中** ⇒ robots.txt 指着别人的站点地图，
 *       **没人看**。
 *     · `scripts/check-site-language.cjs`（TX1）只判这些出口的**语言**
 *       （有没有中日韩字符），TX2 只判 robots.txt 里那个构建时刻标记；
 *       ⇒ **结构与指向**没人判。
 *     · `scripts/verify-site.cjs` 的通用引用正则会核对 `<link href>` 的**目标存在**，
 *       但**不核对「有没有这条声明」**，也不核对它指向谁。
 *     · `scripts/check-third-party.cjs` 只扫 `.html` / `.css` / `.js`
 *       ⇒ robots.txt 里的外域 URL 连外域那道门禁都够不着。
 *
 *   ⇒ **实测坐实**（本轮做的）：往产物副本里注入三处故障
 *     （删掉 about 页的 RSS 自动发现 / 把 feed 的 `atom:link rel="self"`
 *      指向 /papers/ / 把 robots.txt 的 `Sitemap:` 指向 example.com），
 *     对该副本跑 **15 道产物侧门禁** ⇒ **15 道全部 exit 0**，
 *     没有任何一道报告这件事。
 *
 *   ⇒ 这不是「产物现在有违规」，而是**看护缺口**。实测改动前产物现状：
 *     · 6 个页面**各有且仅有**一处 RSS 自动发现，href 按页面 URL 口径
 *       全部落到本��的 feed.xml；
 *     · feed.xml 的 `atom:link rel="self"` = `https://github.lvyihang.xyz/feed.xml`；
 *     · robots.txt 恰好一行 `Sitemap: https://github.lvyihang.xyz/sitemap.xml`；
 *     · feed 频道级 `<title>` / `<link>` / `<description>` 齐备；
 *     ⇒ 现状**满足**，缺的只是**看守**。所以本轮改的是门禁，不是构造层 ——
 *       站内一个字都不改，产物零变化。
 *
 * 六条判据（编号用独立字母体系 FD*，**不与既有前缀冲突**：
 *   其余各族 check-site-js 的 JS*、check-img-srcset 的 SX*、
 *   check-site-language 的 TX*、check-third-party 的 TD*、
 *   check-lang 的 FF*、check-jsonld 的 J*、verify-site 的数字编号 等均不同名）：
 *   FD1 **每页的 RSS 自动发现**：必须**恰好一处** `<link rel="alternate"
 *      type="application/rss+xml">`，且其 `href` 按**页面 URL 口径**解析后
 *      必须落到**本站的 feed.xml**（相对路径、根相对路径、以及与本站同源的
 *      绝对 URL 都算「指向本站」；外域指向别处一律判红）。
 *   FD2 **feed.xml 的自我描述**：必须有 `<atom:link>`，`rel` 必须是 `self`、
 *      `type` 必须是 `application/rss+xml`、`href` 非空，且必须等于
 *      **本站 feed 的规范绝对 URL**（`site.url` + `/feed.xml`）。
 *   FD3 **feed 频道三件套**：频道级 `<title>` / `<link>` / `<description>`
 *      必须存在且非空 —— RSS 2.0 的频道没有这三样，订阅器显示不出源名。
 *   FD4 **robots.txt 的站点地图行**：必须**恰好一行** `Sitemap:`，
 *      其值必须等于**本站 sitemap 的规范绝对 URL**（`site.url` + `/sitemap.xml`）。
 *   FD5 **覆盖度自证** —— 一个页面都没扫到、或一处 RSS 自动发现都没找到、
 *      或 feed.xml / robots.txt 没读到 ⇒ 判据没有落到任何东西上，直接判红。
 *   FD6 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **不判订阅器能不能真的拉到内容** —— feed 里有没有 item 由 verify-site 的
 *     第 7 条判；本门禁只管「**入口在不在、指向谁**」。
 *   · **不判 robots.txt 里那些 User-agent 分组** —— 那部分不由本门禁管。
 *   · **只判静态产物**：JS 运行时写出来的声明判不了（本站没有这种用法）。
 *   · **feed 的频道级 `<link>` 只判存在与非空**，不判它指向哪 —— 频道链接
 *     指向首页还是别的，属站点信息架构，不在本门禁口径内。
 *
 * ⚠️ 为什么**只判产物**（_site）而不是源码：
 *   浏览器与爬虫读的是**产物**。产物的路径（相对 / 根相对）由 Eleventy 的
 *   relUrl 过滤器在渲染时改写，源码里的写法与访客实际请求的 URL 不是一回事。
 *   ⇒ 判产物 = 判访客真正经历的那件事。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR  —— 产物目录（默认 _site）
 *   PKG_PATH  —— package.json 的路径（默认仓库根的 package.json）——
 *                自测用它证明 FD6「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);
const SITE_JS = path.join(ROOT, "src", "_data", "site.js");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const FD1_ON = true;
const FD2_ON = true;
const FD3_ON = true;
const FD4_ON = true;
const FD5_ON = true;
const FD6_ON = true;

/* FD5 的覆盖度下限（站点至少有首页，RSS 自动发现入口至少也得有一处）。 */
const MIN_PAGES = 1;
const MIN_DISCOVERY = 1;

const RSS_TYPE = "application/rss+xml";
const problems = [];
/** 记一条判红。 */
function fail(msg) {
  problems.push(msg);
}
/** 打印全部判红并退出。 */
function report() {
  console.error("订阅自描述门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具：产物枚举 ================= */

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

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") n++;
  return n;
}

/* ================= 工具：HTML 标签扫描（自带，不 import 被检查方代码） ================= */

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

/* ================= 工具：URL / 路径解析 ================= */

const EXTERNAL_RE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

/**
 * 把一条 href 解析成「本站内的相对路径」。
 * 返回 {kind, path}
 *   · "site"     —— 站内路径（path 是相对站点根的路径）
 *   · "external" —— 外域（别的站）
 *   · "empty"    —— 空
 *
 * 相对路径按**页面 URL 口径**解析（相对**页面所在目录**），
 * 与浏览器实际请求的 URL 一致。
 */
function resolveSitePath(pageRel, raw) {
  const clean = String(raw == null ? "" : raw).split("#")[0].split("?")[0].trim();
  if (!clean) return { kind: "empty", path: "" };
  if (EXTERNAL_RE.test(clean)) {
    // 绝对 URL：与本站同源（且路径对得上）也算「指向本站」
    const m = /^https?:\/\/([^/?#]+)(\/[^?#]*)?$/i.exec(clean);
    if (m) return { kind: "absolute", host: m[1].toLowerCase(), path: (m[2] || "/").replace(/^\//, "") };
    return { kind: "external", path: clean };
  }
  if (clean.startsWith("#")) return { kind: "empty", path: "" };
  // ⚠️ 必须用 join + normalize，**不能用 resolve**：
  //   resolve 会把相对路径解析成**当前工作目录**下的绝对路径
  //   （`resolve("", "feed.xml")` ⇒ "<cwd>/feed.xml"），
  //   那就不是「站点内的路径」了，判据会拿绝对路径去比。
  const base = path.posix.dirname(pageRel);
  let p = clean.startsWith("/") ? clean.slice(1) : path.posix.normalize(path.posix.join(base, clean));
  if (p.startsWith("./")) p = p.slice(2);
  if (p.endsWith("/")) p += "index.html";
  return { kind: "site", path: p };
}

/** 本站的 feed / sitemap 在站点内的相对路径。 */
const FEED_PATH = "feed.xml";
const SITEMAP_PATH = "sitemap.xml";

/* ================= 读真源：site.url ================= */

let SITE_URL = "";
let siteUrlError = "";
try {
  const siteData = require(SITE_JS);
  SITE_URL = String((siteData && siteData.url) || "").replace(/\/+$/, "");
} catch (e) {
  siteUrlError = e.message;
}

/* ================= 产物清单 ================= */

if (!fs.existsSync(SITE)) {
  console.error("订阅自描述门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE} —— 先跑 npm run build 再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const allFiles = walk(SITE);
const htmlFiles = allFiles
  .filter((f) => path.extname(f).toLowerCase() === ".html")
  .sort();

/* ================= FD1：每页的 RSS 自动发现 ================= */

let discoveryCount = 0;
const discoveryByPage = [];

/* 「本站的 feed 在哪」这个前提：读不到 site.url 就判红，不猜。 */
const siteUrlKnown = !!SITE_URL;
if (FD1_ON && !siteUrlKnown) {
  fail(
    `FD1：读不到 site.url（${SITE_JS}${siteUrlError ? "：" + siteUrlError : ""}）—— ` +
      `判据求不出「本站的 feed 在哪」，直接判红，不猜。`
  );
}

/* ⚠️ 覆盖度计数（discoveryCount）**故意放在 FD1 判定之外**：
   它服务的是 FD5「判据有没有落到东西上」的自证，必须独立于 FD1 的开关 ——
   否则自测的负对照一关 FD1，FD5 就跟着失效，
   「红因到底来自哪一条判据」就说不清了。 */
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const clean = stripNoise(html);
  const pageRel = path.relative(SITE, file).split(path.sep).join("/");

  const found = [];
  for (const t of scanTags(clean, new Set(["link"]))) {
    const attrs = parseAttrs(t.attrSrc);
    const rel = String(attrs.rel || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes("alternate")) continue;
    const type = String(attrs.type || "").trim().toLowerCase();
    if (type !== RSS_TYPE) continue;
    found.push({ href: attrs.href === undefined ? "" : attrs.href, line: lineOf(html, t.start) });
  }

  discoveryCount += found.length;
  discoveryByPage.push(pageRel);

  if (!FD1_ON) continue; // 判定被卸掉时只统计，不判定
  if (!siteUrlKnown) continue; // 前提不成立，上面已经报过了

  if (!found.length) {
    fail(
      `FD1：${pageRel} **没有** RSS 自动发现入口` +
        `（<link rel="alternate" type="${RSS_TYPE}">）—— 浏览器与阅读器里就不会` +
        `出现这个站的订阅入口，而访客看不出来。`
    );
    continue;
  }
  if (found.length > 1) {
    fail(
      `FD1：${pageRel} 有 ${found.length} 处 RSS 自动发现入口（第 ` +
        `${found.map((f) => f.line).join(" / ")} 行）—— 应当**恰好一处**，多了会让` +
        `订阅器拿到互相冲突的源。`
    );
  }

  for (const f of found) {
    const r = resolveSitePath(pageRel, f.href);
    if (r.kind === "empty") {
      fail(`FD1：${pageRel}:${f.line} 的 RSS 自动发现入口 href 是空的 —— 等于没声明。`);
      continue;
    }
    if (r.kind === "external") {
      fail(
        `FD1：${pageRel}:${f.line} 的 RSS 自动发现入口指向**外域**「${f.href}」—— ` +
          `订阅器会把本站当成别的站来订阅。`
      );
      continue;
    }
    if (r.kind === "absolute") {
      const siteHost = SITE_URL.replace(/^https?:\/\//i, "").toLowerCase();
      if (r.host !== siteHost) {
        fail(
          `FD1：${pageRel}:${f.line} 的 RSS 自动发现入口指向**外域**「${f.href}」—— ` +
            `订阅器会把本站当成别的站来订阅。`
        );
        continue;
      }
      if (r.path !== FEED_PATH) {
        fail(
          `FD1：${pageRel}:${f.line} 的 RSS 自动发现入口指向「${f.href}」—— ` +
            `与本站的 feed（${SITE_URL}/${FEED_PATH}）不是同一个。`
        );
      }
      continue;
    }
    if (r.path !== FEED_PATH) {
      fail(
        `FD1：${pageRel}:${f.line} 的 RSS 自动发现入口 href「${f.href}」解析成 ` +
          `「${r.path}」—— 指向的不是本站的 feed（feed.xml）。`
      );
      continue;
    }
    if (!fs.existsSync(path.join(SITE, FEED_PATH))) {
      fail(`FD1：产物里没有 feed.xml —— 自动发现入口指向了一个不存在的文件。`);
    }
  }
}

/* ================= feed.xml ================= */

const feedPath = path.join(SITE, "feed.xml");
const feedExists = fs.existsSync(feedPath);
let feedXml = feedExists ? fs.readFileSync(feedPath, "utf8") : "";

/** 取 XML 片段里第一个 `<name>…</name>` 的内容。 */
function firstElement(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(xml);
  return m ? m[1].trim() : "";
}

/** 取 XML 片段里第一个 `<name …>` 开标签的属性。 */
function firstTagAttrs(xml, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  const attrs = {};
  const ar = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let a;
  while ((a = ar.exec(m[1])) !== null) {
    const k = a[1].toLowerCase();
    if (attrs[k] === undefined) attrs[k] = a[2] !== undefined ? a[2] : a[3];
  }
  return attrs;
}

/* 频道头 = <channel> 到第一个 <item> 之间的部分（频道三件套在频道级，不在 item 里） */
let channelHead = "";
if (feedXml) {
  const cm = /<channel[^>]*>([\s\S]*)/i.exec(feedXml);
  const inner = cm ? cm[1] : "";
  const itemAt = inner.search(/<item[\s>]/i);
  channelHead = itemAt >= 0 ? inner.slice(0, itemAt) : inner;
}

/* ---- FD2：feed.xml 的 atom:link rel="self" ---- */
if (FD2_ON) {
  if (!feedExists) {
    fail(`FD2：产物里没有 feed.xml —— 订阅源本身就不存在。`);
  } else if (!siteUrlKnown) {
    fail(
      `FD2：读不到 site.url（${SITE_JS}${siteUrlError ? "：" + siteUrlError : ""}）—— ` +
        `判据求不出本站 feed 的规范绝对地址，直接判红，不猜。`
    );
  } else {
    const self = firstTagAttrs(channelHead, "atom:link");
    if (!self) {
      fail(
        `FD2：feed.xml 里没有 <atom:link> —— 聚合器无法知道这个 feed 自己的正式地址，` +
          `多源抓取时可能把它当成别人的。`
      );
    } else {
      const rel = String(self.rel || "").trim().toLowerCase();
      const type = String(self.type || "").trim().toLowerCase();
      const href = String(self.href || "").trim();
      const expected = `${SITE_URL}/${FEED_PATH}`;
      if (rel !== "self") {
        fail(`FD2：feed.xml 的 <atom:link> rel="${self.rel}"，必须是 "self"。`);
      }
      if (type !== RSS_TYPE) {
        fail(`FD2：feed.xml 的 <atom:link> type="${self.type}"，必须是 "${RSS_TYPE}"。`);
      }
      if (!href) {
        fail(`FD2：feed.xml 的 <atom:link> 没有 href —— 自我描述是空的。`);
      } else if (href !== expected) {
        fail(
          `FD2：feed.xml 的 <atom:link rel="self"> 指向「${href}」，` +
            `但本站 feed 的规范绝对地址是「${expected}」。`
        );
      }
    }
  }
}

/* ---- FD3：feed 频道三件套 ---- */
if (FD3_ON) {
  if (!feedExists) {
    fail(`FD3：产物里没有 feed.xml —— 频道三件套无从核对。`);
  } else {
    for (const name of ["title", "link", "description"]) {
      const v = firstElement(channelHead, name);
      if (!v) {
        fail(
          `FD3：feed.xml 的频道级 <${name}> 缺失或为空 —— RSS 2.0 的频道必须有 ` +
            `<title> / <link> / <description> 三件套，订阅器显示不出源名。`
        );
      }
    }
  }
}

/* ================= robots.txt ================= */

const robotsPath = path.join(SITE, "robots.txt");
const robotsExists = fs.existsSync(robotsPath);
let robotsTxt = robotsExists ? fs.readFileSync(robotsPath, "utf8") : "";

/* ---- FD4：robots.txt 的 Sitemap: 行 ---- */
if (FD4_ON) {
  if (!robotsExists) {
    fail(`FD4：产物里没有 robots.txt —— 爬虫拿不到站点地图的指引。`);
  } else if (!siteUrlKnown) {
    fail(
      `FD4：读不到 site.url（${SITE_JS}${siteUrlError ? "：" + siteUrlError : ""}）—— ` +
        `判据求不出本站 sitemap 的规范绝对地址，直接判红，不猜。`
    );
  } else {
    const lines = robotsTxt.split(/\r?\n/);
    const sitemapLines = [];
    lines.forEach((ln, i) => {
      const m = /^\s*Sitemap:\s*(\S+)\s*$/i.exec(ln);
      if (m) sitemapLines.push({ value: m[1], line: i + 1 });
    });
    const expected = `${SITE_URL}/${SITEMAP_PATH}`;
    if (!sitemapLines.length) {
      fail(
        `FD4：robots.txt 里没有 Sitemap: 行 —— 爬虫不知道站点地图在哪，` +
          `站点地图等于白生成。`
      );
    } else {
      if (sitemapLines.length > 1) {
        fail(
          `FD4：robots.txt 里有 ${sitemapLines.length} 行 Sitemap:（第 ` +
            `${sitemapLines.map((s) => s.line).join(" / ")} 行）—— 应当**恰好一行**。`
        );
      }
      for (const s of sitemapLines) {
        if (s.value !== expected) {
          fail(
            `FD4：robots.txt 第 ${s.line} 行的 Sitemap: 指向「${s.value}」，` +
              `但本站 sitemap 的规范绝对地址是「${expected}」。`
          );
        }
      }
    }
  }
}

/* ================= FD5：覆盖度自证 ================= */

if (FD5_ON) {
  if (htmlFiles.length < MIN_PAGES) {
    fail(
      `FD5：本门禁一个页面都没扫到（产物里 ${htmlFiles.length} 个 HTML）—— ` +
        `判据没有落到任何东西上，直接判红。`
    );
  }
  if (discoveryCount < MIN_DISCOVERY) {
    fail(
      `FD5：一处 RSS 自动发现入口都没找到（扫了 ${htmlFiles.length} 个页面）—— ` +
        `要么判据没跑到，要么产物真的一个订阅入口都没有，直接判红。`
    );
  }
  if (!feedExists) fail(`FD5：读不到 feed.xml —— 判据没有落到任何东西上，直接判红。`);
  if (!robotsExists) fail(`FD5：读不到 robots.txt —— 判据没有落到任何东西上，直接判红。`);
}

/* ================= FD6：门禁自己没被卸掉 ================= */

if (FD6_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail(`FD6：读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail(`FD6：门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) report();

console.log(
  `订阅自描述门禁通过：产物 ${htmlFiles.length} 个页面共 ${discoveryCount} 处 RSS 自动发现入口` +
    `（每页各 1 处，全部指向本站的 feed.xml）；feed.xml 的 <atom:link rel="self"> = ` +
    `${SITE_URL}/${FEED_PATH}、频道级 <title>/<link>/<description> 齐备；` +
    `robots.txt 恰好一行 Sitemap: ${SITE_URL}/${SITEMAP_PATH}；本门禁接在 build 链上。`
);
