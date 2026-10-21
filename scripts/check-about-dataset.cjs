#!/usr/bin/env node
/**
 * about 页产出物描述门禁 —— 守住"about 页对同一条 Zenodo 记录的描述，
 * 必须与 DataCite 登记事实一致、且各处说的是**同一件事**"。
 *
 * 为什么要有这个门禁（一次实测坐实的缺陷，不是假想）：
 *   同一份 Zenodo 记录（10.5281/zenodo.18041880，TRMM 论文的可复用数据集）
 *   在 about 页上有**三处互相矛盾**的描述，而且**没有一处**与登记事实相符：
 *     ① 散文（src/content/about.md）：「**Code** — the stage-identification
 *        **tool** for thunderstorms is archived on Zenodo」——把一条登记为
 *        **Dataset** 的记录说成「工具 / 代码」；
 *     ② Contact 行（src/about.njk）：`<dt>Software</dt>` + 链接文字里**烤死**
 *        一串 DOI 字面量（href 走 site.author.zenodo、文字不走 ⇒ 两处可以各说各的）；
 *     ③ Selected output 段：类型词写死 `Code`，链接文字用的是 **v1.0 时期的旧标题**
 *        （`software.label` = citeTitle），而不是 v2.0 的登记标题。
 *   登记事实（DataCite https://api.datacite.org/dois/10.5281/zenodo.18041880）：
 *     resourceTypeGeneral = **Dataset**；v1.0（…16662144）与概念 DOI（…16662143）
 *     登记类型**一律是 Dataset**，无一是 Software；
 *     记录里装的是**数据**（参考文献 PDF + 两个 TRMM 数据集压缩包），
 *     登记描述本身写着「This database is for the article … You can come to my
 *     GitHub to download the codes」⇒ **代码在 GitHub，不在这条记录里**。
 *   ⚠️ 论文参考文献表里那条写的是 "[Software]" —— 那是**论文原文的写法**
 *     （投稿时的称呼，改不了）。本站描述"这条记录是什么"时以**登记事实**为准；
 *     论文页（src/_includes/layouts/paper.njk）本来就写的是 `<dt>Dataset</dt>`，
 *     那里是**正确的基准**，本门禁拿它做跨页一致性核对。
 *
 *   为什么"页面照出、链接照打得开"却没人发现：三种说法都成立不了口，
 *   而**没有任何门禁看着这三处** ——
 *     · src/content/about.md 明确**不在** check-identity-derivation.cjs 的扫描面内
 *       （该文件头写明：`.md` 正文页不在扫描面内，另有登记事项）；
 *     · about.njk 的这三处描述，仓内**没有一条门禁**核对。
 *   ⇒ 与"同一事实两份副本、其中一份没人看守"是同一族病。
 *
 * 五条判据：
 *   AP1 **类型词必须是登记事实** —— about 页 Contact 行的术语、Selected output
 *       段的类型词、论文页的 `<dt>` 术语，三处都必须等于
 *       `publications[].software.resourceType`（DataCite 的 resourceTypeGeneral）。
 *   AP2 **可见 DOI 与地址必须同源** —— Contact 行的可见 DOI 必须逐字等于
 *       `software.doi`；`software.url` 必须由该 DOI 拼出；
 *       `author.zenodo` / `author.zenodoDoi` / `author.zenodoType` 三个字段
 *       必须分别等于同一条记录的 url / doi / resourceType。
 *   AP3 **链接文字必须是这一版的登记标题** —— Selected output 段那条链接的
 *       文字必须逐字等于 `software.registeredTitle`（读者点进去看到的就是它），
 *       不得回退到 `software.citeTitle`（v1.0 时期的旧标题）。
 *   AP4 **散文里的描述必须与登记事实一致** —— src/content/about.md **不得**
 *       写死 Zenodo 记录的地址（那是第二份副本）；产物里那条链接所在的列表项，
 *       **链接之前**的文字必须含登记类型词、且**不得**出现与之矛盾的
 *       「tool / code / software」。
 *   AP5 **覆盖度自证 + 门禁自己没被卸掉** —— 一处都没比过就判红；
 *       package.json 的 build 链里必须真的有本门禁。
 *
 * ⚠️ 本门禁**守不了什么**（写清楚，不藏）：
 *   它守的是「页面与真源不漂移」+「页面三处说的是同一件事」+「散文不写死地址」。
 *   如果有人把**真源与页面一起**改成别的（连 DataCite 登记事实也一起改），
 *   本门禁**抓不到** ⇒ 真源正确性仍靠人工核 + 外部登记核对（DataCite）。
 *   这个边界不是注释里的承诺：scripts/test-about-dataset.cjs 的 **AT10 档**
 *   就是它的可执行版本（真源与产物一起改错 ⇒ **必须判绿**）。
 *
 * ⚠️ 定位必须**唯一**：本门禁用产物上的 `data-dataset-contact` /
 *   `data-dataset-link` 标记定位那两行，**不**用"页面上任意一个 href 等于
 *   某个值"那种存在性判据 —— 存在性判据有实测盲区：只要页面上**别处**还留着
 *   一条正确链接，改坏了的那条就没人管。标记漏了或重复了 ⇒ 判红
 *   （定位不到就是"没在看"，比看着绿更坏）。
 *
 * 编号：AP1–AP5（About Page）。不与 verify-site.cjs 的数字编号、
 * check-artifact-metadata.cjs 的 M*、check-identity-derivation.cjs 的 ID*、
 * check-home-chart.cjs 的 HC* 等既有前缀冲突。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   SITE_DIR        —— 产物目录（默认 _site）
 *   SITE_DATA_PATH  —— 真源 site.js 的路径（默认 src/_data/site.js）
 *   ABOUT_MD_PATH   —— 散文源文件路径（默认 src/content/about.md）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE_DIR ? path.resolve(process.env.SITE_DIR) : path.join(ROOT, "_site");
const SITE_DATA_PATH = process.env.SITE_DATA_PATH
  ? path.resolve(process.env.SITE_DATA_PATH)
  : path.join(ROOT, "src", "_data", "site.js");
const ABOUT_MD_PATH = process.env.ABOUT_MD_PATH
  ? path.resolve(process.env.ABOUT_MD_PATH)
  : path.join(ROOT, "src", "content", "about.md");
const PKG = path.join(ROOT, "package.json");

const problems = [];
const note = (msg) => problems.push(msg);

/* 比过的处数：用来自证判据还活着（AP5） */
let compared = 0;
const eq = (label, actual, expected, where) => {
  compared++;
  if (actual !== expected) {
    note(
      `${where}：${label} 不一致 —— 页面上是 ${JSON.stringify(actual)}，` +
        `真源里是 ${JSON.stringify(expected)}。`
    );
  }
};

