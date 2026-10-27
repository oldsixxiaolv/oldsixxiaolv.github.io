#!/usr/bin/env node
/**
 * 门禁 TR1–TR6：已跟踪文件引用的本地文件，必须也已被 git 跟踪。
 *
 * 为什么要有这个门禁（2026-10-19 的 P0 地雷）：
 *   交接复核发现，共享工作树里同时存在两件事：
 *     · `eleventy.config.js`、`scripts/verify-site.cjs` 已被改写，开始 require
 *       一个新抽出来的共享模块 `scripts/lib/git-error.cjs`；
 *     · 而 `scripts/lib/git-error.cjs` **自己还没被 git 跟踪**。
 *   这两件事叠在一起，提交时**只要先提交引用方、漏掉被引用方**，
 *   提交后的那棵树就是断的 —— 全新克隆 `npm run build` 立刻
 *   “Cannot find module './scripts/lib/git-error.cjs'”。
 *
 *   它危险的地方在于**错法不唯一、而且看起来是别人干的**：
 *     · 漏 `git-error.cjs` → build 在 eleventy 步就崩（第一个报错）；
 *     · 漏 `check-jsonld.cjs` → build 却在更早的 `check:gates` 步先红
 *       （“check-overflow 既是豁免项又被接在 build 上”），
 *       **第一个报错根本不指向真正缺的那个文件**；
 *     · 两个都漏 → 只看得到第一个，“只有一处漏”是错觉。
 *   而且没有任何门禁会拦：门禁只管产物，不管“提交后的树能不能跑”。
 *
 *   判据（编号 TR*，与 verify-site.cjs 的数字编号、check-a11y.cjs 的 A*、
 *         check-wrapping.cjs 的 W*、check-gates-wired.cjs 的 GW*、
 *         check-jsonld.cjs 的 J* 都不续接）：
 *   TR1 引用完整性 —— 对**每一个已被 git 跟踪的代码文件**（.cjs/.js/.mjs），
 *       扫出它对**本地相对路径**的静态 require / import，
 *       目标必须满足两条：
 *         · 磁盘上确实存在（否则这棵树根本跑不起来）；
 *         · **也已被 git 跟踪**（否则提交后这棵树会断 —— 也就是上面那个 P0）。
 *   TR2 自证存活 —— 判据必须真的比对过东西：扫到 0 个代码文件、
 *       或**比对过** 0 处**仓内**引用，一律判红。
 *       （“没报错”和“没问题”长得一模一样：判据一旦被卸掉，
 *         门禁会一直绿着，而缺陷照样上线。）
 *   TR3 索引可读 —— TR1/TR2 的前提：git 索引读得到。读不到就**只**报 TR3，
 *       TR1/TR2 整段跳过（没有跟踪集合就无对象可判，不是“没问题”）。
 *   TR4 遮罩自证 —— TR1/TR2/TR5 的前提：注释/字符串遮罩是对的。遮罩坏了 ⇒
 *       TR1 的结论不可信 ⇒ 这一轮只报 TR4，其余判据整段跳过。
 *   TR5 HTML 引用完整性 —— 对**每一个已被 git 跟踪的 HTML 文件**，扫出它对
 *       **本地相对路径**的资源引用（<link>/<img>/<script>/<source>/<video>/
 *       <audio>/<iframe>/<embed>/<object> 的 href/src/poster/data/srcset，
 *       以及**内联 module script** 里 import() / from 的字面量路径），
 *       目标必须满足两条：
 *         · 磁盘上确实存在（否则这个页面打开就是坏样式 / 坏脚本）；
 *         · **也已被 git 跟踪**（否则提交后这棵树会断，同 TR1 的道理）。
 *   TR6 HTML 侧自证存活 —— TR5 自己的前提：扫到 0 个已跟踪的 HTML 文件、
 *       或一处**仓内**的 HTML 本地引用都没比对过，一律判红。
 *       （与 TR2 同一件事的 HTML 维度，但**单列一条**而不是并进 TR2 ——
 *         两条自证各自的失效形态不同，合在一起会让一次改动出两条红因、
 *         红因归属就没法判定了。）
 *
 * ⚠️ TR5 **只判「仓库里的文件」**，不判「站点上的路由」：
 *   · **根绝对路径**（以 / 开头）= 部署后由站点根解析的**站内 URL**，
 *     不是仓库里的文件（/portfolio/ 在文件协议下当然"不存在"，
 *     但它在站点上是活的）⇒ 一律跳过；
 *   · **协议相对**（//）与**带协议**（http: / mailto: / data: …）= 外链 ⇒ 跳过；
 *   · **页面链接**（<a href>）= 站内路由，不是资源引用 ⇒ 不扫。
 *   只有「相对路径的资源引用」才是「这个文件必须躺在仓库里」的意思。
 *
 * ⚠️ TR5 **守不了什么**（写清楚，不藏）：
 *   · HTML 里用**内联脚本**拼出来的路径（字符串拼接、运行时计算）扫不出来；
 *   · <style> 里 url(...) 指向的图不在 TR5 的视野里（那是样式表内部的引用，
 *     由样式表自己的门禁负责）；
 *   · <a href> 指向的站内路由是否存在，本门禁不判。
 *
 * ⚠️ TR6 单独一条而不是并进 TR2 的理由：
 *   TR2 数的是「代码文件里比对过的仓内引用」，TR6 数的是「HTML 里比对过的
 *   仓内引用」。两者的注入形态不同（一个改 require、一个改 href），
 *   合成一条会让「只改 HTML」这种改动同时踩到两条判据，红因归属就不纯了。
 *
 * ⚠️ TR2 的口径（2026-10-21 修正）：数的是**真正比对过**的引用（仓内），
 *   不是“扫到的本地引用总数”。旧口径把「指向仓库外的依赖」也算进去 ⇒
 *   一份只引用 node_modules 的仓库也能让 TR2 变绿 ⇒ 自证存活形同虚设。
 *
 * ⚠️ 遮罩为什么必须有（2026-10-21 实测的两个假阳性）：
 *   旧门禁**不剥注释、也不看字符串** ⇒
 *     · 注释里写着一行指向 `./lib/ghost.cjs` 的本地 require ⇒ 旧门禁当真引用 ⇒ 判红；
 *     · 字符串里存着一段指向 `./lib/ghost.cjs` 的本地 require 字样（比如自测脚本拼夹具）
 *       ⇒ 旧门禁照样当真引用 ⇒ 判红。
 *   两者都不是引用，却会让门禁对着一个**从没写过的文件**报错 ——
 *   于是真正该报的那次被淹了。现在遮罩分两层：
 *     ① 注释（行注释与块注释）整体遮掉；字符串里的 // 不是注释 ⇒ 先认字符串整段跳过；
 *     ② 字符串**不在引用位**时，连内容一起遮掉 —— require 语句里那个路径字符串
 *       里那个字符串**必须留着**（它才是路径），别处的字符串只是文字。
 *
 * ⚠️ 为什么用**索引**（git ls-files）而不是 HEAD：
 *   `git commit` 提交的是**索引**，不是 HEAD、也不是工作树。
 *   所以“这次提交会带进去哪些文件”的答案在索引里。
 *   本门禁扫的是**工作树内容**（已跟踪文件在本地被改成什么样就扫什么样），
 *   查的却是**索引里的跟踪集合** —— 于是“本地改了引用、但目标还没进索引”
 *   这种状态（也就是那个 P0）在提交前就被抓住。
 *
 * ⚠️ 已知盲区（不假装扫全了）：动态 import（带括号的那种）、require.resolve、
 *   模板字符串拼出来的路径，都不被下面那条正则认出来。
 *
 * 用法：node scripts/check-tracked-refs.cjs   （有错 exit 1）
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

/* ---------- 判定开关：每条判据一个 ----------
   只为自测的负对照存在（卸掉单独一条），默认恒为 true。
   ⚠️ 开关只包住「报红」这一步；**计算**一律照做 ⇒
      卸掉一条判据不会连带关掉别的判据（否则负对照证明不了「卸得精准」）。 */
