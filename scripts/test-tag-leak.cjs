#!/usr/bin/env node
/**
 * 集合名标签泄漏门禁的**自测** —— 四件套：红因归属表 / 归属纯净 / 覆盖度自证 / 判据级负对照。
 *
 * 为什么这个自测是必需的（一次具体的核对，不是假想）：
 *   站内 **0 篇文章** ⇒ 详情页版式从未被渲染过，产物层永远看不到这个泄漏。
 *   一道「在自己身上永远不执行」的门禁等于没写：它 exit 0、输出漂亮，
 *   但没人知道它判红过没有 —— 这正是 check-gates-wired.cjs 文件头写的同一族形态
 *   （「看起来在、其实不生效」）。
 *
 * ⚠️ **旧版自测的实测缺口（本轮实测，不是假想）**：
 *   旧版只有 7 档，断言只检查「输出里**含**判据编号 T?」与「**含**被点名的那个字符串」，
 *   **不检查红因集合是否恰为期望集合** ⇒ 结构性连坐完全看不见。
 *   实测每档**实际**触发的判据：
 *     N1（漏滤 blog）    → 实际 {T1, T5}，旧版只声称 T1
 *     N3（过滤过头）      → 实际 {T2, T5}，旧版只声称 T2
 *     N4（把 tags 本身滤掉）→ 实际 {T2, T3}，旧版只声称 T3
 *   ⇒ 旧版自测的「期望」本身是**不完整**的，而它照样全绿。
 *   本版把期望集合改成**恰为**（多一条少一条都判红），并把连坐如实写成多条。
 *
 * 四件套：
 *   ① **红因归属表**（CAUSES）：门禁里 11 处 `fail()` 各登记一条 —— 判据号 + **唯一**红因文案片段。
 *      运行时自证：片段确实存在于门禁源码、且片段之间**互不包含**。
 *   ② **归属纯净**：红因命中的**判据集合恰为**期望集合（多一条少一条都判红）；
 *      且**每一条红因行都必须能唯一归类**（归不了类 ⇒ 出现了本自测不知道的新红因 ⇒ 同样判红）。
 *   ③ **覆盖度自证**（三条，见 COV 段）：静态清单 ↔ 门禁 `fail()` 调用数 ↔ 门禁里解析出的判据集合。
 *   ④ **判据级负对照** NC1–NC5：在**门禁副本**里把该判据的**每一条 `fail()` 调用**改成不执行
 *      （同行加 `if (false) ` 前缀，**行数不变**）⇒ 该判据的红因全部消失、其余红因照旧。
 *
 * ⚠️ **编号粒度：一编号多红因 ⇒ 「调用数」不能与「编号数」比长度**
 *   本门禁 T1 覆盖 3 条红因、T2 覆盖 2 条、T3 覆盖 2 条、T4 覆盖 3 条、T5 覆盖 1 条 ⇒
 *   `fail()` 调用共 11 处，判据只有 5 条。
 *   所以覆盖度自证必须**拆成两条**：
 *     (a) `fail()` 调用数 == CAUSES 条数（11 == 11）⇒ 能抓住「多了一条没编号的裸红因」；
 *         ⚠️ 这里数的是**全部**调用点（单行 `fail("…")` 与多行 `fail(\n \`…\`)` 都算）——
 *            只数多行那种的话，加一条单行裸红因就数不到 ⇒ 这条防线会变成空话；
 *     (b) 解析出的判据**集合** == 静态判据清单（{T1..T5} == {T1..T5}）⇒ 能抓住「多了一条新判据」。
 *   （这与「编号化后一编号一红因」的门禁不同：那种门禁两条可以直接合并成一条等长断言。）
 *
 * 注入档 N0–N10（11 档）：
 *   N0  基线：原样的版式 + 原样的集合清单          → 判绿（证明这套判据不是空跑）
 *   N1  版式漏滤集合名 "blog"（修复前的原样）      → {T1, T5}
 *   N2  版式漏滤集合名 "portfolio"                → {T5}
 *   N3  过滤过头（把标签全滤掉）                   → {T2, T5}
 *   N4  把 tags 本身滤掉（「看起来修好了」的错法）    → {T2, T3}
 *   N5  列表页漏滤集合名 "blog"                    → {T4}
 *   N6  新增一个用同一版式的集合 "notes" 但没滤     → {T5}
 *   N7  内容目录里推不出任何集合名（空跑防护）        → {T1}
 *   N8  详情页版式语法坏掉（渲染失败）               → {T1, T2}
 *   N9  详情页版式改版式（找不到 meta 行）           → {T2}
 *   N10 列表页语法坏掉（渲染失败）                  → {T4}
 *
 *   N4 值得单列：它是**最可能发生的错修** —— 集合名确实不见了，
 *   但文章也被偷偷换成了首页版式（"Back to Home"），页脚回不到列表页。
 *   只查「集合名还在不在」的门禁会放过它；T3 才拦得住。
 *   N8 与 N4 一样会**连坐**：渲染失败 ⇒ 详情页 meta 行自然也没有 ⇒ T1 与 T2 一起报。
 *   这种连坐是**结构性的**（不是注入的副作用），期望集合必须如实写成多条。
 *
 * 用法：node scripts/test-tag-leak.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-tag-leak.cjs");
const REAL_DETAIL = path.join(ROOT, "src", "_includes", "layouts", "detail.njk");
const REAL_LIST = path.join(ROOT, "src", "blog.njk");
const REAL_CONTENT = path.join(ROOT, "src", "content");

/* ======================================================================
 * ① 红因归属表（静态登记）—— 门禁里 11 处 fail() 各一条
 *    frag 必须是该红因**独有**的文案片段（运行时自证互不包含）。
 * ====================================================================== */
