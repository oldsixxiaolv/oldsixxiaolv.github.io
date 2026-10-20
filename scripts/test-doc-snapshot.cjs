#!/usr/bin/env node
/**
 * 文档快照门禁的**自测**（注入矩阵）—— 证明 DS1–DS4 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。而"注入没生效"（锚点不存在、正则没匹配上、
 *   改的是副本还是原件）恰恰是最容易发生、也最不容易看出来的失败模式。
 *   所以"这条判据结构上能不能触发"必须**被证明**。
 *
 * 做法：把仓库根与 docs/ 下的 markdown、以及 package.json **各复制**一份到临时目录，
 *   在副本上逐个注入缺陷，用 DS_DOC_DIRS / DS_PACKAGE_JSON 把门禁指向副本，
 *   断言门禁**确实**报出了对应的那条红因。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入必须在副本上做。
 *
 * 六档：
 *   SP0 基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   SP1 往 ROADMAP §1 的构建链行里写死「共 27 步」 → DS1（现状陈述写死了会变的数量）
 *   SP2 删掉 DEFECT-BACKLOG 的 §2 小节  → DS3（现状段被删空了，门禁失去判读对象）
 *   SP3 把所有 `**D<n>**` 标记去掉      → DS4（豁免机制失灵，历史块认不出来了）
 *   SP4 只给门禁看 9 个 md               → DS4（扫描面被收窄 ⇒ 空跑风险）
 *   SP5 把 package.json 的 scripts.build 删掉 → DS2（门禁自己数不出基准段数）
 *
 * ⚠️ 「每档只触发自己那一条」是**脚本断言**，不是人工核对：
 *   判据编号只从红因行的开头取（✗ 后面紧跟的编号），正文里提到的编号不算。
 *
 * ⚠️ SP3 为什么要连「数字 + 步」一起中和：
 *   豁免机制坏掉时，历史块会全部涌进 DS1 —— 那样 SP3 就会同时触发 DS1 与 DS4，
 *   分不清是谁在报警。中和掉「数字 + 步」之后，SP3 只剩「豁免识别失灵」这一个变量。
 *   这不是放水：DS1 的触发能力由 SP1 单独证明。
 *
 * 用法：node scripts/test-doc-snapshot.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-doc-snapshot.cjs");
const PKG_SRC = path.join(ROOT, "package.json");
/** 扫描面与门禁默认一致：仓库根 + docs/（都不递归）。 */
const SRC_DIRS = [ROOT, path.join(ROOT, "docs")];

for (const p of [PKG_SRC]) {
  if (!fs.existsSync(p)) {
    console.error(`文档快照自测失败：找不到 ${path.relative(ROOT, p)}。`);
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
  console.error("文档快照自测失败：一个 markdown 文件都没找到，注入前提不成立。");
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-docsnapshot-selftest-"));

/** 给副本做内容指纹，用来判断"这一档到底有没有真的改动"。 */
function fingerprint(mdDir, pkgPath) {
  const h = crypto.createHash("sha256");
  for (const name of fs.readdirSync(mdDir).sort()) {
    h.update(name).update(fs.readFileSync(path.join(mdDir, name)));
  }
  h.update(fs.readFileSync(pkgPath));
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
  const pkgPath = path.join(work, "package.json");
  fs.copyFileSync(PKG_SRC, pkgPath);

  if (mutate) {
    const before = fingerprint(mdDir, pkgPath);
    mutate({
      mdDir,
      pkgPath,
      read: (p) => fs.readFileSync(p, "utf8"),
      write: (p, s) => fs.writeFileSync(p, s),
    });
    if (fingerprint(mdDir, pkgPath) === before) {
      throw new Error("注入没有改变任何内容 —— 锚点不存在，这一档是坏跑");
    }
  }

  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, DS_DOC_DIRS: mdDir, DS_PACKAGE_JSON: pkgPath },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  return text.replace(from, to);
}

/** 从门禁输出里取"触发了哪几条判据"：只认红因行开头紧跟的编号。 */
function firedCriteria(out) {
  const ids = new Set();
  const re = /^\s*✗\s+(DS\d+)/gm;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return [...ids].sort();
}

let failed = 0;

/**
 * 期望判红，且**只**触发 expect 这一条判据。
 * "只触发自己那一条"是脚本断言：多触发一条同样算这一档坏跑。
 */
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
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  const fired = firedCriteria(r.out);
  if (!fired.includes(expect)) {
    console.log(`  ✗ ${label} → 判红了，但触发的判据里没有「${expect}」（实际：${fired.join(" / ") || "无"}）`);
    console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
    failed += 1;
    return;
  }
  if (fired.length > 1) {
    console.log(`  ✗ ${label} → 触发了不止一条判据：${fired.join(" / ")} —— 这一档的变量不唯一，说不清是谁在报警`);
    failed += 1;
    return;
  }
  console.log(`  ✓ ${label} → 判红 exit 1，只触发「${expect}」`);
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
console.log("文档快照门禁 · 本地注入矩阵：\n");

expectGreen("SP0 基线（原样）", null);

// SP1：往 ROADMAP §1 的构建链行里写死「共 27 步」⇒ DS1
expectRed(
  "SP1 ROADMAP §1 构建链行写死「共 27 步」",
  ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "ROADMAP.md");
    write(
      p,
      replaceOnce(
        read(p),
        "- **构建链**：`npm run build` 跑**全链门禁**（门禁 → eleventy → 产物核对），**必须 exit 0**。",
        "- **构建链**：`npm run build` 共 27 步（门禁 → eleventy → 产物核对），**必须 exit 0**。"
      )
    );
  },
  "DS1"
);

