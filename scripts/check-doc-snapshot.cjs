#!/usr/bin/env node
/**
 * 文档快照门禁 —— 守住「每轮都会变的数量，不许写死在现状陈述里」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-20 的 D18 场次订正过两处会反复漂的快照数字，并把口径定成
 *   「**不含数字**的写法」（「全链门禁」而不是「27 步门禁」）——
 *   理由很实在：那个数字每加一道门禁就 +1，写进文档等于每轮都要再订正一次。
 *   **但那两处「现状陈述」本身没改到**，于是同一句话又漂回去了：
 *     · docs/ROADMAP.md §1 现状基线：「`npm run build` 共 27 步」——实测已是 40 段；
 *     · docs/DEFECT-BACKLOG.md §2 门禁链行：「27 步全绿」——同样过期。
 *   而「原则已定、没人守」正是本仓反复出现的那族病：
 *   **同一事实的两份副本，其中一份没人看守**（README、视觉规范那两轮都是这个形状）。
 *   这类漂移不会让站点变坏，只会让后来的人（包括 agent）按错的前提做决定。
 *
 * 判据：
 *   DS1 现状陈述不得写死会变的数量 —— 凡是**不是历史块**的段落里出现
 *      「数字 + 步」（例如「共 27 步」），判红，并逐条点名 `文件:行`。
 *      红因里给出「文档写的 M vs 实测 N 段」的对照。
 *   DS2 实测基准自证 —— 门禁自己要拿出「实测段数」这个基准，
 *      所以 package.json 必须能解析、`scripts.build` 必须存在且能数出段数。
 *      数不出来 ⇒ 门禁判不了 ⇒ 判红（不能装作已经核过）。
 *   DS3 现状段存在性 —— 承载「现状陈述」的两个小节必须存在、非空，
 *      且各自至少含 1 个**非历史**内容块。
 *      为什么还要「非历史」这一条：否则把整个小节标成历史块就能把 DS1 整体绕过。
 *   DS4 豁免机制与覆盖度自证 —— 两条子判据：
 *      (a) 扫到的 markdown 文件数 ≥ MIN_MD_FILES（扫描面被收窄 = 空跑风险）；
 *      (b) 至少识别出 1 个历史块（块内含 `**D<n>**`）。
 *      (b) 证明「历史保留、现状判红」这条分界**真的在生效**：
 *      豁免识别一旦坏掉（标记认不出来），历史块会全部涌进 DS1，
 *      这道门禁必须能自己发现这件事，而不是等下一轮人工察觉。
 *
 * ⚠️ 什么算「历史块」（豁免机制，刻意保守）：
 *   一个段落里只要出现形如 `**D18**` 的缺陷编号，就认为它是**那一场的记录**，
 *   按当时的真相写的，**原样保留**。改写历史记录就是伪造历史，
 *   所以历史块只能豁免，不能改。
 *   块切分规则：标题行、以 `- ` / `* ` / `+ ` / `|` 开头的行各自起新块，
 *   空行断块，其余行算上一块的续行。
 *   ⚠️ **已知洞（写在这里，别假装没有）**：现状陈述里如果顺带提到了缺陷编号，
 *   那一块也会被豁免。本仓目前没有这种写法，门禁也不去猜语义。
 *   ⚠️ docs/IMPROVEMENT-LOG.md 按**文件名**整体排除 ——
 *   那是纯历史日志（每一场次按当时的真相写），改写它就是伪造历史。
 *
 * 环境变量（供 scripts/test-doc-snapshot.cjs 的注入矩阵用）：
 *   DS_DOC_DIRS     —— 覆盖扫描目录（用 path.delimiter 分隔）。
 *   DS_PACKAGE_JSON —— 覆盖 package.json 的路径。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 扫描目录。默认是仓库根 + docs/（都不递归：_archive/、src/content/ 不是文档面）。 */
const DOC_DIRS = (
  process.env.DS_DOC_DIRS || [ROOT, path.join(ROOT, "docs")].join(path.delimiter)
)
  .split(path.delimiter)
  .filter(Boolean)
  .map((p) => path.resolve(p));
const PKG = process.env.DS_PACKAGE_JSON
  ? path.resolve(process.env.DS_PACKAGE_JSON)
  : path.join(ROOT, "package.json");

/** DS4(a) 的覆盖度下限：至少要扫到这么多个 markdown 文件，这道门禁才算真在检查。 */
const MIN_MD_FILES = 10;
/** DS4(b) 的下限：至少要认出这么多历史块，才说明豁免机制在生效。 */
const MIN_HISTORY_BLOCKS = 1;

