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
 *   GW5 手工脚本也要有人管 —— scripts/ 顶层那些**既不是门禁、也不是自测**的脚本
 *                  （GW1 与 GW4 的文件名形状之间留着的那条缝）必须**二选一**：
 *                  接在 build 链上，或登记在 MANUAL_TOOLS 里并写明它需要什么。
 *                  登记不许留空理由、不许留已不存在的文件、不许既登记又接线。
 *   GW6 登记必须**诚实** —— 登记项必须**点名**它 require 的每一个**未声明**第三方包
 *                  （"未声明" = 不在 package.json 的依赖里 ⇒ 干净克隆里 npm ci 不会装它
 *                  ⇒ 那个脚本在干净克隆里**跑不起来**）。没点名 ⇒ "它需要什么"这句话是空的。
 *                  接在 build 链上的手工脚本则**不许**有未声明的第三方包（那会让 build 挂）。
 *
 * ⚠️ GW5 / GW6 为什么要加（2026-10-27 实测出来的洞，不是假想）：
 *   GW1 的文件名形状是 `^(check|verify)-.*\.cjs$`，GW4 的是 `^test-.*\.(cjs|sh)$` ——
 *   **两者之间留着一条缝**：顶层那些既不是门禁、也不是自测的脚本，谁都不管。
 *   本轮实测缝里躺着这几个：`lighthouse-runner.js` / `slow3g-runner.js` /
 *   `screenshot.js` / `screenshot-paper.js`（另有两个 Python 小工具）。
 *   其中两个**在干净克隆里根本跑不起来**：
 *     · `lighthouse-runner.js` 依赖**仓外**的 lighthouse（实测装在 /tmp/screenshot-tool/node_modules，
 *       本轮该路径已被清空）；
 *     · `slow3g-runner.js` / `screenshot.js` / `screenshot-paper.js` 依赖 `puppeteer-core`，
 *       而它**既不在 package.json、也不在 package-lock.json 里**，只在本机 node_modules 里存在
 *       ⇒ `npm ci` 会把它清掉 ⇒ 干净克隆里一跑就炸。
 *   更要命的是：这几个脚本内部**带着自己的自检**（"绝不记下一组属于 404 页的 FCP/LCP" 那种），
 *   跑不起来 ⇒ 那几行自检是**死代码**，而**没有任何门禁能发现**（GW1 只管 check-*，
 *   GW4 只管 test-*）⇒ 又是一例"看起来在、其实不生效"。
 *   ⇒ GW5 要求它们**有人管**，GW6 要求那份登记**说的是真话**（机器可核对，不是靠人自觉）。
 *
 * ⚠️ GW6 的诚实边界（不写清楚就成了过度声称）：
 *   机器能核对的只有一件事：**脚本 require 的包名 vs package.json 里声明过的包名**。
 *   它**不能**核对"这个包在本机到底装没装"、"脚本跑起来对不对" ——
 *   那些要真跑一次才知道。所以 GW6 判的是**登记与声明对不对得上**，
 *   不是"这个工具现在能不能用"。
 *   ⚠️ 依赖核对只覆盖 **Node 脚本的 require()**；Python 小工具本轮只登记、
 *     不做依赖核对（实测它们的 import 全是标准库）。
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
 * check-a11y.cjs 的 A*、check-wrapping.cjs 的 W* 续接或冲突。
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
  "check-dep-audit.cjs":
    "必须联网取漏洞公告库（npm advisories），而 build 链必须保持**零网络依赖**" +
    "（CI 里没有凭据，构建要可离线复现）⇒ 它是**周期性手动检查**，不进 build 链。" +
    "它的离线那一半在 scripts/check-deps.cjs，那个接在 build 链上。" +
    "⚠️ 还有一个具体理由：npm 镜像源不实现 advisories 接口" +
    "（实测返回 404 NOT_IMPLEMENTED），本脚本把 registry 写死成官方源，" +
    "跑出来的结论才作数。本地手动跑 npm run check:dep-audit。",
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

/* ---------- 手工工具（GW5 / GW6） ----------
   GW1 管 check- 与 verify- 开头的，GW4 管 test- 开头的 —— **两者之间那条缝**里躺着
   scripts/ 顶层的其它可执行脚本。它们既不是门禁、也不是自测，
   但**确实会被跑**（手动跑），而且内部往往带着自己的自检。
   GW5：它们要么接在 build 链上，要么登记在这里并写明它需要什么。 */

const MANUAL_FILE_RE = /\.(cjs|mjs|js|py|sh)$/;

