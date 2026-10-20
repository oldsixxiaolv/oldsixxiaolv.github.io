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
 * 六条判据：
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
 *   LS5 中央「待决策」段的**结构**必须完整 —— 这一段是全仓唯一的
 *          "需要本人拍板"台账。LS1–LS4 守的是"`## ` 节标题还在不在"，
 *          而中央段**也是**一个 `## ` 节，所以 LS2 只守得住"标题那一行
 *          没被删"——**段里的条目、段的收尾分隔线、条目有没有被写到段外去**，
 *          LS1–LS4 一概看不见。
 *          实测（本场次自己踩的坑，不是假想）：把一条待决策登记写进日志
 *          **文件头** —— 起因是用 `text.indexOf("\n---\n")` 去找中央段的
 *          收尾线，而**文件头第 6 行也有一道 `---`** → 命中了那一道 →
 *          条目被插到第 8 行。那一版日志 LS1–LS4 **全绿**（节标题一个没少），
 *          但中央段之外多了一条"待拍板"条目：读者按标题找过去根本看不到它
 *          → 决策事实上从台面上消失了。
 *          LS5 守的正是这一段：结构坏成那样，当场红。
 *          ⚠️ 全部用**内容锚**（按标题定位、再往后找收尾线），
 *             **不依赖任何行号** —— 这个日志每天被并发场次追加，
 *             行号随时在漂（实测同一分钟里中央段起始行就从 1493 挪到 1510）。
 *   LS6 同一个 `## ` 节标题**不得出现多份**。
 *          —— 为什么单列一条：LS1/LS2/LS4 都用**集合**（Set）收集节标题，
 *            于是"同一个标题在日志里出现两次"会被**去重掉**：
 *            这些判据只查"这个标题还在不在"（LS2）/"工作树有没有它"（LS4），
 *            **同一节存在两份副本这件事对它们完全不可见**。
 *            实测（2026-10-19～20 真实发生过，不是假想）：
 *              · 「续四」节在日志里同时存在两份（提交 `3f56633`）；
 *              · 去重（`6db69c5`）之后，一次**与该节无关**的提交
 *                （`1580b7d`，整份提交工作树日志）把副本又带了回来 ⇒ 又变两份
 *                （`c99b2f1` 仍是两份）；
 *              · 整个过程 LS1–LS5 与 DI0–DI2 **全部 exit 0** ——
 *                没有任何判据能看见它，直到人工二次去重（`5fc4e2f`）。
 *            本条守的正是这件事。两侧都查：HEAD 侧（已入库的）与工作树侧（提交前）。
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
 * 取某个提交里日志的全部 `## ` 节标题，**带行号、保留重复**。
 * 返回 null 表示该提交里没有日志文件（根提交 / 早期提交）。
 *
 * 用 `git grep` 而不是 `git show`：日志有 10000+ 行 / 数百 KB，
 * 每次只把匹配行（几十行）传回，进程间数据量小一个量级。
 * git grep 的退出码：0 = 有匹配；1 = 文件在但没匹配；128 = 路径不存在。
 *
 * ⚠️ 为什么要"保留重复"：本函数供 LS6 用 —— 同一标题出现多份**正是要抓的东西**，
 *    任何去重（Set/Map）都会把它藏掉。`headings()` 那层才做去重。
 */
function headingRows(sha) {
  const r = git(["grep", "-n", "-h", "-e", "^## ", sha, "--", LOG]);
  if (r.status === 128) return null; // 该提交里没有这个文件
  const rows = [];
  for (const line of r.out.split("\n")) {
    const m = /^(\d+):(.*)$/.exec(line);
    if (m) rows.push({ line: Number(m[1]), text: m[2] });
  }
  return rows;
}

/** 某个提交里日志的节标题**集合**（去重）—— LS1/LS2 用。 */
function headings(sha) {
  const rows = headingRows(sha);
  if (rows === null) return null;
  return new Set(rows.map((r) => r.text.trim()));
}

/**
 * 找出"同一个标题出现多份"的节标题。
 * identity = 去掉首尾空白后的整行（与 LS2/LS4 的比较口径一致）。
 * 返回 [{ text, lines: [行号, ...] }]。
 */
