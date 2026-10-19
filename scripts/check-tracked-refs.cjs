#!/usr/bin/env node
/**
 * 门禁 TR1 / TR2：已跟踪文件引用的本地文件，必须也已被 git 跟踪。
 *
 * 为什么要有这个门禁（2026-10-19 的 P0 地雷）：
 *   交接复核发现，共享工作树里同时存在两件事：
 *     · `eleventy.config.js`、`scripts/verify-site.cjs` 已被改写，开始 require
 *       一个新抽出来的共享模块 `scripts/lib/git-error.cjs`；
 *     · 而 `scripts/lib/git-error.cjs` **自己还没被 git 跟踪**。
 *   这两件事叠在一起，提交时**只要先提交引用方、漏掉被引用方**，
 *   提交后的那棵树就是断的 —— 全新克隆 `npm run build` 立刻
 *   "Cannot find module './scripts/lib/git-error.cjs'"。
 *
 *   它危险的地方在于**错法不唯一、而且看起来是别人干的**：
 *     · 漏 `git-error.cjs` → build 在 eleventy 步就崩（第一个报错）；
 *     · 漏 `check-jsonld.cjs` → build 却在更早的 `check:gates` 步先红
 *       （"check-overflow 既是豁免项又被接在 build 上"），
 *       **第一个报错根本不指向真正缺的那个文件**；
 *     · 两个都漏 → 只看得到第一个，"只有一处漏"是错觉。
 *   而且没有任何门禁会拦：门禁只管产物，不管"提交后的树能不能跑"。
 *
 *   判据（编号 TR*，与 verify-site.cjs 的数字编号、check-a11y.cjs 的 A*、
 *         check-wrapping.cjs 的 W*、check-gates-wired.cjs 的 GW*、
 *         check-jsonld.cjs 的 J* 都不续接）：
 *   TR1 引用完整性 —— 对**每一个已被 git 跟踪的代码文件**（.cjs/.js/.mjs），
 *       扫出它对**本地相对路径**的静态 require / import，
 *       目标必须满足两条：
 *         · 磁盘上确实存在（否则这棵树根本跑不起来）；
 *         · **也已被 git 跟踪**（否则提交后这棵树会断 —— 也就是上面那个 P0）。
 *   TR2 自证存活 —— 判据必须真的扫过东西：扫到 0 个代码文件、
 *       或扫到 0 处本地引用，一律判红。
 *       （"没报错"和"没问题"长得一模一样：判据一旦被卸掉，
 *         门禁会一直绿着，而缺陷照样上线。）
 *
 *   ⚠️ 为什么用**索引**（git ls-files）而不是 HEAD：
 *     `git commit` 提交的是**索引**，不是 HEAD、也不是工作树。
 *     所以"这次提交会带进去哪些文件"的答案在索引里。
 *     本门禁扫的是**工作树内容**（已跟踪文件在本地被改成什么样就扫什么样），
 *     查的却是**索引里的跟踪集合** —— 于是"本地改了引用、但目标还没进索引"
 *     这种状态（也就是那个 P0）在提交前就被抓住。
 *
 * 用法：node scripts/check-tracked-refs.cjs   （有错 exit 1）
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

/* ---------- 取索引里的跟踪集合 ---------- */
let tracked = new Set();
try {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  tracked = new Set(out.split("\0").filter(Boolean));
} catch (e) {
  console.error("引用完整性门禁未通过：\n");
  console.error(
    "  ✗ 读不到 git 索引（git ls-files 失败）—— 本门禁无法判定" +
      "「被引用的文件有没有被跟踪」。\n" +
      "    没有 git 就判不出来 = 判据不存在，不是「没问题」。\n" +
      `    原始错误：${(e && e.message) || e}`
  );
  console.error("");
  process.exit(1);
}

/* ---------- 扫哪些文件 ---------- */
const CODE_EXT = new Set([".cjs", ".js", ".mjs"]);
const codeFiles = [...tracked].filter((f) => CODE_EXT.has(path.extname(f)));

/* 静态 require / import 的本地相对路径。
   只认字面量；模板字符串等动态写法扫不出来（这一点在汇总里说明，不假装扫全了）。 */
const LOCAL_REF_RE = /\brequire\(\s*["'](\.[^"']+)["']\s*\)|(?:\bfrom|\bimport)\s*["'](\.[^"']+)["']/g;

const CANDIDATE_EXT = [".cjs", ".js", ".mjs", ".json"];
const CANDIDATE_INDEX = ["index.cjs", "index.js", "index.mjs"];

function resolveTarget(fromFile, rel) {
  const base = path.resolve(path.dirname(path.join(ROOT, fromFile)), rel);
  const cands = [];
  if (path.extname(base)) cands.push(base);
  else {
    for (const ext of CANDIDATE_EXT) cands.push(base + ext);
    for (const idx of CANDIDATE_INDEX) cands.push(path.join(base, idx));
  }
  return cands;
}

function isInsideRepo(p) {
  const r = path.resolve(p);
  return r === ROOT || r.startsWith(ROOT + path.sep);
}

const problems = [];
let filesScanned = 0;
let refsFound = 0;
let refsOutsideRepo = 0;

for (const file of codeFiles) {
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) continue; // 已跟踪但本地被删了：不归本门禁管
  filesScanned++;

  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (e) {
    continue;
  }

  LOCAL_REF_RE.lastIndex = 0;
  let m;
  while ((m = LOCAL_REF_RE.exec(text)) !== null) {
    const rel = m[1] || m[2];
    refsFound++;

    const cands = resolveTarget(file, rel);

    // 引用到仓库外（node_modules 之类）—— 那是依赖，不是本仓库的文件，跳过
    if (!cands.some((c) => isInsideRepo(c))) {
      refsOutsideRepo++;
      continue;
    }

    const existing = cands.find((c) => fs.existsSync(c));
    if (!existing) {
      problems.push(
        `scripts/…${file} 引用了 ${rel}，但磁盘上找不到它` +
          `（试过：${cands.map((c) => path.relative(ROOT, c)).join(" / ")}）—— ` +
          `这棵树根本跑不起来。`
      );
      continue;
    }

    const relExisting = path.relative(ROOT, existing);
    if (!tracked.has(relExisting)) {
      problems.push(
        `${file} 引用了 ${rel}（磁盘上是 ${relExisting}），但**它没有被 git 跟踪** —— ` +
          `提交后这棵树会断：全新克隆里 require 会直接报 ` +
          `「Cannot find module '${relExisting.replace(/^scripts\//, "./")}」。` +
          `请把它和引用方放在同一次提交里。`
      );
    }
  }
}

/* ---------- TR2：自证存活 ---------- */
if (!filesScanned) {
  problems.push(
    `一个已跟踪的代码文件都没扫到（跟踪集合里没有 .cjs/.js/.mjs）—— ` +
      `判据从未被真正执行过。`
  );
} else if (!refsFound) {
  problems.push(
    `扫了 ${filesScanned} 个代码文件，却一处本地引用都没找到 —— ` +
      `判据没有真的比对过东西（多半是被卸掉了）。`
  );
}

if (problems.length) {
  console.error("引用完整性门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `引用完整性门禁通过：扫了 ${filesScanned} 个已跟踪代码文件、` +
    `${refsFound} 处本地引用，被引用的文件全部也已被 git 跟踪` +
    (refsOutsideRepo ? `（另有 ${refsOutsideRepo} 处指向仓库外的依赖，已跳过）` : "") +
    "。"
);
