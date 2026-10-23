#!/usr/bin/env node
/**
 * 自测 TBLR0–TBLR19：给 scripts/check-markdown-tables.cjs 的每条判据找一次「它会红」的证据
 *
 * 为什么要有这个自测（2026-10-23 的 D86）：
 *   这道门禁守的是「文档里的每一张 Markdown 表格都真的是一张表」。
 *   而「门禁是绿的」有两种可能：① 它真的没问题；② 它的判据从来没被真正执行过。
 *   这两件事长得一模一样。所以每条判据都要有一档**注入**证明它会红，
 *   再有一档**负对照**证明「卸掉那一步之后确实就绿了」——
 *   否则红可能来自别处。
 *
 * 做法（全在临时目录的副本上，仓库里的原件一个字节都不动）：
 *   造一个**最小夹具文档集**（不依赖真仓库的文档 —— 真文档每轮都在变，
 *   拿它当基准会让自测跟着文档抖）：
 *     <tmp>/scripts/check-markdown-tables.cjs  门禁副本（负对照要改它的 fail 调用）
 *     <tmp>/package.json                          build 链里必须有本门禁（TBL4 看这个）
 *     <tmp>/docs/a.md                             一张 3 格的正常表
 *     <tmp>/docs/b.md                             一张 2 格的正常表
 *     <tmp>/docs/c.md                             一份没有表格的普通文档
 *   门禁的扫描面用环境变量 TBL_DOC_DIRS 指到 <tmp>/docs；
 *   它的 ROOT 是「自己所在目录的上一级」，所以副本里的它天然指向副本里的文档。
 *
 *   ⚠️ 夹具里**不出现任何真实仓库的表格内容**（文件名 / 单元格文字都用 fixture-* 命名）
 *     —— 否则门禁 / 自测源码自己就成了「文档里有这张表」的证据，自证会假绿。
 *   ⚠️ 夹具的规模**刚好卡在覆盖度下限上**（3 个 md / 2 张表 / 5 行数据），
 *     所以注入档只红它该红的那条判据，覆盖度判据（TBL3）不会连坐。
 *
 * 档位（9 档注入 ＋ 4 档绿档 ＋ 5 档判据级负对照 ＋ 1 档覆盖度自证 ＋ 1 档基线）：
 *   TBLR0  基线绿
 *   TBLR1  表格被空行截断（空行后还有数据行）                    ⇒ TBL1
 *   TBLR2  行内代码 span 里含裸竖线                              ⇒ TBL2
 *   TBLR3  行尾多一个竖线（多一格）                              ⇒ TBL2
 *   TBLR4  少一格                                                ⇒ TBL2
 *   TBLR5  markdown 文件一个都不剩                                ⇒ TBL3（覆盖度自证）
 *   TBLR6  文件都在但表全没了                                    ⇒ TBL3（覆盖度自证）
 *   TBLR7  门禁自己被卸掉（build 链里不叫它了）                   ⇒ TBL4
 *   TBLR8  代码围栏里的破格表 ⇒ 放行（绿）
 *   TBLR9  空行后是**另一张带表头的新表** ⇒ 放行（绿）
 *   TBLR10 引用块里的表格 ⇒ 放行（绿）
 *   TBLR11 已经转义过的竖线 ⇒ 放行（绿）
 *   TBLR12 负对照：卸掉 TBL1 ⇒ TBLR1 的注入必须转绿
 *   TBLR13 负对照：卸掉 TBL2 ⇒ TBLR2–TBLR4 的注入必须全部转绿
 *   TBLR14 负对照：卸掉 TBL3 ⇒ TBLR5–TBLR6 的注入必须全部转绿
 *   TBLR15 负对照：卸掉 TBL4 ⇒ TBLR7 的注入必须转绿
 *   TBLR16 覆盖度自证档：基线上门禁**确实认出**了 ≥2 张表、≥5 行数据
 *   TBLR17 表头格数 ≠ 分隔行格数（这一块从来就不是一张表）      ⇒ TBL5
 *   TBLR18 分隔行里有一格没有连字符（同样不是一张表）            ⇒ TBL5
 *   TBLR19 负对照：卸掉 TBL5 ⇒ TBLR17–TBLR18 的注入必须全部转绿
 *
 * ⚠️ 每档都断言「红因编号集合**完全相等**」，不只是「包含期望的那条」——
 *   一档里出现两条判据的红，红因归属就不可判定了（那是脚本的缺陷，不是产品的缺陷）。
 *   TBLR12–TBLR15 / TBLR19 这五档负对照正是「归属纯净」的守门人：
 *   卸掉 TBL1 之后 TBLR1 若还红，说明是别的判据越界管了截断 ⇒ 立刻暴露。
 *
 * ⚠️ 负对照**不给门禁加开关**（加了开关就等于在门禁里留一个「可卸闸门」）——
 *   做法是：把门禁源码**复制到 tmp**，再在副本里把该判据的 fail 调用**同行替换**成
 *   `if (false) fail(...)`。行数不变、差异行数 == 该判据的 fail 调用点数 ⇒ 可核对。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE_SRC = path.join(ROOT, "scripts", "check-markdown-tables.cjs");
const GATE_NAME = "check-markdown-tables.cjs";

/* ================= 夹具文档 ================= */