/** 「数字 + 步」—— 现状陈述里出现它就判红（DS1）。 */
const COUNT_STEP_RE = /\d+\s*步/;
/** 缺陷编号标记：`**D18**` 这种形状。块内出现它 ⇒ 历史块（豁免）。 */
const HISTORY_MARK_RE = /\*\*D\d+\*\*/;

/** 按文件名整体排除的文件（纯历史记录，不改写）。 */
const EXCLUDED_BASENAMES = new Set(["IMPROVEMENT-LOG.md"]);

/** DS3 要求存在的两个「现状陈述」小节：文件 → 标题行前缀。 */
const REQUIRED_SECTIONS = [
  { file: "ROADMAP.md", heading: /^##\s+1\./, label: "§1 现状基线" },
  { file: "DEFECT-BACKLOG.md", heading: /^##\s+2\./, label: "§2 本轮已核查、判定无缺陷" },
];

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/** 列出目录下的 markdown 文件（不递归；排除 AppleDouble `._*` 与历史日志）。 */
function listMd(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => e.name)
    .filter((name) => !name.startsWith("._") && !EXCLUDED_BASENAMES.has(name))
    .sort()
    .map((name) => ({ name, path: path.join(dir, name), dir }));
}

/** 这一行是否起一个新块。
 *  ⚠️ 列表项只认**顶格**的（`- ` / `* ` / `+ ` 出现在第 1 列）：
 *   本仓的写法是「顶层列表项顶格 + 续行缩进 2 空格」，而续行里也常见
 *   `  + 自测 …` 这种以 `+ ` 开头的行 —— 那是**续行**，不是新的一项。
 *   实测（2026-10-20）：按「缩进也算列表项」切块时，ROADMAP 的 D18 那一段会被
 *   从中间截断，后半段拿不到 `**D18**` 标记 ⇒ 历史块被误当成现状判红。
 *   缩进的子项在语义上属于父项，归进父块反而是对的。 */
function startsNewBlock(line) {
  return (
    /^\s{0,3}#{1,6}\s/.test(line) || // 标题
    /^[-*+]\s/.test(line) || // 顶格无序列表项（`**D1**` 不会误判：* 后面不是空白）
    /^\s*\|/.test(line) // 表格行
  );
}

/** 把一个文件切成块。空行断块；标题/列表/表格行起新块；其余算续行。 */
function splitBlocks(text) {
  const lines = text.split("\n");
  const blocks = [];
  let cur = null;
  lines.forEach((raw, i) => {
    const line = raw.replace(/\r$/, "");
    if (line.trim() === "") {
      cur = null;
      return;
    }
    if (cur === null || startsNewBlock(line)) {
      cur = { start: i + 1, lines: [] };
      blocks.push(cur);
    }
    cur.lines.push({ no: i + 1, text: line });
  });
  return blocks.map((b) => ({
    start: b.start,
    text: b.lines.map((l) => l.text).join("\n"),
    isHeading: /^#{1,6}\s/.test(b.lines[0].text.trim()),
    isHistory: HISTORY_MARK_RE.test(b.lines.map((l) => l.text).join("\n")),
  }));
}

/** 文件名 → 扫描到的文件对象（同名只留一份）。 */
const byName = new Map();

/* ---------------- 扫描 ---------------- */

const files = [];
for (const dir of DOC_DIRS) files.push(...listMd(dir));
const seen = new Set();
const scanned = files.filter((f) => {
  if (seen.has(f.path)) return false;
  seen.add(f.path);
  return true;
});
for (const f of scanned) if (!byName.has(f.name)) byName.set(f.name, f);

/** 所有块（带文件归属）。 */
const allBlocks = [];
for (const f of scanned) {
  const text = fs.readFileSync(f.path, "utf8");
  for (const b of splitBlocks(text)) allBlocks.push({ file: f, block: b });
}
const historyBlocks = allBlocks.filter((x) => x.block.isHistory);

/* ---------------- DS2：实测基准自证 ---------------- */

let buildSegments = 0;
let buildCmd = "";
if (!fs.existsSync(PKG)) {
  fail(`DS2 找不到 ${PKG} —— 门禁自己要先数出 build 链的段数（这是它判红的依据），读不到就没法判。`);
} else {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail(`DS2 ${PKG} 解析失败：${e.message} —— 门禁自己要先数出 build 链的段数，读不懂就没法判。`);
  }
  if (pkg) {
    buildCmd = (pkg.scripts && pkg.scripts.build) || "";
    if (typeof buildCmd !== "string" || !buildCmd.trim()) {
      fail(`DS2 ${PKG} 里没有可用的 scripts.build —— 门禁要靠它数出「实测段数」，没有它就判不了。`);
    } else {
      buildSegments = buildCmd
        .split("&&")
        .map((s) => s.trim())
        .filter(Boolean).length;
      if (buildSegments < 1) {
        fail(`DS2 scripts.build 数不出任何段（${PKG}）—— 门禁的实测基准是空的，等于没基准。`);
      }
    }
  }
}

