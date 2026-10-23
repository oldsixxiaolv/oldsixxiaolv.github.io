#!/usr/bin/env node
/**
 * 设计系统组件清单契约门禁 · 自测（四件套）。
 *
 * 四件套是什么：
 *   一、红因归属表 —— 门禁的每一条红因都必须能**唯一**归到一条判据；
 *      判据集合必须恰好是静态清单里的那几条。
 *   二、覆盖度自证 —— 门禁源码里的 fail() 调用点逐个唯一归属、条数与归属表相等、
 *      判据集合与静态清单相等；门禁源码里的判据编号前缀只允许自己的 DCX
 *      （以及一位的 D 缺陷台账号），且 DCX 前缀全仓唯一。
 *   三、注入档 —— 每造一个坏夹具，门禁必须**自己**判红，且判据集合**恰为**预期。
 *      夹具全部是**合成式**的（类名、token 名与真实仓库完全不同），
 *      以此证明门禁读的是真源，不是把真仓库的名字写死。
 *   四、判据级负对照 —— 把门禁源码复制到临时目录，同行替换卸掉某条判据，
 *      对应夹具必须转绿；断言「行数不变」「差异行数 == 该判据的 fail() 数」
 *      「原件 sha256 前后一致」。
 *      ⚠️ **不给生产门禁加可卸开关** —— 加了开关就等于在门禁里留后门；
 *      负对照一律在副本上做。
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-design-components.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "DCX1", crit: "DCX1", frag: "在 CSS 里没有对应的类选择器" },
  { id: "DCX1b", crit: "DCX1", frag: "这一节在设计系统文档里没有找到" },
  { id: "DCX2", crit: "DCX2", frag: "没有被 var() 引用" },
  { id: "DCX3a", crit: "DCX3", frag: "的 min-height 写的是" },
  { id: "DCX3b", crit: "DCX3", frag: "的 min-height 在 CSS 里找不到" },
  { id: "DCX3c", crit: "DCX3", frag: "的 min-height 在 CSS 里有多处取值" },
  { id: "DCX4", crit: "DCX4", frag: "覆盖度自证不足" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["DCX1", "DCX2", "DCX3", "DCX4"];

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
      crit: (literal.match(/^\s*(DCX\d+)\b/) || [])[1] || "",
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
  if (n !== 1) throw new Error(`注入锚点出现 ${n} 次（应恰好 1 次）：「${from.slice(0, 40)}…」`);
  return text.replace(from, to);
}

/* ========== 夹具（合成式：类名与 token 名都与真实仓库完全不同） ========== */

/* --- 合成 CSS --- */
const CSS_WIDGET = `/* 合成夹具：组件样式表（类名与真实仓库完全不同） */
.wg {
  display: inline-flex;
  border-radius: var(--wg-radius);
  padding: 0 var(--wg-gap);
  min-height: 40px;
  font-weight: 600;
}
.wg--mini { min-height: 28px; padding: 0 var(--wg-gap-mini); }
.wg--solid { background: var(--wg-solid-bg); color: var(--wg-solid-ink); }
.wg--quiet { background: var(--wg-quiet-bg); }
`;

const CSS_BLOCK = `/* 合成夹具：块级组件 */
.blk { background: var(--blk-bg); border-radius: var(--wg-radius); }
.blk__slot { aspect-ratio: 16 / 9; background: var(--blk-slot-bg); }
.blk__img { display: block; width: 100%; height: 100%; object-fit: cover; }
`;

const CSS_PROSE = `/* 合成夹具：正文元素 */
blockquote {
  border-inline-start: 3px solid var(--quote-edge);
  background: var(--blk-bg);
  padding: var(--wg-gap);
  font-family: var(--quote-font);
}
code {
  background: var(--blk-bg);
  border-radius: var(--code-radius);
  font-family: var(--code-font);
}
pre { font-family: var(--code-font); }
`;

/* --- 合成契约文档（四个被扫描的小节 + 两个不扫描的小节做边界） --- */
const DOC_BASE = `# 合成设计系统文档

## 六、组件清单（Component Inventory）

### 6.1 控件（Widget）

\`\`\`html
<a class="wg wg--solid" href="/x/">Solid</a>
<button type="button" class="wg wg--quiet wg--mini">Mini</button>
\`\`\`

| 变体 | 用途 | min-height |
|---|---|---|
| \`.wg\` | 基础控件 | 40px |
| \`.wg--solid\` | 实色主操作 | 40px |
| \`.wg--quiet\` | 次级操作 | 40px |
| \`.wg--mini\` | 紧凑尺寸 | 28px |

规则：

- 圆角 \`--wg-radius\`；水平 padding \`--wg-gap\`（默认）/ \`--wg-gap-mini\`（紧凑）
- 实色底 \`--wg-solid-bg\`

### 6.2 块（Block）

\`.blk\` 是**外壳**：背景 \`--blk-bg\`；圆角 \`--wg-radius\`。

| 变体 | 用途 |
|---|---|
| \`.blk__slot\` | 封面槽（底色 \`--blk-slot-bg\`） |
| \`.blk__img\` | 槽内图像 |

### 6.3 表单（Form）

这一节不在本门禁的扫描面里，随便写。

### 6.5 引文（Quote）

\`\`\`html
<blockquote>
  <p>……引用内容……</p>
</blockquote>
\`\`\`

- 左边 3px \`--quote-edge\` 边
- 背景 \`--blk-bg\`
- 内部 padding \`--wg-gap\`
- 字体走 \`--quote-font\`

### 6.6 代码块（Code）

- 行内：\`background: var(--blk-bg); border-radius: var(--code-radius); font-family: var(--code-font)\`
- 块级：\`<pre><code>\`，与行内共用同一套 \`code\` 元素样式

### 6.7 面板（Panel）

这一节也不在扫描面里。
`;

