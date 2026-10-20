#!/usr/bin/env node
/**
 * 挂载无关契约门禁的**自测**（注入矩阵）—— 证明 MC1–MC4 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。这道门禁判的是**文档文本**，
 *   而"注入没生效"（锚点不存在、正则没匹配上、改的是副本还是原件）
 *   恰恰是最容易发生、也最不容易看出来的失败模式。
 *   所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把仓库根与 docs/ 下的 markdown、以及 eleventy.config.js **各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用 MCC_DOC_DIRS / MCC_CONFIG 把门禁指向副本，
 *   断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *
 * 五档：
 *   MT0 基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   MT1 把 DEPLOY.md 的限定词删掉        → MC1（承诺失去限定）
 *   MT2 把 README 承诺行的「GitHub Pages」改掉 → MC2（README 没把例外讲清楚）
 *   MT3 把 relUrl 的 404 分支删掉        → MC3（文档说例外、代码没兑现）
 *   MT4 只给门禁看 2 个 md 文件          → MC4（扫描面被收窄 ⇒ 空跑风险）
 *
 * 用法：node scripts/test-mount-contract.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-mount-contract.cjs");
const CONFIG_SRC = path.join(ROOT, "eleventy.config.js");
/** 扫描面与门禁默认一致：仓库根 + docs/（都不递归）。 */
const SRC_DIRS = [ROOT, path.join(ROOT, "docs")];

for (const p of [CONFIG_SRC]) {
  if (!fs.existsSync(p)) {
    console.error(`挂载无关契约自测失败：找不到 ${path.relative(ROOT, p)}。`);
    process.exit(1);
  }
}

/** 收集扫描面里的全部 markdown（含 `._*` 与 IMPROVEMENT-LOG.md —— 让门禁自己按规则过滤）。 */
const originals = [];
for (const dir of SRC_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".md")) {
      originals.push({ name: e.name, src: path.join(dir, e.name) });
    }
  }
}
if (originals.length === 0) {
  console.error("挂载无关契约自测失败：一个 markdown 文件都没找到，注入前提不成立。");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-mountcontract-selftest-"));

/** 给副本做内容指纹，用来判断"这一档到底有没有真的改动"。 */
function fingerprint(mdDir, cfgPath) {
  const h = crypto.createHash("sha256");
  for (const name of fs.readdirSync(mdDir).sort()) {
    h.update(name).update(fs.readFileSync(path.join(mdDir, name)));
  }
  h.update(fs.readFileSync(cfgPath));
  return h.digest("hex");
}

/**
 * 在副本上注入 → 跑门禁 → 返回 {code, out}。
 * 每次跑都用**独立的目录**，避免上一档的残留影响下一档。
 */
function run(mutate) {
  const work = fs.mkdtempSync(path.join(tmp, "case-"));
  const mdDir = path.join(work, "md");
  fs.mkdirSync(mdDir);
  for (const f of originals) fs.copyFileSync(f.src, path.join(mdDir, f.name));
  const cfgPath = path.join(work, "eleventy.config.js");
  fs.copyFileSync(CONFIG_SRC, cfgPath);

  if (mutate) {
    const before = fingerprint(mdDir, cfgPath);
    mutate({
      mdDir,
      cfgPath,
      read: (p) => fs.readFileSync(p, "utf8"),
      write: (p, s) => fs.writeFileSync(p, s),
    });
    if (fingerprint(mdDir, cfgPath) === before) {
      throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    }
  }

  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, MCC_DOC_DIRS: mdDir, MCC_CONFIG: cfgPath },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

let failed = 0;

function expectRed(label, mutate, expect) {
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
    failed += 1;
    return;
  }
  if (!r.out.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但红因里没有「${expect}」`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判红 exit 1，红因命中「${expect}」`);
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
console.log("挂载无关契约门禁 · 本地注入矩阵：\n");

expectGreen("MT0 基线（原样）", null);

// MT1：删掉 DEPLOY.md 承诺行上的限定词 ⇒ MC1
expectRed(
  "MT1 DEPLOY.md 承诺行删掉限定词",
  ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "DEPLOY.md");
    write(
      p,
      replaceOnce(
        read(p),
        "（**404 页除外**：GitHub Pages 会把 `/404.html` 的内容送到任意未匹配路径，" +
          "而浏览器地址栏仍停在请求路径上，相对 URL 在那里没有正确解，" +
          "故 404 页的站内 URL 一律**根绝对**）",
        ""
      )
    );
  },
  "MC1"
);

// MT2：把 README 承诺行里的「GitHub Pages」改掉 ⇒ MC2
expectRed(
  "MT2 README 承诺行去掉「GitHub Pages」",
  ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "README.md");
    write(p, replaceOnce(read(p), "GitHub Pages 会把", "GitHub 服务会把"));
  },
  "MC2"
);

// MT3：删掉 relUrl 过滤器里的 404 分支 ⇒ MC3
expectRed(
  "MT3 relUrl 的 404 分支被删掉",
  ({ cfgPath, read, write }) => {
    write(
      cfgPath,
      replaceOnce(
        read(cfgPath),
        "    // 404 页：站内 URL 一律根绝对（理由见上面的注释块）\n" +
          "    if (this && this.ctx && this.ctx.is404) {\n" +
          '      return "/" + clean;\n' +
          "    }\n",
        ""
      )
    );
  },
  "MC3"
);

// MT4：只留 2 个 md 文件给门禁看 ⇒ MC4（扫描面被收窄）
expectRed(
  "MT4 只给门禁看 2 个 markdown 文件",
  ({ mdDir }) => {
    const keep = new Set(["README.md", "HOW_TO_RUN.md"]);
    for (const name of fs.readdirSync(mdDir)) {
      if (!keep.has(name)) fs.unlinkSync(path.join(mdDir, name));
    }
  },
  "MC4"
);

/* ---------- 汇总 ---------- */
if (failed) {
  console.error(`\n挂载无关契约自测：${failed} 档未通过。`);
  process.exit(1);
}
console.log("\n挂载无关契约自测：5 档全部符合预期（MC1–MC4 都能变红，基线是绿的）。");
