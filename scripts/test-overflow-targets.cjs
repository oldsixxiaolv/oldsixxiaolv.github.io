#!/usr/bin/env node
/**
 * 窄屏溢出门禁的**触点尺寸判据自测**（注入矩阵）—— 证明 TS1–TS4 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷清单 D23 的配套）：
 *   这道门禁的触点判据是本仓**第一条**看"能不能点得中"的判据，
 *   而它判的东西很容易**整条失效而不露痕迹**：
 *   选择器写错、豁免判据写得太宽（于是什么都放过去）、
 *   或者判定那段被改成了恒不违规 —— 这三种情况都会让门禁**一直绿**，
 *   而"绿"读起来完全像在工作。触点尺寸恰恰是**最该有牙齿**的判据：
 *   它守的是读者在手机上点不点得中。
 *   ⇒ 「这条判据结构上能不能触发」必须**被证明**，不能靠人记得。
 *
 * 做法：造几个**夹具页面**，用 SITE_DIR 把门禁指向夹具目录，
 *   逐档断言门禁的红绿与红因内容。
 *   ⚠️ 负对照**只在副本上注入**（把门禁复制到临时目录再改）——
 *     全程**不动仓库里的任何文件**；最后按 SHA-256 校验门禁原件没被动过。
 *
 * 六档：
 *   T0 基线（达标 / spacing / 行内 / 独占一行 四种形态）→ 必须**全绿**（不许误报）
 *   T1 过小（13px 且换行处紧邻）→ 必须**判红**，且红因要**点名**选择器与实测尺寸
 *   T2 红因单一 → T1 那档的红因里**不许**混进横向溢出 / 正文列的红因
 *   T3 负对照（判定被卸掉）→ 门禁副本里的判定换成"恒不违规" ⇒ T1 那档转绿
 *      ⇒ 自测的「T1 必须红」断言当场失败 ⇒ 自测 exit 1 ⇒ 证明这条判据有牙齿
 *   T4 负对照（目标收集被卸掉）→ 门禁副本量不到任何触点 ⇒ 必须因 **TS1 自证**判红
 *   T5 真身校验 → 门禁原件按 SHA-256 校验没被动过（注入全程只在副本上做）
 *
 * 用法：node scripts/test-overflow-targets.cjs
 *   （已接进 npm run build，见 package.json 的 check:overflow-targets-selftest）
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-overflow.cjs");

let failures = 0;
function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label, detail) {
  failures++;
  console.log(`  ✗ ${label}${detail ? `  ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  cond ? ok(label, detail) : bad(label, detail);
}

if (!fs.existsSync(GATE)) {
  console.error(`触点尺寸自测失败：找不到门禁 ${GATE}`);
  process.exit(1);
}

/** 门禁原件的指纹（负对照全程只在副本上注入，最后要拿它校验原件没被动过）。 */
const gateDigest = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const GATE_SHA_BEFORE = gateDigest(GATE);

/* ---------- 夹具页面 ---------- */

const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';

/**
 * ⚠️ 必须带 viewport meta —— mobile 模拟下没有它，布局视口会退回 980px，
 *    那么"请求 360px、量到 980px"就是**量错了宽度**（门禁会判红，那是对的）。
 *
 * ⚠️ `<main id="main">` + 一条指向它的**行内**跳转链接是**必需的**，不是装饰：
 *    窄屏溢出门禁的 AN2 要求「每一页每一档都至少量到一个滚动定位目标」，
 *    而滚动定位目标 = 站内锚点链接指到的元素。没有这条链接 ⇒ 量到 0 个目标
 *    ⇒ AN2 自证判红 ⇒ 这份自测会因**与它本该测的东西无关**的原因而红。
 *    （与 M5 档当年踩的 TS1 空跑坑同族：**夹具不像真页面**。）
 *    这条链接放在**句子里** ⇒ 走行内例外，不会给触点判据 TS1 添乱。
 */
