#!/usr/bin/env node
/**
 * check-home-chart.cjs · 首页降水图门禁
 * ---------------------------------------------------------------------------
 * 这张图有两副面孔，都要守：
 *   · 交互层 —— 2026-10-20 之前是**纯静态 SVG**（页面零 JS），ROADMAP M2 第 3 项
 *     把它升级成可交互：悬停读数 + 时间轴游标 + 键盘可达。
 *   · 出处 —— 图注里那段「Data.」。它写错了**没有人会立刻发现**：
 *     链接照样打得开、页面照样好看，只是落点根本不是那篇论文。
 *
 * 交互层一旦接错，**不会有人立刻发现**：
 *   · 读数条上的数与图上画的线对不上 —— 两者都"看着有"，只是数不同；
 *   · 键盘走不到画布 —— 鼠标用户完全无感；
 *   · 游标元素忘了 [hidden] 的配套样式 —— 永远显形，或者永远藏住；
 *   · 模块文件语法坏了 —— 浏览器里静默失败，build 照样绿。
 * 上面四条都不会让构建变红，所以要有这道门禁。
 *
 * 七条判据：
 *   HC1 每个面板的交互钩子齐全（canvas / cursor / dot / readout-main / readout-mean）。
 *   HC2 **读数与数据同源**：SVG 上的 data-chart JSON（years / values / decades）
 *       必须与 src/_data/extremePrecip.json 逐字一致 —— 读数条和画出来的线
 *       说的是同一批数这件事，靠这条判据守着。
 *   HC3 键盘可达：每个画布 tabindex="0" 且有非空 aria-label；读数条有 aria-live。
 *   HC4 交互模块存在、被首页引用、且**语法能过**（按 ESM 解析）。
 *   HC5 样式在位且不踩坑：CSS 里有那几条规则；且 .chart__cursor / .chart__dot
 *       **没有** display 声明 —— 写了就会盖掉 [hidden] 的 display:none，
 *       游标与数据点就永远显形（或永远藏住）。
 *   HC6 动态 import 的 specifier 必须是 URL-like（以 / 、./ 、../ 或绝对 URL 开头）。
 *       bare specifier（看着像路径但不是）只能靠 import map 解析，本仓没有 import map
 *       ⇒ 浏览器抛 "Failed to resolve module specifier"，交互静默消失。
 *       **这条是全仓通用规则，所以扫全部产物页**（论文页的 "../../assets/..." 也在内）。
 *   HC7 出处必须按**登记事实**记录（2026-10-20 D26 场次新增）：
 *       · HC7-1 论文 DOI 必须是 Copernicus **正式发表版**形态
 *         10.5194/<刊>-<卷>-<首页>-<年>，且从 DOI 里读出的**卷 / 首页 / 年**
 *         要与 source.paper 里写的对得上；
 *         预印本 / 讨论页形态（10.5194/<刊>-<年>-<编号>）一律判红 —— 那类 DOI
 *         落点是同行评审往返记录页，不是论文页。
 *       · HC7-2 产物首页图注的「Data.」段必须与真源**逐字一致**：完整论文标题、
 *         每一位创作者、机构、期刊卷期页年都要在，且**不许出现第三个 DOI**。
 *
 * ⚠️ HC7 的边界（写清楚，别把它的保证当无限）：
 *   它守的是「产物与真源不漂移」+「DOI 形态与卷/页/年自洽」。
 *   它**守不了**「真源自己写错」——例如把 creators 少写一位、或者把论文标题
 *   和数据集标题**一起**改成同一个错值（两者仍然自洽）。
 *   论文标题有一个例外被补上了：source.datasetTitle 是**另一份登记记录**
 *   （Zenodo 数据集记录）的标题，HC7 要求 source.paper.title 必须是它的
 *   **后缀** ⇒ 单独截断论文标题会被抓住（原始缺陷正是截断）。
 *   创作者名单没有这个第二锚点 ⇒ 它的正确性靠人工核 + 外部登记核对。
 *
 * 四个输入都可用环境变量改（自测脚本要在**副本**上做注入，不能碰仓库里的文件）：
 *   SITE_DIR          产物目录（默认 _site）
 *   CHART_DATA_PATH   数据 JSON（默认 src/_data/extremePrecip.json）
 *   CHART_JS_PATH     交互模块（默认 src/assets/js/home-chart.js）
 *   CHART_CSS_PATH    样式表（默认 src/assets/css/pages.css）
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = path.resolve(process.env.SITE_DIR || path.join(ROOT, "_site"));
const DATA_PATH = path.resolve(process.env.CHART_DATA_PATH || path.join(ROOT, "src/_data/extremePrecip.json"));
const JS_PATH = path.resolve(process.env.CHART_JS_PATH || path.join(ROOT, "src/assets/js/home-chart.js"));
const CSS_PATH = path.resolve(process.env.CHART_CSS_PATH || path.join(ROOT, "src/assets/css/pages.css"));

const HOME_HTML = path.join(SITE, "index.html");

let problems = 0;
function bad(msg) {
  problems += 1;
  console.error(`  ✗ ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

/* ---------- 读输入 ---------- */
function readOrNull(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch (_) {
    return null;
  }
}

