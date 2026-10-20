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
 * 四条判据：
 *   GW1 全覆盖 —— scripts/ 下每个门禁脚本（check-*.cjs / verify-*.cjs）都必须
 *                  从 `npm run build` **可达**。可达 = build 直接 `npm run X`，
 *                  或 build → X → Y 这样间接引用（build → check:css → 两个脚本）。
 *   GW2 豁免登记 —— 确实不能接的门禁必须在本文件里显式登记并写明理由；
 *                  豁免名单不许留空理由、不许留已不存在的文件，
 *                  也不许"既登记豁免、又真接在 build 上"（状态自相矛盾）。
 *   GW3 自己没被卸掉 —— 本脚本必须真的在 build 链上。
 *   GW4 自测脚本也要有人跑 —— scripts/ 下每个**自测脚本**
 *                  （test-*.cjs / test-*.sh）同样必须从 build 可达；
 *                  接不了的必须在本文件里显式登记（EXEMPT_SELFTEST）并写明理由。
 *
 * ⚠️ GW4 为什么要加（2026-10-20 实测出来的洞，不是假想）：
 *   GW1 的文件名形状是 `^(check|verify)-.*\.cjs$` —— **自测脚本不在它的视野里**。
 *   而自测脚本恰恰是"判据还活着"的证据来源：仓库里已有
 *   test-gates-selfcheck.cjs / test-dataset-files-gate.cjs / test-log-sections.sh
 *   三个自测脚本，**三个都没有被任何 npm script 引用**（只在文件头注释里写着
 *   "怎么跑"）→ **没人跑 = 没人知道判据被卸了**（这句话本来就写在
 *   test-gates-selfcheck.cjs 的文件头里，却没有任何机制守它）。
 *   同族形态本轮刚发生过：`scripts/check-copy-export.cjs` 写完从未被引用，
 *   却 exit 0、输出漂亮、"看起来完全在工作"。
 *   ⇒ GW4 把这一族纳入管辖：**要么接在 build 上，要么显式登记并写明理由**。
 *
 * ⚠️ GW4 的诚实边界（不写清楚就成了过度声称）：
 *   GW4 只保证"自测脚本不会变成没人知道的孤儿"，
 *   **不保证 CI 会跑它们** —— 登记在 EXEMPT_SELFTEST 里的那些，
 *   仍然只在有人手动跑的时候才跑。
 *   "自测脚本要不要接进 build 链"是**本人拍板**的事
 *   （日志里按**事项文字**登记：「自测脚本要不要进 build 链」/
 *   「是否把门禁自检接进 `npm run build`」—— 同一件事的两处登记；
 *   ⚠️ 该事项在日志里有**两个号**，而其中一个号在别处还指另外三件事 ——
 *   **按号找会找错**，所以这里按**文字**指认，不写号），
 *   本门禁**不代拍**：它只把"这些自测现在没人自动跑"这件事写进源码，
 *   不替本人决定接不接。
 *
 * 与既有门禁的编号关系：本门禁用独立字母编号 GW*，
 * 不与 scripts/verify-site.cjs 的数字编号体系、
 * check-a11y.cjs 的 A1–A4、check-wrapping.cjs 的 W1–W3 续接或冲突。
 * （这里**不写死**对方的编号上界——写死就是一个必然漂移的新来源，
 *   数字编号那边的上界由 verify-site.cjs 自己的门禁 24 守着。）
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
   理由为空 / 文件已不存在 / 又真接在 build 上 → 判红（见 GW2）。

   ⚠️ 2026-10-19 订正：此前这里登记着 `check-overflow.cjs`，
   理由写的是"需要本机 Chrome……CI（ubuntu-latest）没有 Chrome"——
   **那条理由是错的**。GitHub 的 ubuntu runner 镜像**自带 google-chrome**
   （runner-images 的 Ubuntu 24.04 / 26.04 镜像 README，"Browsers and Drivers"
   一节列着 Google Chrome 与 ChromeDriver），CI 上有 Chrome。
   真正缺的是**找 Chrome 的方式只认 macOS 的 app bundle 路径**。
   那个已改（scripts/check-overflow.cjs：CHROME_PATH → PATH → 各平台常见位置），
   于是该门禁**已经真正接进 build 链**，豁免登记随之删除。

   机制保留：将来若确有门禁不能进 build 链（例如必须联网、必须人工介入），
   在这里登记并写明理由——理由要经得起"CI 真的做不了吗"这一问。

   2026-10-20：第一条真实登记 —— `check-live-site.cjs`（线上部署核查）。
   它必须联网，且**时机上**就不能接进 build 链：build 跑在 deploy **之前**，
   此时线上还是上一次部署，把它放进 build 等于每次都对着旧站点判红，
   把"部署还没发生"误报成"代码坏了"。它的位置在**部署之后**。 */