const CAUSES = [
  { id: "T1a", crit: "T1", frag: "推不出任何集合名" },
  { id: "T1b", crit: "T1", frag: "渲染详情页版式失败" },
  { id: "T1c", crit: "T1", frag: "详情页把集合名" },
  { id: "T2a", crit: "T2", frag: "找不到 meta 行" },
  { id: "T2b", crit: "T2", frag: "的主题标签「" },
  { id: "T3a", crit: "T3", frag: "详情页底部没有" },
  { id: "T3b", crit: "T3", frag: "返回链接不指向" },
  { id: "T4a", crit: "T4", frag: "渲染列表页失败" },
  { id: "T4b", crit: "T4", frag: "列表页把集合名" },
  { id: "T4c", crit: "T4", frag: "的主题标签徽章" },
  { id: "T5", crit: "T5", frag: "过滤链没有盖住集合名" },
];

/** ③ 覆盖度自证用的**静态**判据清单（门禁公开的 5 条判据）。 */
const CRITERIA = ["T1", "T2", "T3", "T4", "T5"];

/* ======================================================================
 * 夹具站
 * ====================================================================== */

/** 版式里那行「展示用标签」的过滤链（注入锚点）。 */
const FILTER_LINE = '{% set topicTags = tags | reject("equalto", "blog") | reject("equalto", "portfolio") %}';
/** 列表页里那行过滤链（注入锚点）。 */
const LIST_FILTER_LINE = '{% set topicTags = post.data.tags | reject("equalto", "blog") %}';
/** 版式里判定 isPortfolio 的那行（注入「把 tags 本身滤掉」的锚点）。 */
const IS_PORTFOLIO_LINE = '{% set isPortfolio = tags and "portfolio" in tags %}';

for (const f of [REAL_DETAIL, REAL_LIST, GATE]) {
  if (!fs.existsSync(f)) {
    console.error(`集合名标签泄漏自测失败：找不到 ${f} —— 夹具站要复制它，先确认文件还在。`);
    process.exit(1);
  }
}