/* ---------------- DS1：现状陈述不得写死会变的数量 ---------------- */

for (const { file, block } of allBlocks) {
  if (block.isHistory) continue; // 历史块：原样保留，不判
  const lines = block.text.split("\n");
  lines.forEach((line, i) => {
    const m = line.match(COUNT_STEP_RE);
    if (!m) return;
    const rel = path.relative(ROOT, file.path);
    const where = `${rel.startsWith("..") ? file.path : rel}:${block.start + i}`;
    fail(
      `DS1 ${where} 现状陈述里写死了「${m[0]}」—— ` +
        `build 链实测 ${buildSegments} 段，而这个数字**每加一道门禁就变**，写进文档等于每轮都要再订正一次。` +
        `请改成不含数字的写法（如「全链门禁」），并在需要时指向门禁的现场实测。\n` +
        `      该行：${line.trim().slice(0, 160)}`
    );
  });
}

/* ---------------- DS3：现状段存在性 ---------------- */

for (const req of REQUIRED_SECTIONS) {
  const file = byName.get(req.file);
  if (!file) {
    fail(`DS3 扫描范围里没有 ${req.file} —— 这道门禁盯的就是它里面的现状陈述，读不到就等于没盯。`);
    continue;
  }
  const text = fs.readFileSync(file.path, "utf8");
  const lines = text.split("\n");
  const headIdx = lines.findIndex((l) => req.heading.test(l));
  if (headIdx < 0) {
    fail(
      `DS3 ${req.file} 里找不到「${req.label}」这一节 —— ` +
        `现状陈述被删掉或改了标题，门禁就失去了判读对象（请保留这一节，或同步改门禁的判读点）。`
    );
    continue;
  }
  /* 小节范围：从标题行到下一个同级或更高级标题为止。 */
  let end = lines.length;
  for (let i = headIdx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const sectionBlocks = splitBlocks(lines.slice(headIdx + 1, end).join("\n"));
  const contentBlocks = sectionBlocks.filter((b) => !b.isHeading);
  if (!contentBlocks.length) {
    fail(`DS3 ${req.file} 的「${req.label}」是空的 —— 现状陈述不能被删空（删空了门禁就无从核对）。`);
    continue;
  }
  if (!contentBlocks.some((b) => !b.isHistory)) {
    fail(
      `DS3 ${req.file} 的「${req.label}」里每一块都被标成了历史块（含 \`**D<n>**\`）—— ` +
        `那等于把现状陈述整体豁免掉了，DS1 会对这一节完全失明。请至少留一块非历史的内容块。`
    );
  }
}

/* ---------------- DS4：豁免机制与覆盖度自证 ---------------- */

if (scanned.length < MIN_MD_FILES) {
  fail(
    `DS4 只扫到 ${scanned.length} 个 markdown 文件（要求至少 ${MIN_MD_FILES} 个）—— ` +
      `扫描面被收窄了，这道门禁已经看不到大部分活文档，等于没在检查。`
  );
}
if (historyBlocks.length < MIN_HISTORY_BLOCKS) {
  fail(
    `DS4 一个历史块都没认出（要求至少 ${MIN_HISTORY_BLOCKS} 个）—— ` +
      `豁免机制（块内含 \`**D<n>**\` 即视为历史、保留原样）已经失灵：` +
      `要么标记写法变了，要么识别逻辑坏了。失灵的后果是历史记录会被当成现状判红。`
  );
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("文档快照门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(`  判据出处：docs/DEFECT-BACKLOG.md D22（build 链的段数每轮都变，现状陈述里不该写死它）。`);
  console.error("");
  process.exit(1);
}

console.log(
  `文档快照门禁通过：${scanned.length} 个 markdown 文件、${allBlocks.length} 个段落` +
    `（其中 ${historyBlocks.length} 个历史块按原样保留），现状陈述里没有写死的 build 链步数。`
);
console.log(
  `  · build 链实测 ${buildSegments} 段 —— 这个数每轮都变，文档里不该写它；门禁自己持有这个数。`
);