function page(title, body, css) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${VIEWPORT_META}
<title>${title}</title>
<style>${css}</style>
</head>
<body>
<main id="main">
<h1>${title}</h1>
<p>Skip to <a href="#main">the main content</a> of this fixture page.</p>
${body}
</main>
</body>
</html>
`;
}

/** 小链接的公共样式：13px 高 —— 就是 D23 坏掉的形态。 */
const SMALL = `.t-small { display: inline-flex; height: 13px; width: 48px; }`;

/** ① 达标：独立目标，渲染尺寸 24×24 ⇒ WCAG 直接过关。 */
const F_OK = page(
  "Target selftest — meets the minimum",
  `<p><a class="t-ok" href="#ok">Paper</a></p>`,
  `.t-ok { display: inline-flex; min-height: 24px; min-width: 24px; }`
);

/**
 * ② spacing 例外：同样 13px 高，但彼此离得开（中间 40px）
 * ⇒ 24px 圆不与任何目标相交 ⇒ **必须判绿**（不许误报）。
 */
const F_SPACING = page(
  "Target selftest — undersized but well spaced",
  `<div class="row"><a class="t-small" href="#a">Paper</a><a class="t-small" href="#b">Data</a></div>`,
  `.row { display: flex; gap: 40px; }\n${SMALL}`
);

/**
 * ③ 行内例外：13px 高的链接**在句子里**（同一行里还有非目标文字）
 * ⇒ 尺寸受非目标文字的行高约束 ⇒ **必须判绿**（不许误报）。
 */
const F_INLINE = page(
  "Target selftest — inline inside a sentence",
  `<p>Ordinary prose that runs on for a while before the <a class="t-small" href="#c">tiny link</a> and then carries on afterwards.</p>`,
  `.t-small { font-size: 12px; }`
);

/**
 * ④ 独占一行：13px 高的链接**旁边没有别的字**
 * ⇒ 行内例外**不成立**（尺寸没受任何非目标文字约束）
 * ⇒ 只能靠 spacing 例外过关 —— 而它周围确实没有别的目标 ⇒ **必须判绿**。
 *    这一档钉住的是「行内例外不许被放宽成『只要是 inline 就放过』」。
 */
const F_ALONE = page(
  "Target selftest — alone on its line",
  `<p><a class="t-small" href="#d">alone</a></p>`,
  `.t-small { font-size: 12px; }`
);

/**
 * ⑤ 过小（缺陷形态）：容器 130px 宽 ⇒ 每行放得下两个、第三个换行；
 *    行间距 4px ⇒ 上下两行的行心距只有 17px
 * ⇒ 24px 圆**互相相交** ⇒ spacing 例外不成立、尺寸又不达标 ⇒ **必须判红**。
 */
const F_SMALL = page(
  "Target selftest — undersized and packed",
  `<div class="row">
     <a class="t-small" href="#e">Paper</a>
     <a class="t-small" href="#f">Data</a>
     <a class="t-small" href="#g">Figure</a>
     <a class="t-small" href="#h">Code</a>
   </div>`,
  `.row { display: flex; flex-wrap: wrap; gap: 4px 24px; width: 130px; }\n${SMALL}`
);

/* ---------- 跑门禁 ---------- */

/**
 * 跑门禁（可以是副本）。SITE_DIR 指向夹具目录；
 * 副本放在临时目录里 —— 门禁自己的默认产物路径用 __dirname 推算，
 * 但我们**总是**显式给 SITE_DIR，所以副本照跑不误。
 */
function runGate(gatePath, siteDir, extraArgs) {
  const r = spawnSync(process.execPath, [gatePath, ...(extraArgs || [])], {
    cwd: ROOT,
    env: { ...process.env, SITE_DIR: siteDir },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return { code: r.status, out: `${r.stdout || ""}\n${r.stderr || ""}` };
}

/** 从门禁输出里抽出「触点」相关的红因，以及**别的**红因（用于 T2）。 */
function parseGateOutput(out) {
  const targetReasons = out
    .split("\n")
    .filter((l) => /^\s*触点过小：/.test(l) || /^\s+·\s+\d+px\s+\S+/.test(l));
  const otherReasons = out
    .split("\n")
    .filter(
      (l) =>
        /✗\s*横向可拖/.test(l) ||
        /正文被挤成窄带/.test(l) ||
        /正文列太窄/.test(l) ||
        /正文列选择器没命中/.test(l) ||
        /处「正文列选择器没命中」/.test(l)
    );
  const summary = out.match(/量到触点\s*\d+\s*个[^）]*）/);
  return { targetReasons, otherReasons, summary: summary ? summary[0] : "" };
}

/* ---------- 主流程 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-overflow-targets-selftest-"));
try {
  const passDir = path.join(tmp, "pass");
  const failDir = path.join(tmp, "fail");
  fs.mkdirSync(passDir);
  fs.mkdirSync(failDir);
  fs.writeFileSync(path.join(passDir, "f_ok.html"), F_OK);
  fs.writeFileSync(path.join(passDir, "f_spacing.html"), F_SPACING);
  fs.writeFileSync(path.join(passDir, "f_inline.html"), F_INLINE);
  fs.writeFileSync(path.join(passDir, "f_alone.html"), F_ALONE);
  fs.writeFileSync(path.join(failDir, "f_small.html"), F_SMALL);

  /* T0：四种形态都该绿 —— 判据不许误报 */
  const pass = runGate(GATE, passDir, ["--width", "360"]);
  assert(
    pass.code === 0,
    "T0 四种形态（达标 / spacing / 行内 / 独占一行）都判绿",
    `exit=${pass.code}${pass.code === 0 ? "" : ` —— ${pass.out.split("\n").slice(-6).join(" | ")}`}`
  );

  /* T1：缺陷形态必须判红，且红因要点名 */
  const fail = runGate(GATE, failDir, ["--width", "360"]);
  const fp = parseGateOutput(fail.out);
  assert(fail.code === 1, "T1 过小且换行处紧邻 ⇒ 判红", `exit=${fail.code}`);
  assert(
    fp.targetReasons.length > 0,
    "T1 红因里点名了触点判据",
    `${fp.targetReasons.length} 条`
  );
  assert(
    fp.targetReasons.some((l) => l.includes("t-small")),
    "T1 红因点名了出问题的选择器",
    fp.targetReasons[0] ? fp.targetReasons[0].trim().slice(0, 60) : "（无）"
  );
  assert(
    fp.targetReasons.some((l) => /13/.test(l)),
    "T1 红因报出了实测尺寸（13px）",
    fp.targetReasons[0] ? fp.targetReasons[0].trim().slice(0, 80) : "（无）"
  );

  /* T2：红因单一 —— 不许混进别的判据 */
  assert(
    fp.otherReasons.length === 0,
    "T2 红因里没有混进横向溢出 / 正文列的问题",
    fp.otherReasons.length ? fp.otherReasons.join(" | ").slice(0, 120) : "只有触点这一条"
  );

  /* T3：负对照 —— 把判定换成"恒不违规"，缺陷形态必须转绿（否则 T1 的红是假的） */
  const mutGate = path.join(tmp, "gate-mutated.cjs");
  const gateSrc = fs.readFileSync(GATE, "utf8");
  const NEEDLE = "const tEval = evaluateTargets(targets);";
  if (!gateSrc.includes(NEEDLE)) {
    bad("T3 负对照的前提成立（门禁里找得到判定那一行）", `没找到「${NEEDLE}」`);
  } else {
    fs.writeFileSync(
      mutGate,
      gateSrc.replace(
        NEEDLE,
        "const tEval = { violations: [], exemptInline: 0, undersized: 0 }; // 自测注入：判定被卸掉"
      )
    );
    const mut = runGate(mutGate, failDir, ["--width", "360"]);
    assert(
      mut.code === 0,
      "T3 判定被卸掉后缺陷形态转绿（⇒ T1 那次判红确实是这条判据判的）",
      `exit=${mut.code}`
    );
  }

  /* T4：负对照 —— 把目标收集卸掉，门禁必须因 TS1 自证判红 */
  const mutGate2 = path.join(tmp, "gate-mutated2.cjs");
  const NEEDLE2 = "for (const el of document.querySelectorAll(TARGET_SELECTOR)) {";
  if (!gateSrc.includes(NEEDLE2)) {
    bad("T4 负对照的前提成立（门禁里找得到目标收集那一行）", `没找到「${NEEDLE2}」`);
  } else {
    fs.writeFileSync(
      mutGate2,
      gateSrc.replace(NEEDLE2, "for (const el of []) { // 自测注入：目标收集被卸掉")
    );
    const mut2 = runGate(mutGate2, passDir, ["--width", "360"]);
    assert(
      mut2.code === 1 && /TS1/.test(mut2.out),
      "T4 目标收集被卸掉后门禁因 TS1 自证判红（防判据空跑）",
      `exit=${mut2.code}`
    );
  }

  /* T5：门禁原件没被动过 */
  const GATE_SHA_AFTER = gateDigest(GATE);
  assert(
    GATE_SHA_AFTER === GATE_SHA_BEFORE,
    "T5 门禁原件按 SHA-256 校验没被动过（注入全程只在副本上）",
    `${GATE_SHA_BEFORE.slice(0, 12)}…`
  );
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n✗ 触点尺寸自测未通过：${failures} 项红。\n`);
  process.exit(1);
}
console.log("\n✓ 触点尺寸自测通过：TS1–TS4 每条都证明了能变红。");
process.exit(0);