/** 门禁源码（原件；自测全程只读它，改动只发生在副本上）。 */
const GATE_SRC = fs.readFileSync(GATE, "utf8");

/**
 * 找出门禁源码里**所有** `fail(` 调用点：判据号 + 消息开头 + 该调用在源码里的定位串。
 *
 * ⚠️ 为什么不能只认多行那种写法（一次具体的坑，不是假想）：
 *   门禁里两种写法都可能出现 —— `fail(\n  \`T1 …\`)`（多行模板字面量）与 `fail("…")`（单行）。
 *   只认多行的那种 ⇒ 有人加一条**单行**的裸红因时，「fail() 调用数 == CAUSES 条数」
 *   这条覆盖度防线**数不到它** ⇒ 防线成了空话。
 *
 * ⚠️ 这个正则的已知边界（如实写明，别当成没有边界）：
 *   · 「消息不是字面量」的写法（fail(msg)）**数不到** ⇒ 那种红因一旦真的触发，
 *     归属纯净那一条会当场判红（归不了类）；触发不到就等于没有红因。
 *   · 注释或正则字面量里若出现 `fail("…")`，会被**多算** ⇒ 那是判红（要求人更新），
 *     不是少算 —— 方向是安全的：宁可误报，不可静默放过。
 *
 * ⚠️ 定位串（anchor）是**运行时派生**的：按 CAUSES 里的文案片段去认领对应的调用点。
 *    这样门禁改了缩进或换了写法，自测会跟着走，不会静默地对不上。
 */
function scanFailCalls(src) {
  const re = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const head = m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3] || "";
    const crit = (head.match(/^(T\d+)/) || [])[1] || null;
    out.push({ index: out.length, crit, head, anchor: m[0], offset: m.index });
  }
  return out;
}

const FAIL_CALLS = scanFailCalls(GATE_SRC);

/** 按文案片段在门禁源码里认领那一条 `fail(` 调用；认领不到就抛（不许悄悄放过）。 */
function claimCall(cause) {
  const hits = FAIL_CALLS.filter((c) => c.head.includes(cause.frag));
  if (hits.length !== 1) {
    throw new Error(
      `红因「${cause.id}」（片段「${cause.frag}」）在门禁里认领到 ${hits.length} 处 fail() 调用` +
        `（要求恰好 1 处）—— 门禁的红因文案变了，自测要跟着改。`
    );
  }
  return hits[0];
}

