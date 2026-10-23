#!/usr/bin/env node
/**
 * README 事实核对门禁的**自测**（四件套）—— 证明 RD1–RD7 每一条都**能变红**，
 * 且门禁新增判据 / 新增红因时本自测**立刻察觉**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。本仓已经吃过好几次这种亏
 *   （遮罩把目标文本本身吃掉、覆盖度只覆盖一半还照样打印"通过"）。
 *   所以"这条判据结构上能不能触发"本身必须**被证明**，而不是假定。
 *
 * ⚠️ 这道门禁的**红因有两套出口**，旧版自测只覆盖了其中一套：
 *   ① **收集型**：`problems.push(...)` —— 13 处，红因行首带判据号 `RD1`–`RD7`，
 *      最后由门禁统一打印成 `  ✗ <消息>`；
 *   ② **早期退出型**：`console.error("  ✗ …")` + `process.exit(1)` —— 4 处
 *      （README 不存在 / package.json 不存在 / package.json 是坏 JSON /
 *        产物 _site 不存在或不完整）。这 4 条**不进 problems**，
 *      **红因行首也没有判据号** ⇒ 旧版自测的「输出里含 RD1」式断言**一条都测不到**。
 *   ⇒ 覆盖度自证必须**分别数两类出口**，运行时归属必须**按「行首有没有编号」分流**。
 *
 * 四件套：
 *   ① **红因归属表**（`CAUSES` 17 条：13 条收集型 + 4 条早期退出型），
 *      每条恰好认领**一个**出口点（区间法绑定），归属片段**互不包含**、
 *      且在门禁源码里**只出现一次**；
 *   ② **归属纯净**：每条红因行必须被**恰好一条**归属认领；
 *      收集型认出的判据必须与**行首编号**一致；早期退出型认出的必须是 early 条目。
 *   ③ **覆盖度自证（双向）**：收集型出口数 == 归属表条数、早期退出型出口数 == 归属表条数、
 *      门禁解析出的判据**集合** == 静态判据清单、每条归属恰好认领一个出口、
 *      片段互不包含、**每条红因至少有一档能证明它会变红**；
 *   ④ **判据级负对照**：门禁**副本**里把某判据（或某条早期退出）的打印**静默**，
 *      证明那条红因确实由那个出口产生（行数不变 + `node --check` 语法自检）。
 *
 * 夹具站：门禁**副本**放在 `<tmp>/gate/scripts/` 下 ⇒ 门禁里的
 *   `ROOT = path.resolve(__dirname, "..")` 变成 `<tmp>/gate`
 *   ⇒ 它读的那份 `package.json` / `CITATION.cff` 就**可控**了
 *   （门禁本体没有给 package.json 留环境变量开关，只给 README 与产物留了）。
 *   ⚠️ 还要把 `scripts/check-*.cjs` / `verify-*.cjs` **整份复制**进 `<tmp>/gate/scripts/`：
 *      RD6 要读门禁源码来对账判据编号，RD7a 要证明解析器还活着。
 *      少复制 ⇒ 门禁一个源码都读不到 ⇒ RD7a/RD7b 连坐 ⇒ 现有每一档都会连锁失败。
 *   全程**不动仓库里真的 README / package.json / 产物**。
 *
 * 档位（23 档注入 + 11 档判据级负对照 + 7 档覆盖度自证 = 41 档）：
 *   SP0  基线（原样）                                  → 必须**全绿**
 *   SP1  README 写了一个不存在的路由                  → RD1
 *   SP2  README 的 Node 下限低于 package.json          → RD2
 *   SP3  README 漏掉了一个命令                          → RD3
 *   SP4  README 里 CITATION.cff 改名（漏掉一个出口）   → RD4
 *   SP5  判据自身失效（一个路径都认不出）              → RD5
 *   SP6  产物推不出本站自己的域名                      → RD1
 *   SP7  package.json 的 engines.node 读不出版本号     → RD2
 *   SP8  README 完全没声明 Node 版本                   → RD2
 *   SP9  package.json 的命令少到认不满下限             → RD5（命令数不足；
 *        裁剪时**保留「声明了判据编号的门禁行」对应的 script**，否则 RD6/RD7b 连坐）
 *   SP10 一个对外出口都认不出来                        → RD4×6 + RD5
 *   SP11 README 不存在                                 → 早期退出型
 *   SP12 package.json 不存在                           → 早期退出型
 *   SP13 package.json 是坏 JSON                        → 早期退出型
 *   SP14 产物 _site 不存在或不完整                     → 早期退出型
 *   SP15 README 写了指向不存在站内页的**绝对 URL**     → RD1
 *   SP16 **外部域名**的绝对 URL                        → 必须**仍绿**（防止过度核）
 *   SP17 README 漏掉 /publications.bib（既是路径又是出口）→ RD4
 *   SP18 README 门禁行**少列**一个判据编号               → RD6
 *   SP19 README 门禁行**多列**一个不存在的判据编号       → RD6
 *   SP20 门禁行**不列**判据编号（没声明就没有义务）       → 必须**仍绿**
 *   SP21 README 一个判据编号都不列（对账无事可做）        → RD7b
 *   SP22 门禁源码一个都读不到（解析器自证失效）          → RD7a + RD7b
 *   NC-RD1–NC-RD7  判据级负对照（卸掉某判据的收集型出口）
 *   NC-E1–NC-E4    早期退出型负对照（卸掉某条早期退出的打印）
 *   COV2a–COV2g    覆盖度自证（双向）
 *
 * 用法：node scripts/test-readme.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-readme.cjs");
const README_SRC = path.join(ROOT, "README.md");
const PKG_SRC = path.join(ROOT, "package.json");
const CFF_SRC = path.join(ROOT, "CITATION.cff");
const SITE_SRC = path.join(ROOT, "_site");
/* 门禁源码清单 —— RD6 要读它们来对账判据编号，RD7a 要靠它们证明解析器还活着。
   清单**现读**目录，不写死：门禁增删时自测自动跟上。 */
const GATES_SRC_DIR = path.join(ROOT, "scripts");
const GATE_SOURCE_FILES = fs
  .readdirSync(GATES_SRC_DIR)
  .filter((f) => /^(?:check|verify)-[A-Za-z0-9._-]+\.cjs$/.test(f))
  .sort();
/* README 里 `check:css-publish` 那一行关于 CS8 的**当前写法** —— SP18/SP19 的注入锚点。
   ⚠️ README 改了这一句 ⇒ 锚点不存在 ⇒ 那两档会当场报「坏跑」（而不是悄悄放过）。 */
const README_CS8 = "（CS8：产物里必须有 components.css，否则判不出 dev/prod 模式）";