const TR1_ON = true; // 引用完整性
const TR2_ON = true; // 自证存活
const TR3_ON = true; // 索引可读（TR1/TR2 的前提）
const TR4_ON = true; // 遮罩自证（TR1/TR2/TR5 的前提）
const TR5_ON = true; // HTML 引用完整性
const TR6_ON = true; // HTML 侧自证存活

const problems = [];
function note(id, msg) {
  problems.push(`${id}：${msg}`);
}

/* ---------- 遮罩：只让**代码**参与判定 ----------
   遮罩规则（注释整体遮掉；**不在引用位**上的字符串连内容一起遮掉）现在
   由 **scripts/lib/js-refs.cjs** 独家持有 —— 另一道门禁（GW6 / GW8）要问
   「这个脚本 require 的第三方包是不是已声明」，用的必须是**同一份**剥法：
   否则本门禁认"注释里写的 require 不算数"、那道门禁认"字符串里写的 require 算数"
   ⇒ 两边口径漂移 ⇒ 一边假红、一边漏报，且没人知道。
   （本门禁的 TR1 自测里有专门一档：注释里 / 字符串里写着本地 require 的字样
     都不算引用 ⇒ 换实现后那一档仍绿，即证明行为没变。） */
const { maskForScan } = require("./lib/js-refs.cjs");

