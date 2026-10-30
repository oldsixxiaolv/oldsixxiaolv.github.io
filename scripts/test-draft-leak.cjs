#!/usr/bin/env node
/**
 * 草稿抑制门禁（scripts/check-draft-leak.cjs）的**本地夹具自测**。
 *
 * 这个自测要证明两件事，缺一不可：
 *   ① 门禁**能变红** —— 每条判据各有一档注入，让它真的报出来；
 *   ② 门禁**红得准** —— 只断言「注入能变红」不够，那只说明门禁**有反应**，
 *      不说明红因来自**那一条判据**。所以每档红都同时断言：
 *      · 该条判据的编号**必须出现在失败条目里**；
 *      · **其它**判据的编号**必须不出现**（否则就是同源缺陷，红因不纯）。
 *      再给每条判据补一档**负对照**：把门禁副本里的 `const DLn_ON = true;`
 *      改成 false 之后，对应的注入必须**转绿**，才能证明红因确实是这一条
 *      判据判出来的。
 *
 * 为什么必须自测（这不是形式主义）：
 *   这道门禁守的是**接线**（不是「此刻有没有草稿外泄」）——
 *   站内此刻**一篇草稿都没有** ⇒ 一道只看产物的判据在真站上**恒绿**，
 *   那正是 check-gates-wired.cjs 文件头写的同一族形态（「看起来在、其实不生效」）。
 *   ⇒ 这道门禁必须能证明「**漏接一处就会红**」，否则它和没写一样。
 *
 * 夹具站的做法：
 *   每档都在 os.tmpdir() 下建一个**独立**的夹具站（不是改仓库）：
 *     <tmp>/src/eleventy-draft.cjs            ← 共享模块（真源，DL2 要真正 require 它）
 *     <tmp>/src/content/<section>/<section>.11tydata.cjs  ← 三个内容目录的数据文件
 *   再用 SRC_DIR / CONTENT_DIR 环境变量把门禁指向夹具站。
 *   ⚠️ 全程不动仓库里的任何文件；跑完再自证真目录一个字节都没变。
 *
 * 档位（DL0–DL9）：
 *   DL0  基线：三处都接上了两件套              → 判绿（证明这套判据不是空跑）
 *   DL1  blog 的数据文件漏接**集合侧**         → 判红，点名 DL1
 *   DL2  blog 的数据文件漏接 **permalink 侧**  → 判红，点名 DL1
 *   DL3  papers 的数据文件整体没接             → 判红，点名 DL1
 *   DL4  共享模块的判定口径反了（draft:true 说不算草稿）→ 判红，点名 DL2
 *   DL5  共享模块的 permalink 守卫过宽（非草稿也返回 false）→ 判红，点名 DL2
 *   DL6  共享模块的集合守卫过宽（非草稿也返回 true）→ 判红，点名 DL2
 *   DL7  共享模块整个不在                     → 判红，点名 DL2（读不出真源 ⇒ 判不了 ≠ 没有）
 *   DL8  内容目录只剩两个（少一个）            → 判红，点名 DL3（扫描面被收窄 ⇒ 恒绿）
 *   DL9  **必须判绿**：三处都接上、但文章**不是**草稿（`draft` 缺席 / false）
 *        ⇒ 判绿（证明这套判据不把正常文章误伤）
 *
 * 另有两档**判据级负对照**（不是独立档位，而是对上面某档的重跑）：
 *   卸掉 DL1 ⇒ DL1 那两档必须转绿；
 *   卸掉 DL2 ⇒ DL4–DL7 那几档必须转绿；
 *   卸掉 DL3 ⇒ DL8 必须转绿。
 *
 * 用法：node scripts/test-draft-leak.cjs
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-draft-leak.cjs");
const REAL_SRC = path.join(ROOT, "src");
const REAL_DRAFT_MODULE = path.join(REAL_SRC, "eleventy-draft.cjs");
const SECTIONS = ["blog", "papers", "portfolio"];

if (!fs.existsSync(REAL_DRAFT_MODULE)) {
  console.error(
    `草稿抑制自测失败：找不到 ${REAL_DRAFT_MODULE} —— ` +
      `夹具站的基线要靠它。`
  );
  process.exit(1);
}

/* ---------- 红因归属表：门禁里每条 fail() 调用各登记一条 ----------
 *
 * ⚠️ **一条判据可以有多条红因**（编号粒度：判据 vs 调用点）：
 *   DL1 只有 1 个调用点（在循环里，每个内容目录各报一次）；
 *   DL2 有 5 个调用点（真源读不出 / 判定口径 / 两处守卫接线 / 两个过宽检查）——
 *      ⚠️ 其中「两处守卫接线」共用一段模板串（`草稿抑制的${c.what}接线不对`），
 *         片段不唯一 ⇒ 归属表用它们**共有**的那段（「草稿应当得到」）登记一条。
 *   DL3 有 1 个调用点。
 *   ⇒ `fail()` 调用点数（7）≠ 判据数（3）⇒ 归属表按**调用点**登记，
 *      覆盖度自证要**分别**比这两件事（与 test-deploy-target 的同一处理一致）。
 */