/* 手工工具的显式登记：接不进 build 链的那些，必须在这里登记并写明理由，
   **并且点名它 require 的每一个未声明第三方包**（GW6 机器核对）。
   理由写在源码里（不是日志里）—— 日志不会被 CI 读到。

   ⚠️ 登记 = "承认它现在没人自动跑"，**不等于**"它该接进 build 链"。
   接不接是本人拍板（"自测/手工工具要不要进 build 链"那一族待决事项），
   本门禁只登记事实、不代拍。

   2026-10-27（GW5 / GW6 落地时）逐条登记 —— 全是**实测**出来的：
     · lighthouse-runner.js —— 依赖**仓外**的 lighthouse 包（实测装在
       /tmp/screenshot-tool/node_modules，本轮该路径已被清空 ⇒ 现在跑不起来），
       还需要本机 Chrome 与一个本地静态服务器。
     · slow3g-runner.js / screenshot.js / screenshot-paper.js —— 依赖
       puppeteer-core，而它**既不在 package.json、也不在 package-lock.json 里**，
       只在本机 node_modules 里存在 ⇒ `npm ci` 会清掉 ⇒ 干净克隆里跑不起来；
       三个脚本都把本机 Chrome 路径写死在 macOS 的 app bundle 路径上。
     · contrast_check.py —— 纯标准库（实测 import 只有 os / re / sys），
       读 src/assets/css/tokens.css 现场算对比度；不进 build 链
       （build 链里的对比度判定是 Node 那一套，两边口径不同，本轮不合并）。
     · _contrast_predict.py —— 一次性的预演脚本（带一组 PROPOSED 取值），
       纯标准库；不进 build 链。 */
const MANUAL_TOOLS = {
  "lighthouse-runner.js":
    "手工工具（不进 build 链）：需要**仓外**的 lighthouse 包 —— 实测装在 " +
    "/tmp/screenshot-tool/node_modules（本轮该路径已被清空 ⇒ 现在跑不起来），" +
    "lighthouse 既不在 package.json 的依赖里、也不在锁文件里；" +
    "还需要本机 Chrome（CDP 端口）与一个本地静态服务器" +
    "（先 `cd _site && python3 -m http.server 8765`）。",
  "slow3g-runner.js":
    "手工工具（不进 build 链）：需要 puppeteer-core 与本机 Chrome" +
    "（脚本把 Chrome 路径写死在 macOS 的 app bundle 路径上）。" +
    "⚠️ puppeteer-core **既不在 package.json、也不在 package-lock.json 里** —— " +
    "它只在本机 node_modules 里存在 ⇒ `npm ci` 会把它清掉 ⇒ 干净克隆里跑不起来。",
  "screenshot.js":
    "手工工具（不进 build 链）：需要 puppeteer-core 与本机 Chrome" +
    "（脚本把 Chrome 路径写死在 macOS 的 app bundle 路径上）。" +
    "⚠️ puppeteer-core **既不在 package.json、也不在 package-lock.json 里** —— " +
    "它只在本机 node_modules 里存在 ⇒ `npm ci` 会把它清掉 ⇒ 干净克隆里跑不起来。",
  "screenshot-paper.js":
    "手工工具（不进 build 链）：需要 puppeteer-core 与本机 Chrome。" +
    "⚠️ puppeteer-core **既不在 package.json、也不在 package-lock.json 里** —— " +
    "它只在本机 node_modules 里存在 ⇒ `npm ci` 会把它清掉 ⇒ 干净克隆里跑不起来。",
  "contrast_check.py":
    "手工工具（不进 build 链）：读 src/assets/css/tokens.css 现场算 WCAG 对比度，" +
    "只用标准库（实测 import 只有 os / re / sys），不需要额外安装任何东西。",
  "_contrast_predict.py":
    "手工工具（不进 build 链）：一次性预演脚本（带一组 PROPOSED 取值），" +
    "只用标准库（实测无第三方 import），不需要额外安装任何东西。",
};

/* Node 内置模块 —— 不算第三方依赖。 */
const BUILTIN_MODULES = new Set([
  "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto",
  "dgram", "dns", "domain", "events", "fs", "http", "http2", "https", "inspector",
  "module", "net", "os", "path", "perf_hooks", "process", "punycode", "querystring",
  "readline", "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
  "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
]);

