#!/usr/bin/env node
/**
 * 文本层门禁（check-lang）的**自测**（注入矩阵）—— 证明 LG1–LG7 每一条都**能变红**。
 *
 * 为什么要有这个自测（缺陷 D59 的第三批，2026-10-21 D59 场次）：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。而"判据能不能变红"这件事，**只有注入能证明**。
 *   本仓已经吃过这一族亏：D51 查出三处 JS 空转、D52 查出死 CSS 门禁只守一张样式表、
 *   D57 给 IA8 加判据时也只能靠当场的 `/tmp` 注入矩阵证明它会红 ——
 *   **矩阵跑完即弃，仓库里没有任何东西保证它下次还在**。
 *   ⇒ 本脚本把那套矩阵**固化进仓库**，接在 build 链上。
 *
 * 本门禁守的是一条**具体证据链**（不是假想的风险）：
 *   站点早已明文统一为英文，但中文是**逐处漏网**的：theme.js 把主题按钮的
 *   aria-label 覆写成中文、blog.njk 的阅读时长写成"{{ readingTime }} 分钟" ——
 *   每一处单看都"像那么回事"，不会让构建失败、HTTP 也不会 404，
 *   只能靠人眼发现。更糟的是它**到处都有豁免**（数据层、OG 品牌图、5 类注释、
 *   数字实体、内联 script/style 块），而豁免一旦被误当成"放行一切"，
 *   中文就会从缝里回到产物里 —— 而门禁还是绿的。
 *   ⇒ 本矩阵要证明两件事：**该红的一定红**（LG1–LG7），**该绿的一定绿**（10 档豁免）。
 *
 * 做法：在**自造的最小夹具站**上逐档注入缺陷，断言门禁**报出的红因编号集合与预期完全相等**。
 *   ⚠️ 全程**不动仓库里的任何文件** —— 注入只在临时目录的副本上做。
 *   ⚠️ **不 require 被测门禁的代码**：门禁以**子进程**方式运行，
 *     本脚本只看它的**行为**（exit code + stderr 上的红因编号）。
 *   ⚠️ 为什么门禁必须**复制**而不是就地跑：本门禁的仓库根是
 *     `path.join(__dirname, "..")`（**硬编码，无环境变量开关**）⇒ 只有把副本放到
 *     夹具的 `scripts/` 下，ROOT 才会指向夹具根。⇒ 夹具因此**不需要 git、不需要真 `_site`**。
 *
 * 二十八档：
 *   LG0  基线（夹具原样）                     → 必须**全绿**（证明这套判据不是空跑）
 *   LG1  源文件层出现中文                     → LG1
 *   LG1b 源文件 front matter 的**值**里出现中文 → LG1
 *        （front matter 只剥**整行**注释，值保留 —— 那是要渲染进 <title> 的用户可见文本）
 *   LG2  产物层出现中文                       → LG2
 *   LG2b 产物层出现**数字实体**编码的中文      → LG2
 *        （`&#x4e2d;` 也是中文：实体解码后必须照样判红）
 *   LG3  源文件层出现 U+FFFD                  → LG3
 *   LG4  产物层出现 U+FFFD                    → LG4
 *   LG5  源文件层一个文件都没扫到              → LG5（自证存活）
 *   LG6  产物目录 _site 不在场                → LG6
 *   LG7  _site 在场但一个 .html 都没有         → LG7（自证存活）
 *   LG8–LG17 **故意判绿**（10 档豁免，各一条） → 必须仍判绿
 *        front matter 整行注释 / Nunjucks 注释 / HTML 注释 / CSS 注释 / JS 行注释 /
 *        数据层目录豁免 / OG 品牌图目录豁免 / `._*` 资源叉跳过 /
 *        产物里的非 HTML 文件（feed.xml）不扫 / 产物里的内联 <script>、<style> 块不扫
 *   LG18–LG24 **判据级负对照**（每条判据一档） → 门禁**副本**卸掉那条判据后，
 *        对应的注入必须**转绿**（证明那条红确实来自它自己）
 *   LG25 **判据级负对照（精准性）**：卸掉 LG1 + **同时**注入 LG1 与 LG2
 *        → 必须**仍红**，但红因集合恰为 {LG2}（证明卸判据是精准的，不是把门禁整个关掉）
 *
 * 三处必须说清的诚实边界（写在这里，别当成漏网）：
 *   ① **LG5 与 LG7 是"空跑"这一族**（扫到 0 个 vs 一个都没扫到），
 *      LG6 是"产物层压根没被扫"——三者的**修法不同**（筛子坏了 / 没构建 / 产物是空的），
 *      分号不是为了好看，是因为坏法不同则注入矩阵的红因集合无法区分
 *      ⇒「红因归属纯净」这条断言就废了。
 *   ② **LG1 与 LG3 在同一行上互斥**（先判 CJK）：一行里既有中文又有 U+FFFD 时只报 LG1。
 *      本矩阵的注入一律**只放一种**坏东西，所以归属仍然纯净。
 *   ③ **"故意判绿"那 10 档不是凑数**：每一档对应门禁里**一条具体的豁免代码**
 *      （5 类注释的剥离正则、2 个目录豁免、`._*` 跳过、产物层的扩展名过滤、
 *      内联 script/style 的剥离）。少剥一处、豁免多写一条目录，
 *      产物里就会多出中文而门禁还是绿的 —— 而这类改动**永远不会让构建失败**。
 *
 * 用法：node scripts/test-lang.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const GATE = path.join(__dirname, "check-lang.cjs");

/* 夹具里用的中文（不是"随便一个汉字"，而是**会被门禁当成中日韩字符**的那些）。
   ⚠️ 夹具里不写"中文"两个字以外的真实项目文案 —— 那是仓库自己的东西。 */
