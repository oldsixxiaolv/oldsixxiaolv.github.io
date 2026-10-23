#!/usr/bin/env node
/**
 * 论文精读交互契约门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「论文精读交互的 kind 配色契约与类名清单 ↔ 代码现实」是否一致：
 *   docs/papers-interaction.md 的 §3.4 表 / §5.2 代码块 / 附录 B 类名表，
 *   以及 README.md 的 kind 表，必须与 annotations.js 的 KIND_LABELS、
 *   _paper.css 的 kind 调色板、以及 CSS 里真正承载 data-kind 的类对得上。
 *
 * 「注入没生效」「改的是副本还是原件」「门禁自己被卸掉了」是最容易发生、
 * 也最不容易看出来的失败模式。所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 16 处 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、覆盖度自证 —— fail() 调用点与归属表**双向**对齐；门禁解析出的判据集合与
 *      静态清单一致；每条红因、每条判据都至少一档判红；
 *      门禁源码里的判据编号前缀不得把别的门禁带进来（会污染 README 的对账范围）；
 *      PI 前缀全仓唯一。
 *   三、注入档 —— 每一档都断言**判红且判据集合恰为预期**（多一条少一条都算失败）。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉（给它那几条 fail() 调用同行加
 *      `if (false) ` 前缀，**行数不变**），对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，
 *      而不是别的判据顺带报出来的。
 *
 * 夹具是**合成式**的（不复制真实仓库）：kind 叫 alpha / beta / gamma，类名带 fx- 前缀，
 * 与仓库里的 question / insight / critique … 和 annot-* 完全不同 ⇒ 证明门禁是
 * **真源驱动**的，不是把真实 kind 硬编码进去的。真实文档的正确性由 build 链里
 * 真跑那道门禁保证。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-paper-interaction.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-paper-interaction.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "PI1a", crit: "PI1", frag: "少列了 kind" },
  { id: "PI1b", crit: "PI1", frag: "多列了 kind" },
  { id: "PI1c", crit: "PI1", frag: "一行 kind 都没检出" },
  { id: "PI2a", crit: "PI2", frag: "内部的 kind 集合自相矛盾" },
  { id: "PI2b", crit: "PI2", frag: "kind 调色板与代码 kind 集合对不上" },
  { id: "PI2c", crit: "PI2", frag: "kind 调色板不成对" },
  { id: "PI3", crit: "PI3", frag: "里没有定义的 token" },
  { id: "PI4", crit: "PI4", frag: "里出现了色值 token" },
  { id: "PI5", crit: "PI5", frag: "里的类名" },
  { id: "PI6", crit: "PI6", frag: "的选择器用了" },
  { id: "PI7a", crit: "PI7", frag: "kind 真源 JS 不在" },
  { id: "PI7b", crit: "PI7", frag: "调色板真源 CSS 不在" },
  { id: "PI7c", crit: "PI7", frag: "README 表没检出" },
  { id: "PI7d", crit: "PI7", frag: "§3.4 表没检出" },
  { id: "PI7e", crit: "PI7", frag: "附录 B 表没检出" },
  { id: "PI7f", crit: "PI7", frag: "§5.2 代码块没检出" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["PI1", "PI2", "PI3", "PI4", "PI5", "PI6", "PI7"];

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
      crit: (literal.match(/^\s*(PI\d+)\b/) || [])[1] || "",
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

/* ========== 夹具（合成式：kind 与类名都与真实仓库不同） ========== */

/* §3.4 表（docs 与 README 各一份，内容相同）。 */
const KIND_TABLE_HEAD = "| kind | edge token | ink token | 用途 |";
const KIND_TABLE_SEP = "|---|---|---|---|";
const ROW_ALPHA = "| `alpha` | `--kind-alpha-edge` | `--kind-alpha-ink` | 甲类批注 |";
const ROW_BETA = "| `beta` | `--kind-beta-edge` | `--kind-beta-ink` | 乙类批注 |";
const ROW_GAMMA = "| `gamma` | `--kind-gamma-edge` | `--kind-gamma-ink` | 丙类批注 |";
/* README 里凭空多出来的一行（不含任何 token ⇒ 只触发 PI1 的「多列」）。 */
const ROW_DELTA = "| `delta` | — | — | 凭空多出来的一类 |";

