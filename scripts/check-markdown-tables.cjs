#!/usr/bin/env node
/**
 * 门禁 TBL1–TBL5：**仓库里每一张 Markdown 表格都必须真的是一张表**
 *
 * 为什么要有这个门禁（一次实测坐实的看护缺口，不是假想）：
 *   Markdown 的表格是**两段式**语法 —— 一行表头 ＋ 一行分隔行（`|---|---|`）
 *   才构成一张表。表里每行的**竖线**是单元格分隔符；竖线写在**行内代码 span**
 *   里（`` `a|b` ``）也一样会被当成分隔符，除非写成 `a\|b`。
 *   这两件事都会让表格在**渲染时**塌掉，而且**源文件看上去完全正常**：
 *
 *   形态一「表格被空行截断」——
 *     表头与分隔行之后出现**空行**，GFM 就把表格终止在那儿；空行之后那些
 *     `| a | b |` 开头的数据行**不再是表格**，而是**普通段落**，渲染出来是一坨
 *     带字面竖线的文字。
 *     实测坐实（缺陷清单 D85）：`docs/DEFECT-BACKLOG.md` 里第 78 行有个空行，
 *     缺陷清单主表从 **D37 起被截断** —— 全表 84 条缺陷里 **48 条（D37–D84）**
 *     在渲染时不是表格。用 GitHub 自己的 markdown API 实测确认：那 48 行渲染成
 *     一个 **21 万字符**的段落，`<td>` 里一条缺陷都找不到。
 *
 *   形态二「行被竖线切碎」——
 *     单元格里的行内代码 span 含**裸竖线** ⇒ 那一行被切成多格，**后面几格的内容
 *     被挤掉**（不是多出格子，而是内容错位 + 丢失）。
 *     实测坐实：`docs/DEFECT-BACKLOG.md` 的 **D53 行**里写了
 *     `` `classList.add|remove|toggle` `` ⇒ 渲染后**状态列「已修」二字整列消失**，
 *     状态列显示成 `remove`（`classList.add` 之后的碎片）。
 *     全仓同类 4 处（另 3 处在 `docs/IMPROVEMENT-LOG.md`）。
 *
 *   形态三「这一块从来就不是一张表」——
 *     GFM 要「表头行 + 分隔行」**配成一张表**才认它：表头格数必须与分隔行格数相等，
 *     且分隔行**每格都得有连字符**。任何一条不满足，GFM 就**整张表都不识别** ——
 *     整块（表头 ＋ 分隔行 ＋ 数据行）渲染成**一个段落**，效果与形态一一样。
 *     实测坐实（缺陷清单 D86）：marked 12.0.2 与 GitHub 自己的 markdown API 两边独立渲染，
 *     「表头 3 格 / 分隔行 2 格」与「分隔行某格没有连字符」两个夹具**都不是表格**
 *     （`<td>` 一个都没有，只剩一个 `<p>`）。
 *     这一类与形态一是**同一种后果、不同成因**：形态一是「本来是表，被空行打断」，
 *     形态三是「从来就不是表」。
 *
 *   这两类形态**没有任何门禁能抓到**：
 *     · 文档快照门禁只判「现状陈述里不许写死会变的数字」；
 *     · 挂载契约门禁只判「挂载无关承诺有没有写例外」；
 *     · 其余文档门禁各管各的**内容**（路径 / 导航 / 字段 / 类名 / 判据编号），
 *       没人看**表格本身是不是一张表**。
 *   ⇒ 也就是说：**「文档里的表格塌了」这一族完全没人看守。**
 *
 * 五条判据（编号用独立字母体系 TBL*，**不与既有前缀冲突**：
 *   MT*（挂载契约）/ MC* / MD* / DS* / DR* / IAC*（信息架构）等均不同名）：
 *   TBL1 **表格被空行截断** —— 表头 + 分隔行确立的表，中途出现空行，而空行之后
 *      仍有 `|` 开头的**数据行**（不是新表的表头）⇒ 那些行在渲染时会退化成段落。
 *   TBL2 **行被竖线切碎** —— 真正属于本表的数据行，其**未转义竖线**数算出的格数
 *      必须与**本表表头**的格数相等；不等 ⇒ 那一行的内容要么**错位**、要么**被丢**。
 *      ⚠️ 三种形态的**后果不同**，红因文案必须分开说（说错会误导人改错地方）：
 *        · **比表头少格** ⇒ GFM 在这一行右侧**补空格**，**内容不会丢**，
 *          只是这一行比表头少写了内容；
 *        · **比表头多格、且多出来是因为格内裸竖线** ⇒ 那一格被切开，
 *          后面几格**整体左移错列**、尾部被丢弃；
 *        · **比表头多格、末尾多一个空格子** ⇒ GFM **忽略多出来的那几格**，
 *          那几格的内容在渲染时看不到，**其余格不受影响**。
 *      ⚠️ 与 TBL1 / TBL5 **互斥**：被它们判红的那些行已经**不是表格行**了，
 *      不再参与 TBL2 判定 ⇒ 同一处改动只会出一条红因。
 *   TBL3 **覆盖度自证** —— 扫到的 md 文件数 / 表数 / 数据行数都不得低于下限；
 *      一个都没扫到说明**扫描器坏了或扫描面被改空**，不是「没问题」。
 *   TBL4 **门禁自己没被卸掉** —— package.json 的 build 链里必须真的有本门禁。
 *   TBL5 **这一块从来就不是一张表** —— 表头与分隔行**配不成一张表**：
 *      表头格数 ≠ 分隔行格数，或分隔行里有一格没有连字符 ⇒ GFM 整张表都不识别。
 *      ⚠️ 与 TBL1 / TBL2 **互斥**：判红后该块的数据行**不再是表格行**，
 *      不参与 TBL2 判定，也不再报「被空行截断」⇒ 同一处改动只会出一条红因。
 *
 * ⚠️ 门禁**守不了什么**（写清楚，不藏）：
 *   · **只认前导竖线的表格**（`| a | b |`）。不带前导竖线的表格写法不扫。
 *   · **不判表格内容对不对**（格数对了、内容写错了，它不管）。
 *   · **不判表格该不该存在**（该不该用表格，是人的判断）。
 *   · **不判行内代码 span 里该写什么**（只判竖线有没有把行切碎）。
 *   · **不判「整行都不像分隔行」的写法**（比如分隔行整行只有冒号、连字符一个都没有）——
 *     那种写法不会被当成「表头 + 分隔行」，本门禁也就不会把它当一张表来判。
 *   · **引用块里的表格不扫**（`> | a | b |`）。
 *   · **代码围栏内的内容不扫**（围栏里的表格是示例，不是文档结构）。
 *
 * 环境变量（自测要在**副本**上注入缺陷，不能改仓库里的真文件）：
 *   TBL_DOC_DIRS —— 扫描目录（冒号分隔，默认仓库根 ＋ docs/）
 *   PKG_PATH    —— package.json 的路径（默认仓库根的 package.json）
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SELF = path.basename(__filename);
const PKG = process.env.PKG_PATH ? path.resolve(process.env.PKG_PATH) : path.join(ROOT, "package.json");
const DOC_DIRS = (process.env.TBL_DOC_DIRS || [ROOT, path.join(ROOT, "docs")].join(path.delimiter))
  .split(path.delimiter)
  .filter(Boolean)
  .map((d) => path.resolve(d));

/* 判据开关：存在的唯一理由是自测的负对照要把某一条判据**单独**卸掉，
   证明「那一档的红确实来自这一条判据本身」。默认值恒为 true。 */
