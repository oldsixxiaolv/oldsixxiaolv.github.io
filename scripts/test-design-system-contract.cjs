#!/usr/bin/env node
/**
 * 设计系统文档契约门禁的**自测**（注入矩阵）—— 证明 DC1–DC7 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。这道门禁判的是**文档文本**，
 *   而"注入没生效"（锚点不存在、正则没匹配上、改的是副本还是原件）
 *   恰恰是最容易发生、也最不容易看出来的失败模式。
 *   所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把设计系统文档、src/assets/css 目录、eleventy.config.js **各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用 DCC_DOC / DCC_CSS_DIR / DCC_COMPONENTS_DIR / DCC_CONFIG
 *   把门禁指向副本，断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *
 * 八档：
 *   DT0 基线（原样）                        → 必须**全绿**（证明这套判据不是空跑）
 *   DT1 §6.0 徽标行删掉 `.badge--quiet`     → DC1（类名族漏项）
 *   DT2 文档里塞一个 CSS 里没有的 `--token`  → DC2（虚构 CSS 变量）
 *   DT3 order 数组多一个 partial            → DC3（partial 清单三处不一致）
 *   DT4 dev 行改成也算「npm run build」     → DC4（双模口径与代码说反）
 *   DT5 §6.4 字号改成 `--fs-small`          → DC5（规格点了没被用的 token）
 *   DT6 裁剪副本里的 _badge.css              → DC6（覆盖度自证：扫描面被收窄）
 *   DT7 tokens.css 多一个 §10 没列的变量     → DC7（§10 与 tokens.css 集合不等）
 *
 * ⚠️ 每档都断言**只触发它自己那一条判据**（判据编号只从红因行的开头取，
 *   免得正文里提到别的编号被算进来）。一档同时炸出两条 ⇒ 两条判据的覆盖面
 *   缠在一起了，各自都测不准 —— 这比"测不到"更隐蔽。
 *   注入点也据此挑：DT2 的注入点放在 §11（验收清单），**不放在 §10 里** ——
 *   §10 是 DC7 的比对面，塞进去会同时触发 DC2 与 DC7，就分不清是谁在报警了。
 *
 * 用法：node scripts/test-design-system-contract.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-design-system-contract.cjs");
const DOC_SRC = path.join(ROOT, "docs", "design-system.md");
const CSS_SRC = path.join(ROOT, "src", "assets", "css");
const CONFIG_SRC = path.join(ROOT, "eleventy.config.js");

for (const p of [DOC_SRC, CSS_SRC, CONFIG_SRC]) {
  if (!fs.existsSync(p)) {
    console.error(`设计系统契约自测失败：找不到 ${path.relative(ROOT, p)}。`);
    process.exit(1);
  }
}

/** 递归复制目录（跳过 AppleDouble `._*`）。 */
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-designcontract-selftest-"));

/** 给副本做内容指纹，用来判断"这一档到底有没有真的改动"。 */
function fingerprint(docPath, cssDir, cfgPath) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(docPath));
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(e.name).update(fs.readFileSync(p));
    }
  };
  walk(cssDir);
  h.update(fs.readFileSync(cfgPath));
  return h.digest("hex");
}

/**
 * 在副本上注入 → 跑门禁 → 返回 {code, out}。
 * 每次跑都用**独立的目录**，避免上一档的残留影响下一档。
 */
