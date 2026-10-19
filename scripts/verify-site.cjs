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
 * 编号体系（第九轮统一，务必先看这张表再引用条号）：
 *   每页检查（对每个 HTML 产物跑一遍）：
 *     1. 本地引用（href/src）能否在产物里找到对应文件
 *     2. JSON-LD 能否被 JSON.parse 解析
 *     3. canonical 与 og:url 是否一致（且非错误页必须有 canonical）
 *    4b. 错误页的索引控制：404 页要有 noindex 与 follow（按 token 判定）、
 *        不许有 canonical、不许有 hreflang；
 *        正常页**不许**有 noindex
 *    4c. 标题不能退化成站点名（<title> / og:title），且必须有 og:title
 *   全站检查（扫全部产物）：
 *     5. sitemap.xml 里的每个 URL 都有对应产物
 *     6. 反过来：每个产物页面都进了 sitemap（除 404）
 *     7. feed.xml 里有 item、每条 item 的 link 指向真实页面
 *     8. 论文页的 JSON-LD 里有 Dataset / SoftwareSourceCode 实体
 *     9. 身份类 meta（twitter:site/creator）没有写死的兜底值
 *    10. JSON-LD 里的 @id / url 都是绝对地址
 *    11. og:type 与页面性质一致；article:* 只出现在 article 页上
 *    12. 全站"本人"的 @id 只有一个取值
 *    13. /publications.bib 与论文页 Copy 按钮逐字一致
 *    14. 下载的 .bib 里不含 HTML 实体
 *    15. 同一张图在页面里只有一套 alt 文本
 *    16. 404 页不得声明内容类实体（ScholarlyArticle 等）
 *    17. robots.txt 的"生成时间"是真正的构建时间，不是文件创建时间
 *    18. sitemap 的 <lastmod> 是真实的 git 提交时间（逐页核对；浅克隆直接失败）
 *    19. 内容类实体的 @id 全站一致，且指向真实存在的页面
 *
 * 旧编号 → 新编号对照（历史日志/commit 里引用的是旧号，追溯时用这张表）：
 *   旧 1 / 2 / 3      → 新 1 / 2 / 3
 *   旧 3b            → 新 4b   （第七轮 commit message 把它写成"第 15 条"，
 *                              同一个东西两个号，后来的轮次照着引用会指错对象）
 *   旧 4（标题退化） → 新 4c
 *   旧 4（sitemap）  → 新 5    （旧版里"第 4 条"被用了两次）
 *   旧 5             → 新 6
 *   旧 6             → 新 7
 *   旧 7             → 新 8
 *   旧 8             → 新 9
 *   旧 9             → 新 10
 *   旧 10            → 新 11
 *   旧 11            → 新 12
 *   旧 12            → 新 13
 *   旧 13            → 新 14   （旧版里这条缩在第 12 条的 else 分支内，
 *                              从代码上看不出它是一条独立门禁）
 *   旧 14            → 新 15
 *   旧 15            → 新 4b   （即旧 3b，见上）
 *   旧 16            → 新 17
 *   （无）            → 新 16   （第九轮新增：404 页不得声明内容类实体）
 *   （无）            → 新 18   （第九轮新增：sitemap lastmod 必须是真实提交时间）
 *   （无）            → 新 19   （第九轮新增：内容类实体的 @id 全站一致）
 *
 * 用法：node scripts/verify-site.cjs   （有错 exit 1）
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// 产物目录。默认是仓库里的 _site；SITE_DIR 只是给"故障注入"用的——
// 改产物做注入测试时如果直接改 _site，会和并发的 build 抢同一个目录，
// 也可能在 exFAT 卷上留下 ._* 资源叉。指向 /tmp 下的副本就没有这两个问题。
const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "../_site");
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
// 每页解析成功的 JSON-LD 记录，供第 10 / 12 / 16 条门禁复查
const ldRecords = [];

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
    let parsed = null;
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      fail(`${from}: JSON-LD 解析失败 —— ${e.message}`);
    }
    if (parsed) ldRecords.push({ from, parsed });
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

  // 4b) 错误页的索引控制（与下面的 4c 同属"每页检查"这一族）
  //     404 页此前既**没有 noindex**、又发着指向自身的 canonical
  //     （实测 `<link rel="canonical" href=".../404.html">`）——等于主动向
  //     搜索引擎声明"404 也是正式内容页"，而错误页 URL 本该被排除在索引外。
  //     规范做法：
  //       · 错误页 → robots = noindex, follow（不收录这个 URL 本身，
  //                  但 follow 保留页内有效链接的抓取与权重传递）；
  //       · 正常页 → **不许**出现 noindex（那是把好页面自己藏起来，
  //                  同样属于静默缺陷，一并兜住）。
  //     ⚠️ 这段在第七轮被加进来时，注释编号写的是 "3b"，而同一轮的
  //     commit message 与日志写的是"第 15 条"——同一个东西两个号，
  //     后来的轮次照着引用就会指错对象。第九轮把编号体系统一了：
  //     **每页检查 = 1–4c，全站检查 = 5–17**，见文件头部的编号对照表。
  const isNotFound = from.endsWith("404.html");
  const robotsMeta = (html.match(/<meta[^>]*name\s*=\s*"robots"[^>]*content\s*=\s*"([^"]*)"/i) || [])[1];
  // robots 指令必须**按 token 精确匹配**，不能用子串正则：
  // "nofollow" 里含 "follow" 子串 → /follow/i 对 "noindex, nofollow" 判 true，
  // 于是"nofollow 冒充 follow"会被放过 —— 而那正是这条要抓的 case。
  const robotsTokens = (robotsMeta || "")
    .split(",")
    .map((t) => t.trim().toLowerCase());
  const hasNoindex = robotsTokens.includes("noindex");
  const hasFollow = robotsTokens.includes("follow");
  if (isNotFound) {
    if (!hasNoindex) {
      fail(`${from}: 404 页缺少 noindex（robots meta = ${robotsMeta || "无"}）`);
    }
    // follow 不能丢：noindex 只表示"不收录这个 URL 本身"，
    // follow 才表示"仍沿链抓页内的有效链接"（页脚还有 sitemap / RSS / 联系方式）。
    // 写成 "noindex, nofollow" 会让错误页里的链接彻底不被抓取。
    if (!hasFollow) {
      fail(
        `${from}: 404 页的 robots 少了 follow（robots meta = ${robotsMeta || "无"}）—— ` +
          "noindex 只表示不收录这个 URL 本身，follow 才表示仍沿链抓页内有效链接"
      );
    }
    if (canonical) {
      fail(`${from}: 404 页不应有 canonical（${canonical}）`);
    }
    // hreflang 那一组同样是在声明"这个 URL 是某个语言版本的正式地址"，
    // 错误页发它与发 canonical 是同一类错误。
    const hreflangLinks = html.match(/<link[^>]*hreflang\s*=/gi) || [];
    if (hreflangLinks.length) {
      fail(`${from}: 404 页不应有 hreflang（发现 ${hreflangLinks.length} 个）`);
    }
  } else if (hasNoindex) {
    fail(`${from}: 正常页不该有 noindex（robots meta = ${robotsMeta}）`);
  }

  // 4c) 标题不能退化成站点名
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

