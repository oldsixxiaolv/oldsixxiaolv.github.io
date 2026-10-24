#!/usr/bin/env node
/**
 * scripts/test-verify-site.cjs —— verify-site.cjs 的常驻自测（第一版）
 *
 * 为什么要有这个：verify-site.cjs 是全站门禁的**总汇**，34 条判据、
 * 133 处 fail() 调用点。编号化之后它自己就变成了一类新的风险面：
 *   · 红因不带门禁号 ⇒ 一屏几十条报错时没人说得清是哪条判据报的；
 *   · 可卸开关不被消费 ⇒ 「卸掉一条判据」根本不会发生，
 *     判据级负对照全是假绿；
 *   · 比较点目录动态生成 ⇒ 整块判据被摘掉时它连同自己的比较点一起消失，
 *     覆盖度自证反而判绿 ⇒ 自证被自己拆掉。
 * 这三件事**都不会**让任何页面检查变红，build 照样全绿 ——
 * 门禁还在，只是不判了。所以必须有**常驻**自测盯着它们。
 *
 * 本自测做四件事：
 *   ① 基线档：未改动的副本必须 exit 0、零问题（证明沙箱本身是可信的）。
 *   ② 注入档（每条门禁一档）：在**那条门禁自己的段首**插一条 fail()，
 *      断言红因的门禁号集合**恰好**是 {该门禁} —— 既证明红因可归属，
 *      也证明别的门禁没被牵连（红因归属纯净）。
 *   ③ 负对照档（每条门禁一档）：同一份注入 + 把该门禁的开关置 false，
 *      断言该门禁的红因**消失**（此时应当零问题、exit 0）——
 *      这证明开关真的被 fail() 消费，而不是个摆设。
 *   ④ 精准性档：故意破坏覆盖度自证自己的三条判据（判据条数下限 /
 *      开关消费 / 目录静态性），断言门禁 33 必须报红；
 *      外加一条「退回旧口径」档，证明红因格式断言不是摆设。
 *
 * 沙箱怎么搭（关键：不用从零造假站）：
 *   产物用**真实 _site 的副本**（只读，一份就够，门禁只读产物）；
 *   源码侧每档一份独立沙箱目录（门禁副本 + 三个 lib + 三个 src 小文件）。
 *   ⚠️ 门禁 18 要用**真实 git 提交时间**核对 sitemap 的 <lastmod>，
 *      而沙箱不是 git 仓 ⇒ 必须用 METEO_REPO_ROOT 把真仓库借进来；
 *      不设这个变量的话，门禁 18 会走「不在 git 仓库里而 sitemap 带
 *      lastmod」的兜底分支 ⇒ 基线就红 ⇒ 整份自测变成自说自话。
 *
 * 用法：node scripts/test-verify-site.cjs   （有问题 exit 1）
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..");
const GATE_SRC = path.join(__dirname, "verify-site.cjs");
const SITE_SRC = path.join(REPO_ROOT, "_site");

// 沙箱里要复制的源码小文件（路径一律用 path.join 拼，不写本地 require 语法）
const SANDBOX_FILES = [
  ["scripts", "lib", "git-error.cjs"],
  ["scripts", "lib", "page-deps.cjs"],
  ["scripts", "lib", "identity.cjs"],
  ["src", "_data", "site.js"],
  ["src", "404.njk"],
  ["src", "robots.njk"],
];

// 门禁段的首行标记（与门禁 24 的提取规则一致）
const BANNER_RE = /^\s*(?:\/\/|\/\* -+)\s*(\d+[a-z]?)[.)]\s/;
const RED_CAUSE_RE = /^\s*门禁 (\d+[a-z]?)：\s*(.+)$/;

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "mh-vs-selftest-"));
const SITE_COPY = path.join(SANDBOX, "_site");

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** 替换必须真的命中，否则断言会变成空跑。 */
function mustReplace(src, needle, repl, label) {
  if (!src.includes(needle)) throw new Error("替换锚点未命中: " + label);
  if (src.split(needle).length - 1 > 1) throw new Error("替换锚点不唯一: " + label);
  return src.replace(needle, repl);
}