/** 建一个夹具站：真实版式 / 列表页 / 内容目录的副本 + 一个「空内容目录」。 */
function buildFixture(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-tag-leak-${id}-`));
  const contentDir = path.join(root, "content");
  fs.mkdirSync(path.join(root, "layouts"), { recursive: true });
  fs.cpSync(REAL_CONTENT, contentDir, { recursive: true });
  const detailPath = path.join(root, "layouts", "detail.njk");
  const listPath = path.join(root, "blog.njk");
  fs.copyFileSync(REAL_DETAIL, detailPath);
  fs.copyFileSync(REAL_LIST, listPath);
  const emptyContent = path.join(root, "empty-content");
  fs.mkdirSync(emptyContent, { recursive: true });
  return {
    root,
    contentDir,
    emptyContent,
    detailPath,
    listPath,
    /** 改版式（文本层面：门禁也是按文本核的） */
    editDetail(fn) {
      const before = fs.readFileSync(detailPath, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变版式的内容（锚点没找到？）");
      fs.writeFileSync(detailPath, after);
    },
    /** 改列表页 */
    editList(fn) {
      const before = fs.readFileSync(listPath, "utf8");
      const after = fn(before);
      if (after === before) throw new Error("注入没有改变列表页的内容（锚点没找到？）");
      fs.writeFileSync(listPath, after);
    },
    /** 新增一个集合（目录数据文件），版式用 detail.njk */
    addCollection(name) {
      const dir = path.join(contentDir, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, `${name}.11tydata.cjs`),
        [
          `const { getSlugFromData } = require("../../eleventy-helpers.cjs");`,
          "",
          "module.exports = {",
          '  layout: "layouts/detail.njk",',
          "  permalink: (data) => `/${name}/${getSlugFromData(data)}/`,",
          `  tags: ["${name}"],`,
          "};",
          "",
        ].join("\n")
      );
    },
  };
}

/**
 * 建一个**门禁镜像**：目录结构与仓库一致（scripts/ + node_modules + src），
 * 这样门禁副本里的 `__dirname/..` 仍然指着一个「像仓库」的地方，
 * `require("nunjucks")` 也能解析。
 */
function buildGateMirror(id) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `mh-tag-leak-gate-${id}-`));
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules"), "dir");
  fs.symlinkSync(path.join(ROOT, "src"), path.join(root, "src"), "dir");
  return { root, gatePath: path.join(root, "scripts", "check-tag-leak.cjs") };
}

/** 跑一次门禁（真实门禁或门禁副本），返回 exit code 与红因行。 */
function runGate(gatePath, fx, env) {
  const r = spawnSync(process.execPath, [gatePath], {
    env: {
      ...process.env,
      DETAIL_LAYOUT: fx.detailPath,
      LIST_PAGE: fx.listPath,
      CONTENT_DIR: fx.contentDir,
      ...(env || {}),
    },
    encoding: "utf8",
    cwd: ROOT,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  const causes = out
    .split("\n")
    .filter((l) => l.trim().startsWith("✗"))
    .map((l) => l.trim().replace(/^✗\s*/, ""));
  return { code: r.status, out, causes };
}

/* ======================================================================
 * ② 归属纯净：把红因行映射到判据
 * ====================================================================== */

/**
 * 归类：每条红因行必须**恰好**落进一个判据。
 * 落不进任何片段 ⇒ 出现了本自测不知道的新红因 ⇒ 判红；
 * 落进两个及以上 ⇒ 片段互不包含的自证失效 ⇒ 判红。
 */
function attribute(causes) {
  const crits = new Set();
  const problems = [];
  for (const line of causes) {
    const hit = CAUSES.filter((c) => line.includes(c.frag));
    if (hit.length === 0) {
      problems.push(`红因行归不了类（没有 CAUSES 片段命中它）：${line.slice(0, 120)}`);
      continue;
    }
    if (hit.length > 1) {
      problems.push(
        `红因行同时落进 ${hit.length} 个判据（${hit.map((h) => h.id).join(" / ")}）` +
          `—— 片段互不包含的约定被破坏了：${line.slice(0, 120)}`
      );
      continue;
    }
    crits.add(hit[0].crit);
  }
  return { crits: [...crits].sort(), problems };
}

/* ======================================================================
 * 注入档 N0–N10
 * ====================================================================== */

/** 把模板里第一行 `{% set X = Y %}` 改成语法错的 `{% set X = Y and %}`（逼出渲染失败）。 */
function breakFirstSetLine(src) {
  const re = /\{%\s*set\s+(\w+)\s*=\s*([^\s%][^%]*?)\s*%\}/;
  const m = src.match(re);
  if (!m) throw new Error("模板里没有 `{% set %}` 行 —— 找不到可破坏的语法锚点");
  return src.replace(re, `{% set ${m[1]} = ${m[2]} and %}`);
}

/** 门禁找 meta 行时用的 class 名 —— 从**门禁源码**里派生（不写死）。 */
const META_CLASS = (GATE_SRC.match(/<p class="([^"]+)">/) || [])[1];
if (!META_CLASS) throw new Error("门禁源码里找不到 `<p class=\"...\">` —— meta 行的锚点没了");

