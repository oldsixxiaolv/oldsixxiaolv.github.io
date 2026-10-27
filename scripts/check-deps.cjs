#!/usr/bin/env node
/**
 * 依赖体检门禁 —— 判据 DEP1–DEP4（**离线**，不联网）。
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
 *
 * 环境变量（供 scripts/test-deps.cjs 的注入矩阵用）：
 *   DEPS_ROOT —— 覆盖仓库根（package.json 与 package-lock.json 都从这里读）。
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

/* ---------------- main：检查本体 ---------------- */

function main() {
  /* 三条判据各留**一个** fail() 调用点（原因收集在数组里）——
     这样自测的红因归属表才能「一条判据对一个唯一文案片段」。 */
  const dep1Reasons = [];
  const dep2Reasons = [];
  const dep4Reasons = [];
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
  console.log(
    `  · 本门禁是**离线**的：它判不了「当前版本有没有已知漏洞」—— ` +
      `那需要联网取公告库，由 scripts/check-dep-audit.cjs（DA1）负责，` +
      `**不接进 build 链**（build 链保持零网络依赖）。`
  );

}

/* 直接运行时执行检查；被 require 时只导出工具函数（自测要读下限表）。 */
if (require.main === module) {
  main();
  module.exports = { DEP_FLOORS, compareVersions, floorOfRange, declaredRange };
} else {
  module.exports = { DEP_FLOORS, compareVersions, floorOfRange, declaredRange };
}