/* ========== 夹具装配 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-designcomponents-selftest-"));

/** 建一个独立夹具（临时目录 + 合成契约文档 + 三份合成样式表）。 */
function buildFixture(mutate) {
  const state = { doc: DOC_BASE, cssWidget: CSS_WIDGET, cssBlock: CSS_BLOCK, cssProse: CSS_PROSE };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "assets", "css", "components"), { recursive: true });
  if (state.doc !== null) fs.writeFileSync(path.join(dir, "docs", "design-system.md"), state.doc);
  if (state.cssWidget !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/css/components/_widget.css"), state.cssWidget);
  }
  if (state.cssBlock !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/css/components/_block.css"), state.cssBlock);
  }
  if (state.cssProse !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/css/prose.css"), state.cssProse);
  }
  return dir;
}

/** 跑一次门禁（夹具通过 DCX_DOC / DCX_CSS_DIR 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = {
    ...process.env,
    DCX_DOC: path.join(fixtureDir, "docs", "design-system.md"),
    DCX_CSS_DIR: path.join(fixtureDir, "src", "assets", "css"),
  };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** §6.1 正文里多一个代码里没有的类 ⇒ DCX1。 */
  docPhantomClass: (s) => {
    s.doc = replaceOnce(s.doc, "- 实色底 `--wg-solid-bg`", "- 实色底 `--wg-solid-bg`；另有 `.wg--nope` 变体");
  },
  /** §6.1 的规格 token 改成代码里没有的 ⇒ DCX2。 */
  docUnknownToken: (s) => {
    s.doc = replaceOnce(s.doc, "- 圆角 `--wg-radius`；", "- 圆角 `--wg-nope`；");
  },
  /** §6.1 尺寸表里把紧凑档的 min-height 写错 ⇒ DCX3（写的是）。 */
  docWrongHeight: (s) => {
    s.doc = replaceOnce(s.doc, "| `.wg--mini` | 紧凑尺寸 | 28px |", "| `.wg--mini` | 紧凑尺寸 | 30px |");
  },
  /** CSS 里把两个类的 min-height 都删掉 ⇒ DCX3（在 CSS 里找不到）。 */
  cssNoHeight: (s) => {
    s.cssWidget = replaceOnce(s.cssWidget, "  min-height: 40px;\n", "");
    s.cssWidget = replaceOnce(s.cssWidget, ".wg--mini { min-height: 28px; padding: 0 var(--wg-gap-mini); }", ".wg--mini { padding: 0 var(--wg-gap-mini); }");
  },
  /** §6.1 尺寸表表头改名 ⇒ DCX4（尺寸表行 0）。 */
  docSizeHeaderRenamed: (s) => {
    s.doc = replaceOnce(s.doc, "| 变体 | 用途 | min-height |", "| 变体 | 用途 | 高度 |");
  },
  /** §6.2 整节清空 ⇒ DCX4（该小节没扫出任何东西 + 类名数不足）。 */
  docSection62Wiped: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "`.blk` 是**外壳**：背景 `--blk-bg`；圆角 `--wg-radius`。\n\n| 变体 | 用途 |\n|---|---|\n| `.blk__slot` | 封面槽（底色 `--blk-slot-bg`） |\n| `.blk__img` | 槽内图像 |\n",
      ""
    );
  },
  /** §6.5 的标题整个不见了 ⇒ DCX1（小节没找到）。 */
  docSection65HeadingRemoved: (s) => {
    s.doc = replaceOnce(s.doc, "### 6.5 引文（Quote）", "### 6.5x 引文（Quote）");
  },
  /** 同一个类在 CSS 里有两个不同的 min-height ⇒ DCX3（多处取值）。 */
  cssConflictingHeight: (s) => {
    s.cssWidget = replaceOnce(s.cssWidget, ".wg--mini {", ".wg { min-height: 50px; }\n.wg--mini {");
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "DCXR0", label: "基线（合成契约文档 + 三份合成样式表）", mutate: null, expect: null },
  { id: "DCXR1", label: "§6.1 正文里多一个代码里没有的类", mutate: MUT.docPhantomClass, expect: ["DCX1"] },
  { id: "DCXR2", label: "§6.1 的规格 token 写成代码里没有的", mutate: MUT.docUnknownToken, expect: ["DCX2"] },
  { id: "DCXR3", label: "§6.1 尺寸表里把紧凑档的 min-height 写错", mutate: MUT.docWrongHeight, expect: ["DCX3"] },
  { id: "DCXR4", label: "CSS 里把两个类的 min-height 都删掉", mutate: MUT.cssNoHeight, expect: ["DCX3"] },
  { id: "DCXR5", label: "§6.1 尺寸表表头改名", mutate: MUT.docSizeHeaderRenamed, expect: ["DCX4"] },
  { id: "DCXR6", label: "§6.2 整节清空", mutate: MUT.docSection62Wiped, expect: ["DCX4"] },
  { id: "DCXR7", label: "§6.5 的标题整个不见了", mutate: MUT.docSection65HeadingRemoved, expect: ["DCX1"] },
  { id: "DCXR8", label: "同一个类在 CSS 里有两个不同的 min-height", mutate: MUT.cssConflictingHeight, expect: ["DCX3"] },
];

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
  { id: "NC-DCX1", crit: "DCX1", case: "DCXR1", label: "卸掉 DCX1" },
  { id: "NC-DCX2", crit: "DCX2", case: "DCXR2", label: "卸掉 DCX2" },
  { id: "NC-DCX3", crit: "DCX3", case: "DCXR3", label: "卸掉 DCX3" },
  { id: "NC-DCX4", crit: "DCX4", case: "DCXR5", label: "卸掉 DCX4" },
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