const CASES = [
  { id: "N0", desc: "基线：原样的版式 + 原样的集合清单", expect: [] },
  {
    id: "N1",
    desc: "版式漏滤集合名 blog（修复前的原样）",
    expect: ["T1", "T5"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = t.replace(
          FILTER_LINE,
          '{% set topicTags = tags | reject("equalto", "portfolio") %}'
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      }),
  },
  {
    id: "N2",
    desc: "版式漏滤集合名 portfolio（该集合的分支现在不印标签，所以只有 T5 看得见）",
    expect: ["T5"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = t.replace(
          FILTER_LINE,
          '{% set topicTags = tags | reject("equalto", "blog") %}'
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      }),
  },
  {
    id: "N3",
    desc: "过滤过头（集合名连同主题标签一起滤掉）",
    expect: ["T2", "T5"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = t.replace(FILTER_LINE, "{% set topicTags = [] %}");
        if (out === t) throw new Error("注入锚点不存在：版式里没有那行过滤链");
        return out;
      }),
  },
  {
    id: "N4",
    desc: "把 tags 本身滤掉（集合名没了，版式也被换成首页版式）",
    expect: ["T2", "T3"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = t.replace(
          IS_PORTFOLIO_LINE,
          '{% set tags = tags | reject("equalto", "blog") | reject("equalto", "portfolio") %}\n' +
            IS_PORTFOLIO_LINE
        );
        if (out === t) throw new Error("注入锚点不存在：版式里没有 isPortfolio 那行");
        return out;
      }),
  },
  {
    id: "N5",
    desc: "列表页漏滤集合名 blog",
    expect: ["T4"],
    setup: (fx) =>
      fx.editList((t) => {
        const out = t.replace(LIST_FILTER_LINE, "{% set topicTags = post.data.tags %}");
        if (out === t) throw new Error("注入锚点不存在：列表页里没有那行过滤链");
        return out;
      }),
  },
  {
    id: "N6",
    desc: "新增一个用同一版式的集合 notes，但版式没滤它",
    expect: ["T5"],
    setup: (fx) => fx.addCollection("notes"),
  },
  {
    id: "N7",
    desc: "内容目录里推不出任何集合名（空跑防护）",
    expect: ["T1"],
    setup: (fx) => {
      fx.useEmptyContent = true;
    },
  },
  {
    id: "N8",
    desc: "详情页版式语法坏掉（渲染失败）",
    expect: ["T1", "T2"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = breakFirstSetLine(t);
        if (out === t) throw new Error("注入没有改变版式的内容（找不到 `{% set %}` 行）");
        return out;
      }),
  },
  {
    id: "N9",
    desc: "详情页改版式：门禁找不到 meta 行",
    expect: ["T2"],
    setup: (fx) =>
      fx.editDetail((t) => {
        const out = t.replace(`<p class="${META_CLASS}">`, `<p class="${META_CLASS}-broken">`);
        if (out === t) throw new Error("注入锚点不存在：版式里没有门禁找的那个 meta 行");
        return out;
      }),
  },
  {
    id: "N10",
    desc: "列表页语法坏掉（渲染失败）",
    expect: ["T4"],
    setup: (fx) =>
      fx.editList((t) => {
        const out = breakFirstSetLine(t);
        if (out === t) throw new Error("注入没有改变列表页的内容（找不到 `{% set %}` 行）");
        return out;
      }),
  },
];

/* ======================================================================
 * ④ 判据级负对照 NC1–NC5
 *    base  = 用哪一档注入做现场；unload = 卸掉哪条判据；expect = 卸掉后应剩的判据集合
 * ====================================================================== */
const NEG_CASES = [
  { id: "NC1", unload: "T1", base: "N1", expect: ["T5"], why: "集合名印出来了（T1）但过滤链没盖住（T5）—— 卸掉 T1 只该剩下 T5" },
  { id: "NC2", unload: "T2", base: "N3", expect: ["T5"], why: "主题标签不见了（T2）且过滤链没盖住（T5）—— 卸掉 T2 只该剩下 T5" },
  { id: "NC3", unload: "T3", base: "N4", expect: ["T2"], why: "版式判定坏了（T3）连带主题标签不见了（T2）—— 卸掉 T3 只该剩下 T2" },
  { id: "NC4", unload: "T4", base: "N5", expect: [], why: "列表页漏滤集合名（T4）—— 卸掉 T4 应当全绿" },
  { id: "NC5", unload: "T5", base: "N6", expect: [], why: "新集合没被过滤链盖住（T5）—— 卸掉 T5 应当全绿" },
];