/* ---------- HTML 侧：注释遮罩 + 本地资源引用提取 ---------- */

/* HTML 注释整体遮掉：注释里写的 <link href="..."> 是举例，不是引用。 */
function maskHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

/* 这些标签的属性值是「资源路径」。
   ⚠️ <a href> 不在其中 —— 那是**页面链接**（站内路由），不是仓库里的文件。 */
const HTML_TAG_RE = /<(link|img|script|source|video|audio|iframe|embed|object)\b([^>]*)>/gi;
const HTML_ATTR_RE = /\b(href|src|poster|data|srcset)\s*=\s*"([^"]*)"/gi;
/* 内联 module script：import() / from 的字面量路径。
   ⚠️ 内联脚本的模块 base 是**文档 URL**，所以相对路径按 HTML 文件自身解析。 */
const HTML_MODULE_SCRIPT_RE = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
const MODULE_IMPORT_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)|\bfrom\s*["']([^"']+)["']/g;

/** 这个值是不是「仓库里的本地相对路径」（站内 URL / 外链 / 锚点都排除）。 */
function isLocalRelPath(v) {
  if (!v) return false;
  if (v.startsWith("/")) return false;                   // 站内 URL（含协议相对）
  if (v.startsWith("#")) return false;                   // 锚点
  if (v.startsWith("?")) return false;                   // 纯查询串
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v)) return false; // 带协议（http: / mailto: / data: …）
  return true;
}

/** 一个 HTML 文件里的本地相对资源引用。 */
function htmlLocalRefsOf(html) {
  const masked = maskHtmlComments(html);
  const out = [];

  HTML_TAG_RE.lastIndex = 0;
  let m;
  while ((m = HTML_TAG_RE.exec(masked)) !== null) {
    const attrs = m[2] || "";
    HTML_ATTR_RE.lastIndex = 0;
    let a;
    while ((a = HTML_ATTR_RE.exec(attrs)) !== null) {
      const name = a[1].toLowerCase();
      const value = a[2];
      const parts = name === "srcset" ? value.split(",") : [value];
      for (const p of parts) {
        const v = p.trim().split(/\s+/)[0];
        if (isLocalRelPath(v)) out.push({ rel: v, kind: "asset" });
      }
    }
  }

  HTML_MODULE_SCRIPT_RE.lastIndex = 0;
  while ((m = HTML_MODULE_SCRIPT_RE.exec(masked)) !== null) {
    const body = m[1] || "";
    MODULE_IMPORT_RE.lastIndex = 0;
    let i;
    while ((i = MODULE_IMPORT_RE.exec(body)) !== null) {
      const v = i[1] || i[2];
      if (isLocalRelPath(v)) out.push({ rel: v, kind: "module" });
    }
  }

  return out;
}