/** 仓库真源（门禁 + 设计系统文档 + 三份相关样式表 + package.json）的整体指纹。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const paths = [
    GATE,
    path.join(ROOT, "docs", "design-system.md"),
    path.join(ROOT, "src/assets/css/components/_button.css"),
    path.join(ROOT, "src/assets/css/components/_card.css"),
    path.join(ROOT, "src/assets/css/base.css"),
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
    if (r.code !== 0 || !r.out.includes("设计系统组件清单契约门禁通过")) {
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
  if (r.code !== 1 || !r.out.includes("设计系统组件清单契约门禁未通过")) {
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

console.log("设计系统组件清单契约门禁 · 自测（四件套）：\n");

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

/* ---- 二、覆盖度自证 ---- */
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

  /* 门禁源码里的判据编号前缀：只允许自己的 DCX，以及一位的 D（缺陷台账号）。
     多字母前缀会把**别的门禁**的编号带进 README 的对账范围（RD6 按前缀逐个比较）。 */
  const critTokenRe = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/g;
  const prefixes = [...new Set([...gateSrc.matchAll(critTokenRe)].map((m) => m[1]))];
  const foreign = prefixes.filter((p) => p !== "DCX" && !(p.length === 1 && p === "D"));
  if (foreign.length) {
    bad(
      `门禁源码里出现了别的门禁的判据编号前缀：${foreign.join("、")} —— ` +
        `会把别的门禁的编号带进 README 对账范围。`
    );
  } else {
    ok("门禁源码里的判据编号前缀只有 DCX（自己的）与 D（缺陷台账号，一位）");
  }

  /* DCX 前缀全仓唯一：否则 README 的 DCX 编号对账会同时算上别人的门禁。 */
  const scriptsDir = path.join(ROOT, "scripts");
  const dcxOwners = new Set();
  for (const f of fs.readdirSync(scriptsDir)) {
    if (!/^(check|verify)-.*\.cjs$/.test(f)) continue;
    const t = fs.readFileSync(path.join(scriptsDir, f), "utf8");
    for (const m of t.matchAll(critTokenRe)) {
      if (m[1] === "DCX") dcxOwners.add(f);
    }
  }
  const dcxList = [...dcxOwners].sort();
  if (dcxList.length !== 1 || dcxList[0] !== "check-design-components.cjs") {
    bad(`DCX 前缀不是全仓唯一：${dcxList.join("、") || "（没有）"} —— 别人的门禁也用 DCX 会让 README 对账算错`);
  } else {
    /* 措辞说明：这一行**刻意用中文开头** —— 它是收尾自检行、不是编号档，
       而行首若是 ASCII 单词（这里是 DCX），档位守卫（SF3）会要求它在静态清单里
       有出处（编号 / 锚点 / 显式非档位）。同块其余断言都是中文开头，
       这里保持一致，不去改共享静态清单。 */
    ok("判据前缀 DCX 全仓唯一（只有 check-design-components.cjs 在用）");
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
  const mirror = path.join(gateDir, "check-design-components.cjs");
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
  if (r.code !== 0 || !r.out.includes("设计系统组件清单契约门禁通过")) {
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

/* ---- 收尾：清掉临时目录 ---- */
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  /* 临时目录清不掉不影响判定（它是 /tmp 下的副本，不是仓库）。 */
}

console.log("");
if (failed) {
  console.log(`设计系统组件清单契约门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("设计系统组件清单契约门禁自测全部通过。");