/* ---------- 5) sitemap 里的 URL 都要有对应产物 ---------- */
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

/* ---------- 6) 每个产物页面都要进 sitemap（除 404） ---------- */
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

/* ---------- 7) RSS 订阅源不能是空的 ----------
   /feed.xml 此前只取 collections.blog，而那个集合是空的，feed 里一条 item
   都没有，页脚却挂着一个 RSS 入口。一个点开永远是空白的订阅源，比没有
   更糟——而且它不会报错，只会安静地空着，所以必须做成门禁。

   同时校验每条 item 的 <link> 都能在产物里找到对应页面：订阅源里的
   死链是读者唯一会踩到的路径，比页面里的死链更隐蔽。 */
const feedPath = path.join(SITE, "feed.xml");
if (!fs.existsSync(feedPath)) {
  fail("产物里没有 feed.xml");
} else {
  const xml = fs.readFileSync(feedPath, "utf8");
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  if (!items.length) {
    fail("feed.xml 里一条 item 都没有——订阅源是空的，页脚的 RSS 入口点开只有空白");
  }
  let feedItemCount = 0;
  for (const m of items) {
    feedItemCount++;
    const body = m[1];
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [])[1];
    const pubDate = (body.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1];
    if (!title || !title.trim()) fail(`feed.xml 第 ${feedItemCount} 条 item 没有标题`);
    if (!pubDate || !pubDate.trim()) {
      fail(`feed.xml 第 ${feedItemCount} 条 item 没有 pubDate`);
    }
    if (!link || !link.trim()) {
      fail(`feed.xml 第 ${feedItemCount} 条 item 没有 link`);
      continue;
    }
    let p = link.trim();
    try {
      p = new URL(p).pathname;
    } catch {
      /* 保留原样 */
    }
    const target = path.join(SITE, p.replace(/^\//, ""), "index.html");
    const flat = path.join(SITE, p.replace(/^\//, ""));
    if (!fs.existsSync(target) && !fs.existsSync(flat)) {
      fail(`feed.xml 第 ${feedItemCount} 条 item 的 link "${link}" 在产物里找不到对应页面`);
    }
  }
  note(`feed.xml ${feedItemCount} 条 item`);
}

/* ---------- 8) 论文页必须声明数据集与可复现胶囊 ----------
   站点确实发布了两条带 DOI 的产出（Zenodo 数据集、Code Ocean 胶囊），
   它们的 schema.org 实体类型是 DataCite 自己映射的
   （types.schemaOrg = Dataset / SoftwareSourceCode）。
   实体类型写错或整个消失，页面不会报错——只会安静地不再被数据集检索
   工具发现，所以做成门禁。 */
const paperHtml = allFiles
  .filter((f) => /papers\/.+\/index\.html$/.test(rel(f)))
  .map((f) => [rel(f), fs.readFileSync(f, "utf8")]);
if (!paperHtml.length) {
  fail("产物里没有论文独立页（papers/*/index.html）");
}
for (const [from, html] of paperHtml) {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];
  const entities = [];
  for (const b of blocks) {
    let parsed;
    try {
      parsed = JSON.parse(b[1]);
    } catch {
      continue; // 解析失败已由第 2 条报过
    }
    const nodes = Array.isArray(parsed["@graph"])
      ? parsed["@graph"]
      : parsed["@type"]
        ? [parsed]
        : [];
    entities.push(...nodes);
  }
  for (const type of ["Dataset", "SoftwareSourceCode"]) {
    if (!entities.some((e) => e && e["@type"] === type)) {
      fail(`${from}: JSON-LD 里没有 ${type} 实体——数据集/胶囊不再能被结构化检索发现`);
    }
  }
}

/* ---------- 9) 身份类 meta 不得声明没有数据支撑的账号 ----------
   twitter:site / twitter:creator 不是普通外链：它的内容被搜索引擎当成
   "这个账号属于本站作者"。写错的后果不是死链，而是**把本站归属挂到
   别人名下**。此前 base.njk 写死了两个猜测值（@meteohub 是别人的账号、
   @oldsixxiaolv 在 X 上不存在），页面照出、构建照过、没有任何报错。

   这条门禁的判据：产物里出现的身份句柄，必须**在 site.js 数据里能找到
   同样的值**。写死在模板里的兜底值一律拦下——它不来自数据，就是猜测。

   只查身份类字段（twitter:site / twitter:creator）。普通外链写错顶多是
   死链，交给人判断，不适合用脚本一票否决。 */
const siteData = (() => {
  try {
    return require(path.resolve(__dirname, "../src/_data/site.js"));
  } catch {
    return null;
  }
})();
if (siteData) {
  // 收集数据里出现过的所有字符串（含嵌套），作为"有数据支撑"的证据集
  const dataStrings = new Set();
  (function collect(v) {
    if (typeof v === "string") dataStrings.add(v.trim());
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  })(siteData);

  const IDENTITY_META = ["twitter:site", "twitter:creator"];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    for (const key of IDENTITY_META) {
      const re = new RegExp(
        `<meta[^>]*name=["']${key}["'][^>]*content=["']([^"']*)["']`,
        "gi"
      );
      for (const m of html.matchAll(re)) {
        const value = m[1].trim();
        if (!value) {
          fail(`${rel(file)}: ${key} 的内容是空的——身份字段要么给真实句柄，要么整条不输出`);
          continue;
        }
        if (!dataStrings.has(value)) {
          fail(
            `${rel(file)}: ${key}="${value}" 在 site.js 数据里找不到对应值——` +
              `这是写死在模板里的兜底值，属于对外声明归属，必须改成数据驱动`
          );
        }
      }
    }
  }
}

/* ---------- 10. JSON-LD 里的 @id / url 必须是绝对地址 ----------
   这条门禁是被一个真 bug 逼出来的：eleventy.config.js 的 jsonLdArticles
   签名有 4 个形参（pubs, ownerOrcid, excludeKey, siteUrl），但 base.njk
   的调用只传了 2 个——JS 把多余的实参**静默丢弃**（不报错、页面照出），
   于是"本人"的 @id 被拼成相对路径 "/#person"。

   后果有两层，都很安静：
     ① 相对路径不是合法 IRI，消费方按相对路径解析会失败；
     ② 它与同一个页面上 Person 实体的绝对 @id 对不上——"同一个人被读成
        6 个人"这个坑换个形式再犯一次。
   页面不会报错、构建不会失败、页面照出，只有懂行的人读得出来。
   所以这类"实参数量对不上"的 bug 必须有机器门禁兜住。 */
const ABSOLUTE_URL = /^https?:\/\//i;
function collectNodes(node, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => collectNodes(n, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;
  out.push(node);
  for (const v of Object.values(node)) collectNodes(v, out);
  return out;
}

/* JSON-LD 里 "@type" 可以是字符串，也可以是**字符串数组**（多类型实体）。
   判据必须两种都看，否则 "@type" 一旦写成数组，整条判据就被静默关掉：
     · 门禁 12 / 16 早先只认字符串 → 数组型 @type 被 continue 跳过；
     · 门禁 19 早先只取数组第 0 项 → ["Person","ScholarlyArticle"] 被
       当成 Person 跳过，后面那个作品类型完全没被看见。
   这与"删掉 <!-- source: --> 标注"是同一类失效：**判据自己被卸掉**，
   而产物照常出、build 照过、门禁照绿。 */
function typesOf(node) {
  const raw = node["@type"];
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  }
  return [];
}
for (const { from, parsed } of ldRecords) {
  for (const node of collectNodes(parsed)) {
    for (const key of ["@id", "url"]) {
      const v = node[key];
      if (typeof v !== "string") continue;
      if (!v.trim()) continue;
      if (!ABSOLUTE_URL.test(v.trim())) {
        fail(
          `${from}: JSON-LD 的 ${key} 是相对地址 "${v}" —— 必须是绝对 URL` +
            `（多半是 filter 少传了一个实参，实参被 JS 静默丢弃）`
        );
      }
    }
  }
}

/* ---------- 11. og:type 要与页面性质一致 ----------
   此前 base.njk 写的是"除首页外一律 article"，于是 /about/、/blog/、
   /papers/ 列表页、/404.html 统统自称 article——它们都不是文章，
   分享卡片与聚合器会按文章语义解读它们（取 article:published_time 等）。
   ogp.me 的 Types 段原文："Any non-marked up webpage should be treated
   as og:type website"。只有论文详情页（front-matter 有 pubKey）才是文章。

   同时校验 article:* 只出现在 og:type=article 的页面上——这两件事是
   一条规则的两面：声明自己是文章，就得带文章的属性；不是文章的页面，
   就不许挂 article:* 冒充。 */
const isPaperDetail = (r) => /^papers\/[^/]+\/index\.html$/.test(r);
for (const file of htmlFiles) {
  const from = rel(file);
  const html = fs.readFileSync(file, "utf8");
  const ogType = (html.match(/<meta[^>]*property\s*=\s*"og:type"[^>]*content\s*=\s*"([^"]*)"/i) || [])[1];
  const wantsArticle = isPaperDetail(from);
  if (!ogType) {
    fail(`${from}: 缺 og:type`);
    continue;
  }
  if (wantsArticle && ogType !== "article") {
    fail(`${from}: 论文详情页的 og:type 应为 article，实际是 "${ogType}"`);
  }
  if (!wantsArticle && ogType !== "website") {
    fail(`${from}: 非文章页的 og:type 应为 website，实际是 "${ogType}"`);
  }
  const articleMetas = [...html.matchAll(/<meta[^>]*property\s*=\s*"(article:[^"]+)"[^>]*content/gi)];
  if (!wantsArticle && articleMetas.length) {
    fail(
      `${from}: 非文章页却带了 ${articleMetas.length} 个 article:* 属性` +
        `（${articleMetas.map((m) => m[1]).join(", ")}）——og:type 与 article 扩展必须一致`
    );
  }
  if (wantsArticle && !articleMetas.length) {
    fail(`${from}: 论文页 og:type=article 却没有一个 article:* 属性——分享卡片拿不到发表日期/刊名/作者`);
  }
}

/* ---------- 12. 全站"本人"的 @id 必须只有一个取值 ----------
   schema.org 里 @id 是"同一个实体"的稳定标识：不同页面上描述同一个人的
   节点，@id 相同才会被合并成一个节点；不同就会被当成多个人。
   站点上描述"本人"的节点有好几处来源（base.njk 的 Person 实体、
   jsonLdPaper 的作者、jsonLdArticles 的作者、数据集/胶囊的 creator），
   必须共用同一个 @id。

   ⚠️ 判据是**按人名找节点**，不是按 @id 的长相（不是"凡是 #person 结尾
   的都算"）。早先的第一版就是这么写的，结果**故障注入测不出来**：
   把某页的 @id 改成 ".../#person-v2"（形状变了，语义上仍是"本人"），
   门禁因为"结尾不再是 #person"而根本没看见这个节点，exit 0 —— 一个
   永远抓不到人的检查比没有检查更糟。改成人名匹配后，改形状也逃不掉。 */
const OWNER_NAME = (siteData && siteData.author && siteData.author.nameAsPublished) || "Yihang Lyu";
const ownerIds = new Set();
let ownerNodes = 0;
for (const { from, parsed } of ldRecords) {
  for (const node of collectNodes(parsed)) {
    if (!typesOf(node).includes("Person")) continue;
    if (String(node.name || "").trim() !== OWNER_NAME) continue;
    ownerNodes++;
    const id = node["@id"];
    if (typeof id !== "string" || !id.trim()) {
      fail(`${from}: 描述"${OWNER_NAME}"的 Person 节点没有 @id —— 消费方会把它当成另一个独立的人`);
      continue;
    }
    ownerIds.add(id.trim());
  }
}
if (ownerIds.size > 1) {
  fail(
    `全站出现了 ${ownerIds.size} 个不同的"本人" @id（${[...ownerIds].join(", ")}）` +
      `——同一个实体必须用同一个 @id，否则会被读成多个人`
  );
} else if (ownerIds.size === 1) {
  note(`"本人"实体 @id = ${[...ownerIds][0]}（${ownerNodes} 个节点，全站统一）`);
} else if (ownerNodes === 0) {
  fail(`产物里找不到任何描述"${OWNER_NAME}"的 Person 节点`);
}

/* ---------- 13. /publications.bib 必须与论文页的 Copy 按钮逐字一致 ----------
   论文页给了 3 个 Copy 按钮（论文 / 数据集 / 胶囊），而 /publications.bib
   是读者下载全部引用的入口。此前这个文件**只有论文那一条**：页面能复制
   3 条、文件里只有 1 条，两处口径不一致——读者下载后会以为数据没有
   引用条目。

   判据不看"应该有几条"（那是写死的数），而看**两处文本是否逐字相同**：
   把 .bib 的条目与论文页 <pre class="paper-cite__bibtex"> 块的内容一一
   对比。这样将来加了新资源、加了论文，两边自动跟着变，不会再错位。

   ⚠️ 比对前必须**解码页面侧的 HTML 实体**，而且只解页面侧、不解 .bib 侧：
     · 页面侧是 nunjucks 转义过的（autoescape 默认开着）：`\&` → `&#92;&amp;`
     · .bib 侧是**原始 BibTeX**（下载文件，必须能被 Zotero 直接读）
   两者差的就是这一层实体。
   不解 .bib 侧的原因：.bib 侧是原文，解它等于把原文里的 & 改成别的——
   遇到 URL 查询串里的 & 时两边就会错位。原文就该原样比。

   ⚠️ 这条门禁以前正是靠"两边同样被转义"才逐字通过的 —— 它**结构上就抓不到
   转义 bug**：转义错了反而更"一致"。所以下面第 14 条直接盯"文件里不该有实体"。 */

/** 把 HTML 实体解码回原字符。
    nunjucks 的 autoescape 会把 & " ' < > \ ` 转成
    &amp; &quot; &#39; &lt; &gt; &#92; &#96;，页面上的文本拿到的是转义后的形态。
    顺序：先解数字实体（&#39; / &#92; / &#96; 都在这），再解命名实体，
    `&amp;` 放最后 —— 否则 "&amp;lt;" 会被解成 "&lt;" 再解成 "<"（多解一层）。 */
const decodeHtmlEntities = (s) =>
  String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** nunjucks 真会产生的那些 HTML 实体。裸 & 不算 —— URL 查询串里本来就有 &。 */
const HTML_ENTITY_RE = /&(?:amp|quot|lt|gt|#39|#92|#96);|&#(?:x[0-9a-fA-F]+|\d+);/;

const bibPath = path.join(SITE, "publications.bib");
// 本节开始前的问题数：用来判断"这一节是否一条问题都没有"，
// 从而决定那句"逐字一致"的 note 能不能打印（失败时打印它就是自相矛盾）。
const problemsBeforeBibCheck = problems.length;
// bibText 提到模块作用域：第 13 条与第 14 条都要读它。
// （此前它被声明在 else 块里，第 14 条独立成块后就是 undefined ——
//  这条门禁会直接抛 ReferenceError，整个验收脚本崩掉。）
const bibExists = fs.existsSync(bibPath);
const bibText = bibExists ? fs.readFileSync(bibPath, "utf8") : "";
if (!bibExists) {
  fail("产物里没有 publications.bib");
} else {
  const bibEntries = bibText
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!bibEntries.length) {
    fail("publications.bib 里一条条目都没有");
  }
  for (const e of bibEntries) {
    if (!/^@(article|dataset|software)\{/.test(e)) {
      fail(`publications.bib 的条目不是 @article/@dataset/@software：${e.slice(0, 40)}…`);
    }
    if (!/\n\s*doi\s*=\s*\{[^}]+\}/.test(e)) {
      fail(`publications.bib 有条目没有 doi 字段：${e.split("\n")[0]}`);
    }
  }
  // 论文页可复制的 BibTeX 块
  const copyBlocks = [];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(
      /<pre[^>]*class="[^"]*paper-cite__bibtex[^"]*"[^>]*>([\s\S]*?)<\/pre>/gi
    )) {
      copyBlocks.push({ from: rel(file), text: m[1].trim() });
    }
  }
  if (copyBlocks.length && copyBlocks.length !== bibEntries.length) {
    fail(
      `publications.bib 有 ${bibEntries.length} 条，但论文页有 ${copyBlocks.length} 个可复制的 BibTeX 块` +
        `——读者下载的文件与页面上能复制的条目对不上`
    );
  }
  for (const { from, text } of copyBlocks) {
    const decoded = decodeHtmlEntities(text);
    if (!bibEntries.includes(decoded)) {
      // 解码后**仍**含实体，说明多半不是"少解了一层"，而是两侧都被转义了
      // （.bib 模板漏了 | safe）。给一句能指到根因的诊断，而不是笼统的"找不到"。
      if (HTML_ENTITY_RE.test(decoded)) {
        fail(
          `${from}: 这个 BibTeX 块在 publications.bib 里找不到逐字相同的条目 —— ` +
            `而且解码后仍含 HTML 实体 "${decoded.match(HTML_ENTITY_RE)[0]}"，` +
            `怀疑 publications.bib 自己也被 autoescape 转义了（模板漏了 | safe）`
        );
      } else {
        fail(`${from}: 有一个可复制的 BibTeX 块在 publications.bib 里找不到逐字相同的条目`);
      }
    }
  }
  // 这句 note 只能在**本节一条问题都没有**时才说"逐字一致"：
  // 无条件打印的话，失败时同一屏上既报"找不到逐字相同的条目"、
  // 又说"与论文页逐字一致"—— 自相矛盾，且让人怀疑门禁是不是在乱报。
  if (problems.length === problemsBeforeBibCheck) {
    note(
      `publications.bib ${bibEntries.length} 条，与论文页 ${copyBlocks.length} 个复制块逐字一致（页面侧已解码 HTML 实体）`
    );
  }

}

