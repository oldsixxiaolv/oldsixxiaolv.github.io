#!/usr/bin/env node
/**
 * 待拍板编号唯一性门禁 —— 守住"一个编号只能指一件事"这件事。
 *
 * 为什么要有这个门禁：
 *   2026-10-19 18:20 场次把「README 门禁 RD1 是单向的」登记为**待拍板 29**，
 *   但那两条登记**写在了中央台账之外**（写进了场次小节）→ 台账里 29 号空着；
 *   18:20–18:45 场次在中央台账里把「其它直接读 `_site` 的门禁」也登记为**待拍板 29**
 *   → **一个号两件事**。
 *   本人按号拍板时会拍到错的那一件，而且**台账本身看不出异样**（两个 29 各自读着都通顺）。
 *   19:0x 场次发现并就地改号（29 归 RD1，那条改为 31），但那是**一次人工订正**，
 *   结构性缺口还在：下一个场次照样可能撞号。
 *
 * 门禁只守**不可协商**的那两件事（正确性），不越界替本人决定台账的组织口径：
 *   DI1 **同号两义**：台账认领的编号 N，在别处（场次小节）若也有同号声明，
 *       两条必须指向**同一件事** —— 否则就是"一个号两件事"。
 *       判"同一件事"用去噪后标题的最长公共子串长度，阈值 SAME_THING_LCS = 12。
 *       阈值是**实测**定的，不是拍的：
 *         · 同一件事的改述（台账条目 ↔ 场次声明）：实测 15 / 16 / 18 / 18 / 29 / 35 / 49
 *         · 真正的同号两义（台账 29 = `_site` 快照 ↔ 场次 29 = RD1 单向）：实测 **6**
 *       12 卡在两类之间，两侧都留了余量。
 *   DI2 **一号一条**：中央台账内，同一个编号被**两条不同的登记**认领 → 判红。
 *       （台账里改述同一条目是"就地改写脚注"，不构成第二条；只有多出来的条目才算。）
 *   DI0 **判据自证**：台账必须定位得到，且必须**至少认领一个编号**。
 *       认领数为 0 说明写法变了、判据已经空跑 —— 空跑的门禁等于没有门禁，所以判红。
 *       （这一档是"覆盖度假绿"那一族缺陷的直接对策。）
 *
 * ⚠️ 覆盖度（**通过文案里如实写明，不含糊**）：
 *   · 本门禁只对**台账里显式写了编号**的登记生效。台账里那 30 条早期条目
 *     **不带显式编号**（编号按登记顺序隐含），本门禁认不出它们、也**无法把号对到条目**。
 *   · 声明只认**顶格列表项** `- **待拍板 N（…）…**` 的两种写法（带 ｜ 的 / 不带 ｜ 的）。
 *     正文里的**交叉引用**（「沿用待拍板 23」「待拍板 1–7 见前几节」）**不算声明** ——
 *     那是"引用别处已登记的那一条"，认成声明会把改述误判成同号两义。
 *   · 台账**之外**还有若干「（本场次不代拍，登记为待拍板 N）」脚注（实测 N=18/20/23/28/29/30），
 *     那些事项**没上账**（本人按号找不到）。本门禁**只如实报数、逐号列出各处指向什么、不判红** ——
 *     "台账要不要收编这些事项"是**台账的组织口径**，属本人拍板（已登记为待拍板 32）。
 *     等本人定了口径，把这一族升级成硬判据只是一行开关的事。
 *
 * ⚠️ 全部按**内容锚**定位（标题行 + 其后第一道独占 `---`），**不依赖任何行号** ——
 *   这个日志每天被并发场次追加，行号随时在漂（实测同一分钟里台账起始行就从 1493 挪到 1510）。
 *
 * 编号用独立字母体系 DI*，不与 verify-site.cjs 的数字编号、check-gates-wired.cjs 的 GW*、
 * check-a11y.cjs 的 A*、check-wrapping.cjs 的 W*、check-log-sections.cjs 的 LS* 冲突。
 *
 * 环境变量：
 *   LOG_PATH —— 覆盖要读的日志路径（供 scripts/test-decision-ids.cjs 的注入矩阵在副本上跑）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const LOG = process.env.LOG_PATH || path.join(ROOT, "docs", "IMPROVEMENT-LOG.md");
const CENTRAL_TITLE = "## 待决策（需要本人拍板，任务不会自己动）";

/** 判"同一件事"的阈值（实测标定，见文件头）。 */
const SAME_THING_LCS = 12;

