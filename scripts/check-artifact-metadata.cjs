#!/usr/bin/env node
/**
 * 产出物元数据门禁 —— 守住"论文页结构化数据里的数据集 / 胶囊 / 代码仓库
 * 必须与 src/_data/site.js 单一真源逐字段一致"这件事。
 *
 * 为什么要有这个门禁：
 *   论文页的 JSON-LD 现在有三件"可引用的产出物"：
 *     · Dataset            ← Zenodo 数据集（10.5281/zenodo.18041880）
 *     · SoftwareSourceCode ← Code Ocean 胶囊（10.24433/CO.6720035.v1）
 *     · SoftwareSourceCode ← GitHub 代码仓库（真正可 clone 的那份源码）
 *   前两件的 **DOI 与复用条款是注册过的**（DataCite 登记：数据集
 *   CC BY 4.0、胶囊 Apache-2.0），所以"读者能不能合法复用、在哪个版本上
 *   复用"是有权威答案的；而这些答案**只存在于 site.js 里**。
 *   结构化数据是它们的投影——投影一旦与真源漂移（改 typo、漏字段、
 *   某个字段被重构顺手删掉），**没有任何门禁会发现**：
 *     · 门禁 8 只查"Dataset / SoftwareSourceCode 实体在不在"，不查字段；
 *     · 门禁 19 / 31 查的是 @id 唯一与同 @id 的字段一致，不查"投影对不对"；
 *     · 门禁 9 查的是身份类 meta 有没有数据支撑，不查产出物。
 *   于是"license 悄悄变成 null"这种改动，build 全绿、页面照出，
 *   而**结构化检索拿到的复用条款是空的**——这正是本门禁要挡的。
 *
 *   同理，GitHub 仓库此前**在结构化数据里一个节点都没有**（只有一条可见
 *   链接）。它被数据集的 DataCite 登记描述明确指认为"下载代码的地方"，
 *   是读者真正会去 clone 的源码——机器消费方读论文页时读到的"代码在哪"
 *   却是空的。本门禁要求它**必须**作为实体出现。
 *
 * 八条判据：
 *   M1 数据集实体 —— @id / identifier / license / version 必须与 site.js 逐字一致；
 *   M2 胶囊实体   —— @id / identifier / license / version / codeRepository 同上；
 *   M3 代码仓库实体 —— 必须存在，且 @id / url / identifier / codeRepository
 *                      都等于 site.js 的 pub.code；creator 挂本人 @id 且带
 *                      本人 ORCID；citation 指回论文页；
 *   M4 可见层与机器层同源 —— 论文页与首页上**带 data-code-repo 标记**的
 *                      链接，每一条的 href 都必须等于 site.js 的 pub.code；
 *                      首页那一条还要求**有且只有一条**（重复 ⇒ 判据有歧义）；
 *                      数据层的 author.paperCodeRepo 也必须等于 pub.code；
 *   M5 复用条款必须是可解析的绝对 URL —— 读者要照着它去读许可证；
 *   M6 门禁自己没被卸掉 —— 沿 `npm run` 链从 build 往下走；
 *   M7 前提可读 —— 论文页产物在不在、JSON-LD 块解不解得开；
 *   M8 逐比较点覆盖度自证 —— 每个比较点都真的跑过（"没报错"≠"没问题"）。
 *
 * ⚠️ M4 为什么必须按**标记**定位（这是本轮修掉的一个真洞）：
 *   论文页上指向代码仓的链接有**两条**（页头的 "Code ↗" 按钮 + "Data and
 *   code availability" 段那一行）。旧实现用的是**存在性判据**
 *   （"页面上至少有一个 href 等于 pub.code"）⇒ 只要两条里**有一条**还对，
 *   门禁就放行 ⇒ 另一条漂移（仓库改名 / 转移后只改了一处）**没人叫**。
 *   首页那段早就在另一个场合撞到过同一个盲区并改成了标记定位
 *   （`data-code-repo`），论文页这段是**同族残留**——现在两边口径统一。
 *   改法：模板给论文页那两条链接加上 `data-code-repo` 标记（**只是加一个
 *   HTML 属性，不改版式**），门禁改成按标记定位，并要求
 *   **每一条**带标记的链接都必须等于 pub.code（比"存在一条对的"更严）。
 *
 * ⚠️ M6 为什么不能用子串匹配（这是本轮修掉的另一个真洞）：
 *   旧实现判"门禁自己被卸掉"用的是 `build.includes("check:artifact")`。
 *   本轮要给这道门禁补常驻自测，npm script 名字必然包含
 *   `check:artifact-selftest` ⇒ **子串依然匹配** ⇒ 真正把 `check:artifact`
 *   从 build 链上摘掉之后，M6 反而判**绿**。这与 check-wrapping 的 W3、
 *   check-css-braces 的 CB4 是同一个坑（那两处已改成沿链遍历）。
 *   现在 M6 沿 `npm run` 链从 build 往下走，只认**真的指向本文件**的 script。
 *
 * ⚠️ M8 为什么不能只看"一共比过几处"（这是本轮修掉的第三个真洞）：
 *   旧实现的自证存活只看 `compared` 是不是 0 ⇒ 只要 M2 / M3 / M4 里任何
 *   一条还在比，它就非 0 ⇒ **M1 整段被摘掉也照样判绿**。M1 静默失效
 *   （判据还在文件里、但一行都不执行）正是"看起来在、其实不生效"那一族。
 *   现在 M8 逐**比较点**核对：每个该跑的比较点都真的跑过（跑过且结果是
 *   红的，也算"跑过"——那属于该判据自己的红因，不该由 M8 重复报）。
 *   前提不成立（论文页不在、JSON 块坏、真源里压根没有这个字段）的比较点
 *   会被**豁免**，不算漏跑 ⇒ M8 只在"静默失效"时红。
 *
 * ⚠️ M1 / M2 的 license 期望值为什么是 `licenseUrl || license`：
 *   模板（eleventy.config.js 的 jsonLdPaper）投影的是
 *   `dataset.license = sw.licenseUrl || sw.license` ⇒ 门禁若拿
 *   `sw.licenseUrl || undefined` 去比，两者口径就不一致 ⇒ 一旦
 *   licenseUrl 被删（正是 M5 想让作者补的东西），页面其实是对的，门禁却会
 *   报一条"不一致"的假红。期望值必须与模板的投影表达式**逐字同源**。
 *
 * ⚠️ M4 首页那段的两个前提（改判据时记得一起看）：
 *   ① 前提是"首页会给出每篇论文的代码仓入口"。当前站点首页 intro 段落确实
 *      逐篇给出了（1 篇）。若将来首页改为只列部分论文，这条要同步放宽。
 *   ② 期望值取自 site.js 的 pub.code，与被判数据**同源** → 本条只能挡
 *      "**两份副本漂移**"（首页 ≠ 论文卡片），挡不住"两处一致地改成别的仓"。
 *      后者是协同篡改，落在已声明的诚实边界内（靠 git 历史审计 + 日志复核），
 *      本门禁**不声称**能挡。
 *
 * ⚠️ 为什么不写进 scripts/verify-site.cjs：那里的门禁是**一个连续编号**
 *   的整体（文件头清单 + 代码段 + 对照表三处必须一一对应，见门禁 24/29），
 *   插入新号要同时改三处、且号必须连续。本门禁是独立主题的**产物级**检查，
 *   与 check-a11y（A*）、check-wrapping（W*）同一形态：
 *   自带编号、单独成文件。因此不占用 verify-site.cjs 的号段。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const PKG = path.join(ROOT, "package.json");
const SELF = path.basename(__filename);

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。
   ⚠️ 开关只包住 fail()：**计算无条件做** —— 否则卸一条判据会连带关掉别条。 */