/* ---------- 14. 下载的 .bib 里不得出现 HTML 实体 ----------
   publications.bib 是**下载文件**，读者拿它直接喂给 Zotero / BibDesk。
   里面出现 `&#92;&amp;` 这种实体，就说明它被 nunjucks 的 autoescape 加工过
   —— 那不是合法 BibTeX，导入器会读出乱码，或直接把字段名认错。

   这条比第 13 条更直接：第 13 条比的是"两处是否一致"，而修复前两边
   **同样**被转义，所以照样通过；这条直接问"文件里有没有实体"。

   判据只认 nunjucks 真会产生的那些实体；裸 & 不算 —— URL 查询串里本来就有 &。

   ⚠️ 这条此前是**缩进在第 13 条的块里**的（共用一个 else 分支），
   于是从代码上根本看不出它是一条独立门禁——编号体系第九轮才理顺。 */
if (bibExists) {
  const entityHit = bibText.match(HTML_ENTITY_RE);
  if (entityHit) {
    fail(
      `publications.bib 里出现了 HTML 实体 "${entityHit[0]}" —— 下载文件必须是原始 BibTeX，` +
        `不能带 HTML 转义（多半是模板漏了 | safe）`
    );
  }
}

/* ---------- 15. 同一张图在页面里必须只有一套 alt 文本 ----------
   一张图在三处各写各的 alt，是这类站点最常见的静默缺陷：页面照出、构建照过、
   没有任何报错，只有读屏软件用户和社交平台会读错。

   论文页踩过这个坑 —— 成果图 trmm-fig10.jpg：
     <img alt>         = site.js 的 publications[].figure.alt（准确）
     og:image:alt      = paper.md front-matter 的 coverAlt（写的是"复合雷达
                          回波剖面 / echo coverage percentage"，与图不符）
     twitter:image:alt = 同上
   图只有一张，alt 有两套，而且两套互相从不校验。

   判据是**按同一张图**比，不是"页面里所有 <img> 的 alt 都要等于 og:image:alt"
   —— 后者会把首页的作者头像也拽进来（首页 og 卡片是作者身份图，不是头像）。
   做法：把 og:image / twitter:image 的 URL 解析成站内路径，跟页面上 <img>
   的 src 解析到同一路径的那张对上，两处 alt 必须逐字相同。

   另外钉一条：论文页分享卡片用的图，必须是页面上真给读者看的那张图。 */