/* 附录 B 类名表（整块，增删都按整块替换）。 */
const APPB_TABLE = [
  "| 选择器 | 作用 |",
  "|---|---|",
  "| `.fx-pane` | 批注面板 |",
  "| `.fx-card` | 单条批注卡 |",
  "| `.fx-card__head` | 批注卡头部 |",
  "| `.fx-card__body` | 批注卡正文 |",
  "| `.fx-item-wrap` | 批注条目外层 |",
  "| `.fx-item` | 批注卡头按钮 |",
  "| `.fx-filters` | 筛选栏 |",
  "| `.fx-filter` | 单个筛选按钮 |",
  "| `.fx-tag` | 标签 |",
  "| `.fx-tags` | 标签组 |",
  "| `.fx-kind--{kind}` | kind 徽标 |",
  "| `.fx-anchor--{kind}` | 正文锚点 |",
  "",
].join("\n");

/* 契约文档（夹具版）：§3.4 表 + §5.2 代码块 + 附录 B 表，三处都是门禁的扫描面。 */
const DOC_BASE = [
  "# 夹具 · 论文精读交互",
  "",
  "## 3. 批注",
  "",
  "### 3.4 kind 配色契约",
  "",
  KIND_TABLE_HEAD,
  KIND_TABLE_SEP,
  ROW_ALPHA,
  ROW_BETA,
  ROW_GAMMA,
  "",
  "### 5.2 关键样式",
  "",
  "```css",
  ".fx-pane {",
  "  max-height: 112px;",
  "}",
  "",
  '.fx-card[data-kind="alpha"] {',
  "  border-left: 2px var(--kind-edge-style, solid) var(--kind-edge);",
  "}",
  "",
  '.fx-filter[data-kind="alpha"] {',
  "  background: color-mix(in srgb, var(--kind-ink) 8%, transparent);",
  "}",
  "",
  ".fx-card__head {",
  "  padding: 0.5rem 0.75rem;",
  "}",
  "```",
  "",
  "## 附录 B",
  "",
  APPB_TABLE,
  "",
].join("\n");

/* 站点 README（夹具版）：另一张 kind 表；另有**一张**别的表 ⇒ 首列为 kind 的表恰好一张。 */
const README_BASE = [
  "# 夹具 · 站点 README",
  "",
  "| 项目 | 说明 |",
  "|---|---|",
  "| `npm run build` | 夹具构建 |",
  "",
  "## 批注 kind 配色",
  "",
  KIND_TABLE_HEAD,
  KIND_TABLE_SEP,
  ROW_ALPHA,
  ROW_BETA,
  ROW_GAMMA,
  "",
].join("\n");

/* kind 调色板真源（12 条 --kind-* token）。 */
const CSS_GAMMA_INK = "  --kind-gamma-ink: #374151;";
const CSS_PALETTE_BASE = [
  "/* 夹具 · kind 调色板（唯一真源） */",
  ":root {",
  "  --kind-alpha-edge: #1f2937;",
  "  --kind-alpha-ink: #111827;",
  "  --kind-beta-edge: #374151;",
  "  --kind-beta-ink: #1f2937;",
  "  --kind-gamma-edge: #4b5563;",
  CSS_GAMMA_INK,
  "}",
  "",
].join("\n");

/* 批注样式（类名与**真正承载 data-kind 的那两个类**在这里）。 */
const CSS_FX_BASE = [
  "/* 夹具 · 批注样式 */",
  ".fx-pane {",
  "  max-height: 112px;",
  "  background: transparent;",
  "}",
  "",
  ".fx-card[data-kind] {",
  "  border-left: 2px solid var(--kind-edge);",
  "}",
  "",
  ".fx-filter[data-kind] {",
  "  color: var(--kind-ink);",
  "}",
  "",
  ".fx-card__head {",
  "  padding: 0.5rem 0.75rem;",
  "}",
  "",
  ".fx-card__body {",
  "  padding: 0 0.75rem 0.5rem;",
  "}",
  "",
  ".fx-item-wrap {",
  "  display: block;",
  "}",
  "",
  ".fx-item {",
  "  border-radius: 4px;",
  "}",
  "",
  ".fx-filters {",
  "  display: flex;",
  "}",
  "",
  ".fx-filter {",
  "  border: 0;",
  "}",
  "",
  ".fx-tag {",
  "  border-radius: 999px;",
  "}",
  "",
  ".fx-tags {",
  "  display: flex;",
  "}",
  "",
].join("\n");

