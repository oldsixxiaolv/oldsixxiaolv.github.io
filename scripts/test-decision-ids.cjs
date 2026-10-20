#!/usr/bin/env node
/**
 * 待拍板编号唯一性门禁的**自测**（注入矩阵）—— 证明 DI0/DI1/DI2 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本仓已经反复吃过这种亏
 *   （遮罩把目标文本本身吃掉、覆盖度只覆盖一半还照样打印"通过"）。
 *   所以"这条判据结构上能不能触发"本身必须**被证明**，而不是假定。
 *
 * 做法：把日志**复制**一份到临时目录，在副本上逐个注入缺陷，
 *   用 `LOG_PATH` 环境变量把门禁指向副本，然后断言门禁**确实**报出了
 *   对应编号的红因。
 *   ⚠️ 全程**不动仓库里真的那份日志** —— 注入必须在副本上做。
 *     （这正是门禁里加 `LOG_PATH` 这个开关的原因：没有它，自测就只能去改
 *       仓库文件，改坏了就是事故 —— 而这个日志每天被并发场次追加。）
 *
 * 十一档：
 *   M0 基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   M1 台账里那条被换成**不相干**的事   → DI1
 *   M2 台账里多出一条认领同号的登记     → DI2
 *   M3 台账里一条登记改认别人的号       → DI2
 *   M4 台账登记写法全改（认领数归零）   → DI0
 *   M5 台账标题被改掉（定位不到台账）   → DI0
 *   M6 台账没有收尾分隔线               → DI0
 *   M7 台账标题出现两份                 → DI0
 *   M8 同一件事的**改述**               → 必须**仍绿**（防过度核那一档）
 *   M9 台账外多出一条**另一种写法**的声明（不带 ｜）→ DI1（证明扩展后的声明提取**能变红**，
 *      否则"扩了两种写法"只是纸面上的事）
 *   M10 正文里的**交叉引用**指向另一件事 → 必须**仍绿**（引用不是声明；把引用认成声明
 *      会把"改述"误判成"同号两义"）
 *   M11 台账外同一个号被**认领两次**     → 必须**仍绿**（台账外不判红是待拍板 32 的口径），
 *      但通过文案里**必须逐号列出**这两处认领（证明那条报告是活的，不是死代码）
 *
 * 注入锚点**从真实日志里现取**（不写死编号、不写死标题）：
 *   日志每天被并发场次追加，写死的锚点随时会失效 → 锚点失效必须是**当场报错**，
 *   不能变成"这一档是坏跑却记成测过了"。
 *
 * 用法：node scripts/test-decision-ids.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-decision-ids.cjs");
const LOG = path.join(ROOT, "docs", "IMPROVEMENT-LOG.md");
const CENTRAL_TITLE = "## 待决策（需要本人拍板，任务不会自己动）";
const SAME_THING_LCS = 12; // 与门禁同口径（同一件事的判定门槛）

if (!fs.existsSync(LOG)) {
  console.error("待拍板编号自测失败：找不到 docs/IMPROVEMENT-LOG.md。");
  process.exit(1);
}

const original = fs.readFileSync(LOG, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-decision-selftest-"));
const copyPath = path.join(tmp, "IMPROVEMENT-LOG.md");

/** 在副本上注入 → 跑门禁 → 返回 {code, out} */
function run(mutate) {
  let text = original;
  if (mutate) {
    const next = mutate(text);
    if (next === text) throw new Error("注入没有改变内容 —— 锚点不存在，这一档是坏跑");
    text = next;
  }
  fs.writeFileSync(copyPath, text);
  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, LOG_PATH: copyPath },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from.slice(0, 60)}」`);
  const out = text.replace(from, to);
  if (out === text) throw new Error(`注入没有改变内容：「${from.slice(0, 60)}」`);
  return out;
}

/* ---------- 解析真实日志，取动态锚点 ---------- */
function denoise(s) {
  return s
    .replace(/[\s\u3000]+/g, "")
    .replace(/[—–\-*_`~#|>（）()【】\[\]「」“”"'：:；;，,。.、!！?？/\\+=]/g, "");
}
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

