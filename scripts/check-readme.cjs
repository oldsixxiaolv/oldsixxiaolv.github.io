#!/usr/bin/env node
/**
 * README 事实核对门禁 —— 守住"README 说的"与"仓库真的有的"是**同一件事**。
 *
 * 为什么要有这道门禁（不是假想，是本轮实测出来的漂移）：
 *   本仓的 README 是**给人看的入口文档**，它天然是"仓库现状的第二份副本"——
 *   路由清单、Node 版本下限、可用命令、对外出口，全都在 README 里又抄了一遍。
 *   而这个副本**没有任何东西看守**。本轮实测（2026-10-19）README 同时说错了三处：
 *     ① 模块表列出 `/portfolio/` —— 产物里**根本没有**这个路由
 *        （`src/content/portfolio/` 目录在，但**没有条目**、也没有列表页模板）；
 *     ② 写"需要 Node ≥ 18" —— `package.json` 的 `engines.node` 已经是 `>=22`
 *        （Node 20 已 EOL，且 build 链里的 CDP over WebSocket 在 Node 22 起免旗标）；
 *     ③ 完全没提学术出口（`/publications.bib`、`/publications.ris`、`/feed.xml`）
 *        与仓库引用元数据（`CITATION.cff`）—— 功能**早就有**（第一轮就加了），
 *        文档却停在功能存在之前。
 *   这三处都是"**事实改了、文档没跟**"，与本仓反复出现的那族病同源：
 *   同一事实的两份副本，其中一份没人看守。
 *
 * 七条判据（编号用独立字母体系 RD*，不与 verify-site.cjs 的数字编号、
 * check-gates-wired.cjs 的 GW*、check-citation-cff.cjs 的 CF* 冲突）：
 *
 *   RD1 **README 里提到的每一个站内路径都必须在产物里真实存在。**
 *      期望集**由产物推导**（`_site/` 里的 HTML 路由 + 真实文件），不是手写清单。
 *      两条豁免，且豁免必须是**显式写在同一行**的：
 *        · 路径里带占位符（`<slug>` 之类）→ 是**模式**不是路由，放行；
 *        · 同一行写了"尚未实现"/"未发布" → 是**规划**不是现状，放行。
 *      为什么豁免要"写在同一行"：写在别处就分不清这句说的是哪个路径，
 *      门禁一旦要猜，红因就会变成假话（比不判红更坏）。
 *
 *      **"站内路径"有两种写法，两种都要核**：相对写法（`/about/`）与
 *      绝对写法（`https://本站域名/about/`）。第一版只认相对写法，
 *      实测（2026-10-19）README 里写一条指向不存在页面的**绝对 URL** →
 *      门禁 exit 0、路径计数**纹丝不动**（11 → 11）—— 覆盖度上的假绿，
 *      与"尾斜杠漏匹配"那次同族：判据看上去在管这件事，实际没管。
 *      本站域名**由产物推导**（`index.html` 的 canonical → `sitemap.xml` 的 loc），
 *      写死域名会把"换域名"变成静默失效；**别人的域名一律不核**
 *      （那是外部链接，不是站内路由 —— 核了就是假红）。
 *      两个来源都读不出域名 → **判红**（判据视野不完整，不能装作核过了）。
 *
 *   RD2 **README 声明的 Node 下限必须 ≥ `package.json` 的 `engines.node`。**
 *      方向是**一个方向**：README 说得比实际**更高**是允许的（更保守）；
 *      说得更低（"≥ 18"）会让按 README 装环境的人拿到一个跑不起来的 Node。
 *      README **完全没提** Node 版本 → 也判红（"没说"与"说错"同样会让人生效不了）。
 *
 *   RD3 **`package.json` 里每一个 npm script 都必须在 README 里被提到。**
 *      这一条抓的是"**命令**的第二份副本"：新加了 `check:xxx` 却没写进文档，
 *      门禁就变成了"只有作者自己知道怎么跑"的东西。
 *      匹配用**词边界**：`check:identity` 不许被 `check:identity-derivation` 顶替
 *      （否则"提到一个"就能冒充"提到全部"）。
 *
 *   RD4 **每一个对外出口都必须在 README 里被提到。**
 *      期望集**由产物推导**：`_site/` **顶层**的非 HTML 文件（`/publications.bib`、
 *      `/publications.ris`、`/feed.xml`、`/sitemap.xml`、`/robots.txt`）
 *      ＋ 仓库根的 `CITATION.cff`。
 *      为什么"顶层"：子目录里的东西（`/assets/...`、各页面的 HTML）不是"出口"。
 *      学术主页的出口是"**别人来取**的地址"，漏写 = 存在但没人知道。
 *
 *   RD5 **自证存活**：本门禁必须真的认出了东西。
 *      认出的路由数、命令数、出口数都要有下限；全为 0 说明**筛子坏了**
 *      （README 改了格式、路径形态变了、产物结构变了），
 *      此时"通过"是**空跑**，空跑的门禁等于没有门禁 → 判红。
 *
 *   RD6 **README 门禁行里列的判据编号，必须与门禁源码里的完全一致。**
 *      这条抓的是"**判据编号**"这一份副本：每道门禁都有自己的一组编号
 *      （CS1、IP2、JA3 …），README 的命令表在介绍每道门禁时会顺带列出来。
 *      门禁加了判据、README 忘了加 —— 文档就落在事实后面。
 *      实测（2026-10-22）就踩过：`check:css-publish` 的门禁早已有 CS8
 *      （模式判得出），README 那一行仍停在 CS7，两份副本对不上。
 *      口径：**README 声明的编号集合 = 门禁源码里的编号集合**（少列、多列都判红）。
 *      · 只作用于**直接跑门禁**的行（`npm run check:xxx`）。自测行（`-selftest`）
 *        里写的是"分别卸掉 TD1–TD4"这种**限定语境的子集**，语义上不是全量声明，
 *        拿相等口径去核只会得到一片假红。
 *      · 门禁源码里的编号集合**包含注释**：有的判据只在门禁的头部注释里
 *        被命名（`check-figure-cover.cjs` 的 CV4 就是），剥掉注释会把判据弄丢。
 *      · 真源是**代码**，所以抄漏了或抄多了都要改 README，不是改门禁。
 *
 *   RD7 **对账本身也得自证存活**（两小项，缺一不可）：
 *      · RD7a：至少从一道门禁源码里解析出过一个**非空**的判据编号集合
 *        —— 解析器坏了的话，RD6 的结论分不清是"README 写错"还是"我没读懂"；
 *      · RD7b：RD6 至少真的比对过一组
 *        —— README 一个判据编号都不列时，RD6 无事可做，"通过"是空跑。
 *      空跑的门禁等于没有门禁 ⇒ 两项都判红。
 *
 * ⚠️ 本门禁**只管可机器核对的那部分事实**。以下**不在**它的视野里，
 *    写在这里是为了不让"它绿"被误读成"README 完全正确"：
 *   · README 的**描述文字**是否准确（"左侧原文 + 右侧批注"对不对，只有眼睛能判）；
 *   · `HOW_TO_RUN.md` / `docs/**` 里的**其他**文档（本门禁只读 README.md）；
 *   · README 该不该**写**某条内容（它管的是"说了的得是真的"，不是"该说的都说了"）。
 *
 * 判定与汇报：任一判据不通过 → exit 1，并把**红因**逐条打印（红因要能指到
 * 具体是哪一行、哪个路径、期望值是什么）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* README 路径可用环境变量改 —— 自测脚本（scripts/test-readme.cjs）要能在**副本**上
   注入缺陷，不能去改仓库里真的那份 README（改坏了就是事故）。 */
