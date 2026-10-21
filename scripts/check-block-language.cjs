#!/usr/bin/env node
/**
 * 门禁 BL1–BL6：站内「块级内容」的语言一致性
 *
 * 为什么需要它（2026-10-20 的 D36）：
 *   硬约束是「站内文字一律英文」。这条约束此前在**产物里的块级内容**上是空的：
 *     · scripts/check-lang.cjs 的 strip() 会把产物里的 <script>…</script> 与
 *       <style>…</style> **整块涂白**（连同其中的 JSON-LD 结构化数据）；
 *     · 它的**源码层**对 .njk 模板做同样的事 —— 而本站的 CSS / JS **是字面
 *       内联在模板里的**（src/_includes/layouts/base.njk:83 起内联 CSS，
 *       base.njk:564 起内联 JS，paper.njk:434 / paper.njk:449 /
 *       partials/extreme-precip.njk:126 / about.njk:44 同理），
 *       **不在** src/assets/ 下的 .css / .js 文件里。
 *   ⇒ 于是内联的 CSS / JS 在**源码层与产物层双双失守**：两处都涂白，
 *     没有任何一层去看它。而 JSON-LD 更彻底：它是**构建时现场拼装**的
 *     （模板拼的字符串 + 数据层的字段），源码层连"文件里有没有中文"都无从谈起。
 *
 *   2026-10-20 的实测（改动前）：
 *     · _site/index.html 的 2006 个中日韩字符里，**可见文本部分 0 个**，
 *       其余 2003 个全部落在被涂白的块里 ——
 *       内联 <style> 721 + 1282（CSS 注释）、JSON-LD 3（alternateName）；
 *     · 18 个 ld+json 块全部能 JSON.parse，唯一的中文命中是
 *       Person 节点的 alternateName（7 处，跨 6 个页面）。
 *   也就是说：**这条硬约束在可见层是达成的，在块级层是零覆盖**。
 *   没人守的地方迟早会出事：把 aria-label 覆写成中文、把 content 写成中文、
 *   把 description 写成中文 —— 都不会让构建失败，页面也照出。
 *
 * 本门禁守什么（判据编号 BL*，与 verify-site 的数字编号、check-lang 的 FF*、
 *   check-jsonld 的 J*、check-site-language 的 TX* 都不续接）：
 *   BL1 JSON-LD 必须能解析 —— 块坏了就判红，不静默跳过
 *      （静默跳过会让"块坏了"伪装成"没找到内容"）。
 *   BL2 JSON-LD 的字符串值与键名全英文 —— 逐块 JSON.parse 后递归遍历，
 *      命中有中日韩字符就判红（字段级豁免见 BL3）。
 *   BL3 字段级豁免必须「用得出」 —— 豁免条目被真正用到时记 note 说明用在哪；
 *      一次都没用上（该字段已经英文化）时也只记 note、**不判红**：
 *      那是**好事**，不该让 build 红（这与 TX3 同一形状）。
 *   BL4 内联 <script>（非 ld+json、无 src）里不得有中日韩字符
 *      —— 这是**可执行文本**：document.title、aria-label 覆写都写在这儿。
 *   BL5 内联 <style> 剥掉 CSS 注释后不得有中日韩字符
 *      —— CSS 注释不渲染，剥掉就干净了；同一份 CSS 里若混进中文**值**
 *        （content: "首页"）就永远抓不到 —— 那才是硬缺陷。
 *   BL6 覆盖度自证 —— 扫到的 JSON-LD 块数 / 内联 script 块数 / 内联 style 块数
 *      / 豁免条目数都不得为 0：「没报错」和「没问题」长得一模一样，
 *      判据一旦被卸掉，门禁会一直绿着。
 *
 * 与既有门禁的关系（**刻意不重复**）：
 *   · scripts/check-lang.cjs 管的是**源码层**与产物的**可见文本**；
 *     本门禁管的是**被它涂白的那几块**。两边不重叠。
 *   · scripts/check-jsonld.cjs（J1–J11）管的是结构化数据的**存在性与一致性**
 *     （@id 唯一、归属链接得上、类型不冲突）；本门禁管的是它**字段的语言**。
 *   · scripts/check-site-language.cjs（TX1–TX4）管的是 `_site` 顶层那些
 *     非 HTML 的对外出口（robots.txt / feed.xml / …）；本门禁管的是 HTML 内部。
 *
 * 边界（如实写明）：
 *   · 只判**中日韩字符**，不判别的非 ASCII：站点正文合法地用着 `·`（U+00B7）、
 *     `—`、`°`、`±` 这类排版符号，把它们一并拦掉是假红。
 *   · 不判 JSON-LD 的**键名**是否是合法的 schema.org 术语（那是 check-jsonld
 *     与 verify-site 的活）；BL2 对键名只判语言。
 *   · 豁免清单是**字段级**的（@type + 键名），不是"整个节点豁免"：
 *     整个节点豁免等于给那块开了暗门（那正是 TX3 要抓的形态）。
 *
 * 用法：node scripts/check-block-language.cjs   （有错 exit 1）
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "_site");

/* 中日韩文字 + 全角标点。与 scripts/check-lang.cjs 的 CJK 正则**逐字一致**
   （同一套 Unicode 范围、同一份写法）—— 改一处就得改另一处，
   否则两个门禁的判定会分叉。 */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/* BL6 的覆盖度下限（现值：18 个 ld+json 块 / 8 个内联 script 块 /
   14 个内联 style 块 / 1 条豁免）。低于这些数说明枚举逻辑坏了，
   不是"没问题"。 */