const DOC_A = [
  "# 合成夹具 A",
  "",
  "| 名称 | 数量 | 说明 |",
  "|---|---|---|",
  "| fixture-one | 1 | 第一行 |",
  "| fixture-two | 2 | 第二行 |",
  "| fixture-three | 3 | 第三行 |",
  "",
].join("\n");

const DOC_B = [
  "# 合成夹具 B",
  "",
  "| 判据 | 内容 |",
  "|---|---|",
  "| fixture-alpha | 一条 |",
  "| fixture-beta | 两条 |",
  "",
].join("\n");

const DOC_C = ["# 合成夹具 C", "", "这一份文档里没有任何表格。", ""].join("\n");

/* TBL5 的两个子形态夹具：表头与分隔行**配不成一张表** ⇒ GFM 整块渲染成一个段落。
   ① 表头 3 格 / 分隔行 2 格；② 分隔行中间那格没有连字符。 */
const DOC_B_CELL_MISMATCH = [
  "# 合成夹具 B",
  "",
  "| 判据 | 内容 | 备注 |",
  "|---|---|",
  "| fixture-alpha | 一条 | 备注一 |",
  "| fixture-beta | 两条 | 备注二 |",
  "",
].join("\n");

const DOC_B_SEP_NO_HYPHEN = [
  "# 合成夹具 B",
  "",
  "| 判据 | 内容 | 备注 |",
  "|---| |---|",
  "| fixture-alpha | 一条 | 备注一 |",
  "| fixture-beta | 两条 | 备注二 |",
  "",
].join("\n");

/* ================= 沙箱 ================= */

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** 造一个夹具沙箱：门禁副本 + package.json + 三份合成文档。 */
function makeSandbox(docs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-tbl-"));
  fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
  fs.copyFileSync(GATE_SRC, path.join(dir, "scripts", GATE_NAME));
  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture-tbl",
        private: true,
        scripts: {
          build: "npm run check:markdown-tables",
          "check:markdown-tables": `node scripts/${GATE_NAME}`,
        },
      },
      null,
      2
    ) + "\n"
  );
  const map = docs || { "a.md": DOC_A, "b.md": DOC_B, "c.md": DOC_C };
  for (const [name, content] of Object.entries(map)) {
    write(path.join(dir, "docs", name), content);
  }
  return dir;
}

/* ================= 跑门禁 / 解析红因 ================= */

/** 跑副本里的门禁，返回 { code, out }。 */
function runGate(dir) {
  try {
    const out = execFileSync(
      process.execPath,
      [path.join(dir, "scripts", GATE_NAME)],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: Object.assign({}, process.env, { TBL_DOC_DIRS: path.join(dir, "docs") }),
      }
    );
    return { code: 0, out };
  } catch (e) {
    return {
      code: typeof e.status === "number" ? e.status : 1,
      out: `${e.stdout || ""}${e.stderr || ""}`,
    };
  }
}

/** 红因编号集合（只认行首的「· TBLn：」，消息正文里出现的字样不算）。 */
function redIds(out) {
  const ids = new Set();
  const re = /^[ \t]*·[ \t]*(TBL\d+)[ \t]*：/gm;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return ids;
}

