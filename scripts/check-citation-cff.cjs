#!/usr/bin/env node
/**
 * 仓库引用元数据门禁 —— 守住"这个仓库本身怎么被引"这件事。
 *
 * 为什么要有这个门禁：
 *   本站已经有**四种**"论文怎么被引"的出口（/publications.bib、/publications.ris、
 *   论文页的 citation_* meta、JSON-LD 的 ScholarlyArticle），它们回答的都是
 *   「**那篇论文**怎么被引」。但没有一份文件回答「**这个仓库/这个主页**怎么被引」——
 *   也就是 CFF（Citation File Format 1.2.0）负责的那件事。
 *
 *   CFF 的实际作用有两条，都是本站自己用得上的：
 *     ① GitHub 在仓库首页渲染 "Cite this repository" 按钮，内容就是仓库根目录
 *        的 CITATION.cff —— 读者不必自己拼引用格式；
 *     ② Zotero / JabRef / cffconvert 等引用管理器直接消费它。
 *   学术仓库托管手册（ANC handbook）也是这个口径：**dataset 仓要带 CITATION.cff，
 *   并用 preferred-citation 指向关联的期刊论文**。
 *
 *   ⚠️ 为什么**不由人手写** CITATION.cff，而要**从 src/_data/site.js 生成**：
 *   手写就等于建了第二份事实副本。身份句柄那次事故的形状是
 *   "同一事实的两份副本，其中一份没人看守"——这里如果手写，
 *   改 site.js 里的论文 DOI / 作者名 / 关键词之后，CITATION.cff 会**静默过期**，
 *   而且没有任何门禁会叫。所以本门禁采取"**生成 + 逐字节核对**"：
 *   CITATION.cff 必须是 site.js 派生出来的**那一份**，差一个字节就判红。
 *
 *   **生成**零依赖：生成器只拼字符串，不需要 YAML 解析器（**生成**这一步不新增依赖）。
 *   代价是"生成器写错"就一起错——所以生成器的每一步都取自 site.js 的具名字段，
 *   不在生成器里写字面量事实，并且下面 CF2–CF8 会拿**独立来源**
 *   （package.json / LICENSE / 今天 / 官方 CFF schema）再核一遍。
 *   ⚠️ **判据**侧（CF7 / CF8）需要真正的 YAML 解析器 js-yaml —— 它是 Eleventy 的
 *   传递依赖，本仓 package.json 未单列（见待拍板 21）。**require 失败一律判红**，
 *   不静默跳过：跳过 = 这两条判据永远绿 = 盲区被包装成"已核过"。
 *
 * 八条判据：
 *   CF1 存在且逐字节一致 —— CITATION.cff 必须存在，且与"从 site.js 生成的版本"
 *          **一字不差**。不一致 = 事实副本漂了（改过 site.js 却没重新生成，
 *          或有人手改了 CITATION.cff）。红因给出第一处不同的行号与两侧原文。
 *   CF2 必需字段齐全 —— CFF 1.2.0 的顶层必需字段（cff-version / message /
 *          authors / title / version / date-released / license）以及本仓要用的
 *          url / repository-code / abstract / keywords / preferred-citation
 *          必须都在**磁盘上那份文件**里（对产物判，不对生成器判）。
 *   CF3 cff-version 必须是 1.2.0 —— 版本号写错，GitHub 的解析器会按旧版语义读。
 *   CF4 license 必须与 LICENSE 文件实际授予的一致 —— 站点源码是 Apache-2.0
 *          （README 里"内容另用 CC"指的是博客正文与批注，不是源码）。
 *   CF5 date-released 必须是合法的 YYYY-MM-DD，且**不在未来** ——
 *          一个未来的"发布日期"是编出来的。
 *   CF6 顶层**不得**有 doi 字段 —— 本仓（站点源码仓）**没有**自己的 DOI。
 *          论文的 DOI 在 preferred-citation 里；数据集 / 胶囊的 DOI 在论文页与
 *          /publications.bib 里。把它们中的任何一个抄到顶层"这个仓的 DOI"上，
 *          就是**冒领别人的 DOI**——CFF 最常见的翻车方式，本门禁提前堵住。
 *   CF7 **真解析** —— 前六条全部建立在逐行正则之上，正则看不见"这个文件根本
 *          不是合法 YAML"和"同一个键写了两遍"。CF7 用真正的 YAML 解析器
 *          （js-yaml）把文件解出来：解不出来就判红；解出来的顶层键必须全部
 *          在官方 schema 允许的字段里（schema 的顶层是 additionalProperties:
 *          false）；且必须与正则数出来的键**完全一致**（不一致说明"文本上看起来
 *          是顶层键"的那几行其实不是，或反过来）。
 *   CF8 **规范级值核对** —— 按**官方 CFF 1.2.0 JSON schema**（$id =
 *          https://citation-file-format.github.io/1.2.0/schema.json）逐条核对
 *          值：顶层 required 四项、type 取值域、date / doi / orcid 的正则、
 *          keywords 的非空且不重复、preferred-citation 的 required 与 type 取值域。
 *
 * ⚠️ 为什么**没有**"version 必须等于 package.json 的 version"这一条：
 *   生成器**直接读 package.json 的 version** 写进 CFF，所以两者天然一致，
 *   另立一条判据去比它，等于把同一份事实抄两遍再自己比——那种判据**永远红不了**
 *   （改了 CFF 会先被 CF1 抓住；改了生成器，判据和被测对象一起变，绿）。
 *   单一真源 + 逐字节核对，已经把这条覆盖掉了。
 *
 * ⚠️ 能**独立于 CF1 单独变红**的是 CF2–CF6：
 *   它们比的是"生成器 + package.json + LICENSE + 今天"这些 site.js 之外的来源，
 *   所以"改了生成器并重新生成"骗不过它们（CF1 此时是绿的）。
 *   CF1 负责"文件没漂"，CF2–CF6 负责"漂到的那一份本身合不合规"；
 *   CF7 / CF8 负责"漂到的那一份**本身是不是一个能解析的、规范的 CFF 文件**"。
 *
 * 能力边界（写在这里，不只写在日志里）：
 *   本门禁只保证"**仓库根目录这一份 CITATION.cff 与 site.js 一致**"。
 *   它**不**保证：① GitHub 的 CFF 解析器接受本文件的每一个字段
 *   （本门禁不联网、不跑 cffconvert，只按 CFF 1.2.0 的字段口径自检）；
 *   ② 官方 schema 把 license 定义成一份 ~200 项的 SPDX 枚举，**本门禁不抄它**
 *   （体积不值），改由 CF4 的"LICENSE 文件交叉核对"守住实际协议 ——
 *   "写了一个 SPDX 合法但本仓没给过的协议"这一形态目前无人看守；
 *   ③ 论文 DOI / 刊名 / 卷期在 Crossref 侧仍然成立（那是另一条真源，
 *   需联网核对）；④ 站点构建产物里有 CITATION.cff（**故意没有**——
 *   本文件是给 GitHub 与引用管理器读的，复制进 _site/ 只会多出第二份副本）。
 *
 * 用法：
 *   node scripts/check-citation-cff.cjs            判据（build 链上跑）
 *   node scripts/check-citation-cff.cjs --write    按 site.js 重新生成 CITATION.cff
 *   CFF_PATH=<别的文件> node scripts/check-citation-cff.cjs
 *                                                    把门禁指向另一份文件（注入矩阵用；
 *                                                    仓库里真的那份一个字节都不会被碰到）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
/* 自测开关：把门禁指向**另一份** CITATION.cff（注入矩阵用，见 scripts/test-citation-cff.cjs）。
   ⚠️ 这是一个**能被绕过**的开关——设了这个环境变量，门禁就会去查别处。
   仓库里的 README 门禁用的是同一个模式（README_PATH），此处保持一致；
   代价是"自测必须在副本上做"这件事，从"约定"变成"只能这样"。
   正常构建链上没有任何地方设它。 */