const html = readOrNull(HOME_HTML);
if (html === null) {
  console.error(`  ✗ 找不到首页产物：${HOME_HTML}`);
  process.exit(1);
}
const dataText = readOrNull(DATA_PATH);
if (dataText === null) {
  console.error(`  ✗ 找不到数据文件：${DATA_PATH}`);
  process.exit(1);
}
const jsText = readOrNull(JS_PATH);
if (jsText === null) {
  console.error(`  ✗ 找不到交互模块：${JS_PATH}`);
  process.exit(1);
}
const cssText = readOrNull(CSS_PATH);
if (cssText === null) {
  console.error(`  ✗ 找不到样式表：${CSS_PATH}`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(dataText);
} catch (e) {
  console.error(`  ✗ 数据文件解析失败：${e.message}`);
  process.exit(1);
}

/* ---------- 取每个面板的 data-chart JSON ---------- */
const chartBlobs = [];
{
  const re = /data-chart="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    try {
      chartBlobs.push(JSON.parse(raw));
    } catch (e) {
      bad(`data-chart 不是合法 JSON：${e.message}`);
    }
  }
}

/* ---------- HC1 钩子齐全 ---------- */
{
  // ⚠️ 面板数只数**属性**：`data-chart-panel` 这个字符串在页面里的 <script> 块中
  // 也出现过一次（模块的 querySelector），按"出现次数"数会把面板数多算一个。
  // 所以这里要求后面跟的是属性结束符（空格或 >），不含 "]"。
  const panels = (html.match(/data-chart-panel(?=[ >])/g) || []).length;
  const needed = [
    ["data-chart-canvas", "画布"],
    ["data-chart-cursor", "游标"],
    ["data-chart-dot", "数据点"],
    ["data-chart-readout-main", "读数主行"],
    ["data-chart-readout-mean", "读数十年均值行"],
  ];
  let missing = [];
  for (const [attr, label] of needed) {
    const n = (html.match(new RegExp(`${attr}(?![-\\w])`, "g")) || []).length;
    if (n < panels) missing.push(`${label}（${attr}）`);
  }
  if (panels === 0) bad("HC1 首页里一个 data-chart-panel 都没有 —— 交互层没接上");
  else if (missing.length) bad(`HC1 面板数 ${panels}，但这些钩子不够：${missing.join("、")}`);
  else ok(`HC1 交互钩子齐全（${panels} 个面板 × ${needed.length} 个钩子）`);
}

/* ---------- HC2 读数与数据同源 ---------- */
{
  if (chartBlobs.length !== data.panels.length) {
    bad(`产物里的图表数（${chartBlobs.length}）与数据里的面板数（${data.panels.length}）对不上`);
  } else {
    let diffs = [];
    data.panels.forEach((panel, i) => {
      const blob = chartBlobs[i];
      if (!blob) return;
      const yv = JSON.stringify(blob.years) !== JSON.stringify(data.years);
      if (yv) diffs.push(`${panel.key}：years 与数据文件不一致`);
      const vv = JSON.stringify(blob.values) !== JSON.stringify(panel.values);
      if (vv) diffs.push(`${panel.key}：values 与数据文件不一致`);
      const expectDecades = panel.decadal.map((d) => ({
        label: d.label,
        start: d.start,
        nYears: d.nYears,
        value: d.value,
      }));
      const dd = JSON.stringify(blob.decades) !== JSON.stringify(expectDecades);
      if (dd) diffs.push(`${panel.key}：decades 与数据文件不一致`);
      if (!blob.plot || !blob.scale || !blob.unit) {
        diffs.push(`${panel.key}：缺 plot / scale / unit，交互层算不出位置`);
      }
    });
    if (diffs.length) diffs.forEach((d) => bad(`HC2 ${d}`));
    else ok(`HC2 读数与 src/_data/extremePrecip.json 逐字一致（${data.panels.length} 个面板）`);
  }
}