function sha256(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

if (!fs.existsSync(README_SRC)) {
  console.error("README 自测失败：找不到 README.md。");
  process.exit(1);
}
if (!fs.existsSync(SITE_SRC)) {
  console.error("README 自测失败：找不到 _site/，请先运行 npm run build。");
  process.exit(1);
}
if (!fs.existsSync(CFF_SRC)) {
  console.error("README 自测失败：找不到 CITATION.cff。");
  process.exit(1);
}

const GATE_SHA_AT_START = sha256(GATE);

/* ================= 红因归属表 + 静态判据清单 ================= */

/**
 * 14 条归属，**分两类**：
 *   site="push"  —— 收集型出口（`problems.push(`），红因行首带判据号；
 *   site="early" —— 早期退出型出口（`console.error("  ✗ …")`），红因行首**没有**判据号。
 *
 * frag 必须在门禁源码里**只出现一次**（运行时也只出现一次），
 * 否则它既认不准出口、也会在运行时认错行。覆盖度自证 COV2f 会当场验这一条。
 */
const CAUSES = [
  /* ---- 收集型：problems.push( ---- */
  { id: "RD1a", site: "push", crit: "RD1", frag: "推不出本站自己的域名", desc: "产物里读不出本站域名（canonical 与 sitemap 都读不到）" },
  { id: "RD1b", site: "push", crit: "RD1", frag: "在产物里不存在", desc: "README 提到的站内路径在产物里不存在" },
  { id: "RD2a", site: "push", crit: "RD2", frag: "里读不出版本号", desc: "package.json 的 engines.node 里读不出版本号" },
  { id: "RD2b", site: "push", crit: "RD2", frag: "没有声明 Node 版本", desc: "README 完全没声明 Node 版本下限" },
  { id: "RD2c", site: "push", crit: "RD2", frag: "声明的 Node 下限是", desc: "README 声明的 Node 下限低于 package.json" },
  { id: "RD3", site: "push", crit: "RD3", frag: "package.json 里的脚本", desc: "package.json 里的某个 npm script 没被 README 提到" },
  { id: "RD4", site: "push", crit: "RD4", frag: "RD4 对外出口", desc: "某个对外出口没被 README 提到" },
  { id: "RD5a", site: "push", crit: "RD5", frag: "个真实存在的路径", desc: "只认出太少的真实路径（判据可能已失效）" },
  { id: "RD5b", site: "push", crit: "RD5", frag: "个命令（至少要", desc: "只认出太少的命令（判据可能已失效）" },
  { id: "RD5c", site: "push", crit: "RD5", frag: "一个对外出口都没认出来", desc: "一个对外出口都没认出来（判据可能已失效）" },
  { id: "RD6", site: "push", crit: "RD6", frag: "列的判据编号与门禁源码对不上", desc: "README 门禁行列的判据编号与门禁源码对不上" },
  { id: "RD7a", site: "push", crit: "RD7", frag: "都没解析出非空的判据编号集合", desc: "一道门禁源码都没解析出非空判据集合（解析器可能已失效）" },
  { id: "RD7b", site: "push", crit: "RD7", frag: "一次都没真的比对过", desc: "RD6 一次都没真的比对过（对账空跑）" },
  /* ---- 早期退出型：console.error("  ✗ …") + process.exit(1) ---- */
  { id: "E1", site: "early", crit: null, frag: "找不到 README.md", desc: "README.md 不存在 ⇒ 门禁直接退出" },
  { id: "E2", site: "early", crit: null, frag: "找不到 package.json", desc: "package.json 不存在 ⇒ 门禁直接退出" },
  { id: "E3", site: "early", crit: null, frag: "package.json 解析失败", desc: "package.json 是坏 JSON ⇒ 门禁直接退出" },
  { id: "E4", site: "early", crit: null, frag: "产物 _site/ 不存在或不完整", desc: "产物 _site 缺失或连 index.html 都没有 ⇒ 门禁直接退出" },
];

/** 静态判据清单 —— 必须与门禁源码里解析出的判据集合**双向相等**。 */
const CRITERIA = ["RD1", "RD2", "RD3", "RD4", "RD5", "RD6", "RD7"];

/* 门禁自己的失败 / 通过横幅 —— 用来判「门禁确实跑到了自己的结论」。
   门禁崩了（语法错、未捕获异常）**也是 exit 1** ⇒ 只看退出码会把崩溃当成判红。 */
const GATE_FAIL_BANNER = "README 事实核对门禁未通过：";
const GATE_PASS_BANNER = "README 事实核对门禁通过：";

/* ================= 夹具站 ================= */

const ORIGINAL_README = fs.readFileSync(README_SRC, "utf8");
const ORIGINAL_PKG = fs.readFileSync(PKG_SRC, "utf8");
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "mh-readme-selftest-"));

/**
 * 造一个「门禁副本站」：
 *   <tmp>/gate/scripts/check-readme.cjs   门禁副本（ROOT 变成 <tmp>/gate）
 *   <tmp>/gate/package.json               可控（缺失 / 坏 JSON / 裁剪脚本）
 *   <tmp>/gate/CITATION.cff               可控（决定 RD4 的期望集里有没有它）
 *   <tmp>/README.md                      README 副本（注入都在副本上做）
 */
function makeSandbox(mut) {
  const dir = fs.mkdtempSync(path.join(TMP_ROOT, "case-"));
  const gateDir = path.join(dir, "gate");
  fs.mkdirSync(path.join(gateDir, "scripts"), { recursive: true });
  /* 门禁源码整份复制进来 —— RD6 要读它们对账判据编号。
     ⚠️ 少复制 ⇒ 门禁一个源码都读不到 ⇒ RD7a/RD7b 连坐 ⇒ 每一档都连锁失败。 */
  for (const f of GATE_SOURCE_FILES) {
    fs.copyFileSync(path.join(GATES_SRC_DIR, f), path.join(gateDir, "scripts", f));
  }
  fs.copyFileSync(GATE, path.join(gateDir, "scripts", "check-readme.cjs"));
  fs.writeFileSync(path.join(gateDir, "package.json"), ORIGINAL_PKG);
  fs.copyFileSync(CFF_SRC, path.join(gateDir, "CITATION.cff"));
  const readmePath = path.join(dir, "README.md");
  fs.writeFileSync(readmePath, ORIGINAL_README);
  const sb = {
    dir,
    gateDir,
    gateFile: path.join(gateDir, "scripts", "check-readme.cjs"),
    pkgFile: path.join(gateDir, "package.json"),
    cffFile: path.join(gateDir, "CITATION.cff"),
    readmePath,
    siteDir: SITE_SRC,
  };
  if (mut) mut(sb);
  return sb;
}

function readmeOf(sb) {
  return fs.readFileSync(sb.readmePath, "utf8");
}
function writeReadme(sb, text) {
  fs.writeFileSync(sb.readmePath, text);
}

/* ================= 跑门禁 / 解析红因 ================= */

function runGate(sb, envExtra) {
  const env = Object.assign({}, process.env, {
    README_PATH: sb.readmePath,
    SITE_DIR: sb.siteDir,
  }, envExtra || {});
  const r = spawnSync(process.execPath, [sb.gateFile], { env, encoding: "utf8" });
  return {
    code: typeof r.status === "number" ? r.status : -1,
    out: `${r.stdout || ""}${r.stderr || ""}`,
  };
}

/** 所有红因行（`  ✗ …` 开头的行）。早期退出型与收集型都在这里。 */
function redRows(out) {
  return out.split("\n").filter((l) => /^[ \t]*✗/.test(l));
}

/** 红因行的行首判据号；早期退出型（没有编号）返回 null。 */
function rowPrefix(row) {
  const m = /^[ \t]*✗[ \t]+(RD\d+)/.exec(row);
  return m ? m[1] : null;
}

/** 多重集完全相等（不是「包含」）：多一条、少一条都算这档失败。 */
function sameMultiset(got, want) {
  if (got.length !== want.length) return false;
  const g = [...got].sort();
  const w = [...want].sort();
  return g.every((x, i) => x === w[i]);
}

function fmtIds(ids) {
  return [...ids].sort().join("+") || "（无）";
}

/* ================= 覆盖度自证用的解析器 ================= */

/**
 * 门禁源码里的**收集型出口**：`problems.push(` 的调用点及其判据编号。
 *
 * ⚠️ 判据编号要从**调用点之后**的模板文本里取（形如 `RD3 package.json 里的脚本…`）。
 * ⚠️ 必须用**整文件**正则而不是逐行找 —— 多行调用（`problems.push(\n  "…"`）
 *    逐行是数不出来的。
 */
function scanPushCalls(src) {
  const calls = [];
  const re = /problems\.push\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const tail = src.slice(m.index, m.index + 400);
    const cm = /RD\d/.exec(tail);
    calls.push({ index: m.index, crit: cm ? cm[0] : null });
  }
  return calls;
}

/**
 * 门禁源码里的**早期退出型出口**：红因行首是 `✗ ` 后面**紧跟实际文字**的那些。
 *
 * ⚠️ 汇总那行是 `  ✗ ${p}` ⇒ `✗ ` 后面紧跟 `${` ⇒ 用负向断言 `(?!\$\{)` 排除掉。
 *    不排除的话会把「统一打印」那个出口也算进来，覆盖度自证就会数错。
 */
function scanEarlyExits(src) {
  const sites = [];
  const re = /✗ (?!\$\{)/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    sites.push({ index: m.index });
  }
  return sites;
}