const TBL1_ON = true;
const TBL2_ON = true;
const TBL3_ON = true;
const TBL4_ON = true;
const TBL5_ON = true;

/* TBL3 的覆盖度下限：只要仓库里还有文档，就至少该扫到几个文件、几张表、几行数据。
   ⚠️ 覆盖度统计的是「**扫描器活动量**」，不是「文档健康度」：
     被 TBL1 判红的那些孤儿行**照样计入行数**（它们仍属那张表），
     所以「造一个破格形态」不会连带把覆盖度拉红 ⇒ 同一处改动只出一条红因。
   ⚠️ 下限刻意取小：下限大到与真实仓库的内容规模耦合之后，
     别人正常改文档就会撞上红。覆盖度下限**不是**用来防「文档被删」，那是别的门禁的事。 */
const MIN_MD_FILES = 3;
const MIN_TABLES = 2;
const MIN_ROWS = 4;

/* 扫描时跳过的目录名（不递归）。 */
const SKIP_DIRS = new Set(["_archive", "node_modules", ".git", "_site", "_site_dev"]);

const problems = [];
/** 记一条判红。id 是判据编号（TBLn）—— 自测靠它断言「红因归属纯净」。 */
function fail(id, msg) {
  problems.push(`${id}：${msg}`);
}
function report() {
  console.error("Markdown 表格结构门禁未通过：\n");
  problems.forEach((p) => console.error(`  · ${p}`));
  console.error("");
  process.exit(1);
}