const M1_ON = true;
const M2_ON = true;
const M3_ON = true;
const M4_ON = true;
const M5_ON = true;
const M6_ON = true;
const M7_ON = true;
const M8_ON = true;

/** 开关表：判据编号 → 这条判据当前还报不报红。
    ⚠️ 必须**真的**被 fail() 读到：开关声明了却没人消费的话，
       自测的「卸掉某条判据 ⇒ 对应注入必须转绿」这一档永远不成立
       （红还在 ⇒ 看起来像负对照失败，其实是负对照根本没生效）。 */
const SWITCH_ON = {
  M1: M1_ON,
  M2: M2_ON,
  M3: M3_ON,
  M4: M4_ON,
  M5: M5_ON,
  M6: M6_ON,
  M7: M7_ON,
  M8: M8_ON,
};

const problems = [];
const fail = (id, msg) => {
  /* 这条判据被卸掉了 ⇒ 不报红（但**计算照做**：比较点照样被标记，
     所以 M8 不会把「卸掉了」误判成「漏跑了」）。 */
  if (SWITCH_ON[id] === false) return;
  problems.push(`${id}：${msg}`);
};

/* ---------- 逐比较点覆盖度自证（M8 用的两个簿子） ----------
   hits   —— 比较点 → 真的跑过几次
   waived —— 因前提不成立而**豁免**的比较点（豁免不算漏跑） */