/* 静态 require / import 的本地相对路径。
   只认字面量；模板字符串等动态写法扫不出来（这一点在汇总里说明，不假装扫全了）。 */
const LOCAL_REF_RE = /\brequire\(\s*["'](\.[^"']+)["']\s*\)|(?:\bfrom|\bimport)\s*["'](\.[^"']+)["']/g;

/** 遮罩之后还剩几处本地引用。 */
function countLocalRefs(text) {
  LOCAL_REF_RE.lastIndex = 0;
  let n = 0;
  let m;
  while ((m = LOCAL_REF_RE.exec(text)) !== null) n++;
  return n;
}

/* ---------- TR4：遮罩自证（合成样例必须命中） ---------- */

/* 合成样例里的关键字是**拼**出来的：门禁扫自己时不能把自己当成一处引用。 */
const KW = { req: "requ" + "ire", from: "fr" + "om" };

const MASK_PROOFS = [
  {
    name: "代码里的 require 仍被认出",
    text: `const a = ${KW.req}("./lib/x.cjs");`,
    want: 1,
  },
  {
    name: "行注释里的 require 不算引用",
    text: `// ${KW.req}("./lib/x.cjs")`,
    want: 0,
  },
  {
    name: "块注释里的 require 不算引用",
    text: `/* ${KW.req}("./lib/x.cjs") */`,
    want: 0,
  },
  {
    name: "字符串里的 require 字样不算引用",
    text: `const s = "${KW.req}('./lib/x.cjs')";`,
    want: 0,
  },
  {
    name: "from 形式的引用仍被认出",
    text: `import x ${KW.from} "./lib/x.cjs";`,
    want: 1,
  },
  {
    name: "字符串里的双斜杠不是注释",
    text: `const u = "a // b";\nconst a = ${KW.req}("./lib/x.cjs");`,
    want: 1,
  },
];

const maskProofs = MASK_PROOFS.map((p) => {
  const got = countLocalRefs(maskForScan(p.text));
  return { name: p.name, want: p.want, got, ok: got === p.want };
});

/* HTML 注释遮罩的自证样例：注释里的资源引用不算引用，标签里的仍被认出。 */
const HTML_MASK_PROOFS = [
  {
    name: "HTML 注释里的资源引用不算引用",
    html: `<!-- <link rel="stylesheet" href="./ghost.css"> -->`,
    want: 0,
  },
  {
    name: "HTML 标签里的资源引用仍被认出",
    html: `<link rel="stylesheet" href="./real.css">`,
    want: 1,
  },
  {
    name: "内联 module 里的 import 路径仍被认出",
    html: `<script type="module">await import("./main.js");</script>`,
    want: 1,
  },
];

const htmlMaskProofs = HTML_MASK_PROOFS.map((p) => {
  const got = htmlLocalRefsOf(p.html).length;
  return { name: p.name, want: p.want, got, ok: got === p.want };
});

const maskOk = maskProofs.every((p) => p.ok) && htmlMaskProofs.every((p) => p.ok);

if (!maskOk && TR4_ON) {
  for (const p of maskProofs) {
    if (!p.ok) {
      note(
        "TR4",
        `注释/字符串遮罩自证失败：${p.name} —— 期望 ${p.want} 处本地引用，实际 ${p.got} 处。` +
          `遮罩坏了 ⇒ TR1 的结论不可信 ⇒ 这一轮其余判据整段跳过。`
      );
    }
  }
  for (const p of htmlMaskProofs) {
    if (!p.ok) {
      note(
        "TR4",
        `HTML 注释遮罩自证失败：${p.name} —— 期望 ${p.want} 处本地引用，实际 ${p.got} 处。` +
          `遮罩坏了 ⇒ TR5 的结论不可信 ⇒ 这一轮其余判据整段跳过。`
      );
    }
  }
}