/** 行首粗体段的内容，以及它之后的内容（与门禁同口径）。 */
function boldParts(line) {
  const start = line.indexOf("**");
  if (start < 0) return { inner: "", rest: line };
  const end = line.indexOf("**", start + 2);
  if (end < 0) return { inner: line.slice(start + 2), rest: "" };
  return { inner: line.slice(start + 2, end), rest: line.slice(end + 2) };
}

/** 一条声明行里"这件事"的标题（两种写法各自取法不同，与门禁同口径）。 */
function declTitle(line, m) {
  const tail = line.slice(m[0].length);
  const bar = tail.indexOf("｜");
  if (bar >= 0) {
    let t = tail.slice(bar + 1);
    const e = t.indexOf("**");
    return (e >= 0 ? t.slice(0, e) : t).trim();
  }
  const { inner, rest } = boldParts(line);
  const t = rest.replace(/^[：:，,、]\s*/, "").trim();
  if (t) return t;
  return inner.replace(/^待拍板\s*\d{1,3}\s*[（(][^）)]*[）)]\s*/, "").trim();
}

/** 与门禁同口径地解析：台账位置、条目、认领、声明、台账外认领。 */
function parse(text) {
  const lines = text.split("\n");
  const ti = lines.findIndex((l) => l.trim() === CENTRAL_TITLE);
  if (ti < 0) throw new Error("解析失败：真实日志里找不到中央台账标题");
  let term = -1;
  for (let i = ti + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      term = i;
      break;
    }
  }
  if (term < 0) throw new Error("解析失败：真实日志里找不到台账收尾分隔线");
  const entries = [];
  let cur = null;
  for (let i = ti + 1; i < term; i++) {
    if (lines[i].startsWith("- ")) {
      const m = lines[i].match(/\*\*(.+?)\*\*/);
      cur = { title: m ? m[1].trim() : lines[i].trim(), line: i, text: lines[i] };
      entries.push(cur);
    }
  }
  const claims = [];
  for (let i = ti; i < term; i++) {
    const m = lines[i].match(/登记为待拍板\s*\**\s*(\d{1,3})/);
    if (!m) continue;
    const owner = entries.filter((e) => e.line <= i).pop();
    claims.push({ n: Number(m[1]), line: i, lineText: lines[i], owner });
  }
  /** 台账**之外**的认领脚注（本人按号在台账里找不到那件事的高发区）。 */
  const outClaims = [];
  lines.forEach((l, i) => {
    const m = l.match(/登记为待拍板\s*\**\s*(\d{1,3})/);
    if (!m) return;
    if (i > ti && i < term) return;
    outClaims.push({ n: Number(m[1]), line: i });
  });
  const decls = [];
  lines.forEach((l, i) => {
    const m = l.match(/^\s*-\s+\*\*待拍板\s*(\d{1,3})\s*[（(][^）)]*[）)]/);
    if (!m) return;
    decls.push({ n: Number(m[1]), line: i, title: declTitle(l, m) });
  });
  return { lines, ti, term, entries, claims, outClaims, decls };
}

const parsed = parse(original);
if (parsed.claims.length === 0) {
  console.error("待拍板编号自测失败：真实日志的中央台账里一条「登记为待拍板 N」都认不出");
  console.error("  —— 注入矩阵没有基准，这一整套矩阵都会是坏跑（不是「测过了」）。");
  process.exit(1);
}

