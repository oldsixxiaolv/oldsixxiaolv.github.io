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
 * 四条判据：
 *   LS1 日志在 HEAD 上存在，且能抽出 `## ` 节标题。
 *   LS2 **历史上出现过的每一个 `## ` 节标题，现在必须仍在 HEAD 的日志里**。
 *          —— 核心判据。只查"曾经新增"是因为日志节是只增不减的：删节才是事故。
 *             （"被删后又补回来"是允许的，这条判据因此可以自愈。）
 *   LS3 覆盖度自证 —— 本门禁必须真的**从日志的第一个提交扫到 HEAD**。
 *          历史被截断（浅克隆）时门禁会**空跑**，而空跑的门禁等于没有门禁，
 *          所以这种情况要判红，而不是"扫到几个算几个"地假装通过。
 *   LS4 工作树上的日志节必须**覆盖** HEAD 上的全部节（工作树 ⊇ HEAD）。
 *          —— 补 LS2 的盲区。LS2 只在"提交之后"看 HEAD：节被扫掉了要等提交
 *             落地才发现，那时 main 上已经丢了一节、还得重做一次。
 *             而事故真正发生的那一步在**提交之前**：有人拿旧基线的内容整份
 *             覆盖工作树上的日志，用旧文件的字节偏移去写已经变长的文件，
 *             于是新内容被整段吃掉（2026-10-19 15:47 实测：工作树少了 HEAD 上
 *             已入库的 4 个节共 373 行，其中含本门禁自己的那一节）。
 *             LS4 让这一步当场变红，而不是等提交后才由 LS2 事后发现。
 *          方向只能是"工作树 ⊇ HEAD"：工作树多出未提交的节是**正常**的
 *          （每个场次都先写日志再提交），少一个节才是事故。
 *
 * ⚠️ LS2 为什么从"最近 40 个提交的窗口"改成"全历史"（2026-10-19 本轮）：
 *   旧实现只扫最近 `WINDOW = 40` 个提交。实测（HEAD = 8a7a953，125 个提交、
 *   HEAD 上 78 个节）：**窗口只覆盖到 45 个节，剩下 33 个节落在窗口之外**。
 *   也就是说 —— 那些更早的节如果被删掉，LS2 **抓不到**，而且门禁照样打印
 *   "通过"。这正是"看起来在、其实不生效"那一族缺陷：判据看上去在跑，
 *   实际只覆盖了一小半。
 *   本轮实测过"全历史会不会误报"：**不会** —— 扫完全部 125 个提交，
 *   历史上出现过的节共 78 个，HEAD 上也有 78 个，差集为**空**。
 *   （节标题没有在历史上被改写过，所以不存在"旧标题算作丢失"的假红。）
 *
 *   扫描范围因此改成"**触碰过日志文件的全部提交**"（`git log -- <log>`）：
 *   没碰过日志的提交，其日志内容与上一个碰过的提交完全相同，
 *   扫它们是纯浪费。实测 125 个提交里有 88 个碰过日志，
 *   而这 88 个提交上的节并集与全量 125 个提交的节并集**完全相同**（78 = 78）。
 *   一次前向遍历同时算出"哪一节由哪个提交引入"与"哪一节被哪个提交删掉"，
 *   红因因此能直接给出恢复命令。
 *
 *   覆盖度自证同步升级（旧版只判"扫到的提交数 ≥ 10"，那只是防浅克隆的粗筛）：
 *     · `git rev-parse --is-shallow-repository` 必须为 false（浅克隆直接判红）；
 *     · 仓库总提交数必须 ≥ MIN_COMMITS；
 *     · **日志的创建提交必须落在被扫描的列表里** —— 这条才真正证明
 *       "扫描从日志诞生的那一刻就开始了"，而不是"从某个中间点开始"。
 *
 * 编号用独立字母体系 LS*，不与 verify-site.cjs 的数字编号、
 * check-gates-wired.cjs 的 GW*、check-a11y.cjs 的 A*、check-wrapping.cjs 的 W* 冲突。
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOG = "docs/IMPROVEMENT-LOG.md";
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
 * 用 `git grep` 而不是 `git show`：日志有 10000+ 行 / 数百 KB，
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

