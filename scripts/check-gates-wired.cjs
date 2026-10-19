#!/usr/bin/env node
/**
 * 门禁接线门禁 —— 守住"每个门禁脚本都真的在 build 链上跑"这件事。
 *
 * 为什么要有这个门禁：
 *   2026-10-19 的交接复核发现，`scripts/check-copy-export.cjs`（Copy 出口取值方式的
 *   源码级检查）写完之后**从来没有被任何 package.json script 引用过**——
 *   CI 只跑 `npm run build`，于是这个门禁**从写下那刻起就是零保护作用**。
 *   而它自己 exit 0、输出漂亮，"看起来完全在工作"。
 *
 *   也就是说：**"门禁文件存在"和"门禁在跑"是两件事，而后者当时无人看守。**
 *   这类缺陷的共同特征：不报错、build 照过、门禁照绿——
 *   只有回头逐行读 package.json 才会发现。
 *   同样的形状此前还出现过好几次（门禁编号表漏行、门禁清单与代码段不一一对应、
 *   门禁汇总句照抄通过时的断言），它们都属于同一族：
 *   **"看起来在、其实不生效"**。
 *
 * 三条判据：
 *   GW1 全覆盖 —— scripts/ 下每个门禁脚本（check-*.cjs / verify-*.cjs）都必须
 *                  从 `npm run build` **可达**。可达 = build 直接 `npm run X`，
 *                  或 build → X → Y 这样间接引用（build → check:css → 两个脚本）。
 *   GW2 豁免登记 —— 确实不能接的门禁必须在本文件里显式登记并写明理由；
 *                  豁免名单不许留空理由、不许留已不存在的文件，
 *                  也不许"既登记豁免、又真接在 build 上"（状态自相矛盾）。
 *   GW3 自己没被卸掉 —— 本脚本必须真的在 build 链上。
 *
 * 与既有门禁的编号关系：本门禁用独立字母编号 GW*，
 * 不与 scripts/verify-site.cjs 的数字编号（1–29）、
 * check-a11y.cjs 的 A1–A4、check-wrapping.cjs 的 W1–W3 续接或冲突。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const PKG = path.join(ROOT, "package.json");

/* 门禁脚本的文件名形状。开发工具（screenshot*.js / lighthouse-runner.js /
   slow3g-runner.js）和 Python 小工具不在此列 —— 它们不是门禁。 */
const GATE_FILE_RE = /^(check|verify)-.*\.cjs$/;

/* 显式豁免：文件名 → 理由。理由必须写在这里（源码里），不能只写在日志里 ——
   日志不会被 CI 读到，写在日志里等于没写。
   理由为空 / 文件已不存在 / 又真接在 build 上 → 判红（见 GW2）。 */
const EXEMPT = {
  "check-overflow.cjs":
    "需要本机 Chrome + 临时静态服务器（CDP over WebSocket），比纯 Node 门禁重得多；" +
    "CI（ubuntu-latest）没有 Chrome，接进 build 只会让部署随机失败 —— 故意不接。" +
    "手动跑：node scripts/check-overflow.cjs",
};

/* ---------- 读 package.json ---------- */
if (!fs.existsSync(PKG)) {
  console.error("门禁接线门禁未通过：\n");
  console.error("  ✗ 找不到 package.json，无法确认各门禁是否接在 build 上。");
  process.exit(1);
}
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
} catch (e) {
  console.error("门禁接线门禁未通过：\n");
  console.error(`  ✗ package.json 解析失败：${e.message}`);
  process.exit(1);
}
const SCRIPTS = pkg.scripts || {};

/* ---------- 从 build 出发，算出"可达"的 npm script 集合 ---------- */
const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;

function reachableFromBuild() {
  const seen = new Set();
  const queue = ["build"];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const cmd = SCRIPTS[name] || "";
    NPM_RUN_RE.lastIndex = 0;
    let m;
    while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
      if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
    }
  }
  return seen;
}
const REACHABLE = reachableFromBuild();

/* 引用了某个门禁文件名的 npm script（可能是多个） */
function referencingScripts(filename) {
  return Object.keys(SCRIPTS).filter((n) => (SCRIPTS[n] || "").includes(filename));
}

/* ---------- 收集门禁脚本 ---------- */
const gateFiles = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && GATE_FILE_RE.test(e.name))
  .map((e) => e.name)
  .sort();

const SELF = path.basename(__filename);
const problems = [];

/* ---------- GW1：每个门禁脚本都必须从 build 可达 ---------- */
const wired = [];
for (const file of gateFiles) {
  if (file === SELF) continue; // 本门禁自己由 GW3 单独查（报错信息更直白）
  if (EXEMPT[file] !== undefined) continue; // 豁免的由 GW2 查

  const refs = referencingScripts(file);
  if (!refs.length) {
    problems.push(
      `scripts/${file} 没有被任何 npm script 引用 —— 这个门禁**永远不会执行**。` +
        `请在 package.json 里加一个 script 指向它，并把那个 script 接进 build 链。`
    );
    continue;
  }
  const live = refs.filter((n) => REACHABLE.has(n));
  if (!live.length) {
    problems.push(
      `scripts/${file} 只被 npm script「${refs.join(" / ")}」引用，但那些 script ` +
        `**不在 build 链上**（build 可达的只有 ${[...REACHABLE].join(" / ")}）——` +
        `同样等于没接。请把它接进 build 链。`
    );
    continue;
  }
  wired.push(`${file}（${live.join(" / ")}）`);
}

/* ---------- GW2：豁免必须显式、有效、且不自相矛盾 ---------- */
for (const [file, reason] of Object.entries(EXEMPT)) {
  if (!gateFiles.includes(file)) {
    problems.push(
      `豁免名单里的 scripts/${file} 在 scripts/ 下已经不存在了 —— ` +
        `删掉这条豁免，别让名单烂在里面。`
    );
    continue;
  }
  if (typeof reason !== "string" || !reason.trim()) {
    problems.push(`豁免名单里的 scripts/${file} 没有写理由 —— 豁免必须写明为什么不能接。`);
    continue;
  }
  const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
  if (live.length) {
    problems.push(
      `scripts/${file} 既是豁免项、又被接在 build 链上（${live.join(" / ")}）—— ` +
        `状态自相矛盾。既然它已经接上了，就把这条豁免删掉。`
    );
  }
}

/* ---------- GW3：门禁自己没被卸掉 ----------
   "门禁自己被卸掉"和"门禁没生效"在结果上长得一模一样（build 照过、门禁全绿），
   所以凡是靠"某处存在某样东西"做判据的门禁，都必须有这一条兜底。 */
if (!referencingScripts(SELF).some((n) => REACHABLE.has(n))) {
  problems.push(
    `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("门禁接线门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const exemptList = Object.keys(EXEMPT).length
  ? `；豁免 ${Object.keys(EXEMPT).join(" / ")}`
  : "";
console.log(
  `门禁接线门禁通过：${wired.length + 1} 个门禁脚本全部从 npm run build 可达` +
    `（含本门禁自己）${exemptList}。`
);