const hits = Object.create(null);
const waived = new Set();
const mark = (key) => {
  hits[key] = (hits[key] || 0) + 1;
};
const waive = (key) => {
  waived.add(key);
};
/** 豁免某个前缀下的全部比较点（前提不成立时用）。 */
const waivePrefix = (prefix) => {
  for (const k of COMPARE_POINTS) if (k.startsWith(prefix)) waived.add(k);
};

/**
 * 全部比较点的**静态目录**。
 * ⚠️ 必须是静态的：动态登记的话，把一整块判据从门禁里删掉时它连同自己的
 *   比较点一起消失 ⇒ M8 反而判绿 ⇒ M8 就守不住它要守的东西。
 */
const COMPARE_POINTS = [
  "M1.entity",
  "M1.identifier",
  "M1.license",
  "M1.version",
  "M2.entity",
  "M2.identifier",
  "M2.license",
  "M2.version",
  "M2.codeRepository",
  "M3.entity",
  "M3.atid",
  "M3.url",
  "M3.identifier",
  "M3.creator.atid",
  "M3.creator.sameAs",
  "M3.citation.atid",
  "M4.page.mark",
  "M4.page.href",
  "M4.home.mark",
  "M4.home.href",
  "M4.author.paperCodeRepo",
  "M5.dataset.url",
  "M5.capsule.url",
  "M6.wired",
  "M7.paperPage",
  "M7.jsonBlock",
];

/* 比过的处数：给通过行用 */
let compared = 0;

/* ---------- 单一真源 ---------- */
let siteData = null;
try {
  siteData = require(path.join(ROOT, "src/_data/site.js"));
} catch (e) {
  /* 读不到真源 ⇒ 没有对象可比 ⇒ 这是 M7 的前提不成立，不是 M1 的红因。
     旧实现把它当成一条普通红因（且没有编号），本轮归入 M7。 */
  fail(
    "M7",
    `读不到 src/_data/site.js（${e.message}）——本门禁没有真源可比，本轮一条判据都没判。`
  );
  waivePrefix("M");
}

const siteUrl = (siteData && siteData.url) || "";
const pubs = siteData && Array.isArray(siteData.publications) ? siteData.publications : [];

/* ---------- 产物里的一篇论文页 ---------- */
const MARKED_A_RE = /<a\b[^>]*\bdata-code-repo\b[^>]*>/gi;

/** 抽出一段 HTML 里**带 data-code-repo 标记**的链接的 href。
    定位不到标记 ⇒ 判据就知道不了该看哪一条（红因在 M4 报）。 */
const markedHrefs = (html) => {
  const out = [];
  for (const m of html.matchAll(MARKED_A_RE)) {
    const h = m[0].match(/href\s*=\s*"([^"]*)"/);
    out.push(h ? h[1] : "");
  }
  return out;
};