const README = process.env.README_PATH
  ? path.resolve(process.env.README_PATH)
  : path.join(ROOT, "README.md");
const PKG = path.join(ROOT, "package.json");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
/* 门禁源码目录可用环境变量改 —— 自测脚本（scripts/test-readme.cjs）要能在**副本**上
   把「门禁源码指到别处」，用来证明 RD6 真的在读源码、RD7a 的自证真的会红。 */
const GATES_DIR = process.env.GATES_DIR
  ? path.resolve(process.env.GATES_DIR)
  : path.join(ROOT, "scripts");

/* ---------- 读 README 与 package.json ---------- */
if (!fs.existsSync(README)) {
  console.error("README 事实核对门禁未通过：\n");
  console.error("  ✗ 找不到 README.md —— 仓库的入口文档不见了。");
  process.exit(1);
}
if (!fs.existsSync(PKG)) {
  console.error("README 事实核对门禁未通过：\n");
  console.error("  ✗ 找不到 package.json，无法核对命令清单与 Node 下限。");
  process.exit(1);
}
const readme = fs.readFileSync(README, "utf8");
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
} catch (e) {
  console.error("README 事实核对门禁未通过：\n");
  console.error(`  ✗ package.json 解析失败：${e.message}`);
  process.exit(1);
}

