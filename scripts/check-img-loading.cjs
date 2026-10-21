#!/usr/bin/env node
/**
 * 门禁 IL1–IL6：图片的加载策略声明（loading / fetchpriority）
 *
 * 为什么要有这个门禁（一次实测坐实的**构造层违规 + 看护缺口**，不是假想）：
 *   本站的**作者肖像**有两处出口：首页 `hero.njk` 与关于页 `about.njk`，
 *   两处用的是**同一张图**（`site.author.photo.portrait`）、**同一个角色**
 *   （首屏 hero 肖像）。而本站自己写下的约定是这四句话：
 *     · `src/_includes/partials/hero.njk`：「照片是首屏 LCP 候选：写死
 *       width/height（零 CLS）、loading="eager" + fetchpriority="high"、小图走
 *       srcset/sizes」
 *     · `src/_includes/partials/publications.njk`：「本页 LCP 是 hero 人像
 *       （eager + fetchpriority=high）」
 *     · `scripts/check-img-srcset.cjs` 的文件头：「本站这两张肖像带
 *       loading="eager" + fetchpriority="high" ⇒ 它们就是 LCP 元素」
 *     · `docs/DEFECT-BACKLOG.md` §2「图片」行：「首页与关于页肖像带 srcset +
 *       sizes + loading="eager" + fetchpriority="high" + decoding="async"
 *       （LCP 元素已优化）」
 *   ⇒ **四处**都写着「关于页肖像也带 loading="eager" + fetchpriority="high"」。
 *   而**实测产物**里那两个属性**一个都没有**：
 *     · 首页肖像（`.home-portrait__img`）：loading="eager" + fetchpriority="high" ✅
 *     · 关于页肖像（`.about-hero__photo`）：**两个属性都缺** ❌
 *   ⇒ 关于页的 LCP 候选图**以浏览器默认优先级加载**，与首页同一张图、同一个
 *     角色的写法不一致。而全仓**没有任何一道门禁**核过 loading / fetchpriority：
 *     · `scripts/verify-site.cjs` 第 25 / 26 条只核 `<img>` 的 `alt` 与
 *       `width` / `height` 的**存在性**；
 *     · `scripts/check-img-srcset.cjs`（SX1–SX6）只核 `srcset` 候选的**存在性**；
 *     · `scripts/check-a11y.cjs`（A1–A8）只核**文字与底色**的对比度。
 *   ⇒ 这一族（"该被守住的没人看守"）本轮又中了一发。
 *
 * 六条判据（编号用独立字母体系 IL*，**不与既有前缀冲突**：
 *   其余各族 GA* / GB* / FC* / FS* / SX* / FD* / GA* / IA* / AP* / NA* /
 *   TD* / HC* / LM* / RD* / DS* / PT* / AN* / TR* / JS* / CQ* / CW* / … 均不同名）：
 *   IL1 每张真实 `<img>` 必须**显式声明** `loading`，且取值只能是 `eager` /
 *      `lazy` —— 缺了就是落回浏览器默认（eager），等于「首屏之外的图也抢带宽」；
 *      写错取值（`auto` / 空串之类）浏览器会**静默忽略**整条声明。
 *   IL2 `loading="eager"` 的 `<img>` 必须同时声明 `fetchpriority="high"` ——
 *      eager 的意思就是「这张图优先」，优先级必须显式给出来。
 *   IL3 `fetchpriority="high"` 的 `<img>` 必须同时声明 `loading="eager"` ——
 *      两个属性**成对**：`high` 配 `lazy` 是自相矛盾的声明（lazy = 不急，
 *      high = 最急），浏览器只能二选一。
 *   IL4 `fetchpriority` 的取值只能是 `high` / `low` / `auto` —— 拼错（`hign`）
 *      会被浏览器**静默忽略**，整条优先级提示失效。
 *   IL5 **覆盖度自证** —— 产物里一处真实 `<img>` 都没有 ⇒ 说明枚举器坏了，
 *      不是「没问题」；同时报出 eager / lazy / 未声明 各多少张。
 *      ⚠️ **计数放在判定开关之外**：否则自测卸掉某条判据时会连带触发本条，
 *      负对照就永远转不了绿。
 *   IL6 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · 只判**声明** —— 不判浏览器实际挑中哪个 srcset 候选，也不判「哪个元素
 *     真的是 LCP」。LCP 取决于视口与内容，属**浏览器级判据**（对应缺陷清单
 *     D10 / 待拍板 42 的范围），本门禁不代拍。
 *   · 只判**静态 HTML**：JS 运行时写出来的 `<img>` 判不了（本站没有这种用法）。
 *   · 只判**产物**（_site）而不是源码：浏览器加载的是产物，产物的写法由模板
 *     渲染时决定 ⇒ 判产物 = 判访客真正经历的那件事。
 *   · 不判**加载快慢**：`loading` / `fetchpriority` 的收益是性能取舍，
 *     本门禁只守「声明得对不对」。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR —— 产物目录（默认 _site）
 *   PKG_PATH —— package.json 的路径（默认仓库根的 package.json）——
 *               自测用它证明 IL6「门禁自己被卸掉」那条判据真的在起作用。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const IL1_ON = true;
const IL2_ON = true;
const IL3_ON = true;
const IL4_ON = true;
const IL5_ON = true;
const IL6_ON = true;

/* IL5 的覆盖度下限（产物里真实 <img> 少于这个数，说明枚举逻辑坏了，
   不是「没问题」）。实测产物里共 5 张真实 <img>，留一点余量。 */