const CFF_PATH = process.env.CFF_PATH
  ? path.resolve(process.env.CFF_PATH)
  : path.join(ROOT, "CITATION.cff");
const SITE_PATH = path.join(ROOT, "src", "_data", "site.js");
const PKG_PATH = path.join(ROOT, "package.json");
const LICENSE_PATH = path.join(ROOT, "LICENSE");

/* CFF 规范版本。本仓按 1.2.0 写。 */
const CFF_VERSION = "1.2.0";

/* date-released = 本仓库首个提交日（git log --reverse --format=%as | head -1
   实测为 2026-01-08）。**写死在这里**而不是每次现算：现算会在浅克隆里
   算出边界提交的日子，门禁随之误报——"判据因为环境变了而变红"是坏味道。
   首提交日是常量，写死即真值。 */
const DATE_RELEASED = "2026-01-08";

/* 本仓源码许可证的 SPDX 标识。与 LICENSE 文件（Apache License 2.0 全文）对应，
   由 CF5 反向核对：CFF 里写别的 SPDX id、而 LICENSE 不是那个协议 → 判红。 */
const SPDX_LICENSE = "Apache-2.0";

/* SPDX id → LICENSE 全文里必须出现的字样（用来核对"声明的协议"与
   "实际给的协议"是不是同一个）。取自 Apache-2.0 官方文本的抬头。 */
