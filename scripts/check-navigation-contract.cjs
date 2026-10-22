#!/usr/bin/env node
/**
 * 顶层导航契约门禁 —— 守住「顶层导航只有一份真源，另一份副本必须逐项对齐」。
 *
 * 为什么要有这个门禁（一次实测坐实的缺陷，不是假想）：
 *   顶层导航有**两份真源**：
 *     ① src/_data/site.js 的 nav 数组 —— 这是**真正驱动渲染**的那一份
 *        （src/_includes/partials/header.njk 第 10 行就是从它取 navItems）；
 *     ② 各页面模板 front matter 里的 eleventyNavigation（key / order）——
 *        Eleventy 用它生成 collections.navigation 集合。
 *   两者**已经漂移**：
 *     · eleventyNavigation.order 的实际序列是 1 / 2 / 3 / **5** ——
 *       About 停在 **5**，那是首版站点还有 5 个顶层入口（「作品集」「论文精读」
 *       尚未撤下）时的化石值，**order 4 空缺**；而 nav 数组现在只有 4 项，
 *       About 在**第 4 位**；
 *     · site.js 里那段注释写着「Home 1 / Papers 2 / Blog 3 / **About 4**」——
 *       与模板现状**不符**（注释描述的是它**期望**的一致状态，不是现状）。
 *   而两份真源之间**一条门禁都没有**：
 *     · scripts/ 全目录搜 eleventyNavigation —— **零命中**；
 *     · src/ 全目录搜 collections.navigation —— **零命中**（没人消费这个集合），
 *       所以这第二份副本今天是**死数据**：漂了也不会有人看见。
 *   ⇒ 与「同一事实两份副本、其中一份没人看守」是同一族病
 *     （同族案例见 check-about-dataset.cjs 的文件头）。
 *
 * 五条判据：
 *   NA1 两份真源必须一一对应 —— nav 数组的每个 label 在 eleventyNavigation 里
 *       恰有一个同名 key，反之亦然；多出来的、少掉的、重复的都要点名。
 *   NA2 位次必须一致 —— eleventyNavigation.order 必须等于该入口在 nav 数组里的
 *       位次（从 1 起算）。**这一条就是「化石 order 4 空缺」的照妖镜**。
 *   NA3 产物上渲染出来的导航必须与真源逐项一致 —— 每一页页头导航的
 *       条目数、顺序、可见文字、链接指向的页面，都必须等于 nav 数组。
 *       （顺带守住「header 还在从 site.nav 取导航」这件事：哪天 header 改成
 *        手写一份列表，这里立刻对不上。）
 *   NA4 导航入口指向的页面必须真实存在 —— 站内入口不许指向产物里没有的页面
 *       （访客点开就是本站 404）。
 *   NA5 覆盖度自证 + 门禁自己没被卸掉 —— 一处都没比过就判红；
 *       package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   它守的是「两份真源对齐」+「真源与产物对齐」+「入口指向真实存在的页面」。
 *   它**不锁死顶层导航具体是哪几个入口**：nav 数组换成别的入口集合、
 *   模板与产物一起跟着改，门禁照样判绿（自测 NT7 就是这一档）。
 *   也就是说，「该有几个入口、叫什么名字」是**内容判断**，不在本门禁范围内。
 *
 * ⚠️ 为什么 order 必须**等于 nav 数组里的位次**（而不是只要求"大小不乱"）：
 *   order 是 Eleventy 给导航集合排序用的数字，它唯一的作用就是表达"第几个"。
 *   权威的"第几个"就是 nav 数组里的位置（header.njk 读的就是它）。
 *   所以 order 必须**逐位等于**位次；只要求"不乱序"的话，化石值 5 照样算过，
 *   而 5 正是本缺陷的实体。
 *
 * ⚠️ 为什么 NA3 要把产物里的**相对链接**还原成站内路径再比：
 *   本站用相对 URL 策略（eleventy.config.js 里的 relUrl 过滤器），
 *   同一个 "/" 在首页产物里渲染成 href="./"、在论文详情页里渲染成 href="../../"，
 *   404 页里又渲染成 href="/"（那一页不受相对路径影响）。
 *   ⇒ 直接拿产物里的字符串与 nav 数组比，会得到一堆**假红**。
 *   这里把每个链接按「它所在页面的目录」解析回站内绝对路径再比，
 *   比的是**访客点它会去哪**，不是**它被写成了什么字符串**。
 *
 * 编号：NA1–NA5（Navigation）。不与既有前缀冲突
 *   （check-image-assets 的 IA*、check-blog-frontmatter 的 F*、
 *    check-about-dataset 的 AP*、check-tag-leak 的 T*、check-tool-routes 的 RT*、
 *    check-gates-wired 的 GW*、check-readme 的 RD* 等均不同名）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR        —— 产物目录（默认 _site）
 *   SITE_DATA_PATH  —— 真源 site.js 的路径（默认 src/_data/site.js）
 *   SRC_DIR         —— 模板源码根目录（默认 src）
 *   PKG_PATH        —— package.json 的路径（默认仓库根的 package.json）——
 *                     自测用它证明 NA5「门禁自己被卸掉」那条判据真的在起作用。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const SITE_DATA_PATH = process.env.SITE_DATA_PATH
  ? path.resolve(process.env.SITE_DATA_PATH)
  : path.join(ROOT, "src", "_data", "site.js");
const SRC_DIR = process.env.SRC_DIR ? path.resolve(process.env.SRC_DIR) : path.join(ROOT, "src");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

const problems = [];
const note = (msg) => problems.push(msg);

/* 比过的处数：覆盖度自证用（NA5）。 */
let comparedNav = 0;
let comparedPages = 0;
let comparedHrefs = 0;

