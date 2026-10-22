#!/usr/bin/env node
/**
 * 论文封面图一致性门禁 —— 守住"同一篇论文的封面图，在四个出口上是**同一张图、
 * 同一组尺寸**，而且**只有一处真源**"。
 *
 * 为什么要有这个门禁（一次实测坐实的缺陷，不是假想）：
 *   论文成果图（site.js 里的 publications[].figure）此前有**两份真源**：
 *     ① src/_data/site.js 的 publications[].figure
 *        （src / width / height / alt / caption）
 *     ② src/content/papers/<slug>/paper.md 的 front matter
 *        （cover / coverWidth / coverHeight）
 *   而四个出口**各取各的**：
 *     · 正文 <img class="paper-figure__img">  → 读 ①（paper.njk）
 *     · og:image / og:image:secure_url       → 读 ②（base.njk）
 *     · og:image:width / og:image:height     → 读 ②（base.njk）
 *     · twitter:image                        → 读 ②（base.njk）
 *     · JSON-LD 的 ScholarlyArticle.image    → 读 ②（paper.njk → coverUrl）
 *   两份可以各说各的，而且**没有任何门禁看得见**：
 *     · check-image-assets.cjs 的 IA1–IA7 逐条验"**声明的那张图**自身对不对"
 *       （文件在不在、声明尺寸等不等于真实像素、alt 有没有）——
 *       它们**从不验"同一张图的多个声明是不是同一张"**；
 *     · 其余门禁没有一条看封面图的多出口一致性。
 *   ⇒ 改 ① 而忘了改 ②（或反过来），正文图变了而分享卡还是旧图；
 *     旧图一旦被删，og:image 立刻变死链——线上每张分享卡片拿到的都是 404，
 *     而 build 通过、门禁全绿、页面照常渲染。
 *   （缺陷清单 D30；本轮已把 ② 那份副本删掉，改为 ① 单一真源。）
 *
 * 四条判据：
 *   CV1 **四个出口必须是同一张图** —— 论文页的正文 <img>、og:image、
 *       twitter:image、JSON-LD 的 ScholarlyArticle.image，归一化成站内路径后
 *       必须逐字相等，且必须等于真源 publications[].figure.src。
 *       （归一化要同时吃两种形态：og/twitter/JSON-LD 给的是绝对 URL，
 *         正文 <img> 给的是**页内相对路径**——本仓的"整个文件夹扔到哪都能跑"
 *         契约要求 | relUrl 产出相对路径，见 scripts/check-mount-contract.cjs。）
 *   CV2 **尺寸必须同源** —— og:image:width/height 与正文 <img> 的 width/height
 *       属性，必须等于真源 figure.width/height。
 *   CV3 **真源唯一** —— 论文页的 front matter **不得**再自带 cover /
 *       coverWidth / coverHeight 副本。front matter 的 `cover` 是留给
 *       **没有 pubKey 的内容页**（博客等）做页面级覆盖的；有 pubKey 的论文页
 *       一律从 site.js 取。
 *   CV4 **自证覆盖量 + 门禁自己没被卸掉** —— 一处都没比过就判红；
 *       package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 本门禁**守不了什么**（写清楚，不藏）：
 *   它守的是"一处真源"与"四个出口同图同尺寸"。
 *   如果有人把**真源与产物一起**改成另一张图（并同步改 front matter），
 *   本门禁**抓不到** ⇒ 封面图选得对不对仍靠人工核。
 *   这个边界不是注释里的承诺：scripts/test-figure-cover.cjs 的 **SP11 档**
 *   就是它的可执行版本（真源与产物一起改错 ⇒ **必须判绿**）。
 *
 * ⚠️ 为什么不并进 check-image-assets.cjs（IA*）：
 *   IA 管的是"每条声明自身对不对"（文件在不在、尺寸真不真、alt 有没有）；
 *   本门禁管的是"同一张图的几条声明之间对不对得上"——两件事的判据形状不同，
 *   混在一起会让 IA 的"逐条引用自证"计数含义变得含混。
 *
 * 编号：CV1–CV4（Cover Figure）。不与 verify-site.cjs 的数字编号、
 * check-artifact-metadata.cjs 的 M*、check-image-assets.cjs 的 IA*、
 * check-about-dataset.cjs 的 AP*、check-home-chart.cjs 的 HC* 等既有前缀冲突。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR        —— 产物目录（默认 _site）
 *   SITE_DATA_PATH  —— 真源 site.js 的路径（默认 src/_data/site.js）
 *   PAPERS_DIR      —— 论文页源目录（默认 src/content/papers）
 *   PKG_PATH        —— package.json 的路径（默认 package.json）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const SITE_DATA_PATH = process.env.SITE_DATA_PATH
  ? path.resolve(process.env.SITE_DATA_PATH)
  : path.join(ROOT, "src", "_data", "site.js");
const PAPERS_DIR = process.env.PAPERS_DIR
  ? path.resolve(process.env.PAPERS_DIR)
  : path.join(ROOT, "src", "content", "papers");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");

const problems = [];
const note = (msg) => problems.push(msg);

/* 失败输出的两份文案（两个判红出口共用，避免字面量漂移） */
const FAIL_TITLE = "论文封面图一致性门禁未通过：";
const CAUSE_MARK = "  ✗ ";

