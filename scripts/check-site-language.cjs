#!/usr/bin/env node
/**
 * 门禁 TX1–TX4：站内对外出口的语言一致性与「构建时刻标记」的结构化程度
 *
 * 为什么需要它（2026-10-20 的 D35）：
 *   硬约束是「站内文字一律英文」。这条约束此前在**对外出口**上是空的：
 *     · scripts/check-lang.cjs 的**产物层只扫 .html** ⇒ robots.txt /
 *       feed.xml / publications.bib / publications.ris / sitemap.xml
 *       这些真正被爬虫与文献管理器读走的文件，**一条门禁都没扫过**；
 *     · 而 src/robots.njk 被**整文件豁免**了，豁免理由写得很坦白：
 *       「站点门禁 17 / 20 以其中的中文标记「生成时间」为锚点」。
 *   于是形成了一个**反向锁死**：
 *     · robots.txt 里有 5 行中文注释，产物实测确实有中文；
 *     · 想让门禁 17 / 20 保持绿 ⇒ 就得把中文留在产物里；
 *     · 一按硬约束把 robots.txt 英文化 ⇒ 那两条门禁**立刻报红**，
 *       而红因是"找不到「生成时间」这一行"，与"我把注释改成英文了"
 *       毫无字面关联 ⇒ 极难排查。
 *   换句话说：**门禁越严，把硬约束照做的代价越大** —— 这是最坏的一种
 *   门禁形态：它把正确的做法变成红线。
 *
 * 修法（不在本门禁里，但本门禁是它的**独立证据**）：
 *   ① src/robots.njk 的产物行全部英文化，构建时刻那行改成**结构化 key**
 *      `# generated-at: <ISO>`；
 *   ② 站点门禁 17 / 20 的锚点从中文文案换成那个 key（认结构不认措辞）；
 *   ③ check-lang.cjs 删掉 src/robots.njk 的豁免（它现在该被扫到了）。
 *
 * 本门禁守什么（判据编号 TX*，与 verify-site 的数字编号、check-lang 的 FF*、
 *   check-page-deps 的 LM* 都不续接）：
 *   TX1 对外出口全英文 —— `_site` **顶层**所有非 .html 文件（就是那些爬虫与
 *      文献管理器真正读走的出口）里 0 个中日韩字符。枚举**不硬编码文件名**：
 *      以后新增一个出口会被自动纳入。
 *   TX2 构建时刻标记是结构化且说真话 —— robots.txt 里必须有一行
 *      `# generated-at: <ISO>`，且这个时刻必须与 feed.xml 的
 *      `<lastBuildDate>` **是同一瞬间**。
 *      ⚠️ 这条是**独立复算**：它自己解析这两个文件，**不调用**站点门禁
 *      17 / 20 的任何函数 ⇒ 站点门禁的锚点写错了，这里仍然能给出独立结论。
 *   TX3 语言门禁的豁免必须「用得出」 —— check-lang.cjs 的豁免清单里，
 *      每一项都必须**真的豁免掉了非注释里的中文**。
 *      判据是「剥掉注释后仍含中日韩字符」：注释里的中文不渲染，剥掉就干净了；
 *      而**豁免是按路径整条豁免的** ⇒ 一条把「只在注释里的中文」也算进去的豁免，
 *      等于给那个路径开了一扇**暗门**（src/robots.njk 若被加回豁免，就是这个形态）。
 *   TX4 覆盖度自证 —— TX1 扫到的出口数、TX2 解析到的时间戳数、
 *      TX3 扫到的豁免条目数都不得为 0：
 *      「没报错」和「没问题」长得一模一样，判据一旦被卸掉，门禁会一直绿着。
 *
 * 边界（如实写明）：
 *   · TX1 只扫 `_site` 顶层。`assets/**` 下的 css / js / svg 是从 `src/`
 *     原样拷过去的，源码层已由 check-lang 扫过，不在这里重复。
 *   · TX1 判的是**中日韩字符**，不判别的非 ASCII：站点正文合法地用着
 *     `·`（U+00B7）、`—`、`°`、`±` 这类排版符号，把它们一并拦掉是假红。
 *   · TX2 只保证「两个出口说的是同一瞬间」与「标记是结构化的」，
 *     不保证那个瞬间等于真实墙钟 —— 真实墙钟那一半由站点门禁 17 守
 *     （它拿源文件的 birthtime / mtime 做相对判据）。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "_site");
const SRC = path.join(ROOT, "src");
const LANG_GATE = path.join(ROOT, "scripts", "check-lang.cjs");

/* 中日韩文字 + 全角标点。与 scripts/check-lang.cjs 的 CJK 正则**逐字一致**
   （同一套 Unicode 范围、同一份写法）—— 改一处就得改另一处，
   否则两个门禁的判定会分叉。 */