/* ================= 工具 ================= */

/** 列出目录下的 markdown 文件（不递归；排除 AppleDouble 侧车文件）。 */
function listMd(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("._")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(...listMd(p));
    } else if (e.name.endsWith(".md")) {
      out.push(p);
    }
  }
  return out;
}

/** 这一行是不是表格行（以竖线开头）。 */
function isTableRow(line) {
  return /^\s*\|/.test(line);
}

/** 这一行是不是分隔行（只由竖线、连字符、冒号、空格组成，且至少有一个连字符）。 */
function isSepRow(line) {
  const t = line.trim();
  return t.includes("-") && t.includes("|") && /^[|\s:-]+$/.test(t);
}

/**
 * 一行的格数：按**未转义**竖线切。
 *   · 先去掉行首竖线（表格行必须有）；
 *   · 再去掉行尾竖线 —— 但行尾若写成 `\|`（转义过的），那是**数据**不是分隔符，
 *     不能去（去了就把内容吃掉了）。
 *   · 最后按未转义竖线切分，段数即格数。
 */
function cellCount(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).length;
}

/**
 * 找出这一行里**含裸竖线的行内代码 span**（用来把红因指向具体写法）。
 * 返回去掉反引号后的 span 内容数组；找不到就返回空数组。
 */
function pipeSpans(line) {
  const spans = line.match(/`[^`]*`/g) || [];
  return spans
    .filter((s) => /(?<!\\)\|/.test(s))
    .map((s) => s.replace(/^`|`$/g, ""));
}

/**
 * 分隔行里**第一个没有连字符**的格下标；每格都有则返回 -1。
 *
 * GFM 的分隔行每格只允许连字符（可带冒号做对齐）；有一格不合法，
 * 这一块就**根本不是一张表** ⇒ 整块渲染成一个段落。
 * ⚠️ 与 `isSepRow` 的分工：`isSepRow` 只看「这一行像不像分隔行」（整行的字符集），
 *    用来**认出表的起点**；这里看「这一行**合不合法**」，用来判 TBL5。
 *    整行连字符一个都没有的那种写法，`isSepRow` 直接不认，也就进不到这里。
 */
function sepCellWithoutHyphen(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = s.split(/(?<!\\)\|/);
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i].includes("-")) return i;
  }
  return -1;
}

/* ================= 扫描 ================= */

const seen = new Set();
const files = [];
for (const d of DOC_DIRS) {
  for (const f of listMd(d)) {
    if (seen.has(f)) continue;
    seen.add(f);
    files.push(f);
  }
}

let tableCount = 0;
let rowCount = 0;
let cutCount = 0;
let breakCount = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let fence = null;
  let header = -1; // 当前表的表头行下标；-1 = 当前不在表里
  let cols = 0; // 当前表的表头格数
  let broken = false; // 当前表被 TBL5 判红（表头与分隔行配不成一张表）

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    /* 代码围栏：进 / 出围栏都要把「当前在表里」的状态清掉。 */
    const fenceMark = line.match(/^\s*(```+|~~~+)/);
    if (fenceMark) {
      if (fence === null) {
        fence = fenceMark[1];
        header = -1;
        broken = false;
        continue;
      }
      if (line.trim().startsWith(fence)) {
        fence = null;
        header = -1;
        broken = false;
        continue;
      }
      continue;
    }
    if (fence !== null) continue;

    /* 引用块里的表格不扫。 */
    if (/^\s*>/.test(line)) {
      header = -1;
      broken = false;
      continue;
    }

    if (header < 0) {
      /* 不在表里：找下一张表的开头（表头行 + 分隔行）。 */
      if (isTableRow(line) && i + 1 < lines.length && isSepRow(lines[i + 1])) {
        header = i;
        cols = cellCount(line);
        tableCount++;
        /* TBL5：GFM 要「表头行 + 分隔行」**配成一张表**才认它 ——
           表头格数必须与分隔行格数相等，且分隔行每格都得有连字符。
           任何一条不满足，GFM 就**整张表都不识别**，整块渲染成一个段落。 */
        const sepCols = cellCount(lines[i + 1]);
        const noHyphenAt = sepCellWithoutHyphen(lines[i + 1]);
        if (sepCols !== cols) {
          fail(
            "TBL5",
            `${rel}:${i + 1} 这一块**根本不是一张表**：表头 ${cols} 格、分隔行 ${sepCols} 格，` +
              `GFM 要求两者格数相等，不等就整张表都不识别 ⇒ 渲染时整块退化成**带字面竖线的段落**。` +
              ` 请把分隔行改成与表头同格数（每格一个连字符）。`
          );
          broken = true;
        } else if (noHyphenAt >= 0) {
          fail(
            "TBL5",
            `${rel}:${i + 1} 这一块**根本不是一张表**：分隔行第 ${noHyphenAt + 1} 格没有连字符，` +
              `GFM 的分隔行每格只允许连字符（可带冒号做对齐），有一格不合法就整张表都不识别` +
              ` ⇒ 渲染时整块退化成**带字面竖线的段落**。`
          );
          broken = true;
        }
        i++; // 跳过分隔行
      }
      continue;
    }

    /* 在表里。 */
    if (isTableRow(line)) {
      rowCount++;
      /* ⚠️ 被 TBL5 判红的这一块，GFM 压根不认它是表 ⇒ 它的数据行**不是表格行**，
         格数比较没有意义 ⇒ 不参与 TBL2 判定（与 TBL1 的孤儿行同口径）。
         行数**照样计入覆盖度**（覆盖度统计的是扫描器活动量，不是文档健康度）。 */
      if (!broken) {
        const c = cellCount(line);
        if (c !== cols) {
          breakCount++;
          const spans = pipeSpans(line);
          const diff = c - cols;
          /* 三种形态的**后果不同**（实测：marked 与 GitHub 自己的渲染器两边一致）——
             少格是「补空格、内容不丢」；多格且格内有裸竖线是「左移错列、尾部被丢」；
             多格且末尾多一个空格子是「多余那几格被忽略、其余格不动」。 */
          let shape;
          let tail;
          if (diff < 0) {
            shape =
              `本格 ${c} 格，比表头**少 ${-diff} 格** ⇒ GFM 会在这一行右侧补空格，` +
              `**内容不会丢**，但这一行比表头少写了 ${-diff} 格内容。`;
            tail = ` 请确认这一行是不是漏写了 ${-diff} 格内容。`;
          } else if (spans.length) {
            shape =
              `本格 ${c} 格，比表头**多 ${diff} 格** ⇒ 那一格被**裸竖线切开**了，` +
              `后面几格的内容会**整体左移错列**、尾部被丢弃。`;
            tail =
              ` 行内代码 span 里含裸竖线：${JSON.stringify(spans.join(" / "))}` +
              ` —— 把它写成转义竖线（反斜杠加竖线）即可。`;
          } else {
            shape =
              `本格 ${c} 格，比表头**多 ${diff} 格** ⇒ GFM 会**忽略多出来的那 ${diff} 格**，` +
              `那几格的内容在渲染时看不到（若多出来的竖线在行的中间，后面的内容还会左移错列）。`;
            tail = ` 这一行没有含裸竖线的行内代码 span，请人工确认多出来的竖线在哪。`;
          }
          fail("TBL2", `${rel}:${i + 1} 这一行的格数与表头对不上：${shape}${tail}`);
        }
      }
      continue;
    }

    /* 不在表里也不是表格行 ⇒ 有两种可能：空行（表格被截断）或普通段落（表格到此结束）。 */
    if (line.trim() === "") {
      /* 空行：GFM 在此终止表格。看看空行之后还有没有表格行。 */
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && isTableRow(lines[j])) {
        /* 空行后那一行是**新表的开头**（它的下一行是分隔行）⇒ 那是两张表，正常。 */
        const startsNewTable = j + 1 < lines.length && isSepRow(lines[j + 1]);
        if (!startsNewTable && !broken) {
          /* 被截断的孤儿行**仍属这张表** ⇒ 计入覆盖度，但**不再参与 TBL2 判定**。
             ⚠️ 覆盖度统计的是「扫描器活动量」，不是「文档健康度」：
               若不把孤儿行算进去，一次截断就会连带把 TBL3 拉红 ⇒
               同一处改动出两条红因，红因归属就不可判定了。
             ⚠️ `broken`（已被 TBL5 判红）时**不再报截断**：那一块压根不是表，
               「被空行截断」这个说法对它不成立 ⇒ 免得一处改动出两条红因。 */
          let k = j;
          while (k < lines.length && isTableRow(lines[k]) && !isSepRow(lines[k])) {
            rowCount++;
            k++;
          }
          cutCount++;
          fail(
            "TBL1",
            `${rel}:${i + 1} 这个空行把第 ${header + 1} 行起的表格**截断**了：` +
              `空行之后第 ${j + 1} 行仍是表格数据行，但 GFM 在空行处就终止表格` +
              ` ⇒ 那些行渲染时退化成**带字面竖线的段落**，不是表格。` +
              ` 请删掉这个空行（或把后面那段拆成另一张带表头与分隔行的表）。`
          );
        }
      }
    }
    header = -1;
    broken = false;
  }
}