function sameSet(got, want) {
  if (got.size !== want.length) return false;
  return want.every((x) => got.has(x));
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/**
 * 把副本里的某条判据**卸掉**：把该判据的每个 fail 调用**同行替换**成
 * `if (false) fail(...)`。行数不变；返回改动的行数。
 * ⚠️ 不给门禁加开关 —— 加了开关等于在门禁里留一个「可卸闸门」。
 */
function disableCriterion(dir, crit) {
  const file = path.join(dir, "scripts", GATE_NAME);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const targets = new Set();
  lines.forEach((line, i) => {
    if (!line.includes(`"${crit}"`)) return;
    for (let j = i; j >= 0 && j >= i - 3; j--) {
      if (/\bfail\(/.test(lines[j])) {
        targets.add(j);
        break;
      }
    }
  });
  if (!targets.size) {
    throw new Error(`门禁副本里找不到判据 ${crit} 的 fail 调用 —— 负对照无法成立，已中止。`);
  }
  const out = lines.slice();
  for (const j of targets) {
    out[j] = out[j].replace(/\bfail\(/, "if (false) fail(");
  }
  fs.writeFileSync(file, out.join("\n"));
  return { changed: targets.size, linesBefore: lines.length, linesAfter: out.length };
}

/* ================= 记档 ================= */

const results = [];
function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/* 追加的自证结论（**不是档位**）：行首刻意用中文 ——
   档位守卫（SF3）只对「行首是 ASCII 单词」的标记行要求出处，
   中文开头天然不在它的视野里，也就不必去动共享静态清单。 */
const extraChecks = [];
function note(msg) {
  console.log(`  ✓ ${msg}`);
}
function noteFail(msg) {
  extraChecks.push(msg);
  console.log(`  ✗ ${msg}`);
}

/** 一档「注入 ⇒ 应当恰好红这么几条判据」。期望集合必须**完全相等**。 */
function expectRed(id, dir, want, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 1 && sameSet(got, want);
  record(
    id,
    ok,
    ok
      ? `红了，红因编号 = ${fmtIds(got)}（归属纯净）${note ? "；" + note : ""}`
      : `期望红因 ${fmtIds(new Set(want))} 且只有这些，实际 code=${r.code} 红因 ${fmtIds(got)}\n${r.out}`
  );
}

/** 一档「应当完全绿，一个红因都不许剩」。 */
function expectGreen(id, dir, note) {
  const r = runGate(dir);
  const got = redIds(r.out);
  const ok = r.code === 0 && got.size === 0;
  record(
    id,
    ok,
    ok
      ? `绿了，红因一个不剩${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(got)}\n${r.out}`
  );
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/* ================= TBLR0：基线（绿） ================= */

{
  const dir = makeSandbox();
  expectGreen("TBLR0 基线（夹具文档集上）", dir, "正常表格不误伤");
  cleanup(dir);
}

/* ================= 注入档 TBLR1：TBL1（表格被空行截断） ================= */

{
  const dir = makeSandbox({
    "a.md": [
      "# 合成夹具 A",
      "",
      "| 名称 | 数量 | 说明 |",
      "|---|---|---|",
      "| fixture-one | 1 | 第一行 |",
      "",
      "| fixture-two | 2 | 第二行 |",
      "",
    ].join("\n"),
    "b.md": DOC_B,
    "c.md": DOC_C,
  });
  expectRed("TBLR1 表格被空行截断", dir, ["TBL1"], "空行之后的数据行会退化成段落");
  cleanup(dir);
}

/* ================= 注入档 TBLR2–TBLR4：TBL2（行被竖线切碎） ================= */

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha | 一条 `a|b` 说明 |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    "c.md": DOC_C,
  });
  expectRed("TBLR2 行内代码 span 含裸竖线", dir, ["TBL2"], "代码 span 里的竖线同样会切格子");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha | 一条 |  |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    "c.md": DOC_C,
  });
  expectRed("TBLR3 行尾多一个竖线", dir, ["TBL2"], "多一格");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    "c.md": DOC_C,
  });
  expectRed("TBLR4 少一格", dir, ["TBL2"], "少一格");
  cleanup(dir);
}

/* ================= 注入档 TBLR5–TBLR6：TBL3（覆盖度自证） ================= */