/**
 * 一个归属片段落在**哪些**出口点的区间里（区间法）。
 * 规则：片段必须出现在「它自己的那个出口点之后、下一个出口点之前」。
 * @param sites 同类出口点（收集型或早期退出型）按源码位置排序
 */
function ownersOfFrag(frag, sites, src) {
  const owners = [];
  let from = 0;
  for (;;) {
    const k = src.indexOf(frag, from);
    if (k < 0) break;
    from = k + 1;
    for (let i = 0; i < sites.length; i++) {
      const start = sites[i].index;
      const end = i + 1 < sites.length ? sites[i + 1].index : src.length;
      if (k > start && k < end) owners.push(i);
    }
  }
  return owners;
}

/**
 * 运行时归属：把每条红因行交给归属表认领。
 *
 * **按「行首有没有判据号」分流**：
 *   · 有编号 ⇒ 只在**该判据**的收集型归属里找片段命中
 *     （不用「全表扫片段」—— 一个判据可能有多条红因，跨判据扫会认错行）；
 *   · 没有编号 ⇒ 只在**早期退出型**归属里找片段命中
 *     （这才是这道门禁的早期退出型红因；收集型裸红因在这道门里不存在，
 *       真出现了一条没编号的收集型红因，也会被这一支判成「认领不到」⇒ 当场红）。
 */
function attributeRows(out) {
  return redRows(out).map((row) => {
    const prefix = rowPrefix(row);
    const pool = prefix
      ? CAUSES.filter((c) => c.site === "push" && c.crit === prefix)
      : CAUSES.filter((c) => c.site === "early");
    const hits = pool.filter((c) => row.includes(c.frag));
    return {
      row,
      hits: hits.map((c) => c.id),
      crits: hits.map((c) => c.crit),
      sites: hits.map((c) => c.site),
      prefix,
    };
  });
}

/* ================= 注入 / 破坏的公用动作 ================= */

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成「测过了」）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  const out = text.replace(from, to);
  if (out === text) throw new Error(`注入没有改变内容：「${from}」`);
  return out;
}

/**
 * 替换**全部**出现（词边界）。
 * 为什么需要「全部」：命令名在 README 里可能出现**多次**（表格里一次、正文里一次）
 * —— 只改一处的话名字还在，RD3 本来就该绿，那一档就变成了「坏跑」而不是「判据没触发」。
 */
function replaceAllWords(text, word, to) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![A-Za-z0-9_-])${esc}(?![A-Za-z0-9_-])`, "g");
  if (!re.test(text)) throw new Error(`注入锚点不存在：找不到「${word}」`);
  const out = text.replace(re, to);
  if (out === text) throw new Error(`注入没有改变内容：「${word}」`);
  return out;
}

/**
 * 把某段文本里某个前缀的**判据编号**全部抹掉（换成可读文字）。
 * 断言真的抹掉了 —— 否则这一档是「坏跑」而不是「判据没触发」。
 */
function stripCritTokens(text, prefix) {
  const re = new RegExp(`${prefix}\\d{1,3}`, "g");
  const n = (text.match(re) || []).length;
  if (!n) throw new Error(`注入锚点不存在：文本里没有 ${prefix} 开头的判据编号 —— 坏跑`);
  return text.replace(re, "该判据");
}

/**
 * 把 README **所有 `npm run` 行**里的判据编号全部抹掉（**不看前缀**）。
 *
 * 为什么不能写死前缀（这一版就是把写死前缀的那一版换掉）：
 *   写死前缀成立的前提是"当时只有 JA / IP / CS 三组会参与对账"。
 *   后来每加一道**带判据编号声明的门禁**（README 里多一行），写死前缀的抹法就漏掉
 *   新那一组 ⇒「对账无事可做」这个前提被打破 ⇒ 那一档当场假失败
 *   （实测：加了 `check:selftest-guard` 那一行之后，SP21 的 exit 从 1 变成 0）。
 *   ⇒ 前缀必须**现读**，不许写死（与本仓「不写死别的门禁的判据编号区间」同源）。
 *
 * 只抹 `npm run` 行：RD6 就是按这个形状挑行的（`^\|\s*`npm run X`\s*\|`），
 * 行外的判据编号 RD6 根本不看，抹了也没用。
 */
function stripAllCritTokensInNpmRows(text) {
  const re = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})\d{1,3}/g;
  let n = 0;
  const out = text
    .split("\n")
    .map((l) => {
      if (!/^\|\s*`npm run [^`]+`\s*\|/.test(l)) return l;
      return l.replace(re, () => {
        n += 1;
        return "该判据";
      });
    })
    .join("\n");
  if (!n) throw new Error("注入锚点不存在：README 的 npm run 行里一个判据编号都没有 —— 坏跑");
  return out;
}

/** 副本与原件的「改动行数」—— 证明注入确实打上了，且只打了声明的那些行。 */
function changedLines(a, b) {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  let c = 0;
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) c += 1;
  return c;
}

/**
 * 把门禁副本里某个判据的**每一条** `problems.push(` 调用**同行**加 `if (false) ` 前缀。
 *
 * 为什么是「同行加前缀」而不是改判断条件：
 *   · 门禁**没有** `RD*_ON` 开关，改条件会碰到生产契约；
 *   · 同行加前缀 ⇒ **行数不变** ⇒ 可与基线副本逐行比对，只差该判据的调用数；
 *   · 静默的是**判定**（这条红因不再被收集），不是**红因文案**。
 *
 * ⚠️ 下标要**倒序**处理：插入会让后面的下标整体位移。
 */
function unloadCriterion(sb, crit) {
  const before = fs.readFileSync(sb.gateFile, "utf8");
  const calls = scanPushCalls(before).filter((c) => c.crit === crit);
  if (!calls.length) throw new Error(`门禁副本里找不到判据 ${crit} 的 problems.push( 调用`);
  let out = before;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    out = out.slice(0, calls[i].index) + "if (false) " + out.slice(calls[i].index);
  }
  fs.writeFileSync(sb.gateFile, out);
  const after = fs.readFileSync(sb.gateFile, "utf8");
  const n = changedLines(before, after);
  if (n !== calls.length) {
    throw new Error(
      `卸掉 ${crit} 的改动行数与声明不符（期望 ${calls.length} 行，实际 ${n} 行）—— 已中止。`
    );
  }
  const chk = spawnSync(process.execPath, ["--check", sb.gateFile], { encoding: "utf8" });
  if (chk.status !== 0) {
    throw new Error(`卸掉 ${crit} 之后门禁副本语法不过：${(chk.stderr || "").trim()}`);
  }
  return calls.length;
}

/**
 * 把门禁副本里某条**早期退出型**出口的打印**同行**加 `if (false) ` 前缀。
 *
 * 做法：定位该归属片段的位置 ⇒ 往前找**最近的** `console.error(` ⇒ 在那里插入前缀。
 *   · 为什么不是直接改片段所在行：早期退出型里有一条是多行调用
 *     （`console.error(\n  "  ✗ 产物 _site/ …" +\n …`），
 *     片段所在行是**字符串续行**，不是语句开头 ⇒ 前缀加在那里是语法错误。
 *   · `if (false) console.error(...)` 不需要花括号，多行参数也合法。
 *   · 静默之后门禁**仍然 exit 1**（`process.exit(1)` 还在）但**一条红因都不打**
 *     ⇒ 这正是「那条红因就是由这个出口打印的」的证据。
 */
