#!/usr/bin/env node
/**
 * 发布落点门禁的**自测** —— 四件套。
 *
 * 这道门禁判的是「文档发布命令 ↔ 本地 git 远端配置 ↔ 文档声明」三者的一致性，
 * 而「注入没生效」「改的是副本还是原件」「门禁自己被卸掉了」恰恰是最容易发生、
 * 也最不容易看出来的失败模式。所以自测必须回答四件事：
 *
 *   一、红因归属表 —— 门禁的 8 处 fail() 调用逐条登记判据号与**唯一文案片段**。
 *   二、归属纯净 —— 运行时的每一条红因必须**恰好**被一条归属认领；
 *      判据集合必须**恰为**期望值（多一条、少一条都算失败）。
 *   三、覆盖度自证 —— 门禁的 fail() 调用点与归属表**双向**对齐；
 *      门禁解析出的判据集合与静态清单一致；每条红因、每条判据都至少一档判红。
 *   四、判据级负对照 —— 在门禁**副本**里把某条判据卸掉
 *      （给它那一条 fail() 调用同行加 `if (false) ` 前缀，**行数不变**），
 *      对应夹具必须转绿 ⇒ 证明那条红确实是它判出来的，而不是别的判据顺带报出来的。
 *
 * 注入全程只在 /tmp 副本上做；仓库里的文件一个字节都不动（末尾有 sha256 自证）。
 *
 * 用法：node scripts/test-deploy-target.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-deploy-target.cjs");

/* ========== 一、红因归属表：判据 → 唯一文案片段 ========== */

const CAUSES = [
  { id: "DP1", crit: "DP1", frag: "发布命令里的远端" },
  { id: "DP2", crit: "DP2", frag: "与文档声明的发布仓库对不上" },
  { id: "DP3a", crit: "DP3", frag: "分支不在部署工作流的触发分支里" },
  { id: "DP3b", crit: "DP3", frag: "读不到部署工作流的触发分支" },
  { id: "DP4a", crit: "DP4", frag: "一条发布命令都没检出" },
  { id: "DP4b", crit: "DP4", frag: "一个远端都没检出" },
  { id: "DP4c", crit: "DP4", frag: "一处发布仓库声明都没检出" },
  { id: "DP4d", crit: "DP4", frag: "要扫的活文档不在" },
];
/** 静态判据清单（门禁里应当且仅应当有这些判据）。 */
const CRITERIA = ["DP1", "DP2", "DP3", "DP4"];

/* ========== 工具 ========== */

/** 扫出源码里所有 fail() 调用点（单行/多行、模板字面量/引号都吃）。 */
const FAIL_RE = /(?<![.\w$])fail\s*\(\s*(?:`([^`]*)`|"([^"]*)"|'([^']*)')/g;
function scanFailCalls(src) {
  const out = [];
  for (const m of src.matchAll(FAIL_RE)) {
    const literal = m[1] ?? m[2] ?? m[3] ?? "";
    out.push({
      index: m.index,
      literal,
      crit: (literal.match(/^\s*(DP\d+)\b/) || [])[1] || "",
    });
  }
  return out;
}

/** 门禁输出里每条红因起头都是 "  ✗ "。 */
function causeHeads(out) {
  return out.split("\n").filter((l) => /^\s*✗\s/.test(l));
}

/** 归属：每条红因必须**恰好**被一条归属认领；返回判据集合。 */
function attribute(out) {
  const rows = causeHeads(out).map((line) => ({
    line,
    owners: CAUSES.filter((c) => line.includes(c.frag)),
  }));
  const impure = rows.find((r) => r.owners.length !== 1) || null;
  const crits = [
    ...new Set(rows.filter((r) => r.owners.length === 1).map((r) => r.owners[0].crit)),
  ].sort();
  return { rows, crits, impure };
}

function replaceOnce(text, from, to) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`注入锚点出现 ${n} 次（应恰好 1 次）：「${from.slice(0, 36)}…」`);
  return text.replace(from, to);
}

/* ========== 夹具 ========== */

/** 夹具里的「发布仓库声明」与「发布命令」。 */
const GOOD_URL = "git@github.com:oldsixxiaolv/oldsixxiaolv.github.io.git";
const OTHER_URL = "git@github.com:oldsixxiaolv/some-other-repo.git";
const PUBLISH_REPO = "oldsixxiaolv/oldsixxiaolv.github.io";
const README_DECL = `本项目部署在**用户站仓库** \`${PUBLISH_REPO}\`，内容铺在域名根 \`/\`。`;
const DEPLOY_DECL = `- 仓库：\`${PUBLISH_REPO}\`（**用户站仓库**，内容铺在域名根 \`/\`）`;