const LICENSE_PROOF = {
  "Apache-2.0": ["Apache License", "Version 2.0"],
};

/* CFF 1.2.0 的顶层必需字段 + 本仓额外用到的字段。 */
const REQUIRED_KEYS = [
  "cff-version",
  "message",
  "title",
  "type",
  "authors",
  "version",
  "date-released",
  "license",
  "abstract",
  "keywords",
  "url",
  "repository-code",
  "preferred-citation",
];

const problems = [];
const fail = (m) => problems.push(m);
const short = (s) => (s || "?").slice(0, 7);

/* ---------- 读真源 ---------- */
let site, pkg;
try {
  site = require(SITE_PATH);
} catch (e) {
  console.error("仓库引用元数据门禁未通过：\n");
  console.error(`  ✗ 读不到 ${path.relative(ROOT, SITE_PATH)}：${e.message}`);
  console.error("    读不到真源就没法派生 CITATION.cff，此时不能假装通过。\n");
  process.exit(1);
}
try {
  pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
} catch (e) {
  console.error("仓库引用元数据门禁未通过：\n");
  console.error(`  ✗ 读不到 package.json：${e.message}\n`);
  process.exit(1);
}

/* ---------- 把任意字符串安全地写成 YAML 双引号标量 ---------- */
function q(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * 从 site.js 生成 CITATION.cff 的完整文本。
 *
 * ⚠️ 这里**不写字面量事实**（论文标题、DOI、作者、ORCID、关键词、许可证…），
 * 全部取自 site.js / package.json。生成器里出现的字面量只有两处：
 *   · 规范与元数据口径本身（CFF_VERSION / DATE_RELEASED / SPDX_LICENSE）；
 *   · 英文句式模板（message、title 的连接词）。
 * 事实漂移的唯一入口是 site.js —— 这正是本门禁要守的那件事。
 */
function buildCitationCff(siteData, version) {
  const a = siteData.author;
  const p = siteData.publications[0];
  const L = [];
  L.push(`cff-version: ${CFF_VERSION}`);
  L.push(
    `message: ${q(
      "If you use this academic homepage, its source code, or the research it documents, " +
        "please cite the preferred citation below."
    )}`
  );
  L.push(`title: ${q(`${siteData.shortTitle} — academic homepage of ${a.name}`)}`);
  L.push(`type: software`);
  L.push(`authors:`);
  L.push(`  - family-names: ${q(a.familyName)}`);
  L.push(`    given-names: ${q(a.givenName)}`);
  L.push(`    orcid: ${q(a.orcid)}`);
  L.push(`    affiliation: ${q(a.affiliationEn)}`);
  L.push(`    email: ${q(a.email)}`);
  L.push(`version: ${q(version)}`);
  L.push(`date-released: ${q(DATE_RELEASED)}`);
  L.push(`url: ${q(siteData.url)}`);
  L.push(`repository-code: ${q(a.repo)}`);
  L.push(`license: ${q(SPDX_LICENSE)}`);
  L.push(`keywords:`);
  for (const k of a.knowsAbout) L.push(`  - ${q(k)}`);
  L.push(`abstract: ${q(siteData.description)}`);
  L.push(`preferred-citation:`);
  L.push(`  type: article`);
  L.push(`  authors:`);
  for (const au of p.authorList) {
    L.push(`    - family-names: ${q(au.family)}`);
    L.push(`      given-names: ${q(au.given)}`);
    if (au.orcid) L.push(`      orcid: ${q(`https://orcid.org/${au.orcid}`)}`);
    // 论文作者的所属单位：site.js 只登记了本人在这篇论文上的单位。
    // 没有登记的不写——不按姓名猜单位。
    if (au.given === a.givenName && au.family === a.familyName && p.affiliation) {
      L.push(`      affiliation: ${q(p.affiliation)}`);
    }
  }
  L.push(`  title: ${q(p.title)}`);
  L.push(`  journal: ${q(p.journal)}`);
  L.push(`  volume: ${Number(p.volume)}`);
  L.push(`  start: ${q(p.articleNumber)}`);
  L.push(`  month: ${Number(p.month)}`);
  L.push(`  year: ${Number(p.year)}`);
  L.push(`  doi: ${q(p.doi)}`);
  return L.join("\n") + "\n";
}

const expected = buildCitationCff(site, pkg.version || "");

/* ---------- --write：按 site.js 重新生成 ---------- */
if (process.argv.includes("--write")) {
  fs.writeFileSync(CFF_PATH, expected, "utf8");
  console.log(
    `已按 ${path.relative(ROOT, SITE_PATH)} 重新生成 ${path.relative(ROOT, CFF_PATH)}` +
      `（${expected.split("\n").length - 1} 行）。`
  );
  process.exit(0);
}

/* ---------- CF1：存在 + 逐字节一致 ---------- */
if (!fs.existsSync(CFF_PATH)) {
  fail(
    `仓库根目录没有 CITATION.cff —— GitHub 的 "Cite this repository" 按钮、` +
      `Zotero 等引用管理器都靠这个文件。生成方式：npm run gen:citation-cff`
  );
} else {
  const actual = fs.readFileSync(CFF_PATH, "utf8");
  if (actual.trim() === "") {
    fail("CITATION.cff 是空文件 —— 空的元数据等于没有元数据。");
  } else if (actual !== expected) {
    const aLines = actual.split("\n");
    const eLines = expected.split("\n");
    let n = 0;
    while (n < aLines.length && n < eLines.length && aLines[n] === eLines[n]) n++;
    const at = n < aLines.length ? aLines[n] : "（文件到此结束）";
    const et = n < eLines.length ? eLines[n] : "（生成结果到此结束）";
    fail(
      `CITATION.cff 与 ${path.relative(ROOT, SITE_PATH)} 派生的版本不一致 —— ` +
        `第 ${n + 1} 行开始不同。\n` +
        `      磁盘上：${at}\n` +
        `      应为：  ${et}\n` +
        `    事实改了却没重新生成，仓库的引用元数据就静默过期了。` +
        `修法：npm run gen:citation-cff（会按 site.js 重写这个文件）`
    );
  }
}

/* ---------- CF2–CF6：对磁盘上那份文件判（不只对生成器判） ---------- */
const onDisk = fs.existsSync(CFF_PATH) ? fs.readFileSync(CFF_PATH, "utf8") : "";

/* 顶层键：只看行首无缩进的 `key:` —— 缩进的是列表项或子键。 */
const topKeys = new Set();
for (const line of onDisk.split("\n")) {
  const m = /^([A-Za-z0-9][A-Za-z0-9-]*):/.exec(line);
  if (m) topKeys.add(m[1]);
}
for (const k of REQUIRED_KEYS) {
  if (!topKeys.has(k)) {
    fail(`CITATION.cff 少了顶层字段 \`${k}\` —— CFF 1.2.0 / 本仓用法都要求它。`);
  }
}

/* CF3：cff-version */
const verMatch = /^cff-version:\s*(.+)$/m.exec(onDisk);
if (verMatch && verMatch[1].trim().replace(/^"|"$/g, "") !== CFF_VERSION) {
  fail(
    `CITATION.cff 的 cff-version 是 ${verMatch[1].trim()}，应为 ${CFF_VERSION} —— ` +
      `版本号写错，GitHub 会按旧版语义解析这个文件。`
  );
}

/* CF4：license 必须与 LICENSE 文件实际授予的一致 */
const licMatch = /^license:\s*(.+)$/m.exec(onDisk);
if (licMatch) {
  const onDiskLicense = licMatch[1].trim().replace(/^"|"$/g, "");
  if (!fs.existsSync(LICENSE_PATH)) {
    fail("仓库根目录没有 LICENSE 文件 —— CFF 声明了许可证却没有许可证可指。");
  } else {
    const licText = fs.readFileSync(LICENSE_PATH, "utf8");
    const proof = LICENSE_PROOF[onDiskLicense];
    if (!proof) {
      fail(
        `CITATION.cff 声明的许可证 ${onDiskLicense} 不在本门禁认识的 SPDX 清单里 —— ` +
          `要么改对，要么在本文件里补上它的核对字样。`
      );
    } else {
      for (const phrase of proof) {
        if (!licText.includes(phrase)) {
          fail(
            `CITATION.cff 声明许可证 ${onDiskLicense}，但 LICENSE 文件里找不到 ${q(phrase)} —— ` +
              `声明的协议和实际给的协议不是同一个。`
          );
        }
      }
    }
  }
}

/* CF5：date-released 合法且不在未来 */
const dMatch = /^date-released:\s*(.+)$/m.exec(onDisk);
if (dMatch) {
  const raw = dMatch[1].trim().replace(/^"|"$/g, "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    fail(`CITATION.cff 的 date-released 是 ${raw}，应为 YYYY-MM-DD。`);
  } else {
    const t = Date.parse(`${raw}T00:00:00Z`);
    if (Number.isNaN(t)) {
      fail(`CITATION.cff 的 date-released ${raw} 不是一个真实存在的日期。`);
    } else if (t > Date.now()) {
      fail(
        `CITATION.cff 的 date-released 是 ${raw}，在未来 —— ` +
          `发布日期不能是编出来的。`
      );
    }
  }
}

/* CF6：顶层不得有 doi —— 本仓没有自己的 DOI，冒领别人的 DOI 是 CFF 最常见的翻车方式 */
if (topKeys.has("doi")) {
  fail(
    `CITATION.cff 顶层有 doi 字段 —— 本仓（站点源码仓）**没有**自己的 DOI，` +
      `顶层的 doi 只能是冒领别人的。论文的 DOI 在 preferred-citation 里；` +
      `数据集 / 胶囊的 DOI 在论文页与 /publications.bib 里。若本仓将来真的归档并` +
      `拿到自己的 DOI，再把这条判据改成"必须等于那个 DOI"。`
  );
}

/* =============================================================================
 * CF7 / CF8：真解析 + 规范级值核对
 *
 * 前六条全部建立在**逐行正则**之上。正则有三个它自己看不见的盲区：
 *   ① 这个文件根本不是合法 YAML（正则照样数得出"字段齐备"）；
 *   ② 同一个键写了两遍（正则数出来还是"有那个键"）；
 *   ③ 键的写法不是"行首 key:"（正则认出的"顶层键"是假的）。
 * CF7 用**真正的 YAML 解析器**（js-yaml）解出文件，再把"解出来的"与
 * "正则数出来的"对账；CF8 按**官方 CFF 1.2.0 JSON schema** 逐条核对值。
 * ============================================================================= */

/* 官方 CFF 1.2.0 JSON schema 的相关子集，**逐条抄录**（不是自己编一套口径）。
   出处：https://raw.githubusercontent.com/citation-file-format/citation-file-format/main/schema.json
   该文件 $id = https://citation-file-format.github.io/1.2.0/schema.json（自证就是 1.2.0）
   抄录时官方全文 sha256 = 17bc7993c67b95eec988dadca78b65cb29cd489d1fceba71040a141dfb9791df
   ⚠️ 改 cff-version 时**必须**回官方 schema 重抄下面这组常量，并换掉上面那行 sha256。
   ⚠️ 本门禁**不联网**、不跑 cffconvert：规范口径是抄在代码里的常量；
      谁改了常量、没同步官方，git log 里有痕迹。 */
const CFF_SCHEMA = {
  /* schema.required —— 顶层必需字段 */
  topRequired: ["authors", "cff-version", "message", "title"],
  /* schema.properties.type.enum —— 顶层 type 的取值域 */
  topType: ["dataset", "software"],
  /* schema.properties 的键 —— 顶层允许的全部字段
     （schema.additionalProperties = false，多出来即非法） */
  topProperties: [
    "abstract", "authors", "cff-version", "commit", "contact", "date-released",
    "doi", "identifiers", "keywords", "license", "license-url", "message",
    "preferred-citation", "references", "repository", "repository-artifact",
    "repository-code", "title", "type", "url", "version",
  ],
  /* schema.definitions.reference.required */
  referenceRequired: ["authors", "title", "type"],
  /* schema.definitions.reference.properties.type.enum */
  referenceType: [
    "art", "article", "audiovisual", "bill", "blog", "book", "catalogue",
    "conference-paper", "conference", "data", "database", "dictionary",
    "edited-work", "encyclopedia", "film-broadcast", "generic",
    "government-document", "grant", "hearing", "historical-work", "legal-case",
    "legal-rule", "magazine-article", "manual", "map", "multimedia", "music",
    "newspaper-article", "pamphlet", "patent", "personal-communication",
    "proceedings", "report", "serial", "slides", "software-code",
    "software-container", "software-executable", "software-virtual-machine",
    "software", "sound-recording", "standard", "statute", "thesis",
    "unpublished", "video", "website",
  ],
  /* schema.definitions.reference.properties 的键
     （reference.additionalProperties = false） */
  referenceProperties: [
    "abbreviation", "abstract", "authors", "collection-doi", "collection-title",
    "collection-type", "commit", "conference", "contact", "copyright",
    "data-type", "database", "database-provider", "date-accessed",
    "date-downloaded", "date-published", "date-released", "department", "doi",
    "edition", "editors", "editors-series", "end", "entry", "filename", "format",
    "identifiers", "institution", "isbn", "issn", "issue", "issue-date",
    "issue-title", "journal", "keywords", "languages", "license", "license-url",
    "loc-end", "loc-start", "location", "medium", "month", "nihmsid", "notes",
    "number", "number-volumes", "pages", "patent-states", "pmcid", "publisher",
    "recipients", "repository", "repository-artifact", "repository-code",
    "scope", "section", "senders", "start", "status", "term", "thesis-type",
    "title", "translators", "type", "url", "version", "volume", "volume-title",
    "year", "year-original",
  ],
  /* schema.definitions.person.properties 的键（person.additionalProperties = false） */
  personProperties: [
    "address", "affiliation", "alias", "city", "country", "email", "family-names",
    "fax", "given-names", "name-particle", "name-suffix", "orcid", "post-code",
    "region", "tel", "website",
  ],
  /* schema.definitions.entity.properties 的键（entity.additionalProperties = false） */
  entityProperties: [
    "address", "alias", "city", "country", "date-end", "date-start", "email",
    "fax", "location", "name", "orcid", "post-code", "region", "tel", "website",
  ],
  /* schema.definitions.date.pattern */
  dateRe: /^[0-9]{4}-(0[1-9]|1[012])-(0[1-9]|[12][0-9]|3[01])$/,
  /* schema.definitions.doi.pattern */
  doiRe: /^10\.\d{4,9}(\.\d+)?\/[A-Za-z0-9:/_;\-.\(\)\[\]\\]+$/,
  /* schema.definitions.orcid.pattern */
  orcidRe: /^https:\/\/orcid\.org\/[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]{1}$/,
};

/* js-yaml：Eleventy 的**传递依赖**，本仓 package.json 未单列（见待拍板 21）。
   require 失败 → 判红，不跳过。 */
let yaml = null;
try {
  yaml = require("js-yaml");
} catch (e) {
  fail(
    `CF7 / CF8 需要真正的 YAML 解析器，但 require("js-yaml") 失败：${e.message}\n` +
      `    js-yaml 目前是 Eleventy 的**传递依赖**（本仓 package.json 未单列，见待拍板 21）。\n` +
      `    这里**故意判红而不是跳过**：跳过 = 这两条判据永远绿 = 盲区被包装成"已核过"。`
  );
}

/* 官方 schema 的 date 定义带一句 $comment：YAML 解析器可能把 2026-01-08 解成
   日期**对象**，实现者必须先转成字符串再按 schema 校验。本门禁照做。 */
function asText(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return typeof v === "string" ? v : String(v);
}

let doc;
let parsed = false;
if (yaml) {
  try {
    doc = yaml.load(onDisk);
    parsed = true;
  } catch (e) {
    const msg = String((e && e.message) || e).split("\n")[0];
    if (/duplicated mapping key/i.test(msg)) {
      fail(
        `CITATION.cff 里**同一个键写了两遍**（${msg}）—— 真正的 YAML 解析器会直接拒绝这种文件。\n` +
          `    前六条判据都是逐行正则，看不出"同一个键出现了两次"；\n` +
          `    而 GitHub / cffconvert 看到的是一份**坏文件**。`
      );
    } else {
      fail(
        `CITATION.cff **不是合法的 YAML**（${msg}）—— 前六条判据是逐行正则，\n` +
          `    一份解析器都读不了的文件，在正则眼里"字段齐备、格式正确"。`
      );
    }
  }
}

/* ---------- CF7：真解析 + 与正则数出来的顶层键对账 ---------- */
if (parsed) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    fail("CITATION.cff 解析出来不是一个键值映射 —— CFF 顶层必须是 `字段名: 值` 的映射。");
  } else {
    const parsedKeys = Object.keys(doc);
    const allowedTop = new Set(CFF_SCHEMA.topProperties);
    for (const k of parsedKeys) {
      if (!allowedTop.has(k)) {
        fail(
          `CITATION.cff 顶层有字段 \`${k}\`，官方 CFF 1.2.0 schema 的顶层字段表里没有它 ——\n` +
            `    官方 schema 顶层是 additionalProperties: false，多出来的字段只能被当"未知字段"忽略。`
        );
      }
    }
    /* 解析器认出的顶层键 与 逐行正则认出的顶层键，必须完全一致（两个方向都查） */
    for (const k of parsedKeys) {
      if (!topKeys.has(k)) {
        fail(
          `CITATION.cff 的顶层键 \`${k}\` **真正的 YAML 解析器认得**、本门禁的逐行正则却认不出 ——\n` +
            `    那几行的写法不是"行首 key:"（例如键被引号包起来了），\n` +
            `    于是"字段齐备"这件事在正则眼里和在解析器眼里对不上。`
        );
      }
    }
    for (const k of topKeys) {
      if (!parsedKeys.includes(k)) {
        fail(
          `CITATION.cff 的 \`${k}\` 被逐行正则当成了顶层键，但**真正的 YAML 解析器没认** ——\n` +
            `    那一行其实不是顶层键（多半是某个块里的内容被正则扫到了）。`
        );
      }
    }
  }
}