const MIN_IMGS = 4;

const problems = [];
/** 记一条判红。判红条目一律带自己的判据编号前缀（「· ILn：」），自测据此点名。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
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
 * ⇒ 属性值里出现的 `<img ...>` 不会被误当成真标签。
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

/* ================= 工具：属性取值规范化 ================= */

/* HTML 里 loading / fetchpriority 都是 ASCII 大小写不敏感的枚举属性，
   所以比较时统一小写去空白；但**取值本身**必须落在合法集合里。 */
function norm(value) {
  return value === undefined ? undefined : String(value).trim().toLowerCase();
}

const LOADING_VALUES = new Set(["eager", "lazy"]);
const FETCHPRIORITY_VALUES = new Set(["high", "low", "auto"]);

/* ================= 产物清单 ================= */

if (!fs.existsSync(SITE)) {
  console.error("图片加载策略门禁未通过：\n");
  console.error(`  ✗ 找不到产物目录 ${SITE} —— 先跑 npm run build 再跑本门禁。`);
  console.error("");
  process.exit(1);
}

const htmlFiles = walk(SITE)
  .filter((f) => path.extname(f).toLowerCase() === ".html")
  .sort();

/* 计数（覆盖度自证用，IL5）—— **无条件**累加，绝不放进判定开关里。 */
let countImgs = 0;
let countEager = 0;
let countLazy = 0;
let countUndeclared = 0;

/* ================= 扫 HTML：收集 <img> 的加载策略声明 ================= */

const WANTED_TAGS = new Set(["img"]);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, "utf8");
  const clean = stripNoise(html);
  const pageRel = path.relative(SITE, file).split(path.sep).join("/");

  for (const t of scanTags(clean, WANTED_TAGS)) {
    const attrs = parseAttrs(t.attrSrc);
    const line = lineOf(html, t.start);

    countImgs++;
    const lval = norm(attrs.loading);
    const fval = norm(attrs.fetchpriority);
    if (lval === "eager") countEager++;
    else if (lval === "lazy") countLazy++;
    else countUndeclared++;

    const where = `${pageRel}:${line}：<img class="${attrs.class || "(无 class)"}">`;

    /* IL1：必须显式声明 loading，且取值合法 */
    if (IL1_ON) {
      if (lval === undefined) {
        fail(
          "IL1",
          `${where} 没有声明 loading —— 浏览器会落回默认值（eager），` +
            `等于「首屏之外的图也抢带宽」。本站约定：首屏图写 loading="eager" + ` +
            `fetchpriority="high"，折叠以下的图写 loading="lazy"。`
        );
      } else if (!LOADING_VALUES.has(lval)) {
        fail(
          "IL1",
          `${where} 的 loading="${attrs.loading}" 不是合法取值 —— ` +
            `只能是 "eager" 或 "lazy"；写错的取值会被浏览器**静默忽略**，` +
            `整条加载策略等于没写。`
        );
      }
    }

    /* IL2：eager 必须配 fetchpriority="high" */
    if (IL2_ON && lval === "eager" && fval !== "high") {
      fail(
        "IL2",
        `${where} 声明了 loading="eager" 却没有 fetchpriority="high" —— ` +
          `eager 的意思就是「这张图优先」，优先级必须显式给出来` +
          `（当前 fetchpriority=${attrs.fetchpriority === undefined ? "（未声明）" : `"${attrs.fetchpriority}"`}）。`
      );
    }

    /* IL3：fetchpriority="high" 必须配 loading="eager" */
    if (IL3_ON && fval === "high" && lval !== "eager") {
      fail(
        "IL3",
        `${where} 声明了 fetchpriority="high" 却把 loading 写成 ` +
          `${lval === undefined ? "（未声明）" : `"${attrs.loading}"`} —— ` +
          `这两个属性是**成对**的：high（最急）配 lazy（不急）自相矛盾，浏览器只能二选一。`
      );
    }

    /* IL4：fetchpriority 取值必须合法 */
    if (IL4_ON && fval !== undefined && !FETCHPRIORITY_VALUES.has(fval)) {
      fail(
        "IL4",
        `${where} 的 fetchpriority="${attrs.fetchpriority}" 不是合法取值 —— ` +
          `只能是 "high" / "low" / "auto"；拼错会被浏览器**静默忽略**，` +
          `整条优先级提示失效。`
      );
    }
  }
}

/* ================= IL5：覆盖度自证 ================= */

if (IL5_ON && countImgs < MIN_IMGS) {
  fail(
    "IL5",
    `本门禁一处都没比过（产物里只扫到 ${countImgs} 张真实 <img>，下限 ${MIN_IMGS}）—— ` +
      `判据没有落到任何东西上，直接判红。`
  );
}

/* ================= IL6：门禁自己没被卸掉 ================= */

if (IL6_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("IL6", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
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
      fail(
        "IL6",
        `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`
      );
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) {
  console.error("图片加载策略门禁未通过（" + problems.length + " 条）：");
  for (const p of problems) console.error("  · " + p);
  console.error("");
  process.exit(1);
}

console.log(
  `图片加载策略门禁通过：产物 ${htmlFiles.length} 个页面里 ${countImgs} 张真实 <img>` +
    `（eager ${countEager} / lazy ${countLazy} / 未声明或非法 ${countUndeclared}）；` +
    `每张都显式声明了 loading，eager 的都配了 fetchpriority="high"，` +
    `fetchpriority 取值合法；本门禁接在 build 链上。`
);