/* ---------- 真源 ---------- */
let siteData = null;
try {
  siteData = require(SITE_DATA_PATH);
} catch (e) {
  note(`读不到真源 ${SITE_DATA_PATH}（${e.message}）——本门禁没有真源可比，直接判红。`);
}
if (!siteData) {
  console.error("about 页产出物描述门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const pubs = Array.isArray(siteData.publications) ? siteData.publications : [];
const author = siteData.author || {};

/* author 级的"数据集入口"对应哪一条记录：靠 DOI 反查，
   反查不到就说明 author.zenodo* 指向的不是任何一条被登记的记录。 */
const authorDoi = author.zenodoDoi || "";
const ownerPub = pubs.find((p) => p && p.software && p.software.doi === authorDoi);
if (!ownerPub) {
  note(
    `src/_data/site.js：author.zenodoDoi = ${authorDoi || "（空）"}，` +
      `在 publications[] 里找不到 DOI 相同的 software 记录 —— ` +
      `about 页 Contact 行与 Selected output 段说的就不是同一条记录了。`
  );
}
const sw = (ownerPub && ownerPub.software) || (pubs[0] && pubs[0].software) || null;
if (!sw) {
  note("src/_data/site.js：publications[] 里没有带 software 的记录 —— 本门禁没有判断对象，直接判红。");
  console.error("about 页产出物描述门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const typeWord = String(sw.resourceType || "").trim();
const registeredTitle = String(sw.registeredTitle || sw.label || "").trim();
const doi = String(sw.doi || "").trim();
const url = String(sw.url || "").trim();

/* ---------- 工具 ---------- */
const stripTags = (s) =>
  String(s)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

/* ---------- 定位 ----------
   两条定位规则，**标记优先、内容回退**：
     ① 标记（data-dataset-contact / data-dataset-link）—— 明确指认"就是这一行"，
        页面上以后要加第二个同类行时不会被认错；
     ② 回退：按**内容**定位（哪一行/哪一段指向这条记录）—— 标记还没加上的产物
        （例如修前那一版）也能被判出**内容**上的错，而不是只报一句
        "标记漏了、定位不到"。
   ⚠️ 内容回退不是"存在性判据"：它要求**恰好一个**候选，0 个或多个都判红。
     存在性判据有实测盲区（页面上别处还留着一条正确链接 ⇒ 改坏的那条没人管），
     本门禁不犯这个错。
   标记本身另有独立判据：标记漏了或重复了也判红（契约要成立）。 */
const locate = (blocks, marker, contains) => {
  const marked = blocks.filter((b) => new RegExp(`\\b${marker}\\b`).test(b));
  if (marked.length === 1) return { block: marked[0], markerOk: true };
  if (marked.length > 1) {
    return { error: `带 ${marker} 标记的候选有 ${marked.length} 个（应为 1 个）—— 判据有歧义。` };
  }
  const byContent = blocks.filter((b) => contains(b));
  if (byContent.length === 1) return { block: byContent[0], markerOk: false };
  if (byContent.length > 1) {
    return { error: `按内容定位到 ${byContent.length} 个候选（应为 1 个）—— 判据有歧义。` };
  }
  return { error: "定位不到（既没有标记，也找不到指向该记录的那一行）。" };
};

/* ---------- 产物：about 页 ---------- */
const aboutFile = path.join(SITE, "about", "index.html");
const aboutHtml = readIf(aboutFile);
if (!aboutHtml) {
  note("about 页产物不存在（_site/about/index.html）——无法核对 about 页上的产出物描述。");
}

/* ---------- 产物：论文页（跨页一致性） ---------- */
let paperHtml = null;
let paperRel = "";
if (ownerPub && ownerPub.slug) {
  paperRel = `papers/${ownerPub.slug}/index.html`;
  paperHtml = readIf(path.join(SITE, "papers", ownerPub.slug, "index.html"));
  if (!paperHtml) {
    note(`${paperRel}：论文页产物不存在 —— 无法核对论文页上的类型术语。`);
  }
}

if (aboutHtml) {
  /* ---------- AP1-a + AP2-a + AP2-b：Contact 行 ---------- */
  const contactRows = [
    ...aboutHtml.matchAll(/<div class="about-contact__row">([\s\S]*?)<\/div>/g),
  ].map((m) => m[1]);
  const contact = locate(
    contactRows,
    "data-dataset-contact",
    (b) => b.includes(`href="${url}"`) || b.includes(url)
  );
  if (contact.error) {
    note(`about/index.html：Contact 行（数据集入口）${contact.error}`);
  } else {
    if (!contact.markerOk) {
      note(
        "about/index.html：Contact 行上没有 data-dataset-contact 标记 —— " +
          "定位契约不成立（门禁现在靠内容回退才找到它，标记漏了要有人看见）。"
      );
    }
    const row = contact.block;
    const dtMatch = row.match(/<dt[^>]*>([\s\S]*?)<\/dt>/);
    const dtText = dtMatch ? stripTags(dtMatch[1]) : "";
    compared++;
    if (!dtText) {
      note("about/index.html：Contact 行里取不到 <dt> 术语 —— 判据定位失败。");
    } else if (dtText !== typeWord) {
      note(
        `about/index.html：Contact 行把这条 Zenodo 记录标成「${dtText}」，` +
          `而登记事实是「${typeWord}」（DataCite resourceTypeGeneral）—— ` +
          `读者按页面的说法去 Zenodo 找"软件"，找不到登记的东西。`
      );
    }

    /* 可见 DOI 必须逐字等于真源 */
    const rowText = stripTags(row);
    compared++;
    const doiMatch = rowText.match(/doi:\s*(\S+)/);
    if (!doiMatch) {
      note(
        `about/index.html：Contact 行的链接文字里没有 DOI（读到「${rowText}」）—— ` +
          `读者拿不到这条记录的标识符。`
      );
    } else if (doiMatch[1] !== doi) {
      note(
        `about/index.html：Contact 行可见的 DOI 是 ${doiMatch[1]}，` +
          `真源里是 ${doi} —— 页面上写的地址与真源不是同一条记录。`
      );
    }

    /* href 必须指向同一条记录 */
    compared++;
    const hrefMatch = row.match(/href\s*=\s*"([^"]*)"/);
    const href = hrefMatch ? hrefMatch[1] : "";
    if (href !== url) {
      note(
        `about/index.html：Contact 行链接指向 ${href || "（取不到 href）"}，` +
          `真源里这条记录的地址是 ${url} —— 可见文字与地址可能各说各的。`
      );
    }
  }

  /* ---------- AP1-b + AP3：Selected output 段 ---------- */
  const outputParas = [
    ...aboutHtml.matchAll(/<p class="about-output__meta">([\s\S]*?)<\/p>/g),
  ].map((m) => m[1]);
  const output = locate(
    outputParas,
    "data-dataset-link",
    (b) => b.includes(`href="${url}"`) || b.includes(url)
  );
  if (output.error) {
    note(`about/index.html：Selected output 段（数据集那一条）${output.error}`);
  } else {
    if (!output.markerOk) {
      note(
        "about/index.html：Selected output 段的数据集那一条上没有 data-dataset-link 标记 —— " +
          "定位契约不成立（门禁现在靠内容回退才找到它，标记漏了要有人看见）。"
      );
    }
    const para = output.block;
    const paraText = stripTags(para);
    /* 类型词：段落文字里 ":" 之前的部分 */
    const typePrefix = paraText.split(":")[0].trim();
    compared++;
    if (typePrefix !== typeWord) {
      note(
        `about/index.html：Selected output 段把这条记录写成「${typePrefix}」，` +
          `而登记事实是「${typeWord}」（DataCite resourceTypeGeneral）。`
      );
    }
    /* 链接文字必须是这一版的登记标题 */
    const anchorMatch = para.match(/<a\b[^>]*>([\s\S]*?)<\/a>/);
    const anchorText = anchorMatch ? stripTags(anchorMatch[1]) : "";
    compared++;
    if (anchorText !== registeredTitle) {
      note(
        `about/index.html：Selected output 段的链接文字是「${anchorText}」，` +
          `真源里这一版的登记标题是「${registeredTitle}」—— ` +
          `读者点开 Zenodo 看到的是另一个名字。（引用口径的旧标题是 ` +
          `「${sw.citeTitle}」，那一条由论文页单独说明，不该出现在这里。）`
      );
    }
  }

  /* ---------- AP4-b：散文里那条链接的描述 ---------- */
  if (url) {
    /* 散文限定在 .about-prose 块内：Selected output 段的 <li> 里也有一条
       指向同一条记录的链接（在产物里是同一串 href），不圈定范围会数出两条。 */
    const proseMatch = aboutHtml.match(
      /<div class="about-prose prose">([\s\S]*?)<\/div>/
    );
    if (!proseMatch) {
      note("about/index.html：找不到 .about-prose 正文块 —— 散文里的描述没有判断对象。");
    } else {
      const prose = proseMatch[1];
      const liRe = /<li>([\s\S]*?)<\/li>/g;
      const hits = [...prose.matchAll(liRe)]
        .map((m) => m[1])
        .filter((li) => li.includes(`href="${url}"`));
      if (hits.length !== 1) {
        note(
          `about/index.html：散文里指向该数据集的列表项有 ${hits.length} 个（应为 1 个）—— ` +
            `散文里那条描述定位不到（或重复了）。`
        );
      } else {
        const li = hits[0];
        const linkAt = li.indexOf(`href="${url}"`);
        /* 切到链接**标签起点**（不是 href 的位置）：否则上一截里会留下
           一个孤零零的 "<a"，读起来像页面上真有个字面量。 */
        const aStart = li.lastIndexOf("<a", linkAt);
        const before = stripTags(li.slice(0, aStart >= 0 ? aStart : linkAt));
        compared++;
        if (!typeWord || !before.toLowerCase().includes(typeWord.toLowerCase())) {
          note(
            `about/index.html：散文里介绍这条记录的句子是「${before}」，` +
              `没有按登记类型（${typeWord}）称呼它 —— ` +
              `读者会以为 Zenodo 上那条是别的东西。`
          );
        }
        for (const bad of ["tool", "code", "software"]) {
          if (bad === typeWord.toLowerCase()) continue;
          compared++;
          if (new RegExp(`\\b${bad}\\b`, "i").test(before)) {
            note(
              `about/index.html：散文里把这条记录说成「${bad}」（原文：${before}），` +
                `而登记事实是「${typeWord}」—— 与登记事实不符的称呼。`
            );
          }
        }
      }
    }
  }
}

/* ---------- AP1-c：论文页的术语也要一致（跨页同一件事） ---------- */
if (paperHtml && url) {
  const dtRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g;
  const rows = [...paperHtml.matchAll(dtRe)].filter((m) => m[2].includes(`href="${url}"`));
  if (rows.length !== 1) {
    note(
      `${paperRel}：找不到"术语 + 指向该数据集链接"的 <dt>/<dd> 组合` +
        `（找到 ${rows.length} 个）—— 论文页的类型术语核对不到。`
    );
  } else {
    const paperTerm = stripTags(rows[0][1]);
    compared++;
    if (paperTerm !== typeWord) {
      note(
        `${paperRel}：论文页把这条记录标成「${paperTerm}」，` +
          `而登记事实是「${typeWord}」—— about 页与论文页说的不是同一件事。`
      );
    }
  }
}

/* ---------- AP2-c：author 级的三个字段必须与记录同源 ---------- */
compared++;
if (author.zenodo !== url) {
  note(
    `src/_data/site.js：author.zenodo = ${author.zenodo || "（空）"}，` +
      `与该记录的地址 ${url} 不相等 —— 首页与 about 页的入口会指向两个地方。`
  );
}
compared++;
if (author.zenodoDoi !== doi) {
  note(
    `src/_data/site.js：author.zenodoDoi = ${author.zenodoDoi || "（空）"}，` +
      `与该记录的 DOI ${doi} 不相等。`
  );
}
compared++;
if (author.zenodoType !== typeWord) {
  note(
    `src/_data/site.js：author.zenodoType = ${author.zenodoType || "（空）"}，` +
      `与登记类型 ${typeWord} 不相等。`
  );
}

/* ---------- AP4-a：散文源文件不得写死这条记录的地址 ---------- */
const aboutMd = readIf(ABOUT_MD_PATH);
if (aboutMd === null) {
  note(`读不到 ${ABOUT_MD_PATH} —— 散文里的地址是否写死没有判断对象，直接判红。`);
} else {
  /* 注释先剥掉：注释里提地址是文档，不是数据（与身份派生门禁同一个口子的道理） */
  const mdBody = aboutMd.replace(/<!--[\s\S]*?-->/g, "");
  compared++;
  const hardcoded = mdBody.match(/10\.5281\/zenodo\.[0-9]+/g);
  if (hardcoded) {
    note(
      `src/content/about.md：正文里写死了 Zenodo 记录的地址（${hardcoded.join("、")}）—— ` +
        `那会变成**第二份副本**，改一处忘另一处 ⇒ 页面说的与真源漂移。` +
        `请改用构建期占位符（见 eleventy.config.js 的 ABOUT_PLACEHOLDERS）。`
    );
  }
}

/* ---------- AP5：门禁自己没被卸掉 + 覆盖度自证 ---------- */
if (!fs.existsSync(PKG)) {
  note("找不到 package.json，无法确认本门禁是否接在 build 上。");
} else {
  const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  const build = (pkg.scripts && pkg.scripts.build) || "";
  const wired =
    build.includes("check:about-dataset") &&
    (pkg.scripts["check:about-dataset"] || "").includes("check-about-dataset.cjs");
  if (!wired) {
    note(
      "门禁自己被卸掉了：package.json 的 build 链里没有 check:about-dataset，" +
        "或 check:about-dataset 没有指向 scripts/check-about-dataset.cjs。"
    );
  }
}
if (compared < 8) {
  note(
    `本门禁只比了 ${compared} 处（下限 8）—— 判据可能已经失效` +
      `（"没报错"和"没问题"长得一模一样）。`
  );
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("about 页产出物描述门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `about 页产出物描述门禁通过：Zenodo 记录（${doi}）的类型「${typeWord}」、` +
    `登记标题、可见 DOI 与地址在 about 页 Contact 行、Selected output 段、` +
    `散文列表项、论文页术语四处**一致**，且散文里没有写死地址；` +
    `共比对 ${compared} 处。`
);