const EXEMPT = {
  "check-live-site.cjs":
    "必须联网，且**时机上**不能接进 build 链：build 跑在 deploy 之前，" +
    "此时线上还是上一次部署，把它放进 build 等于每次都对着旧站点判红，" +
    "把「部署还没发生」误报成「代码坏了」。" +
    "它的正确位置是**部署之后**：.github/workflows/deploy.yml 的 verify-live job" +
    "（needs: deploy）是唯一的自动调用点；本地手动跑 npm run check:live。",
};

/* ---------- 自测脚本家族（GW4） ----------
   test-*.cjs / test-*.sh 不是门禁，但它们是"判据还活着"的证据来源。
   GW1 的文件名形状不覆盖它们 —— 本轮（2026-10-20）实测：仓库里三个自测脚本
   没有任何 npm script 引用它们，谁也不会跑。 */

const SELFTEST_FILE_RE = /^test-.*\.(cjs|sh)$/;

/* 自测脚本的显式登记：接不进 build 链的那些，必须在这里登记并写明理由。
   理由写在源码里（不是日志里）—— 日志不会被 CI 读到。

   ⚠️ 登记 = "承认它现在没人自动跑"，**不等于**"它该接进 build 链"。
   接不接是本人拍板（日志里按**事项文字**登记：「自测脚本要不要进 build 链」/
   「是否把门禁自检接进 `npm run build`」—— 同一件事的两处登记），
   本门禁只登记事实、不代拍。

   2026-10-20（GW4 落地时）逐条登记：
     · test-gates-selfcheck.cjs —— 门禁自测总矩阵：每次跑都要 clone 整个仓库
       并逐档重建产物，耗时远长于一次 build。
     · test-dataset-files-gate.cjs —— 数据集文件门禁的自测，手动跑。
     · test-log-sections.sh —— 日志节门禁的自测（shell 版），手动跑。
     · test-gates-wired-selftest.cjs —— 本门禁自己的自测（GW4 的注入矩阵），
       在临时沙箱里反复起门禁，手动跑。 */
const EXEMPT_SELFTEST = {
  "test-gates-selfcheck.cjs":
    "门禁自测总矩阵：每次跑都要 clone 整个仓库并逐档重建产物，" +
    "耗时远长于一次 build；接进 build 会让每次提交都得等它跑完。" +
    "自测要不要进 build 链属本人拍板（日志里按**事项文字**登记：自测脚本要不要进 build 链）。",
  "test-dataset-files-gate.cjs":
    "数据集文件门禁的自测，手动跑（用法写在脚本文件头）。" +
    "同属「自测要不要进 build 链」那一族待决事项。",
  "test-log-sections.sh":
    "日志节门禁的自测（shell 版），手动跑（用法写在脚本文件头）。" +
    "同属「自测要不要进 build 链」那一族待决事项。",
  "test-gates-wired-selftest.cjs":
    "本门禁自己的自测：在临时沙箱里反复起门禁跑注入矩阵，手动跑。" +
    "同属「自测要不要进 build 链」那一族待决事项。",
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

/* ---------- GW4：自测脚本也要有人跑 ----------
   自测脚本（test-*.cjs / test-*.sh）不是门禁，但它们是"判据还活着"的证据。
   GW1 的文件名形状不覆盖它们 → 本条单独兜住这一族。

   口径：**要么接在 build 上，要么在本文件里显式登记并写明理由**。
   刻意**不**要求"必须接在 build 上"——那属本人拍板
   （日志里按**事项文字**登记：「自测脚本要不要进 build 链」），本门禁不代拍。
   刻意**不**把"登记了但仍然没人跑"说成"已覆盖"——见文件头的诚实边界。 */
const selfTestFiles = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && SELFTEST_FILE_RE.test(e.name))
  .map((e) => e.name)
  .sort();

