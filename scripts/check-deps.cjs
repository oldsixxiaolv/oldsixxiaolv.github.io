#!/usr/bin/env node
/**
 * 依赖与运行时体检门禁 —— 判据 DEP1–DEP6（**离线**，不联网）。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-27 实测：`npm audit` 在本仓**从来没有真正跑过** ——
 *   本机（CI 同款）的 npm registry 是 registry.npmmirror.com，
 *   而该镜像**不实现 advisories 接口**（实测 POST
 *   /-/npm/v1/security/advisories/bulk 返回 404 `NOT_IMPLEMENTED`）
 *   ⇒ `npm audit` 永远报不出任何漏洞，看起来像「查过了、干净」。
 *   换成官方源再跑，才第一次看见真相：
 *   **markdown-it 14.3.2 落在一条 high 级公告的受影响区间里**
 *   （GHSA-gfr2-rv44-r23c，cvss 7.5：多行链接引用定义渲染的二次时间 DoS，
 *     14.0 起的回归；另有一条 low 的 GHSA-vfgh-jcmw-g37q：开启 html 时
 *     内联 HTML 解析的二次时间 DoS —— 本仓的 markdown-it 正是**开了 html** 的，
 *     见 eleventy.config.js 的 markdown filter）。
 *   ⇒ **依赖面的漏洞检查此前从未生效过**，而 build 链里跑的正是这些依赖。
 *
 * 判据：
 *   DEP1 声明下限 —— package.json 里声明的版本范围，其**下限**不得低于「下限表」。
 *   DEP2 实际锁定 —— package-lock.json 里**实际锁定**的版本不得低于「下限表」。
 *   DEP3 完整性 —— lockfile 每个包条目都必须带 `integrity`（哈希）。
 *   DEP4 锁文件一致 —— lockfile 根条目的依赖声明必须与 package.json **逐字一致**。
 *   DEP5 CI 运行时一致 —— CI 用的 Node 版本必须同时满足 package.json 的 `engines.node`
 *      与依赖树里各包的 `engines.node` 下限；各 setup-node 步骤必须写同一个版本。
 *   DEP6 CI 运行时底线 —— CI 用的 Node 不得低于「CI Node 底线表」。
 *
 * ⚠ 为什么要有 DEP5 / DEP6（一次具体的实测，不是假想）：
 *   2026-10-27 实测：**CI 的 `node-version` 从来没有任何门禁看守过** ——
 *   · `scripts/check-deploy-target.cjs` 的 **DP7** 管的是 action 的**执行运行时**
 *     （上游 action.yml 里的 `runs.using`），**不是** CI 自己跑构建用的那个 Node；
 *   · `scripts/check-readme.cjs` 的 **RD2** 管的是 README 声明的 Node 下限与
 *     package.json 的 `engines` 是否一致，**完全不涉及工作流**；
 *   · `package.json` 的 `engines: ">=22"` 对 npm 而言只是**建议** —— 引擎不匹配时
 *     npm 默认只发一条 `EBADENGINE` 警告，**安装照样成功**。
 *   ⇒ 把工作流里的 `node-version: 22` 改成 `20`，**没有任何一道门禁会红**，
 *     CI 会安安静静地把整条发布管线建在一个**已于 2026-04-30 结束支持（EOL）**的运行时上。
 *   而 Node 20 上的失败方式是**看不懂的**：本仓 build 链里的多档溢出门禁
 *   （`scripts/check-overflow.cjs`）用 CDP over WebSocket，Node 20 没有全局 WebSocket
 *   ⇒ 它会抛 "WebSocket is not defined"，而不是告诉你「你把 CI 的 Node 降级了」。
 *
 * ⚠ DEP5 与 DEP6 为什么是**两条**而不是一条：
 *   DEP5 拿 CI 的 Node 与「本仓自己声明的要求」比（package.json / 依赖树的 engines）；
 *   DEP6 拿它与「上游事实」比（底线表：低于这一版就不再收安全更新）。
 *   只留 DEP5 ⇒ 有人把 `engines` 放松到 `>=18`、再把 CI 一起降到 18，就双双通过；
 *   只留 DEP6 ⇒ 有人加了个要求 Node 24 的依赖、CI 仍停在 22，查不出来。
 *   ⇒ 两张表分开守，才不会被「一起改」糊弄过去（同 D103 的 node24 底线表的道理）。
 *
 * ⚠️ 为什么下限表要**独立于**当前锁定版本：
 *   表记的是「低于这个版本就中过招」这个**上游事实**，与本仓现在锁着哪一版无关
 *   ⇒ 有人把范围放松回旧版（`^14.1.0`）并顺手改 lockfile，DEP1 仍拦得住。
 *   （与 scripts/check-deploy-target.cjs 里的「node24 底线表」是同一个做法。）
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 这道门禁**判不了「当前锁定的版本有没有已知漏洞」** ——
 *     漏洞公告库必须联网，而 build 链要保持**零网络依赖** ⇒
 *     联网的那一半在 `scripts/check-dep-audit.cjs`（判据 DA1），
 *     它**不接进 build 链**（理由登记在 check-gates-wired.cjs 的 EXEMPT 里），
 *     由巡检每轮手动跑一次。本门禁只是那道联网检查的**离线兜底**。
 *   · 下限表只登记**已经中过招、且修复版本查得到**的包；
 *     没登记的包**不代表安全**，只代表「本门禁对它没意见」。
 *   · DEP3 只保证 lockfile 里有哈希；哈希能不能对上取决于 npm 校验时用的源
 *     （本仓的 CI 改为从官方源取包，见 deploy.yml 的安装步骤）。
 *   · DEP5 / DEP6 是**静态**判据：它们读工作流里**写下来的** `node-version`，
 *     判不了 runner 镜像里实际装的是哪一版（那由 `ubuntu-latest` 镜像决定）；
 *     也没法判「Node 22 内部有没有安全更新」—— 底线表记的是**大版本的 EOL 时点**，
 *     不是逐个补丁号。
 *   · 某个依赖的 `engines.node` 写法怪到读不出下限时，本门禁**不**拿它当约束
 *     （依赖的 engines 本来就只是 npm 的建议，默认只警告不报错）⇒
 *     「读不出」在这里是**不约束**，不是「有问题」；但 package.json 自己声明的
 *     `engines.node` 读不出 ⇒ **判红**（本仓自己的声明读不懂 = 判不了）。
 *
 * 环境变量（供 scripts/test-deps.cjs 的注入矩阵用）：
 *   DEPS_ROOT —— 覆盖仓库根（package.json、package-lock.json 与部署工作流
 *                `.github/workflows/deploy.yml` 都从这里读）。
 *                注入只在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.env.DEPS_ROOT || path.join(__dirname, ".."));

/**
 * **依赖下限表**：包名 → 允许的最低版本 + 为什么。
 *
 * 这张表记的是「低于这个版本就中过招」这个**上游事实**，与本仓现在锁哪一版无关
 * ⇒ 放松范围（`^14.1.0`）并顺手改 lockfile，DEP1 照样拦得住。
 *
 * ⚠️ 表里的每条都要能指到**公告编号**（不写下来的理由等于没有理由）。
 */