/**
 * 打印失败横幅与全部红因。
 * ⚠️ **判红前必须先调用它**：早退过一次（缺陷 D67）——收集完就立刻退出，
 * 那条红因永不被打印、失败横幅也来不及打 ⇒ 外面只看到「exit 1、零输出」，
 * 连「为什么红」都看不到，exit 1 与「门禁自己崩了」也不可区分。
 */
function reportFailure() {
  console.error(`${FAIL_TITLE}\n`);
  problems.forEach((p) => console.error(`${CAUSE_MARK}${p}`));
  console.error("");
}

/* 比过的处数：用来自证判据还活着（CV4） */
let compared = 0;

/* ---------- 真源 ---------- */
let siteData = null;
try {
  siteData = require(SITE_DATA_PATH);
} catch (e) {
  note(`读不到真源 ${SITE_DATA_PATH}（${e.message}）——本门禁没有真源可比，直接判红。`);
  /* ★ 先打印再退出（缺陷 D67）：早退时红因被吞 ⇒ 用户只看到「exit 1、零输出」。 */
  reportFailure();
  process.exit(1);
}
const siteUrl = (siteData && siteData.url) || "";
const publications = (siteData && siteData.publications) || [];

/* ---------- 工具 ---------- */

/** 取 <meta property="..."> 的第一条 */
function metaProp(html, prop) {
  const m = html.match(new RegExp(`<meta property="${prop}" content="([^"]*)"`));
  return m ? m[1] : null;
}

/** 取 <meta name="..."> 的第一条 */
function metaName(html, name) {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? m[1] : null;
}

/** 取正文成果图那个 <img> 的标签文本（按 class 定位，不用位置猜） */
function figureImgTag(html) {
  const idx = html.indexOf('class="paper-figure__img"');
  if (idx < 0) return null;
  const start = html.lastIndexOf("<img", idx);
  if (start < 0) return null;
  const end = html.indexOf("/>", idx);
  if (end < 0) return null;
  return html.slice(start, end + 2);
}

function tagAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** 收集页面里所有 JSON-LD 节点（含 @graph 展开） */
function jsonLdNodes(html) {
  const nodes = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    let obj;
    try {
      obj = JSON.parse(m[1].trim());
    } catch (_) {
      continue; // JSON 合法性由 check-jsonld.cjs 管，本门禁不重复
    }
    if (Array.isArray(obj)) {
      nodes.push(...obj);
    } else if (obj && Array.isArray(obj["@graph"])) {
      nodes.push(...obj["@graph"]);
    } else if (obj) {
      nodes.push(obj);
    }
  }
  return nodes;
}

/**
 * 把一个 URL 归一化成"站内文件路径"，好让绝对 URL 与页内相对路径可比。
 * 返回 null 表示取不到值；返回 {external:true} 表示站外地址（不参与比对，但要报出来）。
 */