const MIN_LD_BLOCKS = 10;
const MIN_INLINE_SCRIPTS = 3;
const MIN_INLINE_STYLES = 3;
const MIN_EXEMPTIONS = 1;

/**
 * BL3 的字段级豁免清单。
 * 形状：{ type, field, reason } —— 命中条件是「字符串值所在节点的 @type
 * 含有 type，且键名就是 field」。**不是**节点级豁免。
 */
const EXEMPT_FIELDS = [
  {
    type: "Person",
    field: "alternateName",
    reason:
      "schema.org 的 alternateName 正是为**跨语言实体消歧**准备的：本人姓名的中文写法" +
      "（src/_data/site.js 的 author.alternateName / author.fullName）刻意保留在 Person 节点上，" +
      "以便按中文检索时能对上这个人。页面正文与全部可见文本一律是英文，" +
      "见 src/about.njk 里「全英文档案：中文名不进页面」那段说明。",
  },
];

const problems = [];
const notes = [];

/* ---------------- 工具 ---------------- */

/** @type 可能是字符串，也可能是字符串数组（多类型实体）。 */
function typesOf(node) {
  const raw = node["@type"];
  if (typeof raw === "string") return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim());
  }
  return [];
}

/** 剥掉注释，只留「会渲染 / 会被执行 / 会被机器读走」的内容。 */
function stripComments(text, kind) {
  const blank = (m) => m.replace(/[^\n]/g, " ");
  if (kind === "js") {
    return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/[^\n]*/gm, blank);
  }
  if (kind === "css") {
    return text.replace(/\/\*[\s\S]*?\*\//g, blank);
  }
  return text;
}

function walk(dir) {
  const found = [];
  let st;
  try {
    st = fs.statSync(dir);
  } catch (_) {
    return found;
  }
  if (st.isFile()) return [dir];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return found;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue; // macOS 的 AppleDouble 资源叉
    const p = path.join(dir, e.name);
    if (e.isDirectory()) found.push(...walk(p));
    else if (e.isFile()) found.push(p);
  }
  return found;
}

/** 页面里所有 <script> 标签：属性串 + 内容。 */
function scriptTags(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ attrs: m[1] || "", body: m[2] || "" });
  }
  return out;
}

/** 页面里所有 <style> 块的内容。 */
function styleBlocks(html) {
  const out = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1] || "");
  return out;
}