const ZH = "中文";

/* ---------------- 夹具 ---------------- */

/**
 * 搭一个夹具站（沙箱根目录）。
 * ⚠️ **基线是干净的**：不掺任何豁免样本 ⇒ 基线判绿是"这套判据没误伤"，
 *   每一档豁免都是**单独**加上去的（加坏了就是那一档红，失败点可归属）。
 *
 * opts（每个开关对应一档注入）：
 *   cjkNjk        源文件层：njk 正文里出现中文            → LG1
 *   cjkFrontmatter 源文件层：front matter 的**值**里出现中文 → LG1
 *   cjkSite       产物层：页面正文里出现中文              → LG2
 *   cjkEntity     产物层：数字实体编码的中文              → LG2
 *   fffdSrc       源文件层：U+FFFD 替换字符               → LG3
 *   fffdSite      产物层：U+FFFD 替换字符                 → LG4
 *   emptySrc      源文件层一个可扫文件都没有              → LG5
 *   noSite        不造 _site/                             → LG6
 *   siteNoHtml    _site 在场但只有非 HTML 文件             → LG7
 *   green*        10 档故意判绿（见上）
 */
function buildFixture(dir, o) {
  const opts = o || {};

  fs.mkdirSync(path.join(dir, "src"), { recursive: true });

  /* —— 源文件层 —— */
  if (!opts.emptySrc) {
    /* njk：front matter + 正文 */
    const njk = ["---", "title: Fixture Home", "---", "<h1>Fixture home</h1>", "<p>English only.</p>"];
    if (opts.cjkNjk) njk.push(`<p>${ZH} body</p>`);
    if (opts.greenNjkComment) njk.push(`{# ${ZH} comment #}`);
    write(path.join(dir, "src", "index.njk"), njk.join("\n") + "\n");

    /* md：front matter 的值是用户可见文本（会渲染进 <title>） */
    const md = ["---", "title: Fixture About"];
    md.push(opts.cjkFrontmatter ? `description: ${ZH} description` : "description: A fixture page.");
    md.push("---", "Body in English.");
    if (opts.greenMdComment) md.splice(2, 0, `# ${ZH} front matter comment`);
    write(path.join(dir, "src", "about.md"), md.join("\n") + "\n");

    /* css：块注释 */
    const css = ["body { color: #111; }"];
    if (opts.greenCssComment) css.unshift(`/* ${ZH} comment */`);
    write(path.join(dir, "src", "style.css"), css.join("\n") + "\n");

    /* js：行注释（必须整行以 // 开头，门的正则就是这样） */
    const js = ["const x = 1;"];
    if (opts.fffdSrc) js.push(`const broken = "\ufffd";`);
    if (opts.greenJsComment) js.unshift(`// ${ZH} comment`);
    write(path.join(dir, "src", "app.js"), js.join("\n") + "\n");

    /* svg：HTML 注释 */
    const svg = ["<svg xmlns=\"http://www.w3.org/2000/svg\"><title>Fixture</title></svg>"];
    if (opts.greenSvgComment) svg.push(`<!-- ${ZH} comment -->`);
    write(path.join(dir, "src", "icon.svg"), svg.join("\n") + "\n");
  }

  /* —— 豁免样本（各自单独一档）—— */
  if (opts.greenDataLayer) {
    write(
      path.join(dir, "src", "_data", "site.js"),
      `module.exports = { name: "${ZH} fixture site" };\n`
    );
  }
  if (opts.greenOgSvg) {
    write(
      path.join(dir, "src", "assets", "img", "og", "brand.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg"><title>${ZH}</title></svg>\n`
    );
  }
  if (opts.greenSidecar) {
    write(path.join(dir, "src", "._appledouble.js"), `const ${ZH} = 1;\n`);
  }

  /* —— 产物层 —— */
  if (!opts.noSite) {
    fs.mkdirSync(path.join(dir, "_site"), { recursive: true });

    if (!opts.siteNoHtml) {
      const html = [
        "<!doctype html>",
        '<html lang="en"><head><title>Fixture</title></head>',
        "<body><p>English only.</p></body></html>",
      ];
      if (opts.cjkSite) html.push(`<p>${ZH} body</p>`);
      if (opts.cjkEntity) html.push("<p>&#x4e2d;</p>");
      if (opts.fffdSite) html.push("<p>\ufffd</p>");
      if (opts.greenHtmlComment) html.push(`<!-- ${ZH} comment -->`);
      if (opts.greenScriptBlock) {
        html.push(`<script>const t = "${ZH}";</script>`);
        html.push(`<style>.a { content: "${ZH}"; }</style>`);
      }
      write(path.join(dir, "_site", "index.html"), html.join("\n") + "\n");
    }

    /* 产物里的非 HTML 文件：本门禁的产物层**只扫 .html**（非 HTML 出口归 TX1） */
    const feed = ["<?xml version=\"1.0\" encoding=\"utf-8\"?>", "<rss><channel>"];
    feed.push(opts.greenNonHtmlProduct ? `<title>${ZH} feed</title>` : "<title>Fixture feed</title>");
    feed.push("</channel></rss>");
    write(path.join(dir, "_site", "feed.xml"), feed.join("\n") + "\n");
  }
}

function write(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/* ---------------- 门禁副本（负对照用） ---------------- */

/**
 * 把门禁复制到沙箱的 scripts/ 下（这样门禁的 ROOT 就是沙箱根）。
 * @param disableLg —— 要卸掉的判据编号（如 1 ⇒ 卸 LG1）
 * ⚠️ **卸判据必须自证**：改不到那个 `const LGn_ON = true;` 就直接失败 ——
 *   「破坏没打上」与「判据本来就不红」在结果上完全同形。
 * ⚠️ 副本与原件必须**只差那一行** —— 多差一行就说明负对照动的不止判据。
 */
function buildGateCopy(dir, disableLg) {
  const original = fs.readFileSync(GATE, "utf8");
  let copy = original;
  if (disableLg) {
    const from = `const LG${disableLg}_ON = true;`;
    const to = `const LG${disableLg}_ON = false;`;
    copy = copy.replace(from, to);
    if (copy === original) {
      console.error(
        `文本层门禁自测失败：负对照没能改到 LG${disableLg} 判定（破坏没打上，这一档会假绿）。`
      );
      process.exit(1);
    }
    const a = original.split("\n");
    const b = copy.split("\n");
    const diff = a.filter((line, i) => line !== b[i]).length;
    if (diff !== 1 || a.length !== b.length) {
      console.error(
        `文本层门禁自测失败：负对照的门禁副本与原件差了 ${diff} 行（应当恰好 1 行）。`
      );
      process.exit(1);
    }
  }
  const target = path.join(dir, "scripts", "check-lang.cjs");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, copy);
  return target;
}

/* ---------------- 跑门禁 ---------------- */

function runGate(gatePath) {
  const r = spawnSync(process.execPath, [gatePath], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout || ""}`, err: `${r.stderr || ""}` };
}

/**
 * 从 **stderr** 里抽出红因编号（**按出现顺序、带重复**）。
 * ⚠️ 只取 stderr：门禁把**问题**写 stderr、把**通过语**写 stdout。
 * ⚠️ 按行匹配 `✗ 门禁 LGn` ⇒ 只数**红因行**，不会被红因正文里引用的编号带偏。
 */
function causesOf(stderr) {
  const out = [];
  const re = /^\s*✗\s*门禁 (LG\d+)/gm;
  let m;
  while ((m = re.exec(stderr)) !== null) out.push(m[1]);
  return out.sort();
}

/* ---------------- 注入档 ---------------- */

const CASES = [
  {
    id: "LG0",
    label: "基线（夹具原样）",
    expect: "green",
  },
  {
    id: "LG1",
    label: "源文件层出现中文",
    expect: "red",
    causes: ["LG1"],
    opts: { cjkNjk: true },
    expectText: "index.njk",
  },
  {
    id: "LG1b",
    label: "源文件 front matter 的值里出现中文（值是用户可见文本）",
    expect: "red",
    causes: ["LG1"],
    opts: { cjkFrontmatter: true },
    expectText: "about.md",
  },
  {
    id: "LG2",
    label: "产物层出现中文",
    expect: "red",
    causes: ["LG2"],
    opts: { cjkSite: true },
    expectText: "index.html",
  },
  {
    id: "LG2b",
    label: "产物层出现数字实体编码的中文（&#x4e2d;）",
    expect: "red",
    causes: ["LG2"],
    opts: { cjkEntity: true },
    expectText: "index.html",
  },
  {
    id: "LG3",
    label: "源文件层出现 U+FFFD 替换字符",
    expect: "red",
    causes: ["LG3"],
    opts: { fffdSrc: true },
    expectText: "app.js",
  },
  {
    id: "LG4",
    label: "产物层出现 U+FFFD 替换字符",
    expect: "red",
    causes: ["LG4"],
    opts: { fffdSite: true },
    expectText: "index.html",
  },
  {
    id: "LG5",
    label: "源文件层一个可扫文件都没有（自证存活）",
    expect: "red",
    causes: ["LG5"],
    opts: { emptySrc: true },
  },
  {
    id: "LG6",
    label: "产物目录 _site 不在场（产物层从未被扫过）",
    expect: "red",
    causes: ["LG6"],
    opts: { noSite: true },
  },
  {
    id: "LG7",
    label: "_site 在场但一个 .html 都没有（产物层空跑）",
    expect: "red",
    causes: ["LG7"],
    opts: { siteNoHtml: true },
  },
  {
    id: "LG8",
    label: "故意判绿：front matter 的整行注释里有中文",
    expect: "green",
    opts: { greenMdComment: true },
  },
  {
    id: "LG9",
    label: "故意判绿：Nunjucks 注释里有中文",
    expect: "green",
    opts: { greenNjkComment: true },
  },
  {
    id: "LG10",
    label: "故意判绿：HTML 注释里有中文",
    expect: "green",
    opts: { greenHtmlComment: true },
  },
  {
    id: "LG11",
    label: "故意判绿：CSS 块注释里有中文",
    expect: "green",
    opts: { greenCssComment: true },
  },
  {
    id: "LG12",
    label: "故意判绿：JS 行注释里有中文",
    expect: "green",
    opts: { greenJsComment: true },
  },
  {
    id: "LG13",
    label: "故意判绿：数据层目录（src/_data）里有中文",
    expect: "green",
    opts: { greenDataLayer: true },
  },
  {
    id: "LG14",
    label: "故意判绿：OG 品牌图目录（src/assets/img/og）里有中文",
    expect: "green",
    opts: { greenOgSvg: true },
  },
  {
    id: "LG15",
    label: "故意判绿：exFAT 资源叉（._*）里有中文",
    expect: "green",
    opts: { greenSidecar: true },
  },
  {
    id: "LG16",
    label: "故意判绿：产物里的非 HTML 文件（feed.xml）里有中文",
    expect: "green",
    opts: { greenNonHtmlProduct: true },
  },
  {
    id: "LG17",
    label: "故意判绿：产物里的内联 <script> / <style> 块里有中文（归 BL* 门禁）",
    expect: "green",
    opts: { greenScriptBlock: true },
  },
  {
    id: "LG18",
    label: "判据级负对照①：门禁副本卸掉 LG1 + LG1 的注入 → 必须转绿",
    expect: "green",
    disableLg: 1,
    opts: { cjkNjk: true },
  },
  {
    id: "LG19",
    label: "判据级负对照②：门禁副本卸掉 LG2 + LG2 的注入 → 必须转绿",
    expect: "green",
    disableLg: 2,
    opts: { cjkSite: true },
  },
  {
    id: "LG20",
    label: "判据级负对照③：门禁副本卸掉 LG3 + LG3 的注入 → 必须转绿",
    expect: "green",
    disableLg: 3,
    opts: { fffdSrc: true },
  },
  {
    id: "LG21",
    label: "判据级负对照④：门禁副本卸掉 LG4 + LG4 的注入 → 必须转绿",
    expect: "green",
    disableLg: 4,
    opts: { fffdSite: true },
  },
  {
    id: "LG22",
    label: "判据级负对照⑤：门禁副本卸掉 LG5 + LG5 的注入 → 必须转绿",
    expect: "green",
    disableLg: 5,
    opts: { emptySrc: true },
  },
  {
    id: "LG23",
    label: "判据级负对照⑥：门禁副本卸掉 LG6 + LG6 的注入 → 必须转绿",
    expect: "green",
    disableLg: 6,
    opts: { noSite: true },
  },
  {
    id: "LG24",
    label: "判据级负对照⑦：门禁副本卸掉 LG7 + LG7 的注入 → 必须转绿",
    expect: "green",
    disableLg: 7,
    opts: { siteNoHtml: true },
  },
  {
    id: "LG25",
    label:
      "判据级负对照⑧（精准性）：门禁副本卸掉 LG1 + 同时注入 LG1 与 LG2 → 必须仍红且红因集合恰为 {LG2}",
    expect: "red",
    causes: ["LG2"],
    disableLg: 1,
    opts: { cjkNjk: true, cjkSite: true },
  },
];

/* ---------------- 跑 ---------------- */

/* 门禁原件的摘要 —— 跑完要比对：负对照改的是**副本**，原件必须逐字节未变。 */
const gateBefore = fs.readFileSync(GATE, "utf8");

let pass = 0;
let fail = 0;
const failures = [];
const covered = new Set();

for (const c of CASES) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-lang-"));
  try {
    const fixture = path.join(tmp, "fixture");
    fs.mkdirSync(fixture, { recursive: true });

    buildFixture(fixture, c.opts || {});

    const gatePath = buildGateCopy(fixture, c.disableLg);

    const r = runGate(gatePath);
    const got = causesOf(r.err);

    if (c.expect === "green") {
      if (r.code === 0 && got.length === 0) {
        pass++;
        console.log(`  ✓ ${c.id} ${c.label} → 判绿（符合预期）`);
      } else {
        fail++;
        failures.push(
          `${c.id} ${c.label}：期望判绿，实际 exit ${r.code}，红因 ${JSON.stringify(got)}\n${r.err.trim()}`
        );
        console.log(`  ✗ ${c.id} ${c.label} → 实际判红（不符合预期）`);
      }
      continue;
    }

    /* 红：exit 必须是 1，红因编号集合必须**完全相等**（多一条、少一条都算失败 ——
       多一条说明还有别的判据在说话（归属不纯），少一条说明这条判据没抓住）。
       集合按**多重集**比（带重复）⇒ 连"同一条判据报了两次"也算失败。 */
    const want = [...c.causes].sort();
    const gotKey = JSON.stringify(got);
    const wantKey = JSON.stringify(want);
    if (r.code !== 1) {
      fail++;
      failures.push(`${c.id} ${c.label}：期望 exit 1，实际 exit ${r.code}\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 未按预期判红（exit ${r.code}）`);
      continue;
    }
    if (gotKey !== wantKey) {
      fail++;
      failures.push(
        `${c.id} ${c.label}：红因编号集合应为 ${wantKey}，实际 ${gotKey}\n${r.err.trim()}`
      );
      console.log(`  ✗ ${c.id} ${c.label} → 红因集合不符（应为 ${wantKey}，实际 ${gotKey}）`);
      continue;
    }
    if (c.expectText && !r.err.includes(c.expectText)) {
      fail++;
      failures.push(`${c.id} ${c.label}：红因里没指名「${c.expectText}」\n${r.err.trim()}`);
      console.log(`  ✗ ${c.id} ${c.label} → 红因没指名目标`);
      continue;
    }
    want.forEach((k) => covered.add(k));
    pass++;
    console.log(`  ✓ ${c.id} ${c.label} → 判红且红因集合恰为 ${wantKey}（符合预期）`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ---------------- 覆盖度自证 ----------------
   门禁每加一条判据，本自测就必须补一档 —— 否则新判据的「能不能变红」没人证明。
   判据编号从**门禁源码里现读**（不写死名单）：新增一条判据、源码里出现它的编号 ⇒
   这里立刻判红，提醒补档。 */
const gateSource = fs.readFileSync(GATE, "utf8");
const gateIds = new Set(
  [...gateSource.matchAll(/\bLG(\d+)\b/g)].map((m) => `LG${m[1]}`)
);
const missing = [...gateIds].filter((id) => !covered.has(id)).sort();
if (missing.length) {
  fail++;
  failures.push(
    `覆盖度自证：门禁里有 ${missing.join("、")}，但本矩阵没有能触发它们的档 —— ` +
      `门禁新加了判据，本自测必须补一档（否则新判据「能不能变红」没人证明）。`
  );
  console.log(`  ✗ 覆盖度自证：${missing.join("、")} 没有对应的注入档`);
}

/* 门禁原件必须逐字节未变（负对照改的是副本）。 */
if (fs.readFileSync(GATE, "utf8") !== gateBefore) {
  fail++;
  failures.push("门禁原件被改了 —— 自测只许改副本，原件必须逐字节未变。");
  console.log("  ✗ 门禁原件被改了");
}

console.log("");
if (fail) {
  console.error(`文本层门禁自测失败：${fail} / ${CASES.length} 档不符预期\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`文本层门禁自测通过：${CASES.length} 档全部按预期触发（覆盖判据 ${[...covered].sort().join("、")}）。`);