/** 把一个 URL / 路径解析成相对产物根的站内路径（外链只取 pathname）。 */
function siteRelPath(fromFile, raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      s = new URL(s).pathname;
    } catch {
      return null;
    }
  }
  s = s.split("#")[0].split("?")[0].trim();
  if (!s) return null;
  const abs = s.startsWith("/") ? path.join(SITE, s) : path.resolve(path.dirname(fromFile), s);
  return path.relative(SITE, abs).split(path.sep).join("/");
}

/** 把页面里 og:image / og:image:alt、twitter:image / twitter:image:alt
    按出现顺序配成对（同一组里紧跟在 image 后面、且还没配上 alt 的那个 alt 属于它）。 */
function pairImageAlts(html, prefix) {
  const pairs = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const key = (tag.match(/\b(?:property|name)="([^"]*)"/i) || [])[1];
    if (key !== `${prefix}:image` && key !== `${prefix}:image:alt`) continue;
    const content = (tag.match(/\bcontent="([^"]*)"/i) || [])[1] || "";
    if (key === `${prefix}:image`) {
      pairs.push({ image: content, alt: null });
    } else if (pairs.length && pairs[pairs.length - 1].alt === null) {
      pairs[pairs.length - 1].alt = content;
    }
  }
  return pairs;
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const from = rel(file);

  // 页面上每一张 <img>：站内路径 → 该路径出现过的所有 alt
  const imgAlts = new Map();
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/\bsrc="([^"]*)"/i) || [])[1];
    if (!src) continue;
    const alt = (tag.match(/\balt="([^"]*)"/i) || [])[1] || "";
    const p = siteRelPath(file, src);
    if (!p) continue;
    if (!imgAlts.has(p)) imgAlts.set(p, []);
    imgAlts.get(p).push(alt);
  }

  for (const prefix of ["og", "twitter"]) {
    for (const { image, alt } of pairImageAlts(html, prefix)) {
      const p = siteRelPath(file, image);
      if (!p || !imgAlts.has(p)) continue; // 这张图没在页面上出现，不归这条管
      for (const imgAlt of imgAlts.get(p)) {
        if (String(alt || "").trim() !== String(imgAlt || "").trim()) {
          fail(
            `${from}: ${prefix}:image:alt 与页面上同一张图的 <img alt> 不是同一句话 —— ` +
              `一张图只能有一套 alt（现在是 "${String(alt || "").slice(0, 36)}…" vs ` +
              `"${String(imgAlt || "").slice(0, 36)}…"）`
          );
          break;
        }
      }
    }
  }

  // 论文页：分享卡片用的图必须是页面上真给读者看的那张
  if (isPaperDetail(from)) {
    const shown = [...imgAlts.keys()];
    const ogPaths = pairImageAlts(html, "og")
      .map((x) => siteRelPath(file, x.image))
      .filter(Boolean);
    if (ogPaths.length && !ogPaths.some((p) => shown.includes(p))) {
      fail(`${from}: 论文页的 og:image 不是页面上显示的任何一张图 —— 分享卡片的图与读者看到的图对不上`);
    }
  }
}