function toSitePath(raw, pageUrl) {
  if (raw === null || raw === undefined) return null;
  let u = String(raw).trim();
  if (!u) return null;
  u = u.split("#")[0].split("?")[0];
  if (siteUrl && u.startsWith(siteUrl)) u = u.slice(siteUrl.length);
  if (/^https?:\/\//i.test(u)) return { external: true, raw: String(raw).trim() };
  if (!u.startsWith("/")) {
    // 页内相对路径：按页面 URL 解析（本仓 | relUrl 产出相对路径）
    const base = pageUrl && pageUrl.endsWith("/") ? pageUrl : `${pageUrl || "/"}`;
    try {
      u = new URL(u, `https://placeholder.invalid${base}`).pathname;
    } catch (_) {
      return { external: true, raw: String(raw).trim() };
    }
  }
  return u;
}

/* 论文页 front matter 的顶层键（只认行首、无缩进的 `key:`） */
function frontMatterKeys(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== "---") return null;
  const keys = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") return keys;
    const line = lines[i];
    if (/^\s/.test(line) || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:/);
    if (m) keys.push(m[1]);
  }
  return null; // front matter 没闭合
}

/* ---------- 逐篇论文核对 ---------- */
let papersWithFigure = 0;
let papersChecked = 0;

for (const pub of publications) {
  if (!pub || !pub.figure || !pub.figure.src) continue;
  papersWithFigure++;
  const fig = pub.figure;
  const pageUrl = `/papers/${pub.slug}/`;
  const pageRel = `papers/${pub.slug}/index.html`;
  const pagePath = path.join(SITE, "papers", pub.slug || "", "index.html");

  if (!pub.slug) {
    note(`论文 ${fig.src} 没有 slug，算不出论文页路径，本门禁没验到它。`);
    continue;
  }
  if (!fs.existsSync(pagePath)) {
    note(`论文页产物不存在：${pageRel}（site.js 里的 slug 找不到对应页面）。`);
    continue;
  }
  const html = fs.readFileSync(pagePath, "utf8");
  papersChecked++;

  /* --- CV1：四个出口必须是同一张图 --- */
  const tag = figureImgTag(html);
  if (!tag) {
    note(`门禁 CV1：${pageRel} 里找不到正文成果图 <img class="paper-figure__img">。`);
  }
  const bodySrc = tag ? toSitePath(tagAttr(tag, "src"), pageUrl) : null;
  const ogImage = toSitePath(metaProp(html, "og:image"), pageUrl);
  const twImage = toSitePath(metaName(html, "twitter:image"), pageUrl);
  const ldNodes = jsonLdNodes(html);
  const article = ldNodes.find((n) => n && n["@type"] === "ScholarlyArticle");
  const ldImage = article ? toSitePath(article.image, pageUrl) : null;

  const outlets = [
    ["正文 <img>", bodySrc],
    ["og:image", ogImage],
    ["twitter:image", twImage],
    ["JSON-LD ScholarlyArticle.image", ldImage],
  ];
  const expected = toSitePath(fig.src, pageUrl);
  for (const [label, value] of outlets) {
    compared++;
    if (value === null) {
      note(`门禁 CV1：${pageRel} 的 ${label} 取不到值——出口缺一个。`);
    } else if (value && value.external) {
      note(`门禁 CV1：${pageRel} 的 ${label} 指向站外地址（${value.raw}），不是站内封面图。`);
    } else if (value !== expected) {
      note(
        `门禁 CV1：${pageRel} 的 ${label} 与真源不是同一张图 —— ` +
          `出口是 ${JSON.stringify(value)}，真源 publications[].figure.src 是 ` +
          `${JSON.stringify(expected)}。`
      );
    }
  }

  /* --- CV2：尺寸必须同源 --- */
  const ogW = metaProp(html, "og:image:width");
  const ogH = metaProp(html, "og:image:height");
  const bodyW = tag ? tagAttr(tag, "width") : null;
  const bodyH = tag ? tagAttr(tag, "height") : null;
  const sizePairs = [
    ["og:image:width", ogW, fig.width],
    ["og:image:height", ogH, fig.height],
    ["正文 <img> 的 width 属性", bodyW, fig.width],
    ["正文 <img> 的 height 属性", bodyH, fig.height],
  ];
  for (const [label, actual, want] of sizePairs) {
    compared++;
    if (actual === null) {
      note(`门禁 CV2：${pageRel} 的 ${label} 缺——尺寸没有声明。`);
    } else if (String(actual) !== String(want)) {
      note(
        `门禁 CV2：${pageRel} 的 ${label} 是 ${JSON.stringify(actual)}，` +
          `真源 publications[].figure 里是 ${JSON.stringify(want)}。`
      );
    }
  }
}