const problems = [];
const short = (s) => (s || "?").slice(0, 90);

/* ---------- 由产物推导"真实存在"的路径集合 ---------- */
if (!fs.existsSync(SITE) || !fs.existsSync(path.join(SITE, "index.html"))) {
  console.error("README 事实核对门禁未通过：\n");
  console.error(
    "  ✗ 产物 _site/ 不存在或不完整（连 index.html 都没有）—— 本门禁**无法**核对。\n" +
      "    多半是并发构建把 _site/ 写到一半（别的场次正在跑 eleventy），\n" +
      "    或者本次 build 根本没跑完。**这不是 README 的问题**，重跑一次 build 再判。"
  );
  process.exit(1);
}

/** 产物里的 HTML 路由（"/" / "/about/" / "/404.html" …）。 */
const routes = new Set();
/** 产物里真实存在的文件路径（"/assets/css/tokens.css" …）。 */
const files = new Set();
/** 产物**顶层**的非 HTML 文件（对外出口的候选）。 */
const topLevelExports = [];

(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue; // macOS 资源叉
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(abs);
      continue;
    }
    const rel = path.relative(SITE, abs).split(path.sep).join("/");
    if (rel.endsWith(".html")) {
      if (rel === "index.html") routes.add("/");
      else if (rel.endsWith("/index.html")) routes.add("/" + rel.slice(0, -"index.html".length));
      else routes.add("/" + rel);
    } else {
      files.add("/" + rel);
      if (!rel.includes("/")) topLevelExports.push("/" + rel);
    }
  }
})(SITE);

/* ---------- 由产物推导"本站自己的域名"（供 RD1 核绝对 URL 用） ----------
 * 为什么由产物推导：写死域名 → 换域名时这道判据会**静默失效**
 *   （它会去核一个根本不属于本站的域名，或者干脆什么都不核）。
 * 为什么两个来源：canonical 是页面自己声明的"我是谁"，sitemap 是给爬虫的
 *   "我在哪"；两个都读不到 → 判据视野不完整 → 判红，不装作核过了。 */
function canonicalOrigin(html) {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/rel\s*=\s*["']?canonical/i.test(tag)) continue;
    const m = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!m) continue;
    try {
      return new URL(m[1]).origin;
    } catch (e) {
      return "";
    }
  }
  return "";
}

let siteOrigin = "";
try {
  siteOrigin = canonicalOrigin(fs.readFileSync(path.join(SITE, "index.html"), "utf8"));
} catch (e) {
  siteOrigin = "";
}
if (!siteOrigin) {
  try {
    const sm = fs.readFileSync(path.join(SITE, "sitemap.xml"), "utf8");
    const loc = sm.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i);
    if (loc) siteOrigin = new URL(loc[1]).origin;
  } catch (e) {
    siteOrigin = "";
  }
}
if (!siteOrigin) {
  problems.push(
    "RD1 推不出本站自己的域名（index.html 的 canonical 与 sitemap.xml 的 loc 都读不到）—— " +
      "README 里的**绝对 URL** 形式就无从判断是不是站内路径，判据视野不完整，判红。"
  );
}

/* 仓库根的 CITATION.cff 也是对外出口（GitHub 的 "Cite this repository" 按钮读它）。 */
const CFF = path.join(ROOT, "CITATION.cff");
const hasCff = fs.existsSync(CFF);
if (hasCff) topLevelExports.push("CITATION.cff");

/* README 里出现过的所有"已知路径"（路由 ∪ 文件）。 */
const knownPaths = new Set([...routes, ...files]);