// SP2：删掉 DEFECT-BACKLOG 的 §2 小节 ⇒ DS3
expectRed(
  "SP2 删掉 DEFECT-BACKLOG 的 §2 小节",
  ({ mdDir, read, write }) => {
    const p = path.join(mdDir, "DEFECT-BACKLOG.md");
    const text = read(p);
    const lines = text.split("\n");
    const head = lines.findIndex((l) => /^##\s+2\./.test(l));
    if (head < 0) throw new Error("注入锚点不存在：找不到「## 2.」小节");
    let end = lines.length;
    for (let i = head + 1; i < lines.length; i++) {
      if (/^#{1,6}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    write(p, [...lines.slice(0, head), ...lines.slice(end)].join("\n"));
  },
  "DS3"
);

// SP3：把所有 `**D<n>**` 标记去掉（并中和「数字 + 步」）⇒ DS4（豁免机制失灵）
expectRed(
  "SP3 去掉所有 `**D<n>**` 标记（豁免机制失灵）",
  ({ mdDir, read, write }) => {
    for (const name of fs.readdirSync(mdDir)) {
      if (!name.endsWith(".md")) continue;
      const p = path.join(mdDir, name);
      let text = read(p);
      if (!/\*\*D\d+\*\*/.test(text)) continue;
      text = text.replace(/\*\*D(\d+)\*\*/g, "D$1");
      /* 中和「数字 + 步」：豁免坏掉后历史块会涌进 DS1，中和掉才只剩一个变量。 */
      text = text.replace(/(\d+)(\s*)步/g, "$1$2段");
      write(p, text);
    }
  },
  "DS4"
);

// SP4：只留 9 个 md 给门禁看（低于下限 10）⇒ DS4（扫描面被收窄）
expectRed(
  "SP4 只给门禁看 9 个 markdown 文件",
  ({ mdDir }) => {
    const keep = new Set([
      "ROADMAP.md",
      "DEFECT-BACKLOG.md",
      "HOW_TO_RUN.md",
      "README.md",
      "DEPLOY.md",
      "acceptance-report.md",
      "blog-writing-guide.md",
      "design-system.md",
      "implementation-notes.md",
    ]);
    for (const name of fs.readdirSync(mdDir)) {
      if (!keep.has(name)) fs.unlinkSync(path.join(mdDir, name));
    }
  },
  "DS4"
);

// SP5：把 package.json 的 scripts.build 删掉 ⇒ DS2（门禁自己数不出基准）
expectRed(
  "SP5 package.json 里没有 scripts.build",
  ({ pkgPath, read, write }) => {
    const pkg = JSON.parse(read(pkgPath));
    delete pkg.scripts.build;
    write(pkgPath, JSON.stringify(pkg, null, 2));
  },
  "DS2"
);

/* ---------- 汇总 ---------- */
if (failed) {
  console.error(`\n文档快照自测：${failed} 档未通过。`);
  process.exit(1);
}
console.log("\n文档快照自测：6 档全部符合预期（DS1–DS4 都能变红，且每档只触发自己那一条，基线是绿的）。");