function bannerEndLine(lines, startIdx) {
  const raw = lines[startIdx];
  if (/^\s*\/\//.test(raw)) return startIdx;
  if (raw.includes("*/")) return startIdx;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (lines[j].includes("*/")) return j;
  }
  throw new Error("段注释没有闭合: " + raw);
}

/** 在指定门禁段的首行（段注释之后）插入一行文本。 */
function injectAtBanner(src, gateId, text) {
  const lines = src.split("\n");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(BANNER_RE);
    if (m && m[1] === gateId) {
      idx = i;
      break;
    }
  }
  if (idx < 0) throw new Error("源码里找不到门禁段: " + gateId);
  const end = bannerEndLine(lines, idx);
  const indent = (lines[idx].match(/^\s*/) || [""])[0];
  lines.splice(end + 1, 0, indent + text);
  return lines.join("\n");
}

/** 把某条门禁的开关置 false（模拟「卸掉这条判据」）。 */
function flipSwitch(src, gateId) {
  const needle = `const G${gateId}_ON = true;`;
  const i = src.indexOf(needle);
  if (i < 0) throw new Error("源码里找不到开关: " + gateId);
  if (src.indexOf(needle, i + 1) >= 0) throw new Error("开关不唯一: " + gateId);
  return src.slice(0, i) + `const G${gateId}_ON = false;` + src.slice(i + needle.length);
}

/** 把第一条属于该门禁的 fail() 调用换成一个空函数调用（判据条数 -1）。 */
function neuterFirstFail(src, gateId) {
  const needle = `fail("${gateId}",`;
  const i = src.indexOf(needle);
  if (i < 0) throw new Error("源码里找不到判据: " + gateId);
  return (
    src.slice(0, i) +
    `report("${gateId}",` +
    src.slice(i + needle.length)
  );
}

// ---------------------------------------------------------------------------
// 沙箱
// ---------------------------------------------------------------------------
function makeCaseDir(caseId, gateSource) {
  const dir = path.join(SANDBOX, "cases", caseId);
  fs.mkdirSync(path.join(dir, "scripts", "lib"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src", "_data"), { recursive: true });
  for (const parts of SANDBOX_FILES) {
    const from = path.join(REPO_ROOT, ...parts);
    const to = path.join(dir, ...parts);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    // ⚠️ 必须保留 mtime：门禁 17 拿「src/robots.njk 的最后修改时间」跟产物里的
    //    "generated-at"（构建时刻）比 —— 复制把 mtime 抹成"现在"的话，
    //    门禁 17 会说「构建时间早于源文件修改时间」⇒ 沙箱基线就红，
    //    整份自测变成自说自话（实测踩到过）。
    fs.cpSync(from, to, { preserveTimestamps: true });
  }
  fs.writeFileSync(path.join(dir, "scripts", "verify-site.cjs"), gateSource);
  return dir;
}

// ⚠️ 必须用**异步** execFile：门禁每档要跑 2 秒多（门禁 18 要逐页查 git
//    提交时间），同步 spawnSync 会让 4 个 worker 退化成串行 ⇒ 整份自测
//    从 ~45 秒变成 ~3 分钟。异步之后才是真并发。
function runGate(caseDir, siteDir) {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      SITE_DIR: siteDir || SITE_COPY,
      METEO_REPO_ROOT: REPO_ROOT,
    });
    execFile(
      process.execPath,
      [path.join(caseDir, "scripts", "verify-site.cjs")],
      { env, encoding: "utf8", cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const out = stdout || "";
        const errText = stderr || "";
        const code = err ? (typeof err.code === "number" ? err.code : 1) : 0;
        const causes = [];
        for (const line of errText.split("\n")) {
          const m = line.match(RED_CAUSE_RE);
          if (m) causes.push({ id: m[1], msg: m[2].trim() });
        }
        resolve({ code, stdout: out, stderr: errText, causes });
      }
    );
  });
}

// ---------------------------------------------------------------------------
// 档位定义
// ---------------------------------------------------------------------------
const GATE_IDS = (() => {
  const src = fs.readFileSync(GATE_SRC, "utf8");
  const ids = [];
  for (const line of src.split("\n")) {
    const m = line.match(BANNER_RE);
    if (m) ids.push(m[1]);
  }
  return ids;
})();