function duplicateHeadings(rows) {
  const byText = new Map();
  for (const r of rows) {
    const t = r.text.trim();
    if (!byText.has(t)) byText.set(t, []);
    byText.get(t).push(r.line);
  }
  const out = [];
  for (const [text, lines] of byText) {
    if (lines.length > 1) out.push({ text, lines });
  }
  return out;
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

/* ---------- LS5：中央「待决策」段的结构完整性 ----------
   全部按**内容**定位，不看行号（理由见文件头）。 */
const CENTRAL_TITLE = "## 待决策（需要本人拍板，任务不会自己动）";
/* 待决策条目的识别特征。刻意收窄：只认"待拍板 + 编号"或"待决策（"，
   免得把正文里泛泛提到"待决策"的普通句子也算成条目。 */
const DECISION_TOKEN = /待拍板\s*\d+|待决策（/;
/* 供通过文案用：中央段的体检结果（"扫到了什么"要说清楚）。 */
let centralSummary = null;

if (!fs.existsSync(wtPath)) {
  // 文件整个不见了 —— 已由 LS4 判红，这里不重复报。
} else {
  const lines = fs.readFileSync(wtPath, "utf8").split("\n");
  const titleIdx = [];
  lines.forEach((l, i) => {
    if (l.trim() === CENTRAL_TITLE) titleIdx.push(i);
  });

  if (titleIdx.length === 0) {
    problems.push(
      `工作树上的 ${LOG} 里找不到中央待决策段的标题「${CENTRAL_TITLE}」—— ` +
        `这一段是全仓唯一的"需要本人拍板"台账；它不见了，那些待决事项就没人管了。` +
        `（节标题本身由 LS2 守着；本条守的是它的**位置与结构**。）`
    );
  } else if (titleIdx.length > 1) {
    problems.push(
      `中央待决策段的标题出现了 ${titleIdx.length} 次（第 ` +
        `${titleIdx.map((i) => i + 1).join(" / ")} 行）—— 同一段出现副本，` +
        `读者会读到两份内容不同的"待决策"清单，迟早按其中一份拍板。`
    );
  } else {
    const t = titleIdx[0];
    /* 收尾分隔线：标题之后**第一道**独立的 "---"。 */
    let term = -1;
    for (let i = t + 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        term = i;
        break;
      }
    }

    if (term < 0) {
      problems.push(
        `中央待决策段没有收尾分隔线（标题之后找不到独立的 "---" 行）—— ` +
          `段的边界就没了，后面所有的场次小节都会被当成这一段的内容。`
      );
    } else {
      const block = lines.slice(t + 1, term);

      /* 段内不得混入场次小节标题：那是"段的边界乱了"的直接证据。 */
      const innerH2 = [];
      block.forEach((l, i) => {
        if (l.startsWith("## ")) innerH2.push(t + 2 + i);
      });
      if (innerH2.length) {
        problems.push(
          `中央待决策段里混进了 ${innerH2.length} 个 "## " 节标题（第 ` +
            `${innerH2.join(" / ")} 行）—— 场次小节不该写进中央段；` +
            `多半是中央段的收尾分隔线被删了、或被写到了别的位置。`
        );
      }

      /* 段不得是空的（只认顶格条目 `- `，缩进的子条目不算独立登记）。 */
      const entries = block.filter((l) => l.startsWith("- "));
      centralSummary = { titleLine: t + 1, endLine: term + 1, entries: entries.length };
      if (entries.length === 0) {
        problems.push(
          `中央待决策段是空的（标题与收尾线之间 ${block.length} 行，0 条登记条目）—— ` +
            `段标题还在，所以 LS2 看不见；但待决事项已经不在台账上了。`
        );
      }

      /* 段内不得有**逐字重复**的登记条目：并发场次各写一份，
         是"同号两义"那一族缺陷的前身。 */
      const seen = new Set();
      const dupes = [];
      for (const e of entries) {
        if (seen.has(e)) dupes.push(e);
        else seen.add(e);
      }
      if (dupes.length) {
        problems.push(
          `中央待决策段里有 ${dupes.length} 条**逐字重复**的登记条目` +
            `（例如「${dupes[0].trim().slice(0, 40)}…」）—— 同一件事登记了两遍，` +
            `读者会当成两件事。`
        );
      }
    }

    /* 文件头（第一个 "## " 节标题之前）不得出现待决策条目：
       条目必须写在中央段里；写进文件头 = 读者按标题找过去看不到它
       （本门禁 LS5 存在的直接起因，见文件头）。 */
    const firstH2 = lines.findIndex((l) => l.startsWith("## "));
    if (firstH2 >= 0) {
      const stray = [];
      lines.slice(0, firstH2).forEach((l, i) => {
        if (DECISION_TOKEN.test(l)) stray.push(i + 1);
      });
      if (stray.length) {
        problems.push(
          `日志文件头（第 ${stray.join(" / ")} 行）里出现了待决策条目 —— ` +
            `中央段的条目必须写在中央段里。写进文件头是最常见的一种走位：` +
            `节标题一个没少，LS1–LS4 照样全绿，但读者按标题找过去看不到它。`
        );
      }
    }
  }
}

