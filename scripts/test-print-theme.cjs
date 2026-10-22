#!/usr/bin/env node
/**
 * 打印主题门禁（check-print-theme）的**自测**（注入矩阵）—— 证明 PT1–PT7 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷 D59 的第四批，2026-10-21 D59 场次）：
 *   一条**永远不会红**的判据，给出的是「看起来很确定的绿」——它比没有判据更坏，
 *   因为它把「盲区」包装成「已核过」。而「判据能不能变红」这件事，**只有注入能证明**。
 *   本仓已经吃过这一族亏：D51 查出三处 JS 空转、D52 查出死 CSS 门禁只守一张样式表、
 *   D57 给 IA8 加判据时只能靠当场的 `/tmp` 注入矩阵证明它会红 ——
 *   **矩阵跑完即弃，仓库里没有任何东西保证它下次还在**。
 *   D59 第三批把文本层门禁（LG）的矩阵搬进了仓库；本脚本搬的是打印主题门禁（PT）。
 *   ⇒ 打印样式那组判据第一次有了「它们真的会红」的常驻证明。
 *
 * 本门禁守的是一条**具体证据链**（不是假想的风险）：
 *   2026-10-19 修过一个**真 bug**——暗色模式下打印出来是「黑底黑字」，
 *   摘要 / 关键词 / 引用块（BibTeX / RIS）整段读不出来。修完之后**没有护栏**：
 *   明天有人加一条派生令牌、删掉某个 --bg-*、或把 print.css 的 <link> 摘了，
 *   纸面重新变黑、打印样式整体失效，而 build 依然全绿。
 *   ⇒ 本矩阵要证明两件事：**该红的一定红**（PT1–PT7），**该绿的一定绿**（基线 + 负对照）。
 *
 * 做法：在**自造的最小夹具站**上逐档注入缺陷，断言门禁**报出的红因编号集合与预期完全相等**。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入只在临时目录的副本上做。
 *   ⚠️ **不 require 被测门禁的代码**：门禁以**子进程**方式运行，
 *     本脚本只看它的**行为**（exit code + stderr 上的红因编号）。
 *   ⚠️ 为什么门禁必须**复制**而不是就地跑：本门禁的仓库根是
 *     `path.resolve(__dirname, "..")`（**硬编码，无环境变量开关**）⇒ 只有把副本放到
 *     夹具的 `scripts/` 下，ROOT 才会指向夹具根。⇒ 夹具因此**不需要 git、不需要真 `_site`**。
 *
 * 期望集（ORACLE_PRINT_TOKENS）**从门禁源码现读**（不写死在本脚本里）：
 *   写死会出现「两边各改一半」的漂移，而门禁自己带着条数锚 + 哈希锚，
 *   夹具用同一份期望集生成 ⇒ 夹具永远与门禁对齐，判定的是**门禁的逻辑**而不是两本账。
 *
 * 二十七档：
 *   PT0   基线（夹具原样）                       → 必须**全绿**（证明这套判据不是空跑）
 *   PT1   print.css 里没有 @media print 块        → PT1
 *   PT2a  :root 规则少了「恰好等于 :root」那条      → PT2
 *   PT2b  :root 规则少了「跟随系统的暗色」那条      → PT2
 *   PT2c  :root 规则少了「手动指定的暗色」那条      → PT2
 *   PT3a  打印块少声明一个 token                    → PT3
 *   PT3b  打印块某个 token 的值漂了                → PT3
 *   PT3c  打印块多出一个未登记的 token              → PT3
 *   PT3d  **门禁自己的期望集被改了、哈希锚没同步**  → PT3
 *   PT4a  打印背景太深（亮度 < 0.80）              → PT4
 *   PT4b  打印文字与纸面对比度 < 4.5:1             → PT4
 *   PT5   tokens.css 浅色 :root 的色阶与期望集不一致 → PT5
 *   PT6a  base.njk 里没有引用 print.css             → PT6
 *   PT6b  base.njk 那条 <link> 上没有 media="print" → PT6
 *   PT6c  产物 HTML 里没有带 media="print" 的引用    → PT6（**两个**产物文件 ⇒ 两条）
 *   PT6d  _site 不在场                               → PT6
 *   PT7a  print.css 不在场（前提缺失）               → PT7
 *   PT7b  tokens.css 不在场（前提缺失）              → PT7
 *   PT7c  base.njk 不在场（前提缺失）                → PT7
 *   PT8–PT14 **判据级负对照**（每条判据一档）        → 门禁**副本**卸掉那条判据后，
 *         对应的注入必须**转绿**（证明那条红确实来自它自己）
 *   PT15 **判据级负对照（精准性）**：卸掉 PT3 + **同时**注入 PT3b 与 PT2c
 *         → 必须**仍红**，但红因集合恰为 {PT2}（证明卸判据是精准的，不是把门禁整个关掉）
 *
 * 三处必须说清的诚实边界（写在这里，别当成漏网）：
 *   ① **PT1 会连坐 PT2–PT4**：@media print 块不存在时，PT2/PT3/PT4 要看的东西也没了。
 *      所以 PT8 那一档（卸 PT1）证明的是「注入的红因确实来自 PT1」，
 *      **证明不了**「卸 PT1 精准到不连坐」⇒ 精准性那一档改用 **PT3 + PT2** 组合
 *      （PT3a 不连坐 PT2）。
 *   ② **PT4a / PT4b 必须连门禁的期望集一起改**（并同步哈希锚）：否则 PT3 会先判红，
 *      压根轮不到 PT4 ⇒ 「PT4 会红」这件事就证明不了。两档因此让**门禁副本**与原件差 2 行
 *      （期望集 1 行 + 哈希锚 1 行），自测按档声明允许的差异行数。
 *   ③ **PT7 是 D59 第四批新增的判据**，它守的是「前提文件不在场」这一族：
 *      补之前 print.css 缺失时门禁只打一行**裸红因**就 exit 1 ⇒ 其余判据根本没跑；
 *      tokens.css / base.njk 缺失时又分别归在 PT5 / PT6 名下 ⇒ 三种「前提缺失」
 *      与判据本身的红因混在一起。⇒ PT7 的意义是「前提缺失 ⇒ **只红 PT7**」。
 *
 * 用法：node scripts/test-print-theme.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const GATE = path.join(__dirname, "check-print-theme.cjs");

/* ---------------- 从门禁源码现读期望集 ---------------- */