const isLdJson = (attrs) => /type\s*=\s*["']application\/ld\+json["']/i.test(attrs);
const hasSrc = (attrs) => /\bsrc\s*=/i.test(attrs);

/* ---------------- 产物目录 ---------------- */

if (!fs.existsSync(SITE)) {
  console.error("块级内容语言门禁未通过：\n");
  console.error("  ✗ 找不到产物目录 _site —— 先跑 npm run build 再跑本门禁。");
  console.error("");
  process.exit(1);
}

const htmlFiles = walk(SITE).filter(
  (f) => path.extname(f).toLowerCase() === ".html" && !path.basename(f).startsWith("._")
);
htmlFiles.sort();

/* 豁免使用计数：每条豁免被真正用来挡下几处 CJK */
const exemptUse = new Map(EXEMPT_FIELDS.map((e) => [`${e.type}.${e.field}`, 0]));

/* ---------------- BL2：JSON-LD 里的字符串值与键名全英文 ---------------- */

let ldBlockCount = 0;
let ldParseFail = 0;
let ldValueHits = 0;

/**
 * 递归遍历一个 JSON-LD 块。
 * ctx.parentType = 该值所在**节点**的 @type（豁免匹配用）；
 * ctx.key = 该值在该节点里的键名。
 */
function walkJson(node, ctx, rel) {
  if (typeof node === "string") {
    if (!CJK.test(node)) return;
    const key = `${ctx.parentType}.${ctx.key}`;
    const rule = EXEMPT_FIELDS.find(
      (e) => e.type === ctx.parentType && e.field === ctx.key
    );
    if (rule) {
      const id = `${rule.type}.${rule.field}`;
      exemptUse.set(id, (exemptUse.get(id) || 0) + 1);
      notes.push(`BL3 豁免「${id}」用在了 ${rel} 的 ${ctx.path}`);
      return;
    }
    ldValueHits++;
    problems.push(
      `BL2 ${rel} 的 JSON-LD 字段 ${ctx.path}（@type=${ctx.parentType || "?"}）里出现中日韩字符 —— ` +
        `站内文字一律是英文（见 src/_data/site.js 的 locale 说明）。\n` +
        `      ${String(node).slice(0, 110)}\n` +
        `      → 结构化数据是**被机器直接读走**的：搜索结果、知识面板、文献管理器` +
        `都只看它，不看页面正文。中文在这里等于对外出口是半机读的。`
    );
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => walkJson(v, { ...ctx, path: `${ctx.path}[${i}]` }, rel));
    return;
  }
  if (!node || typeof node !== "object") return;
  const type = typesOf(node).join("/");
  for (const [k, v] of Object.entries(node)) {
    if (CJK.test(k)) {
      ldValueHits++;
      problems.push(
        `BL2 ${rel} 的 JSON-LD 键名 ${ctx.path}.${k} 里出现中日韩字符 —— ` +
          `结构化数据的键名是 schema.org 术语，站内一律英文。`
      );
    }
    walkJson(v, { path: `${ctx.path}.${k}`, key: k, parentType: type || ctx.parentType }, rel);
  }
}

for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, "utf8");
  const tags = scriptTags(html);
  let blockNo = 0;
  for (const tag of tags) {
    if (!isLdJson(tag.attrs)) continue;
    blockNo++;
    ldBlockCount++;
    let parsed;
    try {
      parsed = JSON.parse(tag.body);
    } catch (e) {
      ldParseFail++;
      problems.push(
        `BL1 ${rel} 的第 ${blockNo} 个 ld+json 块 JSON.parse 失败 —— ` +
          `结构化数据坏了，消费方拿不到任何东西。\n` +
          `      ${String(e.message).split("\n")[0]}`
      );
      continue;
    }
    walkJson(parsed, { path: "$", key: "", parentType: "" }, `${rel}#ld${blockNo}`);
  }
}

/* ---------------- BL4：内联 <script>（可执行文本） ---------------- */

