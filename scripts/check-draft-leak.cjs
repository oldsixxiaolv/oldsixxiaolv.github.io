#!/usr/bin/env node
/**
 * 草稿抑制门禁 —— 守住「作者标了草稿 ⇒ 它就不会被发布」这件事（判据 DL1–DL3）。
 *
 * 为什么要有这道门禁（2026-10-29 21:30 场次实测坐实，不是假想）：
 *   Eleventy **3.x 完全不认识 `draft` 这个字段** ——
 *   实测 `grep -rni draft node_modules/@11ty/eleventy/src/` **零命中**；
 *   上游 `Template.js` 只认 `permalink: false`（注释原文：「`permalink: false`
 *   means render but no file system write, e.g. use in collections only」）。
 *   ⇒ 一篇文章写 `draft: true`，Eleventy 3 **照样发布**：页面写进 `_site/`、
 *   正文进产物、`sitemap.xml` 与 `feed.xml` 各有一条、列表页也有一张卡。
 *   本场次在**真实仓副本**上实测过（改动前）：草稿页被发布、
 *   `SECRET-DRAFT-BODY-MARKER` 出现在产物里、sitemap 2 处、feed 2 处、列表页 2 处。
 *   ⇒ `draft: true` 是个**空字段**：作者以为它拦住了发布，它一个字都没做。
 *
 *   这道门禁守的是**接线**：判定逻辑放在 `src/eleventy-draft.cjs`（唯一真源），
 *   三个内容目录的数据文件（blog / papers / portfolio）各接两处 ——
 *   `permalink` 侧不写盘 ＋ `eleventyExcludeFromCollections` 侧不进集合。
 *
 * ⚠️ **为什么判据不写成「产物里没有草稿」**（那才是直白的写法，但它是错的）：
 *   ① 那是**产物侧**判据 ⇒ 它只能证明「此刻没有草稿外泄」，而**此刻仓里 0 篇草稿**
 *      ⇒ 这道判据在真仓上**恒绿** ⇒ 正是本仓反复修的「看起来在、其实不生效」那一族
 *      （见 check-gates-wired.cjs 文件头）。⇒ 判据必须落在**机制**上。
 *   ② 真源在**源码**里（数据文件 + 共享模块），不在产物里 ⇒ 判据就该读源码。
 *   ⇒ 本门禁读**真实的数据文件与共享模块**，判「抑制机制接没接上、接对没接对」。
 *
 * 三条判据（编号用独立字母体系 DL*，与既有各族均不同名：
 *   门禁接线门禁的 GW*、README 门禁的 RD*、产物洁净度的 AH*、
 *   站点 JS 的 JS*、第三方资源的 TD*、发布落点的 DP*、写作契约的 WC* 等）：
 *   DL1 **三个内容目录的数据文件都接上了草稿抑制** ——
 *        每个数据文件必须同时接上 `permalink` 侧与集合侧（两件套）。
 *        缺任一件 ⇒ 判红（半拉子抑制：只接 permalink ⇒ 模板仍留在集合里，
 *        feed 会多一条指向站点根的坏条目、列表页会多一张卡；
 *        只接集合 ⇒ 页面照样写进 `_site/`，猜到 URL 就能访问）。
 *   DL2 **接法必须真的生效** ——
 *        门禁**实际调用**共享模块的判定函数与两个守卫函数，
 *        验证「`draft: true` ⇒ permalink 为 false ＋ 集合侧为 true」，
 *        且「`draft` 缺席或为 false ⇒ permalink 是正常路径 ＋ 集合侧为 false」
 *        （防「一��都返回 false」这种把整站内容都干掉的过宽实现）。
 *   DL3 **覆盖度自证** ——
 *        本门禁必须真的认出了**三个**内容目录的数据文件与共享模块；
 *        认不出（或数量不足）⇒ 判红。防止「扫描面被收窄 ⇒ 恒绿」。
 *
 * ⚠️ **诚实边界（写清楚才算数）**：
 *   · 本门禁管的是**产物面**（`_site/` 与它派生出的 sitemap / feed / 列表页）。
 *     **源码面管不住**：本站的**发布仓就是源码仓**，而它是 **PUBLIC**
 *     （`gh repo view oldsixxiaolv/oldsixxiaolv.github.io` → `visibility: PUBLIC`）
 *     ⇒ 一篇草稿的**正文在 GitHub 上人人可读**（`src/content/blog/<slug>/index.md`）。
 *     ⇒ **产物面抑制 ≠ 保密**；真要保密，草稿就不能放进这个仓
 *     （属取舍，已登记为待拍板 67，本门禁**不代拍**）。
 *   · 本门禁**不判断**「作者是否想用草稿机制」——那是取舍，不是缺陷。
 *   · ⚠️ **本门禁管的是「内容目录里的文章」，管不到「数据常量里的论文」** ——
 *     `src/_data/site.js` 的 `publications` 是**手写的数据**（不是集合），
 *     `feed.njk` / `publications.bib.njk` / `publications.ris.njk` / `/papers/` 列表页
 *     都从它取数据 ⇒ **一篇在 `site.js` 里登记的论文必然进 feed / bib / ris**，
 *     与它有没有 `draft` 标记**无关**（那个标记也不在那条数据上）。
 *     ⇒ 论文要撤下，改的是 `site.js` 里的登记（删条目 / 撤资源），**不是** front matter。
 *   · 本门禁读的是**数据文件的源码文本**（不是 require 它们）：
 *     数据文件 `require("../../eleventy-helpers.cjs")` 与 `require("../../eleventy-draft.cjs")`
 *     相对**数据文件自己**解析 ⇒ 从仓根 require 会解析不到 ⇒ 只能做文本层面的核对。
 *     共享模块 `src/eleventy-draft.cjs` 是**纯函数、无副作用、不 require 任何东西**
 *     ⇒ 它可以被门禁**真正 require 进来调用**（判据 DL2 就是这么做的）。
 *
 * 环境变量（供 scripts/test-draft-leak.cjs 的注入矩阵用）：
 *   CONTENT_DIR —— 覆盖内容目录的父目录（默认 `src/content`）。
 *   SRC_DIR     —— 覆盖源码根（默认 `src`）。
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = process.env.SRC_DIR
  ? path.resolve(process.env.SRC_DIR)
  : path.join(ROOT, "src");
const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(SRC_DIR, "content");

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const DL1_ON = true;
const DL2_ON = true;
const DL3_ON = true;

const problems = [];
const fail = (id, msg) => problems.push({ id, msg });

/**
 * 站内相对路径（用于红因指名道姓）。
 *
 * ⚠️ 相对**仓库根**算；夹具站在仓库外时（自测的注入矩阵）会得到一串 `../..`，
 *   那不好看但不是错 —— 它仍然唯一地指出了是哪个文件。
 */