function fail(msg) {
  console.error("顶层导航契约门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ---------- 真源：site.js 的 nav 数组 ---------- */
let siteData = null;
try {
  siteData = require(SITE_DATA_PATH);
} catch (e) {
  note(`读不到真源 ${SITE_DATA_PATH}（${e.message}）—— 本门禁没有真源可比，直接判红。`);
  fail();
}
const nav = Array.isArray(siteData.nav) ? siteData.nav : [];
if (!nav.length) {
  note(
    `src/_data/site.js 里没有 nav 数组（或它是空的）—— 本门禁没有判断对象，直接判红。`
  );
  fail();
}

/* ---------- 第二份真源：各模板 front matter 里的 eleventyNavigation ---------- */
function frontMatterOf(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

/* 只取 eleventyNavigation 那一块：顶格行 = 下一个顶层键，这一块就结束了。 */
function navEntryOf(fm) {
  const lines = fm.split(/\r?\n/);
  let inBlock = false;
  let key = null;
  let order = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!inBlock) {
      if (/^eleventyNavigation:\s*$/.test(line)) inBlock = true;
      continue;
    }
    if (/^\S/.test(line)) break; // 顶格 = 离开这一块
    const km = line.match(/^\s+key:\s*(.+?)\s*$/);
    if (km) {
      key = km[1].replace(/^["']|["']$/g, "");
      continue;
    }
    const om = line.match(/^\s+order:\s*(\d+)\s*$/);
    if (om) {
      order = Number(om[1]);
      continue;
    }
  }
  if (key === null) return null;
  return { key, order };
}

function collectSourceFiles(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      collectSourceFiles(p, acc);
    } else if (/\.(njk|md)$/i.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

const navEntries = [];
if (!fs.existsSync(SRC_DIR)) {
  note(`模板源码目录不存在（${SRC_DIR}）—— 没有第二份真源可比，直接判红。`);
  fail();
}
for (const file of collectSourceFiles(SRC_DIR, []).sort()) {
  const text = fs.readFileSync(file, "utf8");
  const fm = frontMatterOf(text);
  if (fm === null) continue;
  const entry = navEntryOf(fm);
  if (!entry) continue;
  navEntries.push({ file: path.relative(ROOT, file), ...entry });
}
if (!navEntries.length) {
  note(
    `在 ${path.relative(ROOT, SRC_DIR)} 下找不到任何带 eleventyNavigation 的 front matter —— ` +
      `第二份真源不在场，本门禁没有可比的对象，直接判红。`
  );
  fail();
}

/* ---------- NA1：两份真源必须一一对应 ---------- */
const navLabels = nav.map((n) => String((n && n.label) || "").trim());
const navHrefs = nav.map((n) => String((n && n.href) || "").trim());
const entryKeys = navEntries.map((e) => e.key);

const dupNav = navLabels.filter((l, i) => navLabels.indexOf(l) !== i);
const dupKeys = entryKeys.filter((k, i) => entryKeys.indexOf(k) !== i);
if (dupNav.length) {
  note(
    `src/_data/site.js 的 nav 数组里有**重复**的 label：${[...new Set(dupNav)].join(" / ")} —— ` +
      `一一对应无从谈起。`
  );
}
if (dupKeys.length) {
  note(
    `模板的 eleventyNavigation 里有**重复**的 key：${[...new Set(dupKeys)].join(" / ")} —— ` +
      `一一对应无从谈起。`
  );
}

const navOnly = navLabels.filter((l) => !entryKeys.includes(l));
const keyOnly = entryKeys.filter((k) => !navLabels.includes(k));
if (navOnly.length) {
  note(
    `nav 数组里有、eleventyNavigation 里**没有**的入口：${[...new Set(navOnly)].join(" / ")} —— ` +
      `两份真源不是同一组入口（真源：src/_data/site.js 的 nav 数组）。`
  );
}
if (keyOnly.length) {
  note(
    `eleventyNavigation 里有、nav 数组里**没有**的入口：${[...new Set(keyOnly)].join(" / ")} —— ` +
      `两份真源不是同一组入口（真源：src/_data/site.js 的 nav 数组）。`
  );
}

/* ---------- NA2：位次必须一致（order == nav 数组里的位次） ---------- */
for (let i = 0; i < navLabels.length; i++) {
  const label = navLabels[i];
  const hits = navEntries.filter((e) => e.key === label);
  if (hits.length !== 1) continue; // NA1 已经点过名，这里不重复报
  comparedNav++;
  const expected = i + 1;
  const actual = hits[0].order;
  if (actual === null) {
    note(
      `${hits[0].file}：eleventyNavigation.key = ${label} 那一项**没有写 order** —— ` +
        `它在 nav 数组里是第 ${expected} 位，order 必须等于 ${expected}。`
    );
  } else if (actual !== expected) {
    note(
      `${hits[0].file}：${label} 的 eleventyNavigation.order 是 ${actual}，` +
        `但它在 nav 数组里是第 ${expected} 位 —— 两份真源的**位次**对不上` +
        `（order 只能表达"第几个"，权威的"第几个"就是 nav 数组里的位置）。`
    );
  }
}

/* ---------- 产物：页面清单 + 页头导航 ---------- */
if (!fs.existsSync(SITE)) {
  note(`产物目录不存在（${SITE}）—— 没有判断对象，直接判红。`);
  fail();
}

function productFiles(dir, rel, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) productFiles(p, r, acc);
    else if (e.name.endsWith(".html")) acc.push({ abs: p, rel: r });
  }
  return acc;
}
const htmlFiles = productFiles(SITE, "", []).sort((a, b) => (a.rel < b.rel ? -1 : 1));

/* 站内 URL 集合：index.html → 目录 URL，其余 .html → /相对路径 */
const productUrls = new Set();
for (const f of htmlFiles) {
  if (f.rel === "index.html") productUrls.add("/");
  else if (f.rel.endsWith("/index.html")) productUrls.add(`/${f.rel.slice(0, -"index.html".length)}`);
  else productUrls.add(`/${f.rel}`);
}

function pageUrlOf(rel) {
  if (rel === "index.html") return "/";
  if (rel.endsWith("/index.html")) return `/${rel.slice(0, -"index.html".length)}`;
  return `/${rel}`;
}

/* 把产物里的相对链接还原成站内绝对路径（相对的是它所在页面的目录）。 */
function resolveHref(pageUrl, href) {
  const base = path.posix.dirname(pageUrl);
  let r = href.startsWith("/")
    ? path.posix.normalize(href)
    : path.posix.join(base, href);
  if (href.endsWith("/") && !r.endsWith("/")) r += "/";
  return r;
}

const stripTags = (s) =>
  String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* 页头导航：只认 <nav class="topbar__nav"> 块里的 <a class="topbar__link"> */
function extractHeaderNav(html) {
  const navBlock = html.match(/<nav\b[^>]*class="topbar__nav"[^>]*>([\s\S]*?)<\/nav>/);
  if (!navBlock) return null;
  const links = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(navBlock[1])) !== null) {
    const attrs = m[1];
    if (!/\bclass="topbar__link"/.test(attrs)) continue;
    const hm = attrs.match(/\bhref="([^"]*)"/);
    links.push({ href: hm ? hm[1] : "", text: stripTags(m[2]) });
  }
  return links;
}