const readPaperPage = (pub) => {
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) {
    /* 产物不在场 ⇒ 本篇的 M1–M5 全部没法判 ⇒ 报 M7 并豁免它们。
       旧实现报的是一条没编号的普通红因（"论文页产物不存在"），
       而下面 M1–M3 的"实体没找到"也一并报出来 ⇒ 病因与后果混在一个红因集合里，
       读者得自己分辨先修哪个。本轮拆开：**只报 M7**，其余明确写"这一轮没判"。 */
    fail(
      "M7",
      `${rel}：论文页产物不存在（site.js 里有 ${pub.slug} 这条论文，但没有对应页面）` +
        `——本篇的 M1–M5 这一轮**没判**（不是「判过且不通过」）。`
    );
    waivePrefix("M1.");
    waivePrefix("M2.");
    waivePrefix("M3.");
    waivePrefix("M4.page");
    waivePrefix("M5.");
    return null;
  }
  const html = fs.readFileSync(file, "utf8");
  /* 论文页读到了 ⇒ 「前提可读」这件事本身已经跑过（无论下面的块解不解放得开），
     必须先记一次：不然块坏掉时 M7 会报红、而 M8 又会说「M7.jsonBlock 一次都没跑过」
     —— 同一件事报两遍，红因归属就不纯净了。 */
  mark("M7.paperPage");
  const nodes = [];
  let jsonOk = true;
  let blockCount = 0;
  for (const b of html.matchAll(
    /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    blockCount++;
    let parsed;
    try {
      parsed = JSON.parse(b[1]);
    } catch (e) {
      /* 解析失败**必须自己报**，不能只靠"实体没找到"来表达：
         块坏掉时 collectNodes 收不到任何节点，下面会报"没有 Dataset 实体"——
         那条是真的，但它**不是病因**（病因是 JSON 坏了）。
         两条一起报，读的人才知道该先修哪个。 */
      jsonOk = false;
      fail(
        "M7",
        `${rel}：有一个 JSON-LD 块解析失败（${e.message}）—— ` +
          `该块里的产出物实体这一轮**全部读不到**，本篇的 M1–M5 这一轮**没判**` +
          `（不是「判过且不通过」；先修 JSON，再谈字段对不对）。`
      );
      continue;
    }
    const list = Array.isArray(parsed["@graph"])
      ? parsed["@graph"]
      : parsed["@type"]
        ? [parsed]
        : [];
    nodes.push(...list);
  }
  /* 「找到并逐块解 JSON」这个动作跑过了 ⇒ 记一次（块坏掉也算跑过：
     跑了、发现坏了、如实报 M7 —— 这正是它该做的）。 */
  mark("M7.jsonBlock");
  if (!jsonOk) {
    waivePrefix("M1.");
    waivePrefix("M2.");
    waivePrefix("M3.");
    waivePrefix("M4.page");
    waivePrefix("M5.");
    return null;
  }
  if (!blockCount) {
    /* 页面上一个 JSON-LD 块都没有 ⇒ 产出物实体**根本没被投影**，
       病因是"结构化数据这一层整个没了"，不是"某个字段对不上"。
       归 M7（前提），并把 M1–M5 整段豁免 —— 否则会同时冒出
       「没有 Dataset 实体」「没有胶囊实体」「没有代码仓实体」三条后果型红因。 */
    fail(
      "M7",
      `${rel}：页面上一个 JSON-LD 块都没有 —— 产出物实体**根本没被投影**` +
        `（不是「判过且不通过」；先看模板有没有把 jsonLdPaper 渲染出来），` +
        `本篇的 M1–M5 这一轮**没判**。`
    );
    waivePrefix("M1.");
    waivePrefix("M2.");
    waivePrefix("M3.");
    waivePrefix("M4.page");
    waivePrefix("M5.");
    return null;
  }
  return { rel, html, nodes, marked: markedHrefs(html) };
};

const typesOf = (node) => {
  const t = node && node["@type"];
  if (!t) return [];
  return Array.isArray(t) ? t : [t];
};
const findById = (nodes, id, type) =>
  nodes.find(
    (n) => n && n["@id"] === id && (!type || typesOf(n).includes(type))
  );

/** 比一处：跑过就记一次（不管结果对不对），不一致才报红。 */
const eq = (id, key, label, actual, expected, where) => {
  mark(key);
  compared++;
  if (actual !== expected) {
    fail(
      id,
      `${where}：${label} 不一致 —— 结构化数据里是 ${JSON.stringify(actual)}，` +
        `site.js 真源里是 ${JSON.stringify(expected)}。` +
        `读者照结构化数据拿到的复用条款 / 版本 / 地址是错的。`
    );
  }
};