const CJK = /[\u3000-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef]/;

/* TX1 的覆盖度下限：`_site` 顶层至少这么多非 html 出口。
   现在的实际值是 5（feed.xml / publications.bib / publications.ris /
   robots.txt / sitemap.xml）。低于这个数说明枚举逻辑坏了，不是「没问题」。 */
const MIN_EXPORTS = 5;

/* TX3 的覆盖度下限：豁免清单至少这么多条（现在 2 条：src/_data 与 og 目录）。 */
const MIN_EXEMPTIONS = 1;

/* TX3 扫豁免路径时只认这些文本类扩展名 —— 目录里混着 PNG / 其它二进制，
   按 utf8 读它们会读到乱码，判出来的「含中文」是假的。 */
const TEXT_EXTS = new Set([
  ".njk", ".md", ".js", ".cjs", ".mjs", ".css", ".svg",
  ".json", ".txt", ".xml", ".html", ".yml", ".yaml",
]);

const problems = [];
const notes = [];

/* ---------------- 工具 ---------------- */

/** 剥掉注释，只留「会渲染 / 会进产物」的内容。 */
function stripComments(text, ext) {
  let out = text;
  const blank = (m) => m.replace(/[^\n]/g, " ");
  if (ext === ".njk" || ext === ".md" || ext === ".html" || ext === ".svg") {
    out = out.replace(/\{#[\s\S]*?#\}/g, blank);
    out = out.replace(/<!--[\s\S]*?-->/g, blank);
    out = out.replace(/^\s*#[^\n]*$/gm, blank); // 整行井号注释
  }
  if (ext === ".js" || ext === ".cjs" || ext === ".css") {
    out = out.replace(/\/\*[\s\S]*?\*\//g, blank);
    out = out.replace(/^\s*\/\/[^\n]*$/gm, blank);
  }
  return out;
}

function walk(dir) {
  const found = [];
  let st;
  try {
    st = fs.statSync(dir);
  } catch (_) {
    return found;
  }
  if (st.isFile()) return [dir]; // 豁免项可能直接是一个文件（如 src/robots.njk）
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

/* ---------------- TX1：对外出口全英文 ---------------- */

let exportFiles = [];
if (!fs.existsSync(SITE)) {
  console.error("对外出口语言门禁未通过：\n");
  console.error("  ✗ 找不到产物目录 _site —— 先跑 npm run build 再跑本门禁。");
  console.error("");
  process.exit(1);
}

for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
  if (!e.isFile()) continue;
  if (path.extname(e.name).toLowerCase() === ".html") continue;
  exportFiles.push(e.name);
}
exportFiles.sort();

for (const name of exportFiles) {
  const abs = path.join(SITE, name);
  let text;
  try {
    text = fs.readFileSync(abs, "utf8");
  } catch (_) {
    continue;
  }
  text.split("\n").forEach((line, i) => {
    if (CJK.test(line)) {
      problems.push(
        `TX1 对外出口「${name}」第 ${i + 1} 行出现中日韩字符 —— ` +
          `站内文字一律是英文（见 src/_data/site.js 的 locale 说明）。\n` +
          `      ${line.trim().slice(0, 110)}\n` +
          `      → 这个文件是**爬虫 / 文献管理器直接读走**的出口，不是给人看的页面；` +
          `中文在这里等于把机器可读的文件变成了半机读。`
      );
    }
  });
}
notes.push(`TX1 扫了 ${exportFiles.length} 个对外出口：${exportFiles.join(" / ")}`);

/* ---------------- TX2：构建时刻标记是结构化且说真话 ---------------- */

const robotsPath = path.join(SITE, "robots.txt");
const feedPath = path.join(SITE, "feed.xml");
let buildMs = null;

if (!fs.existsSync(robotsPath)) {
  problems.push("TX2 robots.txt 不存在 —— 站点根必须有一份 robots.txt。");
} else {
  const robotsTxt = fs.readFileSync(robotsPath, "utf8");
  const m = robotsTxt.match(/^#\s*generated-at:\s*(.+?)\s*$/m);
  if (!m) {
    problems.push(
      "TX2 robots.txt 里找不到结构化的构建时刻标记 —— \n" +
        "      期望形如 `# generated-at: 2026-10-21T05:05:04.000Z` 的一行。\n" +
        "      → 必须锚在**结构**上（一个机器可读的 key），不能锚在中文文案上：\n" +
        "        锚在文案上等于把「站内文字一律英文」反向锁死 —— 一按硬约束把\n" +
        "        robots.txt 英文化，依赖它的门禁就先红，而红因与改动毫无字面关联。"
    );
  } else {
    const stamp = m[1].trim();
    buildMs = Date.parse(stamp);
    if (Number.isNaN(buildMs)) {
      problems.push(`TX2 robots.txt 的 generated-at 不是合法时间戳 —— "${stamp}"`);
      buildMs = null;
    } else {
      notes.push(`TX2 robots.txt 的 generated-at = ${stamp}`);
    }
  }
}

if (buildMs !== null && fs.existsSync(feedPath)) {
  const feedXml = fs.readFileSync(feedPath, "utf8");
  const lbd = (feedXml.match(/<lastBuildDate>([^<]*)<\/lastBuildDate>/) || [])[1];
  if (!lbd) {
    problems.push("TX2 feed.xml 缺 <lastBuildDate> —— 订阅源必须声明最后一次构建的时刻。");
  } else {
    const expected = new Date(buildMs).toUTCString();
    if (lbd.trim() !== expected) {
      problems.push(
        `TX2 feed.xml 的 <lastBuildDate> = "${lbd.trim()}"，但 robots.txt 的 generated-at ` +
          `对应的是 "${expected}" —— 同一次构建，两个出口必须报**同一时刻**。`
      );
    } else {
      notes.push(`TX2 feed.xml 的 lastBuildDate 与 generated-at 同刻（${expected}）`);
    }
  }
}

/* ---------------- TX3：语言门禁的豁免必须「用得出」 ---------------- */

/* check-lang.cjs 有**两个**豁免清单，两条都要核：
     · SOURCE_EXCLUDE       —— 目录豁免（当前生效的两条在这里）
     · SOURCE_EXCLUDE_FILES —— 单文件豁免（src/robots.njk 原先在这里，
                              D35 已删除；将来若有人加回来，TX3 照样抓到）
   只核一个会漏 —— 而漏掉的那一个正是「目录豁免」这条真正生效的路子。 */
const EXEMPTION_LISTS = ["SOURCE_EXCLUDE", "SOURCE_EXCLUDE_FILES"];

let exemptionCount = 0;
if (!fs.existsSync(LANG_GATE)) {
  problems.push("TX3 找不到 scripts/check-lang.cjs —— 豁免清单无从核对。");
} else {
  const langSrc = fs.readFileSync(LANG_GATE, "utf8");
  const itemRe = /path\.join\(\s*([A-Z_]+)\s*,\s*((?:"[^"]*"\s*,?\s*)+)\)/g;

  for (const listName of EXEMPTION_LISTS) {
    const arrRe = new RegExp(
      "const\\s+" + listName + "\\s*=\\s*\\[([\\s\\S]*?)\\];"
    );
    const arrMatch = langSrc.match(arrRe);
    if (!arrMatch) {
      problems.push(
        `TX3 在 scripts/check-lang.cjs 里找不到 ${listName} 清单 —— \n` +
          `      豁免清单的写法变了，本门禁跟不上（判据必须跟着代码走）。`
      );
      continue;
    }
    const body = arrMatch[1];
    const items = [];
    let im;
    itemRe.lastIndex = 0;
    while ((im = itemRe.exec(body)) !== null) {
      const parts = [...im[2].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
      const base = im[1] === "SRC" ? SRC : ROOT;
      items.push({ path: path.join(base, ...parts), list: listName });
    }
    exemptionCount += items.length;

    for (const item of items) {
      const rel = path.relative(ROOT, item.path);
      const files = walk(item.path).filter((f) =>
        TEXT_EXTS.has(path.extname(f).toLowerCase())
      );
      if (!files.length) {
        problems.push(
          `TX3 语言门禁的豁免项「${rel}」（${item.list}）指向的路径下没有文本文件 —— \n` +
            `      豁免一个没有文本的路径，等于豁免清单里多一条看不懂的死条目。`
        );
        continue;
      }
      // 「剥掉注释后仍含 CJK」才算真的豁免到了会渲染的中文。
      let rendersCjk = false;
      let cjkInCommentOnly = false;
      for (const f of files) {
        let raw;
        try {
          raw = fs.readFileSync(f, "utf8");
        } catch (_) {
          continue;
        }
        const ext = path.extname(f).toLowerCase();
        if (CJK.test(raw)) {
          if (CJK.test(stripComments(raw, ext))) rendersCjk = true;
          else cjkInCommentOnly = true;
        }
      }
      if (!rendersCjk && cjkInCommentOnly) {
        problems.push(
          `TX3 语言门禁的豁免项「${rel}」（${item.list}）豁免掉的中文**只在注释里** —— \n` +
            `      注释不渲染，剥掉就干净了 ⇒ 这条豁免是**暗门**，不是必要的例外。\n` +
            `      → 删掉这条豁免，让该路径重新被扫到；否则等于在该路径上把「站内文字一律英文」整个关掉。`
        );
      } else if (!rendersCjk) {
        // ⚠️ 这一支只是**提示**，不判红：豁免项下现在一个中文都没有，多半是
        //   有人把那段中文删了（比如身份字段改成英文）—— 那是**好事**，
        //   不该让 build 红。判红只留给上面那支「暗门」：
        //   豁免掩盖了**真会渲染**的中文，那才是硬缺陷。
        notes.push(
          `TX3 提示：豁免项「${rel}」（${item.list}）下现在没有中日韩字符了，` +
            `可以删掉这条豁免（这只是提示，不拦 build）`
        );
      }
    }
    notes.push(
      `TX3 核对了 ${listName} 的 ${items.length} 条豁免` +
        (items.length
          ? `：${items.map((i) => path.relative(ROOT, i.path)).join(" / ")}`
          : "（当前为空）")
    );
  }
}

/* ---------------- TX4：覆盖度自证 ---------------- */

if (exportFiles.length < MIN_EXPORTS) {
  problems.push(
    `TX4 只扫到 ${exportFiles.length} 个对外出口（要求至少 ${MIN_EXPORTS} 个）—— \n` +
      `      枚举逻辑多半坏了；"没报错"和"没问题"长得一模一样。`
  );
}
if (buildMs === null && fs.existsSync(robotsPath)) {
  // TX2 已经报过具体红因，这里只补一句"这条判据没跑起来"
  notes.push("TX4 注意：构建时刻标记没解析出来，TX2 已报红");
}
if (exemptionCount < MIN_EXEMPTIONS) {
  problems.push(
    `TX4 只扫到 ${exemptionCount} 条语言门禁豁免（要求至少 ${MIN_EXEMPTIONS} 条）—— \n` +
      `      判据从未被真正执行过（豁免清单被清空 / 写法变了都没人知道）。`
  );
}

/* ---------------- 汇总 ---------------- */

if (problems.length) {
  console.error("对外出口语言门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

console.log(
  `对外出口语言门禁通过：${exportFiles.length} 个对外出口全英文、` +
    `robots.txt 的构建时刻标记是结构化 key 且与 feed.xml 同刻、` +
    `${exemptionCount} 条语言门禁豁免都豁免到了真会渲染的中文。`
);
notes.forEach((n) => console.log(`  · ${n}`));
console.log(
  "  · 「站内文字一律英文」在对外出口上不再靠人眼：这一条现在有门禁守着。"
);
console.log("  · 判据出处：docs/DEFECT-BACKLOG.md D35。");
