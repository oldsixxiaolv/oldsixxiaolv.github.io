#!/usr/bin/env node
/**
 * 文档现状/接入流程门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「文档里声明的现状与接入流程 ↔ 仓库里的真实论文与数据层」的一致性，
 * 而「注入没生效」「改的是副本还是原件」「门禁自己被卸掉了」恰恰是最容易发生、
 * 也最不容易看出来的失败模式。所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 9 处 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、覆盖度自证 —— 门禁的 fail() 调用点与归属表**双向**对齐；
 *      门禁解析出的判据集合与静态清单一致；每条红因、每条判据都至少一档判红。
 *   三、注入档 —— 每一档都断言**判红且判据集合恰为预期**（多一条少一条都算失败）。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉
 *      （给它那一条 fail() 调用同行加 `if (false) ` 前缀，**行数不变**），
 *      对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，而不是别的判据顺带报出来的。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-doc-reality.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-doc-reality.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "DR1", crit: "DR1", frag: "没有对应的论文目录" },
  { id: "DR2", crit: "DR2", frag: "写死了会变的论文篇数" },
  { id: "DR3", crit: "DR3", frag: "不在真实论文的 front matter 里" },
  { id: "DR4", crit: "DR4", frag: "由目录数据文件自动注入" },
  { id: "DR5a", crit: "DR5", frag: "要扫的活文档不在" },
  { id: "DR5b", crit: "DR5", frag: "一篇真实论文都没检出" },
  { id: "DR5c", crit: "DR5", frag: "读不到论文目录数据文件" },
  { id: "DR5d", crit: "DR5", frag: "一处「必填字段清单」都没检出" },
  { id: "DR5e", crit: "DR5", frag: "一个论文语境段落都没检出" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["DR1", "DR2", "DR3", "DR4", "DR5"];

/* ========== 工具 ========== */

/** 扫出源码里所有 fail() 调用点（单行/多行、模板字面量/引号都吃）。 */
const FAIL_RE = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanFailCalls(src) {
  const out = [];
  for (const m of src.matchAll(FAIL_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({
      index: m.index,
      literal,
      crit: (literal.match(/^\s*(DR\d+)\b/) || [])[1] || "",
    });
  }
  return out;
}

/** 门禁输出里每条红因起头都是 "  ✗ "。 */
function causeHeads(out) {
  return out.split("\n").filter((l) => /^\s*✗\s/.test(l));
}

/** 归属：每条红因必须**恰好**被一条归属认领；返回判据集合。 */
function attribute(out) {
  const rows = causeHeads(out).map((line) => ({
    line,
    owners: CAUSES.filter((c) => line.includes(c.frag)),
  }));
  const impure = rows.find((r) => r.owners.length !== 1) || null;
  const crits = [
    ...new Set(rows.filter((r) => r.owners.length === 1).map((r) => r.owners[0].crit)),
  ].sort();
  return { rows, crits, impure };
}

function replaceOnce(text, from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`注入锚点出现 ${n} 次（应恰好 1 次）：「${from.slice(0, 36)}…」`);
  return text.replace(from, to);
}

/* ========== 夹具 ========== */

/** 夹具里的「必填字段清单」那一行（改它就能换一条判据）。 */
const REQUIRED_LINE = "1. 在 `src/content/papers/<slug>/paper.md` 写好 frontmatter + 正文（必填 `pubKey`，其余按需）";
/** 夹具里的论文语境段落（点名一个不存在的论文标识就能触发 DR1）。 */
const CONTEXT_LINE =
  "> 原文标题为「Stage 3 接入 checklist」，写于只有一篇 paper 的时候。**现在仓库里的论文以 `src/content/papers/` 下的实际目录为准。**";

const DOC_BASE = [
  "# 夹具 · implementation notes",
  "",
  CONTEXT_LINE,
  "",
  REQUIRED_LINE,
  "",
].join("\n");

/** 一篇真实论文（front matter 的键与真站一致：pubKey / date / description / summary）。 */
const PAPER_MD = [
  "---",
  "pubKey: fixture-stages",
  "date: 2026-06-01",
  'description: "fixture description."',
  'summary: "fixture summary."',
  "---",
  "",
  "正文。",
  "",
].join("\n");