/* ---------- 逐篇论文检查 ---------- */
for (const pub of pubs) {
  if (!pub || !pub.slug) continue;
  const page = readPaperPage(pub);
  if (!page) continue;
  const { rel, nodes, marked } = page;

  /* M1 数据集 */
  const sw = pub.software;
  if (sw && sw.doi) {
    const id = `https://doi.org/${sw.doi}`;
    const node = findById(nodes, id, "Dataset");
    mark("M1.entity");
    if (!node) {
      fail(
        "M1",
        `${rel}：没有 @id = ${id} 的 Dataset 实体 —— ` +
          `数据集不再能被结构化检索发现（复用条款也随之丢失）。` +
          `（site.js 里 software.doi 在、但 software.url 不在时，模板本来就不会输出这个实体）`
      );
      waivePrefix("M1.identifier");
      waivePrefix("M1.license");
      waivePrefix("M1.version");
    } else {
      eq("M1", "M1.identifier", "identifier", node.identifier, id, rel);
      /* 期望值与模板投影表达式同源：sw.licenseUrl || sw.license */
      eq("M1", "M1.license", "license", node.license, sw.licenseUrl || sw.license || undefined, rel);
      eq("M1", "M1.version", "version", node.version, sw.version || undefined, rel);
    }
  } else {
    waivePrefix("M1.");
  }

  /* M2 胶囊 */
  const cap = pub.capsule;
  if (cap && cap.doi) {
    const id = `https://doi.org/${cap.doi}`;
    const node = findById(nodes, id, "SoftwareSourceCode");
    mark("M2.entity");
    if (!node) {
      fail(
        "M2",
        `${rel}：没有 @id = ${id} 的 SoftwareSourceCode 实体 —— ` +
          `可复现胶囊不再能被结构化检索发现。` +
          `（site.js 里 capsule.doi 在、但 capsule.url 不在时，模板本来就不会输出这个实体）`
      );
      waivePrefix("M2.identifier");
      waivePrefix("M2.license");
      waivePrefix("M2.version");
      waivePrefix("M2.codeRepository");
    } else {
      eq("M2", "M2.identifier", "identifier", node.identifier, id, rel);
      eq("M2", "M2.license", "license", node.license, cap.licenseUrl || cap.license || undefined, rel);
      eq("M2", "M2.version", "version", node.version, cap.version || undefined, rel);
      eq("M2", "M2.codeRepository", "codeRepository", node.codeRepository, cap.url || undefined, rel);
    }
  } else {
    waivePrefix("M2.");
  }

  /* M3 代码仓库实体 */
  const repo = pub.code;
  if (repo) {
    const node = nodes.find(
      (n) =>
        n &&
        typesOf(n).includes("SoftwareSourceCode") &&
        n.codeRepository === repo
    );
    mark("M3.entity");
    if (!node) {
      fail(
        "M3",
        `${rel}：结构化数据里没有 codeRepository = ${repo} 的 SoftwareSourceCode 实体 —— ` +
          `这篇论文**真正可克隆的源码**只有一条可见链接，机器消费方读不到「代码在哪」。`
      );
      waivePrefix("M3.atid");
      waivePrefix("M3.url");
      waivePrefix("M3.identifier");
      waivePrefix("M3.creator.atid");
      waivePrefix("M3.creator.sameAs");
      waivePrefix("M3.citation.atid");
    } else {
      eq("M3", "M3.atid", "@id", node["@id"], repo, rel);
      eq("M3", "M3.url", "url", node.url, repo, rel);
      eq("M3", "M3.identifier", "identifier", node.identifier, repo, rel);
      const creator = node.creator || {};
      eq("M3", "M3.creator.atid", "creator.@id", creator["@id"], `${siteUrl}/#person`, rel);
      const sameAs = Array.isArray(creator.sameAs)
        ? creator.sameAs
        : creator.sameAs
          ? [creator.sameAs]
          : [];
      const orcid = String((siteData.author && siteData.author.orcid) || "").trim();
      mark("M3.creator.sameAs");
      compared++;
      if (orcid && !sameAs.includes(orcid)) {
        fail(
          "M3",
          `${rel}：代码仓库的 creator 挂着本人 @id，但 sameAs 里没有本人 ORCID ${orcid} —— ` +
            `本人实体与自己的权威标识脱钩了（与门禁 23 同一件事）。`
        );
      }
      const citation = node.citation || {};
      eq("M3", "M3.citation.atid", "citation.@id", citation["@id"], `${siteUrl}/papers/${pub.slug}/`, rel);
    }
  } else {
    waivePrefix("M3.");
  }

  /* M4 论文页：按**标记**定位，每一条带标记的链接都必须等于 pub.code */
  if (repo) {
    mark("M4.page.mark");
    if (!marked.length) {
      fail(
        "M4",
        `${rel}：页面上没有带 data-code-repo 标记的链接 —— ` +
          `判据定位不到论文页上的代码仓入口（可见层与机器层是否同源，这一轮判不了）。`
      );
      waivePrefix("M4.page.href");
    } else {
      mark("M4.page.href");
      for (const href of marked) {
        if (href !== repo) {
          fail(
            "M4",
            `${rel}：页面上带 data-code-repo 标记的链接指向 ${href || "（取不到 href）"}，` +
              `与 publications[].code = ${repo} 不相等 —— ` +
              `结构化数据宣称有这份代码仓库，页面却给不出同一个入口（可见层与机器层不是同一份）。`
          );
        }
      }
    }
  } else {
    waivePrefix("M4.page");
  }
}

