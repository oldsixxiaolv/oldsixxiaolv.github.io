#!/usr/bin/env node
/**
 * 站内写作契约门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「docs/blog-writing-guide.md 这份写作契约 ↔ 代码现实」是否一致：
 * 契约文档里列的 F 判据 / T 判据 / 自动注入字段，得与两道门禁源码和目录数据文件对得上；
 * §2 字段表与 §4 自查清单不许互相打架；文档里不许写死每轮都会变的数字。
 *
 * 「注入没生效」「改的是副本还是原件」「门禁自己被卸掉了」是最容易发生、
 * 也最不容易看出来的失败模式。所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 15 处 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、覆盖度自证 —— fail() 调用点与归属表**双向**对齐；门禁解析出的判据集合与
 *      静态清单一致；每条红因、每条判据都至少一档判红。
 *   三、注入档 —— 每一档都断言**判红且判据集合恰为预期**（多一条少一条都算失败）。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉（给它那几条 fail() 调用同行加
 *      `if (false) ` 前缀，**行数不变**），对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，
 *      而不是别的判据顺带报出来的。
 *
 * 夹具是**合成式**的（不复制真实文档）：基线恒绿、与仓库当前状态解耦；
 * 真实文档的正确性由 build 链里真跑那道门禁保证。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-writing-contract.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-writing-contract.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "WC1", crit: "WC1", frag: "的 F 判据对照表与" },
  { id: "WC2", crit: "WC2", frag: "的 T 判据对照表与" },
  { id: "WC3", crit: "WC3", frag: "正文提及了不存在的判据编号" },
  { id: "WC4", crit: "WC4", frag: "「自动注入的字段」表与" },
  { id: "WC5", crit: "WC5", frag: "§4 自查清单把" },
  { id: "WC6", crit: "WC6", frag: "写死了「" },
  { id: "WC7a", crit: "WC7", frag: "扫描面被收窄了" },
  { id: "WC7b", crit: "WC7", frag: "F 判据真源" },
  { id: "WC7c", crit: "WC7", frag: "T 判据真源" },
  { id: "WC7d", crit: "WC7", frag: "注入字段真源" },
  { id: "WC7e", crit: "WC7", frag: "自动注入字段表一行都没检出" },
  { id: "WC7f", crit: "WC7", frag: "front matter 字段表一行都没检出" },
  { id: "WC7g", crit: "WC7", frag: "F 判据对照表一行都没检出" },
  { id: "WC7h", crit: "WC7", frag: "T 判据对照表一行都没检出" },
  { id: "WC7i", crit: "WC7", frag: "自查清单段没检出" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["WC1", "WC2", "WC3", "WC4", "WC5", "WC6", "WC7"];

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
      crit: (literal.match(/^\s*(WC\d+)\b/) || [])[1] || "",
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

/* ========== 夹具（合成式：结构与真站一致，内容是缩影） ========== */

/* §1 自动注入字段表的一行 —— 改它就能动「文档列的注入字段」。 */
const INJ_ROW_LAYOUT = "| `layout` | `layouts/detail.njk` |";
/* §2.4 F 判据对照表的三行。 */
const F_ROW_1 = "| F1 | 文章形状必须是 `<slug>/index.md` | 判红 |";
const F_ROW_2 = "| F2 | 目录名小写 ASCII + 连字符 | 判红 |";
const F_ROW_3 = "| F3 | front matter 可解析 | 判红 |";
/* §2.5 T 判据对照表的两行。 */
const T_ROW_1 = "| T1 | 详情页的主题标签位上不得出现集合名 | 判红 |";
const T_ROW_2 = "| T2 | 主题标签必须一个不少地还在 | 判红 |";
/* §2.4 的小节标题 —— WC6 往它后面插一条「写死了 N 档」的说明。 */
const H24 = "### 2.4 本契约现在**有门禁守着**（判据对照）";
/* §4 自查清单里那条「别写」的行 —— 改它就能动「可写 / 别写」互斥。 */
const CHECK_LINE =
  "□ front matter 没有 layout / permalink（自动注入，别覆盖）；tags 是**合并**、照常写主题标签";
/* §3 正文里的一行 —— 改它就能动「正文提及的判据编号」。 */
const BODY_LINE = "正文全英文。";
/* §1 整段 —— 删掉它就没有「自动注入字段表」了。 */
const SEC1_BLOCK = [
  "## 1. 位置与命名",
  "",
  "### 自动注入的字段（**不要重复写**）",
  "",
  "`src/content/blog/blog.11tydata.cjs` 已经给这个目录下的所有文件注入了：",
  "",
  "| 字段 | 值 |",
  "|---|---|",
  INJ_ROW_LAYOUT,
  "| `permalink` | `/blog/<slug>/` |",
  '| `tags` | 追加集合名 `"blog"` |',
  "| `prev` / `next` | 按发布日期排的上一篇 / 下一篇 |",
  "",
].join("\n");