function unloadEarly(sb, causeId) {
  const cause = CAUSES.find((c) => c.id === causeId);
  if (!cause) throw new Error(`归属表里没有 ${causeId}`);
  const before = fs.readFileSync(sb.gateFile, "utf8");
  const fragAt = before.indexOf(cause.frag);
  if (fragAt < 0) throw new Error(`门禁副本里找不到 ${causeId} 的片段「${cause.frag}」`);
  const ceAt = before.lastIndexOf("console.error(", fragAt);
  if (ceAt < 0) throw new Error(`${causeId} 的片段不在任何 console.error( 调用里`);
  const out = before.slice(0, ceAt) + "if (false) " + before.slice(ceAt);
  fs.writeFileSync(sb.gateFile, out);
  const after = fs.readFileSync(sb.gateFile, "utf8");
  const n = changedLines(before, after);
  if (n !== 1) {
    throw new Error(`卸掉 ${causeId} 的改动行数与声明不符（期望 1 行，实际 ${n} 行）—— 已中止。`);
  }
  const chk = spawnSync(process.execPath, ["--check", sb.gateFile], { encoding: "utf8" });
  if (chk.status !== 0) {
    throw new Error(`卸掉 ${causeId} 之后门禁副本语法不过：${(chk.stderr || "").trim()}`);
  }
  return 1;
}

/* ================= 断言 ================= */

const results = [];
/** 所有判红档实际认领过的归属条目 —— 收尾断言「每条红因至少有一档能证明它会红」。 */
const coveredCauses = new Set();