/* ---------- M5 复用条款必须是可解析的绝对 URL ----------
   判的是**有效的复用条款**（licenseUrl 优先，否则退到 license 字符串）。
   ⚠️ licenseUrl 缺失时不豁免：复用条款退化成一句字符串，读者照样没法
      "照着它去读许可证" ⇒ 那是本条判据要挡的事，不是"没有可判的东西"。 */
{
  /* 逐篇：任何一篇的复用条款不合法都要报。 */
  for (const pub of pubs) {
    if (!pub || !pub.slug) continue;
    if (pub.software && pub.software.doi) {
      const reuse = pub.software.licenseUrl || pub.software.license;
      mark("M5.dataset.url");
      compared++;
      if (reuse && !/^https?:\/\/\S+$/.test(reuse)) {
        fail(
          "M5",
          `papers/${pub.slug}/index.html：数据集的复用条款 "${reuse}" 不是可解析的绝对 URL —— ` +
            `读者照它去读许可证会落到一个打不开的地方。`
        );
      }
    } else {
      waive("M5.dataset.url");
    }
    if (pub.capsule && pub.capsule.doi) {
      const reuse = pub.capsule.licenseUrl || pub.capsule.license;
      mark("M5.capsule.url");
      compared++;
      if (reuse && !/^https?:\/\/\S+$/.test(reuse)) {
        fail(
          "M5",
          `papers/${pub.slug}/index.html：胶囊的复用条款 "${reuse}" 不是可解析的绝对 URL。`
        );
      }
    } else {
      waive("M5.capsule.url");
    }
  }
}