const DOC_BASE = [
  "# 夹具 · 站内写作契约",
  "",
  "> 本文件是**站内博客文章的写作契约**（夹具版：结构与真站一致，内容是缩影）。",
  "",
  SEC1_BLOCK,
  "## 2. front matter 契约",
  "",
  "| 字段 | 必需 | 类型 |",
  "|---|---|---|",
  "| `title` | **是** | 字符串 |",
  "| `date` | **是** | `YYYY-MM-DD` |",
  "| `excerpt` | 强烈建议 | 字符串 |",
  "| `readingTime` | 建议 | 纯数字 |",
  "| `tags` | 可选 | 字符串数组 |",
  "| `cover` | 可选 | 文件名 |",
  "",
  "### 2.1 `date` 只写日期，不写时分",
  "",
  "`date` 只写到日。",
  "",
  H24,
  "",
  "| 判据 | 管什么 | 后果 |",
  "|---|---|---|",
  F_ROW_1,
  F_ROW_2,
  F_ROW_3,
  "",
  "### 2.5 集合名与主题标签（另一条契约，门禁守着）",
  "",
  "| 判据 | 管什么 | 后果 |",
  "|---|---|---|",
  T_ROW_1,
  T_ROW_2,
  "",
  "## 3. 正文",
  "",
  BODY_LINE,
  "",
  "## 4. 发一篇之前的自查清单",
  "",
  "```",
  "□ 目录名是小写连字符",
  CHECK_LINE,
  "□ date 只到日（YYYY-MM-DD）",
  "```",
  "",
  "## 5. 已知缺陷",
  "",
  "- 无。",
  "",
].join("\n");

/** 夹具用的 front matter 门禁源码（只提供 F 判据编号标记）。 */
const FM_GATE_BASE = [
  "#!/usr/bin/env node",
  "/**",
  " * 夹具 · front matter 契约门禁（只提供判据编号标记，供写作契约门禁核对）。",
  " */",
  "// F1 文章形状必须是 <slug>/index.md",
  "// F2 目录名小写 ASCII + 连字符",
  "// F3 front matter 可解析",
  "const problems = [];",
  "module.exports = { problems };",
  "",
].join("\n");

/** 夹具用的集合名泄漏门禁源码（只提供 T 判据编号标记）。 */
const TL_GATE_BASE = [
  "#!/usr/bin/env node",
  "/**",
  " * 夹具 · 集合名泄漏门禁（只提供判据编号标记，供写作契约门禁核对）。",
  " */",
  "// T1 详情页的主题标签位上不得出现集合名",
  "// T2 主题标签必须一个不少地还在",
  "const problems = [];",
  "module.exports = { problems };",
  "",
].join("\n");

/** 夹具用的博客目录数据文件（自动注入 layout / permalink / tags / prev / next）。 */
const DATA_BASE = [
  "module.exports = {",
  '  layout: "layouts/detail.njk",',
  "  permalink: (data) => `/blog/${data.page.fileSlugStem}/`,",
  '  tags: ["blog"],',
  "  eleventyComputed: {",
  "    prev: (data) => null,",
  "    next: (data) => null,",
  "  },",
  "};",
  "",
].join("\n");

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-writingcontract-selftest-"));

/** 建一个独立夹具（临时目录 + 合成契约文档 / 两道门禁源码 / 目录数据文件）。 */
function buildFixture(mutate) {
  const state = { doc: DOC_BASE, fm: FM_GATE_BASE, tl: TL_GATE_BASE, data: DATA_BASE };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "content", "blog"), { recursive: true });
  if (state.doc !== null) fs.writeFileSync(path.join(dir, "docs", "blog-writing-guide.md"), state.doc);
  if (state.fm !== null) fs.writeFileSync(path.join(dir, "scripts", "check-blog-frontmatter.cjs"), state.fm);
  if (state.tl !== null) fs.writeFileSync(path.join(dir, "scripts", "check-tag-leak.cjs"), state.tl);
  if (state.data !== null) {
    fs.writeFileSync(path.join(dir, "src", "content", "blog", "blog.11tydata.cjs"), state.data);
  }
  return dir;
}

