#!/usr/bin/env node
/**
 * 自测 FS0–FS25：证明门禁 FC1–FC7 的每条判据**都能变红**，且红因点名到判据编号。
 *
 * 为什么要有它（2026-10-21 的 D47）：
 *   「门禁跑绿」和「门禁在咬」是两件事 —— 判据写成永远为真的条件时，
 *   门禁会一直绿着，而页面早就坏了。本自测在**夹具站**（CSS 目录副本 +
 *   门禁副本 + 夹具 package.json）里逐档注入缺陷形态，断言：
 *     · 该判红的档 ⇒ 门禁 exit 1 **且失败条目里点名该判据编号**（不只看退出码，
 *       也不看通过行 —— 通过行里同样带着判据编号，只看「输出里有 FCn：」会误判）；
 *     · 该判绿的档 ⇒ 门禁 exit 0（防止「见着东西就红」）；
 *     · 判据级负对照 ⇒ 把门禁副本里对应的 `const FCn_ON = true;` 改成 false，
 *       同一份注入必须**转绿** —— 证明红因确实来自那一条判据，而不是别的。
 *
 * 夹具站有两份输入：
 *   · FIX/tokens.css —— token 真源副本（FC1–FC5 的注入都打在这里）
 *   · FIX/css/       —— 全站 CSS 目录副本（FC7 的注入打在这里）
 *     每一档跑之前都从 FIX/css-pristine 恢复一次 ⇒ 上一档的注入不会渗到下一档。
 *
 * 编号体系：**独立编号 FS0–FS25**，与门禁的 FC1–FC7 不续接
 *   （FC 是判据编号，FS 是自测档位编号）。
 *
 * 自包含：不 import 任何其它脚本，只用 Node 内置能力。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-focus-ring.cjs");
const TOKENS_SRC = path.join(ROOT, "src", "assets", "css", "tokens.css");
const CSS_SRC_DIR = path.join(ROOT, "src", "assets", "css");
const A11Y_SRC = path.join(CSS_SRC_DIR, "a11y.css");

const gateHash0 = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
const tokensHash0 = crypto.createHash("sha256").update(fs.readFileSync(TOKENS_SRC)).digest("hex");
const a11yHash0 = crypto.createHash("sha256").update(fs.readFileSync(A11Y_SRC)).digest("hex");

const FIX = fs.mkdtempSync(path.join(os.tmpdir(), "mh-focus-ring-selftest-"));
const TOKENS_FIX = path.join(FIX, "tokens.css");
const GATE_FIX = path.join(FIX, "check-focus-ring.cjs");
const PKG_FIX = path.join(FIX, "package.json");
const CSS_FIX = path.join(FIX, "css");
const CSS_PRISTINE = path.join(FIX, "css-pristine");

const tokensSrc = fs.readFileSync(TOKENS_SRC, "utf8");
const gateSrc = fs.readFileSync(GATE, "utf8");

/** 复制 CSS 目录（跳过 `._*` AppleDouble 侧车 —— 那是 exFAT 的元数据，不是样式表）。 */
function copyCssDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const src = path.join(from, e.name);
    const dst = path.join(to, e.name);
    if (e.isDirectory()) copyCssDir(src, dst);
    else if (e.isFile() && e.name.endsWith(".css")) fs.copyFileSync(src, dst);
  }
}

copyCssDir(CSS_SRC_DIR, CSS_PRISTINE);

/* 夹具 package.json：build 链里必须有 check:focus-ring（否则 FC6 会红，干扰其它档）。 */
fs.writeFileSync(
  PKG_FIX,
  JSON.stringify(
    { name: "focus-ring-fixture", private: true, scripts: { build: "npm run check:focus-ring" } },
    null,
    2
  )
);

/* ---------------- 工具 ---------------- */

/** 在 tokens.css 原文里替换第一处出现的片段。 */
function replaceOnce(src, needle, repl) {
  const i = src.indexOf(needle);
  if (i < 0) throw new Error("夹具注入点没找到：" + needle);
  return src.slice(0, i) + repl + src.slice(i + needle.length);
}

/** 替换**所有**出现处 —— 结构类注入必须让三个主题块一起改，否则 FC2 会跟着报红。 */
function replaceAll(src, needle, repl) {
  if (!src.includes(needle)) throw new Error("夹具注入点没找到：" + needle);
  return src.split(needle).join(repl);
}