/* ---------- HC3 键盘可达 ---------- */
{
  const canvases = (html.match(/data-chart-canvas(?![-\w])/g) || []).length;
  const focusable = (html.match(/data-chart-canvas(?![-\w])[^>]*tabindex="0"/g) || []).length;
  const labelled = (html.match(/data-chart-canvas(?![-\w])[^>]*aria-label="[^"]+"/g) || []).length;
  const live = (html.match(/data-chart-readout(?![-\w])[^>]*aria-live="(polite|assertive)"/g) || []).length;
  if (canvases === 0) bad("HC3 找不到画布元素");
  else if (focusable < canvases) bad(`HC3 有 ${canvases} 个画布，但只有 ${focusable} 个可聚焦（tabindex="0"）`);
  else if (labelled < canvases) bad(`HC3 有 ${canvases} 个画布，但只有 ${labelled} 个带 aria-label`);
  else if (live < canvases) bad(`HC3 有 ${canvases} 个读数条，但只有 ${live} 个带 aria-live`);
  else ok(`HC3 键盘可达（${canvases} 个画布可聚焦、有标签，读数条是 live region）`);
}

/* ---------- HC4 模块存在、被引用、语法能过 ---------- */
{
  if (!html.includes("home-chart.js")) {
    bad("HC4 首页没有引用交互模块 home-chart.js");
  } else {
    // ESM 语法检查：node --check 按 CommonJS 解析会拒绝 export，
    // 所以先复制成 .mjs 再让 node 自己解析一遍（不引入任何依赖）。
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mh-homechart-")), "home-chart.mjs");
    fs.writeFileSync(tmp, jsText);
    let syntaxOk = true;
    let detail = "";
    try {
      execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    } catch (e) {
      syntaxOk = false;
      detail = (e.stderr ? e.stderr.toString() : e.message).split("\n").slice(0, 4).join(" ");
    }
    if (!syntaxOk) bad(`HC4 交互模块语法不过：${detail}`);
    else ok("HC4 交互模块存在、被首页引用、语法能过（按 ESM 解析）");
  }
}

/* ---------- HC6 动态 import 的 specifier 必须是 URL-like ---------- */
{
  /* 这条规则是**全仓通用**的，所以这里扫**全部产物页**，不只首页。
   *
   * 规则出处：ES 模块规范把 import() 的 specifier 分成两类 ——
   *   · URL-like：以 "/"、"./"、"../" 开头，或是绝对 URL（scheme://…）
   *   · bare specifier：其余（看起来像路径，但不是）
   * bare specifier 只能靠 **import map** 解析；本仓没有 import map，
   * 于是浏览器直接抛 "Failed to resolve module specifier"：
   * 页面静默失去交互，build 照样绿，静态门禁也照样绿。
   *
   * 这是 2026-10-20 实测踩到的真坑（首页图表第一版就写成了
   * import("assets/js/home-chart.js")，没有 "./" 前缀 ⇒ 整张图点不动）：
   *   import("assets/js/x.js")    → 失败（bare）
   *   import("./assets/js/x.js")   → 正常
   *   import("../../assets/js/x.js") → 正常（论文页那种，一直是好的）
   * 注意 new URL(spec, base) 对 bare 形式**也**能解析成功 ——
   * 所以不能靠 URL API 判断，必须按模块规范的分类来判断。
   */
  const ABS_URL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
  const isUrlLike = (spec) =>
    spec.startsWith("/") || spec.startsWith("./") || spec.startsWith("../") || ABS_URL.test(spec);

  const htmlFiles = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".html")) htmlFiles.push(full);
    }
  })(SITE);

  const bare = [];
  let scanned = 0;
  const re = /\bimport\(\s*(["'])([^"']+)\1\s*\)/g;
  for (const file of htmlFiles) {
    const text = readOrNull(file);
    if (text === null) continue;
    let m;
    while ((m = re.exec(text)) !== null) {
      scanned += 1;
      if (!isUrlLike(m[2])) {
        bare.push(`${path.relative(ROOT, file)} :: import("${m[2]}")`);
      }
    }
  }
  if (bare.length) {
    bare.forEach((b) =>
      bad(`HC6 ${b} —— bare specifier：浏览器要靠 import map 才解析得了，本仓没有 import map ⇒ Chrome 抛 "Failed to resolve module specifier"，交互静默消失。改成 "./" 开头。`)
    );
  } else {
    ok(`HC6 ${scanned} 处动态 import 的 specifier 全是 URL-like（扫了 ${htmlFiles.length} 个产物页）`);
  }
}

/* ---------- HC5 样式在位且不踩 [hidden] 的坑 ---------- */
{
  const rules = [".chart__canvas", ".chart__cursor", ".chart__dot", ".chart__readout"];
  const missing = rules.filter((sel) => !new RegExp(`\\${sel}\\s*\\{`).test(cssText));
  if (missing.length) {
    bad(`HC5 样式表里没有这些规则：${missing.join("、")}`);
  } else {
    // display 会盖掉 [hidden] 的 display:none —— 游标就永远显形
    const displayOffenders = [];
    for (const sel of [".chart__cursor", ".chart__dot"]) {
      const re = new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`, "g");
      let m;
      while ((m = re.exec(cssText)) !== null) {
        if (/display\s*:/.test(m[1])) displayOffenders.push(sel);
      }
    }
    if (displayOffenders.length) {
      bad(`HC5 ${[...new Set(displayOffenders)].join("、")} 写了 display —— 会盖掉 [hidden]，元素藏不住`);
    } else {
      ok("HC5 交互层样式在位，且没有 display 声明去踩 [hidden] 的坑");
    }
  }
}

/* ---------- HC7 出处必须按登记事实记录 ---------- */
{
  const src = data.source || {};
  const paper = src.paper || {};
  const diffs = [];
  let skipped = 0;

  /* --- HC7-1 论文 DOI 形态必须能读出卷 / 首页 / 年 --- */
  /* Copernicus 有两种 DOI 形态，长得几乎一样：
   *   正式发表版：10.5194/<刊>-<卷>-<首页>-<年>    （如 essd-17-3987-2025）
   *   预印本/讨论页：10.5194/<刊>-<年>-<编号>      （如 essd-2025-20）
   * 后者落点是**同行评审往返记录页**（...-discussion.html），不是论文页 ——
   * 引用它等于把「这篇论文在哪」指错了，而链接**照样打得开**，没人会发现。
   */
  const doi = String(paper.doi || "");
  if (!doi) {
    diffs.push("source.paper.doi 是空的 —— 出处没写");
  } else if (!doi.startsWith("10.5194/")) {
    // 别的出版商形态不同，不猜它的结构；只在通过文案里报跳过数
    skipped += 1;
  } else {
    const pub = /^10\.5194\/[a-z]+-(\d+)-(\d+)-(\d{4})$/.exec(doi);
    const pre = /^10\.5194\/[a-z]+-(\d{4})-(\d+)$/.exec(doi);
    if (!pub) {
      diffs.push(
        `source.paper.doi（${doi}）不是 Copernicus 正式发表版形态` +
          (pre
            ? " —— 这是**预印本 / 讨论页**形态（10.5194/<刊>-<年>-<编号>），落点是同行评审往返记录页，不是论文页；正式发表版形如 10.5194/essd-17-3987-2025。"
            : " —— 正式发表版形如 10.5194/<刊>-<卷>-<首页>-<年>。")
      );
    } else {
      const doiVolume = pub[1];
      const doiFirstPage = pub[2];
      const doiYear = pub[3];
      if (String(paper.volume) !== doiVolume) {
        diffs.push(`DOI 里读出的卷是 ${doiVolume}，source.paper.volume 写的是 ${paper.volume}`);
      }
      if (String(paper.year) !== doiYear) {
        diffs.push(`DOI 里读出的年是 ${doiYear}，source.paper.year 写的是 ${paper.year}`);
      }
      const pages = String(paper.pages || "");
      const pg = /^(\d+)-(\d+)$/.exec(pages);
      if (!pg) {
        diffs.push(`source.paper.pages（${pages}）不是「起-止」形态`);
      } else {
        if (pg[1] !== doiFirstPage) {
          diffs.push(`DOI 里读出的首页是 ${doiFirstPage}，source.paper.pages 的首页写的是 ${pg[1]}`);
        }
        if (Number(pg[2]) <= Number(pg[1])) {
          diffs.push(`source.paper.pages（${pages}）的末页不大于首页`);
        }
      }
    }
  }

  /* --- 论文标题必须是数据集登记标题的后缀 --- */
  /* 这是**第二份登记记录**给的第一道交叉校验：
   * Zenodo 数据集记录的标题 = 数据集短名 + "：" + 论文标题（ESSD 那篇的标题）。
   * 论文标题一旦被**单独截断**，这个后缀关系立刻不成立 ⇒ 能抓住原始缺陷那一类。
   * ⚠️ 但把**两个**字段一起改成同一个错值，它仍然自洽 ⇒ 抓不到（见文件头的边界说明）。
   */
  const datasetTitle = String(src.datasetTitle || "");
  const paperTitle = String(paper.title || "");
  if (!datasetTitle) {
    diffs.push("source.datasetTitle 是空的 —— 少了一个对照锚点，论文标题无从校验");
  } else if (!paperTitle) {
    diffs.push("source.paper.title 是空的 —— 论文标题没写");
  } else if (!datasetTitle.endsWith(paperTitle)) {
    diffs.push(
      `source.paper.title（${paperTitle}）不是 source.datasetTitle（${datasetTitle}）的后缀 —— 论文标题被截断，或与数据集登记标题对不上`
    );
  }

  /* --- HC7-2 产物首页「Data.」段必须与真源逐字一致 --- */
  // 与 Nunjucks 的自动转义对齐（& 先转，再 < > "），否则标题里带 & 时两边对不上。
  // 实体名里的 & 用 String.fromCharCode(38) 拼 —— 直接写字面量在编辑链路上
  // 容易被当成转义序列吞掉（这次就踩了，写出来成了空操作）。
  const AMP = String.fromCharCode(38);
  const ENT = { "&": AMP + "amp;", "<": AMP + "lt;", ">": AMP + "gt;", '"': AMP + "quot;" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ENT[c]);

  // 取图注的「Data.」段（只取第一段），而不是整页 —— 整页查会到处是误命中
  const capIdx = html.indexOf('class="chart__caption"');
  const dataIdx = capIdx >= 0 ? html.indexOf("<strong>Data.</strong>", capIdx) : -1;
  const endIdx = dataIdx >= 0 ? html.indexOf("</p>", dataIdx) : -1;
  if (capIdx < 0 || dataIdx < 0 || endIdx < 0) {
    diffs.push('产物首页图注里找不到「Data.」段');
  } else {
    const seg = html.slice(dataIdx, endIdx);
    // 模板里换行排版 ⇒ HTML 源码里是换行+缩进，比对前先把空白压成单空格
    const flat = seg.replace(/\s+/g, " ");

    // ① DOI：段里出现且只出现这两个
    const wantHrefs = [];
    if (src.dataDoi) wantHrefs.push("https://doi.org/" + src.dataDoi);
    else diffs.push("source.dataDoi 是空的 —— 数据集出处没写");
    if (doi) wantHrefs.push("https://doi.org/" + doi);
    const foundHrefs = [...seg.matchAll(/href="(https:\/\/doi\.org\/[^"]*)"/g)].map((m) => m[1]);
    const foundSet = new Set(foundHrefs);
    for (const want of wantHrefs) {
      if (!foundSet.has(want)) diffs.push(`图注的「Data.」段里没有 ${want}`);
    }
    for (const got of foundSet) {
      if (!wantHrefs.includes(got)) diffs.push(`图注的「Data.」段里出现了不该有的 DOI 链接 ${got}`);
    }

    // ② 论文标题（完整）、③ 每一位创作者、④ 机构
    if (paperTitle && !flat.includes(esc(paperTitle))) {
      diffs.push("图注的「Data.」段里没有完整的论文标题");
    }
    for (const c of src.creators || []) {
      if (!flat.includes(esc(c))) diffs.push(`图注的「Data.」段里没有创作者 ${c}`);
    }
    if (src.affiliation && !flat.includes(esc(src.affiliation))) {
      diffs.push("图注的「Data.」段里没有机构");
    }

    // ⑤ 期刊卷期页年 —— 拼成一串再比，免得「17」「8」这种短数字各自撞上别处
    if (paper.journal && paper.volume && paper.issue && paper.pages && paper.year) {
      const cite = `${paper.journal}, ${paper.volume}(${paper.issue}), ${paper.pages}, ${paper.year}`;
      if (!flat.includes(esc(cite))) {
        diffs.push(`图注的「Data.」段里没有「${cite}」这一串期刊卷期页年`);
      }
    } else {
      diffs.push("source.paper 里的期刊 / 卷 / 期 / 页 / 年没写全");
    }
  }

  if (diffs.length) {
    diffs.forEach((d) => bad(`HC7 ${d}`));
  } else {
    ok(
      `HC7 出处按登记事实记录（论文 DOI ${doi}：卷 ${paper.volume} / 首页 ${String(paper.pages).split("-")[0]} / 年 ${paper.year} 自洽；` +
        `标题与数据集登记标题成后缀关系；产物「Data.」段与真源逐字一致，含 ${(src.creators || []).length} 位创作者` +
        (skipped ? `；跳过 ${skipped} 个非 Copernicus 前缀的 DOI` : "") +
        "）"
    );
  }
}

if (problems) {
  console.error(`\n首页降水图门禁未通过：${problems} 项不符预期。`);
  process.exit(1);
}
console.log(
  "首页降水图门禁通过：钩子齐全、读数与数据同源、键盘可达、模块与样式都在位、动态 import 全部可解析、出处与登记事实一致。"
);