/** 跑一次门禁（夹具通过 WC_ROOT 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = { ...process.env, WC_ROOT: fixtureDir };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** §2.4 的 F 表少列 F2 ⇒ WC1（门禁已实现但文档没列）。 */
  fTableMissingF2: (s) => {
    s.doc = replaceOnce(s.doc, `${F_ROW_2}\n`, "");
  },
  /** 门禁源码里多了一条 F4 ⇒ WC1（文档没列）。 */
  fGateExtraF4: (s) => {
    s.fm = `${s.fm}// F4 夹具里额外长出来的一条判据\n`;
  },
  /** §2.4 的 F 表多列 F9 ⇒ WC1（文档列了但门禁里没有）。 */
  fTableExtraF9: (s) => {
    s.doc = replaceOnce(s.doc, F_ROW_3, `${F_ROW_3}\n| F9 | 夹具里凭空多出来的一条判据 | 判红 |`);
  },
  /** §2.5 的 T 表少列 T2 ⇒ WC2。 */
  tTableMissingT2: (s) => {
    s.doc = replaceOnce(s.doc, `${T_ROW_2}\n`, "");
  },
  /** 门禁源码里多了一条 T3 ⇒ WC2。 */
  tGateExtraT3: (s) => {
    s.tl = `${s.tl}// T3 夹具里额外长出来的一条判据\n`;
  },
  /** 正文里提了一个不存在的 F 编号 ⇒ WC3。 */
  bodyMentionsF9: (s) => {
    s.doc = replaceOnce(s.doc, BODY_LINE, `${BODY_LINE}\n\n写错了现在会被 F9 拦下。`);
  },
  /** 目录数据文件多注入了一个字段 ⇒ WC4。 */
  dataExtraSummary: (s) => {
    s.data = replaceOnce(s.data, '  tags: ["blog"],\n', '  tags: ["blog"],\n  summary: "夹具摘要",\n');
  },
  /** 契约文档多列了一个没人注入的字段 ⇒ WC4。 */
  docExtraSlug: (s) => {
    s.doc = replaceOnce(s.doc, INJ_ROW_LAYOUT, `${INJ_ROW_LAYOUT}\n| \`slug\` | 无效 |`);
  },
  /** §4 把 tags 也列进「别写」⇒ WC5（与 §2 字段表互斥）。 */
  checklistForbidsTags: (s) => {
    s.doc = replaceOnce(
      s.doc,
      CHECK_LINE,
      "□ front matter 没有 layout / permalink / tags（自动注入，别覆盖）；tags 是**合并**、照常写主题标签"
    );
  },
  /** 文档里写死了自测档数 ⇒ WC6。 */
  hardcodedMatrixCount: (s) => {
    s.doc = replaceOnce(
      s.doc,
      H24,
      `${H24}\n\n- 手动跑 \`npm run check:blog-frontmatter-selftest\`（7 档注入矩阵）。`
    );
  },
  /** 契约文档整个没了 ⇒ WC7（活文档不在）。 */
  docMissing: (s) => {
    s.doc = null;
  },
  /** F 判据真源没了 ⇒ WC7（顺带 WC1：文档列的判据一条都对不上）。 */
  fmGateMissing: (s) => {
    s.fm = null;
  },
  /** T 判据真源没了 ⇒ WC7（顺带 WC2：文档列的判据一条都对不上）。 */
  tlGateMissing: (s) => {
    s.tl = null;
  },
  /** 目录数据文件没了 ⇒ WC7（注入字段真源不在）。 */
  dataMissing: (s) => {
    s.data = null;
  },
  /** §1 自动注入字段表整段没了 ⇒ WC7（没有基准可比）。 */
  injSectionMissing: (s) => {
    s.doc = replaceOnce(s.doc, SEC1_BLOCK, "");
  },
  /** §2.4 的 F 判据表一行都没了 ⇒ WC7（读者查不到任何一条 F 判据）。 */
  fTableWiped: (s) => {
    s.doc = replaceOnce(s.doc, `${F_ROW_1}\n${F_ROW_2}\n${F_ROW_3}\n`, "");
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "WCR0", label: "基线（合成契约文档 + 两道门禁源码 + 目录数据文件）", mutate: null, expect: null },
  { id: "WCR1a", label: "§2.4 的 F 判据表少列一条", mutate: MUT.fTableMissingF2, expect: ["WC1"] },
  { id: "WCR1b", label: "front matter 门禁源码里多了一条判据", mutate: MUT.fGateExtraF4, expect: ["WC1"] },
  { id: "WCR1c", label: "§2.4 的 F 判据表多列一条不存在的", mutate: MUT.fTableExtraF9, expect: ["WC1"] },
  { id: "WCR2a", label: "§2.5 的 T 判据表少列一条", mutate: MUT.tTableMissingT2, expect: ["WC2"] },
  { id: "WCR2b", label: "集合名门禁源码里多了一条判据", mutate: MUT.tGateExtraT3, expect: ["WC2"] },
  { id: "WCR3", label: "正文里提了一个不存在的判据编号", mutate: MUT.bodyMentionsF9, expect: ["WC3"] },
  { id: "WCR4a", label: "目录数据文件多注入了一个字段", mutate: MUT.dataExtraSummary, expect: ["WC4"] },
  { id: "WCR4b", label: "§1 多列了一个没人注入的字段", mutate: MUT.docExtraSlug, expect: ["WC4"] },
  { id: "WCR5", label: "§4 把 tags 也列进「别写」", mutate: MUT.checklistForbidsTags, expect: ["WC5"] },
  { id: "WCR6", label: "文档里写死了自测档数", mutate: MUT.hardcodedMatrixCount, expect: ["WC6"] },
  { id: "WCR7a", label: "契约文档整个没了", mutate: MUT.docMissing, expect: ["WC7"] },
  { id: "WCR7b", label: "F 判据真源没了", mutate: MUT.fmGateMissing, expect: ["WC1", "WC7"] },
  { id: "WCR7c", label: "目录数据文件没了", mutate: MUT.dataMissing, expect: ["WC7"] },
  { id: "WCR7d", label: "§1 自动注入字段表整段没了", mutate: MUT.injSectionMissing, expect: ["WC7"] },
  { id: "WCR7e", label: "§2.4 的 F 判据表一行都没了", mutate: MUT.fTableWiped, expect: ["WC7"] },
  { id: "WCR7f", label: "T 判据真源没了", mutate: MUT.tlGateMissing, expect: ["WC2", "WC7"] },
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
  { id: "NC-WC1", crit: "WC1", case: "WCR1a", label: "卸掉 WC1" },
  { id: "NC-WC2", crit: "WC2", case: "WCR2a", label: "卸掉 WC2" },
  { id: "NC-WC3", crit: "WC3", case: "WCR3", label: "卸掉 WC3" },
  { id: "NC-WC4", crit: "WC4", case: "WCR4a", label: "卸掉 WC4" },
  { id: "NC-WC5", crit: "WC5", case: "WCR5", label: "卸掉 WC5" },
  { id: "NC-WC6", crit: "WC6", case: "WCR6", label: "卸掉 WC6" },
  { id: "NC-WC7", crit: "WC7", case: "WCR7e", label: "卸掉 WC7" },
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