/** 论文目录数据文件（自动注入 layout / permalink / eleventyComputed.slug / tags）。 */
const PAPERS_DATA = [
  "module.exports = {",
  '  layout: "layouts/paper.njk",',
  "  permalink: (data) => `/papers/${data.page.fileSlugStem}/`,",
  "  eleventyComputed: {",
  "    slug: (data) => data.page.fileSlugStem,",
  "  },",
  '  tags: ["papers"],',
  "};",
  "",
].join("\n");

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-docreality-selftest-"));

/** 建一个独立夹具（临时目录 + 合成文档 / 论文 / 数据文件），在副本上注入。 */
function buildFixture(mutate) {
  const state = {
    doc: DOC_BASE,
    paper: PAPER_MD,
    data: PAPERS_DATA,
    /** 论文目录在、但里面没有论文文件（空目录）。 */
    emptyPaperDir: false,
  };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  const papersRoot = path.join(dir, "src", "content", "papers");
  const paperDir = path.join(papersRoot, "fixture-stages");
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.mkdirSync(papersRoot, { recursive: true });
  if (state.paper !== null || state.emptyPaperDir) fs.mkdirSync(paperDir, { recursive: true });
  if (state.doc !== null) fs.writeFileSync(path.join(dir, "docs", "implementation-notes.md"), state.doc);
  if (state.paper !== null) fs.writeFileSync(path.join(paperDir, "paper.md"), state.paper);
  if (state.data !== null) {
    fs.writeFileSync(path.join(papersRoot, "papers.11tydata.cjs"), state.data);
  }
  return dir;
}

/** 跑一次门禁（夹具通过 DR_ROOT 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = { ...process.env, DR_ROOT: fixtureDir };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** 论文语境段落里点名两个不存在的论文目录 ⇒ DR1。 */
  stalePaperList: (s) => {
    s.doc = replaceOnce(
      s.doc,
      CONTEXT_LINE,
      "> 原文标题为「Stage 3 接入 checklist」，写于只有一篇 paper 的时候。" +
        "**现在收录的论文（gone-slug-a / gone-slug-b）以实际目录为准。**"
    );
  },
  /** 现状陈述里写死了论文篇数 ⇒ DR2。 */
  hardcodedCount: (s) => {
    s.doc =
      s.doc +
      "\n- **pagination**：当前列表一次性渲染所有项。**（现状：已有 3 篇 paper）**\n";
  },
  /** 必填清单里列了一个根本不是 front matter 字段的东西 ⇒ DR3。 */
  bogusRequired: (s) => {
    s.doc = replaceOnce(s.doc, "必填 `pubKey`", "必填 `authors`");
  },
  /** 必填清单里列了目录数据文件自动注入的字段 ⇒ DR4。 */
  injectedRequired: (s) => {
    s.doc = replaceOnce(s.doc, "必填 `pubKey`", "必填 `tags`");
  },
  /** 活文档缺失 ⇒ DR5。 */
  docMissing: (s) => {
    s.doc = null;
  },
  /** 一篇真实论文都没有 ⇒ DR5（front matter 基准读不到）。 */
  noPapers: (s) => {
    s.paper = null;
  },
  /** 论文目录在、但里面没有论文文件 ⇒ DR5（空目录不产出论文页，不算真实论文）。 */
  emptyPaperDir: (s) => {
    s.paper = null;
    s.emptyPaperDir = true;
  },
  /** 目录数据文件缺失 ⇒ DR5（自动注入字段判不了）。 */
  dataMissing: (s) => {
    s.data = null;
  },
  /** 必填字段清单被删光 ⇒ DR5。 */
  requiredWiped: (s) => {
    s.doc = replaceOnce(s.doc, REQUIRED_LINE, "1. 在 `src/content/papers/<slug>/paper.md` 写好 frontmatter + 正文。");
  },
  /** 论文语境段落全没了 ⇒ DR5。 */
  noPaperContext: (s) => {
    s.doc = [
      "# 夹具 · implementation notes",
      "",
      "> 原文标题为「Stage 3 接入 checklist」。**集合以 `src/content/papers/` 下的实际目录为准。**",
      "",
      REQUIRED_LINE,
      "",
    ].join("\n");
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "DCR0", label: "基线（合成文档 + 一篇真实论文 + 目录数据文件）", mutate: null, expect: null },
  { id: "DCR1", label: "论文语境段落点名了不存在的论文目录", mutate: MUT.stalePaperList, expect: ["DR1"] },
  { id: "DCR2", label: "现状陈述里写死了论文篇数", mutate: MUT.hardcodedCount, expect: ["DR2"] },
  { id: "DCR3", label: "必填清单列了不存在于 front matter 的字段", mutate: MUT.bogusRequired, expect: ["DR3"] },
  { id: "DCR4", label: "必填清单列了自动注入的字段", mutate: MUT.injectedRequired, expect: ["DR4"] },
  { id: "DCR5", label: "活文档缺失", mutate: MUT.docMissing, expect: ["DR5"] },
  { id: "DCR6", label: "一篇真实论文都没有", mutate: MUT.noPapers, expect: ["DR5"] },
  { id: "DCR7", label: "目录数据文件缺失", mutate: MUT.dataMissing, expect: ["DR5"] },
  { id: "DCR8", label: "必填字段清单被删光", mutate: MUT.requiredWiped, expect: ["DR5"] },
  { id: "DCR9", label: "论文语境段落全没了", mutate: MUT.noPaperContext, expect: ["DR5"] },
  { id: "DCR10", label: "论文目录在、但里面没有论文文件", mutate: MUT.emptyPaperDir, expect: ["DR5"] },
];