const selfTestWired = [];
const selfTestRegistered = [];
for (const file of selfTestFiles) {
  const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
  if (live.length) {
    selfTestWired.push(`${file}（${live.join(" / ")}）`);
    continue;
  }
  if (EXEMPT_SELFTEST[file] !== undefined) {
    selfTestRegistered.push(file);
    continue;
  }
  problems.push(
    `scripts/${file} 是一个**自测脚本**，但它既不在 build 链上、也没在 ` +
      `EXEMPT_SELFTEST 里登记 —— 没有任何自动流程会执行它，` +
      `源码里也没写清"它现在靠谁跑"（"没人跑 = 没人知道判据被卸了"）。` +
      `请在 package.json 里加一个 script 指向它并接进 build 链，` +
      `或在 EXEMPT_SELFTEST 里登记并写明理由。`
  );
}

/* 登记必须有效、且不自相矛盾（与 GW2 同一套纪律） */
for (const [file, reason] of Object.entries(EXEMPT_SELFTEST)) {
  if (!selfTestFiles.includes(file)) {
    problems.push(
      `EXEMPT_SELFTEST 里登记的 scripts/${file} 在 scripts/ 下已经不存在了 —— ` +
        `删掉这条登记，别让名单烂在里面。`
    );
    continue;
  }
  if (typeof reason !== "string" || !reason.trim()) {
    problems.push(
      `EXEMPT_SELFTEST 里登记的 scripts/${file} 没有写理由 —— ` +
        `登记必须写明为什么它接不进 build 链。`
    );
    continue;
  }
  const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
  if (live.length) {
    problems.push(
      `scripts/${file} 既是 EXEMPT_SELFTEST 的登记项、又被接在 build 链上` +
        `（${live.join(" / ")}）—— 状态自相矛盾。既然它已经接上了，` +
        `就把这条登记删掉。`
    );
  }
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
const selfTestSummary =
  `${selfTestFiles.length} 个自测脚本（test-*.cjs / test-*.sh）：` +
  `${selfTestWired.length} 个接在 build 链上` +
  (selfTestWired.length ? `（${selfTestWired.join("、")}）` : "") +
  `，${selfTestRegistered.length} 个登记在 EXEMPT_SELFTEST 里` +
  (selfTestRegistered.length ? `（${selfTestRegistered.join("、")}）` : "") +
  `。登记的那些**仍然不会被 CI 自动跑**（自测要不要进 build 链属本人拍板，` +
  `日志里按**事项文字**登记：「自测脚本要不要进 build 链」——` +
  `⚠️ 该事项在日志里有**两个号**，而其中一个号在别处还指另外三件事，` +
  `**按号找会找错**，请按文字认领）——本门禁只保证它们不会变成` +
  `没人知道的孤儿，不代拍。`;
console.log(
  `门禁接线门禁通过：check-*/verify-* 家族的 ${wired.length + 1} 个门禁脚本` +
    `全部从 npm run build 可达（含本门禁自己）${exemptList}。` +
    `自测脚本：${selfTestSummary}`
);