{
  const dir = makeSandbox({});
  expectRed("TBLR5 markdown 文件一个不剩", dir, ["TBL3"], "扫描面被改空了");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": "# 合成夹具 A\n\n这一份里没有表格。\n",
    "b.md": "# 合成夹具 B\n\n这一份里也没有表格。\n",
    "c.md": DOC_C,
  });
  expectRed("TBLR6 文件都在但表全没了", dir, ["TBL3"], "表识别器坏了或表被删光");
  cleanup(dir);
}

/* ================= 注入档 TBLR7：TBL4（门禁自己没被卸掉） ================= */

{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture-tbl",
        private: true,
        scripts: {
          build: "npm run check:something-else",
          "check:something-else": "node scripts/other.cjs",
          "check:markdown-tables": `node scripts/${GATE_NAME}`,
        },
      },
      null,
      2
    ) + "\n"
  );
  expectRed("TBLR7 门禁自己被卸掉", dir, ["TBL4"], "build 链里不再有本门禁");
  cleanup(dir);
}

/* ================= 绿档 TBLR8–TBLR11：不该误报 ================= */

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": DOC_B,
    "c.md": [
      "# 合成夹具 C",
      "",
      "下面是**代码围栏**里的表格示例（围栏里的内容不参与判定）：",
      "",
      "```markdown",
      "| 名称 | 数量 |",
      "|---|---|",
      "| fixture-x | `a|b` |",
      "```",
      "",
    ].join("\n"),
  });
  expectGreen("TBLR8 代码围栏里的破格表", dir, "围栏内的示例不算文档结构");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": [
      "# 合成夹具 A",
      "",
      "| 名称 | 数量 | 说明 |",
      "|---|---|---|",
      "| fixture-one | 1 | 第一行 |",
      "",
      "| 名称 | 数量 |",
      "|---|---|",
      "| fixture-two | 2 |",
      "",
    ].join("\n"),
    "b.md": DOC_B,
    "c.md": DOC_C,
  });
  expectGreen("TBLR9 空行后是另一张带表头的新表", dir, "两张独立的表是合法的");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": DOC_B,
    "c.md": [
      "# 合成夹具 C",
      "",
      "> 引用块里的表格不参与判定：",
      ">",
      "> | 名称 | 数量 |",
      "> |---|---|",
      "> | fixture-x | `a|b` |",
      "",
    ].join("\n"),
  });
  expectGreen("TBLR10 引用块里的表格", dir, "引用块不参与判定");
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha | 一条 `a\\|b` 说明 |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    "c.md": DOC_C,
  });
  expectGreen("TBLR11 已经转义过的竖线", dir, "转义写法不误报");
  cleanup(dir);
}

/* ================= 负对照 TBLR12–TBLR15 ================= */

/* TBLR12：卸掉 TBL1 ⇒ TBLR1 的夹具必须转绿。 */
{
  const dir = makeSandbox({
    "a.md": [
      "# 合成夹具 A",
      "",
      "| 名称 | 数量 | 说明 |",
      "|---|---|---|",
      "| fixture-one | 1 | 第一行 |",
      "",
      "| fixture-two | 2 | 第二行 |",
      "",
    ].join("\n"),
    "b.md": DOC_B,
    "c.md": DOC_C,
  });
  const info = disableCriterion(dir, "TBL1");
  const ok =
    info.changed === 1 &&
    info.linesBefore === info.linesAfter &&
    runGate(dir).code === 0 &&
    redIds(runGate(dir).out).size === 0;
  record(
    "TBLR12 负对照：卸掉 TBL1",
    ok,
    ok
      ? `改了 ${info.changed} 行（行数不变 ${info.linesBefore} → ${info.linesAfter}），` +
        `同一夹具转绿 ⇒ 那条红确实是 TBL1 判出来的`
      : `卸掉 TBL1 之后夹具仍红（改动 ${info.changed} 行）⇒ 归属不纯净`
  );
  cleanup(dir);
}