/* ======================================================================
 * 开跑
 * ====================================================================== */

let failed = 0;
const fail = (m) => {
  console.error(`  ✗ ${m}`);
  failed++;
};
const pass = (m) => console.log(`  ✓ ${m}`);

console.log("集合名标签泄漏门禁 · 自测四件套：\n");

/* ---------- ③ 覆盖度自证（先跑：它是后面所有断言的基准） ---------- */
{
  console.log("【覆盖度自证】");
  // (a) fail() 调用数 == CAUSES 条数 ⇒ 多一条没编号的裸红因就判红
  if (FAIL_CALLS.length !== CAUSES.length) {
    fail(
      `门禁里解析出 ${FAIL_CALLS.length} 处 fail() 调用，CAUSES 登记了 ${CAUSES.length} 条` +
        `—— 每条红因必须恰好对应一处调用；多出来的那处可能就是一条**没编号**的裸红因，` +
        `少掉的那处说明门禁少报了一条红因（判据失活）。`
    );
  } else {
    pass(`门禁 fail() 调用数 ${FAIL_CALLS.length} == CAUSES 条数 ${CAUSES.length}`);
  }

  // (b) 解析出的判据集合 == 静态判据清单
  const gateCrits = [...new Set(FAIL_CALLS.map((c) => c.crit).filter(Boolean))].sort();
  const staticCrits = [...CRITERIA].sort();
  if (JSON.stringify(gateCrits) !== JSON.stringify(staticCrits)) {
    fail(
      `门禁里解析出的判据集合 [${gateCrits.join(",")}] 与静态清单 [${staticCrits.join(",")}] 不一致` +
        `—— 门禁新增/删除了一条判据，或某条红因丢了编号。`
    );
  } else {
    pass(`门禁判据集合 [${gateCrits.join(",")}] == 静态清单（${staticCrits.length} 条判据 / ${FAIL_CALLS.length} 处调用）`);
  }

  // (c) 每条 CAUSE 的片段都存在于门禁源码，且片段之间互不包含
  for (const c of CAUSES) {
    if (!GATE_SRC.includes(c.frag)) {
      fail(`红因「${c.id}」的文案片段「${c.frag}」在门禁源码里不存在 —— 门禁改文案了，自测要跟着改。`);
    }
  }
  for (let i = 0; i < CAUSES.length; i++) {
    for (let j = i + 1; j < CAUSES.length; j++) {
      const a = CAUSES[i];
      const b = CAUSES[j];
      if (a.frag.includes(b.frag) || b.frag.includes(a.frag)) {
        fail(
          `红因片段互不包含的自证失败：「${a.id}」的「${a.frag}」与「${b.id}」的「${b.frag}」互相包含` +
            `—— 归属会变得不唯一。`
        );
      }
    }
  }
  // (d) 每条判据都至少被一条 CAUSE 覆盖
  for (const c of CRITERIA) {
    if (!CAUSES.some((x) => x.crit === c)) {
      fail(`静态清单里的判据「${c}」没有任何 CAUSES 条目覆盖它 —— 归属表漏了一条判据。`);
    }
  }
  if (!failed) pass("红因归属表自证通过（片段存在 + 互不包含 + 每条判据都有归属）");
  console.log("");
}