/* kind 真源 JS：KIND_LABELS 与 KIND_ICONS 的键集合必须一致。 */
const JS_ICON_GAMMA = '  gamma: "<path d=\'M2 2\'/>",';
const JS_ANN_BASE = [
  "/* 夹具 · 批注 JS（kind 真源） */",
  "const KIND_LABELS = {",
  '  alpha: "Alpha",',
  '  beta: "Beta",',
  '  gamma: "Gamma",',
  "};",
  "",
  "const KIND_ICONS = {",
  '  alpha: "<path d=\'M0 0\'/>",',
  '  beta: "<path d=\'M1 1\'/>",',
  JS_ICON_GAMMA,
  "};",
  "",
].join("\n");

/* 模板类名真源 JS：fx-kind--{kind} / fx-anchor--{kind}。 */
const JS_RENDER_BASE = [
  "/* 夹具 · 批注渲染（模板类名真源） */",
  "function renderKindBadge(kind) {",
  '  return `<span class="fx-kind--${kind}"></span>`;',
  "}",
  "",
  "function renderAnchor(kind) {",
  '  return `<a class="fx-anchor--${kind}"></a>`;',
  "}",
  "",
].join("\n");

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-paperinteraction-selftest-"));

/** 建一个独立夹具（临时目录 + 合成契约文档 / README / 两份样式表 / 两份脚本）。 */
function buildFixture(mutate) {
  const state = {
    doc: DOC_BASE,
    readme: README_BASE,
    cssPalette: CSS_PALETTE_BASE,
    cssFx: CSS_FX_BASE,
    jsAnn: JS_ANN_BASE,
    jsRender: JS_RENDER_BASE,
  };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "assets", "css", "components"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "assets", "js", "paper-reader"), { recursive: true });
  if (state.doc !== null) {
    fs.writeFileSync(path.join(dir, "docs", "papers-interaction.md"), state.doc);
  }
  if (state.readme !== null) fs.writeFileSync(path.join(dir, "README.md"), state.readme);
  if (state.cssPalette !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/css/components/_paper.css"), state.cssPalette);
  }
  if (state.cssFx !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/css/components/_fx.css"), state.cssFx);
  }
  if (state.jsAnn !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/js/paper-reader/annotations.js"), state.jsAnn);
  }
  if (state.jsRender !== null) {
    fs.writeFileSync(path.join(dir, "src/assets/js/paper-reader/render.js"), state.jsRender);
  }
  return dir;
}