/* ========== 四、判据级负对照 ========== */

/** 在门禁副本里卸掉某条判据：给它每一条 fail() 调用**同行**加 `if (false) ` 前缀。 */
function unloadCriterion(src, calls, crit) {
  const targets = calls.filter((c) => c.crit === crit);
  let out = src;
  for (const t of targets.slice().reverse()) {
    out = out.slice(0, t.index) + "if (false) " + out.slice(t.index);
  }
  return { src: out, count: targets.length };
}

/** 负对照档：卸掉某条判据后，对应夹具必须转绿。 */
const NEG_CASES = [
  { id: "NC-DR1", crit: "DR1", case: "DCR1", label: "卸掉 DR1" },
  { id: "NC-DR2", crit: "DR2", case: "DCR2", label: "卸掉 DR2" },
  { id: "NC-DR3", crit: "DR3", case: "DCR3", label: "卸掉 DR3" },
  { id: "NC-DR4", crit: "DR4", case: "DCR4", label: "卸掉 DR4" },
  { id: "NC-DR5", crit: "DR5", case: "DCR8", label: "卸掉 DR5" },
];

/* ========== 执行 ========== */

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failed += 1;
};

const gateSrc = fs.readFileSync(GATE, "utf8");
const calls = scanFailCalls(gateSrc);
const seenCauses = new Set();
const seenCriteria = new Set();

