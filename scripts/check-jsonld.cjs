#!/usr/bin/env node
/**
 * 门禁 J1–J10：站点实体（WebSite）与页面实体（WebPage / ProfilePage）这一层
 * 必须存在，并且彼此接得上；实体身份（@id）全站唯一。
 *
 * 为什么要有这个门禁：
 *   本站此前的结构化数据只有两层——"我是谁"（Person）与"我产出过什么"
 *   （ScholarlyArticle / Dataset / SoftwareSourceCode）。**站点自己从未被
 *   声明过**：没有 WebSite 节点，页面实体也没有。于是消费方拿不到两个
 *   最基础的答案：
 *     · "这个站点是谁的"（谁在运营它）
 *     · "这一页的主题是谁 / 是什么"（这一页到底在讲什么）
 *   个人学术主页的 JSON-LD 惯例（2026-10-19 查证的外部做法）是最少三件套：
 *   WebSite + Person + ProfilePage（讲作者的页面，mainEntity → Person）。
 *
 *   这类缺失**不会报错**：页面照常渲染、JSON-LD 照常能被 JSON.parse
 *   （verify-site 第 2 条查的就是那个）、其它门禁全绿——只有逐个节点读
 *   才知道少了这一层。所以要有机器门禁兜住。
 *
 * 判据（编号 J*，与 verify-site.cjs 的数字编号、check-a11y.cjs 的 A*、
 *       check-wrapping.cjs 的 W*、check-gates-wired.cjs 的 GW* 都不续接）：
 *   J1 每个非错误页都声明**恰好一个** WebSite 节点，且：
 *      · @id 恒为 <站点根>/#website
 *      · url 恒为 <站点根>/
 *      · publisher 指向"本人"的 @id
 *   J2 每个非错误页都声明**恰好一个**页面实体（WebPage / ProfilePage），且：
 *      · @id 恒为 <该页 canonical>#webpage
 *      · url **逐字等于**该页 <link rel="canonical"> 的 href
 *   J3 归属链完整：页面实体的 isPartOf → WebSite 的 @id；
 *      WebSite 的 publisher → "本人"的 @id（与该页 Person 节点同一个）
 *   J4 mainEntity 能解析，且指向"这一页真正在讲的东西"：
 *      · 论文页（该页自己声明了 @id == 本页 canonical 的 ScholarlyArticle）
 *        → 必须指向那篇论文
 *      · 其余页 → 必须指向本页的 Person 节点
 *      · 无论哪种，被指向的节点都必须在**本页**有声明（不能是空引用）
 *   J5 全站只应有一个站点实体：所有页的 WebSite @id 集合大小必须为 1
 *   J6 错误页不得声明 WebSite / WebPage / ProfilePage
 *      （404 页要表达的是"这里没有内容"；它既不是站点页面，也不是关于
 *        某人的页面。口径与 verify-site 第 16 条一致）
 *   J7 **自证存活**：判据必须真的比过东西——比过 0 页 / 0 处时判红。
 *      （"没报错"和"没问题"长得一模一样：判据一旦被卸掉，门禁会一直绿着，
 *        而产物早就变了。）
 *   J8 **同一个 @id 不得挂在不同的 @type 上**。
 *      实体身份是 @id：同一个 @id 必须只讲**一件事**。若它同时是
 *      "这一页是网站"（WebPage）和"这一页是一篇论文"（ScholarlyArticle），
 *      消费方按 @id 归并节点时两套字段会挤在一起，取到哪套全看遍历顺序。
 *      ⚠️ 判据**必须连嵌套引用一起看**：JSON-LD 语义里
 *      {"@type": "WebPage", "@id": X} 这种引用同样是对节点 X 的类型断言——
 *      只看顶层声明会漏掉本门禁要抓的正是那一类（论文页的
 *      mainEntityOfPage 就是这么写的：它引用的是论文实体自己的 @id，
 *      却顺带声明了另一个 @type）。
 *   J9 **论文的 mainEntityOfPage 必须指向承载它的那一页**，且那个 @id
 *      必须在**本页**有声明（不能是空引用）、也不能是论文实体自己。
 *      修 J8 之前论文页的 mainEntityOfPage 指回论文自己（自指），是个
 *      什么都不说的空转；J9 把它钉到"页面实体"上，并给出一条指名道姓的红因
 *      （J8 只说"有冲突"，J9 说"谁指错了"）。
 *   J10 **页面实体的 @type 必须与该页源文件 front matter 声明的角色一致**
 *      （`profilePage: true` → ProfilePage，否则 → WebPage）。
 *      J2 只判"恰好一个页面实体"，**从不看它的 @type 是什么**：把关于页的
 *      ProfilePage 改成 WebPage 无人看守 —— 页面照出、JSON-LD 照常合法、
 *      其余门禁全绿，消费方却再也读不出"这是关于某人的页面"。
 *      角色声明的**唯一真源**是源文件 front matter（base.njk 按它选类型；
 *      按 URL 硬编码路由的话，路由一改就会静默失配）→ 门禁回到源文件去
 *      逐页核对，而不是在门禁里另抄一份 URL 清单。
 *      产物里的源文件路径由构建期写入（`<!-- source: ... -->`，base.njk），
 *      与 sitemap 的同名标注同一套约定 —— 站点的 permalink 不统一，
 *      从 URL 反推源文件不可靠。
 *
 * 与既有门禁的关系（**刻意不重复**）：
 *   · verify-site 第 2 条查 JSON-LD 能否 JSON.parse → 本门禁不查解析本身，
 *     只用解析结果；但**解析失败时本门禁直接判红**（不静默跳过），否则
 *     "块坏了"会伪装成"没找到实体"。
 *   · verify-site 第 10 条查 @id/url 是否绝对地址；第 12 条查本人 @id 唯一；
 *     第 19 条查作品 @id 全站一致；第 27 条查本人节点姓名；第 31 条查同一
 *     @id 的同名字段不漂移 —— 那些查的是**已声明实体之间的一致性**。
 *     本门禁查的是**这一层是否存在，以及它与页面的归属链是否接得上**。
 *
 * 用法：node scripts/check-jsonld.cjs   （有错 exit 1）
 *      SITE_DIR=/tmp/xxx 可把产物目录指到别处（故障注入用）。
 */