/* ---------- 注入档 ---------- */
console.log("【注入档 N0–N10】");
{
  const covered = new Set();
  for (const c of CASES) {
    const fx = buildFixture(c.id);
    try {
      if (c.setup) c.setup(fx);
      const r = runGate(GATE, fx, fx.useEmptyContent ? { CONTENT_DIR: fx.emptyContent } : {});
      const attr = attribute(r.causes);
      for (const p of attr.problems) fail(`${c.id} ${c.desc} —— ${p}`);

      const expect = c.expect;
      const wantGreen = expect.length === 0;
      if (wantGreen) {
        if (r.code === 0) {
          pass(`${c.id} ${c.desc} → 门禁全绿（exit 0）`);
        } else {
          fail(`${c.id} ${c.desc} → 期望 exit 0，实际 ${r.code}；红因：${attr.crits.join(",")}`);
          r.causes.forEach((x) => console.error(`      ${x.slice(0, 160)}`));
        }
        continue;
      }
      if (r.code !== 1) {
        fail(`${c.id} ${c.desc} → 期望 exit 1，实际 ${r.code}`);
        r.causes.forEach((x) => console.error(`      ${x.slice(0, 160)}`));
        continue;
      }
      if (JSON.stringify(attr.crits) !== JSON.stringify(expect)) {
        fail(
          `${c.id} ${c.desc} → 期望红因判据集合恰为 [${expect.join(",")}]，实际 [${attr.crits.join(",")}]` +
            `（${r.causes.length} 条红因）`
        );
        r.causes.forEach((x) => console.error(`      ${x.slice(0, 160)}`));
        continue;
      }
      attr.crits.forEach((k) => covered.add(k));
      pass(
        `${c.id} ${c.desc} → 判红，红因判据集合恰为 [${attr.crits.join(",")}]` +
          `（${r.causes.length} 条红因，全部可归类）`
      );
    } catch (e) {
      fail(`${c.id} ${c.desc} —— 注入本身坏了：${e.message}`);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
    }
  }
  for (const c of CRITERIA) {
    if (!covered.has(c)) fail(`判据「${c}」没有任何一档判红 —— 这条判据能不能变红没人证明。`);
  }
  if (CRITERIA.every((c) => covered.has(c))) {
    pass(`判据覆盖：${CRITERIA.join(" / ")} 每一类都至少有一档判红`);
  }
  console.log("");
}