/* TBLR13：卸掉 TBL2 ⇒ TBLR2–TBLR4 三个夹具必须全部转绿。 */
{
  const cases = [
    [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha | 一条 `a|b` 说明 |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha | 一条 |  |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
    [
      "# 合成夹具 B",
      "",
      "| 判据 | 内容 |",
      "|---|---|",
      "| fixture-alpha |",
      "| fixture-beta | 两条 |",
      "",
    ].join("\n"),
  ];
  let changed = 0;
  let linesOk = true;
  let allGreen = true;
  for (const b of cases) {
    const dir = makeSandbox({ "a.md": DOC_A, "b.md": b, "c.md": DOC_C });
    const info = disableCriterion(dir, "TBL2");
    changed = info.changed;
    if (info.linesBefore !== info.linesAfter) linesOk = false;
    const r = runGate(dir);
    if (r.code !== 0 || redIds(r.out).size !== 0) allGreen = false;
    cleanup(dir);
  }
  const ok = changed === 1 && linesOk && allGreen;
  record(
    "TBLR13 负对照：卸掉 TBL2",
    ok,
    ok
      ? `改了 ${changed} 行（行数不变），三档注入全部转绿 ⇒ 那三条红确实是 TBL2 判出来的`
      : `卸掉 TBL2 之后仍有夹具红（改动 ${changed} 行 / 行数不变 ${linesOk} / 全绿 ${allGreen}）`
  );
}

/* TBLR14：卸掉 TBL3 ⇒ TBLR5–TBLR6 两个夹具必须全部转绿。 */
{
  const cases = [
    {},
    {
      "a.md": "# 合成夹具 A\n\n这一份里没有表格。\n",
      "b.md": "# 合成夹具 B\n\n这一份里也没有表格。\n",
      "c.md": DOC_C,
    },
  ];
  let changed = 0;
  let linesOk = true;
  let allGreen = true;
  for (const map of cases) {
    const dir = makeSandbox(map);
    const info = disableCriterion(dir, "TBL3");
    changed = info.changed;
    if (info.linesBefore !== info.linesAfter) linesOk = false;
    const r = runGate(dir);
    if (r.code !== 0 || redIds(r.out).size !== 0) allGreen = false;
    cleanup(dir);
  }
  const ok = changed === 3 && linesOk && allGreen;
  record(
    "TBLR14 负对照：卸掉 TBL3",
    ok,
    ok
      ? `改了 ${changed} 行（行数不变），两档注入全部转绿 ⇒ 那两条红确实是 TBL3 判出来的`
      : `卸掉 TBL3 之后仍有夹具红（改动 ${changed} 行，应为 3 / 行数不变 ${linesOk} / 全绿 ${allGreen}）`
  );
}

/* TBLR15：卸掉 TBL4 ⇒ TBLR7 的夹具必须转绿。 */
{
  const dir = makeSandbox();
  write(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture-tbl",
        private: true,
        scripts: {
          build: "npm run check:something-else",
          "check:something-else": "node scripts/other.cjs",
          "check:markdown-tables": `node scripts/${GATE_NAME}`,
        },
      },
      null,
      2
    ) + "\n"
  );
  const info = disableCriterion(dir, "TBL4");
  const r = runGate(dir);
  const ok =
    info.changed === 2 &&
    info.linesBefore === info.linesAfter &&
    r.code === 0 &&
    redIds(r.out).size === 0;
  record(
    "TBLR15 负对照：卸掉 TBL4",
    ok,
    ok
      ? `改了 ${info.changed} 行（行数不变 ${info.linesBefore} → ${info.linesAfter}），` +
        `同一夹具转绿 ⇒ 那条红确实是 TBL4 判出来的`
      : `卸掉 TBL4 之后夹具仍红（改动 ${info.changed} 行，应为 2）`
  );
  cleanup(dir);
}

/* ================= TBLR16：覆盖度自证档 ================= */