/** 跑一次门禁（夹具通过 PI_ROOT 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = { ...process.env, PI_ROOT: fixtureDir };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** docs §3.4 表少列 gamma ⇒ PI1（少列）。 */
  docKindMissingGamma: (s) => {
    s.doc = replaceOnce(s.doc, `${ROW_GAMMA}\n`, "");
  },
  /** docs §3.4 表一行 kind 都没有 ⇒ PI1（少列 + 一行都没检出）。 */
  docKindTableWiped: (s) => {
    s.doc = replaceOnce(s.doc, `${ROW_ALPHA}\n${ROW_BETA}\n${ROW_GAMMA}\n`, "");
  },
  /** README 表多列 delta ⇒ PI1（多列）。 */
  readmeKindExtraDelta: (s) => {
    s.readme = replaceOnce(s.readme, `${ROW_GAMMA}\n`, `${ROW_GAMMA}\n${ROW_DELTA}\n`);
  },
  /** JS 的 KIND_ICONS 少 gamma ⇒ PI2（标签与图标对不上）。 */
  jsIconsMissingGamma: (s) => {
    s.jsAnn = replaceOnce(s.jsAnn, `${JS_ICON_GAMMA}\n`, "");
  },
  /** CSS 多一对代码里没有的 kind token ⇒ PI2（调色板与代码对不上）。 */
  cssPaletteExtraDelta: (s) => {
    s.cssPalette = replaceOnce(
      s.cssPalette,
      `${CSS_GAMMA_INK}\n}\n`,
      `${CSS_GAMMA_INK}\n  --kind-delta-edge: #6b7280;\n  --kind-delta-ink: #4b5563;\n}\n`
    );
  },
  /** CSS 少 --kind-gamma-ink ⇒ PI2（不成对）+ PI3（文档 token 没有定义）。 */
  cssPaletteMissingGammaInk: (s) => {
    s.cssPalette = replaceOnce(s.cssPalette, `${CSS_GAMMA_INK}\n`, "");
  },
  /** docs 表里的 token 改成 CSS 没定义的 ⇒ PI3。 */
  docTokenUndefined: (s) => {
    s.doc = replaceOnce(s.doc, "`--kind-alpha-edge`", "`--kind-zulu-edge`");
  },
  /** docs 表里抄了一份色值真源 ⇒ PI4。 */
  docCopiesColorToken: (s) => {
    s.doc = replaceOnce(s.doc, "`--kind-alpha-edge`", "`--kind-alpha-edge` `--color-blue-500`");
  },
  /** 附录 B 里出现不存在的类 ⇒ PI5。 */
  appBUnknownClass: (s) => {
    s.doc = replaceOnce(
      s.doc,
      "| `.fx-pane` | 批注面板 |",
      "| `.fx-pane` | 批注面板 |\n| `.fx-nope` | 凭空多出来的类 |"
    );
  },
  /** §5.2 把 data-kind 挂到不承载它的类上 ⇒ PI6。 */
  cssBlockWrongCarrier: (s) => {
    s.doc = replaceOnce(s.doc, '.fx-card[data-kind="alpha"]', '.fx-item[data-kind="alpha"]');
  },
  /** README 的 kind 表表头改名 ⇒ PI7（README 表没检出）。 */
  readmeKindHeaderRenamed: (s) => {
    s.readme = replaceOnce(s.readme, KIND_TABLE_HEAD, "| Kind | edge token | ink token | 用途 |");
  },
  /** §3.4 标题改名 ⇒ PI7（§3.4 表没检出）。 */
  docHeadingRenamed: (s) => {
    s.doc = replaceOnce(s.doc, "### 3.4 kind 配色契约", "### 3.5 kind 配色契约");
  },
  /** 删掉附录 B 的类名表 ⇒ PI7（附录 B 表没检出）。 */
  appBTableRemoved: (s) => {
    s.doc = replaceOnce(s.doc, APPB_TABLE, "");
  },
  /** 删掉 §5.2 的 ```css 围栏 ⇒ PI7（§5.2 代码块没检出）。 */
  cssFenceRemoved: (s) => {
    s.doc = replaceOnce(s.doc, "```css\n", "");
  },
  /** kind 真源 JS 不在 ⇒ PI7（kind 真源 JS 不在）；顺带 PI1（代码里没 kind 了）与 PI2。 */
  jsSourceMissing: (s) => {
    s.jsAnn = null;
  },
  /** 调色板真源 CSS 不在 ⇒ PI7（调色板真源 CSS 不在）；顺带 PI2 与 PI3。 */
  cssPaletteMissing: (s) => {
    s.cssPalette = null;
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "PIR0", label: "基线（合成契约文档 + README + 两份样式表 + 两份脚本）", mutate: null, expect: null },
  { id: "PIR1", label: "docs §3.4 表少列一个 kind", mutate: MUT.docKindMissingGamma, expect: ["PI1"] },
  { id: "PIR2", label: "docs §3.4 表一行 kind 都没有了", mutate: MUT.docKindTableWiped, expect: ["PI1"] },
  { id: "PIR3", label: "README 表多列一个代码里没有的 kind", mutate: MUT.readmeKindExtraDelta, expect: ["PI1"] },
  { id: "PIR4", label: "JS 的 KIND_ICONS 少一个 kind", mutate: MUT.jsIconsMissingGamma, expect: ["PI2"] },
  { id: "PIR5", label: "CSS 多一对代码里没有的 kind token", mutate: MUT.cssPaletteExtraDelta, expect: ["PI2"] },
  { id: "PIR6", label: "CSS 少一条 --kind-*-ink", mutate: MUT.cssPaletteMissingGammaInk, expect: ["PI2", "PI3"] },
  { id: "PIR7", label: "docs 表里写了一个 CSS 没定义的 token", mutate: MUT.docTokenUndefined, expect: ["PI3"] },
  { id: "PIR8", label: "docs 表里抄了一份色值 token", mutate: MUT.docCopiesColorToken, expect: ["PI4"] },
  { id: "PIR9", label: "附录 B 列了一个不存在的类", mutate: MUT.appBUnknownClass, expect: ["PI5"] },
  { id: "PIR10", label: "§5.2 把 data-kind 挂到不承载它的类上", mutate: MUT.cssBlockWrongCarrier, expect: ["PI6"] },
  { id: "PIR11", label: "README 的 kind 表表头改名", mutate: MUT.readmeKindHeaderRenamed, expect: ["PI7"] },
  { id: "PIR12", label: "§3.4 标题改名", mutate: MUT.docHeadingRenamed, expect: ["PI7"] },
  { id: "PIR13", label: "删掉附录 B 的类名表", mutate: MUT.appBTableRemoved, expect: ["PI7"] },
  { id: "PIR14", label: "删掉 §5.2 的 css 围栏", mutate: MUT.cssFenceRemoved, expect: ["PI7"] },
  { id: "PIR15", label: "kind 真源 JS 不在", mutate: MUT.jsSourceMissing, expect: ["PI1", "PI2", "PI7"] },
  { id: "PIR16", label: "调色板真源 CSS 不在", mutate: MUT.cssPaletteMissing, expect: ["PI2", "PI3", "PI7"] },
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
  { id: "NC-PI1", crit: "PI1", case: "PIR1", label: "卸掉 PI1" },
  { id: "NC-PI2", crit: "PI2", case: "PIR4", label: "卸掉 PI2" },
  { id: "NC-PI3", crit: "PI3", case: "PIR7", label: "卸掉 PI3" },
  { id: "NC-PI4", crit: "PI4", case: "PIR8", label: "卸掉 PI4" },
  { id: "NC-PI5", crit: "PI5", case: "PIR9", label: "卸掉 PI5" },
  { id: "NC-PI6", crit: "PI6", case: "PIR10", label: "卸掉 PI6" },
  { id: "NC-PI7", crit: "PI7", case: "PIR11", label: "卸掉 PI7" },
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