const DEP_FLOORS = {
  "markdown-it": {
    min: "14.3.3",
    why:
      "GHSA-gfr2-rv44-r23c（high，cvss 7.5）：多行链接引用定义渲染的二次时间 DoS" +
      "（14.0 起的回归，受影响区间 >=14.1.0 <14.3.3）；" +
      "另 GHSA-vfgh-jcmw-g37q（low，cvss 3.7）：开启 html 时内联 HTML 解析的二次时间 DoS" +
      "（受影响区间 <14.3.3；本仓的 markdown-it 开了 html）",
  },
};

/**
 * **CI Node 底线表**：CI 用的 Node 不得低于这个大版本。
 *
 * 与「下限表」是同一个道理：这里记的是**上游事实**（低于这一版就不再收安全更新），
 * 与本仓现在钉哪一版无关 ⇒ 有人把 `package.json` 的 engines 放松、CI 一起降级，
 * DEP5（对照声明）看不出来，DEP6 照样拦得住。
 */
const CI_NODE_FLOOR = {
  min: "22",
  why:
    "Node 20 已于 2026-04-30 结束支持（EOL）（Node 官方 Release 日历：" +
    "https://github.com/nodejs/Release/blob/main/schedule.json）；" +
    "Node 22 撑到 2027-04-30、Node 24 撑到 2028-04-30。" +
    "本仓 build 链里的多档溢出门禁（scripts/check-overflow.cjs）用 CDP over WebSocket，" +
    "而 Node 20 没有全局 WebSocket ⇒ 掉到 20 会以一个**看不懂的错**失败" +
    "（\"WebSocket is not defined\"），而不是告诉你「你把 CI 的 Node 降级了」。",
};

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/** 比较两个版本号（只比数字段）：a < b ⇒ -1，a > b ⇒ 1，相等 ⇒ 0。 */
function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * 一个版本范围里**可能解析到的最低版本**。
 * 取范围里出现的所有版本号里最小的那个 —— 对 `^x` / `~x` / `>=x <y` 这类写法都保守。
 * 认不出来（`*` / `latest` 之类）⇒ 返回 null（**判不出**，不是「没问题」）。
 */