/* ---------- 16. 404 页不得声明内容类实体 ----------
   错误页的可见文案是 "Nothing here"——一个**不存在的页面**。但它此前
   仍带着全站的 @graph：一个 ScholarlyArticle 节点，带 headline（论文标题）、
   abstract（摘要）、funder/Grant（NSFC 资助）、isPartOf（期刊）、
   encoding/MediaObject（成果图）。

   这是**明确的误导信号**，不是口味问题：消费方会把这些实体归到
   `/404.html` 这个 URL 上。而线上 `/404.html` **直接访问返回 200**
   （不是靠访问不存在的路径才 404），所以它是一个可被抓取的真实页面。

   判据按**内容类实体**列黑名单，而不是"404 页只能有 Person"：
     · 允许 Person（描述站点作者本人，url 指向站点根，与"本页是论文"无关）；
     · 禁止 ScholarlyArticle / Dataset / SoftwareSourceCode / Article /
       BlogPosting / NewsArticle / TechArticle / ScholarlyChapter / Review /
       CreativeWork / Periodical / Grant / MediaObject 等——这些每一个
       都在说"这里有**一份具体的产出**"。
   ⚠️ Periodical / Grant / MediaObject 也列进来了：它们是 ScholarlyArticle
   的嵌套节点，只跟着文章实体出现；放过它们等于留了个后门。 */