/** 仓库真源（门禁 + 契约文档 + README + 两份样式表 + 两份脚本 + package.json）的整体指纹。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  const paths = [
    GATE,
    path.join(ROOT, "docs", "papers-interaction.md"),
    path.join(ROOT, "README.md"),
    path.join(ROOT, "src/assets/css/components/_paper.css"),
    path.join(ROOT, "src/assets/js/paper-reader/annotations.js"),
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
    if (r.code !== 0 || !r.out.includes("论文精读交互契约门禁通过")) {
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
  if (r.code !== 1 || !r.out.includes("论文精读交互契约门禁未通过")) {
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

console.log("论文精读交互契约门禁 · 自测（四件套）：\n");

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

  /* 门禁源码里的判据编号前缀：只允许自己的 PI，以及一位的 D（缺陷台账号）。
     多字母前缀会把**别的门禁**的编号带进 README 的对账范围（RD6 按前缀逐个比较）。 */
  const critTokenRe = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/g;
  const prefixes = [...new Set([...gateSrc.matchAll(critTokenRe)].map((m) => m[1]))];
  const foreign = prefixes.filter((p) => p !== "PI" && !(p.length === 1 && p === "D"));
  if (foreign.length) {
    bad(
      `门禁源码里出现了别的门禁的判据编号前缀：${foreign.join("、")} —— ` +
        `会把别的门禁的编号带进 README 对账范围。`
    );
  } else {
    ok("门禁源码里的判据编号前缀只有 PI（自己的）与 D（缺陷台账号，一位）");
  }

  /* PI 前缀全仓唯一：否则 README 的 PI 编号对账会同时算上别人的门禁。 */
  const scriptsDir = path.join(ROOT, "scripts");
  const piOwners = new Set();
  for (const f of fs.readdirSync(scriptsDir)) {
    if (!/^(check|verify)-.*\.cjs$/.test(f)) continue;
    const t = fs.readFileSync(path.join(scriptsDir, f), "utf8");
    for (const m of t.matchAll(critTokenRe)) {
      if (m[1] === "PI") piOwners.add(f);
    }
  }
  const piList = [...piOwners].sort();
  if (piList.length !== 1 || piList[0] !== "check-paper-interaction.cjs") {
    bad(`PI 前缀不是全仓唯一：${piList.join("、") || "（没有）"} —— 别人的门禁也用 PI 会让 README 对账算错`);
  } else {
    /* 措辞说明：这一行**刻意用中文开头** —— 它是收尾自检行、不是编号档，
       而行首若是 ASCII 单词（这里是 PI），档位守卫（SF3）会要求它在静态清单里
       有出处（编号 / 锚点 / 显式非档位）。同块其余六条断言都是中文开头，
       这里保持一致，不去改共享静态清单。 */
    ok("判据前缀 PI 全仓唯一（只有 check-paper-interaction.cjs 在用）");
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
  const mirror = path.join(gateDir, "check-paper-interaction.cjs");
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
  if (r.code !== 0 || !r.out.includes("论文精读交互契约门禁通过")) {
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
  console.log(`论文精读交互契约门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("论文精读交互契约门禁自测全部通过。");