/* ---------- 逐行扫描 README ---------- */
/**
 * 路径形态：只认**独立成词**的站内路径。
 *
 * 这条正则的**前后约束**是本判据能不能用的关键（第一版没加约束，
 * 一次跑出 20 条假红）：没有约束时，下列全都会被误当成"站内路径"——
 *   `https://github.com/oldsixxiaolv/Manuscript_Lvyh` → "/oldsixxiaolv/Manuscript_Lvyh"
 *   `src/content/portfolio/`                      → "/content/portfolio"
 *   `http://localhost:8080`                       → "/localhost"
 *   `</a>`                                        → "/a"
 *   `18/20`                                       → "/20"
 *   `src/content/papers/<slug>/paper.md`          → "/paper.md"
 * 所以：**前一个字符不能是路径字符**（字母数字 . _ ~ % + - / : 与 < > * | ），
 * 否则那就不是"一个路径"，而是"某个更长东西的尾巴"
 * （`src/content/papers/<slug>/paper.md` 的尾巴是 "/paper.md"，不是站内路径）。
 *
 * ⚠️ 尾斜杠**必须**能被匹配到（`/papers/` 是模块表里最常见的一种写法）：
 *   第一版把尾斜杠放在匹配之外，结果模块表里的路由**一条都没被检查**，
 *   门禁却打印"通过" —— 覆盖度上的假绿，方向比假红更坏。
 */
const PATH_RE =
  /(?<![A-Za-z0-9._~%+\-/:<>*|])(\/[A-Za-z0-9._~%+\/-]+)/g;
/* 绝对 URL（RD1 的第二种写法）。只用来**取**它的 origin 与 path，
 *   核不核由"origin 是不是本站"决定（见下面的扫描处）。 */
const ABS_URL_RE = /https?:\/\/[^\s)\]"'`，。；：、（）]+/g;
/* "这条路径还没实现" 的显式标记（必须与该路径在同一行）。
 *
 * ⚠️ 词表必须**具体**：第一版把"不存在"也算作标记，结果自测注入了一行
 *    "| 不存在 | `/portfolio-archive/` |"（想造一个假路由），
 *    那一行里的"不存在"二字**顺手把注入本身豁免掉了** → 门禁照常绿 →
 *    "坏跑"与"判据失效"同形。写进来的词要么是"未实现/未发布"这类**部署口径**，
 *    要么是"规划稿/没有列表页模板"这类**具体形状**，不能是"不存在"这种普通说法。 */
const NOT_IMPL_RE =
  /尚未实现|未实现|未发布|没有发布|不发布|待发布|规划稿|规划中|不会上线|没有列表页模板/;

const lines = readme.split("\n");
const mentionedPaths = new Map(); // 路径 → 首个出现的行号
let notImplSkipped = 0;
let placeholderSkipped = 0;
let patternSkipped = 0;
let absSitePathCount = 0; // 由绝对 URL 认出的站内路径条数（通过文案里要看得见）

lines.forEach((line, i) => {
  const hits = line.match(PATH_RE) || [];
  for (const raw of hits) {
    const p = raw.replace(/[.,;:!?、。，；：）】」』]+$/, "");
    if (!p || p === "/") continue; // "/" 是站点根，永远存在
    if (mentionedPaths.has(p)) continue;
    if (p.includes("<") || p.includes(">")) {
      placeholderSkipped++;
      continue; // 模式（/papers/<slug>/），不是具体路由
    }
    if (p.includes("...")) {
      patternSkipped++;
      continue; // 通配（/assets/...），不是一个具体地址
    }
    if (NOT_IMPL_RE.test(line)) {
      notImplSkipped++;
      continue; // 规划中的路径，同一行已显式标注
    }
    mentionedPaths.set(p, i + 1);
  }

  /* 绝对 URL 形式的站内路径（RD1 的第二种写法）。
   * ⚠️ 只核**origin 等于本站**的：别人的域名是外部链接（README 里有一堆
   *    GitHub 仓库、ORCID、本地开发地址），核它们就是假红。
   * ⚠️ 相对写法那条正则**抓不到**绝对 URL 里的路径（前一个字符是字母，
   *    触发 lookbehind），所以这里是**另开一路**扫，不是重复。 */
  const absHits = line.match(ABS_URL_RE) || [];
  for (const rawAbs of absHits) {
    let u;
    try {
      u = new URL(rawAbs);
    } catch (e) {
      continue; // 不是合法 URL（多半是中文括号粘住了尾巴）→ 不核
    }
    if (!siteOrigin || u.origin !== siteOrigin) continue; // 外部链接 → 不是站内路由
    const p = u.pathname;
    if (!p || p === "/") continue; // 站点根本身永远存在
    if (p.includes("...")) {
      patternSkipped++;
      continue;
    }
    if (NOT_IMPL_RE.test(line)) {
      notImplSkipped++;
      continue; // 规划中的地址，同一行已显式标注
    }
    if (mentionedPaths.has(p)) continue;
    mentionedPaths.set(p, i + 1);
    absSitePathCount++;
  }
});