/* ================= TBL3：覆盖度自证 ================= */

if (TBL3_ON) {
  if (files.length < MIN_MD_FILES) {
    fail(
      "TBL3",
      `只扫到 ${files.length} 个 markdown 文件（要求至少 ${MIN_MD_FILES} 个）—— ` +
        `扫描面被改小了，不是「没问题」。`
    );
  }
  if (tableCount < MIN_TABLES) {
    fail("TBL3", `只认出 ${tableCount} 张表（要求至少 ${MIN_TABLES} 张）—— 表识别器可能坏了。`);
  }
  if (rowCount < MIN_ROWS) {
    fail(
      "TBL3",
      `只认出 ${rowCount} 行表格数据（要求至少 ${MIN_ROWS} 行）—— 表识别器可能坏了。`
    );
  }
}

/* ================= TBL4：门禁自己没被卸掉 ================= */

if (TBL4_ON) {
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
  } catch (e) {
    fail("TBL4", `读不到 package.json（${e.message}）—— 无法确认本门禁接在 build 链上。`);
  }
  if (pkg) {
    const SCRIPTS = pkg.scripts || {};
    const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
    const seenScripts = new Set();
    const queue = ["build"];
    while (queue.length) {
      const name = queue.shift();
      if (seenScripts.has(name)) continue;
      seenScripts.add(name);
      const cmd = SCRIPTS[name] || "";
      NPM_RUN_RE.lastIndex = 0;
      let m;
      while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
        if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
      }
    }
    const wired = Object.keys(SCRIPTS).filter(
      (n) => seenScripts.has(n) && (SCRIPTS[n] || "").includes(SELF)
    );
    if (!wired.length) {
      fail("TBL4", `门禁自己被卸掉了：package.json 的 build 链里没有指向 scripts/${SELF} 的 script。`);
    }
  }
}

/* ================= 通过 ================= */

if (problems.length) {
  report();
}

console.log(
  `Markdown 表格结构门禁通过：扫描 ${files.length} 个 markdown 文件、${tableCount} 张表、` +
    `${rowCount} 行数据 —— 没有表格被空行截断、没有行被竖线切碎、也没有哪一块配不成一张表。`
);
console.log(
  `  · 表格语法：表头行 + 分隔行（|---|---|）才算一张表，两者的格数必须相等且分隔行每格都要有连字符；` +
    `单元格里的竖线必须转义（行内代码 span 里的竖线也一样），否则那一行会左移错列、尾部被丢。`
);
if (cutCount || breakCount) {
  console.log(`  · 形态统计：截断 ${cutCount} 处、破格 ${breakCount} 处。`);
}