/* ---------- NA3：产物页头导航必须与真源逐项一致 ---------- */
for (const f of htmlFiles) {
  const html = fs.readFileSync(f.abs, "utf8");
  const links = extractHeaderNav(html);
  if (links === null) continue; // 这一页没有页头导航（不是本页的判断对象）
  comparedPages++;
  const pageUrl = pageUrlOf(f.rel);

  if (links.length !== nav.length) {
    note(
      `${f.rel}：页头导航有 ${links.length} 项，nav 数组有 ${nav.length} 项 —— ` +
        `产物上的导航与真源不是同一组入口。`
    );
    continue;
  }
  for (let i = 0; i < nav.length; i++) {
    comparedNav++;
    const wantLabel = navLabels[i];
    const wantHref = navHrefs[i];
    const got = links[i];
    if (got.text !== wantLabel) {
      note(
        `${f.rel}：页头导航第 ${i + 1} 项的可见文字是「${got.text}」，` +
          `nav 数组里第 ${i + 1} 项是「${wantLabel}」—— 产物与真源对不上。`
      );
    }
    const gotPath = resolveHref(pageUrl, got.href);
    if (gotPath !== wantHref) {
      note(
        `${f.rel}：页头导航第 ${i + 1} 项（${wantLabel}）点开是 ${gotPath}，` +
          `nav 数组里写的是 ${wantHref} —— 产物与真源对不上。`
      );
    }
  }
}