{
  const dir = makeSandbox();
  const r = runGate(dir);
  const ok =
    r.code === 0 &&
    /扫描 3 个 markdown 文件、2 张表、5 行数据/.test(r.out);
  record(
    "TBLR16 覆盖度自证档",
    ok,
    ok
      ? "门禁在基线上确实认出了 3 个文件 / 2 张表 / 5 行数据"
      : `门禁的通过信息里没认出应有的规模：\n${r.out}`
  );

  /* 编号前缀自证（与信息架构 / 设计组件 / 论文交互三道自测同一口径）：
     ① 门禁源码里的判据编号前缀只允许自己的 TBL 与一位的 D（缺陷台账号）——
        别的门禁的编号（文档快照、挂载契约那一类）会被 README 的对账按前缀逐个比较时算进来；
     ② TBL 前缀全仓唯一 —— 否则 README 的 TBL 编号对账会同时算上别人的门禁。 */
  const critTokenRe = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/g;
  const gateSrc = fs.readFileSync(GATE_SRC, "utf8");
  const prefixes = [...new Set([...gateSrc.matchAll(critTokenRe)].map((m) => m[1]))];
  const foreign = prefixes.filter((p) => p !== "TBL" && !(p.length === 1 && p === "D"));
  if (foreign.length) {
    noteFail(`门禁源码里出现了别的门禁的判据编号前缀：${foreign.join("、")}`);
  } else {
    note("门禁源码里的判据编号前缀只有 TBL（自己的）与 D（缺陷台账号，一位）");
  }

  const scriptsDir = path.join(ROOT, "scripts");
  const tblOwners = new Set();
  for (const f of fs.readdirSync(scriptsDir)) {
    if (!/^(check|verify)-.*\.cjs$/.test(f)) continue;
    const t = fs.readFileSync(path.join(scriptsDir, f), "utf8");
    for (const m of t.matchAll(critTokenRe)) {
      if (m[1] === "TBL") tblOwners.add(f);
    }
  }
  const tblList = [...tblOwners].sort();
  if (tblList.length !== 1 || tblList[0] !== "check-markdown-tables.cjs") {
    noteFail(
      `TBL 前缀不是全仓唯一：${tblList.join("、") || "（没有）"} —— 别人的门禁也用 TBL 会让 README 对账算错`
    );
  } else {
    note("判据前缀 TBL 全仓唯一（只有 check-markdown-tables.cjs 在用）");
  }
  cleanup(dir);
}

/* ================= 注入档 TBLR17–TBLR18：TBL5（这一块从来就不是一张表） ================= */

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": DOC_B_CELL_MISMATCH,
    "c.md": DOC_C,
  });
  expectRed(
    "TBLR17 表头格数与分隔行格数不相等",
    dir,
    ["TBL5"],
    "GFM 认不出这张表 ⇒ 整块退化成带字面竖线的段落"
  );
  cleanup(dir);
}

{
  const dir = makeSandbox({
    "a.md": DOC_A,
    "b.md": DOC_B_SEP_NO_HYPHEN,
    "c.md": DOC_C,
  });
  expectRed(
    "TBLR18 分隔行有一格没有连字符",
    dir,
    ["TBL5"],
    "分隔行不合法 ⇒ 同样整块不是表"
  );
  cleanup(dir);
}

/* ================= 负对照 TBLR19：卸掉 TBL5 ⇒ TBLR17–TBLR18 必须全部转绿 ================= */

{
  let changed = 0;
  let linesOk = true;
  let allGreen = true;
  for (const b of [DOC_B_CELL_MISMATCH, DOC_B_SEP_NO_HYPHEN]) {
    const dir = makeSandbox({ "a.md": DOC_A, "b.md": b, "c.md": DOC_C });
    const info = disableCriterion(dir, "TBL5");
    changed = info.changed;
    if (info.linesBefore !== info.linesAfter) linesOk = false;
    const r = runGate(dir);
    if (r.code !== 0 || redIds(r.out).size !== 0) allGreen = false;
    cleanup(dir);
  }
  const ok = changed === 2 && linesOk && allGreen;
  record(
    "TBLR19 负对照：卸掉 TBL5",
    ok,
    ok
      ? `改了 ${changed} 行（行数不变），两档注入全部转绿 ⇒ 那两条红确实是 TBL5 判出来的`
      : `卸掉 TBL5 之后仍有夹具红（改动 ${changed} 行，应为 2 / 行数不变 ${linesOk} / 全绿 ${allGreen}）`
  );
}

/* ================= 收尾：真源指纹前后一致 ================= */

const fingerprint = crypto.createHash("sha256").update(fs.readFileSync(GATE_SRC)).digest("hex");
const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`  门禁真源 SHA-256：${fingerprint.slice(0, 16)}…（本自测全程只动 tmp 副本）`);
if (failed.length || extraChecks.length) {
  console.error(
    `自测失败：${failed.length} / ${results.length} 档未通过，另 ${extraChecks.length} 项自证未通过`
  );
  failed.forEach((r) => console.error(`  ✗ ${r.id} —— ${r.detail}`));
  process.exit(1);
}
console.log(
  `自测通过：${results.length} 档全部按预期触发，红因归属互不污染；` +
    `另含 2 项编号前缀自证（源码前缀只有自己的 + 全仓唯一）。`
);