/** 只在某个选择器的块内替换（用于「两个暗色块里只有一个写歪了」这种注入）。 */
function replaceInBlock(src, sel, needle, repl) {
  const head = sel + " {";
  const i = src.indexOf(head);
  if (i < 0) throw new Error("夹具里找不到块：" + sel);
  let depth = 0;
  let end = -1;
  for (let k = i + head.length - 1; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = k;
        break;
      }
    }
  }
  if (end < 0) throw new Error("夹具里的块没配平：" + sel);
  const block = src.slice(i, end);
  if (!block.includes(needle)) throw new Error("夹具注入点没找到（块 " + sel + " 内）：" + needle);
  return src.slice(0, i) + block.split(needle).join(repl) + src.slice(end);
}

/** 复制门禁，并把某条判据的开关置为 false（判据级负对照用）。 */
function gateWithSwitch(off) {
  let g = gateSrc;
  for (const id of off) {
    g = g.replace(`const ${id}_ON = true;`, `const ${id}_ON = false;`);
  }
  fs.writeFileSync(GATE_FIX, g);
  return GATE_FIX;
}

/* ---------------- 注入形态（tokens.css 原文上的定点改写） ----------------
 * 完整的一圈阴影字面量在 tokens.css 里出现三次（:root + 两处暗色块），
 * 结构类注入一律 replaceAll —— 让三个主题同时变形，FC2 才不会跟着报红。
 */
const SHADOW_LITERAL =
  "--shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer);";

const INJECT = {
  /* 外圈换成 99% 不透明的白：对比度不受影响（对比度计算只看 RGB），但「实色」这条被破坏
     ⇒ 只该 FC4 红。⚠️ 不能拿内圈做这一档：内圈 token 一改，暗色主题也跟着继承这个值，
     内圈就变成「暗底上的暗环」，FC3 会跟着红 —— 那是同源缺陷，不是 FC4 单独判出来的。 */
  outerTranslucent: (s) =>
    replaceOnce(s, "--focus-ring-outer: var(--color-neutral-0);", "--focus-ring-outer: rgba(255, 255, 255, .99);"),
  /* 内圈换成与浅色页面底几乎同色的浅灰：两圈都不达标 ⇒ 只该 FC3 红 */
  innerTooClose: (s) =>
    replaceOnce(s, "--focus-ring-inner: var(--color-brand-800);", "--focus-ring-inner: #e8e6e3;"),
  /* 外圈不再引用 --focus-ring-outer：双层结构还在、对比度也还在 ⇒ 只该 FC1 红 */
  outerWrongToken: (s) =>
    replaceAll(s, SHADOW_LITERAL, "--shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--color-brand-200);"),
  /* 内圈只有 1px：还是双层、对比度也还在 ⇒ 只该 FC1 红 */
  innerTooThin: (s) =>
    replaceAll(s, SHADOW_LITERAL, "--shadow-focus: 0 0 0 1px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-outer);"),
  /* 退回单层半透明蓝（这正是本轮修掉的真实缺陷形态）：FC1 与 FC3 都该红 */
  singleTranslucent: (s) =>
    replaceAll(s, SHADOW_LITERAL, "--shadow-focus: 0 0 0 3px rgba(58, 134, 255, .35);"),
  /* [data-theme="dark"] 块里的 --shadow-focus 换成等值但字面不同 ⇒ 只该 FC2 红 */
  darkAttrLiteral: (s) =>
    replaceInBlock(
      s,
      '[data-theme="dark"]',
      SHADOW_LITERAL,
      "--shadow-focus: 0 0 0 2px var(--color-brand-800), 0 0 0 4px var(--color-neutral-0);"
    ),
  /* 删掉一个登记底色：覆盖度还够（6 ≥ 5），只有「认不出登记项」该红 ⇒ 只该 FC3 红 */
  dropBackground: (s) => replaceOnce(s, "  --bg-subtle:     var(--color-brand-50);\n", ""),
  /* 两圈都被覆写成中间调灰、页面底也换成相近的灰 ⇒ 两圈都不到 3:1 ⇒ 只该 FC3 红。
     ⚠️ 只改底色是**打不红** FC3 的：内圈与外圈是明暗两极（近黑 + 近白），
     对任意底色都至少有一圈 ≥ 3:1 —— 这正是双色环的设计意图。
     要把 FC3 打红，必须让「圈的颜色」和「底色」一起塌到中间调。 */
  pageTooClose: (s) => {
    let t = replaceOnce(s, "--focus-ring-inner: var(--color-brand-800);", "--focus-ring-inner: #7a7a7a;");
    t = replaceOnce(t, "--focus-ring-outer: var(--color-neutral-0);", "--focus-ring-outer: #7a7a7a;");
    t = replaceOnce(t, "  --bg-page:       var(--color-neutral-50);", "  --bg-page:       #8a8a8a;");
    return t;
  },
  /* 内圈指向不存在的 token：FC1 绿（引用关系没变）、FC3 红（颜色解析不出来） */
  innerDangling: (s) =>
    replaceOnce(s, "--focus-ring-inner: var(--color-brand-800);", "--focus-ring-inner: var(--color-nonexistent);"),
  /* 内外圈引用互换：判据是「至少一圈达标」，所以必须判绿 */
  swapRings: (s) =>
    replaceAll(s, SHADOW_LITERAL, "--shadow-focus: 0 0 0 2px var(--focus-ring-outer), 0 0 0 4px var(--focus-ring-inner);"),
  /* 外圈换成纯黑（改的是 token 的**取值**，结构没动）：判据不挑具体颜色 ⇒ 必须判绿 */
  outerBlack: (s) =>
    replaceOnce(s, "--focus-ring-outer: var(--color-neutral-0);", "--focus-ring-outer: #000000;"),
  /* 两圈都指向同一个 token：结构在、但双色环退化成单色 ⇒ 只该 FC1 红 */
  sameTokenBothRings: (s) =>
    replaceAll(s, SHADOW_LITERAL, "--shadow-focus: 0 0 0 2px var(--focus-ring-inner), 0 0 0 4px var(--focus-ring-inner);"),
};