function run(mutate) {
  const work = fs.mkdtempSync(path.join(tmp, "case-"));
  const docPath = path.join(work, "design-system.md");
  const cssDir = path.join(work, "css");
  const compDir = path.join(cssDir, "components");
  const cfgPath = path.join(work, "eleventy.config.js");
  fs.mkdirSync(compDir, { recursive: true });
  fs.copyFileSync(DOC_SRC, docPath);
  copyTree(CSS_SRC, cssDir);
  fs.copyFileSync(CONFIG_SRC, cfgPath);

  const env = {
    ...process.env,
    DCC_DOC: docPath,
    DCC_CSS_DIR: cssDir,
    DCC_COMPONENTS_DIR: compDir,
    DCC_CONFIG: cfgPath,
  };

  if (mutate) {
    const before = fingerprint(docPath, cssDir, cfgPath);
    mutate({
      docPath,
      cssDir,
      compDir,
      cfgPath,
      env,
      read: (p) => fs.readFileSync(p, "utf8"),
      write: (p, s) => fs.writeFileSync(p, s),
    });
    if (fingerprint(docPath, cssDir, cfgPath) === before) {
      throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    }
  }

  const r = spawnSync(process.execPath, [GATE], { env, encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

let failed = 0;

/**
 * 从门禁输出里取出**每条红因开头的判据编号**。
 * 只认红因行的开头（"  ✗ DC3 …"），正文里提到别的编号不算 ——
 * 否则「这条判据的说明里引用了另一条」会被误判成「两条都炸了」。
 */
function firedCriteria(out) {
  const set = new Set();
  for (const m of out.matchAll(/^\s*✗\s+(DC\d+)/gm)) set.add(m[1]);
  return [...set].sort();
}

function expectRed(label, mutate, expect, expectOnly) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 1) {
    console.log(`  ✗ ${label} → 期望判红（exit 1），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  if (!r.out.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但红因里没有「${expect}」`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  if (expectOnly) {
    const fired = firedCriteria(r.out);
    if (fired.join(",") !== expectOnly.join(",")) {
      console.log(
        `  ✗ ${label} → 触发的判据集合是 {${fired.join(", ") || "空"}}，期望 {${expectOnly.join(", ")}}`
      );
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      failed += 1;
      return;
    }
  }
  const only = expectOnly ? `，且只触发 {${expectOnly.join(", ")}}` : "";
  console.log(`  ✓ ${label} → 判红 exit 1，红因命中「${expect}」${only}`);
}

function expectGreen(label, mutate) {
  let r;
  try {
    r = run(mutate);
  } catch (e) {
    console.log(`  ✗ ${label} → 注入本身坏了：${e.message}`);
    failed += 1;
    return;
  }
  if (r.code !== 0) {
    console.log(`  ✗ ${label} → 期望判绿（exit 0），实测 exit ${r.code}`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判绿 exit 0`);
}

/* ---------- 矩阵 ---------- */
console.log("设计系统文档契约门禁 · 本地注入矩阵：\n");

expectGreen("DT0 基线（原样）", null);

// DT1：§6.0 徽标行删掉 `.badge--quiet` ⇒ DC1
expectRed(
  "DT1 §6.0 徽标行删掉 `.badge--quiet`",
  ({ docPath, read, write }) => {
    write(
      docPath,
      replaceOnce(
        read(docPath),
        "`.badge--filled-brand`、`.badge--quiet` |",
        "`.badge--filled-brand` |"
      )
    );
  },
  "DC1",
  ["DC1"]
);

// DT2：文档里塞一个 CSS 里没有定义的 token ⇒ DC2
// ⚠️ 注入点选在 §11（验收清单），**不放在 §10** —— §10 是 DC7 的比对面，
//    塞进去会同时触发 DC2 与 DC7，就分不清是哪条判据在报警了。
expectRed(
  "DT2 文档里塞一个未定义的 `--token`",
  ({ docPath, read, write }) => {
    write(
      docPath,
      replaceOnce(
        read(docPath),
        "- [ ] 不使用 emoji 作图标",
        "- [ ] 不使用 emoji 作图标；强调色一律走 `--color-nonexistent-xyz`"
      )
    );
  },
  "DC2",
  ["DC2"]
);

// DT3：order 数组多一个 partial ⇒ DC3
expectRed(
  "DT3 order 数组多一个 partial",
  ({ cfgPath, read, write }) => {
    write(
      cfgPath,
      replaceOnce(
        read(cfgPath),
        'const order = ["_nav", "_button", "_badge", "_card", "_list", "_paper", "_misc"];',
        'const order = ["_nav", "_button", "_badge", "_card", "_list", "_paper", "_misc", "_extra"];'
      )
    );
  },
  "DC3",
  ["DC3"]
);

// DT4：dev 行把裸跑构建也算进去 ⇒ DC4
expectRed(
  "DT4 dev 行把「npm run build」也算成 dev",
  ({ docPath, read, write }) => {
    write(
      docPath,
      replaceOnce(
        read(docPath),
        "`eleventy --serve` 且 `NODE_ENV` 不为 `production`",
        "`eleventy --serve`，也包括裸跑 `npm run build`"
      )
    );
  },
  "DC4",
  ["DC4"]
);

// DT5：§6.4 的字号改成 _badge.css 没引用的 token ⇒ DC5
expectRed(
  "DT5 §6.4 字号改成 `--fs-small`",
  ({ docPath, read, write }) => {
    write(docPath, replaceOnce(read(docPath), "- 字号 `--fs-caption`", "- 字号 `--fs-small`"));
  },
  "DC5",
  ["DC5"]
);

// DT6：把副本里的 _badge.css 裁剪到只剩 2 个类 ⇒ DC6（覆盖度自证）
expectRed(
  "DT6 裁剪副本里的 _badge.css（只留 2 个类）",
  ({ compDir, read, write }) => {
    const p = path.join(compDir, "_badge.css");
    const lines = read(p).split("\n");
    const cut = lines.findIndex((l) => l.startsWith(".badge--accent"));
    if (cut < 0) throw new Error("注入锚点不存在：找不到 `.badge--accent` 规则行");
    write(p, lines.slice(0, cut).join("\n") + "\n/* ---- 自测裁剪：模拟扫描面被收窄 ---- */\n");
  },
  "DC6",
  ["DC6"]
);

// DT7：副本的 tokens.css 里多一个 §10 没列的变量 ⇒ DC7
expectRed(
  "DT7 tokens.css 多一个 §10 没列的变量",
  ({ cssDir, read, write }) => {
    const p = path.join(cssDir, "tokens.css");
    write(
      p,
      replaceOnce(
        read(p),
        "  --color-info:    var(--color-brand-400);",
        "  --color-info:    var(--color-brand-400);\n  --color-injected-selftest: #123456;"
      )
    );
  },
  "DC7",
  ["DC7"]
);

/* ---------- 汇总 ---------- */
if (failed) {
  console.error(`\n设计系统契约自测：${failed} 档未通过。`);
  process.exit(1);
}
console.log("\n设计系统契约自测：8 档全部符合预期（DC1–DC7 都能变红，每档只触发自己那一条；基线是绿的）。");