/** 一个脚本 require 的**第三方包**（去重、排序；内置与本地文件不算）。 */
function thirdPartyRequires(file) {
  let src = "";
  try {
    src = fs.readFileSync(path.join(SCRIPTS_DIR, file), "utf8");
  } catch (e) {
    return [];
  }
  const re = /require\(\s*["']([^"']+)["']\s*\)/g;
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    const spec = m[1];
    if (spec.startsWith(".") || spec.startsWith("/")) continue; // 本地文件
    if (spec.startsWith("node:")) continue; // node: 前缀的内置模块
    const name = spec.startsWith("@")
      ? spec.split("/").slice(0, 2).join("/")
      : spec.split("/")[0];
    if (BUILTIN_MODULES.has(name)) continue;
    out.add(name);
  }
  return [...out].sort();
}

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

/* ---------- GW5 / GW6：手工脚本也要有人管，而且登记得诚实 ---------- */

/* scripts/ 顶层既不是门禁（GW1 家族）也不是自测（GW4 家族）的可执行脚本。
   ⚠️ 这个集合是**形状**决定的（文件名），不是"我认得的那几个" ——
   形状决定 ⇒ 以后新加一个脚本会**自动**落进 GW5 的管辖，不靠人记得登记。 */
const manualFiles = fs
  .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
  .filter((e) => e.isFile() && MANUAL_FILE_RE.test(e.name))
  .filter((e) => !GATE_FILE_RE.test(e.name) && !SELFTEST_FILE_RE.test(e.name))
  /* ⚠️ 排除 AppleDouble 旁挂文件（`._*`）：exFAT 卷上 macOS 会给每个文件生成一份
     元数据副本（本机实测 scripts/ 下有 132 份）。它们**不在版本控制里**
     （.gitignore 的 `._*` 命中），是卷的产物、不是仓库的文件 ——
     不排除的话，门禁会去管一堆"仓里根本没有的文件"。 */
  .filter((e) => !e.name.startsWith("._"))
  .map((e) => e.name)
  .sort();

const manualWired = [];
const manualRegistered = [];

/** 每个手工脚本的**未声明第三方依赖**（不在 package.json 的依赖里）。 */
function undeclaredDepsOf(files) {
  const declared = new Set();
  for (const key of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    for (const name of Object.keys(pkg[key] || {})) declared.add(name);
  }
  const out = new Map();
  for (const file of files) {
    const un = thirdPartyRequires(file).filter((p) => !declared.has(p));
    if (un.length) out.set(file, un);
  }
  return out;
}

/**
 * GW5：手工脚本要么接在 build 链上、要么登记在 MANUAL_TOOLS 里并写明理由。
 *
 * 抽成独立函数是为了让**判据级负对照**能干净地把它摘掉：
 * 自测里把门禁源码复制到 tmp、把调用它的那一行换掉 ⇒ 同一注入必须转绿，
 * 证明那条红**确实是它**判出来的（而不是别的判据碰巧撞出来的）。
 */
function checkManualTools(files) {
  const out = [];
  if (!files.length) {
    out.push(
      `[GW5] scripts/ 顶层一个「既不是门禁、也不是自测」的脚本都认不出来 —— ` +
        `扫描逻辑可能已经空跑（空跑的门禁等于没有门禁），判红。`
    );
    return out;
  }
  for (const file of files) {
    const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
    if (live.length) {
      manualWired.push(`${file}（${live.length} 个 npm script 引用）`);
      continue;
    }
    if (MANUAL_TOOLS[file] !== undefined) {
      manualRegistered.push(file);
      continue;
    }
    out.push(
      `scripts/${file} 既不是门禁（check-*/verify-*）、也不是自测（test-*），` +
        `却**既不在 build 链上、也没在 MANUAL_TOOLS 里登记** —— ` +
        `没有任何自动流程会碰它，源码里也没写清"它现在靠谁跑、它需要什么"。` +
        `请在 package.json 里加一个 script 指向它并接进 build 链，` +
        `或在 MANUAL_TOOLS 里登记并写明理由（GW5）。`
    );
  }
  /* 登记必须有效、且不自相矛盾（与 GW2 / GW4 同一套纪律） */
  for (const [file, reason] of Object.entries(MANUAL_TOOLS)) {
    if (!files.includes(file)) {
      out.push(
        `MANUAL_TOOLS 里登记的 scripts/${file} 在 scripts/ 下已经不存在了 —— ` +
          `删掉这条登记，别让名单烂在里面。`
      );
      continue;
    }
    if (typeof reason !== "string" || !reason.trim()) {
      out.push(
        `MANUAL_TOOLS 里登记的 scripts/${file} 没有写理由 —— ` +
          `登记必须写明它需要什么、靠谁跑。`
      );
      continue;
    }
    const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
    if (live.length) {
      out.push(
        `scripts/${file} 既是 MANUAL_TOOLS 的登记项、又被接在 build 链上` +
          `（${live.join(" / ")}）—— 状态自相矛盾。既然它已经接上了，` +
          `就把这条登记删掉。`
      );
    }
  }
  return out;
}