const fs = require("fs");
const path = require("path");

const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "../_site");
const ROOT = path.resolve(__dirname, ".."); // 仓库根：J10 要回源文件核对页面角色
const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);
const note = (msg) => notes.push(msg);

/* 站点公开地址（site.url）——@id 口径的唯一基准。
   ⚠️ 读不到就直接判红，**不跳过**：site.url 空了以后下面每一条 @id 判据
   都变成"和空串比"，会一路绿灯通过——那叫门禁自己被卸掉，不叫没问题。 */
let SITE_URL = "";
try {
  const siteData = require(path.resolve(__dirname, "../src/_data/site.js"));
  SITE_URL = (siteData.url || "").replace(/\/+$/, "");
} catch {
  /* 下面统一判红 */
}
if (!SITE_URL) {
  console.error("✗ 读不到 site.url（src/_data/site.js），本门禁无法判定 @id 口径。");
  process.exit(1);
}

if (!fs.existsSync(SITE)) {
  console.error(`✗ 找不到产物目录 ${SITE}，请先运行 npm run build`);
  process.exit(1);
}

/* ---------- 收集产物页面 ---------- */
const allFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else allFiles.push(p);
  }
})(SITE);

const rel = (f) => path.relative(SITE, f);
// exFAT 卷上 macOS 会留 AppleDouble 资源叉（._foo.html），它同样以 .html 结尾。
const htmlFiles = allFiles.filter(
  (f) => f.endsWith(".html") && !path.basename(f).startsWith("._")
);