function floorOfRange(range) {
  const tokens = String(range || "").match(/\d+(?:\.\d+)*/g);
  if (!tokens || !tokens.length) return null;
  let min = tokens[0];
  for (const t of tokens) if (compareVersions(t, min) < 0) min = t;
  return min;
}

/** package.json 里某个包声明的范围（dependencies 与 devDependencies 都算）。 */
function declaredRange(pkg, name) {
  const groups = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies];
  for (const g of groups) if (g && Object.prototype.hasOwnProperty.call(g, name)) return g[name];
  return null;
}

/**
 * 从部署工作流里抽出**每一个** `actions/setup-node` 步骤声明的 Node 版本。
 *
 * 返回 `[{ line, versionLine, raw }]`：`raw` 为 null ⇒ 那个步骤**没写** node-version。
 * 注释行（`#` 开头）不算 ⇒ 免得文件里举例用的写法被当成真配置。
 */
function ciNodeSteps(text) {
  const lines = String(text || "").split("\n");
  const steps = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue; // 注释行
    if (/uses:\s*actions\/setup-node@/.test(line)) {
      cur = { line: i + 1, versionLine: null, raw: null };
      steps.push(cur);
      continue;
    }
    if (!cur) continue;
    const m = /^[ \t]*node-version:[ \t]*(.+?)[ \t]*$/.exec(line);
    if (m) {
      cur.raw = m[1].replace(/^["']|["']$/g, "");
      cur.versionLine = i + 1;
      cur = null;
      continue;
    }
    if (/^[ \t]*-[ \t]+(?:name|uses|run|id):/.test(line)) cur = null; // 下一个 step 开始了
  }
  return steps;
}

/**
 * 从 `node-version: 22` 里读出可比较的版本号。
 * 读不出（`lts/*` / 表达式 / 空）⇒ 返回 null —— **判不了**，不是「没问题」。
 */
function parseNodeVersion(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/[${}]/.test(s)) return null; // ${{ ... }} 表达式：静态判不出它求值成什么
  const m = /^v?(\d+(?:\.\d+)*)/.exec(s);
  return m ? m[1] : null;
}

/* ---------------- main：检查本体 ---------------- */