/* ---------- CF8：按官方 CFF 1.2.0 schema 逐条核对值 ---------- */
if (parsed && doc && typeof doc === "object" && !Array.isArray(doc)) {
  /* C8.1 顶层 required 四项 */
  for (const k of CFF_SCHEMA.topRequired) {
    if (!(k in doc)) {
      fail(
        `CITATION.cff 缺顶层必需字段 \`${k}\` —— 官方 schema 的顶层 required 是 ` +
          `${CFF_SCHEMA.topRequired.join(" / ")}。`
      );
    }
  }

  /* C8.2 顶层 type 的取值域 */
  if (doc.type !== undefined && !CFF_SCHEMA.topType.includes(doc.type)) {
    fail(
      `CITATION.cff 顶层 type 是 ${JSON.stringify(doc.type)}，官方 schema 只允许 ` +
        `${CFF_SCHEMA.topType.join(" / ")} ——\n` +
        `    "article" 是 **reference** 的 type，不是顶层 type；顶层这个仓的类型就是 software/dataset。`
    );
  }

  /* C8.3 日期 —— 官方 date 的 pattern（比"看着像日期"严：月份 01–12、日期 01–31） */
  const DATE_FIELDS = [
    "date-released", "date-published", "date-accessed", "date-downloaded",
    "issue-date", "date-start", "date-end",
  ];
  const checkDate = (value, where) => {
    const s = asText(value);
    if (!CFF_SCHEMA.dateRe.test(s)) {
      fail(
        `CITATION.cff 的 ${where} 是 ${JSON.stringify(s)}，不符合官方 schema 的 date 格式` +
          `（YYYY-MM-DD，月份 01–12、日期 01–31）。`
      );
    }
  };

  /* C8.4 DOI —— 官方要裸 DOI，不是解析器 URL */
  const checkDoi = (value, where) => {
    const s = asText(value);
    if (!CFF_SCHEMA.doiRe.test(s)) {
      fail(
        `CITATION.cff 的 ${where} 是 ${JSON.stringify(s)}，不符合官方 schema 的 doi 格式 ——\n` +
          `    官方要的是**裸 DOI**（10.xxxx/yyy），不是 https://doi.org/10.xxxx/yyy 这样的解析器 URL。`
      );
    }
  };

  /* C8.5 / C8.8 author 列表：ORCID 格式 + person/entity 的字段集 */
  const checkAuthors = (authors, where) => {
    if (authors === undefined) return;
    if (!Array.isArray(authors)) {
      fail(`CITATION.cff 的 ${where} 不是数组 —— 官方 schema 要求 author 是一个列表。`);
      return;
    }
    authors.forEach((a, i) => {
      if (!a || typeof a !== "object" || Array.isArray(a)) {
        fail(`CITATION.cff 的 ${where}[${i}] 不是一个人/机构对象。`);
        return;
      }
      /* 官方 schema 里 author 元素是 person 或 entity（anyOf），两者字段集不同 */
      const isEntity = typeof a.name === "string";
      const kind = isEntity ? "entity" : "person";
      const allowed = new Set(
        isEntity ? CFF_SCHEMA.entityProperties : CFF_SCHEMA.personProperties
      );
      for (const k of Object.keys(a)) {
        if (!allowed.has(k)) {
          fail(
            `CITATION.cff 的 ${where}[${i}] 有字段 \`${k}\`，官方 schema 的 ${kind} 字段表里没有它 ——\n` +
              `    （${kind}.additionalProperties = false）`
          );
        }
      }
      if (a.orcid !== undefined) {
        const s = asText(a.orcid);
        if (!CFF_SCHEMA.orcidRe.test(s)) {
          fail(
            `CITATION.cff 的 ${where}[${i}].orcid 是 ${JSON.stringify(s)}，不符合官方 schema 的 orcid 格式 ——\n` +
              `    官方要的是完整 URL：https://orcid.org/XXXX-XXXX-XXXX-XXX`
          );
        }
      }
    });
  };

  if (doc["date-released"] !== undefined) checkDate(doc["date-released"], "顶层 date-released");
  if (doc.doi !== undefined) checkDoi(doc.doi, "顶层 doi");
  checkAuthors(doc.authors, "顶层 authors");

  /* C8.6 keywords：非空 + 不重复 */
  if (doc.keywords !== undefined) {
    if (!Array.isArray(doc.keywords)) {
      fail("CITATION.cff 顶层 keywords 不是数组。");
    } else {
      if (doc.keywords.length < 1) {
        fail("CITATION.cff 顶层 keywords 是空的 —— 官方 schema 要求 minItems: 1。");
      }
      if (new Set(doc.keywords.map((k) => String(k))).size !== doc.keywords.length) {
        fail("CITATION.cff 顶层 keywords 里有重复项 —— 官方 schema 要求 uniqueItems: true。");
      }
    }
  }

  /* C8.7 reference：preferred-citation 与 references 的元素 */
  const refAllowed = new Set(CFF_SCHEMA.referenceProperties);
  const refs = [];
  if (Array.isArray(doc.references)) {
    doc.references.forEach((r, i) => refs.push([r, `references[${i}]`]));
  } else if (doc.references !== undefined) {
    fail("CITATION.cff 顶层 references 不是数组。");
  }
  if (doc["preferred-citation"] !== undefined) {
    refs.push([doc["preferred-citation"], "preferred-citation"]);
  }

  for (const [r, where] of refs) {
    if (!r || typeof r !== "object" || Array.isArray(r)) {
      fail(`CITATION.cff 的 ${where} 不是对象。`);
      continue;
    }
    for (const k of CFF_SCHEMA.referenceRequired) {
      if (!(k in r)) {
        fail(
          `CITATION.cff 的 ${where} 缺必需字段 \`${k}\` —— 官方 schema 的 reference required 是 ` +
            `${CFF_SCHEMA.referenceRequired.join(" / ")}。`
        );
      }
    }
    if (r.type !== undefined && !CFF_SCHEMA.referenceType.includes(r.type)) {
      fail(
        `CITATION.cff 的 ${where}.type 是 ${JSON.stringify(r.type)}，` +
          `不在官方 schema 的 reference type 取值域里。`
      );
    }
    for (const k of Object.keys(r)) {
      if (!refAllowed.has(k)) {
        fail(
          `CITATION.cff 的 ${where} 有字段 \`${k}\`，官方 schema 的 reference 字段表里没有它 ——\n` +
            `    （reference.additionalProperties = false）`
        );
      }
    }
    for (const f of DATE_FIELDS) {
      if (r[f] !== undefined) checkDate(r[f], `${where}.${f}`);
    }
    if (r.doi !== undefined) checkDoi(r.doi, `${where}.doi`);
    checkAuthors(r.authors, `${where}.authors`);
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("仓库引用元数据门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const nAuthors = (onDisk.match(/^ {4}- family-names:/gm) || []).length;
console.log(
  `仓库引用元数据门禁通过：CITATION.cff 与 ${path.relative(ROOT, SITE_PATH)} 逐字节一致` +
    `（cff-version ${CFF_VERSION}、${REQUIRED_KEYS.length} 个顶层字段齐备、` +
    `version ${pkg.version || "?"}（取自 package.json）、license ${SPDX_LICENSE}、` +
    `date-released ${DATE_RELEASED}、` +
    `preferred-citation 的 ${nAuthors} 位作者；` +
    `并已用真正的 YAML 解析器按官方 CFF ${CFF_VERSION} schema 核对过` +
    `${parsed ? `（顶层 ${Object.keys(doc).length} 个字段、keywords ${doc.keywords.length} 条）` : ""}）。`
);