const problems = [];
const short = (s) => (s || "?").slice(0, 7);

/* ---------- 取"触碰过日志的全部提交"（从旧到新） ---------- */
const logList = git(["log", "--format=%H", "--", LOG]);
if (!logList.ok) {
  console.error("日志节不得消失门禁未通过：\n");
  console.error(`  ✗ 读不到 git 历史（git log 失败，退出码 ${logList.status}）。`);
  console.error("    本门禁依赖 git 历史才能工作；拿不到历史时不能假装通过。");
  process.exit(1);
}
const commits = logList.out.trim().split("\n").filter(Boolean).reverse(); // 反转 → 旧 → 新

/* ---------- LS3：覆盖度自证（先查，再判 LS2） ---------- */
const shallow = git(["rev-parse", "--is-shallow-repository"]);
if (shallow.ok && shallow.out.trim() === "true") {
  problems.push(
    `这是一个**浅克隆**（git rev-parse --is-shallow-repository = true）—— ` +
      `历史被截断，本门禁只能扫到 clone 深度以内的提交，更早的日志节删了它抓不到。` +
      `浅克隆下门禁等于**空跑**，空跑的门禁等于没有门禁，所以判红。` +
      `CI 侧的 .github/workflows/deploy.yml 已设 fetch-depth: 0。`
  );
}

const totalCount = git(["rev-list", "--count", "HEAD"]);
const total = totalCount.ok ? Number(totalCount.out.trim()) : NaN;
if (!Number.isFinite(total) || total < MIN_COMMITS) {
  problems.push(
    `仓库总提交数是 ${Number.isFinite(total) ? total : "读不到"}（少于 ${MIN_COMMITS}）—— ` +
      `git 历史很可能被截断（浅克隆 / ` +
      `actions/checkout 的 fetch-depth 默认是 1）。` +
      `本门禁在这种状态下等于**空跑**，空跑的门禁等于没有门禁，所以判红。`
  );
}

if (commits.length === 0) {
  problems.push(
    `git log -- ${LOG} 一个提交都没扫到 —— 日志文件在历史里从来没被改过，` +
      `或者 clone 的历史里根本没有它。本门禁无从判起。`
  );
} else {
  // 日志的创建提交必须落在被扫描的列表里：这才能证明扫描**从日志诞生那一刻就开始**。
  const addList = git(["log", "--diff-filter=A", "--format=%H", "--", LOG]);
  const addCommit = addList.out.trim().split("\n").filter(Boolean)[0];
  if (!addCommit) {
    problems.push(
      `找不到 ${LOG} 的创建提交（git log --diff-filter=A）—— ` +
        `无法证明扫描覆盖到了日志诞生的那一刻。`
    );
  } else if (!commits.includes(addCommit)) {
    problems.push(
      `${LOG} 的创建提交 ${short(addCommit)} 不在本次扫描的 ${commits.length} 个提交里 —— ` +
        `扫描没有覆盖到日志诞生的那一刻，更早的历史被截断了。` +
        `这会让 LS2 漏掉"早期日志节被删"这一形态。`
    );
  }
}

/* ---------- LS1：HEAD 上必须有日志，且有节标题 ---------- */
const headSet = headings("HEAD");
if (headSet === null) {
  problems.push(`HEAD 上找不到 ${LOG} —— 日志文件本身不见了。`);
} else if (headSet.size === 0) {
  problems.push(`HEAD 上的 ${LOG} 里一个 "## " 节标题都没有 —— 日志被清空或格式被改坏。`);
}

/* ---------- LS2：历史上出现过的每一个节，现在必须仍在 HEAD 上 ----------
   一次前向遍历（旧 → 新）同时算出：
     · everSeen[节]  = 最早引入它的提交；
     · removedAt[节] = 把它删掉的提交（删了又补回来的，节仍在 HEAD 上 → 不判红）。 */