const CONTENT_TYPES = new Set([
  "ScholarlyArticle",
  "Article",
  "Dataset",
  "SoftwareSourceCode",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
  "ScholarlyChapter",
  "Review",
  "CreativeWork",
  "Periodical",
  "Grant",
  "MediaObject",
]);
for (const { from, parsed } of ldRecords) {
  if (!from.endsWith("404.html")) continue;
  for (const node of collectNodes(parsed)) {
    for (const type of typesOf(node)) {
      if (!CONTENT_TYPES.has(type)) continue;
      fail(
        `${from}: JSON-LD 里出现了内容类实体 "${type}" —— ` +
          `错误页不该声明论文/数据集/胶囊（页面文案是 "Nothing here"，` +
          `而实体却在对外声明这里有产出）`
      );
    }
  }
}

/* ---------- 17. robots.txt 的"生成时间"必须是真正的构建时间 ----------
   robots.txt 里那行 `# 生成时间：…` 此前取的是 `page.date`，而对模板页
   而言 page.date = **源文件的 birthtime（创建时间）**。实测本机：
     src/robots.njk birthtime = 2026-10-02T04:29:21.600Z
     产物里那行"生成时间"     = 2026-10-02T04:29:21.600Z   ← 逐字相同
   而站点实际是 10-19 建的。那行字**标着"生成时间"却永远停在 10-02**——
   这不是"不准"，是**一个会误导人的标签**（读者会以为产物很旧）。

   在 CI 上更隐蔽：actions/checkout 会重新写盘，birthtime 变成 checkout
   那一刻，于是"生成时间"看起来正好等于部署时刻——**恰好蒙对**，所以一直
   没人发现。机制是错的，只是碰巧两次都撞对了。

   判据（刻意不依赖"当前时间"）：
     · 必须是合法的 ISO-8601 时间戳；
     · **不得**等于源文件的 birthtime（那正是"拿文件创建时间冒充生成时间"）；
     · 不得早于源文件最后一次修改时间（构建不早于它自己的源文件）。
   为什么不用"距今 N 分钟"：故障注入会把产物复制到 /tmp 再跑门禁，
   那种"新鲜度"判据会让**每一份历史副本都误报**。源文件相对判据在
   复制后依然成立。 */