/* ---------------- 注入形态（CSS 目录副本上的定点改写，FC7 用） ----------------
 * 高对比偏好下的 `:focus-visible` 覆写 —— 本轮修掉的真实缺陷形态是
 * 「写死成单色 var(--color-brand-400)」：主按钮底上只有 1.92:1，达不到 3:1。
 */
const A11Y_FOCUS_RULE =
  ":focus-visible {\n    box-shadow: 0 0 0 3px var(--focus-ring-inner), 0 0 0 6px var(--focus-ring-outer) !important;\n  }";

const INJECT_CSS = {
  /* 退回单色：绕开了双色环的对比度担保 ⇒ 只该 FC7 红 */
  singleColor: (s) =>
    replaceOnce(
      s,
      A11Y_FOCUS_RULE,
      ":focus-visible {\n    box-shadow: 0 0 0 3px var(--color-brand-400) !important;\n  }"
    ),
  /* 改用 outline 作指示器（系统色形态，与 forced-colors 里的写法同形）⇒ 必须判绿 */
  noneWithOutline: (s) =>
    replaceOnce(
      s,
      A11Y_FOCUS_RULE,
      ":focus-visible {\n    box-shadow: none !important;\n    outline: 3px solid Highlight !important;\n  }"
    ),
  /* 把 box-shadow 抹掉却不补 outline：焦点指示器整个消失 ⇒ 只该 FC7 红 */
  noneNoOutline: (s) =>
    replaceOnce(s, A11Y_FOCUS_RULE, ":focus-visible {\n    box-shadow: none !important;\n  }"),
};

/* ---------------- 档位表 ----------------
 * type: "red"        ⇒ 必须 exit 1 且**失败条目**里点名 mustName
 * type: "green"      ⇒ 必须 exit 0
 * type: "off"        ⇒ 判据级负对照：把某条判据卸掉后，同一份注入必须转绿
 * type: "off-shared" ⇒ 同源缺陷：卸掉某条判据后**仍然红**（另一条判据同时命中），
 *                      但失败条目里**不得再出现**被卸掉的那条编号。
 */