/**
 * 一个被提到的路径算不算"真实存在"：
 *   · 精确命中产物里的路由或文件 → 是；
 *   · 它是某个已知路径的**目录前缀**（"/assets/" ⊂ "/assets/css/tokens.css"）→ 是
 *     （README 说的是"这个目录下的东西"，不是"这个文件"）；
 *   · 少一个尾斜杠也算命中（"/papers" ≡ "/papers/"）→ 是；
 *   · 否则 → README 写了一个不存在的东西。
 */
function pathExists(p) {
  if (knownPaths.has(p)) return true;
  if (p.endsWith("/")) {
    for (const k of knownPaths) if (k.startsWith(p)) return true;
    return knownPaths.has(p.slice(0, -1));
  }
  return knownPaths.has(p + "/");
}

/* ---------- RD1：README 提到的路径必须真实存在 ---------- */
for (const [p, lineNo] of mentionedPaths) {
  if (!pathExists(p)) {
    problems.push(
      `RD1 README 第 ${lineNo} 行提到的「${p}」在产物里不存在 —— ` +
        `README 写了一个没有的页面/资源。修法：删掉它，或把它标成"尚未实现"，或真的把它建出来。`
    );
  }
}

/* ---------- RD2：Node 版本下限 ---------- */
const engines = (pkg.engines && pkg.engines.node) || "";
const engMatch = engines.match(/(\d+)/);
if (!engMatch) {
  problems.push(`RD2 package.json 的 engines.node（"${engines}"）里读不出版本号 —— 本门禁无法核对。`);
} else {
  const required = Number(engMatch[1]);
  const claimed = [];
  const nodeRe = /Node\s*(?:≥|>=|不低于|至少)\s*(\d+)/g;
  let m;
  while ((m = nodeRe.exec(readme)) !== null) claimed.push(Number(m[1]));
  if (!claimed.length) {
    problems.push(
      `RD2 README 没有声明 Node 版本下限 —— package.json 的 engines.node 是 ">=${required}"，` +
        `按 README 装环境的人可能拿到一个跑不起来的 Node。`
    );
  } else {
    const lowest = Math.min(...claimed);
    if (lowest < required) {
      problems.push(
        `RD2 README 声明的 Node 下限是 >=${lowest}，但 package.json 的 engines.node 是 ">=${required}" —— ` +
          `按 README 装环境会拿到**跑不起来**的 Node。`
      );
    }
  }
}