/** 找一对"台账认领的号 ↔ 别处的同号声明"，且两者当前**确实是同一件事**（LCS ≥ 门槛）。 */
function pickSameThingPair() {
  for (const c of parsed.claims) {
    for (const d of parsed.decls) {
      if (d.n !== c.n || !c.owner) continue;
      if (lcsLen(denoise(c.owner.title), denoise(d.title)) >= SAME_THING_LCS) {
        return { claim: c, decl: d };
      }
    }
  }
  return null;
}
const pair = pickSameThingPair();
if (!pair) {
  console.error("待拍板编号自测失败：真实日志里找不到任何一对「台账认领的号 ↔ 同号声明」。");
  console.error("  —— DI1 那一档就没有基准了（这一整套矩阵会是坏跑）。");
  process.exit(1);
}
/** 再取一个**号不同**的认领，供 M2/M3 用。 */
const otherClaim = parsed.claims.find((c) => c.n !== pair.claim.n);
if (!otherClaim) {
  console.error("待拍板编号自测失败：真实日志里台账只认领了一个号，M2/M3 那一档没有基准。");
  process.exit(1);
}
/** M11 要用：台账**之外**被认领、而台账没有显式认领的号（"本人按号找不到那件事"的高发区）。 */
const unlistedN = parsed.outClaims.find((c) => !parsed.claims.some((k) => k.n === c.n));
if (!unlistedN) {
  console.error("待拍板编号自测失败：真实日志里找不到「台账外认领、台账未显式认领」的号。");
  console.error("  —— M11 那一档就没有基准了（这一整套矩阵会是坏跑）。");
  process.exit(1);
}

const cases = [];

/* M0 基线 */
const m0 = run(null);
cases.push([
  "M0 基线（原样日志）",
  m0.code === 0 && m0.out.includes("待拍板编号唯一性门禁通过") && m0.out.includes("认领的号："),
  m0.out.trim().split("\n").slice(-1)[0],
]);

/* M1：把台账里那条的标题换成**不相干**的一件事 → DI1 */
const m1 = run((t) =>
  replaceOnce(
    t,
    pair.claim.owner.text,
    pair.claim.owner.text.replace(pair.claim.owner.title, "注入：与原条目毫无关系的一件完全不同的事")
  )
);
cases.push([
  `M1 台账里待拍板 ${pair.claim.n} 那条被换成不相干的事`,
  m1.code === 1 && m1.out.includes("DI1") && m1.out.includes(`待拍板 **${pair.claim.n}**`),
  m1.out.trim().split("\n").slice(-1)[0],
]);

/* M2：台账里多出一条认领**同一个号**的登记 → DI2 */
const m2 = run((t) => {
  const lines = t.split("\n");
  const p = parse(t);
  const inject = [
    `- **注入：另一条认领待拍板 ${otherClaim.n} 的登记**：`,
    "  这是注入矩阵用来触发 DI2 的一条假登记，内容与台账里原有的那条毫无关系。",
    `  （本场次不代拍，登记为待拍板 ${otherClaim.n}）`,
    "",
  ];
  lines.splice(p.term, 0, ...inject);
  return lines.join("\n");
});
cases.push([
  `M2 台账里多出一条认领待拍板 ${otherClaim.n} 的登记`,
  m2.code === 1 && m2.out.includes("DI2") && m2.out.includes(`待拍板 **${otherClaim.n}**`),
  m2.out.trim().split("\n").slice(-1)[0],
]);

/* M3：台账里一条登记**改认别人的号** → DI2 */
const m3 = run((t) =>
  replaceOnce(
    t,
    `登记为待拍板 ${otherClaim.n}`,
    `登记为待拍板 ${pair.claim.n}`
  )
);
cases.push([
  `M3 台账里一条登记改认成待拍板 ${pair.claim.n}`,
  m3.code === 1 && m3.out.includes("DI2"),
  m3.out.trim().split("\n").slice(-1)[0],
]);

/* M4：台账里的登记写法全改 → 认领数归零 → DI0 */
const m4 = run((t) => t.split("登记为待拍板").join("登记为待决项"));
cases.push([
  "M4 台账登记写法全改（认领数归零）",
  m4.code === 1 && m4.out.includes("DI0") && m4.out.includes("空跑"),
  m4.out.trim().split("\n").slice(-1)[0],
]);

/* M5：台账标题被改掉 → 定位不到台账 → DI0 */
const m5 = run((t) => replaceOnce(t, CENTRAL_TITLE, "## 待决定（另一个标题）"));
cases.push([
  "M5 中央台账标题被改掉",
  m5.code === 1 && m5.out.includes("DI0") && m5.out.includes("找不到中央待决策段的标题"),
  m5.out.trim().split("\n").slice(-1)[0],
]);

