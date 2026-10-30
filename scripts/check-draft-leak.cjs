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
const matter = require("gray-matter"); // Eleventy 自己用的 front matter 解析器

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
const DL4_ON = true;
const DL5_ON = true;
const DL6_ON = true;

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
 *
 * ⚠️ **判据 DL4 守的就是这一格的完整性**：
 *   这里只收「目录里有同名 `.11tydata.cjs`」的目录 ⇒ 一个**没有**同名数据文件的
 *   新内容目录（front matter 自己带 permalink 的那种）**进不来** ⇒ 它的草稿照发，
 *   而本门禁还报「通过」⇒ **假安全感**。
 *   ⇒ DL4 独立核对：内容根下的**每一个**内容子目录都必须在扫描面里。
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

/** 内容根下的**全部**内容子目录（不管有没有同名数据文件）—— DL4 用它核对扫描面完整性。 */
function findAllContentDirs() {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(CONTENT_DIR, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue;
    if (e.name === ".DS_Store") continue;
    if (!e.isDirectory()) continue;
    out.push(e.name);
  }
  return out;
}

const sections = findSectionDataFiles();
const allContentDirs = findAllContentDirs();

/* ================= DL1：三个数据文件都接上了两件套 ================= */

/**
 * 数据文件**真的**接上了两件套吗？
 *
 * ⚠️ **判法是「行为」，不是「文本匹配」**（2026-10-29 21:30 场次实测踩到）：
 *   最初这一格是纯正则（`/draftGuards\.permalink\s*\(/`）⇒ **死调用假绿**：
 *   把真正的 `permalink:` 改回普通写法、另留一个没人调用的
 *   `draftGuards.permalink(...)` ⇒ 门禁 exit 0，**而草稿照常发布**（本场次实测复现）。
 *   ⇒ 现在改成**真正加载数据文件、调用它导出的 permalink 函数**：
 *   喂一份「draft: true」的数据 ⇒ 返回值必须是 false（= 不写盘）；
 *   喂一份「没有 draft」的数据 ⇒ 返回值必须是那条正常路径（= 照常发布）。
 *   这样「调用点在不在」与「调用点有没有真的接在 permalink 上」是**同一件事** ——
 *   死调用骗不过去了。
 *
 * ⚠️ 加载方式：数据文件 `require("../../eleventy-helpers.cjs")` 相对**数据文件自己**解析
 *   ⇒ 必须把数据文件放在**它自己的位置**上加载 ⇒ 这里直接 require 它的绝对路径
 *   （`src/content/<section>/<section>.11tydata.cjs` ⇒ `../../eleventy-helpers.cjs`
 *   正好落到 `src/eleventy-helpers.cjs`）⇒ 解析得通。
 */
/**
 * 数据文件的 `permalink` **那一行**上是不是真的走了守卫。
 *
 * ⚠️ 为什么不能是"文件里出现过 draftGuards.permalink("（本轮自测踩到）：
 *   那样认的是一个**死调用**也算数 —— 把真正的 permalink 改回普通写法、
 *   另留一个没人调用的守卫调用 ⇒ 门禁绿、而草稿照发（实测复现）。
 *   ⇒ 必须要求守卫**出现在 permalink 键自己的那一行**。
 * ⚠️ 也不能是"数据文件调用起来结果对不对"（那会与 DL2 重复）：
 *   改共享模块 ⇒ DL1 与 DL2 同时红 ⇒ **同一个故障报两遍**、红因归属不纯。
 *   ⇒ 这一格只管**接线**（数据文件这一侧），模块那一侧归 DL2。
 */