/* ---------- NA4：导航入口指向的页面必须真实存在 ---------- */
for (let i = 0; i < navHrefs.length; i++) {
  const href = navHrefs[i];
  if (!href) {
    note(`nav 数组第 ${i + 1} 项（${navLabels[i]}）没有写 href —— 这一项点不开。`);
    continue;
  }
  if (!href.startsWith("/")) continue; // 外链入口不在本页判断范围内
  comparedHrefs++;
  if (!productUrls.has(href)) {
    note(
      `nav 数组里的入口 ${href}（${navLabels[i]}）在产物里**没有对应页面** —— ` +
        `访客点开就是本站 404。`
    );
  }
}

/* ---------- NA5：覆盖度自证 + 门禁自己没被卸掉 ---------- */
if (comparedNav === 0 || comparedPages === 0 || comparedHrefs === 0) {
  note(
    `本门禁一处都没比过（比过 nav 项 ${comparedNav} 处 / 产物页 ${comparedPages} 页 / ` +
      `入口 ${comparedHrefs} 个）—— 判据没有落到任何东西上，直接判红。`
  );
}

let pkg = null;
try {
  pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
} catch (e) {
  note(`读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
    note(
      `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) fail();

console.log(
  `顶层导航契约门禁通过：nav 数组 ${nav.length} 项（${navLabels.join(" / ")}），` +
    `eleventyNavigation ${navEntries.length} 项逐位对齐，` +
    `产物 ${comparedPages} 页的页头导航与真源一致，` +
    `${comparedHrefs} 个入口都指向真实存在的页面。`
);