/** 仓库真源（门禁 + 活文档 + 论文目录 + package.json）的整体指纹：自测前后必须一致。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const paths = [
    GATE,
    path.join(ROOT, "docs", "implementation-notes.md"),
    path.join(ROOT, "src", "content", "papers", "papers.11tydata.cjs"),
    path.join(ROOT, "package.json"),
  ];
  for (const p of paths) h.update(p).update(fs.existsSync(p) ? fs.readFileSync(p) : "<missing>");
  const papersDir = path.join(ROOT, "src", "content", "papers");
  for (const name of fs.existsSync(papersDir) ? fs.readdirSync(papersDir).sort() : []) {
    h.update(name);
  }
  return h.digest("hex");
}
const REAL_DIGEST = repoDigest();

/** 跑一档注入并核对：判红/判绿、门禁确实跑到自己的结论、归属纯净、判据集合恰为。 */
function checkCase(spec, fixtureDir, gatePath) {
  const r = runGate(gatePath, fixtureDir);
  const a = attribute(r.out);
  if (a.impure) {
    bad(
      `${spec.id} ${spec.label} → 有红因无法唯一归类（匹配到 ${a.impure.owners.length} 条归属）：` +
        `${a.impure.line.trim().slice(0, 90)}`
    );
    return;
  }
  if (spec.expect === null) {
    if (r.code !== 0 || !r.out.includes("文档现状/接入流程门禁通过")) {
      bad(`${spec.id} ${spec.label} → 期望判绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      return;
    }
    if (a.rows.length !== 0) {
      bad(`${spec.id} ${spec.label} → 判绿但仍有 ${a.rows.length} 条红因`);
      return;
    }
    ok(`${spec.id} ${spec.label} → 判绿 exit 0，零红因`);
    return;
  }
  if (r.code !== 1 || !r.out.includes("文档现状/接入流程门禁未通过")) {
    bad(
      `${spec.id} ${spec.label} → 期望门禁自己报红（exit 1），实测 exit ${r.code}` +
        `（非 1 说明门禁崩了，不是判红）`
    );
    console.log(r.out.split("\n").slice(0, 4).join("\n"));
    return;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(
      `${spec.id} ${spec.label} → 判据集合应为恰为 {${spec.expect.join(", ")}}，` +
        `实测 {${a.crits.join(", ") || "空"}}`
    );
    console.log(a.rows.map((x) => x.line.trim().slice(0, 110)).join("\n"));
    return;
  }
  for (const row of a.rows) seenCauses.add(row.owners[0].id);
  for (const c of a.crits) seenCriteria.add(c);
  ok(
    `${spec.id} ${spec.label} → 判红 exit 1，判据集合恰为 {${a.crits.join(", ")}}，红因 ${a.rows.length} 条`
  );
}

console.log("文档现状/接入流程门禁 · 自测（四件套）：\n");

/* ---- 一、红因归属表 ---- */
console.log("一、红因归属表");
{
  const bads = [];
  for (let a = 0; a < CAUSES.length; a++) {
    for (let b = 0; b < CAUSES.length; b++) {
      if (a !== b && CAUSES[a].frag.includes(CAUSES[b].frag)) bads.push(`${CAUSES[a].id}⊃${CAUSES[b].id}`);
    }
  }
  if (bads.length) bad(`文案片段互不包含：${bads.join("、")}`);
  else ok(`${CAUSES.length} 条红因归属登记（${CAUSES.map((c) => c.id).join(" / ")}），文案片段互不包含`);

  const orphan = CAUSES.filter((c) => !CRITERIA.includes(c.crit));
  if (orphan.length) bad(`归属里有不在静态清单里的判据：${orphan.map((c) => c.id).join("、")}`);
  else ok(`每条归属的判据都在静态清单 ${JSON.stringify(CRITERIA)} 内`);

  const noCause = CRITERIA.filter((c) => !CAUSES.some((x) => x.crit === c));
  if (noCause.length) bad(`静态清单里的判据没有红因归属：${noCause.join("、")}`);
  else ok("静态清单里的每条判据都至少有一条红因归属");
}

/* ---- 二、覆盖度自证（先做，因为注入档要用它校验） ---- */
console.log("\n二、覆盖度自证");
{
  const owners = calls.map((c) => CAUSES.filter((x) => c.literal.includes(x.frag)));
  const multi = owners.map((o, i) => ({ i, o })).filter((x) => x.o.length !== 1);
  if (multi.length) {
    bad(`有 ${multi.length} 个 fail() 调用点没能唯一归属：${multi.map((m) => m.i).join(", ")}`);
  } else {
    ok(`门禁的 ${calls.length} 个 fail() 调用点逐个唯一归属（双向对齐）`);
  }

  if (calls.length !== CAUSES.length) {
    bad(`门禁 fail() 调用点数 ${calls.length} != 归属表 ${CAUSES.length} 条`);
  } else {
    ok(`调用点数 ${calls.length} == 归属表条数 ${CAUSES.length}`);
  }
  const claimed = owners.map((o) => (o.length === 1 ? o[0].id : ""));
  const dup = claimed.filter((id) => id && claimed.filter((x) => x === id).length > 1);
  if (dup.length) bad(`有归属认领了多个调用点：${[...new Set(dup)].join("、")}`);
  else ok("每条归属恰好认领一个调用点（无遗漏、无多领）");

  const critSet = [...new Set(calls.map((c) => c.crit).filter(Boolean))].sort();
  if (critSet.join(",") !== [...CRITERIA].sort().join(",")) {
    bad(`门禁解析出的判据集合 {${critSet.join(", ")}} != 静态清单 {${CRITERIA.join(", ")}}`);
  } else {
    ok(`门禁解析出的判据集合 {${critSet.join(", ")}} == 静态清单`);
  }
  const critMismatch = calls.filter((c, i) => owners[i].length === 1 && owners[i][0].crit !== c.crit);
  if (critMismatch.length) bad(`有调用点解析出的判据号与归属登记不一致：${critMismatch.length} 处`);
  else ok("每个调用点解析出的判据号与归属登记一致");
}

/* ---- 三、注入档 ---- */
console.log("\n三、注入档");
const fixtures = {};
for (const spec of CASES) {
  let dir;
  try {
    dir = buildFixture(spec.mutate);
  } catch (e) {
    bad(`${spec.id} ${spec.label} → 注入本身坏了：${e.message}`);
    continue;
  }
  fixtures[spec.id] = dir;
  checkCase(spec, dir, GATE);
}

/* ---- 四、判据级负对照 ---- */
console.log("\n四、判据级负对照");
for (const neg of NEG_CASES) {
  const targets = calls.filter((c) => c.crit === neg.crit);
  if (targets.length === 0) {
    bad(`${neg.id} → 门禁里找不到判据 ${neg.crit} 的 fail() 调用`);
    continue;
  }
  const patched = unloadCriterion(gateSrc, calls, neg.crit);
  const beforeLines = gateSrc.split("\n");
  const afterLines = patched.src.split("\n");
  if (beforeLines.length !== afterLines.length) {
    bad(`${neg.id} → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
    continue;
  }
  const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
  if (diff !== patched.count) {
    bad(`${neg.id} → 差异行数 ${diff} != 该判据的 fail() 调用数 ${patched.count}`);
    continue;
  }
  const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
  const mirror = path.join(gateDir, "check-doc-reality.cjs");
  fs.writeFileSync(mirror, patched.src);
  const base = runGate(GATE, fixtures[neg.case]);
  const baseAttr = attribute(base.out);
  const baseCrits = baseAttr.crits.join(",");
  if (baseCrits !== neg.crit) {
    bad(`${neg.id} → 基线 ${neg.case} 的判据集合应为恰为 {${neg.crit}}，实测 {${baseCrits || "空"}}`);
    continue;
  }
  const r = runGate(mirror, fixtures[neg.case]);
  const a = attribute(r.out);
  if (r.code !== 0 || !r.out.includes("文档现状/接入流程门禁通过")) {
    bad(`${neg.id} → 卸掉 ${neg.crit} 后 ${neg.case} 夹具必须转绿（exit 0），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    continue;
  }
  if (a.rows.length !== 0) {
    bad(`${neg.id} → 卸掉 ${neg.crit} 后 ${neg.case} 夹具判绿但仍有 ${a.rows.length} 条红因`);
    continue;
  }
  ok(
    `${neg.id} ${neg.label}（${patched.count} 处 fail() 调用，差异 ${diff} 行，行数不变）→ ` +
      `基线 {${neg.crit}} ⇒ 同一夹具转绿，零红因`
  );
}

/* ---- 每条红因、每条判据都至少一档判红 ---- */
{
  const noCase = CAUSES.filter((c) => !seenCauses.has(c.id)).map((c) => c.id);
  if (noCase.length) bad(`这些红因没有任何一档判红（等于不可证）：${noCase.join("、")}`);
  else ok(`每条红因都至少一档判红（${seenCauses.size}/${CAUSES.length}）`);
  const noCrit = CRITERIA.filter((c) => !seenCriteria.has(c));
  if (noCrit.length) bad(`这些判据没有任何一档判红：${noCrit.join("、")}`);
  else ok(`每条判据都至少一档判红（${seenCriteria.size}/${CRITERIA.length}）`);
}

/* ---- 仓库真源一个字节没动 ---- */
{
  const after = repoDigest();
  if (after !== REAL_DIGEST) {
    bad("自测期间仓库真源被改动了 —— 注入必须只在 /tmp 副本上做");
  } else {
    ok(`仓库真源指纹前后一致（${REAL_DIGEST.slice(0, 16)}…）—— 注入全程只在临时副本上做`);
  }
}

console.log("");
if (failed) {
  console.log(`文档现状/接入流程门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("文档现状/接入流程门禁自测全部通过。");