const CAUSES = [
  { id: "DL1", crit: "DL1", frag: "没有接上草稿抑制的" },
  { id: "DL2a", crit: "DL2", frag: "读不出草稿判定的唯一真源" },
  { id: "DL2b", crit: "DL2", frag: "草稿判定口径不对" },
  { id: "DL2c", crit: "DL2", frag: "草稿应当得到" },
  { id: "DL2d", crit: "DL2", frag: "草稿抑制的 permalink 侧过宽" },
  { id: "DL2e", crit: "DL2", frag: "草稿抑制的集合侧过宽" },
  { id: "DL3", crit: "DL3", frag: "本门禁几乎没比过任何东西" },
];

const CRITERIA = ["DL1", "DL2", "DL3"];

/* ---------- 工具 ---------- */

/** 递归算一个目录（或文件）的内容哈希，用来自证「仓库真目录一个字节都没变」。 */
function hashOf(target) {
  const h = crypto.createHash("sha256");
  const walk = (p) => {
    const st = fs.lstatSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p).sort()) {
        if (e === "._" || e.startsWith("._")) continue;
        if (e === ".DS_Store") continue;
        walk(path.join(p, e));
      }
      h.update(`D:${path.basename(p)}\n`);
    } else {
      h.update(`F:${path.basename(p)}:${fs.readFileSync(p).toString("latin1")}\n`);
    }
  };
  walk(target);
  return h.digest("hex");
}

/**
 * 搭一个夹具站：复制共享模块与三个内容目录的数据文件。
 * @param {string} id 夹具标识（进临时目录名）
 * @param {string[]} sections 要放哪几个内容目录
 */