function record(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${id}${detail ? " —— " + detail : ""}`);
}

/**
 * 一档「注入 ⇒ 应当恰好红这么几条判据」。
 * @param want 期望的判据编号**多重集**（必须完全相等，不只是「包含」）；
 *        早期退出型红因没有编号 ⇒ 传 []。
 * @param opts.mustContain 红因文案里必须出现的片段：证明「红的是这一类问题」，
 *        而不只是「编号对上了」（同一个编号下有多条红因时靠它区分）
 * @param opts.rows 期望的红因**行数**（一条判据可能触发多条红因）
 */
function expectRed(id, sb, want, opts) {
  const o = opts || {};
  const r = runGate(sb, o.env);
  const rows = redRows(r.out);
  /* 早期退出型的红因**没有**行首判据号 ⇒ 不进编号多重集
     （它们的归属由 attrOk 负责：认不到归属的行会当场判红）。
     编号集合只用来断言「收集型红因恰好是这几条」。 */
  const got = rows.map(rowPrefix).filter((x) => x !== null);
  const idsOk = sameMultiset(got, want);
  const textOk = !o.mustContain || r.out.includes(o.mustContain);
  const rowsOk = o.rows === undefined ? rows.length === want.length : rows.length === o.rows;
  /* 门禁必须跑到了自己的结论（横幅出现）—— 否则「门禁崩了」也是 exit 1，会被当成判红。 */
  const bannerOk = r.out.includes(GATE_FAIL_BANNER);
  /* 归属纯净：每条红因行恰好被一条归属认领；收集型认出的判据必须与行首编号一致。 */
  const attr = attributeRows(r.out);
  const attrOk =
    attr.length === rows.length &&
    attr.every((row) =>
      row.hits.length === 1 &&
      (row.prefix ? row.crits[0] === row.prefix : row.sites[0] === "early")
    );
  const ok = r.code === 1 && idsOk && textOk && rowsOk && bannerOk && attrOk;
  attr.forEach((row) => row.hits.forEach((h) => coveredCauses.add(h)));
  record(
    id,
    ok,
    ok
      ? `红了，判据 = ${fmtIds(got)}（${rows.length} 条红因、归属纯净）${o.note ? "；" + o.note : ""}`
      : `期望判据 ${fmtIds(want)} 且只有这些` +
        `${o.mustContain ? `、文案含「${o.mustContain}」` : ""}` +
        `${o.rows !== undefined ? `、红因行数 ${o.rows}` : ""}` +
        `${bannerOk ? "" : "、且须出现门禁失败横幅"}` +
        `${attrOk ? "" : "、且每条红因行恰好被一条归属认领"}` +
        `，实际 code=${r.code} 红因 ${fmtIds(got)}（${rows.length} 行）` +
        `归属 ${attr.map((x) => `${x.prefix || "无编号"}<-${x.hits.join("+") || "无"}`).join(" / ")}\n${r.out}`
  );
}

/** 一档「绿档」：门禁应当 exit 0、一个红因都不许有，且须出现通过横幅。 */
function expectGreen(id, sb, note) {
  const r = runGate(sb);
  const rows = redRows(r.out);
  const bannerOk = r.out.includes(GATE_PASS_BANNER);
  const ok = r.code === 0 && rows.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `绿，一个红因都不剩${note ? "；" + note : ""}`
      : `不该红，却 exit ${r.code}，红因 ${fmtIds(rows.map(rowPrefix))}` +
        `${bannerOk ? "" : "（且缺少门禁通过横幅）"}\n${r.out}`
  );
}

/**
 * 一档「早期退出型负对照」：把某条早期退出的**打印**卸掉之后，
 * 门禁仍然 exit 1（`process.exit(1)` 还在）、横幅仍在，但**一条红因都不许打**。
 */
function expectNoRowRed(id, sb, note) {
  const r = runGate(sb);
  const rows = redRows(r.out);
  const bannerOk = r.out.includes(GATE_FAIL_BANNER);
  const ok = r.code === 1 && rows.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `那条红因消失了（仍 exit 1 + 失败横幅在）${note ? "；" + note : ""}`
      : `期望 exit 1 且零红因行，实际 code=${r.code}、红因 ${rows.length} 行` +
        `${bannerOk ? "" : "（且缺少门禁失败横幅）"}\n${r.out}`
  );
}

/* ================= 注入档 SP0–SP17 ================= */

console.log("README 事实核对门禁 · 本地注入矩阵：\n");

/* SP0：基线 —— 原样，必须**全绿**（证明这套判据不是空跑）。 */
{
  const sb = makeSandbox();
  expectGreen("SP0 基线（原样 README / package.json / 产物）", sb);
}

/* SP1：README 写一个不存在的路由 ⇒ RD1
 *   ⚠️ 注入行里**不能出现**任何「未实现」标记词 —— 否则那一行会被
 *      「规划中的路径」豁免掉，注入自己把自己遮住了（第一版就这么坏跑过）。 */
{
  const sb = makeSandbox();
  writeReadme(sb, replaceOnce(readmeOf(sb), "| 博客 | `/blog/` |", "| 旧归档 | `/portfolio-archive/` | 往年的项目 |"));
  expectRed("SP1 README 写了不存在的路由", sb, ["RD1"], { mustContain: "/portfolio-archive/" });
}

/* SP2：Node 下限低于 package.json ⇒ RD2 */
{
  const sb = makeSandbox();
  writeReadme(sb, replaceOnce(readmeOf(sb), "需要 **Node ≥ 22**", "需要 **Node ≥ 18**"));
  expectRed("SP2 README 的 Node 下限低于 package.json", sb, ["RD2"], { mustContain: "声明的 Node 下限是" });
}

/* SP3：漏掉一个命令（要**全部**换掉，否则名字还在，RD3 本来就该绿）⇒ RD3 */
{
  const sb = makeSandbox();
  writeReadme(sb, replaceAllWords(readmeOf(sb), "check:citation-cff", "check:citation-xxx"));
  expectRed("SP3 README 漏掉了一个命令", sb, ["RD3"], { mustContain: "check:citation-cff" });
}

/* SP4：漏掉一个**对外出口** ⇒ RD4
 *   ⚠️ 为什么改的是 CITATION.cff 而不是 /publications.bib：
 *      出口名单里同时有「既是站内路径、又是出口」的那几个（/publications.bib 等）。
 *      把路径形态一起改掉 ⇒ RD1 也会红 ⇒ 这一档就变成「连坐」，判据集合不再恰为。
 *      CITATION.cff 在 README 里**从不带前导斜杠** ⇒ 只动 RD4、不动 RD1。 */
{
  const sb = makeSandbox();
  writeReadme(sb, replaceAllWords(readmeOf(sb), "CITATION.cff", "CITATION-zz.cff"));
  expectRed("SP4 README 里对外出口 CITATION.cff 改名", sb, ["RD4"], { mustContain: "CITATION.cff" });
}

/* SP5：判据自身失效（把 README 里的路径全部改成认不出的形态）⇒ RD5
 *   ⚠️ 出口名必须用**不带路径**的写法补回去：RD1（路径）与 RD4（出口 basename）
 *      在这里是**对偶**的 —— README 提到出口的路径形态就等于提到 basename；
 *      不补回去的话 RD4 会连坐 3 条，这一档的判据集合就不再「恰为」。 */
function breakAllPaths(readme) {
  return (
    readme.replace(/\/[A-Za-z0-9._~%+-]+/g, "") +
    "\n出口文件名：publications.bib、publications.ris、sitemap.xml。\n"
  );
}
{
  const sb = makeSandbox();
  writeReadme(sb, breakAllPaths(readmeOf(sb)));
  expectRed("SP5 判据自身失效（一个路径都认不出）", sb, ["RD5"], {
    mustContain: "个真实存在的路径",
    rows: 1,
  });
}

/* SP6：产物推不出本站自己的域名 ⇒ RD1
 *   做法：拿产物**副本**，删掉 index.html 的 canonical，并把 sitemap.xml 的 loc 换成别的域名
 *   ⇒ 门禁两个来源都读不到 ⇒ 判红。
 *   ⚠️ 只能用**副本**：改真的产物就是改构建结果，那是事故。 */
{
  const siteCopy = path.join(fs.mkdtempSync(path.join(TMP_ROOT, "site-")), "site");
  fs.cpSync(SITE_SRC, siteCopy, { recursive: true });
  const idxPath = path.join(siteCopy, "index.html");
  const idx = fs.readFileSync(idxPath, "utf8");
  const idx2 = idx.replace(/<link\b[^>]*rel=["']?canonical["']?[^>]*>/gi, "");
  if (idx2 === idx) throw new Error("SP6 注入锚点不存在：index.html 里没有 canonical 标签 —— 坏跑");
  fs.writeFileSync(idxPath, idx2);
  const smPath = path.join(siteCopy, "sitemap.xml");
  const sm = fs.readFileSync(smPath, "utf8");
  /* ⚠️ 必须让 <loc> **读不出内容**，**不能**只是换成别的域名：
     门禁的兜底逻辑是「读到第一个 <loc> 就推出域名」⇒ 换成别的域名时
     siteOrigin 依然**非空** ⇒ 判据根本不红（第一版就这么坏跑过）。 */
  const sm2 = sm.replace(/<loc>\s*[^<\s]*\s*<\/loc>/gi, "<loc></loc>");
  if (sm2 === sm) throw new Error("SP6 注入锚点不存在：sitemap.xml 里没有 <loc> —— 坏跑");
  fs.writeFileSync(smPath, sm2);
  const sb = makeSandbox((s) => {
    s.siteDir = siteCopy;
  });
  expectRed("SP6 产物推不出本站自己的域名", sb, ["RD1"], { mustContain: "推不出本站自己的域名" });
}

/* SP7：package.json 的 engines.node 里读不出版本号 ⇒ RD2 */
{
  const sb = makeSandbox((s) => {
    const pkg = JSON.parse(fs.readFileSync(s.pkgFile, "utf8"));
    pkg.engines = { node: "lts" };
    fs.writeFileSync(s.pkgFile, JSON.stringify(pkg, null, 2) + "\n");
  });
  expectRed("SP7 engines.node 读不出版本号", sb, ["RD2"], { mustContain: "里读不出版本号" });
}

/* SP8：README 完全没声明 Node 版本 ⇒ RD2 */
{
  const sb = makeSandbox();
  writeReadme(sb, replaceOnce(readmeOf(sb), "需要 **Node ≥ 22**", "需要 **较新的 Node**"));
  expectRed("SP8 README 完全没声明 Node 版本", sb, ["RD2"], { mustContain: "没有声明 Node 版本" });
}

/* SP9：命令少到认不满下限 ⇒ RD5（命令数不足）
 *   做法：把 package.json 副本的 scripts **裁到只剩几个**。
 *   ⚠️ RD3 **不该**红：裁掉的是 package.json 里**多余**的命令，
 *      而 README 里那些命令名还在（依然被提到）⇒ RD3 绿。
 *      这一档因此证明 RD3 与 RD5b 是两条**独立**的判据（不是同一件事的两种说法）。
 *   ⚠️ 必须**保留「README 里声明了判据编号」的那些门禁 script**：
 *      RD6 的入口是 package.json 里的 npm script 命令（README 门禁行 → 命令 → 门禁源码）。
 *      把门禁 script 一起裁掉 ⇒ README 的门禁行映射不到命令 ⇒ RD6 无从对账 ⇒
 *      RD7b（一次都没真的比对过）**连坐**红 ⇒ 这一档就不再是「只红 RD5」的干净对照。
 *      所以这里按 README 反查（**不写死脚本名**，门禁增减后这一档仍然成立）：
 *      「声明了判据编号的 README 行」→ 其 npm script 名 → 命令里跑的是门禁 ⇒ 留下。
 *   ⚠️ 填充命令从「README 行里**没有**判据编号」的那些里取 ⇒ 不会带出额外的对账组。 */
{
  const sb = makeSandbox((s) => {
    const pkg = JSON.parse(fs.readFileSync(s.pkgFile, "utf8"));
    const names = Object.keys(pkg.scripts);
    const readme = fs.readFileSync(s.readmePath, "utf8");

    /* 门禁自己声明的下限：裁到它以下 RD5 才会红（不写死数字）。 */
    const gateSrc = fs.readFileSync(s.gateFile, "utf8");
    const minScripts = Number((/const MIN_SCRIPTS = (\d+);/.exec(gateSrc) || [])[1]);
    if (!minScripts) throw new Error("SP9 注入锚点不存在：读不出 MIN_SCRIPTS —— 坏跑");

    const CRIT_TOKEN = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/;
    const GATE_CMD = /scripts\/(?:check|verify)-[A-Za-z0-9._-]+\.cjs/;

    /* README 里每个 npm script 所在行：有没有声明判据编号 / 命令是不是门禁。 */
    const rowInfo = new Map();
    for (const line of readme.split("\n")) {
      const cell = /^\|\s*`npm run ([^`]+)`\s*\|/.exec(line);
      if (!cell) continue;
      const cmd = pkg.scripts[cell[1]];
      rowInfo.set(cell[1], {
        hasCrit: CRIT_TOKEN.test(line),
        isGate: !!(cmd && GATE_CMD.test(cmd)),
      });
    }

    const keep = [];
    for (const name of names) {
      const r = rowInfo.get(name);
      if (r && r.hasCrit && r.isGate) keep.push(name);
    }
    if (!keep.length) {
      throw new Error("SP9 注入锚点不存在：README 里没有「声明了判据编号的门禁行」—— 坏跑");
    }

    /* 裁剪规模**跟随门禁自身的下限**走，不写死。
     * ⚠️ 为什么不能「全保留 keep」：带判据编号的门禁行会随门禁增减而增减，
     *    保留数一旦 ≥ MIN_SCRIPTS，这一档就永远裁不到下限 ⇒ 变成坏跑。
     *    （实测：加了第 10 道带判据编号的门禁行之后 keep 从 9 变 10 ⇒ 撞上下限。）
     *    ⇒ 上限取「下限 - 1」，并且**至少留 1 个**声明了判据编号的门禁行，
     *       让 RD6 仍能真的比对过、RD7a/RD7b 不连坐。 */
    const cap = Math.max(1, minScripts - 1);
    const kept = new Set();
    for (const name of keep.slice(0, cap)) kept.add(name);
    /* 再用「README 行里没有判据编号」的那些补到 5 个（补不满也无所谓）。 */
    for (const name of names) {
      if (kept.size >= 5) break;
      const r = rowInfo.get(name);
      if (r && !r.hasCrit && !kept.has(name)) kept.add(name);
    }
    if (kept.size >= minScripts) {
      throw new Error(
        `SP9 注入锚点不对：裁完还有 ${kept.size} 个命令（要 < ${minScripts}）—— 坏跑`
      );
    }

    const trimmed = {};
    for (const k of names) if (kept.has(k)) trimmed[k] = pkg.scripts[k];
    pkg.scripts = trimmed;
    fs.writeFileSync(s.pkgFile, JSON.stringify(pkg, null, 2) + "\n");
  });
  expectRed("SP9 命令少到认不满下限", sb, ["RD5"], {
    mustContain: "个命令（至少要",
    rows: 1,
  });
}