/* ---------- RD3：每个 npm script 都要被提到 ---------- */
const scripts = Object.keys(pkg.scripts || {});
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const name of scripts) {
  /* 词边界：名字后面不能再跟 [A-Za-z0-9_-]，
     否则 "check:identity" 会被 "check:identity-derivation" 顶替。 */
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(name)}(?![A-Za-z0-9_-])`);
  if (!re.test(readme)) {
    problems.push(
      `RD3 package.json 里的脚本「${name}」在 README 里没有提到 —— ` +
        `命令清单是"第二份副本"，不同步就等于这个命令只有作者自己知道怎么跑。`
    );
  }
}

/* ---------- RD4：每个对外出口都要被提到 ---------- */
for (const outlet of topLevelExports) {
  const base = path.basename(outlet);
  const re = new RegExp(`(?<![A-Za-z0-9._-])${escapeRe(base)}(?![A-Za-z0-9._-])`);
  if (!re.test(readme)) {
    problems.push(
      `RD4 对外出口「${outlet}」在 README 里没有提到 —— 东西**已经能被别人取到**了，` +
        `但文档里没有入口，等于没有。`
    );
  }
}

/* ---------- RD5：自证存活 ---------- */
const knownMentioned = [...mentionedPaths.keys()].filter((p) => pathExists(p)).length;
const mentionedScripts = scripts.filter((name) => {
  const re = new RegExp(`(?<![A-Za-z0-9_-])${escapeRe(name)}(?![A-Za-z0-9_-])`);
  return re.test(readme);
}).length;
const mentionedOutlets = topLevelExports.filter((base) => {
  const re = new RegExp(`(?<![A-Za-z0-9._-])${escapeRe(path.basename(base))}(?![A-Za-z0-9._-])`);
  return re.test(readme);
}).length;

const MIN_ROUTES = 3;
const MIN_SCRIPTS = 10;
if (knownMentioned < MIN_ROUTES) {
  problems.push(
    `RD5 本门禁只认出 ${knownMentioned} 个真实存在的路径（至少要 ${MIN_ROUTES} 个）—— ` +
      `判据可能已经失效（README 的路径写法变了？产物结构变了？）。` +
      `**"没报错"和"没问题"长得一模一样**，这种情况必须判红。`
  );
}
if (mentionedScripts < MIN_SCRIPTS) {
  problems.push(
    `RD5 本门禁只认出 ${mentionedScripts} 个命令（至少要 ${MIN_SCRIPTS} 个）—— 判据可能已经失效。`
  );
}
if (topLevelExports.length && mentionedOutlets === 0) {
  problems.push(
    `RD5 本门禁一个对外出口都没认出来（产物里有 ${topLevelExports.length} 个）—— 判据可能已经失效。`
  );
}

/* ---------- RD6：README 门禁行声明的判据编号 ↔ 门禁源码 ---------- */

/**
 * 一段文本里的**判据编号**：前缀（1–4 个大写字母）＋数字。
 * 按前缀分组返回；README 里的区间写法（`CS1–CS7`）会**展开**成 CS1…CS7。
 *
 * ⚠️ 区间必须展开：README 的写法是 "CS1–CS7"，中间六个编号**根本没出现**，
 *    只收单点的话会把 {CS1,CS7} 当成完整声明。
 * ⚠️ 分隔符只认 en/em dash（`–` / `—`）：README 里所有编号区间都是这两种，
 *    把 ASCII 连字符也算进去会误吃 "A1-B2" 这类普通写法。
 */
const CRIT_RANGE_RE = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})\s*[–—]\s*(?:[A-Z][A-Z-]{0,4})?(\d{1,3})/g;
const CRIT_TOKEN_RE = /(?<![A-Za-z0-9_-])([A-Z][A-Z-]{0,4})(\d{1,3})/g;

function criterionIds(text) {
  const map = new Map();
  const add = (pre, n) => {
    if (!map.has(pre)) map.set(pre, new Set());
    map.get(pre).add(n);
  };
  let m;
  CRIT_RANGE_RE.lastIndex = 0;
  while ((m = CRIT_RANGE_RE.exec(text)) !== null) {
    const a = Number(m[2]);
    const b = Number(m[3]);
    if (b < a || b - a > 200) continue; // 区间写坏了就当没写，别把整份文档吃进去
    for (let k = a; k <= b; k++) add(m[1], k);
  }
  CRIT_TOKEN_RE.lastIndex = 0;
  while ((m = CRIT_TOKEN_RE.exec(text)) !== null) add(m[1], Number(m[2]));
  return map;
}

/**
 * 一个 npm script 的命令里**直接跑**的门禁脚本（`scripts/check-*.cjs` / `verify-*.cjs`）。
 * 自测脚本（`scripts/test-*.cjs`）**不算**门禁 —— README 的自测行里写的
 * 判据范围是"分别卸掉 TD1–TD4"这种**限定语境的子集**，不是全量声明。
 */
function gateScriptsOf(cmd) {
  const out = [];
  const re = /scripts\/((?:check|verify)-[A-Za-z0-9._-]+\.cjs)/g;
  let m;
  while ((m = re.exec(cmd)) !== null) out.push(m[1]);
  return out;
}

/* 门禁源码：按文件读一次并缓存（同一道门禁可能被多个 npm script 引用）。 */
const gateSrcCache = new Map();
function gateCriteriaOf(fileName) {
  if (gateSrcCache.has(fileName)) return gateSrcCache.get(fileName);
  let out = null;
  try {
    out = criterionIds(fs.readFileSync(path.join(GATES_DIR, fileName), "utf8"));
  } catch (e) {
    out = null; // 读不到 ⇒ 这一行不参与对账（RD7a / RD7b 会兜住）
  }
  gateSrcCache.set(fileName, out);
  return out;
}

/* RD7 的两个计数（自证用）。 */
const gatesRead = new Set(); // 真的读到源码的门禁
const gatesWithCriteria = new Set(); // 并且解析出非空判据编号集合的门禁
let comparisons = 0; // 真正比对过的（前缀 × 门禁行）组数

for (const [idx, line] of lines.entries()) {
  const cell = /^\|\s*`npm run ([^`]+)`\s*\|/.exec(line);
  if (!cell) continue;
  const scriptName = cell[1];
  const cmd = (pkg.scripts || {})[scriptName];
  if (!cmd) continue;
  const gates = gateScriptsOf(cmd);
  if (!gates.length) continue; // 自测行 / 不是门禁的行

  /* 源码侧：这条命令直接跑到的所有门禁的判据编号并集 */
  const srcUnion = new Map();
  let rowReadable = true;
  for (const gf of gates) {
    const m = gateCriteriaOf(gf);
    if (!m) {
      /* 源码**读不到** ⇒ 这一行不判。判据视野不完整时不能装作核过了，
         但也不能因此判红（"读不到"不是 README 的错）；
         真源缺失由 check-gates-wired.cjs 负责，这里只让 RD7a 兜住
         "一道都读不到"的那种整体失效。 */
      rowReadable = false;
      break;
    }
    gatesRead.add(gf);
    let any = false;
    for (const [pre, set] of m) {
      if (!set.size) continue;
      any = true;
      if (!srcUnion.has(pre)) srcUnion.set(pre, new Set());
      for (const n of set) srcUnion.get(pre).add(n);
    }
    if (any) gatesWithCriteria.add(gf);
  }
  if (!rowReadable) continue;

  /* README 侧：这一行声明了哪些判据编号 */
  for (const [pre, set] of criterionIds(line)) {
    const claimed = [...set].sort((a, b) => a - b);
    const srcSet = srcUnion.get(pre);
    const actual = srcSet ? [...srcSet].sort((a, b) => a - b) : [];
    const detail = actual.length
      ? `${gates.join(" / ")} 里实际是 ${pre}[${actual.join(",")}]`
      : `${gates.join(" / ")} 里根本没有 ${pre} 开头的判据编号`;
    if (actual.length) comparisons++;
    if (actual.length === claimed.length && actual.every((v, i) => v === claimed[i])) continue;
    problems.push(
      `RD6 README 第 ${idx + 1} 行（npm run ${scriptName}）列的判据编号与门禁源码对不上 —— ` +
        `README 写的是 ${pre}[${claimed.join(",")}]，${detail}。` +
        `判据编号的真源是**门禁源码**：门禁加了或删了判据，README 这一行必须同步改全。`
    );
  }
}

/* ---------- RD7：对账本身的自证存活 ---------- */
if (gatesWithCriteria.size === 0) {
  problems.push(
    `RD7a 一道门禁源码都没解析出非空的判据编号集合（读到 ${gatesRead.size} 道门禁源码）—— ` +
      `RD6 的解析器可能已经失效，这时"README 与门禁源码一致"是**空跑**，空跑的门禁等于没有门禁。`
  );
}
if (comparisons === 0) {
  problems.push(
    `RD7b RD6 一次都没真的比对过 —— README 的门禁行没有列出任何判据编号，` +
      `判据编号与门禁源码是否同步就完全没人核。`
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("README 事实核对门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `README 事实核对门禁通过：${knownMentioned} 条路径、${mentionedScripts} 个命令、` +
    `${mentionedOutlets} 个对外出口与现状一致` +
    `（产物路由 ${routes.size} 个、顶层出口 ${topLevelExports.length} 个；` +
    `绝对 URL 认出站内路径 ${absSitePathCount} 条（本站 ${siteOrigin}）；` +
    `放行占位符路径 ${placeholderSkipped} 条、通配 ${patternSkipped} 条、规划中 ${notImplSkipped} 条；` +
    `判据编号对账 ${comparisons} 组、读到 ${gatesRead.size} 道门禁源码）。`
);