const robotsTxtPath = path.join(SITE, "robots.txt");
const robotsSrcPath = path.resolve(__dirname, "../src/robots.njk");
if (fs.existsSync(robotsTxtPath)) {
  const robotsTxt = fs.readFileSync(robotsTxtPath, "utf8");
  const stampLine = robotsTxt.match(/^#\s*生成时间[：:]\s*(.+?)\s*$/m);
  if (!stampLine) {
    fail("robots.txt: 找不到「生成时间」这一行");
  } else {
    const stamp = stampLine[1].trim();
    const parsed = Date.parse(stamp);
    if (Number.isNaN(parsed)) {
      fail(`robots.txt: 「生成时间」不是合法时间戳 —— "${stamp}"`);
    } else if (fs.existsSync(robotsSrcPath)) {
      const st = fs.statSync(robotsSrcPath);
      const birthIso = new Date(st.birthtime).toISOString();
      if (parsed === Date.parse(birthIso)) {
        fail(
          `robots.txt: 「生成时间」等于源文件的创建时间（birthtime = ${birthIso}）—— ` +
            `那是"文件什么时候被创建"，不是"这次构建是什么时候"`
        );
      }
      // 构建不早于源文件最后一次修改（留 2 秒容差，避开写盘与取时间的先后）
      if (parsed < st.mtime.getTime() - 2000) {
        fail(
          `robots.txt: 「生成时间」早于源文件最后一次修改（${st.mtime.toISOString()}）—— ` +
            `构建时间不可能比它自己的源文件还早`
        );
      }
    }
  }
}

/* ---------- 18. sitemap 的 <lastmod> 必须是真实的 git 提交时间 ----------
   线上实测（2026-10-16 那次部署）：/ 与 /about/ 与 /blog/ 三条 <lastmod>
   精确到同一毫秒（09:51:14.887~.894Z），而部署就在 push 后 13 秒。
   根因是 lastmod 取的是 entry.date —— 对模板页而言那是源文件的
   **birthtime（创建时间）**，而 CI 的 actions/checkout 会重新写盘，
   birthtime 变成 checkout 那一刻。于是每次部署，全站 lastmod 一起跳到
   部署时刻：那不是"内容最后一次改变的时间"，是个**假时间戳**，
   还会让搜索引擎以为全站每次部署都被整体重写了一遍。

   现在 lastmod 取"该页源文件最后一次 git 提交时间"
   （eleventy.config.js 的 lastCommitTime filter）。这条门禁守住它，
   判据是五条互补的规则：

     A. **浅克隆一律失败**（无条件，不只 CI）。
        浅克隆里 `git log -1 -- <file>` 只能查到 HEAD 那一次，查出来的值
        "看起来像提交时间、其实是 checkout 时间"——症状与 birthtime 一模一样
        （全站一起跳到部署时刻），但更难被发现。
        ⚠️ 这条判定必须放在"产物里有没有 lastmod"**之外**：
        浅克隆里 filter 返回空串 → 产物零 lastmod → 若把判定写在
        "遍历带 lastmod 的条目"里，循环体一次都不执行 → 门禁放行，
        恰好放过了最该抓的那次退化。
     B. **不在 git 仓库里 → 产物里不许有 lastmod**。
        源码 zip 分发本来就没有 git 历史，这不是"退化"，不该拦人；
        但产物里若出现了 lastmod，只能说明有人在没有真实数据源的情况下
        硬凑了一个值。
     C. **给了就必须是真的**：合法 ISO 时间、不得晚于构建时刻、
        且等于 src 下某个源文件真实的最后一次提交时间（集合比对）。
     D. **逐页核对（值）**：产物里每条 <url> 都带着它自己的源文件路径
        （`<!-- source: ... -->`，由 sitemap.njk 写入）。该页的 lastmod
        必须**精确等于**那个源文件的最后提交时间。
        集合比对（C）发现不了"取错源文件"——把全站 5 条 lastmod 都填成
        src/index.njk 的提交时间，集合判定照样通过。
     E. **逐页核对（有/无）+「lastmod 整体消失」兜底**：
        源文件提交过 → 该页必须有 lastmod；源文件还没提交 → 该页不该有。
        filter 一旦静默失效（返回空串），sitemap 里一条 lastmod 都不剩，
        而 build 照样 exit 0、门禁照样全绿 —— sitemap 规范里 lastmod 是
        **可选**字段，所以它不报错，只会悄悄地不写。
        ⚠️ 早先这个兜底挂在"src 下**每个**源文件都提交过"这个前提下，
        而本仓库流程是「先 build 后 commit」——新写的页面文件在 build 时
        还没进历史 → 前提必然不成立 → **整条兜底长期失效**，最典型的
        静默失效反而抓不到。逐页判定（按该页自己的源文件查）没有这个前提：
        一个还没提交的新文件只影响它自己那一页。 */
const REPO = path.resolve(__dirname, "..");
const gitOut = (args) => {
  try {
    return execFileSync("git", args, {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};
// git 仓库根（与 eleventy.config.js 里 repoRelPath filter 的基准一致）
const GIT_TOP = gitOut(["rev-parse", "--show-toplevel"]);
const GIT_ROOT = GIT_TOP ? path.resolve(GIT_TOP) : REPO;
const inGitRepo = GIT_TOP !== null;
const isShallow = gitOut(["rev-parse", "--is-shallow-repository"]);
// 某个源文件最后一次提交的时间，统一成 UTC ISO（与模板产出的格式一致）
const gitCommitTime = (rel) => {
  const out = gitOut(["log", "-1", "--format=%cI", "--", rel]);
  if (!out) return null;
  const d = new Date(out);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// src 下所有源文件各自的最后提交时间（规则 C 的集合比对用）
const srcCommitTimes = new Set();
if (inGitRepo && isShallow === "false") {
  const walkSrc = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walkSrc(p);
      } else {
        const t = gitCommitTime(path.relative(GIT_ROOT, p));
        if (t) srcCommitTimes.add(t);
      }
    }
  };
  const srcDir = path.join(GIT_ROOT, "src");
  if (fs.existsSync(srcDir)) walkSrc(srcDir);
}

// 从产物 sitemap 里取出每条 <url> 的 loc、lastmod 与源文件路径
const sitemapEntries = [];
if (fs.existsSync(sitemapPath)) {
  const xml = fs.readFileSync(sitemapPath, "utf8");
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const block = m[1];
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    const lastmod = (block.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1];
    const source = (block.match(/<!--\s*source:\s*([^>]*?)\s*-->/) || [])[1];
    sitemapEntries.push({
      loc: loc ? loc.trim() : "",
      lastmod: lastmod ? lastmod.trim() : "",
      source: source ? source.trim() : "",
    });
  }
}
const withLastmod = sitemapEntries.filter((e) => e.lastmod);

if (isShallow === "true") {
  // 规则 A：浅克隆 = 数据源被截断，lastmod 这个功能被**静默关掉**了。
  // 这条判定刻意不挂在 withLastmod 上：浅克隆里产物零 lastmod，
  // 挂在上面就等于什么都不查、直接放行 —— 恰好放过了最该抓的那次退化。
  fail(
    "当前是浅克隆（git clone --depth 1，或 CI 未设 fetch-depth: 0）：" +
      "sitemap 的 <lastmod> 依赖完整 git 历史，浅克隆下 git log -1 -- <file> " +
      "只能查到 HEAD 那一次，查到的值『看起来像提交时间、其实是 checkout 时间』。" +
      "解法：本地 git fetch --unshallow（或 git clone 不带 --depth 1）；" +
      "CI 侧在 actions/checkout 加 with: fetch-depth: 0。"
  );
} else if (!inGitRepo) {
  // 规则 B：不在 git 仓库里（源码 zip 分发），本就没有 git 历史。
  // 不拦人，但产物里不许出现 lastmod —— 那只能说明有人硬凑了值。
  for (const e of withLastmod) {
    fail(
      'sitemap.xml: "' + e.loc + '" 带了 <lastmod>' + e.lastmod + "</lastmod>，" +
        "但当前不在 git 仓库里——查不到真实的提交时间。" +
        "lastmod 只能是内容最后一次改变的时间，宁缺勿假"
    );
  }
  note("不在 git 仓库里：sitemap 不输出 lastmod（源码 zip 分发，本就没有 git 历史）");
} else {
  // 规则 C：给了就必须是真的
  for (const e of withLastmod) {
    const d = new Date(e.lastmod);
    if (isNaN(d.getTime())) {
      fail('sitemap.xml: "' + e.loc + '" 的 <lastmod>' + e.lastmod + "</lastmod> 不是合法时间戳");
      continue;
    }
    if (d.getTime() > Date.now() + 60000) {
      fail('sitemap.xml: "' + e.loc + '" 的 <lastmod> 在未来（' + e.lastmod + "）");
    }
    if (!srcCommitTimes.has(d.toISOString())) {
      fail(
        'sitemap.xml: "' + e.loc + '" 的 <lastmod>' + d.toISOString() + "</lastmod> " +
          "不等于 src 下任何源文件真实的最后一次提交时间——" +
          "它不是内容最后一次改变的时间"
      );
    }
  }
  // 规则 D + E：逐页核对
  let perPageChecked = 0;
  for (const e of sitemapEntries) {
    if (!e.source) {
      // 产物里没有源文件信息 → "逐页核对"这一整套判据被**静默关掉**了。
      // 洞的性质和"lastmod 整体消失"完全一样：sitemap 规范里 source 标注
      // 是可有可无的注释，删掉它既不会让 build 失败、也不会让任何一条
      // 其它判据报错 —— 于是"取错源文件"这类错就再也抓不到了。
      // 所以这里必须 fail：没有标注 = 门禁自己被卸掉了。
      fail(
        'sitemap.xml: "' + e.loc + '" 没有 <!-- source: ... --> 源文件标注——' +
          "门禁靠它逐页核对 lastmod，标注没了整套逐页核对就失效了" +
          "（sitemap.njk 里那行 <!-- source: ... --> 不能删）"
      );
      continue;
    }
    perPageChecked++;
    const t = gitCommitTime(e.source);
    if (t && !e.lastmod) {
      fail(
        'sitemap.xml: "' + e.loc + '" 的源文件 ' + e.source + " 提交过，" +
          "这一页却没有 <lastmod>——lastmod filter 静默失效了" +
          "（sitemap 规范里 lastmod 是可选字段，所以它不会报错，只会悄悄地不写）"
      );
    } else if (!t && e.lastmod) {
      fail(
        'sitemap.xml: "' + e.loc + '" 的源文件 ' + e.source + " 还没有提交过，" +
          "却带了 <lastmod>" + e.lastmod + "</lastmod>——那是查不到来源的时间"
      );
    } else if (t && e.lastmod) {
      // 逐页核对**值**：集合比对只能证明"这个时间是某个源文件的提交时间"，
      // 发现不了"取错了源文件"（所有页都填同一个文件的时间也会过）。
      const d = new Date(e.lastmod);
      if (!isNaN(d.getTime()) && d.toISOString() !== t) {
        fail(
          'sitemap.xml: "' + e.loc + '" 的 <lastmod>' + e.lastmod + "</lastmod> " +
            "不等于它自己的源文件 " + e.source + " 的最后一次提交时间" + t +
            "——取错了源文件"
        );
      }
    }
  }
  // 产物里一条源文件信息都没有（老产物 / 模板被改）→ 退回整体兜底：
  // 全站零 lastmod、而 src 下确实有提交过的页面源 ⇒ filter 静默失效。
  if (perPageChecked === 0 && srcCommitTimes.size > 0) {
    for (const e of sitemapEntries) {
      if (!e.lastmod) {
        fail(
          'sitemap.xml: "' + e.loc + '" 没有 <lastmod>，而 src 下有提交过的源文件——' +
            "lastmod filter 静默失效了（sitemap 规范里 lastmod 是可选字段，" +
            "所以它不会报错，只会悄悄地不写）"
        );
      }
    }
  }
}
note(
  "sitemap " + sitemapEntries.length + " 条 URL，其中 " + withLastmod.length +
    " 条带 lastmod" +
    (inGitRepo && isShallow === "false"
      ? "（已逐页与各自源文件的 git 提交时间核对）"
      : "（非完整 git 历史，未核对提交时间）")
);

/* ---------- 19. 内容类实体的 @id 必须全站一致，且指向真实页面 ----------
   @id 是 schema.org 里"同一个实体"的稳定标识：不同页面上描述同一件
   作品的节点，@id 相同才会被合并成一个节点；不同就被当成多件作品。
   这与第 12 条（"本人"的 @id 只能有一个取值）是同一类 bug，只是被
   拆开的不再是人，而是论文。

   第九轮之前，站点级那个 ScholarlyArticle 节点**根本没有 @id**：
   论文页有 @id、首页/列表页那个没有 → 同一篇论文在知识图谱里是两件
   不同的作品（与"同一个人被读成 6 个人"同类）。现在两边用同一个
   @id（<站点根>/papers/<slug>/，就是论文页 jsonLdPaper 的 selfUrl），
   这条门禁守住它：
     · 内容类实体必须有 @id（缺了就没有归并的抓手）；
     · 同一件作品（按 identifier / DOI 归一）在全站只能有一个 @id；
     · @id 指向站内页面时，那个页面必须真实存在（否则实体归并到一个
       空地址上，等于没有）。 */
const WORK_ENTITY_TYPES = new Set([
  "ScholarlyArticle",
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
  "ScholarlyChapter",
  "Review",
  "Dataset",
  "SoftwareSourceCode",
  "CreativeWork",
]);
let siteUrl = "";
try {
  siteUrl = require(path.resolve(__dirname, "../src/_data/site.js")).url || "";
} catch {
  /* 读不到就只查绝对性，不查站内路径 */
}
const idByWork = new Map(); // 作品标识 → Map(@id → 首次出现的页面)
for (const { from, parsed } of ldRecords) {
  for (const node of collectNodes(parsed)) {
    // 一个节点可能带多个作品类型（["Dataset","SoftwareSourceCode"]），
    // 也可能把作品类型排在数组第二位 —— 两种都要看见，
    // 只看第 0 个元素会被 ["Person","ScholarlyArticle"] 这种写法整个绕过。
    const workTypes = typesOf(node).filter((t) => WORK_ENTITY_TYPES.has(t));
    if (!workTypes.length) continue;
    const type = workTypes.join("/");
    const id = node["@id"];
    if (typeof id !== "string" || !id.trim()) {
      fail(
        from + ": JSON-LD 里有一个 " + type + " 实体没有 @id —— " +
          "没有 @id 就没有归并的抓手，同一件作品在站内会被读成多件"
      );
      continue;
    }
    if (!ABSOLUTE_URL.test(id.trim())) {
      fail(from + ": " + type + " 实体的 @id " + JSON.stringify(id) + " 不是绝对地址");
      continue;
    }
    const ident =
      typeof node.identifier === "string"
        ? node.identifier
        : (node.identifier && node.identifier["@value"]) || node.headline || id;
    if (!idByWork.has(ident)) idByWork.set(ident, new Map());
    const seen = idByWork.get(ident);
    if (!seen.has(id)) seen.set(id, from);
    // @id 指向站内页面时，那个页面必须真实存在
    if (siteUrl && id.startsWith(siteUrl)) {
      let p = "";
      try {
        p = new URL(id).pathname;
      } catch {
        p = "";
      }
      if (
        p &&
        !sitemapPaths.has(p) &&
        !sitemapPaths.has(p.replace(/\/$/, "")) &&
        !sitemapPaths.has(p + "/")
      ) {
        fail(
          from + ": " + type + " 实体的 @id " + JSON.stringify(id) +
            " 指向站内一个不存在的页面 —— 实体归并到一个空地址上，等于没有"
        );
      }
    }
  }
}
for (const [ident, seen] of idByWork) {
  if (seen.size > 1) {
    const list = [...seen.entries()].map(([id, from]) => id + "（" + from + "）").join(" / ");
    fail(
      '同一件作品 "' + ident + '" 在站内出现了 ' + seen.size + " 个不同的 @id：" +
        list + " —— 消费方按 @id 归并，同一件作品会被读成多件"
    );
  }
}
note("内容类实体 " + idByWork.size + " 件，每件的 @id 全站唯一且指向真实页面");

/* ---------- 汇总 ---------- */
console.log(`产物：${htmlFiles.length} 个 HTML 页，${refCount} 条本地引用，${sitemapUrls.length} 条 sitemap URL`);
if (absoluteCount === 0) console.log("站内引用全部为相对路径 ✓");
// notes 是给"检查通过但值得记一笔"的信息用的（例如 feed 的条数、
// "本人"实体的 @id）。此前它是个**只写不读**的累加器（note() 从没被
// 调用，notes.push 写进去也没人打印），白占一个变量还误导后来的人。
// 现在统一走 note()，并在汇总里逐条打印出来。
if (notes.length) {
  console.log("—");
  notes.forEach((n) => console.log(`  · ${n}`));
}

if (problems.length) {
  console.error(`\n✗ 自检未通过，共 ${problems.length} 个问题：`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}
console.log("✓ 站点自检全部通过");