function buildFixture(id, sections = SECTIONS) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-draft-${id}-`));
  const src = path.join(root, "src");
  fs.mkdirSync(src, { recursive: true });
  fs.copyFileSync(REAL_DRAFT_MODULE, path.join(src, "eleventy-draft.cjs"));
  for (const s of sections) {
    const dir = path.join(src, "content", s);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(
      path.join(REAL_SRC, "content", s, `${s}.11tydata.cjs`),
      path.join(dir, `${s}.11tydata.cjs`)
    );
  }
  return { root, src, content: path.join(src, "content") };
}

/** 改夹具站里的某个文件：fn 收到原文，返回新原文。 */
function mutate(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) {
    throw new Error(`没能改动 ${file}（注入锚点没找到）`);
  }
  fs.writeFileSync(file, after);
}

/** 在门禁副本里把某条判据卸掉（`const DLn_ON = true;` → false）。 */
function patchGateCopy(fx, name) {
  const needle = `const ${name}_ON = true;`;
  const before = fs.readFileSync(GATE, "utf8");
  if (!before.includes(needle)) throw new Error(`门禁源码里找不到 ${needle}`);
  const copy = path.join(fx.root, "gate-copy.cjs");
  fs.writeFileSync(copy, before.replace(needle, `const ${name}_ON = false;`));
  return copy;
}

/** 跑门禁（可以跑门禁的副本）。返回 { code, out }。 */
function runGate(fx, gatePath = GATE) {
  const r = spawnSync(
    process.execPath,
    [gatePath],
    {
      env: {
        ...process.env,
        SRC_DIR: fx.src,
        CONTENT_DIR: fx.content,
      },
      encoding: "utf8",
    }
  );
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 从输出里抽出实际出现的**判据**编号集合（DL2 的多个调用点同属 DL2）。 */
function critsIn(out) {
  const set = new Set();
  for (const m of out.matchAll(/\b(DL[0-9]+)\b/g)) set.add(m[1]);
  return set;
}

/* ---------- 注入动作 ---------- */

const INJECT = {
  /** blog 漏接集合侧。 */
  dropCollectionsSide: (fx) => {
    const f = path.join(fx.content, "blog", "blog.11tydata.cjs");
    mutate(f, (t) =>
      t.replace(
        /eleventyExcludeFromCollections:\s*\(data\)\s*=>\s*\n?\s*draftGuards\.excludeFromCollections\(data\),?/,
        "eleventyExcludeFromCollections: () => false,"
      )
    );
  },
  /** blog 漏接 permalink 侧。 */
  dropPermalinkSide: (fx) => {
    const f = path.join(fx.content, "blog", "blog.11tydata.cjs");
    mutate(f, (t) =>
      t.replace(
        /draftGuards\.permalink\((`\/blog\/\$\{getSlugFromData\(data\)\}\/`),\s*data\)/,
        "$1"
      )
    );
  },
  /** papers 整体没接（两个调用点都去掉）。 */
  dropWholeSection: (fx) => {
    const f = path.join(fx.content, "papers", "papers.11tydata.cjs");
    mutate(f, (t) =>
      t
        .replace(
          /draftGuards\.permalink\((`\/papers\/\$\{getSlugFromData\(data\)\}\/`),\s*data\)/,
          "$1"
        )
        .replace(
          /eleventyExcludeFromCollections:\s*\(data\)\s*=>\s*\n?\s*draftGuards\.excludeFromCollections\(data\),?/,
          ""
        )
    );
  },
  /** 共享模块的判定口径反了。 */
  invertDecision: (fx) => {
    const f = path.join(fx.src, "eleventy-draft.cjs");
    mutate(f, (t) => t.replace("if (typeof v === \"boolean\") return v;", "if (typeof v === \"boolean\") return !v;"));
  },
  /** permalink 守卫过宽。 */
  overwidePermalink: (fx) => {
    const f = path.join(fx.src, "eleventy-draft.cjs");
    mutate(f, (t) =>
      t.replace("return isDraft(data) ? false : normalPath;", "return false;")
    );
  },
  /** 集合守卫过宽。 */
  overwideCollections: (fx) => {
    const f = path.join(fx.src, "eleventy-draft.cjs");
    mutate(f, (t) =>
      t.replace("return isDraft(data) ? true : false;", "return true;")
    );
  },
  /** 共享模块整个不在。 */
  dropModule: (fx) => {
    fs.unlinkSync(path.join(fx.src, "eleventy-draft.cjs"));
  },
  /** 内容目录少一个（扫描面被收窄）。 */
  dropSection: (fx) => {
    fs.rmSync(path.join(fx.content, "portfolio"), { recursive: true, force: true });
  },
};

/* ---------- 档位矩阵 ---------- */

const CASES = [
  { id: "DL0", expect: "green", note: "基线：三处都接上了两件套" },
  { id: "DL1", expect: "red", crit: "DL1", inject: "dropCollectionsSide", note: "blog 漏接集合侧" },
  { id: "DL2", expect: "red", crit: "DL1", inject: "dropPermalinkSide", note: "blog 漏接 permalink 侧" },
  { id: "DL3", expect: "red", crit: "DL1", inject: "dropWholeSection", note: "papers 整体没接" },
  { id: "DL4", expect: "red", crit: "DL2", inject: "invertDecision", note: "判定口径反了" },
  { id: "DL5", expect: "red", crit: "DL2", inject: "overwidePermalink", note: "permalink 守卫过宽" },
  { id: "DL6", expect: "red", crit: "DL2", inject: "overwideCollections", note: "集合守卫过宽" },
  { id: "DL7", expect: "red", crit: "DL2", inject: "dropModule", note: "共享模块不在" },
  { id: "DL8", expect: "red", crit: "DL3", inject: "dropSection", note: "内容目录少一个" },
  { id: "DL9", expect: "green", note: "必须判绿：正常文章不受影响" },
];

/* ---------- 跑矩阵 ---------- */

const seenCauses = new Set();
const seenCriteria = new Set();
let failures = 0;

const realHashBefore = hashOf(REAL_SRC);

for (const c of CASES) {
  const fx = buildFixture(c.id.toLowerCase());
  if (c.inject) INJECT[c.inject](fx);
  const r = runGate(fx);
  const out = r.out;
  const got = critsIn(out);

  if (c.expect === "green") {
    if (r.code !== 0) {
      console.error(`✗ ${c.id}（${c.note}）：应当判绿，实测 exit ${r.code}`);
      console.error(out.split("\n").map((l) => `    ${l}`).join("\n"));
      failures++;
    } else {
      console.log(`✓ ${c.id}（${c.note}）：判绿`);
    }
  } else {
    if (r.code === 0) {
      console.error(`✗ ${c.id}（${c.note}）：应当判红，实测 exit 0（**空跑**）`);
      failures++;
      continue;
    }
    if (!got.has(c.crit)) {
      console.error(
        `✗ ${c.id}（${c.note}）：红了，但没有出现判据 ${c.crit} —— ` +
          `红因归属不对（实测出现的判据：${[...got].join(" / ") || "无"}）`
      );
      failures++;
      continue;
    }
    // 红因归属纯净：该档期望的判据必须在场，**其它**判据必须不在场。
    const unexpected = [...got].filter((x) => x !== c.crit);
    if (unexpected.length) {
      console.error(
        `✗ ${c.id}（${c.note}）：红因不纯 —— 期望只有 ${c.crit}，` +
          `实测还有 ${unexpected.join(" / ")}`
      );
      failures++;
      continue;
    }
    seenCauses.add(c.crit);
    seenCriteria.add(c.crit);
    console.log(`✓ ${c.id}（${c.note}）：判红，且只报 ${c.crit}`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 判据级负对照 ---------- */

const NEG_CASES = [
  { crit: "DL1", inject: "dropCollectionsSide" },
  { crit: "DL2", inject: "invertDecision" },
  { crit: "DL3", inject: "dropSection" },
];

for (const n of NEG_CASES) {
  const fx = buildFixture(`neg-${n.crit.toLowerCase()}`);
  INJECT[n.inject](fx);
  const copy = patchGateCopy(fx, n.crit);
  const r = runGate(fx, copy);
  if (r.code !== 0) {
    console.error(
      `✗ 负对照：卸掉 ${n.crit} 后同一注入仍判红（exit ${r.code}）—— ` +
        `证明那一档的红**不是** ${n.crit} 判出来的`
    );
    console.error(r.out.split("\n").map((l) => `    ${l}`).join("\n"));
    failures++;
  } else {
    console.log(`✓ 负对照：卸掉 ${n.crit} 后同一注入转绿`);
  }
  fs.rmSync(fx.root, { recursive: true, force: true });
}

/* ---------- 覆盖度自证 ---------- */

/** 门禁源码里 fail() 的调用点数。 */
function countFailCalls(src) {
  const re = /(?<![.\w$])fail\s*\(/g;
  return [...src.matchAll(re)].length;
}

const gateSrc = fs.readFileSync(GATE, "utf8");

/* (a) 归属表自身的静态自证：片段必须互不包含，且确实存在于门禁源码。
       片段包含关系会让「归属到哪条」变得不确定 ⇒ 红因归属就不可信。 */
for (let a = 0; a < CAUSES.length; a++) {
  for (let b = 0; b < CAUSES.length; b++) {
    if (a !== b && CAUSES[a].frag.includes(CAUSES[b].frag)) {
      console.error(
        `✗ 归属表自证：${CAUSES[a].id} 的片段包含了 ${CAUSES[b].id} 的片段 —— ` +
          `归属会变得不确定`
      );
      failures++;
    }
  }
}
for (const c of CAUSES) {
  if (!gateSrc.includes(c.frag)) {
    console.error(`✗ 归属表自证：门禁源码里找不到 ${c.id} 的文案片段「${c.frag}」`);
    failures++;
  }
}

/* (b) fail() 调用点数 == 归属表条数（能抓住「多了一条没编号的裸红因」）。 */
const failCalls = countFailCalls(gateSrc);
if (failCalls !== CAUSES.length) {
  console.error(
    `✗ 覆盖度自证：门禁 fail() 调用点数 ${failCalls} != 归属表 ${CAUSES.length} 条`
  );
  failures++;
} else {
  console.log(`✓ 覆盖度自证：fail() 调用点数 ${failCalls} == 归属表 ${CAUSES.length} 条`);
}

/* (c) 门禁源码里解析出的判据集合 == 静态判据清单（能抓住「多了一条新判据」）。 */
const parsedCrits = new Set();
for (const m of gateSrc.matchAll(/\bfail\(\s*"([A-Z]{1,4}[0-9]+[a-z]?)"/g)) {
  parsedCrits.add(m[1]);
}
const parsedSorted = [...parsedCrits].sort().join(",");
const staticSorted = [...CRITERIA].sort().join(",");
if (parsedSorted !== staticSorted) {
  console.error(
    `✗ 覆盖度自证：门禁解析出的判据集合 {${parsedSorted}} != 静态清单 {${staticSorted}}`
  );
  failures++;
} else {
  console.log(`✓ 覆盖度自证：门禁解析出的判据集合 == 静态清单 {${staticSorted}}`);
}

/* (d) 每条判据都至少有一档能证明它会变红。 */
const noCase = CRITERIA.filter((c) => !seenCriteria.has(c));
if (noCase.length) {
  console.error(`✗ 覆盖度自证：这些判据没有任何一档证明它们会变红：${noCase.join(" / ")}`);
  failures++;
} else {
  console.log(`✓ 覆盖度自证：${CRITERIA.length} 条判据都至少有一档证明它们会变红`);
}

/* ---------- 自证：仓库真目录一个字节都没变 ---------- */

const realHashAfter = hashOf(REAL_SRC);
if (realHashBefore !== realHashAfter) {
  console.error("✗ 自测改了仓库里的真文件（src/ 的哈希变了）—— 注入必须全部打在副本上");
  failures++;
} else {
  console.log("✓ 自证：仓库里的 src/ 一个字节都没变（全部注入打在临时副本上）");
}

/* ---------- 汇总 ---------- */

if (failures) {
  console.error(`\n草稿抑制门禁自测未通过：${failures} 处问题。`);
  process.exit(1);
}
console.log(
  `\n草稿抑制门禁自测全部通过：${CASES.length} 档（` +
    `${CASES.filter((c) => c.expect === "red").length} 档判红 · ` +
    `${CASES.filter((c) => c.expect === "green").length} 档判绿）＋ ` +
    `${NEG_CASES.length} 档判据级负对照；` +
    `${CAUSES.length} 条红因归属登记（${CAUSES.map((c) => c.id).join(" / ")}）。`
);