const cases = [];
function addCase(id, title, build, check, opts) {
  cases.push({ id, title, build, check, opts: opts || {} });
}

const PRISTINE = fs.readFileSync(GATE_SRC, "utf8");
const PRISTINE_SHA = sha256(PRISTINE);

// ① 基线档
addCase("G-BASE", "基线：未改动的副本必须零问题", () => PRISTINE, (r) => {
  if (r.code !== 0) return `基线必须 exit 0，实为 ${r.code}：${r.stderr.slice(0, 400)}`;
  if (r.causes.length) return `基线不该有红因，实为 ${r.causes.length} 条`;
  return null;
});

// ②③ 每条门禁一档注入 + 一档负对照
for (const gid of GATE_IDS) {
  addCase(`INJ-${gid}`, `注入：门禁 ${gid} 的红因必须归属到自己`, () =>
    injectAtBanner(PRISTINE, gid, `fail("${gid}", "自测注入的红因");`), (r) => {
      const ids = [...new Set(r.causes.map((c) => c.id))].sort();
      if (r.code === 0) return "注入后必须 exit 1，却 exit 0";
      if (!ids.includes(gid)) return `红因里没有门禁 ${gid}（实到 ${ids.join(",") || "无"}）`;
      if (ids.length !== 1) return `红因归属不纯净：出现了 ${ids.join(",")}，期望只有 ${gid}`;
      for (const c of r.causes) {
        if (!c.msg) return `门禁 ${gid} 的红因正文为空`;
      }
      return null;
    });

  addCase(`NEG-${gid}`, `负对照：卸掉门禁 ${gid} 的开关后它的红因必须消失`, () =>
    flipSwitch(injectAtBanner(PRISTINE, gid, `fail("${gid}", "自测注入的红因");`), gid), (r) => {
      if (r.causes.some((c) => c.id === gid)) return `门禁 ${gid} 的红因没有被开关压住`;
      if (r.code !== 0) {
        const others = [...new Set(r.causes.map((c) => c.id))].sort();
        return `卸掉开关后应零问题，却 exit ${r.code}（还有门禁 ${others.join(",")}）`;
      }
      return null;
    });
}

// ④ 精准性档：破坏覆盖度自证自己的判据，门禁 33 必须报红
addCase("P-33a", "精准性：门禁 32 少一条判据 ⇒ 覆盖度自证必须报红", () =>
  injectAtBanner(
    neuterFirstFail(PRISTINE, "32"),
    "32",
    "const report = () => {};"
  ), (r) => {
    const ids = [...new Set(r.causes.map((c) => c.id))].sort();
    if (!ids.includes("33")) return `覆盖度自证没报红（实到 ${ids.join(",") || "无"}）`;
    if (ids.length !== 1) return `红因归属不纯净：${ids.join(",")}`;
    return null;
  });

addCase("P-33b", "精准性：fail() 不再消费开关表 ⇒ 覆盖度自证必须报红", () =>
  mustReplace(
    PRISTINE,
    "  if (SWITCH_ON[gateId] === false) return;",
    "  if (false) return;",
    "fail() 的开关消费行"
  ), (r) => {
    const ids = [...new Set(r.causes.map((c) => c.id))].sort();
    if (!ids.includes("33")) return `覆盖度自证没报红（实到 ${ids.join(",") || "无"}）`;
    if (ids.length !== 1) return `红因归属不纯净：${ids.join(",")}`;
    return null;
  });

addCase("P-33c", "精准性：比较点目录少登记一项 ⇒ 覆盖度自证必须报红", () =>
  mustReplace(PRISTINE, '"32": 15,', "", "比较点目录里的 32 号"), (r) => {
    const ids = [...new Set(r.causes.map((c) => c.id))].sort();
    if (!ids.includes("33")) return `覆盖度自证没报红（实到 ${ids.join(",") || "无"}）`;
    if (ids.length !== 1) return `红因归属不纯净：${ids.join(",")}`;
    return null;
  });