const README_BASE = [
  "# 夹具 README",
  "",
  README_DECL,
  "",
  "## 日常发布",
  "",
  "```bash",
  "git push origin main",
  "```",
  "",
].join("\n");

const DEPLOY_BASE = [
  "# 夹具部署说明",
  "",
  DEPLOY_DECL,
  "",
  "## 二、日常发布",
  "",
  "```bash",
  "git push origin main",
  "```",
  "",
].join("\n");

const WORKFLOW_YML = [
  "name: Deploy MeteoHub",
  "",
  "on:",
  "  push:",
  "    branches: [main]",
  "  workflow_dispatch: {}",
  "",
  "permissions:",
  "  contents: read",
  "",
].join("\n");

/* ========== 副本构造 ========== */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-deploytarget-selftest-"));

/** 建一个独立夹具（临时 git 仓 + 合成文档），在副本上注入。 */
function buildFixture(mutate) {
  const state = {
    readme: README_BASE,
    deploy: DEPLOY_BASE,
    remote: GOOD_URL,
    workflow: WORKFLOW_YML,
  };
  if (mutate) mutate(state);
  const dir = fs.mkdtempSync(path.join(tmp, "case-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".github", "workflows"), { recursive: true });
  if (state.readme !== null) fs.writeFileSync(path.join(dir, "README.md"), state.readme);
  if (state.deploy !== null) fs.writeFileSync(path.join(dir, "docs", "DEPLOY.md"), state.deploy);
  if (state.workflow !== null) {
    fs.writeFileSync(path.join(dir, ".github", "workflows", "deploy.yml"), state.workflow);
  }
  const quiet = { stdio: ["ignore", "ignore", "ignore"] };
  execFileSync("git", ["init", "-q"], { cwd: dir, ...quiet });
  if (state.remote !== null) {
    execFileSync("git", ["remote", "add", "origin", state.remote], { cwd: dir, ...quiet });
  }
  return dir;
}

/** 跑一次门禁（夹具通过 DPT_ROOT 注入）。 */
function runGate(gatePath, fixtureDir) {
  const env = { ...process.env, DPT_ROOT: fixtureDir };
  const r = spawnSync(process.execPath, [gatePath], { env, encoding: "utf8", cwd: ROOT });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/* ========== 注入档 ========== */

const MUT = {
  /** 发布命令的远端改成一个不存在的名字 ⇒ DP1。 */
  remoteMissing: (s) => {
    s.readme = replaceOnce(s.readme, "git push origin main", "git push nosuchremote main");
    s.deploy = replaceOnce(s.deploy, "git push origin main", "git push nosuchremote main");
  },
  /** 远端存在，但指向别的仓库 ⇒ DP2。 */
  remoteWrongRepo: (s) => {
    s.remote = OTHER_URL;
  },
  /** 发布命令推到不触发部署的分支 ⇒ DP3。 */
  branchNotTriggered: (s) => {
    s.readme = replaceOnce(s.readme, "git push origin main", "git push origin release");
    s.deploy = replaceOnce(s.deploy, "git push origin main", "git push origin release");
  },
  /** 发布命令被删光 ⇒ DP4。 */
  commandsWiped: (s) => {
    s.readme = replaceOnce(s.readme, "git push origin main", "");
    s.deploy = replaceOnce(s.deploy, "git push origin main", "");
  },
  /** 部署工作流缺失 ⇒ 触发分支读不到（DP3 判不了，必须报出来）。 */
  workflowMissing: (s) => {
    s.workflow = null;
  },
  /** 一个远端都没有（同时删掉发布命令，否则 DP1 会先报出来） ⇒ DP4。 */
  noRemotes: (s) => {
    s.remote = null;
    s.readme = replaceOnce(s.readme, "git push origin main", "");
    s.deploy = replaceOnce(s.deploy, "git push origin main", "");
  },
  /** 发布仓库声明被删光 ⇒ DP4。 */
  declarationWiped: (s) => {
    s.readme = replaceOnce(s.readme, README_DECL, "本项目部署在 GitHub Pages 上，内容铺在域名根 `/`。");
    s.deploy = replaceOnce(s.deploy, DEPLOY_DECL, "- 仓库信息见 README。");
  },
  /** 活文档缺一份（docs/DEPLOY.md 不在） ⇒ DP4。 */
  docMissing: (s) => {
    s.deploy = null;
  },
};

/** 注入档：expect=null 表示期望判绿，否则期望判红且判据集合**恰为** expect。 */
const CASES = [
  { id: "N0", label: "基线（临时 git 仓 + 合成文档）", mutate: null, expect: null },
  { id: "N1", label: "发布命令的远端改成不存在的名字", mutate: MUT.remoteMissing, expect: ["DP1"] },
  { id: "N2", label: "远端存在但指向别的仓库", mutate: MUT.remoteWrongRepo, expect: ["DP2"] },
  { id: "N3", label: "发布命令推到不触发部署的分支", mutate: MUT.branchNotTriggered, expect: ["DP3"] },
  { id: "N4", label: "发布命令被删光", mutate: MUT.commandsWiped, expect: ["DP4"] },
  { id: "N5", label: "部署工作流缺失（触发分支读不到）", mutate: MUT.workflowMissing, expect: ["DP3"] },
  { id: "N6", label: "远端全空（且发布命令删光）", mutate: MUT.noRemotes, expect: ["DP4"] },
  { id: "N7", label: "发布仓库声明被删光", mutate: MUT.declarationWiped, expect: ["DP4"] },
  { id: "N8", label: "活文档缺一份（docs/DEPLOY.md 不在）", mutate: MUT.docMissing, expect: ["DP4"] },
];

/* ========== 四、判据级负对照 ========== */

/** 在门禁副本里卸掉某条判据：给它每一条 fail() 调用**同行**加 `if (false) ` 前缀。 */
function unloadCriterion(src, calls, crit) {
  const targets = calls.filter((c) => c.crit === crit);
  let out = src;
  for (const t of targets.slice().reverse()) {
    out = out.slice(0, t.index) + "if (false) " + out.slice(t.index);
  }
  return { src: out, count: targets.length };
}

/* ========== 执行 ========== */

let failed = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failed += 1;
};

const gateSrc = fs.readFileSync(GATE, "utf8");
const calls = scanFailCalls(gateSrc);
const seenCauses = new Set();
const seenCriteria = new Set();

/** 仓库真源（门禁 + 两份活文档 + package.json）的整体指纹：自测前后必须一致。 */
function repoDigest() {
  const h = crypto.createHash("sha256");
  for (const p of [GATE, path.join(ROOT, "README.md"), path.join(ROOT, "docs", "DEPLOY.md"), path.join(ROOT, "package.json")]) {
    h.update(p).update(fs.existsSync(p) ? fs.readFileSync(p) : "<missing>");
  }
  return h.digest("hex");
}
const REAL_DIGEST = repoDigest();

/** 跑一档注入并核对：判红/判绿、门禁确实跑到自己的结论、归属纯净、判据集合恰为。 */
function checkCase(spec, fixtureDir, gatePath) {
  const r = runGate(gatePath, fixtureDir);
  const a = attribute(r.out);
  if (a.impure) {
    bad(`${spec.id} ${spec.label} → 有红因无法唯一归类（匹配到 ${a.impure.owners.length} 条归属）：${a.impure.line.trim().slice(0, 90)}`);
    return;
  }
  if (spec.expect === null) {
    if (r.code !== 0 || !r.out.includes("发布落点门禁通过")) {
      bad(`${spec.id} ${spec.label} → 期望判绿（exit 0），实测 exit ${r.code}`);
      console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
      return;
    }
    if (a.rows.length !== 0) {
      bad(`${spec.id} ${spec.label} → 判绿但仍有 ${a.rows.length} 条红因`);
      return;
    }
    ok(`${spec.id} ${spec.label} → 判绿 exit 0，零红因`);
    return;
  }
  if (r.code !== 1 || !r.out.includes("发布落点门禁未通过")) {
    bad(`${spec.id} ${spec.label} → 期望门禁自己报红（exit 1），实测 exit ${r.code}（非 1 说明门禁崩了，不是判红）`);
    console.log(r.out.split("\n").slice(0, 4).join("\n"));
    return;
  }
  if (a.crits.join(",") !== spec.expect.join(",")) {
    bad(`${spec.id} ${spec.label} → 判据集合应为恰为 {${spec.expect.join(", ")}}，实测 {${a.crits.join(", ") || "空"}}`);
    console.log(a.rows.map((x) => x.line.trim().slice(0, 110)).join("\n"));
    return;
  }
  for (const row of a.rows) seenCauses.add(row.owners[0].id);
  for (const c of a.crits) seenCriteria.add(c);
  ok(`${spec.id} ${spec.label} → 判红 exit 1，判据集合恰为 {${a.crits.join(", ")}}，红因 ${a.rows.length} 条`);
}

console.log("发布落点门禁 · 自测（四件套）：\n");

/* ---- 一、红因归属表 ---- */
console.log("一、红因归属表");
{
  const bads = [];
  for (let a = 0; a < CAUSES.length; a++) {
    for (let b = 0; b < CAUSES.length; b++) {
      if (a !== b && CAUSES[a].frag.includes(CAUSES[b].frag)) bads.push(`${CAUSES[a].id}⊃${CAUSES[b].id}`);
    }
  }
  if (bads.length) bad(`文案片段互不包含：${bads.join("、")}`);
  else ok(`${CAUSES.length} 条红因归属登记（${CAUSES.map((c) => c.id).join(" / ")}），文案片段互不包含`);

  const orphan = CAUSES.filter((c) => !CRITERIA.includes(c.crit));
  if (orphan.length) bad(`归属里有不在静态清单里的判据：${orphan.map((c) => c.id).join("、")}`);
  else ok(`每条归属的判据都在静态清单 ${JSON.stringify(CRITERIA)} 内`);

  const noCause = CRITERIA.filter((c) => !CAUSES.some((x) => x.crit === c));
  if (noCause.length) bad(`静态清单里的判据没有红因归属：${noCause.join("、")}`);
  else ok("静态清单里的每条判据都至少有一条红因归属");
}

/* ---- 二、覆盖度自证（先做，因为注入档要用它校验） ---- */
console.log("\n二、覆盖度自证");
{
  const owners = calls.map((c) => CAUSES.filter((x) => c.literal.includes(x.frag)));
  const multi = owners.map((o, i) => ({ i, o })).filter((x) => x.o.length !== 1);
  if (multi.length) {
    bad(`有 ${multi.length} 个 fail() 调用点没能唯一归属：${multi.map((m) => m.i).join(", ")}`);
  } else {
    ok(`门禁的 ${calls.length} 个 fail() 调用点逐个唯一归属（双向对齐）`);
  }

  if (calls.length !== CAUSES.length) {
    bad(`门禁 fail() 调用点数 ${calls.length} != 归属表 ${CAUSES.length} 条`);
  } else {
    ok(`调用点数 ${calls.length} == 归属表条数 ${CAUSES.length}`);
  }
  const claimed = owners.map((o) => (o.length === 1 ? o[0].id : ""));
  const dup = claimed.filter((id) => id && claimed.filter((x) => x === id).length > 1);
  if (dup.length) bad(`有归属认领了多个调用点：${[...new Set(dup)].join("、")}`);
  else ok("每条归属恰好认领一个调用点（无遗漏、无多领）");

  const critSet = [...new Set(calls.map((c) => c.crit).filter(Boolean))].sort();
  if (critSet.join(",") !== [...CRITERIA].sort().join(",")) {
    bad(`门禁解析出的判据集合 {${critSet.join(", ")}} != 静态清单 {${CRITERIA.join(", ")}}`);
  } else {
    ok(`门禁解析出的判据集合 {${critSet.join(", ")}} == 静态清单`);
  }
  const critMismatch = calls.filter((c, i) => owners[i].length === 1 && owners[i][0].crit !== c.crit);
  if (critMismatch.length) bad(`有调用点解析出的判据号与归属登记不一致：${critMismatch.length} 处`);
  else ok("每个调用点解析出的判据号与归属登记一致");
}

/* ---- 三、注入档 ---- */
console.log("\n三、注入档");
const fixtures = {};
for (const spec of CASES) {
  let dir;
  try {
    dir = buildFixture(spec.mutate);
  } catch (e) {
    bad(`${spec.id} ${spec.label} → 注入本身坏了：${e.message}`);
    continue;
  }
  fixtures[spec.id] = dir;
  checkCase(spec, dir, GATE);
}

/* ---- 四、判据级负对照 ---- */
console.log("\n四、判据级负对照");
{
  /* 卸掉 DP2：N2 夹具（远端存在但指向别的仓库）必须转绿 ⇒ 证明那条红确实是 DP2 判出来的。 */
  const targets = calls.filter((c) => c.crit === "DP2");
  if (targets.length === 0) {
    bad("N9 → 门禁里找不到判据 DP2 的 fail() 调用");
  } else {
    const patched = unloadCriterion(gateSrc, calls, "DP2");
    const beforeLines = gateSrc.split("\n");
    const afterLines = patched.src.split("\n");
    if (beforeLines.length !== afterLines.length) {
      bad(`N9 → 卸判据改变了行数（${beforeLines.length} → ${afterLines.length}）`);
    } else {
      const diff = beforeLines.filter((l, i) => l !== afterLines[i]).length;
      if (diff !== patched.count) {
        bad(`N9 → 差异行数 ${diff} != 该判据的 fail() 调用数 ${patched.count}`);
      } else {
        const gateDir = fs.mkdtempSync(path.join(tmp, "gate-"));
        const mirror = path.join(gateDir, "check-deploy-target.cjs");
        fs.writeFileSync(mirror, patched.src);
        const base = runGate(GATE, fixtures.N2);
        const baseAttr = attribute(base.out);
        if (baseAttr.crits.join(",") !== "DP2") {
          bad(`N9 → 基线 N2 的判据集合应为恰为 {DP2}，实测 {${baseAttr.crits.join(", ") || "空"}}`);
        } else {
          const r = runGate(mirror, fixtures.N2);
          const a = attribute(r.out);
          if (r.code !== 0 || !r.out.includes("发布落点门禁通过")) {
            bad(`N9 → 卸掉 DP2 后 N2 夹具必须转绿（exit 0），实测 exit ${r.code}`);
            console.log(r.out.split("\n").filter((l) => l.includes("✗")).join("\n"));
          } else if (a.rows.length !== 0) {
            bad(`N9 → 卸掉 DP2 后 N2 夹具判绿但仍有 ${a.rows.length} 条红因`);
          } else {
            ok(
              `N9 卸掉 DP2（${patched.count} 处 fail() 调用，差异 ${diff} 行，行数不变）→ ` +
                `基线 {DP2} ⇒ 同一夹具转绿，零红因`
            );
          }
        }
      }
    }
  }
}

/* ---- 每条红因、每条判据都至少一档判红 ---- */
{
  const noCase = CAUSES.filter((c) => !seenCauses.has(c.id)).map((c) => c.id);
  if (noCase.length) bad(`这些红因没有任何一档判红（等于不可证）：${noCase.join("、")}`);
  else ok(`每条红因都至少一档判红（${seenCauses.size}/${CAUSES.length}）`);
  const noCrit = CRITERIA.filter((c) => !seenCriteria.has(c));
  if (noCrit.length) bad(`这些判据没有任何一档判红：${noCrit.join("、")}`);
  else ok(`每条判据都至少一档判红（${seenCriteria.size}/${CRITERIA.length}）`);
}

/* ---- 仓库真源一个字节没动 ---- */
{
  const after = repoDigest();
  if (after !== REAL_DIGEST) {
    bad("自测期间仓库真源被改动了 —— 注入必须只在 /tmp 副本上做");
  } else {
    ok(`仓库真源指纹前后一致（${REAL_DIGEST.slice(0, 16)}…）—— 注入全程只在临时副本上做`);
  }
}

console.log("");
if (failed) {
  console.log(`发布落点门禁自测失败：${failed} 项断言未通过。`);
  process.exit(1);
}
console.log("发布落点门禁自测全部通过。");