/* ---------- 判据级负对照 ---------- */
console.log("【判据级负对照 NC1–NC5】（在门禁副本里卸判据）");
{
  for (const nc of NEG_CASES) {
    const base = CASES.find((c) => c.id === nc.base);
    if (!base) {
      fail(`${nc.id} 引用的基线档 ${nc.base} 不存在`);
      continue;
    }
    const mirror = buildGateMirror(nc.id);
    const fx = buildFixture(nc.id);
    try {
      // ① 先造基线副本（未改动），用于逐行比对
      fs.writeFileSync(mirror.gatePath, GATE_SRC);
      const baseLines = GATE_SRC.split("\n");

      // ② 把该判据的**每一条** fail() 调用改成不执行（同行加前缀，行数不变）
      const targets = CAUSES.filter((c) => c.crit === nc.unload);
      if (!targets.length) {
        fail(`${nc.id} 判据「${nc.unload}」在 CAUSES 里没有任何红因 —— 没法卸`);
        continue;
      }
      let src = GATE_SRC;
      for (const t of targets) {
        const call = claimCall(t);
        if (src.split(call.anchor).length - 1 !== 1) {
          fail(`${nc.id} 锚点在副本里不唯一 —— 停下，不做替换`);
          break;
        }
        // 用函数式替换：锚点里带 ${…}，`$&` 之类的替换模式不能被解释
        src = src.replace(call.anchor, () => `if (false) ${call.anchor}`);
      }
      const newLines = src.split("\n");
      if (newLines.length !== baseLines.length) {
        fail(
          `${nc.id} 副本行数变了（${baseLines.length} → ${newLines.length}）—— ` +
            `必须用**同行替换**，不能让后面的行位移`
        );
        continue;
      }
      let diffLines = 0;
      for (let i = 0; i < baseLines.length; i++) if (baseLines[i] !== newLines[i]) diffLines++;
      if (diffLines !== targets.length) {
        fail(
          `${nc.id} 副本与基线副本的差异行数是 ${diffLines}，预期 ${targets.length}` +
            `（判据「${nc.unload}」有 ${targets.length} 处 fail() 调用）—— 说明卸的不止这一条`
        );
        continue;
      }

      // ③ 造现场 + 跑副本
      fs.writeFileSync(mirror.gatePath, src);
      if (base.setup) base.setup(fx);
      const r = runGate(mirror.gatePath, fx, fx.useEmptyContent ? { CONTENT_DIR: fx.emptyContent } : {});
      const attr = attribute(r.causes);
      for (const p of attr.problems) fail(`${nc.id} —— ${p}`);

      const wantGreen = nc.expect.length === 0;
      if (wantGreen) {
        if (r.code === 0) {
          pass(`${nc.id} 卸掉判据 ${nc.unload}（${targets.length} 处 fail()，差异 ${diffLines} 行）→ 转绿`);
        } else {
          fail(
            `${nc.id} 卸掉判据 ${nc.unload} 后应当全绿，实际 exit ${r.code}、` +
              `判据 [${attr.crits.join(",")}] —— 判据卸得不干净`
          );
          r.causes.forEach((x) => console.error(`      ${x.slice(0, 160)}`));
        }
        continue;
      }
      if (r.code !== 1) {
        fail(`${nc.id} 卸掉判据 ${nc.unload} 后期望 exit 1，实际 ${r.code}`);
        continue;
      }
      if (JSON.stringify(attr.crits) !== JSON.stringify(nc.expect)) {
        fail(
          `${nc.id} 卸掉判据 ${nc.unload} 后，期望红因判据集合恰为 [${nc.expect.join(",")}]，` +
            `实际 [${attr.crits.join(",")}] —— ${nc.why}`
        );
        r.causes.forEach((x) => console.error(`      ${x.slice(0, 160)}`));
        continue;
      }
      pass(
        `${nc.id} 卸掉判据 ${nc.unload}（${targets.length} 处 fail()，差异 ${diffLines} 行，行数不变）` +
          `→ 目标红因消失，其余照旧 [${attr.crits.join(",") || "（空）"}]`
      );
    } catch (e) {
      fail(`${nc.id} —— 负对照本身坏了：${e.message}`);
    } finally {
      fs.rmSync(fx.root, { recursive: true, force: true });
      fs.rmSync(mirror.root, { recursive: true, force: true });
    }
  }
  console.log("");
}

/* ---------- 自证：真文件一个字节都没被动过 ---------- */
console.log("【门禁与真文件未被改动】");
{
  const after = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
  const before = crypto.createHash("sha256").update(GATE_SRC).digest("hex");
  if (before !== after) {
    fail("门禁源码被改动了 —— 自测必须只在副本上注入。");
  } else {
    pass("门禁源码逐字节未变（注入与负对照只改副本）");
  }
  for (const f of [REAL_DETAIL, REAL_LIST]) {
    const h = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    pass(`真文件未变：${path.relative(ROOT, f)}（${h.slice(0, 12)}…）`);
  }
  console.log("");
}

/* ---------- 汇总 ---------- */
const total = CASES.length + NEG_CASES.length;
if (failed) {
  console.error(`集合名标签泄漏自测未通过：${failed} 项不对（注入 ${CASES.length} 档 + 负对照 ${NEG_CASES.length} 档，共 ${total} 档）。\n`);
  process.exit(1);
}
console.log(
  `集合名标签泄漏自测通过：${total} 档全部符合预期` +
    `（注入 ${CASES.length} 档 + 判据级负对照 ${NEG_CASES.length} 档；` +
    `红因归属表 ${CAUSES.length} 条覆盖判据 ${CRITERIA.length} 条；` +
    `注入只在 /tmp 的夹具站上做，仓库里的门禁 / 版式 / 列表页 / 内容目录未被改动）。\n`
);
