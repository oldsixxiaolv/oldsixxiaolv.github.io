#!/usr/bin/env node
/**
 * 日志节不得消失门禁 —— 守住"每一场次的日志节都还在"这件事。
 *
 * 为什么要有这个门禁：
 *   2026-10-19 的并发事故里，有提交把**别人的整节日志**扫掉了
 *   （悬空提交 cf95fc1 之后的 e5d178c，日志 diff 119+/121−）。
 *   那一节的内容就此从 main 上消失 —— **没有报错、没有冲突提示、build 照过**，
 *   事后要靠人工翻 git 历史才能发现。
 *
 *   事故的根因是"拿旧基线的工作树副本去提交"，那是 git 层的事；
 *   门禁能做的不是禁止旧基线，而是**让"节消失了"这件事在 build 阶段就红掉**，
 *   并且指名道姓地说出"哪一节没了、哪个提交删的"，
 *   好让恢复动作（`git show <删节提交>^:docs/IMPROVEMENT-LOG.md`）可以直接执行。
 *
 * 三条判据：
 *   LS1 日志在 HEAD 上存在，且能抽出 `## ` 节标题。
 *   LS2 窗口内每个提交**新增**的 `## ` 节标题，现在必须仍在 HEAD 的日志里。
 *          —— 核心判据。只查"新增"是因为日志节是只增不减的：删节才是事故。
 *             （"被删后又补回来"是允许的，这条判据因此可以自愈。）
 *   LS3 覆盖度自证 —— 实际能扫到的提交数必须够。
 *          历史被截断（浅克隆）时门禁会**空跑**，而空跑的门禁等于没有门禁，
 *          所以这种情况要判红，而不是"扫到几个算几个"地假装通过。
 *
 * 编号用独立字母体系 LS*，不与 verify-site.cjs 的数字编号、
 * check-gates-wired.cjs 的 GW*、check-a11y.cjs 的 A*、check-wrapping.cjs 的 W* 冲突。
 */
const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOG = "docs/IMPROVEMENT-LOG.md";
const WINDOW = Number(process.env.LOG_SECTION_WINDOW || 40); // 看最近多少个提交
const MIN_COMMITS = 10; // 少于这个数说明历史被截断，门禁无从谈起

function git(args) {
  const r = spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { ok: r.status === 0, status: r.status, out: r.stdout || "" };
}

/**
 * 取某个提交里日志的全部 `## ` 节标题。
 * 返回 null 表示该提交里没有日志文件（根提交 / 早期提交）。
 *
 * 用 `git grep` 而不是 `git show`：日志有 7000+ 行 / 500 KB，
 * 每次只把匹配行（几十行）传回，进程间数据量小一个量级。
 * git grep 的退出码：0 = 有匹配；1 = 文件在但没匹配；128 = 路径不存在。
 */
function headings(sha) {
  const r = git(["grep", "-h", "-e", "^## ", sha, "--", LOG]);
  if (r.status === 128) return null; // 该提交里没有这个文件
  const set = new Set();
  for (const line of r.out.split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) set.add(t);
  }
  return set;
}

/* ---------- 取窗口内的提交（从旧到新） ---------- */
const logList = git(["log", "-n", String(WINDOW), "--format=%H"]);
if (!logList.ok) {
  console.error("日志节不得消失门禁未通过：\n");
  console.error(`  ✗ 读不到 git 历史（git log 失败，退出码 ${logList.status}）。`);
  console.error("    本门禁依赖 git 历史才能工作；拿不到历史时不能假装通过。");
  process.exit(1);
}
const commits = logList.out.trim().split("\n").filter(Boolean).reverse(); // 反转 → 旧 → 新

const problems = [];

/* ---------- LS1：HEAD 上必须有日志，且有节标题 ---------- */
const headSet = headings("HEAD");
if (headSet === null) {
  problems.push(`HEAD 上找不到 ${LOG} —— 日志文件本身不见了。`);
} else if (headSet.size === 0) {
  problems.push(`HEAD 上的 ${LOG} 里一个 "## " 节标题都没有 —— 日志被清空或格式被改坏。`);
}

/* ---------- LS3：覆盖度自证（先查，再判 LS2） ---------- */
if (commits.length < MIN_COMMITS) {
  problems.push(
    `只能扫到 ${commits.length} 个提交（少于 ${MIN_COMMITS}）—— ` +
      `git 历史很可能被截断（浅克隆 / ` +
      `actions/checkout 的 fetch-depth 默认是 1）。` +
      `本门禁在这种状态下等于**空跑**，空跑的门禁等于没有门禁，所以判红。` +
      `CI 侧的 .github/workflows/deploy.yml 已设 fetch-depth: 0。`
  );
}

/* ---------- LS2：窗口内新增的节，现在必须仍在 HEAD 上 ---------- */
const vanished = [];
for (let i = 0; i < commits.length; i++) {
  const cur = headings(commits[i]);
  if (cur === null) continue;
  const parentSha = i > 0 ? commits[i - 1] : null;
  const par = parentSha ? headings(parentSha) : new Set();
  for (const h of cur) {
    if (par.has(h)) continue; // 这一节不是本提交新增的
    if (headSet && headSet.has(h)) continue; // 还在 HEAD 上，OK
    vanished.push({ section: h, addedBy: commits[i] });
  }
}

/* 指名"哪个提交把哪一节删了"：从新增它的提交往后找第一个"父提交有、自己没有"的提交 */
for (const v of vanished) {
  const start = commits.indexOf(v.addedBy);
  for (let j = start + 1; j < commits.length; j++) {
    const cur = headings(commits[j]);
    const par = headings(commits[j - 1]);
    if (cur === null || par === null) continue;
    if (par.has(v.section) && !cur.has(v.section)) {
      v.removedBy = commits[j];
      break;
    }
  }
}

for (const v of vanished) {
  const short = (s) => (s || "?").slice(0, 7);
  problems.push(
    `日志节「${v.section}」在 HEAD 上消失了 —— ` +
      `由提交 ${short(v.addedBy)} 引入，在提交 ${short(v.removedBy)} 被删掉。` +
      `恢复方式：git show ${short(v.removedBy)}^:${LOG}（取被删前的那一版）。`
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("日志节不得消失门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `日志节不得消失门禁通过：扫了 ${commits.length} 个提交、` +
    `${headSet.size} 个现存节，窗口内新增的节全部仍在 HEAD 上。`
);