/* ---------- CV3：论文页 front matter 不得自带封面副本 ---------- */
let frontMatterFiles = 0;
if (fs.existsSync(PAPERS_DIR)) {
  const mdFiles = fs
    .readdirSync(PAPERS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((d) => path.join(PAPERS_DIR, d.name, "paper.md"))
    .filter((p) => fs.existsSync(p));
  for (const md of mdFiles) {
    const text = fs.readFileSync(md, "utf8");
    const keys = frontMatterKeys(text);
    if (keys === null) continue;
    const rel = path.relative(ROOT, md);
    const relLabel = rel.startsWith("..") ? md : rel;
    const hasPubKey = keys.includes("pubKey");
    if (!hasPubKey) continue; // 没有 pubKey 的内容页：front-matter 的 cover 是它唯一的封面来源
    frontMatterFiles++;
    for (const banned of ["cover", "coverWidth", "coverHeight"]) {
      compared++;
      if (keys.includes(banned)) {
        note(
          `门禁 CV3：${relLabel} 的 front matter 里还有 ${banned} —— ` +
            `论文页的封面图真源只有 site.js 的 publications[].figure 一处，` +
            `front matter 不再留副本（否则正文 <img> 与分享图可以各说各的）。`
        );
      }
    }
  }
} else {
  note(`找不到论文页源目录 ${PAPERS_DIR}，CV3 没验到任何东西。`);
}

/* ---------- CV4：自证覆盖量 + 门禁自己没被卸掉 ---------- */
if (papersWithFigure === 0) {
  note("真源里一篇带 figure 的论文都没有——本门禁没验到任何东西，判红。");
}
if (papersChecked !== papersWithFigure) {
  note(
    `应验 ${papersWithFigure} 篇带图论文，实测只验了 ${papersChecked} 篇——` +
      `判据可能已经失效（"没报错"和"没问题"长得一模一样）。`
  );
}
if (frontMatterFiles === 0) {
  note("一个带 pubKey 的论文页源文件都没找到——CV3 没验到任何东西，判红。");
}
if (!fs.existsSync(PKG)) {
  note("找不到 package.json，无法确认本门禁是否接在 build 上。");
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  const build = (pkg.scripts && pkg.scripts.build) || "";
  /* ⚠️ 用 (?![\w-]) 收尾：否则 "npm run check:figure-cover-selftest" 里的
     "check:figure-cover" 会被当成前缀命中 ⇒ 门禁被摘掉反而判绿。 */
  const wired =
    /npm run check:figure-cover(?![\w-])/.test(build) &&
    (pkg.scripts["check:figure-cover"] || "").includes("check-figure-cover.cjs");
  if (!wired) {
    note(
      "门禁自己被卸掉了：package.json 的 build 链里没有 check:figure-cover，" +
        "或 check:figure-cover 没有指向 scripts/check-figure-cover.cjs。"
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  reportFailure();
  process.exit(1);
}

console.log(
  `论文封面图一致性门禁通过：${papersChecked} 篇论文的封面图在正文 <img>、og:image、` +
    `twitter:image、JSON-LD image 四个出口上**是同一张图、同一组尺寸**，` +
    `且论文页 front matter 不再留封面副本；共比对 ${compared} 处。`
);
