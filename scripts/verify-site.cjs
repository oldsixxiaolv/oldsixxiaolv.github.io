#!/usr/bin/env node
/**
 * 站点产物自检 —— 把历轮人工做的验收固化成可重复的门禁。
 *
 * 为什么要有这个：改进日志里每一轮都在手工核对同一批东西
 * （站内引用能不能解析、JSON-LD 合不合法、canonical 与 og:url 是否一致、
 * sitemap 里的 URL 对不对得上真实路由、有没有根绝对路径）。
 * 手工核对既不可重复、也容易漏——写错了不会自动拦下来。
 * 部署流水线跑的是 `npm run build`，把检查挂进去，
 * 坏链接就会**卡住部署**，而不是发出去之后再回头修。
 *
 * 检查项：
 *   1. 本地引用（href/src）能否在产物里找到对应文件
 *   2. JSON-LD 能否被 JSON.parse 解析
 *   3. canonical 与 og:url 是否一致
 *   4. sitemap.xml 里的每个 URL 是否都有对应产物
 *   5. 反过来：每个产物页面是否都进了 sitemap（除 404）
 *   6. 站内引用是否都是相对路径（"整个文件夹扔到哪都能跑"）
 *   7. 产物里有没有 macOS 资源叉 ._* 文件
 *
 * 用法：node scripts/verify-site.cjs   （有错 exit 1）
 */
const fs = require("fs");
const path = require("path");

const SITE = path.resolve(__dirname, "../_site");
const problems = [];
const notes = [];

// 站点名（用于检查"标题退化成站点名"这一类 bug）
let SITE_TITLE = "";
try {
  SITE_TITLE = require(path.resolve(__dirname, "../src/_data/site.js")).title || "";
} catch {
  /* 读不到就跳过这条检查 */
}

const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

/* ---------- 收集产物文件 ---------- */
if (!fs.existsSync(SITE)) {
  console.error(`✗ 找不到产物目录 ${SITE}，请先运行 npm run build`);
  process.exit(1);
}

const allFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else allFiles.push(p);
  }
})(SITE);

const htmlFiles = allFiles.filter((f) => f.endsWith(".html") && !path.basename(f).startsWith("._"));
const rel = (f) => path.relative(SITE, f);

// exFAT 卷上 macOS 会留 AppleDouble 资源叉（._foo.css），它同样以 .css 结尾
const resourceForks = allFiles.filter((f) => path.basename(f).startsWith("._"));
if (resourceForks.length) {
  fail(`产物里有 ${resourceForks.length} 个 macOS 资源叉文件（._*），部署前必须清掉：`);
  resourceForks.slice(0, 5).forEach((f) => fail(`    ${rel(f)}`));
}

/* ---------- 引用解析 ---------- */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // http:, mailto:, data:, //cdn...
const refAttrs = /(?:href|src)\s*=\s*"([^"]*)"/gi;

/** 把一条本地引用解析成产物里的绝对路径；不是本地引用返回 null。 */
function resolveLocal(fromFile, raw) {
  const clean = raw.split("#")[0].split("?")[0].trim();
  if (!clean) return null; // 纯锚点
  if (EXTERNAL.test(clean)) return null; // 外链 / 协议相对
  if (clean.startsWith("#")) return null;

  let target = clean.startsWith("/")
    ? path.join(SITE, clean)
    : path.resolve(path.dirname(fromFile), clean);

  if (clean.endsWith("/")) {
    target = path.join(target, "index.html");
  } else if (!path.extname(target) && fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  }
  return target;
}