/* M6：台账没有收尾分隔线（把日志截到标题行）→ DI0 */
const m6 = run((t) => {
  const p = parse(t);
  return t.split("\n").slice(0, p.ti + 1).join("\n");
});
cases.push([
  "M6 中央台账没有收尾分隔线",
  m6.code === 1 && m6.out.includes("DI0") && m6.out.includes("没有收尾分隔线"),
  m6.out.trim().split("\n").slice(-1)[0],
]);

/* M7：台账标题出现两份 → DI0 */
const m7 = run((t) => replaceOnce(t, CENTRAL_TITLE, `${CENTRAL_TITLE}\n${CENTRAL_TITLE}`));
cases.push([
  "M7 中央台账标题出现两份",
  m7.code === 1 && m7.out.includes("DI0") && m7.out.includes("出现了 2 次"),
  m7.out.trim().split("\n").slice(-1)[0],
]);

/* M8：同一件事的**改述** → 必须**仍绿**（防过度核那一档）
   把台账里那条的标题换成场次那条的措辞 —— 文字不同、仍是同一件事。 */
const m8 = run((t) =>
  replaceOnce(
    t,
    pair.claim.owner.text,
    pair.claim.owner.text.replace(pair.claim.owner.title, pair.decl.title)
  )
);
cases.push([
  `M8 待拍板 ${pair.claim.n} 换成同一件事的另一种措辞（应仍绿）`,
  m8.code === 0,
  m8.out.trim().split("\n").slice(-1)[0],
]);

/** 在日志末尾追加一行（末尾在台账之外 → 注入的是"台账外的声明"，不是台账内条目）。 */
function appendLine(t, line) {
  return t.replace(/\n*$/, "\n") + line + "\n";
}

/* M9：台账外多出一条**另一种写法**（不带 ｜）的声明、指向另一件事 → DI1
   这一档证明"扩了两种写法"不是纸面上的事：没扩的话，这一档不会变红。 */
const m9 = run((t) =>
  appendLine(
    t,
    `- **待拍板 ${pair.claim.n}（新增）**：注入：与原条目毫无关系的一件完全不同的事`
  )
);
cases.push([
  `M9 台账外多出一条不带 ｜ 的待拍板 ${pair.claim.n} 声明（另一件事）`,
  m9.code === 1 && m9.out.includes("DI1") && m9.out.includes(`待拍板 **${pair.claim.n}**`),
  m9.out.trim().split("\n").slice(-1)[0],
]);

/* M10：正文里的**交叉引用**指向另一件事 → 必须**仍绿**
   引用不是声明；把引用认成声明，会把"改述"误判成"同号两义"。 */
const m10 = run((t) =>
  appendLine(t, `- 顺带一提：待拍板 ${pair.claim.n}（另有一件完全不同的事，此处只是引用）`)
);
cases.push([
  `M10 正文里对待拍板 ${pair.claim.n} 的交叉引用（应仍绿）`,
  m10.code === 0,
  m10.out.trim().split("\n").slice(-1)[0],
]);

/* M11：台账外同一个号被**认领两次** → 必须**仍绿**（台账外不判红＝待拍板 32 的口径），
   但通过文案里**必须逐号列出**这两处认领 —— 证明那条报告是活的，不是死代码。 */
const M11_MARK = "注入：台账外第二个认领";
const m11 = run((t) =>
  appendLine(
    t,
    `- ${M11_MARK}（**登记为待拍板 ${unlistedN.n}**）—— 与原认领完全无关的另一件事`
  )
);
cases.push([
  `M11 台账外的待拍板 ${unlistedN.n} 被认领两次（应仍绿，但必须被报出来）`,
  m11.code === 0 && m11.out.includes(M11_MARK),
  m11.out.trim().split("\n").slice(-1)[0],
]);

/* ---------- 汇总 ---------- */
let failed = 0;
console.log("待拍板编号唯一性门禁 · 本地注入矩阵：\n");
for (const [label, ok, detail] of cases) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}`);
  if (!ok) {
    failed++;
    console.log(`      详情：${detail}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });

if (failed) {
  console.error(`\n自测失败：${failed} 档没有按预期触发。\n`);
  process.exit(1);
}
console.log(`\n自测通过：${cases.length} 档全部按预期触发。\n`);