const CASES = [
  { id: "FS0", desc: "基线：未改动的 token 真源", type: "green", tokens: (s) => s },
  {
    id: "FS1",
    desc: "外圈变成 99% 不透明（对比度不变、但不是实色）",
    type: "red",
    mustName: "FC4",
    tokens: INJECT.outerTranslucent,
  },
  {
    id: "FS2",
    desc: "内圈换成与浅色页面底几乎同色的浅灰（两圈都不达标）",
    type: "red",
    mustName: "FC3",
    tokens: INJECT.innerTooClose,
  },
  {
    id: "FS3",
    desc: "外圈不再引用 --focus-ring-outer（结构与对比度都还在）",
    type: "red",
    mustName: "FC1",
    tokens: INJECT.outerWrongToken,
  },
  {
    id: "FS4",
    desc: "内圈只有 1px（更窄的环不构成指示器）",
    type: "red",
    mustName: "FC1",
    tokens: INJECT.innerTooThin,
  },
  {
    id: "FS5",
    desc: "退回单层 35% 半透明蓝（本轮修掉的真实缺陷形态）",
    type: "red",
    mustName: "FC1",
    tokens: INJECT.singleTranslucent,
  },
  {
    id: "FS6",
    desc: "[data-theme=dark] 块里的 --shadow-focus 换成等值但字面不同",
    type: "red",
    mustName: "FC2",
    tokens: INJECT.darkAttrLiteral,
  },
  {
    id: "FS7",
    desc: "删掉一个登记底色 --bg-subtle（覆盖度仍够，只是认不出该项）",
    type: "red",
    mustName: "FC3",
    tokens: INJECT.dropBackground,
  },
  {
    id: "FS8",
    desc: "两圈都被覆写成中间调灰、页面底也换成相近的灰（两圈都不到 3:1）",
    type: "red",
    mustName: "FC3",
    tokens: INJECT.pageTooClose,
  },
  {
    id: "FS9",
    desc: "内圈指向不存在的 token（引用关系没坏、但颜色解析不出来）",
    type: "red",
    mustName: "FC3",
    tokens: INJECT.innerDangling,
  },
  {
    id: "FS10",
    desc: "内外圈引用互换（判据是「至少一圈达标」，必须判绿）",
    type: "green",
    tokens: INJECT.swapRings,
  },
  {
    id: "FS11",
    desc: "外圈换成纯黑（只改取值不改结构，判据不挑具体颜色，必须判绿）",
    type: "green",
    tokens: INJECT.outerBlack,
  },
  {
    id: "FS12",
    desc: "焦点环两圈都指向同一个 token（双色环退化成单色）",
    type: "red",
    mustName: "FC1",
    tokens: INJECT.sameTokenBothRings,
  },
  {
    id: "FS13",
    desc: "负对照：卸掉 FC4 判定 ⇒ FS1 的注入转绿",
    type: "off",
    off: ["FC4"],
    base: "FS1",
  },
  {
    id: "FS14",
    desc: "负对照：卸掉 FC1 判定 ⇒ FS3 的注入转绿",
    type: "off",
    off: ["FC1"],
    base: "FS3",
  },
  {
    id: "FS15",
    desc: "负对照：卸掉 FC2 判定 ⇒ FS6 的注入转绿",
    type: "off",
    off: ["FC2"],
    base: "FS6",
  },
  {
    id: "FS16",
    desc: "负对照：卸掉 FC3 判定 ⇒ FS2 的注入转绿",
    type: "off",
    off: ["FC3"],
    base: "FS2",
  },
  {
    id: "FS17",
    desc: "负对照：卸掉 FC5 判定 ⇒ 底色清单被清空时转绿",
    type: "off",
    off: ["FC5"],
    base: "FS-CLEAR-BG",
  },
  {
    id: "FS18",
    desc: "负对照：门禁自己被摘掉（夹具 package.json 的 build 链里去掉它）⇒ FC6 红",
    type: "red",
    mustName: "FC6",
    tokens: (s) => s,
    pkgWithoutGate: true,
  },
  {
    id: "FS19",
    desc: "负对照：把门禁副本里的底色清单清空 ⇒ FC5 覆盖度自证红",
    type: "red",
    mustName: "FC5",
    tokens: (s) => s,
    clearBackgrounds: true,
  },
  {
    id: "FS20",
    desc: "扫描器自证负对照：把对比度计算弄坏（永远返回 99）⇒ FS2 的注入转绿",
    type: "off",
    off: [],
    breakContrast: true,
    base: "FS2",
  },
  {
    id: "FS21",
    desc: "同源负对照：卸掉 FC1 ⇒ FS12 仍红（FC3 同源命中），但失败条目里不再有 FC1",
    type: "off-shared",
    off: ["FC1"],
    base: "FS12",
  },
  {
    id: "FS22",
    desc: "高对比偏好下的焦点环退回单色 brand-400（本轮修掉的同源形态）",
    type: "red",
    mustName: "FC7",
    tokens: (s) => s,
    css: INJECT_CSS.singleColor,
  },
  {
    id: "FS23",
    desc: "焦点环改用 outline 系统色形态（box-shadow: none + 同规则 outline）",
    type: "green",
    tokens: (s) => s,
    css: INJECT_CSS.noneWithOutline,
  },
  {
    id: "FS24",
    desc: "焦点环被抹掉（box-shadow: none）却没有补 outline",
    type: "red",
    mustName: "FC7",
    tokens: (s) => s,
    css: INJECT_CSS.noneNoOutline,
  },
  {
    id: "FS25",
    desc: "负对照：卸掉 FC7 判定 ⇒ FS22 的注入转绿",
    type: "off",
    off: ["FC7"],
    base: "FS22",
  },
];