function main() {
  /* 每条判据各留**一个** fail() 调用点（原因收集在数组里）——
     这样自测的红因归属表才能「一条判据对一个唯一文案片段」。 */
  const dep1Reasons = [];
  const dep2Reasons = [];
  const dep4Reasons = [];
  const dep5Reasons = [];
  const dep6Reasons = [];
  /* ---------------- 读文件 ---------------- */

  let pkg = null;
  let lock = null;
  const pkgPath = path.join(ROOT, "package.json");
  const lockPath = path.join(ROOT, "package-lock.json");

  if (!fs.existsSync(pkgPath)) {
    /* 读不到就留 null，由下面 DEP4 那一段统一报出来（这里不重复报）。 */
  } else {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    } catch (e) {
      dep4Reasons.push(`package.json 解析失败：${e.message}`);
    }
  }
  if (!fs.existsSync(lockPath)) {
    /* 同上：读不到就留 null，交给 DEP4 统一报。 */
  } else {
    try {
      lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch (e) {
      dep4Reasons.push(`package-lock.json 解析失败：${e.message}`);
    }
  }

  const lockRoot = (lock && lock.packages && lock.packages[""]) || {};
  const lockPkgs = (lock && lock.packages) || {};

  /* ---------------- DEP1 / DEP2：下限表 ---------------- */

  for (const [name, spec] of Object.entries(DEP_FLOORS)) {
    if (!pkg) break;
    const range = declaredRange(pkg, name);
    if (range === null) continue; // 这个包已经不在仓里了 ⇒ 没有可判的依赖
    const floor = floorOfRange(range);
    if (floor === null) {
      dep1Reasons.push(
        `${name} 的声明下限判不出来（范围写成「${range}」）—— ` +
          `下限表要求它不低于 v${spec.min}；判不出下限不等于安全，请把范围写成带明确下限的写法`
      );
    } else if (compareVersions(floor, spec.min) < 0) {
      dep1Reasons.push(
        `${name} 的声明下限 ${floor} 低于下限表要求的 v${spec.min} —— ${spec.why}；` +
          `把 package.json 的范围收紧到 ^${spec.min} 或更高`
      );
    }

    /* DEP2：lockfile 实际锁定的版本。 */
    const entry = lockPkgs[`node_modules/${name}`];
    if (!entry) {
      dep2Reasons.push(
        `lockfile 里找不到 ${name}（node_modules/${name}）—— 它实际锁了哪一版判不了；` +
          `下限表要求它不低于 v${spec.min}`
      );
    } else if (entry.version && compareVersions(entry.version, spec.min) < 0) {
      dep2Reasons.push(
        `lockfile 里锁定的 ${name}@${entry.version} 低于下限表要求的 v${spec.min} —— ${spec.why}；` +
          `跑 npm install ${name}@^${spec.min} 更新锁文件`
      );
    }
  }

  if (dep1Reasons.length) {
    fail(
      `DEP1 依赖声明的下限低于下限表（${dep1Reasons.length} 处）：` +
        dep1Reasons.join("；") +
        ` —— 下限表记的是「低于这一版就中过招」的上游事实，与本仓现在锁哪一版无关，` +
        `放松范围骗不过它。`
    );
  }
  if (dep2Reasons.length) {
    fail(
      `DEP2 lockfile 实际锁定的版本低于下限表（${dep2Reasons.length} 处）：` +
        dep2Reasons.join("；")
    );
  }

  /* ---------------- DEP3：每个包条目都要带哈希 ---------------- */

  if (lock) {
    const noIntegrity = [];
    for (const [pathKey, entry] of Object.entries(lockPkgs)) {
      if (!pathKey) continue; // 根条目
      if (!entry.resolved) continue; // 没有下载地址的（本地链接 / 手工条目）不适用
      if (!entry.integrity) noIntegrity.push(pathKey);
    }
    if (noIntegrity.length) {
      fail(
        `DEP3 lockfile 里有 ${noIntegrity.length} 个包条目没有 integrity 哈希：` +
          noIntegrity.slice(0, 10).join("、") +
          (noIntegrity.length > 10 ? " …" : "") +
          ` —— 没有哈希，tarball 被替换时 npm 察觉不到；` +
          `重新生成锁文件（npm install --package-lock-only）即可补上。`
      );
    }
  }

  /* ---------------- DEP4：锁文件根声明 ↔ package.json ---------------- */

  if (!pkg) {
    dep4Reasons.push(
      `读不到 package.json（${pkgPath}）—— 「锁文件与声明是否一致」这件事判不了，` +
        `要么文件不在，要么路径变了（门禁要跟着更新）`
    );
  }
  if (!lock) {
    dep4Reasons.push(
      `读不到 package-lock.json（${lockPath}）—— 「锁文件与声明是否一致」这件事判不了，` +
        `要么文件不在，要么路径变了（门禁要跟着更新）`
    );
  }
  if (pkg && lock) {
    for (const group of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const a = pkg[group] || {};
      const b = lockRoot[group] || {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        if (a[k] !== b[k]) {
          dep4Reasons.push(
            `package.json 与 package-lock.json 的 ${group} 声明对不上` +
              `（${k}：package.json 写「${a[k] === undefined ? "（没写）" : a[k]}」，` +
              `锁文件根条目写「${b[k] === undefined ? "（没写）" : b[k]}」）`
          );
        }
      }
    }
  }
  if (dep4Reasons.length) {
    fail(
      `DEP4 锁文件与 package.json 的声明不一致（${dep4Reasons.length} 处）：` +
        dep4Reasons.join("；") +
        ` —— 两者不一致时 **npm ci 直接失败**（CI 的安装步骤会红、站点发不出去），` +
        `而本机（node_modules 已在）看不出来。跑 npm install --package-lock-only 同步。`
    );
  }

  /* ---------------- DEP5 / DEP6：CI 用的 Node 版本 ---------------- */

  /* 读部署工作流 —— CI 在这里声明它用哪个 Node 跑构建。 */
  const workflowPath = path.join(ROOT, ".github/workflows/deploy.yml");
  let workflowText = null;
  if (!fs.existsSync(workflowPath)) {
    dep5Reasons.push(
      `读不到部署工作流（${workflowPath}）—— CI 用哪个 Node 版本判不了；` +
        `要么文件不在，要么路径变了（门禁要跟着更新）`
    );
  } else {
    try {
      workflowText = fs.readFileSync(workflowPath, "utf8");
    } catch (e) {
      dep5Reasons.push(`部署工作流读取失败：${e.message}`);
    }
  }

  const steps = workflowText === null ? [] : ciNodeSteps(workflowText);
  if (workflowText !== null && steps.length === 0) {
    dep5Reasons.push(
      `部署工作流里找不到 actions/setup-node 步骤 —— CI 用哪个 Node 版本判不了` +
        `（runner 镜像自带的版本会随镜像漂移，不受本仓控制）`
    );
  }

  /* 声明侧的要求：package.json 的 engines.node */
  let declaredFloor = null;
  if (pkg && pkg.engines && pkg.engines.node) {
    declaredFloor = floorOfRange(pkg.engines.node);
    if (declaredFloor === null) {
      dep5Reasons.push(
        `package.json 的 engines.node 写成「${pkg.engines.node}」—— 读不出它要求的是哪一版，` +
          `「CI 的 Node 够不够」这件事判不了`
      );
    }
  }

  /* 依赖树侧的要求：lockfile 里各包 engines.node 的**最高**下限 */
  let treeFloor = null;
  let treeWho = "";
  for (const [pathKey, entry] of Object.entries(lockPkgs)) {
    if (!pathKey) continue;
    const engines = entry.engines && entry.engines.node;
    if (!engines) continue;
    const f = floorOfRange(engines);
    if (f === null) continue; // 写法怪 ⇒ 不当约束（见头部「诚实边界」）
    if (treeFloor === null || compareVersions(f, treeFloor) > 0) {
      treeFloor = f;
      treeWho = pathKey;
    }
  }

  /* 逐个 setup-node 步骤核对 */
  const ciVersions = [];
  for (const st of steps) {
    if (st.raw === null) {
      dep5Reasons.push(
        `部署工作流第 ${st.line} 行的 setup-node 步骤没有写 node-version —— ` +
          `它用的是 runner 镜像自带的 Node，判不了`
      );
      continue;
    }
    const v = parseNodeVersion(st.raw);
    if (v === null) {
      dep5Reasons.push(
        `部署工作流第 ${st.versionLine} 行的 node-version 写成「${st.raw}」—— ` +
          `读不出它到底是哪一版，静态判不了`
      );
      continue;
    }
    ciVersions.push({ v, line: st.versionLine });
    if (declaredFloor && compareVersions(v, declaredFloor) < 0) {
      dep5Reasons.push(
        `CI 的 Node ${v}（工作流第 ${st.versionLine} 行）低于 package.json 声明的 ` +
          `engines.node 下限 v${declaredFloor} —— npm 对 engines 不匹配默认只发一条 ` +
          `EBADENGINE 警告、**安装照样成功** ⇒ 声明与实际跑的运行时脱节，没人看得见`
      );
    }
    if (treeFloor && compareVersions(v, treeFloor) < 0) {
      dep5Reasons.push(
        `CI 的 Node ${v}（工作流第 ${st.versionLine} 行）低于依赖树要求的 v${treeFloor}` +
          `（${treeWho} 声明 engines.node）—— 这个依赖在这个运行时上不受支持`
      );
    }
    if (compareVersions(v, CI_NODE_FLOOR.min) < 0) {
      dep6Reasons.push(
        `CI 的 Node ${v}（工作流第 ${st.versionLine} 行）低于底线表要求的 v${CI_NODE_FLOOR.min} —— ` +
          CI_NODE_FLOOR.why
      );
    }
  }

  /* 各步骤必须用同一个版本：构建产物用的运行时与核查线上产物用的运行时不该是两回事。 */
  if (ciVersions.length > 1) {
    const first = ciVersions[0].v;
    if (ciVersions.some((x) => compareVersions(x.v, first) !== 0)) {
      dep5Reasons.push(
        `部署工作流里各个 setup-node 步骤用的 Node 版本不一致` +
          `（${ciVersions.map((x) => `第 ${x.line} 行是 ${x.v}`).join("、")}）—— ` +
          `构建产物用的运行时与核查线上产物用的运行时可能不是同一个`
      );
    }
  }

  if (dep5Reasons.length) {
    fail(
      `DEP5 CI 用的 Node 版本与声明/依赖树的要求对不上（${dep5Reasons.length} 处）：` +
        dep5Reasons.join("；") +
        ` —— 别和 scripts/check-deploy-target.cjs 的 DP7 混起来：DP7 管的是 action 的` +
        `**执行运行时**（上游 action.yml 的 runs.using），**不是** CI 自己跑的 Node。`
    );
  }
  if (dep6Reasons.length) {
    fail(
      `DEP6 CI 用的 Node 版本低于底线表（${dep6Reasons.length} 处）：` +
        dep6Reasons.join("；") +
        ` —— 底线表记的是「低于这一版就不再收安全更新」的上游事实，` +
        `与本仓现在钉哪一版无关（与 DEP1 的下限表同一个道理）。`
    );
  }

  /* ---------------- 汇总 ---------------- */
  if (problems.length) {
    console.error("依赖体检门禁未通过：\n");
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    console.error("");
    console.error("  判据出处：docs/DEFECT-BACKLOG.md D105（2026-10-27 实测：npm audit 打在镜像源上，");
    console.error("  advisories 接口未实现 ⇒ 依赖漏洞检查从未真正跑过，markdown-it 的 high 级公告因此漏了半年）。");
    console.error("");
    process.exit(1);
  }

  const floorNames = Object.keys(DEP_FLOORS).join(" / ");
  console.log(
    `依赖体检门禁通过：${Object.keys(lockPkgs).length - 1} 个锁定包条目全部带 integrity 哈希，` +
      `锁文件与 package.json 的声明逐字一致。`
  );
  console.log(
    `  · 下限表已登记 ${floorNames} —— 声明下限与实际锁定版本都不得低于表里的修复版本。`
  );
  if (steps.length) {
    console.log(
      `  · CI 的 Node：工作流里 ${steps.length} 个 setup-node 步骤都写的是 Node ` +
        `${ciVersions.map((x) => x.v).join(" / ")}，同时满足 package.json 的 engines.node` +
        `${declaredFloor ? `（下限 v${declaredFloor}）` : ""}` +
        `${treeFloor ? `、依赖树下限 v${treeFloor}` : ""}，且不低于底线表 v${CI_NODE_FLOOR.min}。`
    );
  }
  console.log(
    `  · 本门禁是**离线**的：它判不了「当前版本有没有已知漏洞」—— ` +
      `那需要联网取公告库，由 scripts/check-dep-audit.cjs（DA1）负责，` +
      `**不接进 build 链**（build 链保持零网络依赖）。`
  );

}

/* 直接运行时执行检查；被 require 时只导出工具函数（自测要读下限表）。 */
const EXPORTS = {
  DEP_FLOORS,
  CI_NODE_FLOOR,
  compareVersions,
  floorOfRange,
  declaredRange,
  ciNodeSteps,
  parseNodeVersion,
};
if (require.main === module) {
  main();
  module.exports = EXPORTS;
} else {
  module.exports = EXPORTS;
}