/* ---------- TR3：索引可读（TR1/TR2 的前提） ---------- */

let tracked = new Set();
let indexOk = true;
let indexError = "";
try {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  tracked = new Set(out.split("\0").filter(Boolean));
} catch (e) {
  indexOk = false;
  indexError = (e && e.message) || String(e);
}

if (!indexOk && TR3_ON) {
  note(
    "TR3",
    `读不到 git 索引（git ls-files 失败）—— 本门禁无法判定「被引用的文件有没有被跟踪」。` +
      `没有 git 就判不出来 = 判据不存在，不是“没问题”。原始错误：${indexError}`
  );
}

/* 前提不在场 ⇒ 依赖它的判据整段跳过（红因归属保持纯净：只报前提那一条）。
   ⚠️ 遮罩坏掉这一条只看 TR4_ON：TR4 被卸掉 = 操作者自己摘掉了那道安全网，
      这时 TR1 照跑（负对照要能证明「卸 TR4 是精准的」）。 */
const skipScan = !indexOk || (TR4_ON && !maskOk);

/* ---------- 扫哪些文件 ---------- */
const CODE_EXT = new Set([".cjs", ".js", ".mjs"]);

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

/* ---------- TR1：引用完整性 ---------- */
let filesScanned = 0;
let refsFound = 0; // 扫到的本地引用总数（含指向仓库外的）
let refsCompared = 0; // 真正比对过的（仓内）
let refsOutsideRepo = 0;

if (!skipScan) {
  const codeFiles = [...tracked].filter((f) => CODE_EXT.has(path.extname(f)));

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

    const masked = maskForScan(text);
    LOCAL_REF_RE.lastIndex = 0;
    let m;
    while ((m = LOCAL_REF_RE.exec(masked)) !== null) {
      const rel = m[1] || m[2];
      refsFound++;

      const cands = resolveTarget(file, rel);

      // 引用到仓库外（node_modules 之类）—— 那是依赖，不是本仓库的文件，跳过
      if (!cands.some((c) => isInsideRepo(c))) {
        refsOutsideRepo++;
        continue;
      }
      refsCompared++;

      const existing = cands.find((c) => fs.existsSync(c));
      if (!existing) {
        if (TR1_ON) {
          note(
            "TR1",
            `scripts/…${file} 引用了 ${rel}，但磁盘上找不到它` +
              `（试过：${cands.map((c) => path.relative(ROOT, c)).join(" / ")}）—— ` +
              `这棵树根本跑不起来。`
          );
        }
        continue;
      }

      const relExisting = path.relative(ROOT, existing);
      if (!tracked.has(relExisting)) {
        if (TR1_ON) {
          note(
            "TR1",
            `${file} 引用了 ${rel}（磁盘上是 ${relExisting}），但**它没有被 git 跟踪** —— ` +
              `提交后这棵树会断：全新克隆里 require 会直接报 ` +
              `「Cannot find module '${relExisting.replace(/^scripts\//, "./")}」。` +
              `请把它和引用方放在同一次提交里。`
          );
        }
      }
    }
  }
}

/* ---------- TR2：自证存活 ---------- */
if (!skipScan) {
  if (!filesScanned) {
    if (TR2_ON) {
      note(
        "TR2",
        `一个已跟踪的代码文件都没扫到（跟踪集合里没有 .cjs/.js/.mjs）—— ` +
          `判据从未被真正执行过。`
      );
    }
  } else if (!refsCompared) {
    if (TR2_ON) {
      note(
        "TR2",
        `扫了 ${filesScanned} 个代码文件，却一处**仓内**本地引用都没比对过` +
          `（扫到的 ${refsFound} 处里 ${refsOutsideRepo} 处指向仓库外，已跳过）—— ` +
          `判据没有真的比对过东西（多半是被卸掉了）。`
      );
    }
  }
}

/* ---------- TR5：HTML 引用完整性 ---------- */
let htmlFilesScanned = 0;
let htmlRefsFound = 0; // 扫到的本地引用总数（含指向仓库外的）
let htmlRefsCompared = 0; // 真正比对过的（仓内）
let htmlRefsOutsideRepo = 0;