let refCount = 0;
let absoluteCount = 0;

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const from = rel(file);

  // 1) 本地引用能否解析
  for (const m of html.matchAll(refAttrs)) {
    const raw = m[1].trim();
    if (!raw) continue;

    if (raw.startsWith("/") && !EXTERNAL.test(raw)) {
      absoluteCount++;
      fail(`${from}: 根绝对路径引用 "${raw}" —— 会破坏"整个文件夹扔到哪都能跑"`);
    }

    const target = resolveLocal(file, raw);
    if (!target) continue;
    refCount++;
    if (!fs.existsSync(target)) {
      fail(`${from}: 引用 "${raw}" 找不到对应产物（解析为 ${rel(target)}）`);
    }
  }

  // 2) JSON-LD 能否解析
  const ldBlocks = [...html.matchAll(/<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of ldBlocks) {
    try {
      JSON.parse(m[1]);
    } catch (e) {
      fail(`${from}: JSON-LD 解析失败 —— ${e.message}`);
    }
  }

  // 3) canonical 与 og:url 是否一致
  const canonical = (html.match(/<link[^>]*rel\s*=\s*"canonical"[^>]*href\s*=\s*"([^"]*)"/i) || [])[1];
  const ogUrl = (html.match(/<meta[^>]*property\s*=\s*"og:url"[^>]*content\s*=\s*"([^"]*)"/i) || [])[1];
  if (canonical && ogUrl && canonical !== ogUrl) {
    fail(`${from}: canonical (${canonical}) 与 og:url (${ogUrl}) 不一致`);
  }
  if (!canonical && !from.endsWith("404.html")) {
    fail(`${from}: 缺 canonical`);
  }

  // 4) 标题不能退化成站点名
  //    base.njk 的标题回落是「title → 论文标题 → 站点名」三级。
  //    论文页（第三轮才加）front-matter 里没有 title，最初整页的
  //    <title>/og:title 全部退化成 "Yihang Lyu"——分享出去预览标题是
  //    作者名，浏览器标签页也是作者名。/blog/ 之前踩过同一个坑。
  //    这条规则把那个坑固化成门禁：任何页面的标题都不许等于站点名。
  const htmlTitle = (html.match(/<title>([^<]*)<\/title>/i) || [])[1];
  const ogTitleVal = (html.match(/<meta[^>]*property\s*=\s*"og:title"[^>]*content\s*=\s*"([^"]*)"/i) || [])[1];
  if (SITE_TITLE) {
    if (htmlTitle && htmlTitle.trim() === SITE_TITLE.trim()) {
      fail(`${from}: <title> 退化成站点名 "${SITE_TITLE}" —— 该页没有自己的标题`);
    }
    if (ogTitleVal && ogTitleVal.trim() === SITE_TITLE.trim()) {
      fail(`${from}: og:title 退化成站点名 "${SITE_TITLE}" —— 分享预览会显示作者名而不是页面标题`);
    }
  }
  if (!ogTitleVal) fail(`${from}: 缺 og:title`);
}

/* ---------- 4) sitemap 里的 URL 都要有对应产物 ---------- */
const sitemapPath = path.join(SITE, "sitemap.xml");
const sitemapUrls = [];
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, "utf8");
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = m[1].trim();
    sitemapUrls.push(u);
    let p = u;
    try {
      p = new URL(u).pathname; // 只取路径部分，域名可能变（预览域 vs 正式域）
    } catch {
      /* 保留原样 */
    }
    const target = path.join(SITE, p.replace(/^\//, ""), "index.html");
    const flat = path.join(SITE, p.replace(/^\//, ""));
    if (!fs.existsSync(target) && !fs.existsSync(flat)) {
      fail(`sitemap.xml: "${u}" 在产物里找不到对应页面`);
    }
  }
} else {
  fail("产物里没有 sitemap.xml");
}

/* ---------- 5) 每个产物页面都要进 sitemap（除 404） ---------- */
const sitemapPaths = new Set(
  sitemapUrls.map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  })
);
for (const file of htmlFiles) {
  const r = rel(file).replace(/index\.html$/, "");
  if (r === "404.html") continue;
  if (!sitemapPaths.has("/" + r) && !sitemapPaths.has("/" + r.replace(/\/$/, ""))) {
    fail(`${rel(file)}: 产物里有这个页面，但 sitemap.xml 没收录`);
  }
}

/* ---------- 汇总 ---------- */
console.log(`产物：${htmlFiles.length} 个 HTML 页，${refCount} 条本地引用，${sitemapUrls.length} 条 sitemap URL`);
if (absoluteCount === 0) console.log("站内引用全部为相对路径 ✓");

if (problems.length) {
  console.error(`\n✗ 自检未通过，共 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("✓ 站点自检全部通过");