const everSeen = new Map();
const removedAt = new Map();
{
  let prev = new Set();
  for (const sha of commits) {
    const cur = headings(sha);
    if (cur === null) {
      // 日志文件在这个提交里不存在（被整个删掉）→ 之前的节都在这里丢失
      for (const h of prev) if (!removedAt.has(h)) removedAt.set(h, sha);
      prev = new Set();
      continue;
    }
    for (const h of cur) if (!everSeen.has(h)) everSeen.set(h, sha);
    for (const h of prev) if (!cur.has(h) && !removedAt.has(h)) removedAt.set(h, sha);
    prev = cur;
  }
}

const vanished = [];
if (headSet) {
  for (const [section, addedBy] of everSeen) {
    if (headSet.has(section)) continue; // 还在 HEAD 上，OK（含"删了又补回来"）
    vanished.push({ section, addedBy, removedBy: removedAt.get(section) });
  }
}

for (const v of vanished) {
  const gone = v.removedBy
    ? `在提交 ${short(v.removedBy)} 被删掉`
    : `在某个提交里被删掉（未能定位到具体提交）`;
  problems.push(
    `日志节「${v.section}」在 HEAD 上消失了 —— ` +
      `由提交 ${short(v.addedBy)} 引入，${gone}。` +
      (v.removedBy
        ? `恢复方式：git show ${short(v.removedBy)}^:${LOG}（取被删前的那一版）。`
        : `恢复方式：git log -p -- ${LOG} 找到删它的那次改动。`)
  );
}

/* ---------- LS4：工作树的日志节必须覆盖 HEAD 的全部节 ---------- */
const wtPath = path.join(ROOT, LOG);
if (!fs.existsSync(wtPath)) {
  problems.push(`工作树上找不到 ${LOG} —— 日志文件本身不见了。`);
} else {
  const wtSet = new Set();
  for (const line of fs.readFileSync(wtPath, "utf8").split("\n")) {
    const t = line.trim();
    if (t.startsWith("## ")) wtSet.add(t);
  }
  if (wtSet.size === 0) {
    problems.push(
      `工作树上的 ${LOG} 里一个 "## " 节标题都没有 —— ` +
        `日志被清空了，或整份被别的东西换掉了（工作树 ⊉ HEAD）。`
    );
  } else if (!headSet || headSet.size === 0) {
    problems.push(
      `HEAD 上没有节标题可比 —— 无法核对工作树是否丢了节` +
        `（HEAD 上的日志本身就不对，这一条已由 LS1 判红）。`
    );
  } else {
    for (const h of headSet) {
      if (wtSet.has(h)) continue;
      problems.push(
        `HEAD 上的日志节「${h}」在工作树里不见了 —— ` +
          `这一节已经进了 HEAD，但工作树上的 ${LOG} 没有它。` +
          `最常见的原因：拿旧基线的内容整份覆盖了工作树上的日志` +
          `（用旧文件的字节偏移去写一个已经变长的文件，会整段吃掉新内容）。` +
          `恢复方式：git show HEAD:${LOG}（取 HEAD 上的那一版），` +
          `再把你自己还没提交的那部分并回去。`
      );
    }
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("日志节不得消失门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const wtCount = fs.existsSync(wtPath)
  ? new Set(
      fs
        .readFileSync(wtPath, "utf8")
        .split("\n")
        .filter((l) => l.trim().startsWith("## "))
        .map((l) => l.trim())
    ).size
  : 0;
console.log(
  `日志节不得消失门禁通过：扫了 ${commits.length} 个触碰过日志的提交` +
    `（仓库共 ${Number.isFinite(total) ? total : "?"} 个提交，扫的是全历史，不是窗口）、` +
    `历史上出现过 ${everSeen.size} 个节，HEAD 上现存 ${headSet ? headSet.size : 0} 个，` +
    `历史上出现过的节全部仍在 HEAD 上；` +
    `工作树上的 ${wtCount} 个节也覆盖了 HEAD 的全部节。`
);
