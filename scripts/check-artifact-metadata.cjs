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
 *   某个字段被重构顺手删掉），**没有任何门禁会���现**：
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
 * 六条判据：
 *   M1 数据集实体 —— @id / identifier / license / version 必须与 site.js 逐字一致；
 *   M2 胶囊实体   —— @id / identifier / license / version / codeRepository 同上；
 *   M3 代码仓库实体 —— 必须存在，且 @id / url / identifier / codeRepository
 *                      都等于 site.js 的 pub.code；creator 挂本人 @id 且带
 *                      本人 ORCID；citation 指回论文页；
 *   M4 可见层与机器层同源 —— 论文页上必须真的有一个 href 等于 pub.code
 *                      （结构化数据宣称有的仓库，页面得真的给得出来），
 *                      **且首页正文里那行"分析流水线在某个仓"也必须等于
 *                      同一个 pub.code**（此前首页那行是硬编码字面量，与
 *                      site.js 各写一份 → 仓库改名/转移时只改一处，首页与
 *                      论文卡片就指向两个不同的仓库，且没有门禁会叫。
 *                      与身份句柄那次同族：同一事实两份副本，其中一份没人看守）；
 *   M5 复用条款必须是可解析的绝对 URL —— 读者要照着它去读许可证；
 *   M6 门禁自己没被卸掉 + **自证存活** —— 一处都没比过就判红
 *                      （"没报错"和"没问题"长得一模一样）。
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

const problems = [];
const note = (msg) => problems.push(msg);

/* ---------- 单一真源 ---------- */
let siteData = null;
try {
  siteData = require(path.join(ROOT, "src/_data/site.js"));
} catch (e) {
  note(`读不到 src/_data/site.js（${e.message}）——本门禁没有真源可比，直接判红。`);
}