/* ---------- LS6：同一个 `## ` 节标题出现多份 ⇒ 判红 ----------
   两侧都查：HEAD 侧（已经进库的）与工作树侧（还没提交、正要提交的）。
   判据的"范围"写死在这里（不是从被判对象推导出来的）：查的是**日志文件本身**，
   与 LS2 的"历史上出现过、现在还在不在"是两个维度。

   ⚠️ 中央段标题的副本**不**由本条报（LS5 单独报，且 LS5 说清"同一段出现副本"）——
      两条判据都报同一件事会让红因变噪声，反而让人忽略另一条。 */
let headDupes = [];
let wtDupes = [];
let headRowCount = 0;
let wtRowCount = 0;

{
  const headRows = headingRows("HEAD");
  headRowCount = headRows ? headRows.length : 0;
  headDupes = headRows ? duplicateHeadings(headRows) : [];
  for (const d of headDupes) {
    if (d.text === CENTRAL_TITLE) continue;
    problems.push(
      `HEAD 上的日志里同一个 "## " 节标题出现了 ${d.lines.length} 份（第 ` +
        `${d.lines.join(" / ")} 行）：「${d.text}」—— 同一节在日志里存在多份副本，` +
        `读者会读到两遍；而 LS1/LS2/LS4 用**集合**收集节标题，**看不见**这件事` +
        `（LS2 只查"这个标题还在不在"）。` +
        `最常见的成因：一次**整份提交工作树日志**的提交，把刚去掉的副本又带了回来。` +
        `修复方式：确认哪一份是最新的，删掉其余的。`
    );
  }
}

if (fs.existsSync(wtPath)) {
  const wtRows = [];
  fs.readFileSync(wtPath, "utf8").split("\n").forEach((l, i) => {
    if (l.trim().startsWith("## ")) wtRows.push({ line: i + 1, text: l });
  });
  wtRowCount = wtRows.length;
  wtDupes = duplicateHeadings(wtRows);
  for (const d of wtDupes) {
    if (d.text === CENTRAL_TITLE) continue;
    problems.push(
      `工作树上的日志里同一个 "## " 节标题出现了 ${d.lines.length} 份（第 ` +
        `${d.lines.join(" / ")} 行）：「${d.text}」—— 同一节在日志里存在多份副本。` +
        `提交之前就要拦住它：一旦入库，读者会读到两遍，事后只能靠翻 git 历史才发现。`
    );
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
    `工作树上的 ${wtCount} 个节也覆盖了 HEAD 的全部节。` +
    `节标题重复体检：HEAD 上 ${headRowCount} 行节标题（${headSet ? headSet.size : 0} 个不同标题）、` +
    `工作树上 ${wtRowCount} 行节标题（${wtCount} 个不同标题），` +
    `两侧都没有"同一标题出现多份"的副本。` +
    (centralSummary
      ? `中央待决策段（第 ${centralSummary.titleLine}–${centralSummary.endLine} 行）：` +
        `标题唯一、收尾分隔线在位、段内 ${centralSummary.entries} 条登记条目、` +
        `无混进来的场次小节、无逐字重复条目，日志文件头里也没有待决策条目。`
      : `（中央待决策段未体检：标题没找到——按理上面已经判红了。）`)
);