/** 仓库真源（门禁 + 契约文档 + 两道门禁源码 + 目录数据文件 + package.json）的整体指纹。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const paths = [
    GATE,
    path.join(ROOT, "docs", "blog-writing-guide.md"),
    path.join(ROOT, "scripts", "check-blog-frontmatter.cjs"),
    path.join(ROOT, "scripts", "check-tag-leak.cjs"),
    path.join(ROOT, "src", "content", "blog", "blog.11tydata.cjs"),
    path.join(ROOT, "package.json"),
  ];
  for (const p of paths) h.update(p).update(fs.existsSync(p) ? fs.readFileSync(p) : "<missing>");
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
    if (r.code !== 0 || !r.out.includes("站内写作契约门禁通过")) {
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
  if (r.code !== 1 || !r.out.includes("站内写作契约门禁未通过")) {
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

console.log("站内写作契约门禁 · 自测（四件套）：\n");

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

  /* 门禁源码里不许出现别的门禁的判据编号字面量：README 命令表要按前缀与门禁源码对账，
     源码里混进 F / T 系列会把别的门禁的前缀带进这道门的对账范围。 */
  const foreign = [...new Set([...gateSrc.matchAll(/\b([FT]\d+)\b/g)].map((m) => m[0]))];
  if (foreign.length) {
    bad(`门禁源码里出现了别的门禁的判据编号字面量：${foreign.join("、")} —— 会污染 README 的前缀对账`);
  } else {
    ok("门禁源码里没有别的门禁的判据编号字面量（F / T 系列）");
  }
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
  const mirror = path.join(gateDir, "check-writing-contract.cjs");
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
  if (r.code !== 0 || !r.out.includes("站内写作契约门禁通过")) {
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
  console.log(`站内写作契约门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("站内写作契约门禁自测全部通过。");