/* FS17 的底座：把门禁副本里的底色清单清空（模拟枚举器坏掉） */
const CLEAR_BG_CASE = { id: "FS-CLEAR-BG", tokens: (s) => s, clearBackgrounds: true };

/* ---------------- 执行 ---------------- */
let failed = 0;
let passed = 0;

function report(id, desc, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${id}  ${desc} → ${detail}`);
  } else {
    failed++;
    console.log(`  ✗ ${id}  ${desc} → ${detail}`);
  }
}

/** 失败条目在门禁输出里长这样：「  · FC3：……」 —— 只认这一种，不认通过行。 */
function failBullet(out, id) {
  return out.includes("· " + id + "：");
}

/** 从输出里抽出所有失败条目，便于报告。 */
function failLines(out) {
  return out
    .split("\n")
    .filter((l) => l.includes("· "))
    .map((l) => l.trim())
    .join(" | ");
}

for (const c of CASES) {
  let tokens;
  let off = [];
  let clearBg = false;
  let breakContrast = false;
  let pkg = PKG_FIX;
  let cssMut = null;

  try {
    if (c.type === "off" || c.type === "off-shared") {
      const base = c.base === "FS-CLEAR-BG" ? CLEAR_BG_CASE : CASES.find((x) => x.id === c.base);
      if (!base) {
        report(c.id, c.desc, false, "找不到底座档 " + c.base);
        continue;
      }
      tokens = base.tokens(tokensSrc);
      off = c.off;
      clearBg = !!base.clearBackgrounds;
      breakContrast = !!c.breakContrast || !!base.breakContrast;
      cssMut = base.css || null;
    } else {
      tokens = c.tokens(tokensSrc);
      clearBg = !!c.clearBackgrounds;
      breakContrast = !!c.breakContrast;
      cssMut = c.css || null;
    }
  } catch (e) {
    report(c.id, c.desc, false, "注入失败：" + e.message);
    continue;
  }

  if (c.pkgWithoutGate) {
    pkg = path.join(FIX, "pkg-without-gate.json");
    fs.writeFileSync(
      pkg,
      JSON.stringify({ name: "focus-ring-fixture", private: true, scripts: { build: "echo hi" } }, null, 2)
    );
  }

  /* 需要改造门禁副本的档位：清空底色清单 / 弄坏对比度计算 */
  if (clearBg || breakContrast) {
    let g = gateSrc;
    for (const id of off) g = g.replace(`const ${id}_ON = true;`, `const ${id}_ON = false;`);
    if (clearBg) {
      g = g.replace(/const BACKGROUNDS = \[[\s\S]*?\];/, "const BACKGROUNDS = [];");
    }
    if (breakContrast) {
      g = g.replace(/function contrast\(a, b\) \{[\s\S]*?\n\}/, "function contrast(a, b) {\n  return 99;\n}");
    }
    fs.writeFileSync(GATE_FIX, g);
  }

  fs.writeFileSync(TOKENS_FIX, tokens);
  if (!clearBg && !breakContrast) gateWithSwitch(off);

  /* CSS 目录副本：每档都从 pristine 恢复 ⇒ 上一档的注入不会渗到下一档。 */
  fs.rmSync(CSS_FIX, { recursive: true, force: true });
  copyCssDir(CSS_PRISTINE, CSS_FIX);
  if (cssMut) {
    const f = path.join(CSS_FIX, "a11y.css");
    fs.writeFileSync(f, cssMut(fs.readFileSync(f, "utf8")));
  }

  const r = spawnSync(process.execPath, [GATE_FIX], {
    env: { ...process.env, FCR_TOKENS_CSS: TOKENS_FIX, FCR_CSS_DIR: CSS_FIX, FCR_PKG: pkg },
    encoding: "utf8",
  });
  const out = (r.stdout || "") + (r.stderr || "");

  if (c.type === "green") {
    report(
      c.id,
      c.desc,
      r.status === 0,
      r.status === 0 ? "判绿（符合预期）" : `不该红却 exit ${r.status}：${failLines(out)}`
    );
  } else if (c.type === "red") {
    const named = failBullet(out, c.mustName);
    const ok = r.status !== 0 && named;
    report(
      c.id,
      c.desc,
      ok,
      ok ? `判红，红因点名 ${c.mustName}` : `exit ${r.status}，红因点名 ${c.mustName}=${named}：${failLines(out)}`
    );
  } else if (c.type === "off") {
    const stillNamed = off.some((id) => failBullet(out, id));
    const ok = r.status === 0 && !stillNamed;
    report(
      c.id,
      c.desc,
      ok,
      ok
        ? "转绿（负对照通过）"
        : `卸掉判定后仍红或仍报 ${off.join("/")}：exit ${r.status}：${failLines(out)}`
    );
  } else {
    /* off-shared：同源缺陷 —— 期望「仍然红，但被卸掉的那条判据不再出现在失败条目里」 */
    const stillNamed = off.some((id) => failBullet(out, id));
    const ok = r.status !== 0 && !stillNamed;
    report(
      c.id,
      c.desc,
      ok,
      ok
        ? `仍红（exit ${r.status}），但失败条目里已无 ${off.join("/")}：${failLines(out)}`
        : `exit ${r.status}，仍点名 ${off.join("/")}=${stillNamed}：${failLines(out)}`
    );
  }
}

/* ---------------- 收尾：确认原件没被动过 ---------------- */
const gateHash1 = crypto.createHash("sha256").update(fs.readFileSync(GATE)).digest("hex");
const tokensHash1 = crypto.createHash("sha256").update(fs.readFileSync(TOKENS_SRC)).digest("hex");
if (gateHash1 !== gateHash0) {
  failed++;
  console.log(`  ✗ 门禁原件 scripts/check-focus-ring.cjs 被改动了（SHA-256 ${gateHash0} → ${gateHash1}）`);
} else {
  passed++;
  console.log(`  ✓ 门禁原件没被自测改动（SHA-256 ${gateHash0}）`);
}
if (tokensHash1 !== tokensHash0) {
  failed++;
  console.log(`  ✗ token 真源 src/assets/css/tokens.css 被改动了（SHA-256 ${tokensHash0} → ${tokensHash1}）`);
} else {
  passed++;
  console.log(`  ✓ token 真源没被自测改动（SHA-256 ${tokensHash0}）`);
}
const a11yHash1 = crypto.createHash("sha256").update(fs.readFileSync(A11Y_SRC)).digest("hex");
if (a11yHash1 !== a11yHash0) {
  failed++;
  console.log(`  ✗ 样式表 src/assets/css/a11y.css 被改动了（SHA-256 ${a11yHash0} → ${a11yHash1}）`);
} else {
  passed++;
  console.log(`  ✓ 样式表 src/assets/css/a11y.css 没被自测改动（SHA-256 ${a11yHash0}）`);
}

fs.rmSync(FIX, { recursive: true, force: true });

console.log("");
if (failed > 0) {
  console.error(`焦点环门禁自测未通过：${passed} 项通过，${failed} 项失败。`);
  process.exit(1);
}
console.log(`焦点环门禁自测通过：${passed} 项全过（${CASES.length} 档 + 3 项原件校验）。`);
process.exit(0);