/* SP10：一个对外出口都认不出来 ⇒ RD4×6 + RD5
 *   做法：**只改 README**（产物一个字都不动）：把出口的**路径形态**那几行整行删掉，
 *   再把剩下**不带斜杠**的出口名（feed.xml / robots.txt / CITATION.cff）改掉。
 *   ⚠️ 为什么不动产物：删掉产物里的出口文件 ⇒ README 里那些路径变成「不存在」
 *      ⇒ RD1 连坐 5 条 ⇒ 判据集合不再恰为（第一版就这么坏跑过）。
 *   ⚠️ 路径形态**只能整行删、不能改名**：改成别的名字它在产物里就不存在了 ⇒ RD1 照样红。
 *   ⚠️ 行过滤的正则必须排除 `.njk`（目录树那行里有 "/publications.ris.njk"，
 *      它不是路径形态，删了整行会平白少掉别的内容）。 */
{
  const sb = makeSandbox();
  const SLASH_OUTLET =
    /\/(publications\.bib|publications\.ris|feed\.xml|sitemap\.xml|robots\.txt)(?![\w.])/;
  const lines = readmeOf(sb).split("\n");
  const kept = lines.filter((l) => !SLASH_OUTLET.test(l));
  if (kept.length === lines.length) {
    throw new Error("SP10 注入锚点不存在：README 里没有出口的路径形态 —— 坏跑");
  }
  let text = kept.join("\n");
  text = replaceAllWords(text, "feed.xml", "feed-zz.xml");
  text = replaceAllWords(text, "robots.txt", "robots-zz.txt");
  text = replaceAllWords(text, "CITATION.cff", "CITATION-zz.cff");
  writeReadme(sb, text);
  expectRed("SP10 一个对外出口都认不出来", sb, ["RD4", "RD4", "RD4", "RD4", "RD4", "RD4", "RD5"], {
    mustContain: "一个对外出口都没认出来",
    rows: 7,
  });
}

/* SP11：README 不存在 ⇒ 早期退出型（红因行首**没有**判据号） */
{
  const sb = makeSandbox((s) => {
    fs.rmSync(s.readmePath, { force: true });
  });
  expectRed("SP11 README 不存在", sb, [], { mustContain: "找不到 README.md", rows: 1 });
}

/* SP12：package.json 不存在 ⇒ 早期退出型 */
{
  const sb = makeSandbox((s) => {
    fs.rmSync(s.pkgFile, { force: true });
  });
  expectRed("SP12 package.json 不存在", sb, [], { mustContain: "找不到 package.json", rows: 1 });
}

/* SP13：package.json 是坏 JSON ⇒ 早期退出型 */
{
  const sb = makeSandbox((s) => {
    fs.writeFileSync(s.pkgFile, "{ 这不是 JSON ");
  });
  expectRed("SP13 package.json 是坏 JSON", sb, [], { mustContain: "package.json 解析失败", rows: 1 });
}

/* SP14：产物 _site 不存在或不完整 ⇒ 早期退出型 */
{
  const sb = makeSandbox((s) => {
    s.siteDir = path.join(fs.mkdtempSync(path.join(TMP_ROOT, "empty-")), "empty");
    fs.mkdirSync(s.siteDir, { recursive: true });
  });
  expectRed("SP14 产物 _site 不存在或不完整", sb, [], {
    mustContain: "产物 _site/ 不存在或不完整",
    rows: 1,
  });
}