/* ---------- M4（续）首页那行代码仓链接也必须等于 pub.code ---------- */
// ⚠️ 按**产物上的标记**（data-code-repo）定位首页那一行，**不**用"页面上任意
// 一个 href 等于 pub.code"那种存在性判据——
// 存在性判据有实测出来的盲区：只要页面上**别处**还留着一条正确链接，
// 改坏了的那条就没人管（实测：模板改回硬编码字面量 → 首页同时存在
// 正确链接与坏链接 → 存在性判据放行，坏的那条漂移了没人叫）。
// 标记必须**有且只有一个**：漏了 → 判据定位不到；重复了 → 判据有歧义。
{
  const homeFile = path.join(SITE, "index.html");
  if (!fs.existsSync(homeFile)) {
    fail(
      "M7",
      "index.html：首页产物不存在（_site/index.html）——无法核对首页上的代码仓库链接，" +
        "M4 的首页那半边这一轮**没判**（不是「判过且不通过」）。"
    );
    waivePrefix("M4.home");
    waivePrefix("M4.author");
  } else {
    const homeHtml = fs.readFileSync(homeFile, "utf8");
    const homeMarked = markedHrefs(homeHtml);
    mark("M4.home.mark");
    if (homeMarked.length !== 1) {
      fail(
        "M4",
        `index.html：首页上带 data-code-repo 标记的链接有 ${homeMarked.length} 条（应为 1 条）—— ` +
          `标记漏了或重复了，判据定位不到首页正文那一行代码仓链接。`
      );
      waivePrefix("M4.home.href");
    } else {
      mark("M4.home.href");
      for (const pub of pubs) {
        if (!pub || !pub.code) continue;
        if (homeMarked[0] !== pub.code) {
          fail(
            "M4",
            `index.html：首页正文那行代码仓链接指向 ${homeMarked[0] || "（取不到 href）"}，` +
              `与 publications[].code = ${pub.code} 不相等 —— ` +
              `首页与论文卡片说的是同一份代码仓库，两处必须一致。`
          );
        }
      }
    }
    // 数据层也要钉住：site.author.paperCodeRepo（首页那一行取的值）
    // 必须与 pub.code 相等 —— 否则首页会指向另一个仓，而产物上看着"有链接"。
    mark("M4.author.paperCodeRepo");
    compared++;
    const authorCode = (siteData.author && siteData.author.paperCodeRepo) || "";
    for (const pub of pubs) {
      if (!pub || !pub.code) continue;
      if (authorCode !== pub.code) {
        fail(
          "M4",
          `src/_data/site.js：author.paperCodeRepo = ${authorCode || "（空）"}，` +
            `与 publications[].code = ${pub.code} 不相等 —— ` +
            `首页正文与论文卡片会指向两个不同的代码仓库。`
        );
      }
    }
  }
}

/* ---------- M6 门禁自己没被卸掉 ---------- */
{
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("M6", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
  }
  if (pkg) {
    const SCRIPTS = pkg.scripts || {};
    const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
    const seen = new Set();
    const queue = ["build"];
    while (queue.length) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      const cmd = SCRIPTS[name] || "";
      NPM_RUN_RE.lastIndex = 0;
      let m;
      while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
        if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
      }
    }
    const wired = Object.keys(SCRIPTS).filter(
      (n) => seen.has(n) && (SCRIPTS[n] || "").includes(SELF)
    );
    mark("M6.wired");
    if (!wired.length) {
      fail(
        "M6",
        `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`
      );
    }
  } else {
    waive("M6.wired");
  }
}

/* ---------- M8 逐比较点覆盖度自证 ---------- */
{
  const missing = COMPARE_POINTS.filter(
    (k) => !(hits[k] > 0) && !waived.has(k)
  );
  if (missing.length) {
    fail(
      "M8",
      `这些比较点这一轮**一次都没跑过**（既没判过、也不是因为前提不成立被豁免）：` +
        `${missing.join("、")} —— 对应的判据可能已经失效。` +
        `（"没报错"和"没问题"长得一模一样。）`
    );
  }
  const ran = COMPARE_POINTS.filter((k) => hits[k] > 0);
  if (!ran.length) {
    fail(
      "M8",
      "本门禁一个比较点都没跑过——site.js 里没有可比对的产出物，或论文页产物不存在。" +
        "判据可能已经失效（与门禁 18「标注没了整套逐页核对就失效」是同一类病）。"
    );
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("产出物元数据门禁未通过：\n");
  for (const p of problems) console.error(`  ✗ 门禁 ${p}`);
  console.error("");
  process.exit(1);
}

const nPubs = pubs.length;
const ranPoints = COMPARE_POINTS.filter((k) => hits[k] > 0).length;
console.log(
  `产出物元数据门禁通过：${nPubs} 篇论文，数据集 / 胶囊 / 代码仓库的 ` +
    `@id、复用条款（license）、版本、地址全部与 src/_data/site.js 逐字一致；` +
    `共比对 ${compared} 处；逐比较点覆盖度自证：${ranPoints}/${COMPARE_POINTS.length} 个比较点都跑过。`
);