function relOf(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

/* ================= 扫描面：找出各内容目录的数据文件 ================= */

/**
 * 内容目录的清单**从磁盘推导**，不写死列表 ——
 * 写死的话，新增一个内容目录就会静默漏掉它（那正是"恒绿"的另一条路）。
 */
function findSectionDataFiles() {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(CONTENT_DIR, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // exFAT 上的 AppleDouble 资源叉
    if (e.name === ".DS_Store") continue;
    if (!e.isDirectory()) continue;
    const dir = path.join(CONTENT_DIR, e.name);
    const dataFile = path.join(dir, `${e.name}.11tydata.cjs`);
    if (!fs.existsSync(dataFile)) continue;
    out.push({ section: e.name, dataFile });
  }
  return out;
}

const sections = findSectionDataFiles();

/* ================= DL1：三个数据文件都接上了两件套 ================= */

/**
 * 数据文件里是否接上了「permalink 侧」与「集合侧」。
 *
 * 认的是**语义**（用的是本仓共享模块提供的守卫），不是认某个字符串：
 * 认「这个文件里出现了 draftGuards.permalink / draftGuards.excludeFromCollections」
 * 这两个调用点（经由共享模块的真源），而不是认「文件里出现了 draft 这个词」。
 */
function wiringIn(src) {
  return {
    permalink: /draftGuards\s*\.\s*permalink\s*\(/.test(src),
    collections: /draftGuards\s*\.\s*excludeFromCollections\s*\(/.test(src),
  };
}

if (DL1_ON) {
  for (const s of sections) {
    const src = fs.readFileSync(s.dataFile, "utf8");
    const w = wiringIn(src);
    const missing = [];
    if (!w.permalink) missing.push("permalink 侧");
    if (!w.collections) missing.push("集合侧");
    if (missing.length) {
      fail(
        "DL1",
        `内容目录「${s.section}」的数据文件 ${relOf(s.dataFile)} 没有接上草稿抑制的` +
          `${missing.join(" 与 ")} —— ` +
          `Eleventy 3 完全不认识 \`draft\` 字段（上游源码零命中）⇒ ` +
          `漏接的这一侧会让作者标了草稿的文章**照样发布**。` +
          `两件套缺一不可：只接 permalink ⇒ 模板仍留在集合里（feed 会多一条坏条目、列表页会多一张卡）；` +
          `只接集合 ⇒ 页面照样写进 _site/（猜到 URL 就能访问）。`
      );
    }
  }
}

/* ================= DL2：接法真的生效（真正调用共享模块） ================= */

if (DL2_ON) {
  const draftModulePath = path.join(SRC_DIR, "eleventy-draft.cjs");
  let mod = null;
  let loadError = null;
  try {
    mod = require(draftModulePath);
  } catch (e) {
    loadError = e;
  }
  if (!mod || typeof mod.isDraft !== "function" || !mod.draftGuards) {
    fail(
      "DL2",
      `读不出草稿判定的唯一真源 ${relOf(draftModulePath)}` +
        (loadError ? `（${String(loadError.message || loadError).split("\n")[0]}）` : "（缺 isDraft 或 draftGuards）") +
        `—— 判不了 ≠ 没有：草稿抑制到底接没接上，本门禁无法核对。`
    );
  } else {
    const { isDraft, draftGuards } = mod;
    const cases = [
      {
        what: "draft: true（布尔）",
        data: { draft: true },
        wantDraft: true,
      },
      {
        what: 'draft: "true"（字符串）',
        data: { draft: "true" },
        wantDraft: true,
      },
      {
        what: "draft 缺席",
        data: {},
        wantDraft: false,
      },
      {
        what: "draft: false（显式声明要发布）",
        data: { draft: false },
        wantDraft: false,
      },
    ];
    for (const c of cases) {
      const got = isDraft(c.data);
      if (got !== c.wantDraft) {
        fail(
          "DL2",
          `草稿判定口径不对：${c.what} 应当${c.wantDraft ? "算草稿" : "不算草稿"}，` +
            `实测是${got ? "草稿" : "非草稿"}（判据 DL2）。`
        );
      }
    }
    // 两件套各自的返回值。
    const draftGuardsChecks = [
      {
        what: "permalink 侧",
        got: draftGuards.permalink("/blog/x/", { draft: true }),
        want: false,
        show: (v) => (v === false ? "false" : JSON.stringify(v)),
      },
      {
        what: "集合侧",
        got: draftGuards.excludeFromCollections({ draft: true }),
        want: true,
        show: (v) => JSON.stringify(v),
      },
    ];
    for (const c of draftGuardsChecks) {
      if (c.got !== c.want) {
        fail(
          "DL2",
          `草稿抑制的${c.what}接线不对：草稿应当得到 ${c.show(c.want)}，` +
            `实测得到 ${c.show(c.got)}（判据 DL2）。`
        );
      }
    }
    // 防「过宽实现」：非草稿必须照常发布。
    const livePath = draftGuards.permalink("/blog/live-post/", {});
    if (livePath !== "/blog/live-post/") {
      fail(
        "DL2",
        `草稿抑制的 permalink 侧过宽 —— 非草稿的正常路径应当原样返回（/blog/live-post/），` +
          `实测返回 ${JSON.stringify(livePath)}（判据 DL2）。`
      );
    }
    if (draftGuards.excludeFromCollections({}) !== false) {
      fail(
        "DL2",
        `草稿抑制的集合侧过宽 —— 非草稿不应当被排除出集合（应当得到 false），` +
          `实测得到 ${JSON.stringify(draftGuards.excludeFromCollections({}))}（判据 DL2）。`
      );
    }
  }
}

/* ================= DL3：覆盖度自证 ================= */

/**
 * 至少要认出三个内容目录的数据文件 + 共享模块。
 *
 * 为什么下限是 3：站内现有三个内容目录（blog / papers / portfolio），
 * 三个都接了才叫「三个都接上了」。⚠️ 这个下限**会随站内内容目录增减而变** ——
 * 它是「本门禁至少比过这么多东西」的自证，不是「站内必须有几个集合」的规格。
 *
 * ⚠️ **共享模块不在时不重复报**（同一件事只让一条判据说话）：
 *   DL2 已经报了「读不出草稿判定的唯一真源」⇒ 那一格**已经**说明了本门禁
 *   比不了什么 ⇒ 这里再报一遍「几乎没比过任何东西」是**同一个故障报两次**，
 *   还会把红因归属搅浑（DL2 与 DL3 同时在场 ⇒ 归因不纯）。
 *   ⇒ 共享模块不在 ⇒ DL3 只保留「内容目录数量不足」那一格。
 */
const MIN_SECTIONS = 3;

if (DL3_ON) {
  const missing = [];
  if (sections.length < MIN_SECTIONS) {
    missing.push(`认出的内容目录数据文件 ${sections.length} 个（至少 ${MIN_SECTIONS} 个）`);
  }
  const draftModulePath = path.join(SRC_DIR, "eleventy-draft.cjs");
  const moduleExists = fs.existsSync(draftModulePath);
  // 共享模块不在 ⇒ DL2 已经报过（读不出真源 ⇒ 判不了 ≠ 没有）⇒ 这里不重复报。
  if (!moduleExists && DL2_ON) {
    const dl2Reported = problems.some((p) => p.id === "DL2" && p.msg.includes("唯一真源"));
    if (!dl2Reported) {
      missing.push(`草稿判定的唯一真源 ${relOf(draftModulePath)} 不在`);
    }
  } else if (!moduleExists) {
    missing.push(`草稿判定的唯一真源 ${relOf(draftModulePath)} 不在`);
  }
  if (missing.length) {
    fail(
      "DL3",
      `本门禁几乎没比过任何东西 —— ${missing.join("；")}。` +
        `扫描面被收窄或枚举坏了，此时「通过」是**空跑**，空跑的门禁等于没有门禁。`
    );
  }
}

/* ================= 汇总 ================= */

if (problems.length) {
  console.error("草稿抑制门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p.id}：${p.msg}`));
  console.error("");
  process.exit(1);
}

const wired = sections.filter((s) => {
  const w = wiringIn(fs.readFileSync(s.dataFile, "utf8"));
  return w.permalink && w.collections;
}).map((s) => s.section);

console.log(
  `草稿抑制门禁通过：认出 ${sections.length} 个内容目录的数据文件` +
    `（${sections.map((s) => s.section).join(" / ")}）；` +
    `其中 ${wired.length} 个接上了草稿抑制的两件套` +
    `（${wired.join(" / ") || "无"}）；` +
    `共享模块 src/eleventy-draft.cjs 的判定与两处守卫逐条核对通过。`
);