/* SP15：README 写了一个指向**不存在站内页**的绝对 URL ⇒ RD1
 *   为什么要有这一档：第一版只认相对写法，绝对 URL **整个逃过**——
 *   实测 exit 0、路径计数纹丝不动（11 → 11），判据看上去在管、实际没管。
 *   ⚠️ 注入行里不能出现任何「未实现」标记词，否则那一行被豁免、注入自己遮住自己。 */
{
  const sb = makeSandbox();
  const origin = (() => {
    const html = fs.readFileSync(path.join(SITE_SRC, "index.html"), "utf8");
    const tags = html.match(/<link\b[^>]*>/gi) || [];
    for (const tag of tags) {
      if (!/rel\s*=\s*["']?canonical/i.test(tag)) continue;
      const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (m) return new URL(m[1]).origin;
    }
    throw new Error("推不出本站域名（_site/index.html 里没有 canonical）—— 注入基准不存在，这一档是坏跑");
  })();
  writeReadme(sb, readmeOf(sb) + `\n绝对地址探针：${origin}/no-such-page-xyz/\n`);
  expectRed("SP15 README 写了指向不存在站内页的绝对 URL", sb, ["RD1"], {
    mustContain: "/no-such-page-xyz/",
  });
}

/* SP16：**外部域名**的绝对 URL → 必须**仍绿**（"合法路径应绿"那一档）
 *   只核"指向本站"的绝对 URL 是 SP15 的另一半：核过头就是假红。
 *   用 RFC 2606 保留域，不取自被测数据。 */
{
  const sb = makeSandbox();
  writeReadme(sb, readmeOf(sb) + "\n外部链接：https://example.invalid/no-such-page-xyz/\n");
  expectGreen("SP16 外部域名的绝对 URL 不被判红", sb);
}

/* SP17：漏掉 /publications.bib —— 它**既是**站内路径**又是**对外出口 ⇒ RD4
 *   这一档证明「既是路径又是出口」的那类出口也能被抓到。
 *   做法：删掉提到它的**整行**（路径形态随之消失 ⇒ RD1 不红），
 *   再把目录树里那个 `publications.bib.njk` 改名（它不带前导斜杠 ⇒ RD1 本来就不核它）。 */
{
  const sb = makeSandbox();
  const lines = readmeOf(sb).split("\n");
  const kept = lines.filter((l) => !l.includes("/publications.bib"));
  if (kept.length === lines.length) {
    throw new Error("SP17 注入锚点不存在：README 里没有提到 /publications.bib —— 坏跑");
  }
  let text = kept.join("\n");
  text = replaceOnce(text, "publications.bib.njk", "zz-publications.bib.njk");
  writeReadme(sb, text);
  expectRed("SP17 README 漏掉 /publications.bib", sb, ["RD4"], { mustContain: "publications.bib" });
}

/* ================= RD6 / RD7 的注入档 SP18–SP22 ================= */

/* SP18：README 门禁行**少列**一个判据编号 ⇒ RD6
 *   做法：把 CS8 那一句里的编号去掉（文字留着），README 就停在 CS1–CS7，
 *   而门禁源码里已经是 CS1–CS8 —— 两份副本对不上。 */
{
  const sb = makeSandbox();
  writeReadme(
    sb,
    replaceOnce(readmeOf(sb), README_CS8, "（产物里必须有 components.css，否则判不出 dev/prod 模式）")
  );
  expectRed("SP18 README 门禁行少列了一个判据编号", sb, ["RD6"], {
    mustContain: "列的判据编号与门禁源码对不上",
  });
}

/* SP19：README 门禁行**多列**一个门禁源码里没有的编号 ⇒ RD6
 *   做法：CS8 改成 CS8–CS9（区间写法会被展开成 CS8、CS9）。
 *   ⚠️ 少列与多列是**两个方向**：只测少列的话，"凭空多出来的编号"可能漏网。 */
{
  const sb = makeSandbox();
  writeReadme(
    sb,
    replaceOnce(
      readmeOf(sb),
      README_CS8,
      "（CS8–CS9：产物里必须有 components.css，否则判不出 dev/prod 模式）"
    )
  );
  expectRed("SP19 README 门禁行多列了一个不存在的判据编号", sb, ["RD6"], {
    mustContain: "列的判据编号与门禁源码对不上",
  });
}

/* SP20：门禁行**不列**判据编号 ⇒ 必须**仍绿**
 *   这一档是"没声明就没有义务"：README 没说 CS1–CS8，门禁不该因为"对不上"就判红
 *   （否则这条判据就变成了"README 必须列全"，那是另一条判据的事）。
 *   ⚠️ 只抹 CS ⇒ JA / IP 两行还带着编号 ⇒ 对账仍在跑 ⇒ RD7b 不会连坐。 */
{
  const sb = makeSandbox();
  writeReadme(sb, stripCritTokens(readmeOf(sb), "CS"));
  expectGreen("SP20 门禁行不列判据编号时不该误报", sb);
}

/* SP21：README 一个判据编号都不列 ⇒ 对账**无事可做** ⇒ RD7b 判红
 *   这一档证明 RD7b 不是摆设：把 README 里所有判据编号抹掉，
 *   RD6 的"通过"就是**空跑**（没有任何一组被比对过）⇒ 必须判红。
 *   ⚠️ 抹法必须**不写死前缀**（见 stripAllCritTokensInNpmRows 的注释）：
 *      写死前缀会漏掉后来新增的判据组 ⇒ 这一档的前提被打破 ⇒ 当场假失败。 */
{
  const sb = makeSandbox();
  const text = stripAllCritTokensInNpmRows(readmeOf(sb));
  writeReadme(sb, text);
  expectRed("SP21 README 一个判据编号都不列（对账空跑）", sb, ["RD7"], {
    mustContain: "一次都没真的比对过",
    rows: 1,
  });
}

/* SP22：门禁源码**一个都读不到** ⇒ 解析器自证失效 ⇒ RD7a + RD7b 判红
 *   做法：把 GATES_DIR 指到一个**空目录**（门禁本体新增的环境变量开关）。
 *   ⚠️ 这一档不碰 README ⇒ 变的是"读哪儿"，证明 RD7a 盯的是**源码读得到读不到**，
 *      而不是 README 的内容。 */
{
  const sb = makeSandbox();
  const emptyGates = path.join(fs.mkdtempSync(path.join(TMP_ROOT, "gates-")), "empty");
  fs.mkdirSync(emptyGates, { recursive: true });
  expectRed("SP22 门禁源码一个都读不到（解析器自证失效）", sb, ["RD7", "RD7"], {
    env: { GATES_DIR: emptyGates },
    mustContain: "都没解析出非空的判据编号集合",
    rows: 2,
  });
}

/* ================= 判据级负对照 NC-RD1–NC-RD7 ================= */

console.log("");

/** 卸掉某个判据 ⇒ 它的注入档应当**一条红因都不剩**（转绿）。
 *  ⚠️ 卸判据本身失败（找不到调用点 / 语法不过）必须**记成红**而不是抛异常：
 *     抛异常会把整场自测打断 ⇒ 后面的覆盖度自证一行都跑不到 ⇒ 报告里只剩栈。 */
function expectGreenAfterUnload(id, crit, inject, note) {
  let sb;
  let n = 0;
  try {
    sb = makeSandbox();
    n = unloadCriterion(sb, crit);
    inject(sb);
  } catch (e) {
    record(id, false, `档位执行抛错（是坏跑，不是判红）：${e.message}`);
    return;
  }
  const r = runGate(sb);
  const rows = redRows(r.out);
  const bannerOk = r.out.includes(GATE_PASS_BANNER);
  const ok = r.code === 0 && rows.length === 0 && bannerOk;
  record(
    id,
    ok,
    ok
      ? `卸掉 ${crit} 的 ${n} 处收集型出口后，注入档完全转绿${note ? "；" + note : ""}`
      : `期望 exit 0 且零红因，实际 code=${r.code}、红因 ${rows.length} 行` +
        `${bannerOk ? "" : "（且缺少门禁通过横幅）"}\n${r.out}`
  );
}

expectGreenAfterUnload(
  "NC-RD1 负对照：卸掉 RD1 ⇒ RD1 的注入转绿",
  "RD1",
  (sb) => writeReadme(sb, replaceOnce(readmeOf(sb), "| 博客 | `/blog/` |", "| 旧归档 | `/portfolio-archive/` | 往年的项目 |")),
  "RD1 有 2 处收集型出口，两处都被卸掉"
);

expectGreenAfterUnload(
  "NC-RD2 负对照：卸掉 RD2 ⇒ RD2 的注入转绿",
  "RD2",
  (sb) => writeReadme(sb, replaceOnce(readmeOf(sb), "需要 **Node ≥ 22**", "需要 **Node ≥ 18**")),
  "RD2 有 3 处收集型出口，三处都被卸掉"
);

expectGreenAfterUnload(
  "NC-RD3 负对照：卸掉 RD3 ⇒ RD3 的注入转绿",
  "RD3",
  (sb) => writeReadme(sb, replaceAllWords(readmeOf(sb), "check:citation-cff", "check:citation-xxx"))
);

expectGreenAfterUnload(
  "NC-RD4 负对照：卸掉 RD4 ⇒ RD4 的注入转绿",
  "RD4",
  (sb) => writeReadme(sb, replaceAllWords(readmeOf(sb), "CITATION.cff", "CITATION-zz.cff"))
);

expectGreenAfterUnload(
  "NC-RD5 负对照：卸掉 RD5 ⇒ RD5 的注入转绿",
  "RD5",
  (sb) => writeReadme(sb, breakAllPaths(readmeOf(sb))),
  "RD5 有 3 处收集型出口，三处都被卸掉"
);

expectGreenAfterUnload(
  "NC-RD6 负对照：卸掉 RD6 ⇒ 判据编号对账那档转绿",
  "RD6",
  (sb) =>
    writeReadme(
      sb,
      replaceOnce(readmeOf(sb), README_CS8, "（产物里必须有 components.css，否则判不出 dev/prod 模式）")
    ),
  "RD6 有 1 处收集型出口，被卸掉"
);

expectGreenAfterUnload(
  "NC-RD7 负对照：卸掉 RD7 ⇒ 对账空跑那档转绿",
  "RD7",
  (sb) => {
    let t = stripCritTokens(readmeOf(sb), "JA");
    t = stripCritTokens(t, "IP");
    t = stripCritTokens(t, "CS");
    writeReadme(sb, t);
  },
  "RD7 有 2 处收集型出口（RD7a / RD7b），都被卸掉"
);

/* ================= 早期退出型负对照 NC-E1–NC-E4 ================= */

console.log("");

/** 卸掉某条早期退出的**打印** ⇒ 注入档应当 exit 1 但**一条红因都不打**。
 *  ⚠️ 同上：卸判据失败必须**记成红**而不是抛异常打断整场。 */
function expectNoRowAfterUnload(id, causeId, inject) {
  let sb;
  try {
    sb = makeSandbox();
    unloadEarly(sb, causeId);
    inject(sb);
  } catch (e) {
    record(id, false, `档位执行抛错（是坏跑，不是判红）：${e.message}`);
    return;
  }
  expectNoRowRed(id, sb, `卸掉 ${causeId} 的打印出口`);
}

expectNoRowAfterUnload(
  "NC-E1 负对照：卸掉「找不到 README.md」⇒ 不再打出那条红因",
  "E1",
  (sb) => fs.rmSync(sb.readmePath, { force: true })
);

expectNoRowAfterUnload(
  "NC-E2 负对照：卸掉「找不到 package.json」⇒ 不再打出那条红因",
  "E2",
  (sb) => fs.rmSync(sb.pkgFile, { force: true })
);

expectNoRowAfterUnload(
  "NC-E3 负对照：卸掉「package.json 解析失败」⇒ 不再打出那条红因",
  "E3",
  (sb) => fs.writeFileSync(sb.pkgFile, "{ 这不是 JSON ")
);

expectNoRowAfterUnload(
  "NC-E4 负对照：卸掉「产物 _site 不存在或不完整」⇒ 不再打出那条红因",
  "E4",
  (sb) => {
    sb.siteDir = path.join(fs.mkdtempSync(path.join(TMP_ROOT, "empty-")), "empty");
    fs.mkdirSync(sb.siteDir, { recursive: true });
  }
);

/* ================= COV2：覆盖度自证（双向） ================= */

console.log("");

const GATE_SRC = fs.readFileSync(GATE, "utf8");
const PUSH_SITES = scanPushCalls(GATE_SRC);
const EARLY_SITES = scanEarlyExits(GATE_SRC);
const PUSH_CAUSES = CAUSES.filter((c) => c.site === "push");
const EARLY_CAUSES = CAUSES.filter((c) => c.site === "early");

/* COV2a：收集型出口数 == 归属表收集型条数 */
record(
  "COV2a 收集型出口数 == 归属表条数",
  PUSH_SITES.length === PUSH_CAUSES.length,
  `门禁里 problems.push( 有 ${PUSH_SITES.length} 处，归属表登记了 ${PUSH_CAUSES.length} 条`
);

/* COV2b：早期退出型出口数 == 归属表早期退出型条数 */
record(
  "COV2b 早期退出型出口数 == 归属表条数",
  EARLY_SITES.length === EARLY_CAUSES.length,
  `门禁里早期退出的红因出口有 ${EARLY_SITES.length} 处，归属表登记了 ${EARLY_CAUSES.length} 条`
);

/* COV2c：门禁解析出的判据集合 == 静态判据清单（**双向**） */
{
  const parsed = [...new Set(PUSH_SITES.map((c) => c.crit))].sort();
  const staticList = [...CRITERIA].sort();
  const ok =
    parsed.length === staticList.length &&
    parsed.every((x, i) => x === staticList[i]) &&
    PUSH_SITES.every((c) => c.crit && staticList.includes(c.crit));
  record(
    "COV2c 门禁解析出的判据集合 == 静态判据清单（双向）",
    ok,
    `门禁解析出 {${parsed.join(",")}}，静态清单 {${staticList.join(",")}}`
  );
}

/* COV2d：每条收集型归属恰好认领**一个**收集型出口（区间法） */
{
  const detail = [];
  let ok = true;
  for (const c of PUSH_CAUSES) {
    const owners = ownersOfFrag(c.frag, PUSH_SITES, GATE_SRC);
    if (owners.length !== 1) {
      ok = false;
      detail.push(`${c.id} 认领了 ${owners.length} 个出口`);
    }
  }
  record("COV2d 每条收集型归属恰好认领一个出口", ok, ok ? `${PUSH_CAUSES.length} 条全部一一对应` : detail.join("；"));
}

/* COV2e：每条早期退出型归属恰好认领**一个**早期退出型出口（区间法） */
{
  const detail = [];
  let ok = true;
  for (const c of EARLY_CAUSES) {
    const owners = ownersOfFrag(c.frag, EARLY_SITES, GATE_SRC);
    if (owners.length !== 1) {
      ok = false;
      detail.push(`${c.id} 认领了 ${owners.length} 个出口`);
    }
  }
  record("COV2e 每条早期退出型归属恰好认领一个出口", ok, ok ? `${EARLY_CAUSES.length} 条全部一一对应` : detail.join("；"));
}

/* COV2f：归属片段互不包含，且每个片段在门禁源码里**只出现一次** */
{
  const detail = [];
  let ok = true;
  for (let i = 0; i < CAUSES.length; i++) {
    const n = GATE_SRC.split(CAUSES[i].frag).length - 1;
    if (n !== 1) {
      ok = false;
      detail.push(`${CAUSES[i].id} 的片段在门禁源码里出现 ${n} 次`);
    }
    for (let j = i + 1; j < CAUSES.length; j++) {
      if (CAUSES[i].frag.includes(CAUSES[j].frag) || CAUSES[j].frag.includes(CAUSES[i].frag)) {
        ok = false;
        detail.push(`${CAUSES[i].id} 与 ${CAUSES[j].id} 的片段互相包含`);
      }
    }
  }
  record("COV2f 归属片段互不包含且各出现一次", ok, ok ? `${CAUSES.length} 条片段全部唯一且互不包含` : detail.join("；"));
}

/* COV2g：**每条红因至少有一档**能证明它会变红 */
{
  const missing = CAUSES.filter((c) => !coveredCauses.has(c.id)).map((c) => c.id);
  record(
    "COV2g 每条红因至少有一档能证明它会变红",
    missing.length === 0,
    missing.length === 0
      ? `${CAUSES.length} 条红因全部有档可证`
      : `这几条红因没有任何一档证明过它会变红：${missing.join(", ")}`
  );
}

/* ================= 收尾：档位清单守卫 + 门禁原件没被动过 ================= */

console.log("");
/* 前置守卫①：**档位清单**。
   为什么要有：少跑一档 ⇒ 少证明一件事，而判据集合、出口数、归属数**都没变**
   ⇒ 矩阵照样全绿 ⇒ "那一档被删了"这件事**自己发现不了**。
   只有"实际跑过的档位号集合 == 静态清单"才查得出来。
   ⚠️ 这是**前置守卫**，不进 results ⇒ 报出的档数不会与下面的枚举对不上。 */
const EXPECTED_SLOTS = [
  ...Array.from({ length: 23 }, (_, i) => `SP${i}`), // SP0–SP22
  ...Array.from({ length: 7 }, (_, i) => `NC-RD${i + 1}`), // NC-RD1–NC-RD7
  ...Array.from({ length: 4 }, (_, i) => `NC-E${i + 1}`), // NC-E1–NC-E4
  ...["a", "b", "c", "d", "e", "f", "g"].map((x) => `COV2${x}`),
];
function slotKeyOf(id) {
  let m = /^SP\d+/.exec(id);
  if (m) return m[0];
  m = /^NC-RD\d+/.exec(id);
  if (m) return m[0];
  m = /^NC-E\d+/.exec(id);
  if (m) return m[0];
  m = /^COV2[a-g]/.exec(id);
  if (m) return m[0];
  return null;
}
const actualSlots = results.map((r) => slotKeyOf(r.id));
const slotSet = new Set(actualSlots);
const slotsOk =
  actualSlots.every((x) => x !== null) &&
  actualSlots.length === EXPECTED_SLOTS.length &&
  slotSet.size === EXPECTED_SLOTS.length &&
  EXPECTED_SLOTS.every((s) => slotSet.has(s));
console.log(
  `  ${slotsOk ? "✓" : "✗"} 档位清单守卫 —— 实际跑过的 ${actualSlots.length} 档` +
    `与静态清单 ${EXPECTED_SLOTS.length} 档完全一致`
);

/* 前置守卫②：门禁原件本轮一字未改。
   这也是**前置守卫**，不是矩阵里的一档 ⇒ 不进 results。
   否则报出的「档数」会比下面枚举的档位号（23 注入 + 11 负对照 + 7 覆盖度 = 41）多一个，
   出现「报 42 档、括号里只列 41 个档位号」的自相矛盾。 */
const nowSha = sha256(GATE);
const gateIntact = nowSha === GATE_SHA_AT_START;
console.log(
  `  ${gateIntact ? "✓" : "✗"} 门禁原件 SHA-256 前后一致（本轮一字未改） —— sha256 = ${nowSha.slice(0, 16)}…`
);

fs.rmSync(TMP_ROOT, { recursive: true, force: true });

const bad = results.filter((r) => !r.ok);
console.log(
  `\n自测矩阵：${results.length} 档里 ${results.length - bad.length} 档按预期触发` +
    `（SP0–SP22 是注入档；NC-RD1–NC-RD7 与 NC-E1–NC-E4 是判据级负对照；COV2a–COV2g 是覆盖度自证）。\n`
);
if (bad.length || !gateIntact || !slotsOk) {
  console.error(`\n自测失败：${bad.length} 档没有按预期触发。\n`);
  for (const b of bad) console.error(`  ✗ ${b.id}\n${b.detail}\n`);
  if (!gateIntact) console.error("  ✗ 门禁原件 SHA-256 前后不一致\n");
  if (!slotsOk) {
    console.error(
      `  ✗ 档位清单与实际跑过的档位对不上（缺：${EXPECTED_SLOTS.filter((s) => !slotSet.has(s)).join(", ") || "无"}；` +
        `多：${[...slotSet].filter((s) => !EXPECTED_SLOTS.includes(s)).join(", ") || "无"}）\n`
    );
  }
  process.exit(1);
}
console.log("自测通过：全部档位按预期触发。\n");