/**
 * 读出门禁里写死的期望集（ORACLE_PRINT_TOKENS）。
 * ⚠️ **不写死在本脚本里**：写死会出现「两边各改一半」的漂移；
 *   从源码读 ⇒ 夹具永远与门禁对齐，判定的是门禁的逻辑而不是两本账。
 */
function readOracle(src) {
  const start = src.indexOf("const ORACLE_PRINT_TOKENS = {");
  if (start === -1) die("没能从门禁源码里定位 ORACLE_PRINT_TOKENS —— 门禁结构变了？");
  const end = src.indexOf("\n};", start);
  if (end === -1) die("没能从门禁源码里定位 ORACLE_PRINT_TOKENS 的结尾 —— 门禁结构变了？");
  const block = src.slice(start, end);
  const out = {};
  const re = /"([a-z0-9-]+)"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(block)) !== null) out[m[1]] = m[2];
  if (Object.keys(out).length === 0) die("从门禁源码里读期望集读出 0 条 —— 门禁结构变了？");
  return out;
}

/** 期望集的规范哈希（口径与门禁一致：按名排序 → "name=value" 用 \n 连接 → sha256） */
function oracleHash(oracle) {
  const entries = Object.entries(oracle).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = entries.map(([k, v]) => `${k}=${v}`).join("\n");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function die(msg) {
  console.error(`打印主题门禁自测失败：${msg}`);
  process.exit(1);
}

const GATE_SOURCE = fs.readFileSync(GATE, "utf8");
const BASE_ORACLE = readOracle(GATE_SOURCE);

/* 从期望集里按前缀挑一个 token（不写死名字 ⇒ 期望集改名时本脚本不用改） */
function tokenByPrefix(prefix) {
  const keys = Object.keys(BASE_ORACLE).sort();
  const hit = keys.find((k) => k.startsWith(prefix));
  if (!hit) die(`期望集里没有以 "${prefix}" 开头的 token`);
  return hit;
}

const DRIFT_TOKEN = tokenByPrefix("border-"); // 改它不会牵动 PT4（PT4 只看 bg-* / text-*）
const BG_TOKEN = "bg-page"; // 文字对比度的参照物
const TEXT_TOKEN = tokenByPrefix("text-"); // PT4b 改它 ⇒ 对比度不足

/* 打印块 :root 规则的三种来源（默认 / 系统暗色 / 手动暗色） */
const DEFAULT_SELECTORS = [
  ":root",
  ':root:not([data-theme="light"])',
  ':root[data-theme="dark"]',
];

/* ---------------- 夹具 ---------------- */

/**
 * 搭一个夹具站（沙箱根目录）。
 *
 * opts（每个开关对应一档注入）：
 *   noMediaPrint     print.css 里没有 @media print 块   → PT1
 *   selectors        打印块 :root 规则的选择器列表       → PT2a/b/c
 *   dropToken        打印块少声明这个 token              → PT3a
 *   driftToken       打印块里这个 token 的值漂了          → PT3b
 *   extraToken       打印块多出这个未登记的 token         → PT3c
 *   printTokenOverride 打印块里这个 token 的值改成别的    → PT4a/b
 *   tokensOverride   tokens.css 浅色 :root 里这个值改成别的 → PT5
 *   baseNoLink       base.njk 里没有引用 print.css        → PT6a
 *   baseNoMedia      base.njk 那条 <link> 上没有 media="print" → PT6b
 *   productNoLink    产物 HTML 里没有那条引用             → PT6c
 *   noSite           不造 _site/                          → PT6d
 *   noPrintCss       不造 print.css                       → PT7a
 *   noTokensCss      不造 tokens.css                      → PT7b
 *   noBaseNjk        不造 base.njk                        → PT7c
 */
function buildFixture(dir, o, oracle) {
  const opts = o || {};

  /* —— print.css —— */
  if (!opts.noPrintCss) {
    const lines = [];
    if (opts.noMediaPrint) {
      lines.push(":root { color: #000000; }");
    } else {
      lines.push("@media print {");
      const selectors = opts.selectors || DEFAULT_SELECTORS;
      lines.push("  " + selectors.join(",\n  ") + " {");
      for (const [k, v] of Object.entries(oracle)) {
        if (opts.dropToken === k) continue;
        const value =
          opts.driftToken === k
            ? "#010203"
            : opts.printTokenOverride && opts.printTokenOverride[k] !== undefined
              ? opts.printTokenOverride[k]
              : v;
        lines.push(`    --${k}: ${value};`);
      }
      if (opts.extraToken) {
        lines.push(`    --${opts.extraToken.name}: ${opts.extraToken.value};`);
      }
      lines.push("  }");
      lines.push("}");
    }
    write(path.join(dir, "src", "assets", "css", "print.css"), lines.join("\n") + "\n");
  }

  /* —— tokens.css ——（PT5 只比 color-neutral-* 这一族） */
  if (!opts.noTokensCss) {
    const lines = [":root {"];
    for (const [k, v] of Object.entries(oracle)) {
      if (!k.startsWith("color-neutral-")) continue;
      const value = opts.tokensOverride && opts.tokensOverride[k] !== undefined ? opts.tokensOverride[k] : v;
      lines.push(`  --${k}: ${value};`);
    }
    lines.push("}");
    write(path.join(dir, "src", "assets", "css", "tokens.css"), lines.join("\n") + "\n");
  }

  /* —— base.njk —— */
  if (!opts.noBaseNjk) {
    const lines = ['<html lang="en">', "<head>", "  <title>Fixture</title>"];
    if (!opts.baseNoLink) {
      lines.push(
        opts.baseNoMedia
          ? '  <link rel="stylesheet" href="/assets/css/print.css" />'
          : '  <link rel="stylesheet" media="print" href="/assets/css/print.css" />'
      );
    }
    lines.push("</head>", "<body><p>Fixture page.</p></body>", "</html>");
    write(path.join(dir, "src", "_includes", "layouts", "base.njk"), lines.join("\n") + "\n");
  }

  /* —— 产物层 ——（两个 HTML：一个在根、一个在子目录 ⇒ 顺带验证递归遍历） */
  if (!opts.noSite) {
    for (const rel of ["index.html", path.join("blog", "index.html")]) {
      const lines = [
        "<!doctype html>",
        '<html lang="en"><head><title>Fixture</title>',
      ];
      if (!opts.productNoLink) {
        lines.push('  <link rel="stylesheet" media="print" href="/assets/css/print.css" />');
      }
      lines.push("</head><body><p>Fixture page.</p></body></html>");
      write(path.join(dir, "_site", rel), lines.join("\n") + "\n");
    }
  }
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/* ---------------- 门禁副本（负对照用） ---------------- */

/**
 * 把门禁复制到沙箱的 scripts/ 下（这样门禁的 ROOT 就是沙箱根）。
 *
 * spec：
 *   disablePt        卸掉这条判据（`const PTn_ON = true;` → `false;`）
 *   oracleOverride   改门禁里期望集的某个条目
 *     · 默认**同步**哈希锚（2 行差异）⇒ 用于「让 PT3 绿而 PT4 红」那种档
 *     · noHashSync 时**不同步**（1 行差异）⇒ 用于 PT3d（改了期望集忘了贴哈希）
 *
 * ⚠️ **卸判据必须自证**：改不到那个 `const PTn_ON = true;` 就直接失败 ——
 *   「破坏没打上」与「判据本来就不红」在结果上完全同形。
 * ⚠️ 副本与原件的差异行数必须**按档声明**（默认 1；改期望集且同步哈希时是 2）——
 *   多差一行就说明负对照动的不止判据。
 */
function buildGateCopy(dir, spec) {
  const s = spec || {};
  let copy = GATE_SOURCE;

  if (s.disablePt) {
    const from = `const PT${s.disablePt}_ON = true;`;
    const to = `const PT${s.disablePt}_ON = false;`;
    if (!copy.includes(from)) {
      die(`负对照没能改到 PT${s.disablePt} 的判定开关（破坏没打上，这一档会假绿）。`);
    }
    copy = copy.replace(from, to);
  }

  if (s.oracleOverride) {
    const { name, value } = s.oracleOverride;
    const re = new RegExp('("' + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '":\\s*")[^"]*(")');
    if (!re.test(copy)) die(`负对照没能改到门禁期望集里的 "${name}"（破坏没打上）。`);
    copy = copy.replace(re, `$1${value}$2`);

    if (!s.noHashSync) {
      const oldHash = oracleHash(BASE_ORACLE);
      if (!copy.includes(oldHash)) die("没能从门禁源码里定位期望集的哈希锚（破坏没打上）。");
      const newHash = oracleHash({ ...BASE_ORACLE, [name]: value });
      copy = copy.replace(oldHash, newHash);
    }
  }

  const a = GATE_SOURCE.split("\n");
  const b = copy.split("\n");
  const diff = a.filter((line, i) => line !== b[i]).length;
  const want = (s.disablePt ? 1 : 0) + (s.oracleOverride ? (s.noHashSync ? 1 : 2) : 0);
  if (diff !== want || a.length !== b.length) {
    die(
      `门禁副本与原件差了 ${diff} 行（应当恰好 ${want} 行）—— 负对照动的不止它该动的地方。`
    );
  }

  const target = path.join(dir, "scripts", "check-print-theme.cjs");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, copy);
  return target;
}

/* ---------------- 跑门禁 ---------------- */

function runGate(gatePath) {
  const r = spawnSync(process.execPath, [gatePath], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}`, err: `${r.stderr || ""}` };
}

/**
 * 从 **stderr** 里抽出红因编号（**按出现顺序、带重复**）。
 * ⚠️ 只取 stderr：门禁把**问题**写 stderr、把**说明/通过语**写 stdout。
 *   （stdout 里也有一句以「门禁 PT4：」开头的**说明**，只扫 stderr 才是天然隔离。）
 * ⚠️ 行首锚定 ⇒ 红因**正文里**引用的编号（如「本轮跳过 PT1–PT4」）不会被算进去。
 */
function causesOf(stderr) {
  const out = [];
  const re = /^\s*·\s*门禁 (PT\d+)/gm;
  let m;
  while ((m = re.exec(stderr)) !== null) out.push(m[1]);
  return out.sort();
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  {
    id: "PT0",
    label: "基线（夹具原样）",
    expect: "green",
  },
  {
    id: "PT1",
    label: "print.css 里没有 @media print 块",
    expect: "red",
    causes: ["PT1"],
    opts: { noMediaPrint: true },
    expectText: "@media print",
  },
  {
    id: "PT2a",
    label: "打印块 :root 规则少了「恰好等于 :root」那条选择器",
    expect: "red",
    causes: ["PT2"],
    opts: { selectors: DEFAULT_SELECTORS.slice(1) },
    expectText: "恰好等于 :root",
  },
  {
    id: "PT2b",
    label: "打印块 :root 规则少了「跟随系统的暗色」那条选择器",
    expect: "red",
    causes: ["PT2"],
    opts: { selectors: [DEFAULT_SELECTORS[0], DEFAULT_SELECTORS[2]] },
    expectText: ':not([data-theme="light"])',
  },
  {
    id: "PT2c",
    label: "打印块 :root 规则少了「手动指定的暗色」那条选择器",
    expect: "red",
    causes: ["PT2"],
    opts: { selectors: DEFAULT_SELECTORS.slice(0, 2) },
    expectText: '[data-theme="dark"]',
  },
  {
    id: "PT3a",
    label: "打印块少声明一个 token",
    expect: "red",
    causes: ["PT3"],
    opts: { dropToken: "color-neutral-500" },
    expectText: "**没有**声明",
  },
  {
    id: "PT3b",
    label: "打印块某个 token 的值漂了",
    expect: "red",
    causes: ["PT3"],
    opts: { driftToken: DRIFT_TOKEN },
    expectText: "与期望值",
  },
  {
    id: "PT3c",
    label: "打印块多出一个未登记的 token",
    expect: "red",
    causes: ["PT3"],
    opts: { extraToken: { name: "extra-token", value: "#010203" } },
    expectText: "多出**未登记**的 token",
  },
  {
    id: "PT3d",
    label: "门禁自己的期望集被改了、哈希锚没同步（改期望集忘了贴回新哈希）",
    expect: "red",
    causes: ["PT3"],
    gate: { oracleOverride: { name: "color-neutral-500", value: "#010203" }, noHashSync: true },
    expectText: "哈希锚对不上",
  },
  {
    id: "PT4a",
    label: "打印背景太深（相对亮度 < 0.80）",
    expect: "red",
    causes: ["PT4"],
    opts: { printTokenOverride: { [BG_TOKEN]: "#dddddd" } },
    gate: { oracleOverride: { name: BG_TOKEN, value: "#dddddd" } },
    expectText: "太深",
  },
  {
    id: "PT4b",
    label: "打印文字与纸面的对比度不足 4.5:1",
    expect: "red",
    causes: ["PT4"],
    opts: { printTokenOverride: { [TEXT_TOKEN]: "#dddddd" } },
    gate: { oracleOverride: { name: TEXT_TOKEN, value: "#dddddd" } },
    expectText: "对比度只有",
  },
  {
    id: "PT5",
    label: "tokens.css 浅色 :root 的中性色阶与期望集不一致（纸面与屏幕漂移）",
    expect: "red",
    causes: ["PT5"],
    opts: { tokensOverride: { "color-neutral-500": "#010203" } },
    expectText: "与期望值",
  },
  {
    id: "PT6a",
    label: "base.njk 里没有引用 print.css（源侧根本没接上）",
    expect: "red",
    causes: ["PT6"],
    opts: { baseNoLink: true },
    expectText: "base.njk 里没有引用 print.css",
  },
  {
    id: "PT6b",
    label: "base.njk 那条 <link> 上没有 media=\"print\"（打印规则会污染屏幕）",
    expect: "red",
    causes: ["PT6"],
    opts: { baseNoMedia: true },
    expectText: '没有 media="print"',
  },
  {
    id: "PT6c",
    label: "产物 HTML 里没有带 media=\"print\" 的引用（两个产物文件 ⇒ 两条红因）",
    expect: "red",
    causes: ["PT6", "PT6"],
    opts: { productNoLink: true },
    expectText: "产物 index.html 里没有带",
  },
  {
    id: "PT6d",
    label: "_site 不在场（产物侧从未被核对过）",
    expect: "red",
    causes: ["PT6"],
    opts: { noSite: true },
    expectText: "找不到 _site/",
  },
  {
    id: "PT7a",
    label: "print.css 不在场（前提缺失 ⇒ 只红 PT7，不牵连 PT1–PT4）",
    expect: "red",
    causes: ["PT7"],
    opts: { noPrintCss: true },
    expectText: "src/assets/css/print.css",
  },
  {
    id: "PT7b",
    label: "tokens.css 不在场（前提缺失 ⇒ 只红 PT7）",
    expect: "red",
    causes: ["PT7"],
    opts: { noTokensCss: true },
    expectText: "src/assets/css/tokens.css",
  },
  {
    id: "PT7c",
    label: "base.njk 不在场（前提缺失 ⇒ 只红 PT7）",
    expect: "red",
    causes: ["PT7"],
    opts: { noBaseNjk: true },
    expectText: "src/_includes/layouts/base.njk",
  },
  {
    id: "PT8",
    label: "判据级负对照①：门禁副本卸掉 PT1 + PT1 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 1 },
    opts: { noMediaPrint: true },
  },
  {
    id: "PT9",
    label: "判据级负对照②：门禁副本卸掉 PT2 + PT2c 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 2 },
    opts: { selectors: DEFAULT_SELECTORS.slice(0, 2) },
  },
  {
    id: "PT10",
    label: "判据级负对照③：门禁副本卸掉 PT3 + PT3b 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 3 },
    opts: { driftToken: DRIFT_TOKEN },
  },
  {
    id: "PT11",
    label: "判据级负对照④：门禁副本卸掉 PT4 + PT4a 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 4, oracleOverride: { name: BG_TOKEN, value: "#dddddd" } },
    opts: { printTokenOverride: { [BG_TOKEN]: "#dddddd" } },
  },
  {
    id: "PT12",
    label: "判据级负对照⑤：门禁副本卸掉 PT5 + PT5 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 5 },
    opts: { tokensOverride: { "color-neutral-500": "#010203" } },
  },
  {
    id: "PT13",
    label: "判据级负对照⑥：门禁副本卸掉 PT6 + PT6a 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 6 },
    opts: { baseNoLink: true },
  },
  {
    id: "PT14",
    label: "判据级负对照⑦：门禁副本卸掉 PT7 + PT7b 的注入 → 必须转绿",
    expect: "green",
    gate: { disablePt: 7 },
    opts: { noTokensCss: true },
  },
  {
    id: "PT15",
    label:
      "判据级负对照⑧（精准性）：门禁副本卸掉 PT3 + 同时注入 PT3b 与 PT2c → 必须仍红且红因集合恰为 {PT2}",
    expect: "red",
    causes: ["PT2"],
    gate: { disablePt: 3 },
    opts: { driftToken: DRIFT_TOKEN, selectors: DEFAULT_SELECTORS.slice(0, 2) },
  },
];

/* ---------------- 跑 ---------------- */

/* 门禁原件的摘要 —— 跑完要比对：负对照改的是**副本**，原件必须逐字节未变。 */
const gateBefore = fs.readFileSync(GATE, "utf8");

let pass = 0;
let fail = 0;
const failures = [];
const covered = new Set();

for (const c of CASES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-print-"));
  try {
    const fixture = path.join(tmp, "fixture");
    fs.mkdirSync(fixture, { recursive: true });

    /* 夹具用的期望集 = 门禁期望集 +（本档若改了门禁期望集，则同步改夹具）
       ⇒ 门禁与夹具永远对齐：PT3 绿不绿取决于「门禁的逻辑」，不取决于两本账。 */
    const effOracle = c.gate && c.gate.oracleOverride
      ? { ...BASE_ORACLE, [c.gate.oracleOverride.name]: c.gate.oracleOverride.value }
      : BASE_ORACLE;

    buildFixture(fixture, c.opts || {}, effOracle);
    const gatePath = buildGateCopy(fixture, c.gate || {});

    const r = runGate(gatePath);
    const got = causesOf(r.err);

    if (c.expect === "green") {
      if (r.code === 0 && got.length === 0) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判绿（符合预期）`);
      } else {
        fail++;
        failures.push(
          `${c.id} ${c.label}：期望判绿，实际 exit ${r.code}，红因 ${JSON.stringify(got)}\n${r.err.trim()}`
        );
        console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      }
      continue;
    }

    /* 红：exit 必须是 1，红因编号集合必须**完全相等**（多一条、少一条都算失败 ——
       多一条说明还有别的判据在说话（归属不纯），少一条说明这条判据没抓住）。
       集合按**多重集**比（带重复）⇒ 连「同一条判据报了两次」也算失败。 */
    const want = [...c.causes].sort();
    const gotKey = JSON.stringify(got);
    const wantKey = JSON.stringify(want);
    if (r.code !== 1) {
      fail++;
      failures.push(`${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}）`);
      continue;
    }
    if (gotKey !== wantKey) {
      fail++;
      failures.push(
        `${c.id} ${c.label}：红因编号集合应为 ${wantKey}，实际 ${gotKey}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符（应为 ${wantKey}，实际 ${gotKey}）`);
      continue;
    }
    if (c.expectText && !r.err.includes(c.expectText)) {
      fail++;
      failures.push(`${c.id} ${c.label}：红因里没指名「${c.expectText}」\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 红因没指名目标`);
      continue;
    }
    want.forEach((k) => covered.add(k));
    pass++;
    console.log(`  ✓ ${c.id} ${c.label} → 判红且红因集合恰为 ${wantKey}（符合预期）`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据编号从**门禁源码里现读**（不写死名单）：新增一条判据、源码里出现它的编号 ⇒
   这里立刻判红，提醒补档。 */
const gateIds = new Set(
  [...GATE_SOURCE.matchAll(/\bPT(\d+)\b/g)].map((m) => `PT${m[1]}`)
);
const missing = [...gateIds].filter((id) => !covered.has(id)).sort();
if (missing.length) {
  fail++;
  failures.push(
    `覆盖度自证：门禁里有 ${missing.join("、")}，但本矩阵没有能触发它们的档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}

/* 门禁原件必须逐字节未变（负对照改的是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  fail++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

console.log("");
if (fail) {
  console.error(`打印主题门禁自测失败：${fail} / ${CASES.length} 档不符预期\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(
  `打印主题门禁自测通过：${CASES.length} 档全部按预期触发（覆盖判据 ${[...covered].sort().join("、")}）。`
);