/**
 * GW6：登记必须**诚实** —— 脚本 require 的每一个**未声明**第三方包
 * （不在 package.json 的依赖里 ⇒ 干净克隆里 `npm ci` 不会装它 ⇒ 那个脚本跑不起来）
 * 都必须在登记里**被点名**；接在 build 链上的手工脚本则**不许**有未声明的包。
 */
function checkManualToolHonesty(files) {
  const out = [];
  const undeclaredMap = undeclaredDepsOf(files);
  for (const [file, undeclared] of undeclaredMap) {
    const live = referencingScripts(file).filter((n) => REACHABLE.has(n));
    if (live.length) {
      out.push(
        `scripts/${file} 接在 build 链上（${live.join(" / ")}），` +
          `却 require 了**未在 package.json 里声明**的包：${undeclared.join("、")} —— ` +
          `干净克隆里 npm ci 不会装它 ⇒ build 会挂。` +
          `改法：把它声明进 dependencies / devDependencies（并更新锁文件），` +
          `或把这个脚本移出 build 链。`
      );
      continue;
    }
    const reason = MANUAL_TOOLS[file];
    if (reason === undefined) continue; // 覆盖问题由 GW5 报（红因归属：不在这里重复报）
    const unnamed = undeclared.filter((p) => !reason.includes(p));
    if (unnamed.length) {
      out.push(
        `MANUAL_TOOLS 里 scripts/${file} 的登记**没有写明**它需要 ${unnamed.join("、")} —— ` +
          `这些包它 require 了，却不在 package.json 的依赖里（只在本机 node_modules 里存在 ⇒ ` +
          `npm ci 会清掉 ⇒ 干净克隆里跑不起来）。` +
          `登记必须**点名每一个**未声明的第三方包，否则"它需要什么"这句话是空的（GW6）。`
      );
    }
  }
  return out;
}

for (const p of checkManualTools(manualFiles)) problems.push(p);
for (const p of checkManualToolHonesty(manualFiles)) problems.push(p);

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
const manualSummary =
  `scripts/ 顶层「既不是门禁、也不是自测」的脚本 ${manualFiles.length} 个：` +
  `${manualWired.length} 个接在 build 链上` +
  (manualWired.length ? `（${manualWired.join("、")}）` : "") +
  `，${manualRegistered.length} 个登记在 MANUAL_TOOLS 里` +
  (manualRegistered.length ? `（${manualRegistered.join("、")}）` : "") +
  `。`;
/** GW6 的覆盖度自证：把"哪些脚本有未声明依赖、哪些已在登记里点名"写出来，
 *  不许只报"通过" —— 没人看得见这一族到底被核过没有。 */
const undeclaredMap = undeclaredDepsOf(manualFiles);
const namedInRegistry = [...undeclaredMap.entries()].filter(([f, ps]) => {
  const reason = MANUAL_TOOLS[f] || "";
  return ps.every((p) => reason.includes(p));
});
const manualHonesty =
  `GW6 逐个核对了这 ${manualFiles.length} 个脚本的第三方依赖：` +
  `${undeclaredMap.size} 个脚本有**未声明**依赖（不在 package.json 里 ⇒ 干净克隆里 npm ci 不会装），` +
  `其中 ${namedInRegistry.length} 个已在登记里**点名**` +
  (undeclaredMap.size
    ? `（${[...undeclaredMap.entries()]
        .map(([f, ps]) => `${f} → ${ps.join("、")}`)
        .join("；")}）`
    : "") +
  `。`;
console.log(
  `门禁接线门禁通过：check-*/verify-* 家族的 ${wired.length + 1} 个门禁脚本` +
    `全部从 npm run build 可达（含本门禁自己）${exemptList}。` +
    `自测脚本：${selfTestSummary}`
);
console.log(`  · 手工工具：${manualSummary}${manualHonesty}`);
console.log(
  `  · ⚠️ 诚实边界：GW5 / GW6 判的是"**有没有人管**"与"**登记与声明对不对得上**"，` +
    `**不判"这个工具现在能不能跑"**（那要真跑一次才知道）；` +
    `登记的那些**仍然不会被 CI 自动跑**（手工工具要不要进 build 链属本人拍板）。`
);