if (!skipScan) {
  const htmlFiles = [...tracked].filter((f) => path.extname(f).toLowerCase() === ".html");

  for (const file of htmlFiles) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) continue; // 已跟踪但本地被删了：不归本门禁管
    htmlFilesScanned++;

    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch (e) {
      continue;
    }

    for (const ref of htmlLocalRefsOf(text)) {
      const rel = ref.rel;
      htmlRefsFound++;

      const clean = rel.split("#")[0].split("?")[0];
      if (!clean) continue;
      const target = path.resolve(path.dirname(path.join(ROOT, file)), clean);

      // 引用到仓库外 —— 那是外部资源，不是本仓库的文件，跳过
      if (!isInsideRepo(target)) {
        htmlRefsOutsideRepo++;
        continue;
      }
      htmlRefsCompared++;

      if (!fs.existsSync(target)) {
        if (TR5_ON) {
          note(
            "TR5",
            `${file} 引用了 ${rel}，但磁盘上找不到它 —— ` +
              `这个页面打开就是坏样式 / 坏脚本（HTML 里的资源引用必须躺在仓库里）。`
          );
        }
        continue;
      }

      const relExisting = path.relative(ROOT, target);
      if (!tracked.has(relExisting)) {
        if (TR5_ON) {
          note(
            "TR5",
            `${file} 引用了 ${rel}（磁盘上是 ${relExisting}），但**它没有被 git 跟踪** —— ` +
              `提交后这棵树会断：全新克隆里这个页面会少掉样式 / 脚本。` +
              `请把它和引用方放在同一次提交里。`
          );
        }
      }
    }
  }
}

/* ---------- TR6：HTML 侧自证存活 ---------- */
if (!skipScan) {
  if (!htmlFilesScanned) {
    if (TR6_ON) {
      note(
        "TR6",
        `一个已跟踪的 HTML 文件都没扫到（跟踪集合里没有 .html）—— ` +
          `TR5 判据从未被真正执行过。`
      );
    }
  } else if (!htmlRefsCompared) {
    if (TR6_ON) {
      note(
        "TR6",
        `扫了 ${htmlFilesScanned} 个 HTML 文件，却一处**仓内**的本地资源引用都没比对过` +
          `（扫到的 ${htmlRefsFound} 处里 ${htmlRefsOutsideRepo} 处指向仓库外，已跳过）—— ` +
          `TR5 没有真的比对过东西（多半是被卸掉了）。`
      );
    }
  }
}

/* ---------- 出结果 ---------- */
if (problems.length) {
  console.error("引用完整性门禁未通过：\n");
  for (const p of problems) console.error(`  ✗ 门禁 ${p}`);
  console.error("");
  process.exit(1);
}

/* 前提缺失但对应判据被卸掉了 ⇒ 这一轮**什么都没判** ——
   不能打印“通过”（那是假话），只能说“未执行”。 */
if (skipScan) {
  console.log(
    `引用完整性门禁未执行：前提缺失（${!indexOk ? "读不到 git 索引" : "遮罩自证不通过"}），` +
      `其余判据已跳过 —— 这一轮没有判过任何引用。`
  );
  process.exit(0);
}

console.log(
  `引用完整性门禁通过：扫了 ${filesScanned} 个已跟踪代码文件、` +
    `比对过 ${refsCompared} 处仓内本地引用` +
    (refsOutsideRepo ? `（另有 ${refsOutsideRepo} 处指向仓库外的依赖，已跳过）` : "") +
    `，被引用的文件全部也已被 git 跟踪；` +
    `另扫了 ${htmlFilesScanned} 个已跟踪 HTML 文件、` +
    `比对过 ${htmlRefsCompared} 处仓内本地资源引用` +
    (htmlRefsOutsideRepo ? `（另有 ${htmlRefsOutsideRepo} 处指向仓库外，已跳过）` : "") +
    `，全部存在且已被 git 跟踪。`
);