let inlineScriptCount = 0;
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, "utf8");
  for (const tag of scriptTags(html)) {
    if (isLdJson(tag.attrs)) continue; // 已由 BL1 / BL2 管
    if (hasSrc(tag.attrs)) continue; // 外链脚本在 src/assets/js/ 下，源码层已扫
    inlineScriptCount++;
    const text = stripComments(tag.body, "js");
    const hit = text.split("\n").find((line) => CJK.test(line));
    if (hit) {
      problems.push(
        `BL4 ${rel} 的内联 <script> 里出现中日韩字符 —— 站内文字一律是英文。\n` +
          `      ${hit.trim().slice(0, 110)}\n` +
          `      → 内联脚本是**可执行文本**：document.title、aria-label 覆写、` +
          `无障碍名称都写在这儿；它不出现在页面的可见文字里，恰恰因此最容易被漏掉。`
      );
    }
  }
}

/* ---------------- BL5：内联 <style>（剥注释后判） ---------------- */

let inlineStyleCount = 0;
for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, "utf8");
  for (const css of styleBlocks(html)) {
    inlineStyleCount++;
    const text = stripComments(css, "css");
    const hit = text.split("\n").find((line) => CJK.test(line));
    if (hit) {
      problems.push(
        `BL5 ${rel} 的内联 <style> 里（剥掉 CSS 注释后）出现中日韩字符 —— 站内文字一律是英文。\n` +
          `      ${hit.trim().slice(0, 110)}\n` +
          `      → 注释不渲染，所以 CSS 注释里的中文不算站内文字；但**值**里的中文` +
          `（content: "首页" 之类）会被渲染出来。`
      );
    }
  }
}

/* ---------------- BL3：豁免必须「用得出」 ---------------- */

for (const rule of EXEMPT_FIELDS) {
  const id = `${rule.type}.${rule.field}`;
  const used = exemptUse.get(id) || 0;
  if (used === 0) {
    // ⚠️ 只提示、不判红：豁免没被用上，多半是有人把那段中文删了
    //   （比如身份字段改成英文）—— 那是**好事**，不该让 build 红。
    notes.push(
      `BL3 提示：豁免「${id}」一次都没用上（该字段现在没有中日韩字符了），` +
        `可以删掉这条豁免（这只是提示，不拦 build）`
    );
  }
}

/* ---------------- BL6：覆盖度自证 ---------------- */

if (ldBlockCount < MIN_LD_BLOCKS) {
  problems.push(
    `BL6 只扫到 ${ldBlockCount} 个 JSON-LD 块（要求至少 ${MIN_LD_BLOCKS} 个）—— \n` +
      `      枚举逻辑多半坏了；"没报错"和"没问题"长得一模一样。`
  );
}
if (inlineScriptCount < MIN_INLINE_SCRIPTS) {
  problems.push(
    `BL6 只扫到 ${inlineScriptCount} 个内联 <script> 块（要求至少 ${MIN_INLINE_SCRIPTS} 个）—— \n` +
      `      枚举逻辑多半坏了；判据一旦从未被执行过，它会一直绿着。`
  );
}
if (inlineStyleCount < MIN_INLINE_STYLES) {
  problems.push(
    `BL6 只扫到 ${inlineStyleCount} 个内联 <style> 块（要求至少 ${MIN_INLINE_STYLES} 个）—— \n` +
      `      枚举逻辑多半坏了；判据一旦从未被执行过，它会一直绿着。`
  );
}
if (EXEMPT_FIELDS.length < MIN_EXEMPTIONS) {
  problems.push(
    `BL6 豁免清单只有 ${EXEMPT_FIELDS.length} 条（要求至少 ${MIN_EXEMPTIONS} 条）—— \n` +
      `      判据从未被真正执行过（清单被清空 / 写法变了都没人知道）。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("块级内容语言门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `块级内容语言门禁通过：${htmlFiles.length} 个产物页面、` +
    `${ldBlockCount} 个 JSON-LD 块（解析失败 ${ldParseFail} 个、字段级中文命中 ${ldValueHits} 处）、` +
    `${inlineScriptCount} 个内联 <script>、${inlineStyleCount} 个内联 <style>，` +
    `${EXEMPT_FIELDS.length} 条字段级豁免。`
);
notes.forEach((n) => console.log(`  · ${n}`));
console.log("  · 「站内文字一律英文」在块级内容上不再靠人眼：这一条现在有门禁守着。");
console.log("  · 判据出处：docs/DEFECT-BACKLOG.md D36。");