function wiringIn(src) {
  // 取「permalink:」开头的**那一行**（允许多行写法的第一行）。
  const lines = src.split("\n");
  let permalinkLine = "";
  for (const line of lines) {
    if (/^\s*permalink\s*:/.test(line)) {
      permalinkLine = line;
      // 多行写法：把紧随其后的续行也算进来（到下一个顶层键为止）。
      const idx = lines.indexOf(line);
      for (let k = idx + 1; k < lines.length; k++) {
        if (/^\s{2}\w/.test(lines[k])) break;
        permalinkLine += " " + lines[k];
      }
      break;
    }
  }
  // 集合侧：在 eleventyComputed 块里找 excludeFromCollections。
  const computedBlock = src.slice(src.indexOf("eleventyComputed") >= 0 ? src.indexOf("eleventyComputed") : 0);
  return {
    permalink: /draftGuards\s*\.\s*permalink\s*\(/.test(permalinkLine),
    collections: /draftGuards\s*\.\s*excludeFromCollections\s*\(/.test(computedBlock),
  };
}

function probeSection(s) {
  let mod = null;
  let loadError = null;
  try {
    mod = require(s.dataFile);
  } catch (e) {
    loadError = e;
  }
  if (!mod || typeof mod.permalink !== "function") {
    return {
      ok: false,
      why: loadError
        ? `加载不了（${String(loadError.message || loadError).split("\n")[0]}）`
        : "导出的不是带 permalink 函数的对象",
    };
  }
  // 合成一份数据：像 Eleventy 那样给出 page.filePathStem（取目录名当 slug）。
  const stem = `/content/${s.section}/probe-slug/index`;
  const draftData = { page: { filePathStem: stem }, draft: true };
  const liveData = { page: { filePathStem: stem } };
  let draftOut;
  let liveOut;
  try {
    draftOut = mod.permalink(draftData);
    liveOut = mod.permalink(liveData);
  } catch (e) {
    return { ok: false, why: `调用 permalink 时抛错（${String(e.message || e).split("\n")[0]}）` };
  }
  if (draftOut !== false) {
    return {
      ok: false,
      why: `喂 draft: true 得到的不是 false（而是 ${JSON.stringify(draftOut)}）`,
    };
  }
  if (typeof liveOut !== "string" || !liveOut.startsWith("/")) {
    return {
      ok: false,
      why: `喂非草稿得到的不是正常路径（而是 ${JSON.stringify(liveOut)}）`,
    };
  }
  // 集合侧：eleventyComputed.eleventyExcludeFromCollections 必须是函数，
  // 且对草稿返回 true、对非草稿返回 false。
  const computed = mod.eleventyComputed;
  if (!computed || typeof computed.eleventyExcludeFromCollections !== "function") {
    return { ok: false, why: "没有 eleventyComputed.eleventyExcludeFromCollections 函数" };
  }
  let exclDraft;
  let exclLive;
  try {
    exclDraft = computed.eleventyExcludeFromCollections(draftData);
    exclLive = computed.eleventyExcludeFromCollections(liveData);
  } catch (e) {
    return {
      ok: false,
      why: `调用 eleventyExcludeFromCollections 时抛错（${String(e.message || e).split("\n")[0]}）`,
    };
  }
  if (exclDraft !== true) {
    return {
      ok: false,
      why: `喂 draft: true 得到的不是 true（而是 ${JSON.stringify(exclDraft)}）`,
    };
  }
  if (exclLive !== false) {
    return {
      ok: false,
      why: `喂非草稿得到的不是 false（而是 ${JSON.stringify(exclLive)}）`,
    };
  }
  return { ok: true, livePath: liveOut };
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
        `内容目录「${s.section}」的数据文件 ${relOf(s.dataFile)} 的草稿抑制没接上${missing.join(" 与 ")} —— ` +
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
  if (
    !mod ||
    typeof mod.isDraft !== "function" ||
    !mod.draftGuards ||
    typeof mod.topLevelScalars !== "function"
  ) {
    fail(
      "DL2",
      `读不出草稿判定的唯一真源 ${relOf(draftModulePath)}` +
        (loadError
          ? `（${String(loadError.message || loadError).split("\n")[0]}）`
          : "（缺 isDraft / draftGuards / topLevelScalars）") +
        `—— 判不了 ≠ 没有：草稿抑制到底接没接上，本门禁无法核对。`
    );
  } else {    const { isDraft, draftGuards } = mod;
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

/* ================= DL4：扫描面完整性 ================= */

/**
 * **每一个**内容子目录都必须在扫描面里。
 *
 * ⚠️ 为什么需要这一格（2026-10-29 21:30 场次实测坐实，不是假想）：
 *   DL3 的下限是「至少 N 个」⇒ **新增**一个内容目录时下限照样满足 ⇒ DL3 不红。
 *   而扫描面（`findSectionDataFiles()`）只收「目录里有同名 `.11tydata.cjs`」的目录
 *   ⇒ 一个**没有**同名数据文件的新内容目录（front matter 自己带 permalink 的那种）
 *   **进不来** ⇒ 它的草稿**照常发布**（实测：页面写出、sitemap 2 处、正文进产物），
 *   而门禁仍报「通过」⇒ **假安全感**。
 *   ⇒ 这一格改成**完整性**判定：内容根下每个子目录，要么在扫描面里（有数据文件），
 *   要么它**根本没有可发布的内容**（一个模板文件都没有）—— 后者才允许放过。
 */
if (DL4_ON) {
  const inScan = new Set(sections.map((s) => s.section));
  const uncovered = [];
  for (const name of allContentDirs) {
    if (inScan.has(name)) continue;
    // 这个目录里有没有会被 Eleventy 当成模板的内容文件？
    const dir = path.join(CONTENT_DIR, name);
    let hasTemplate = false;
    try {
      for (const f of fs.readdirSync(dir)) {
        if (f.startsWith("._") || f === ".DS_Store") continue;
        if (/\.(md|njk|html|11ty\.js|xml|txt)$/.test(f)) {
          hasTemplate = true;
          break;
        }
      }
    } catch (e) {
      hasTemplate = true; // 读不出来 ⇒ 当作有内容（判不了 ≠ 没有）
    }
    if (hasTemplate) uncovered.push(name);
  }
  if (uncovered.length) {
    fail(
      "DL4",
      `这些内容目录不在本门禁的扫描面里 —— ${uncovered.join(" / ")}。` +
        `它们没有同名 \`<name>.11tydata.cjs\` 数据文件 ⇒ 扫描面认不出它们 ⇒ ` +
        `**它们的草稿会照常发布**（实测：页面写出、sitemap 收录、正文进产物），而本门禁却报「通过」。` +
        `要么给这些目录补上同名数据文件并接上草稿抑制（见 src/eleventy-draft.cjs），` +
        `要么把它们移出内容根。`
    );
  }
}

/**
 * 判定一份数据是不是草稿 —— **复用共享模块的真源**（不另抄一份口径：
 * 两处各抄一份就会出现"改一处忘另一处"，那正是本仓反复修的病）。
 */
let isDraftOf = null;
let topLevelScalarsOf = null;
try {
  const draftMod = require(path.join(SRC_DIR, "eleventy-draft.cjs"));
  isDraftOf = draftMod.isDraft;
  topLevelScalarsOf = draftMod.topLevelScalars;
} catch (e) {
  isDraftOf = null;
  topLevelScalarsOf = null;
}

/* ================= DL5：论文数据面（site.publications）也不许漏 ================= */

/**
 * 论文的**数据面**：`src/_data/site.js` 的 `publications` 是**手写数据**（不是集合），
 * 而草稿标记在**内容文件**里 ⇒ 两者分属不同来源 ⇒ 数据面自己看不到草稿。
 *
 * ⚠️ **实测坐实（本轮踩到，不是假想）**：给 `publications` 加一条草稿论文 ⇒
 *   `feed.xml` 里出现一条 `<link>.../papers/<slug>/</link>`，而那个页面被
 *   `permalink: false` 压掉了 ⇒ **feed 里是一条指向 404 的坏链接**，
 *   同时标题与摘要进了订阅源；而当时的门禁还报「通过」。
 *
 * 这一格守两件事：
 *   ① 数据里的每个 `key` 都必须能在内容侧找到对应的 `pubKey`
 *      （键对不上 ⇒ 过滤会**静默失效** ⇒ 草稿照样发布）；
 *   ② 内容侧标了草稿的 `pubKey`，**不得**出现在导出的 `publications` 里。
 */
if (DL5_ON) {
  let siteData = null;
  let siteErr = null;
  try {
    siteData = require(path.join(SRC_DIR, "_data", "site.js"));
  } catch (e) {
    siteErr = e;
  }
  if (!isDraftOf || !topLevelScalarsOf) {
    // 共享模块读不到（或缺 topLevelScalars）⇒ DL2 已经报过「读不出唯一真源」
    //   ⇒ 这里不重复报（同一件事只让一条判据说话）。
    //   ⚠️ 也不**崩**：缺一个读取器就 TypeError ⇒ 门禁自己挂掉 ⇒
    //   「判不了」会伪装成「门禁坏了」，红因归属就断了。
  } else if (!siteData || !Array.isArray(siteData.publications)) {
    fail(
      "DL5",
      `读不出站点数据里的 publications（${relOf(path.join(SRC_DIR, "_data", "site.js"))}）` +
        (siteErr ? `（${String(siteErr.message || siteErr).split("\n")[0]}）` : "") +
        `—— 判不了 ≠ 没有：论文这一路（feed / bib / ris / 列表页）的草稿覆盖核对不了。`
    );
  } else {
    // 内容侧的 pubKey → 它的草稿状态
    const papersDir = path.join(CONTENT_DIR, "papers");
    const contentKeys = new Map(); // pubKey => { slug, draft }
    let entries = [];
    try {
      entries = fs.readdirSync(papersDir, { withFileTypes: true });
    } catch (e) {
      entries = [];
    }
    for (const e of entries) {
      if (e.name.startsWith("._") || e.name === ".DS_Store" || !e.isDirectory()) continue;
      const f = path.join(papersDir, e.name, "paper.md");
      try {
        // ⚠️ 用**顶层标量读取器**读（site.js 实际用的那个）⇒ 拿到的是**字符串**；
        //   门禁侧另外用 gray-matter 读一遍（布尔）⇒ 两者对账（见下面的 ⓪）。
        const scalar = topLevelScalarsOf(fs.readFileSync(f, "utf8"));
        if (scalar.pubKey) {
          contentKeys.set(String(scalar.pubKey), {
            slug: e.name,
            draft: isDraftOf(scalar),
            rawDraft: scalar.draft,
          });
        }
      } catch (e) {
        // 读不出 ⇒ 这一篇不参与核对（内容侧的门禁会另报）。
      }
    }
    // ⚠️ 核对用的是**过滤前**的原始记录（_publicationsAll）——
    //   只看过滤后的 publications 的话，**过滤本身坏了也看不出来**（门禁假绿）：
    //   过滤若失效，草稿会被滤掉 ⇒ 导出的列表里当然没有它 ⇒ 判据永远绿。
    //   ⇒ 拿原始记录逐条问「这一篇在内容侧是不是草稿？」，
    //   再问「它有没有被正确地滤掉？」
    const raw = Array.isArray(siteData._publicationsAll)
      ? siteData._publicationsAll
      : siteData.publications;
    if (!Array.isArray(siteData._publicationsAll)) {
      fail(
        "DL5",
        `站点数据没有导出过滤前的原始记录（_publicationsAll）—— ` +
          `判据没法区分「过滤生效」与「过滤坏了」⇒ 只能看到过滤后的结果。`
      );
    }
    // ⓪ **两份口径必须一致**：site.js 用的是**零依赖**的顶层标量读取器
    //    （src/eleventy-draft.cjs 的 topLevelScalars）—— 因为 site.js 被
    //    scripts/check-live-site.cjs require，而那个脚本跑在**没有 npm ci** 的
    //    verify-live job 里 ⇒ 那里没有 node_modules ⇒ site.js 绝不能 require
    //    第三方包（发布落点门禁的 DP13 守这一条，本轮实测当场抓到）。
    //    ⇒ 这里用**真正的 YAML 解析器**（gray-matter）交叉核对两份口径：
    //    不一致 ⇒ 判红。⇒ 不是「两份副本各自演化」，而是「一份实现 ＋ 一处强制对账」。
    for (const [pk, info] of contentKeys) {
      const f = path.join(CONTENT_DIR, "papers", info.slug, "paper.md");
      let yamlData;
      try {
        yamlData = matter(fs.readFileSync(f, "utf8")).data;
      } catch (e) {
        continue;
      }
      // ⚠️ 比的是**两个解析器对同一个文件的原始读数**，不是「isDraft 的二次判定」——
      //   后者恒相等（isDraft 是**同一份**实现），比了等于没比 ⇒ 恒绿。
      //   真正的漂移风险在**解析器**：顶层标量读取器不处理 YAML 的引号 / 转义 / 类型，
      //   与 gray-matter 的读数可能不同 ⇒ 草稿过滤会**静默失效**（当成草稿的论文被发布）。
      const viaYaml = yamlData.draft;
      const viaScalar = info.rawDraft;
      const same =
        String(viaYaml) === String(viaScalar) ||
        (viaYaml === undefined && viaScalar === undefined);
      if (!same) {
        fail(
          "DL5",
          `论文「${pk}」的 draft 读数两处不一致 —— YAML 解析器读到 ${JSON.stringify(viaYaml)}，` +
            `零依赖的顶层标量读取器读到 ${JSON.stringify(viaScalar)}。` +
            `site.js 用的是后者（它不能引第三方包：跑在没有 npm ci 的 verify-live job 里），` +
            `两处读数不一致 ⇒ 草稿过滤会**静默失效**（本该当草稿的论文被发布出去）。`
        );
      }
    }
    // ① 键对应
    const orphanKeys = raw
      .map((p) => p && p.key)
      .filter((k) => k !== undefined && k !== null && !contentKeys.has(String(k)))
      .map(String);
    if (orphanKeys.length) {
      fail(
        "DL5",
        `站点数据里的 publications 有这些 key 在内容侧找不到对应的 pubKey —— ${orphanKeys.join(" / ")}。` +
          `草稿过滤靠的就是 pubKey ↔ key 的对应（内容文件的 pubKey 指回数据里的 key）；` +
          `键对不上 ⇒ 那一篇的草稿状态**过滤不到** ⇒ 它会照常进 feed / bib / ris / 列表页。`
      );
    }
    // ② 内容侧标了草稿的论文，必须已经被过滤掉
    const exported = new Set(siteData.publications.map((p) => String(p && p.key)));
    const notFiltered = raw
      .filter((p) => {
        const c = p && contentKeys.get(String(p.key));
        return c && c.draft && exported.has(String(p.key));
      })
      .map((p) => String(p.key));
    if (notFiltered.length) {
      fail(
        "DL5",
        `这些论文在内容侧标了草稿，却仍然出现在导出的 publications 里 —— ${notFiltered.join(" / ")}。` +
          `它们会进 feed.xml / publications.bib / publications.ris / /papers/ 列表页 / 首页` +
          `（实测：feed 里还会是一条指向 404 的坏链接，因为那个页面被 permalink:false 压掉了）。`
      );
    }
  }
}

/* ================= DL6：按文件复制的附件也不许漏 ================= */

/**
 * **附件复制**（不是模板渲染路径）也必须尊重草稿状态。
 *
 * ⚠️ **实测坐实（本轮踩到，不是假想）**：两处按文件复制的逻辑**看不见**前面那两件套：
 *   ① `addPassthroughCopy(...)` 复制论文的 annotations.json（glob 复制，不问草稿）；
 *   ② `copyCovers()` 无条件复制 `cover.{svg,png,jpg,jpeg,webp}`。
 *   实测：给一篇**草稿**论文放上 annotations.json 与 cover.png ⇒ **两个文件都进了 `_site/`**
 *   （内容里的标记串能 grep 到）⇒ 批注（可能含**未发表结论**）与封面图（可能是未公开结果图）
 *   **在草稿被压住之后仍然上线**。
 *
 * 这一格怎么判：**读 eleventy.config.js 的源码文本**，看那两处复制逻辑是不是
 * **先问过草稿状态**（`isDraftDir`）。为什么只能读文本：这两处逻辑在
 * `eleventy.after` 钩子里，要真的判它们的行为就得跑一次构建（贵）。
 * ⇒ 文本判据是**弱**的（理论上可以骗过），但它守住的是「别把守卫删了」这一层 ——
 * 而「守卫真的有效」由**上面那两格**（DL1 的行为验证 + 本轮的端到端实测）保证。
 */
if (DL6_ON) {
  const cfgPath = path.join(SRC_DIR, "..", "eleventy.config.js");
  let cfg = null;
  try {
    cfg = fs.readFileSync(cfgPath, "utf8");
  } catch (e) {
    cfg = null;
  }
  if (cfg === null) {
    fail(
      "DL6",
      `读不到构建配置 ${relOf(cfgPath)} —— 判不了 ≠ 没有：附件复制这一路（annotations.json / cover）` +
        `是否尊重草稿状态核对不了。`
    );
  } else {
    // 剥掉注释再看（注释里提到守卫不算数：那是"看起来在、其实不生效"）。
    const code = cfg
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    // ⚠️ **两处复制逻辑要分别查**（本轮自测当场抓到这一格的第一版有洞）：
    //   ① copyCovers（复制 cover.*）② copyAnnotations（复制 annotations.json）。
    //   只查"文件里有没有 isDraftDir(" ⇒ 删掉其中一处的守卫、另一处还在 ⇒ 照样假绿。
    // ⚠️ **两处复制逻辑要分别查**（本轮自测当场抓到这一格的第一版有洞）：
    //   ① copyCovers（复制 cover.*）② copyAnnotations（复制 annotations.json）。
    //   只查"文件里有没有 isDraftDir(" ⇒ 删掉其中一处的守卫、另一处还在 ⇒ 照样假绿。
    //   ⇒ 改成**按函数体切片**分别查：
    const bodyOf = (fnName) => {
      const i = code.indexOf(fnName);
      if (i < 0) return "";
      // 从函数名起，到下一个顶层 const/function 声明之前
      const rest = code.slice(i);
      const m = rest.match(/\n  (?:const|function|eleventyConfig\.|\/\*)/);
      return m ? rest.slice(0, m.index) : rest;
    };
    const coverBody = bodyOf("const copyCovers");
    const annBody = bodyOf("const copyAnnotations");
    const copyProblems = [];
    if (!/isDraftDir\s*\(/.test(coverBody)) {
      copyProblems.push("封面图复制（copyCovers）");
    }
    if (!/isDraftDir\s*\(/.test(annBody)) {
      copyProblems.push("批注复制（copyAnnotations）");
    }
    if (copyProblems.length) {
      fail(
        "DL6",
        `构建配置里的这几处附件复制逻辑没有问过草稿状态 —— ${copyProblems.join("、")}` +
          `（${relOf(cfgPath)}）。实测：草稿论文的 annotations.json 与 cover.* 会照样进 _site/` +
          `（批注可能含未发表结论、封面图可能是未公开的结果图）。`
      );
    }
  }
}

/* ================= 汇总 ================= */

if (problems.length) {
  console.error("草稿抑制门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p.id}：${p.msg}`));
  console.error("");
  process.exit(1);
}

const wired = sections.filter((s) => probeSection(s).ok).map((s) => s.section);

console.log(
  `草稿抑制门禁通过：认出 ${sections.length} 个内容目录的数据文件` +
    `（${sections.map((s) => s.section).join(" / ")}）；` +
    `其中 ${wired.length} 个真的接上了草稿抑制的两件套` +
    `（${wired.join(" / ") || "无"}，判定方式＝加载数据文件并调用它导出的 permalink 函数）；` +
    `共享模块 src/eleventy-draft.cjs 的判定与两处守卫逐条核对通过。`
);