/** 台账内"这一条不代拍"的登记形态：`（本场次不代拍，登记为待拍板 N）`。 */
const CLAIM_RE = /登记为待拍板\s*\**\s*(\d{1,3})/;
/** 场次小节里的**声明**形态 —— 必须是**顶格列表项**（`- ` 起头），两种写法都认：
 *   Form A  `- **待拍板 N（新增）｜标题**`   → 标题在 ｜ 之后
 *   Form B  `- **待拍板 N（新增）**：标题`   → 标题在粗体段之后
 *  ⚠️ 散在正文里的**交叉引用**（「……待拍板 29（RD1 单向覆盖）」）**不算声明** ——
 *    那是"引用别处已登记的那一条"，不是"这里登记了一件事"；认成声明会把改述误判成同号两义。
 *    （正文里的这类引用有几处、涉及哪些号，如实报在通过文案里。）
 */
const DECL_RE = /^\s*-\s+\*\*待拍板\s*(\d{1,3})\s*[（(][^）)]*[）)]/;
/** 正文里出现的「待拍板 N（…）」引用（**交叉引用**，不参与比对）—— 只用于如实报数。 */
const XREF_RE = /待拍板\s*(\d{1,3})\s*[（(][^）)]*[）)]/;

/** 去噪：去掉空白与标点，只留"这件事本身"的字。 */
function denoise(s) {
  return s
    .replace(/[\s\u3000]+/g, "")
    .replace(/[—–\-*_`~#|>（）()【】\[\]「」“”"'：:；;，,。.、!！?？/\\+=]/g, "");
}

/** 最长公共子串长度。 */
function lcsLen(a, b) {
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = new Array(n + 1).fill(0);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** 台账条目的标题：顶格 `- ` 行里第一个 `**…**` 的内容。 */
function boldTitle(line) {
  const m = line.match(/\*\*(.+?)\*\*/);
  return m ? m[1].trim() : line.trim();
}

/** 行首粗体段的内容，以及它之后的内容。 */
function boldParts(line) {
  const start = line.indexOf("**");
  if (start < 0) return { inner: "", rest: line };
  const end = line.indexOf("**", start + 2);
  if (end < 0) return { inner: line.slice(start + 2), rest: "" };
  return { inner: line.slice(start + 2, end), rest: line.slice(end + 2) };
}

/** 一条声明行里"这件事"的标题（两种写法各自取法不同，见 DECL_RE）。 */
function declTitle(line, m) {
  const tail = line.slice(m[0].length);
  const bar = tail.indexOf("｜");
  if (bar >= 0) {
    // Form A：｜之后、下一个 ** 之前
    let t = tail.slice(bar + 1);
    const e = t.indexOf("**");
    return (e >= 0 ? t.slice(0, e) : t).trim();
  }
  // Form B：粗体段之后（冒号后）那句就是标题
  const { inner, rest } = boldParts(line);
  const t = rest.replace(/^[：:，,、]\s*/, "").trim();
  if (t) return t;
  return inner.replace(/^待拍板\s*\d{1,3}\s*[（(][^）)]*[）)]\s*/, "").trim();
}

/** 一条「登记为待拍板 N」脚注去掉声明短语后剩下的部分 —— 即"它指向的事"。 */
function claimTarget(line, m) {
  const t = line
    .replace(m[0], " ")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-–—•\d.、)]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 52 ? t.slice(0, 52) + "…" : t;
}

/* ---------- 读日志 ---------- */
if (!fs.existsSync(LOG)) {
  console.error("待拍板编号唯一性门禁未通过：\n");
  console.error(`  ✗ 读不到日志文件：${LOG}`);
  process.exit(1);
}
const lines = fs.readFileSync(LOG, "utf8").split("\n");

const problems = [];

/* ---------- 定位中央台账（内容锚，不用行号） ---------- */
const titleIdx = [];
lines.forEach((l, i) => {
  if (l.trim() === CENTRAL_TITLE) titleIdx.push(i);
});

let ledger = null; // { start, end, entries: [{title, line, text}] }
if (titleIdx.length === 0) {
  problems.push(
    `[DI0] 日志里找不到中央待决策段的标题「${CENTRAL_TITLE}」—— ` +
      `这一段是全仓唯一的"需要本人拍板"台账，本门禁没有比对对象。` +
      `（标题本身由 check-log-sections.cjs 的 LS2/LS5 守着；本条守的是"能不能拿来比对"。）`
  );
} else if (titleIdx.length > 1) {
  problems.push(
    `[DI0] 中央待决策段的标题出现了 ${titleIdx.length} 次（第 ` +
      `${titleIdx.map((i) => i + 1).join(" / ")} 行）—— 台账出现副本时，本门禁` +
      `只会拿第一份来比对，另一份里的同号登记就看不见了（同号两义会漏过）。`
  );
} else {
  const t = titleIdx[0];
  let term = -1;
  for (let i = t + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      term = i;
      break;
    }
  }
  if (term < 0) {
    problems.push(
      `[DI0] 中央待决策段没有收尾分隔线（标题之后找不到独立的 "---" 行）—— ` +
        `台账的边界就没了，本门禁会拿一大段场次小节当台账来比对。`
    );
  } else {
    const entries = [];
    let cur = null;
    for (let i = t + 1; i < term; i++) {
      if (lines[i].startsWith("- ")) {
        cur = { title: boldTitle(lines[i]), line: i + 1, body: [] };
        entries.push(cur);
      } else if (cur) {
        cur.body.push(lines[i]);
      }
    }
    ledger = { start: t + 1, end: term + 1, entries };
  }
}

/* ---------- 收集认领 / 声明 ---------- */
/** 台账内：每个编号由哪条登记认领。 */
const claims = []; // { n, line, owner }
if (ledger) {
  for (let i = ledger.start - 1; i < ledger.end - 1; i++) {
    const m = lines[i].match(CLAIM_RE);
    if (!m) continue;
    let owner = null;
    for (const e of ledger.entries) if (e.line <= i + 1) owner = e;
    claims.push({ n: Number(m[1]), line: i + 1, owner });
  }
}

/** 全日志：场次小节里的同号声明（Form A / Form B 两种写法都认）。 */
const decls = []; // { n, line, title, form }
lines.forEach((l, i) => {
  const m = l.match(DECL_RE);
  if (!m) return;
  const form = l.slice(m[0].length).includes("｜") ? "A" : "B";
  decls.push({ n: Number(m[1]), line: i + 1, title: declTitle(l, m), form });
});
/** 正文里的**交叉引用**（「……待拍板 N（……）」）：不是声明、不参与比对，只如实报数。 */
const xrefs = []; // { n, line }
lines.forEach((l, i) => {
  if (DECL_RE.test(l)) return; // 声明行本身不算引用
  const m = l.match(XREF_RE);
  if (!m) return;
  xrefs.push({ n: Number(m[1]), line: i + 1 });
});

/* ---------- DI0：判据自证 ---------- */
if (ledger && claims.length === 0) {
  problems.push(
    `[DI0] 中央待决策段里一条「登记为待拍板 N」都认不出来 —— ` +
      `要么台账的登记写法变了，要么认领脚注被删了。` +
      `本门禁此时等于**空跑**，空跑的门禁等于没有门禁，所以判红。` +
      `（台账里目前共 ${ledger.entries.length} 条登记条目；早期条目按登记顺序隐含编号，` +
      `不带显式编号 —— 那种条目本门禁本来就认不出，但至少要有一条**带编号**的，判据才算活着。）`
  );
}

/* ---------- DI2：台账内一个编号只能被一条登记认领 ---------- */
if (ledger) {
  const byNum = new Map();
  for (const c of claims) {
    if (!byNum.has(c.n)) byNum.set(c.n, []);
    byNum.get(c.n).push(c);
  }
  for (const [n, list] of byNum) {
    if (list.length < 2) continue;
    // 同一条目里的多条认领（就地改写脚注）不算"两条登记"
    const owners = [...new Set(list.map((c) => c.owner && c.owner.line))];
    if (owners.length < 2) continue;
    problems.push(
      `[DI2] 待拍板 **${n}** 在中央待决策段里被 ${owners.length} 条**不同的登记**认领` +
        `（第 ${list.map((c) => c.line).join(" / ")} 行）：` +
        list.map((c) => `「${c.owner ? c.owner.title.slice(0, 40) : "?"}」`).join(" ｜ ") +
        ` —— 一个号两件事，本人按号拍板会拍到错的那一件。` +
        `改法：把其中一条改成**下一个空号**，并同步它在本日志别处的引用。`
    );
  }
}

/* ---------- DI1：同号两义（台账认领的号 ↔ 别处的同号声明） ---------- */
let comparedPairs = 0;
if (ledger) {
  const ledgerNums = [...new Set(claims.map((c) => c.n))].sort((a, b) => a - b);
  for (const n of ledgerNums) {
    const claim = claims.find((c) => c.n === n);
    if (!claim || !claim.owner) continue;
    const others = decls.filter((d) => d.n === n);
    for (const o of others) {
      comparedPairs++;
      const v = lcsLen(denoise(claim.owner.title), denoise(o.title));
      if (v >= SAME_THING_LCS) continue; // 同一件事的改述
      problems.push(
        `[DI1] 待拍板 **${n}** 指的是**两件不同的事**：中央台账里是` +
          `「${claim.owner.title.slice(0, 60)}」（第 ${claim.owner.line} 行），` +
          `而第 ${o.line} 行那条声明是「${o.title.slice(0, 60)}」` +
          `（两段文字的最长公共子串只有 ${v} 字，低于"同一件事"的门槛 ${SAME_THING_LCS}）。` +
          `一个号两件事 = 本人按号拍板会拍到错的那一件。` +
          `改法：把其中一条改成**下一个空号**，并同步它在本日志别处的引用。`
      );
    }
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("待拍板编号唯一性门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

/* ---------- 通过文案：覆盖度要写实 ---------- */
const ledgerNums = [...new Set(claims.map((c) => c.n))].sort((a, b) => a - b);
/** 台账外的「登记为待拍板 N」脚注，分两类：
 *   restated —— 该编号**台账里已认领**（这是同一件事在台账外的重申，正常，不算事）
 *   unlisted —— 该编号**台账里没认领**（本人按号能不能找到，取决于台账组织口径） */
const restated = [];
const unlisted = [];
lines.forEach((l, i) => {
  const m = l.match(CLAIM_RE);
  if (!m) return;
  if (ledger && i >= ledger.start - 1 && i < ledger.end - 1) return;
  const rec = { n: Number(m[1]), line: i + 1, target: claimTarget(l, m) };
  (ledgerNums.includes(rec.n) ? restated : unlisted).push(rec);
});
const unlistedNums = [...new Set(unlisted.map((o) => o.n))].sort((a, b) => a - b);
const restatedNums = [...new Set(restated.map((o) => o.n))].sort((a, b) => a - b);

/** 台账外的事项：有声明、但台账里**没有显式认领**这个号。
 *  只报总数与号清单 —— **不逐号展开**：台账里那 30 条**不带显式编号**的条目按登记顺序
 *  隐含编号，本门禁把号对不上条目，所以这个数是**上界**，不是"有这么多件事失踪了"。 */
const offLedgerNums = [...new Set([...decls.map((d) => d.n), ...unlisted.map((u) => u.n)])]
  .filter((n) => !ledgerNums.includes(n))
  .sort((a, b) => a - b);
const implicitEntries = ledger.entries.length - claims.length;

/** 台账外**认领**的号（有「登记为待拍板 N」脚注、而台账没显式认领）——
 *  这一族是"本人按号在台账里找不到那件事"的高发区，逐号列出各处指向的东西。 */
const unlistedDetail = unlistedNums.map((n) => ({
  n,
  decls: decls.filter((d) => d.n === n).map((d) => `L${d.line}「${d.title.slice(0, 44)}」`),
  claims: unlisted.filter((u) => u.n === n).map((u) => `L${u.line}「${u.target}」`),
}));

/** 本门禁**认不出**的「待拍板 N」写法：既不是列表项声明、也不是认领脚注、也不是正文交叉引用。
 *  只报数、不逐处列 —— 这类字样绝大多数是**引用**（"沿用待拍板 23""待拍板 1–7 见前几节"），
 *  从字面上分不出它是"引用别处已登记的那一条"还是"这里新登记了一件事"，
 *  逐处列出来只会把日志的正文引用变成噪音。 */
const otherFormLines = [];
lines.forEach((l, i) => {
  if (!/待拍板\s*\d{1,3}/.test(l)) return;
  if (DECL_RE.test(l) || CLAIM_RE.test(l) || XREF_RE.test(l)) return;
  otherFormLines.push(i + 1);
});

/** 声明的两种写法各认出多少条 —— 覆盖度要报在文案里，不能让人猜。 */
const declFormA = decls.filter((d) => d.form === "A").length;
const declFormB = decls.filter((d) => d.form === "B").length;

console.log(
  `待拍板编号唯一性门禁通过：中央待决策段（第 ${ledger.start}–${ledger.end} 行）` +
    `共 ${ledger.entries.length} 条登记条目，其中 ${claims.length} 条**显式写了编号**` +
    `（认领的号：${ledgerNums.join("、") || "无"}）；` +
    `台账内一个编号只被一条登记认领；` +
    `这 ${ledgerNums.length} 个号与日志别处的同号声明逐条比对了 ${comparedPairs} 对，` +
    `没有一对指向两件不同的事（"同一件事"门槛 = 最长公共子串 ≥ ${SAME_THING_LCS} 字，实测同一件事 ≥ 15、真同号两义 = 6）。`
);
console.log(
  `  ⚠️ 覆盖度（写实，不含糊）：\n` +
    `  · 台账里 ${ledger.entries.length} 条登记条目中有 ${implicitEntries} 条**不带显式编号**` +
    `（编号按登记顺序隐含）→ 本门禁认不出它们、也**无法把号对到条目**。\n` +
    `  · 声明只认**顶格列表项** \`- **待拍板 N（…）…**\` 的两种写法：带 ｜ 的 ${declFormA} 条、` +
    `不带 ｜ 的 ${declFormB} 条，合计 ${decls.length} 条参与同号比对。\n` +
    `  · 正文里的**交叉引用**（「……待拍板 N（……）」）共 ${xrefs.length} 处` +
    `（涉及 N=${[...new Set(xrefs.map((x) => x.n))].sort((a, b) => a - b).join("、") || "无"}）` +
    `**不是声明、不参与比对** —— 它们是"引用别处已登记的那一条"，认成声明会把改述误判成同号两义。\n` +
    `  · 全日志出现的号里，台账**显式**认领 ${ledgerNums.length} 个` +
    `（${ledgerNums.join("、") || "无"}）；另有 ${offLedgerNums.length} 个只出现在台账之外` +
    `（${offLedgerNums.join("、") || "无"}）—— 1–23 号**很可能**已隐含在上面那 ${implicitEntries} 条` +
    `不带编号的条目里（号 ↔ 条目的对应关系本门禁判不了），所以 ${offLedgerNums.length} 是**上界**，` +
    `不是"有 ${offLedgerNums.length} 件事失踪了"。\n` +
    `  · **台账外认领**（有「登记为待拍板 N」脚注、而台账没显式认领）共 ${unlistedNums.length} 个号` +
    `（${unlistedNums.join("、") || "无"}）—— 这一族是"本人按号在台账里找不到那件事"的高发区，逐号明细：`
);
for (const d of unlistedDetail) {
  const parts = [];
  if (d.decls.length) parts.push(`声明 ${d.decls.join(" ｜ ")}`);
  if (d.claims.length) parts.push(`认领 ${d.claims.join(" ｜ ")}`);
  console.log(`      · ${d.n} —— ${parts.join("；") || "（无处可指）"}`);
}
console.log(
  `  · "这些事项本人按号能不能找到"是台账的组织口径，本门禁**只报不判红**、属本人拍板（待拍板 32）。\n` +
    `  · 本门禁**认不出**的「待拍板 N」写法共 ${otherFormLines.length} 处` +
    `（既不是列表项声明、也不是「登记为待拍板 N」脚注、也不是带（…）的交叉引用）——` +
    `这类字样绝大多数是**引用**（"沿用待拍板 23""待拍板 1–7 见前几节"），` +
    `从字面上分不出它是引用还是新登记 → **不参与比对**（把引用认成登记会把改述误判成同号两义）。`
);