if (!siteData) {
  console.error("产出物元数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const siteUrl = siteData.url || "";
const pubs = Array.isArray(siteData.publications) ? siteData.publications : [];

/* ---------- 产物里的一篇论文页 ---------- */
const readPaperPage = (pub) => {
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) {
    note(`论文页产物不存在：${rel}（site.js 里有 ${pub.slug} 这条论文，但没有对应页面）`);
    return null;
  }
  const html = fs.readFileSync(file, "utf8");
  const nodes = [];
  for (const b of html.matchAll(
    /<script[^>]*type\s*=\s*"application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  )) {
    let parsed;
    try {
      parsed = JSON.parse(b[1]);
    } catch (e) {
      /* 解析失败**必须自己报**，不能只靠"实体没找到"来表达：
         块坏掉时 collectNodes 收不到任何节点，下面会报"没有 Dataset 实体"——
         那条是真的，但它**不是病因**（病因是 JSON 坏了）。
         两条一起报，读的人才知道该先修哪个。 */
      note(
        `${rel}：有一个 JSON-LD 块解析失败（${e.message}）—— ` +
          `该块里的产出物实体这一轮**全部读不到**，下面那些"实体没找到"是它的后果，不是根因。`
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
  const hrefs = [...html.matchAll(/href\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  return { rel, html, nodes, hrefs };
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

/* 比过的处数：用来自证判据还活着（M6） */
let compared = 0;
const eq = (label, actual, expected, where) => {
  compared++;
  if (actual !== expected) {
    note(
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
  const { rel, nodes, hrefs } = page;

  /* M1 数据集 */
  const sw = pub.software;
  if (sw && sw.doi) {
    const id = `https://doi.org/${sw.doi}`;
    const node = findById(nodes, id, "Dataset");
    if (!node) {
      note(
        `${rel}：没有 @id = ${id} 的 Dataset 实体 —— ` +
          `数据集不再能被结构化检索发现（复用条款也随之丢失）。`
      );
    } else {
      eq("identifier", node.identifier, id, rel);
      eq("license", node.license, sw.licenseUrl || undefined, rel);
      eq("version", node.version, sw.version || undefined, rel);
      /* M5 复用条款必须是绝对 URL */
      if (sw.licenseUrl) {
        compared++;
        if (!/^https?:\/\/\S+$/.test(sw.licenseUrl)) {
          note(
            `${rel}：数据集的 licenseUrl "${sw.licenseUrl}" 不是可解析的绝对 URL —— ` +
              `读者照它去读许可证会落到一个打不开的地方。`
          );
        }
      }
    }
  }

  /* M2 胶囊 */
  const cap = pub.capsule;
  if (cap && cap.doi) {
    const id = `https://doi.org/${cap.doi}`;
    const node = findById(nodes, id, "SoftwareSourceCode");
    if (!node) {
      note(
        `${rel}：没有 @id = ${id} 的 SoftwareSourceCode 实体 —— ` +
          `可复现胶囊不再能被结构化检索发现。`
      );
    } else {
      eq("identifier", node.identifier, id, rel);
      eq("license", node.license, cap.licenseUrl || undefined, rel);
      eq("version", node.version, cap.version || undefined, rel);
      eq("codeRepository", node.codeRepository, cap.url || undefined, rel);
      if (cap.licenseUrl) {
        compared++;
        if (!/^https?:\/\/\S+$/.test(cap.licenseUrl)) {
          note(
            `${rel}：胶囊的 licenseUrl "${cap.licenseUrl}" 不是可解析的绝对 URL。`
          );
        }
      }
    }
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
    if (!node) {
      note(
        `${rel}：结构化数据里没有 codeRepository = ${repo} 的 SoftwareSourceCode 实体 —— ` +
          `这篇论文**真正可克隆的源码**只有一条可见链接，机器消费方读不到「代码在哪」。`
      );
    } else {
      eq("@id", node["@id"], repo, rel);
      eq("url", node.url, repo, rel);
      eq("identifier", node.identifier, repo, rel);
      const creator = node.creator || {};
      eq("creator.@id", creator["@id"], `${siteUrl}/#person`, rel);
      const sameAs = Array.isArray(creator.sameAs)
        ? creator.sameAs
        : creator.sameAs
          ? [creator.sameAs]
          : [];
      const orcid = String(siteData.author.orcid || "").trim();
      compared++;
      if (orcid && !sameAs.includes(orcid)) {
        note(
          `${rel}：代码仓库的 creator 挂着本人 @id，但 sameAs 里没有本人 ORCID ${orcid} —— ` +
            `本人实体与自己的权威标识脱钩了（与门禁 23 同一件事）。`
        );
      }
      const citation = node.citation || {};
      eq("citation.@id", citation["@id"], `${siteUrl}/papers/${pub.slug}/`, rel);
    }
  }
}

/* ---------- M4 可见层与机器层同源 ---------- */
for (const pub of pubs) {
  if (!pub || !pub.slug || !pub.code) continue;
  const rel = `papers/${pub.slug}/index.html`;
  const file = path.join(SITE, "papers", pub.slug, "index.html");
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, "utf8");
  const hrefs = [...html.matchAll(/href\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
  compared++;
  if (!hrefs.includes(pub.code)) {
    note(
      `${rel}：页面上没有指向 ${pub.code} 的链接 —— ` +
        `结构化数据宣称有这份代码仓库，页面却给不出入口（可见层与机器层不是同一份）。`
    );
  }
}

/* ---------- M4（续）首页那行代码仓链接也必须等于 pub.code ---------- */
// ⚠️ 按**产物上的标记**（data-code-repo）定位首页那一行，**不**用"页面上任意
// 一个 href 等于 pub.code"那种存在性判据——
// 存在性判据有实测出来的盲区：只要页面上**别处**还留着一条正确链接，
// 改坏了的那条就没人管（实测：模板改回硬编码字面量 → 首页同时存在
// 正确链接与坏链接 → 存在性判据放行，坏的那条漂移了没人叫）。
// 标记必须**有且只有一个**：漏了 → 判据定位不到；重复了 → 判据有歧义。
// 自证存活（下面 homeCompared）也只覆盖"跑过没"，覆盖不了"整段被删"——
// 整段被删时自证代码自己也没了 → 那由仓库内的外部注入自测脚本兜
// （scripts/test-gates-selfcheck.cjs）。
let homeCompared = 0;
{
  const homeFile = path.join(SITE, "index.html");
  if (!fs.existsSync(homeFile)) {
    note("index.html：首页产物不存在（_site/index.html）——无法核对首页上的代码仓库链接。");
  } else {
    const homeHtml = fs.readFileSync(homeFile, "utf8");
    const marked = [...homeHtml.matchAll(/<a\b[^>]*\bdata-code-repo\b[^>]*>/g)].map((m) => m[0]);
    for (const pub of pubs) {
      if (!pub || !pub.code) continue;
      homeCompared++;
      if (marked.length !== 1) {
        note(
          `index.html：首页上带 data-code-repo 标记的链接有 ${marked.length} 条（应为 1 条）—— ` +
            `标记漏了或重复了，判据定位不到首页正文那一行代码仓链接。`
        );
        continue;
      }
      const hrefMatch = marked[0].match(/href\s*=\s*"([^"]*)"/);
      const href = hrefMatch ? hrefMatch[1] : "";
      if (href !== pub.code) {
        note(
          `index.html：首页正文那行代码仓链接指向 ${href || "（取不到 href）"}，` +
            `与 publications[].code = ${pub.code} 不相等 —— ` +
            `首页与论文卡片说的是同一份代码仓库，两处必须一致。`
        );
      }
    }
    // 数据层也要钉住：site.author.paperCodeRepo（首页那一行取的值）
    // 必须与 pub.code 相等 —— 否则首页会指向另一个仓，而产物上看着"有链接"。
    const authorCode = (siteData.author && siteData.author.paperCodeRepo) || "";
    for (const pub of pubs) {
      if (!pub || !pub.code) continue;
      homeCompared++;
      if (authorCode !== pub.code) {
        note(
          `src/_data/site.js：author.paperCodeRepo = ${authorCode || "（空）"}，` +
            `与 publications[].code = ${pub.code} 不相等 —— ` +
            `首页正文与论文卡片会指向两个不同的代码仓库。`
        );
      }
    }
  }
}
if (!homeCompared) {
  note(
    "首页代码仓库链接那段一处都没比过——判据可能已经失效" +
      "（与 M6 的自证存活是同一类病：'没报错'和'没问题'长得一模一样）。"
  );
}

/* ---------- M6 门禁自己没被卸掉 + 自证存活 ---------- */
if (!fs.existsSync(PKG)) {
  note("找不到 package.json，无法确认本门禁是否接在 build 上。");
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  const build = (pkg.scripts && pkg.scripts.build) || "";
  const wired =
    build.includes("check:artifact") &&
    (pkg.scripts["check:artifact"] || "").includes("check-artifact-metadata.cjs");
  if (!wired) {
    note(
      `门禁自己被卸掉了：package.json 的 build 链里没有 check:artifact，` +
        `或 check:artifact 没有指向 scripts/check-artifact-metadata.cjs。`
    );
  }
}
if (!compared) {
  note(
    "本门禁一处都没比过——site.js 里没有可比对的产出物，或论文页产物不存在。" +
      "判据可能已经失效（与门禁 18「标注没了整套逐页核对就失效」是同一类病）。"
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("产出物元数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const nPubs = pubs.length;
console.log(
  `产出物元数据门禁通过：${nPubs} 篇论文，数据集 / 胶囊 / 代码仓库的 ` +
    `@id、复用条款（license）、版本、地址全部与 src/_data/site.js 逐字一致；` +
    `共比对 ${compared} 处。`
);