/* ---------- JSON-LD 工具 ---------- */

/** "@type" 可以是字符串，也可以是字符串数组（多类型实体）。
    只认字符串的话，数组型 @type 会被整条判据静默跳过——那是"判据自己
    被卸掉"，与删掉断言标注同族。 */
function typesOf(node) {
  const raw = node["@type"];
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  }
  return [];
}

/** 一份 ld+json 块里"声明"的节点（不是嵌套引用）。
    · 顶层是 @graph 数组 → 数组的每一项是声明
    · 顶层是带 @type 的对象 → 它本身是声明
    其余（嵌套对象）一律当引用处理——引用没有 @type，不参与实体判定。 */
function declarationsOf(parsed) {
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed["@graph"])) {
    return parsed["@graph"].filter((n) => n && typeof n === "object");
  }
  if (typesOf(parsed).length) return [parsed];
  return [];
}

/** 递归收集一个 ld+json 块里所有"既有 @id 又有 @type"的对象。
    ⚠️ 嵌套对象**也要收**：JSON-LD 语义里 {"@type": "WebPage", "@id": X}
    这种引用同样是对节点 X 的类型断言——消费方按 @id 归并时，声明里的
    @type 与引用里的 @type 会合到一起。只看顶层声明，恰好会漏掉
    J8 要抓的那一类冲突（论文页 mainEntityOfPage 就是这么写的）。
    纯裸引用（{"@id": X}，没有 @type）不贡献类型，不影响判定。 */
function typedNodes(parsed) {
  const out = [];
  (function scan(n) {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach(scan);
      return;
    }
    const t = typesOf(n);
    if (typeof n["@id"] === "string" && n["@id"] && t.length) {
      out.push({
        id: n["@id"],
        typeKey: t.slice().sort().join("+"),
        types: t.join(" / "),
      });
    }
    for (const v of Object.values(n)) scan(v);
  })(parsed);
  return out;
}

/** 取一条 <link> 的属性值。rel 可能有多个 token（rel="canonical" 之外还可能
    带别的），所以按 token 判，不做整串相等。 */
function linkAttr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? m[1] : "";
}

/** 该页的 canonical href。属性顺序不固定（rel 在前或 href 在前都可能），
    所以逐个 <link> 标签看，不写死一个正则顺序。 */
function canonicalOf(html) {
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rels = linkAttr(tag, "rel").split(/\s+/).filter(Boolean);
    if (!rels.includes("canonical")) continue;
    const href = linkAttr(tag, "href");
    if (href) return href;
  }
  return "";
}

/** 该页的源文件标注（构建期由 base.njk 写入：<!-- source: src/xxx.njk -->）。
    与 sitemap 里的同名标注同一套约定。 */
function sourceOf(html) {
  const m = html.match(/<!--\s*source:\s*([^>]*?)\s*-->/);
  return m ? m[1].trim() : "";
}

/** 源文件 front matter 里的 `profilePage` 开关（布尔语义）。
    只认 front matter **顶层**的键（与 Eleventy 的数据层一致）。
    值的真值口径必须与模板里
    `{%- set pageEntityType = 'ProfilePage' if profilePage else 'WebPage' -%}`
    一致：YAML 布尔照 YAML 解；带引号的字符串按 Nunjucks 真值（非空即真）算；
    其余（非空）一律为真。 */