// ⑤ 退回旧口径：红因不带门禁号时，格式断言必须不成立（证明它不是摆设）
addCase("R-1", "退回旧口径：红因若不带门禁号，格式断言必须失效", () =>
  injectAtBanner(
    mustReplace(
      PRISTINE,
      "  problems.push(`门禁 ${gateId}：${msg}`);",
      "  problems.push(msg);",
      "fail() 的红因前缀"
    ),
    "8",
    'fail("8", "自测注入的红因");'
  ), (r) => {
    const ids = [...new Set(r.causes.map((c) => c.id))].sort();
    if (ids.length) return `旧口径下不该解析出门禁号，却解析出 ${ids.join(",")}`;
    const raw = r.stderr.split("\n").filter((l) => l.includes("自测注入的红因"));
    if (!raw.length) return "旧口径下没看到注入的红因";
    return null;
  });

// ⑥ 前提不在场：产物里没有 HTML 页 ⇒ 每页检查必须**显式豁免**，
//    而不是「悄悄不跑」（悄悄不跑 ⇒ 覆盖度自证必须报红）。
addCase("R-2", "退回旧口径：产物为空时每页检查必须显式豁免，不能悄悄不跑", () => PRISTINE, (r) => {
    const ids = [...new Set(r.causes.map((c) => c.id))].sort();
    const notRun = r.causes.filter((c) => c.msg.includes("这一轮没有真的跑过"));
    if (notRun.length) return "每页检查被显式豁免了，覆盖度自证不该报「没真的跑过」";
    if (!ids.includes("5")) return `空产物下门禁 5（缺 sitemap.xml）本该报红，实到 ${ids.join(",") || "无"}`;
    return null;
  }, { emptySite: true });

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------
function runCase(c) {
  let dir;
  try {
    dir = makeCaseDir(c.id, c.build());
  } catch (e) {
    return Promise.resolve({
      id: c.id,
      title: c.title,
      ok: false,
      detail: "构造沙箱失败：" + e.message,
    });
  }
  let siteDir = SITE_COPY;
  if (c.opts && c.opts.emptySite) {
    siteDir = path.join(SANDBOX, "empty-site");
    fs.mkdirSync(siteDir, { recursive: true });
  }
  return runGate(dir, siteDir).then((r) => {
    let detail = null;
    try {
      detail = c.check(r);
    } catch (e) {
      detail = "断言执行失败：" + e.message;
    }
    return { id: c.id, title: c.title, ok: detail === null, detail };
  });
}

function main() {
  if (!fs.existsSync(SITE_SRC)) {
    console.error(`✗ 找不到产物目录 ${SITE_SRC}，请先运行 npm run build`);
    process.exit(1);
  }
  fs.cpSync(SITE_SRC, SITE_COPY, { recursive: true, preserveTimestamps: true });

  const results = [];
  const CONCURRENCY = 4;
  let next = 0;
  async function worker() {
    while (next < cases.length) {
      const c = cases[next++];
      // 必须 await：runCase 返回 Promise，不 await 的话 results 里全是 Promise，
      // 后面 r.ok / r.id / r.detail 全是 undefined ⇒ 每档都误判成失败。
      results.push(await runCase(c));
    }
  }
  return Promise.all([worker(), worker(), worker(), worker()]).then(() => {
    const order = new Map(cases.map((c, i) => [c.id, i]));
    results.sort((a, b) => order.get(a.id) - order.get(b.id));
    let bad = 0;
    for (const r of results) {
      if (r.ok) {
        console.log(`  ✓ ${r.id}  ${r.title}`);
      } else {
        bad++;
        console.log(`  ✗ ${r.id}  ${r.title}`);
        console.log(`      ${r.detail}`);
      }
    }
    // 收尾：门禁原件必须一字未改（自测只读它、只改副本）
    const after = sha256(fs.readFileSync(GATE_SRC));
    if (after !== PRISTINE_SHA) {
      bad++;
      console.log("  ✗ G-IMMUT  门禁原件被自测改动了（sha256 变了）");
    } else {
      console.log("  ✓ G-IMMUT  门禁原件一字未改");
    }
    console.log("");
    if (bad) {
      console.error(`✗ verify-site 自测未通过：${bad}/${results.length + 1} 档有问题`);
      process.exit(1);
    }
    console.log(`✓ verify-site 自测全部通过（${results.length + 1} 档）`);
  });
}

main().catch((e) => {
  console.error("✗ 自测自身崩了：" + (e && e.stack ? e.stack : e));
  process.exit(1);
});
