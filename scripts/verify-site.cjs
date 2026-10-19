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
 *   8. feed.xml 里有没有 item、每条 item 的 link 是否指向真实页面
 *   9. 论文页的 JSON-LD 里有没有 Dataset / SoftwareSourceCode 实体
 *  10. 身份类 meta（twitter:site/creator）有没有写死的兜底值
 *  （第 11–16 条门禁不在此列举，各自紧挨着对应的检查段落，
 *    注释里写清了拦的是哪类 bug）
 *
 * 用法：node scripts/verify-site.cjs   （有错 exit 1）
 */
const fs = require("fs");
const path = require("path");

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
// 每页解析成功的 JSON-LD 记录，供第 11 / 13 条门禁复查
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

  // 3b) 错误页的索引控制
  //     404 页此前既**没有 noindex**、又发着指向自身的 canonical
  //     （实测 `<link rel="canonical" href=".../404.html">`）——等于主动向
  //     搜索引擎声明"404 也是正式内容页"，而错误页 URL 本该被排除在索引外。
  //     规范做法：
  //       · 错误页 → robots = noindex, follow（不收录这个 URL 本身，
  //                  但 follow 保留页内有效链接的抓取与权重传递）；
  //       · 正常页 → **不许**出现 noindex（那是把好页面自己藏起来，
  //                  同样属于静默缺陷，一并兜住）。
  const isNotFound = from.endsWith("404.html");
  const robotsMeta = (html.match(/<meta[^>]*name\s*=\s*"robots"[^>]*content\s*=\s*"([^"]*)"/i) || [])[1];
  const hasNoindex = robotsMeta ? /noindex/i.test(robotsMeta) : false;
  if (isNotFound) {
    if (!hasNoindex) {
      fail(`${from}: 404 页缺少 noindex（robots meta = ${robotsMeta || "无"}）`);
    }
    if (canonical) {
      fail(`${from}: 404 页不应有 canonical（${canonical}）`);
    }
  } else if (hasNoindex) {
    fail(`${from}: 正常页不该有 noindex（robots meta = ${robotsMeta}）`);
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

/* ---------- 6) RSS 订阅源不能是空的 ----------
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

/* ---------- 7) 论文页必须声明数据集与可复现胶囊 ----------
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

/* ---------- 8) 身份类 meta 不得声明没有数据支撑的账号 ----------
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

/* ---------- 9. JSON-LD 里的 @id / url 必须是绝对地址 ----------
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

/* ---------- 10. og:type 要与页面性质一致 ----------
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

/* ---------- 11. 全站"本人"的 @id 必须只有一个取值 ----------
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
    if (node["@type"] !== "Person") continue;
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

/* ---------- 12. /publications.bib 必须与论文页的 Copy 按钮逐字一致 ----------
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
   转义 bug**：转义错了反而更"一致"。所以下面第 13 条直接盯"文件里不该有实体"。 */

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
if (!fs.existsSync(bibPath)) {
  fail("产物里没有 publications.bib");
} else {
  const bibText = fs.readFileSync(bibPath, "utf8");
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
  note(
    `publications.bib ${bibEntries.length} 条，与论文页 ${copyBlocks.length} 个复制块逐字一致（页面侧已解码 HTML 实体）`
  );

  /* ---------- 13. 下载的 .bib 里不得出现 HTML 实体 ----------
     publications.bib 是**下载文件**，读者拿它直接喂给 Zotero / BibDesk。
     里面出现 `&#92;&amp;` 这种实体，就说明它被 nunjucks 的 autoescape 加工过
     —— 那不是合法 BibTeX，导入器会读出乱码，或直接把字段名认错。

     这条比第 12 条更直接：第 12 条比的是"两处是否一致"，而修复前两边
     **同样**被转义，所以照样通过；这条直接问"文件里有没有实体"。

     判据只认 nunjucks 真会产生的那些实体；裸 & 不算 —— URL 查询串里本来就有 &。 */
  const entityHit = bibText.match(HTML_ENTITY_RE);
  if (entityHit) {
    fail(
      `publications.bib 里出现了 HTML 实体 "${entityHit[0]}" —— 下载文件必须是原始 BibTeX，` +
        `不能带 HTML 转义（多半是模板漏了 | safe）`
    );
  }
}

/* ---------- 14. 同一张图在页面里必须只有一套 alt 文本 ----------
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

/* ---------- 16. robots.txt 的"生成时间"必须是真正的构建时间 ----------
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