function declaresProfilePage(file) {
  const text = fs.readFileSync(file, "utf8");
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return false; // 没有 front matter → 不是 profile 页
  const line = fm[1].split(/\r?\n/).find((l) => /^profilePage\s*:/.test(l));
  if (!line) return false;
  const raw = line
    .replace(/^profilePage\s*:\s*/, "")
    .replace(/\s+#.*$/, "")
    .trim();
  if (raw === "") return false;
  if (/^(['"]).*\1$/.test(raw)) return raw.length > 2; // 带引号的字符串：非空即真
  return !["false", "no", "off", "null", "~"].includes(raw.toLowerCase());
}

/* ---------- 逐页检查 ---------- */
let pagesChecked = 0;
let errorPagesChecked = 0;
let pageEntitiesFound = 0;
let comparisons = 0; // 真正比过的判据处数（J7 自证用）
let j9Compared = 0; // J9 真正比过的论文数
let j8Ids = 0; // J8 真正看过的 @id 个数
let j10Compared = 0; // J10 真正核对过角色的页数
let j10ProfilePages = 0; // J10 里声明为 ProfilePage 的页数
const websiteIds = new Set();
// J8 的全站口径：@id → (@type 组合 → 出现在哪些页)
const siteTypeUse = new Map();

for (const file of htmlFiles) {
  const from = rel(file);
  const html = fs.readFileSync(file, "utf8");
  const isErrorPage = path.basename(file) === "404.html";

  /* 1) 取出全部 ld+json 块并解析。
        解析失败**在这里判红**（不静默跳过）：否则"块坏了"会伪装成
        "这一页没有 WebSite 节点"，报错信息会指向错误的病根。 */
  const declarations = [];
  const typed = []; // J8 用：所有"带 @id 且带 @type"的出现处（含嵌套引用）
  for (const m of html.matchAll(
    /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed = null;
    try {
      parsed = JSON.parse(m[1]);
    } catch (e) {
      fail(`${from}: JSON-LD 块解析失败 —— ${e.message}（解析本身由 verify-site 第 2 条负责，这里直接判红以免被当成"实体缺失"）`);
      continue;
    }
    declarations.push(...declarationsOf(parsed));
    typed.push(...typedNodes(parsed));
  }

  const websites = declarations.filter((n) => typesOf(n).includes("WebSite"));
  const pageNodes = declarations.filter((n) =>
    typesOf(n).some((t) => t === "WebPage" || t === "ProfilePage")
  );
  const persons = declarations.filter((n) => typesOf(n).includes("Person"));
  const articles = declarations.filter((n) => typesOf(n).includes("ScholarlyArticle"));

  /* ---- J6：错误页不得声明这一层 ---- */
  if (isErrorPage) {
    errorPagesChecked++;
    if (websites.length) {
      fail(`${from}: 错误页声明了 WebSite 实体 —— 404 页要表达的是"这里没有内容"，它不是一个站点页面`);
    }
    if (pageNodes.length) {
      fail(
        `${from}: 错误页声明了页面实体（${pageNodes
          .map((n) => typesOf(n).join("/"))
          .join(" / ")}）—— 404 页不是"关于某人的页面"`
      );
    }
    comparisons++;
    continue;
  }

  pagesChecked++;
  const canonical = canonicalOf(html);

  /* ---- J1：恰好一个 WebSite 节点，且口径固定 ---- */
  if (websites.length !== 1) {
    fail(
      `${from}: WebSite 实体必须**恰好一个**，实际 ${websites.length} 个` +
        `（缺了 = 站点自己从未被声明；多个 = 消费方会把站点读成好几个）`
    );
  } else {
    const site = websites[0];
    const id = typeof site["@id"] === "string" ? site["@id"] : "";
    const url = typeof site.url === "string" ? site.url : "";
    comparisons++;
    if (id !== `${SITE_URL}/#website`) {
      fail(`${from}: WebSite 的 @id 是 ${JSON.stringify(id)}，应为 ${JSON.stringify(`${SITE_URL}/#website`)}`);
    }
    if (url !== `${SITE_URL}/`) {
      fail(`${from}: WebSite 的 url 是 ${JSON.stringify(url)}，应为 ${JSON.stringify(`${SITE_URL}/`)}`);
    }
    if (id) websiteIds.add(id);
  }

  /* ---- 本人 @id：从该页的 Person 声明里取（不另立一个来源） ---- */
  let personId = "";
  if (persons.length !== 1) {
    fail(
      `${from}: Person 实体必须**恰好一个**（本人），实际 ${persons.length} 个 —— ` +
        `publisher / mainEntity 都要指向它，指不准就等于没接上`
    );
  } else {
    personId = typeof persons[0]["@id"] === "string" ? persons[0]["@id"] : "";
  }

  /* ---- J2：恰好一个页面实体，且与 canonical 对得上 ---- */
  if (pageNodes.length !== 1) {
    fail(
      `${from}: 页面实体（WebPage / ProfilePage）必须**恰好一个**，实际 ${pageNodes.length} 个` +
        `（缺了 = 消费方拿不到"这一页在讲谁"）`
    );
  } else {
    pageEntitiesFound++;
    const page = pageNodes[0];
    const id = typeof page["@id"] === "string" ? page["@id"] : "";
    const url = typeof page.url === "string" ? page.url : "";
    comparisons++;
    if (!canonical) {
      fail(`${from}: 取不到 canonical，无法核对页面实体的 url —— 页面实体与 canonical 必须指向同一个地址`);
    } else {
      if (url !== canonical) {
        fail(
          `${from}: 页面实体的 url 是 ${JSON.stringify(url)}，与该页 canonical ` +
            `${JSON.stringify(canonical)} **不一致** —— 结构化数据说的是另一个地址`
        );
      }
      if (id !== `${canonical}#webpage`) {
        fail(
          `${from}: 页面实体的 @id 是 ${JSON.stringify(id)}，应为 ${JSON.stringify(`${canonical}#webpage`)}`
        );
      }
    }
  }

  /* ---- J10：页面实体的 @type 必须与源文件声明的角色一致 ----
     角色声明的**唯一真源**是源文件 front matter 的 `profilePage` 开关
     （base.njk 按它选 ProfilePage / WebPage）。判据回源文件逐页核对，
     不在门禁里另抄一份 URL 清单 —— 路由一改，清单就会静默失配。 */
  if (pageNodes.length === 1) {
    const page = pageNodes[0];
    const srcRel = sourceOf(html);
    if (!srcRel) {
      fail(
        `${from}: 页面里没有 <!-- source: ... --> 源文件标注 —— 门禁 J10 靠它知道` +
          `这一页的角色（profilePage），标注没了这条判据就失效了` +
          `（base.njk 里那行 <!-- source: ... --> 不能删）`
      );
    } else {
      const srcPath = path.resolve(ROOT, srcRel);
      if (!fs.existsSync(srcPath)) {
        fail(
          `${from}: 源文件标注指向 ${JSON.stringify(srcRel)}，但找不到这个文件 —— ` +
            `判据无从核对这一页的角色`
        );
      } else {
        j10Compared++;
        const isProfile = declaresProfilePage(srcPath);
        if (isProfile) j10ProfilePages++;
        const expected = isProfile ? "ProfilePage" : "WebPage";
        const actual = typesOf(page).filter((t) => t === "WebPage" || t === "ProfilePage");
        if (actual.length !== 1 || actual[0] !== expected) {
          fail(
            `${from}: 页面实体的 @type 是 ${JSON.stringify(typesOf(page).join(" / ") || "(无)")}，` +
              `但源文件 ${srcRel} 的 front matter 声明的是 ${expected}` +
              `（profilePage: ${isProfile}）—— 这一页的角色与源文件不一致` +
              `（ProfilePage 降级成 WebPage 消费方就读不出"这是关于某人的页面"）`
          );
        }
      }
    }
  }

  /* ---- J3 + J4：归属链与 mainEntity ---- */
  if (pageNodes.length === 1 && websites.length === 1) {
    const page = pageNodes[0];
    const site = websites[0];
    const siteId = typeof site["@id"] === "string" ? site["@id"] : "";
    const publisherId =
      site.publisher && typeof site.publisher === "object" ? site.publisher["@id"] : "";
    const isPartOfId =
      page.isPartOf && typeof page.isPartOf === "object" ? page.isPartOf["@id"] : "";
    comparisons += 2;

    if (isPartOfId !== siteId) {
      fail(
        `${from}: 页面实体的 isPartOf 指向 ${JSON.stringify(isPartOfId)}，` +
          `应是站点实体的 @id ${JSON.stringify(siteId)} —— 页面与站点没接上`
      );
    }
    if (personId && publisherId !== personId) {
      fail(
        `${from}: 站点实体的 publisher 指向 ${JSON.stringify(publisherId)}，` +
          `应是"本人"的 @id ${JSON.stringify(personId)} —— 站点与作者没接上`
      );
    }

    /* mainEntity：这一页在讲谁。
       论文页 = 本页自己声明了 @id 等于本页 canonical 的 ScholarlyArticle；
       其余页 = 本人的 Person 节点。 */
    const mainEntityId =
      page.mainEntity && typeof page.mainEntity === "object" ? page.mainEntity["@id"] : "";
    comparisons++;
    if (!mainEntityId) {
      fail(`${from}: 页面实体没有 mainEntity —— 消费方拿不到"这一页在讲谁"`);
    } else {
      const isPaperPage = articles.some((a) => a["@id"] === canonical);
      const expected = isPaperPage ? canonical : personId;
      if (mainEntityId !== expected) {
        fail(
          `${from}: 页面实体的 mainEntity 指向 ${JSON.stringify(mainEntityId)}，` +
            `应为 ${JSON.stringify(expected)}（本页是${isPaperPage ? "论文页" : "非论文页"}）`
        );
      }
      if (!declarations.some((d) => d["@id"] === mainEntityId)) {
        fail(
          `${from}: 页面实体的 mainEntity 指向 ${JSON.stringify(mainEntityId)}，` +
            `但该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用`
        );
      }
    }
  }

  /* ---- J8 的采集：全站口径的 @id → @type 组合表 ----
     判红放在循环之后（一次性判），因为"同一个 @id 挂了两种 @type"这件事
     本来就是**跨页**才看得出来：论文实体在列表页声明成 ScholarlyArticle，
     在论文页又被引用成 WebPage —— 单看一页可能只看到其中一半。 */
  for (const t of typed) {
    if (!siteTypeUse.has(t.id)) siteTypeUse.set(t.id, new Map());
    const m = siteTypeUse.get(t.id);
    if (!m.has(t.typeKey)) m.set(t.typeKey, { types: t.types, pages: new Set() });
    m.get(t.typeKey).pages.add(from);
  }

  /* ---- J9：论文的 mainEntityOfPage 必须指向承载它的那一页 ----
     列表页的论文实体（jsonLdArticles 出的那批）本来就没有这个字段，
     它们不归这条管；有这个字段的只有论文页那个（jsonLdPaper 出的）。 */
  for (const a of articles) {
    const m = a.mainEntityOfPage;
    if (!m || typeof m !== "object") continue;
    const mid = typeof m["@id"] === "string" ? m["@id"] : "";
    j9Compared++;
    if (!mid) {
      fail(
        `${from}: 论文实体「${a["@id"] || "(无 @id)"}」的 mainEntityOfPage 没有 @id —— ` +
          `消费方拿不到"这篇论文挂在哪一页"`
      );
      continue;
    }
    if (mid === a["@id"]) {
      fail(
        `${from}: 论文实体「${mid}」的 mainEntityOfPage 指向了**它自己** —— ` +
          `自指等于什么都没说；应指向本页的页面实体 <页面 URL>#webpage`
      );
      continue;
    }
    if (canonical && mid !== `${canonical}#webpage`) {
      fail(
        `${from}: 论文实体的 mainEntityOfPage 指向 ${JSON.stringify(mid)}，` +
          `应为 ${JSON.stringify(`${canonical}#webpage`)}（本页的页面实体）`
      );
    }
    if (!declarations.some((d) => d["@id"] === mid)) {
      fail(
        `${from}: 论文实体的 mainEntityOfPage 指向 ${JSON.stringify(mid)}，` +
          `但该 @id 在**本页**没有对应声明 —— 是个解析不到的空引用`
      );
    }
  }
}

/* ---- J5：全站只有一个站点实体 ---- */
comparisons++;
if (websiteIds.size > 1) {
  fail(
    `全站出现 ${websiteIds.size} 个不同的 WebSite @id：` +
      `${[...websiteIds].map((s) => JSON.stringify(s)).join(" / ")} —— ` +
      `全站必须指向同一个站点实体`
  );
}

/* ---- J8：同一个 @id 不得挂在不同的 @type 上（全站一次性判） ---- */
{
  let idCount = 0;
  for (const [id, m] of siteTypeUse) {
    idCount++;
    if (m.size <= 1) continue;
    const detail = [...m.values()]
      .map((v) => `"${v.types}"（${[...v.pages].sort().join("、")}）`)
      .join(" / ");
    fail(
      `同一个 @id「${id}」在全站挂了 ${m.size} 种 @type：${detail} —— ` +
        `实体身份就是 @id：同一个 @id 必须只讲一件事，否则消费方按 @id 归并时` +
        `两套字段会挤在一起，取到哪一套全看遍历顺序。` +
        `页面实体用 <页面 URL>#webpage，论文实体用 <页面 URL>（无片段），两者不能共用`
    );
  }
  if (!idCount) {
    fail("全站没有找到任何带 @id 且带 @type 的 JSON-LD 节点 —— J8 从未真正执行过");
  }
  j8Ids = idCount;
}

/* ---- J7：自证存活 ---- */
comparisons++;
if (pagesChecked === 0) {
  fail("产物里一个可检查的页面都没有 —— 判据从未被真正执行过");
}
if (pageEntitiesFound === 0) {
  fail("全站没有找到任何页面实体（WebPage / ProfilePage）—— 判据从未被真正执行过");
}
if (comparisons < pagesChecked) {
  fail(`只比了 ${comparisons} 处，却检查了 ${pagesChecked} 页 —— 判据没有逐页执行`);
}
if (!j9Compared) {
  fail(
    "全站没有比到任何一个 mainEntityOfPage —— J9 从未真正执行过" +
      "（论文页的 mainEntityOfPage 消失了，判据也就跟着失效了）"
  );
}
if (!j10Compared) {
  fail(
    "全站没有比到任何一页的页面角色 —— J10 从未真正执行过" +
      "（页面实体与源文件 front matter 的 profilePage 声明从未被核对过）"
  );
}
if (!j10ProfilePages) {
  fail(
    "全站没有一页声明 ProfilePage —— 页面角色这一层整个退化了，" +
      "消费方拿不到「这是关于某人的页面」" +
      "（首页与关于页 front matter 里的 profilePage: true 是不是被改名或删掉了？）"
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("站点结构化数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

note(
  `${pagesChecked} 个非错误页都声明了站点实体与页面实体（${pageEntitiesFound} 个页面实体），` +
    `归属链与 mainEntity 全部接得上`
);
if (errorPagesChecked) {
  note(`${errorPagesChecked} 个错误页没有声明站点实体与页面实体`);
}
note(
  `实体身份：全站 ${j8Ids} 个 @id，每个 @id 只挂一种 @type；` +
    `${j9Compared} 篇论文的 mainEntityOfPage 指向本页的页面实体`
);
note(
  `页面角色：${j10Compared} 页与源文件 front matter 的 profilePage 声明逐页核对一致` +
    `（其中 ${j10ProfilePages} 页声明为 ProfilePage）`
);
notes.forEach((n) => console.log(`· ${n}`));
console.log("✓ 结构化数据自检通过（门禁 J1–J10）");
