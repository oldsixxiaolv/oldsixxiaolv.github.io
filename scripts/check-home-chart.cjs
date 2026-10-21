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
 * 九条判据：
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
 *   HC8 区域必须被**定义**，不许悬空指代（2026-10-21 D30 场次新增）：
 *       · HC8-1 真源里的 `region` 必须是结构化对象 `{ bbox, landGridpoints }`
 *         —— 坐标与格点数要各自可渲染、可比对，不能塞在一个没人渲染的字符串里；
 *       · HC8-2 产物图注里必须逐字出现 `region.bbox` 与 `region.landGridpoints`；
 *       · HC8-3 **顺序**：图注里出现「the box」时，区域范围必须排在它**之前** ——
 *         指代要有先行词；范围写在后面，指代照样悬空。
 *       原始缺陷形态：图注写「land gridpoints inside the box only」，而**全站
 *       从未说过这个 box 在哪**（数据文件里有坐标，却从未被渲染）⇒ 读者被告知
 *       「排除了蒙古和海」，却没被告知「包含的是哪一块」。
 *   HC9 发布的统计量必须**能从发布的年度值复现**（2026-10-21 D31 场次新增）：
 *       图上的每一个数（十年均值、趋势斜率、Mann-Kendall p 值、summary 里的派生量）
 *       都是**由年度值算出来的**，不是另外抄进来的。发布值只保留 3 位小数，而统计量
 *       在全精度序列上算 —— 这条判据负责把两者对上：
 *       · HC9-1 每个十年均值 = 由该十年的年度值重算（容差 = 发布值的半格 + 年度值的舍入传播）；
 *       · HC9-2 趋势斜率 = 由全部年度值重算的最小二乘斜率（每十年）；
 *       · HC9-3 Mann-Kendall p 值 = 由年度值重算的 S → 双侧正态近似 p，
 *         与发布值 toFixed(4) **逐字相等**；并列必须按 precision.roundedTies 的登记解算，
 *         且「发布值里的并列对集合」必须与「登记的并列对集合」完全一致；
 *       · HC9-4 summary 里的派生量（均值、极值与极值年份、超过旧最大值的年份、
 *         最近十年的均值、早期十年均值的区间）都能由年度值重算。
 *       原始缺陷形态：这些派生量是离线算好存进去的，与同一文件里的年度值**没有任何
 *       校验关系** —— 改一个年度值，图会动，而「What it shows.」里的 0.556 /
 *       p=0.0401 / 25.4% / 533.6 mm **全部原地不动**，build 照样全绿；其中 p 与 0.05 的
 *       关系直接决定站内写「rose … over the full record」还是「not significant」
 *       ⇒ 结论会静默翻转。而且 panel B 的 p 值**当下就无法复现**：发布值只保留 3 位小数，
 *       四舍五入把 1961 与 2004 两个不同的真值压成同一个 52.605，造出一条人造并列。
 *
 * ⚠️ HC9 的边界（写清楚，别把它的保证当无限）：
 *   它守的是「派生量与年度值自洽」。它**守不了**「年度值本身对不对」——
 *   有人把整条序列换成一个自洽但错误的版本（连同所有派生量一起重算），它照样判绿。
 *   年度值的正确性靠人工核 + 外部登记核对（DataCite / 出版商页面）。
 *   另一处已知边界：并列解算的**方向**（哪一年更大）是人写的声明，门禁只能靠
 *   「发布 p 值必须与该声明下的重算值一致」来交叉验证；声明与发布值一起改错时仍然自洽。
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

/* ---------- HC8 区域必须被定义（不许悬空指代） ---------- */
{
  const region = data.region;
  const diffs = [];

  // --- 真源侧：region 必须是结构化对象 ---
  // 旧形态是一个字符串（"North China, 32-50 N, 110-120 E"），而**全仓无人渲染它**。
  // 坐标与格点数要能各自独立渲染、也各自能被门禁比对，所以不能塞在一个字符串里。
  if (!region || typeof region !== "object" || Array.isArray(region)) {
    diffs.push(
      "真源里的 region 不是结构化对象（应为 { bbox, landGridpoints }）—— " +
        "区域范围与陆地格点数必须各自可渲染、可比对，不能塞在一个字符串里"
    );
  } else {
    if (!region.bbox) diffs.push("真源里的 region.bbox 是空的 —— 区域范围没写");
    if (!region.landGridpoints) {
      diffs.push("真源里的 region.landGridpoints 是空的 —— 陆地格点数没写");
    }
  }

  // --- 产物侧：图注里必须出现坐标与格点数，且坐标必须排在「the box」之前 ---
  // 「the box」是个**指代**：读者要能知道它指哪一块，就必须在同一段图注里
  // 先看到那个框的范围。顺序也守 —— 范围写在「the box」后面，指代照样悬空。
  const capIdx = html.indexOf('class="chart__caption"');
  const capEnd = capIdx >= 0 ? html.indexOf("</figcaption>", capIdx) : -1;
  if (capIdx < 0 || capEnd < 0) {
    diffs.push("产物首页图注里找不到 <figcaption> 段");
  } else {
    // 与 Nunjucks 的自动转义对齐（& 先转，再 < > "）
    const AMP = String.fromCharCode(38);
    const ENT = { "&": AMP + "amp;", "<": AMP + "lt;", ">": AMP + "gt;", '"': AMP + "quot;" };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ENT[c]);
    // 模板里换行排版 ⇒ HTML 源码里是换行+缩进，比对前先把空白压成单空格
    const flat = html.slice(capIdx, capEnd).replace(/\s+/g, " ");

    if (region && typeof region === "object" && region.bbox) {
      const bbox = esc(region.bbox);
      const bboxIdx = flat.indexOf(bbox);
      if (bboxIdx < 0) {
        diffs.push(
          `图注里没有区域范围「${region.bbox}」—— 读者无从知道这个框在哪（真源里有，产物里没渲染）`
        );
      } else if (region.landGridpoints && !flat.includes(esc(region.landGridpoints))) {
        diffs.push(`图注里没有陆地格点数「${region.landGridpoints}」`);
      }

      // 悬空指代检查：「the box」出现时，范围必须排在它前面
      const boxIdx = flat.toLowerCase().indexOf("the box");
      if (boxIdx >= 0 && bboxIdx >= 0 && bboxIdx > boxIdx) {
        diffs.push(
          `图注里出现「the box」，但区域范围排在它**后面** —— 这个指代没有先行词，读者还是不知道指的是哪一块`
        );
      }
    }
  }

  if (diffs.length) {
    diffs.forEach((d) => bad(`HC8 ${d}`));
  } else {
    ok(
      `HC8 区域已写明（图注里逐字出现 ${data.region.bbox} 与 ${data.region.landGridpoints} 个陆地格点数；` +
        "范围排在「the box」之前，指代有先行词）"
    );
  }
}

/* ---------- HC9 用的小工具 ---------- */

/* 本站派生量的**发布精度**（位数）。
   ⚠️ 这张表放在**门禁里**、而不是真源里，是有意的：
   容差必须按「本站约定用几位小数发布这个量」来算，**不能**按被检查的那个数
   自己的小数位来算 —— 后者是自指的：把 0.556 改成 0.6，发布位数从 3 掉到 1，
   容差跟着从 ±0.0005 放宽到 ±0.05，**缺陷反而被容差吞掉了**。
   放进真源也一样糟：真源里的任何字段都能被顺手改宽。
   （这张表对应的自测档位是 M21 —— 它就是被这条自引用坑出来的。）
   真值落在 ±半格内，再叠加年度值本身的舍入传播（valueEps）。 */
const STAT_DECIMALS = {
  decadalValue: 2, // panels[].decadal[].value
  trendPerDecade: 3, // panels[].trend.perDecade
  mkP: 4, // panels[].trend.mkP / mkPto2019
  meanSharePct: 1, // summary.meanSharePct
  meanRx1dayMm: 2, // summary.meanRx1dayMm
  shareRecordValue: 1, // summary.shareRecordValue
  sharePre2020MaxValue: 1, // summary.sharePre2020MaxValue
  recentSharePct: 2, // summary.recentSharePct
  recentRx1dayMm: 2, // summary.recentRx1dayMm
  earlierRx1dayRange: 1, // summary.earlierRx1dayRange
};
const STAT_HALF = {};
for (const [k, v] of Object.entries(STAT_DECIMALS)) STAT_HALF[k] = 0.5 * Math.pow(10, -v);

/* 消息里的数：去掉多余的 0，最多留 6 位 */
function num(x) {
  if (!isFinite(x)) return String(x);
  return x
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

/* Hart 1968 标准正态 CDF（双精度；比 erf 近似的 3e-7 稳一个量级） */
function normCdf(z) {
  const y = Math.abs(z);
  if (y > 37) return z > 0 ? 1 : 0;
  const e = Math.exp((-y * y) / 2);
  let tail;
  if (y < 7.07106781186547) {
    let b = 3.52624965998911e-02 * y + 0.700383064443688;
    b = b * y + 6.37396220353165;
    b = b * y + 33.912866078383;
    b = b * y + 112.079291497871;
    b = b * y + 221.213596169931;
    b = b * y + 220.206867912376;
    tail = e * b;
    b = 8.83883476483184e-02 * y + 1.75566716318264;
    b = b * y + 16.064177579207;
    b = b * y + 86.7807322029461;
    b = b * y + 296.564248779674;
    b = b * y + 637.333633378831;
    b = b * y + 793.826512519948;
    b = b * y + 440.413735824752;
    tail = tail / b;
  } else {
    let b = y + 0.65;
    b = y + 4.0 / b;
    b = y + 3.0 / b;
    b = y + 2.0 / b;
    b = y + 1.0 / b;
    tail = e / b / 2.506628274631;
  }
  return z > 0 ? 1 - tail : tail;
}

/* Mann-Kendall 的 S：并列计 0（与 scipy.stats.kendalltau 同口径） */
function mkS(values) {
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      s += values[j] > values[i] ? 1 : values[j] < values[i] ? -1 : 0;
    }
  }
  return s;
}

/* 双侧正态近似 p：方差不做并列校正（与 scipy.stats.kendalltau 同口径） */
function mkPValue(S, n) {
  if (n < 2) return NaN;
  const varS = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = Math.abs(S) / Math.sqrt(varS);
  return 2 * (1 - normCdf(z));
}

/* 最小二乘斜率（每十年） */
function olsPerDecade(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num_ = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num_ += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return (num_ / den) * 10;
}

/* 斜率的最坏情况传播：δslope ≤ ε·Σ|x−x̄| / Σ(x−x̄)²，再乘 10 换成「每十年」 */
function olsSlopeEps(xs, eps) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  let sabs = 0;
  let sxx = 0;
  for (const x of xs) {
    sabs += Math.abs(x - mx);
    sxx += (x - mx) ** 2;
  }
  return (eps * sabs / sxx) * 10 + 1e-9;
}

/* 发布值里舍入后相等的并列组 */
function tieGroups(values) {
  const m = new Map();
  values.forEach((v, i) => {
    if (!m.has(v)) m.set(v, []);
    m.get(v).push(i);
  });
  return [...m.values()].filter((idx) => idx.length > 1);
}

/* 一组数实际发布到几位小数（取最多的那个；整数算 0 位） */
function maxDecimals(values) {
  let max = 0;
  for (const v of values) {
    const s = String(v);
    const dot = s.indexOf(".");
    if (dot < 0) continue;
    const d = s.length - dot - 1;
    if (d > max) max = d;
  }
  return max;
}

/* ---------- HC9 发布的统计量必须能从发布的年度值复现 ---------- */
{
  const diffs = [];
  const years = Array.isArray(data.years) ? data.years : [];
  const panels = Array.isArray(data.panels) ? data.panels : [];
  const prec = data.precision;

  /* --- 前提 1：precision 块必须在，还要写明发布精度 --- */
  if (!prec || typeof prec !== "object" || Array.isArray(prec)) {
    diffs.push(
      "真源里没有 precision 块 —— 「发布值是全精度序列的舍入副本、统计量在全精度上算」这件事必须写下来，" +
        "否则接手的人无从判断该按什么精度核这些数字"
    );
  } else if (!(Number(prec.valuesDecimals) > 0)) {
    diffs.push("precision.valuesDecimals 没写 —— 不知道年度值保留了几位小数，容差算不出来");
  }

  /* --- 前提 1b：声明的发布精度必须与年度值实际的小数位对得上 --- */
  /* valuesDecimals 决定「年度值的舍入能传播多大的误差」⇒ 它同时是容差的一根杠杆。
   * 声明与数据必须一致，否则改一下声明就能把判据悄悄放宽。 */
  if (prec && Number(prec.valuesDecimals) > 0) {
    for (const panel of panels) {
      if (!Array.isArray(panel.values) || !panel.values.length) continue;
      const actual = maxDecimals(panel.values);
      if (actual !== Number(prec.valuesDecimals)) {
        diffs.push(
          `${panel.key}：precision.valuesDecimals 声明 ${prec.valuesDecimals} 位小数，但年度值实际发布到 ${actual} 位 —— ` +
            "声明与数据对不上，容差算出来的宽窄就是错的"
        );
      }
    }
  }

  /* --- 前提 2：years 与每个面板的 values 对齐 --- */
  let canCompute = years.length > 0 && panels.length > 0;
  for (const panel of panels) {
    if (!Array.isArray(panel.values) || panel.values.length !== years.length) {
      diffs.push(
        `${panel.key}：values 的长度（${(panel.values || []).length}）与 years 的长度（${years.length}）不一致`
      );
      canCompute = false;
    }
  }

  /* --- 前提 3：「至 2019」的截止年由数据推导（最后一个十年的起始年 − 1），不硬编码 --- */
  const decadalOf = (p) => (Array.isArray(p.decadal) && p.decadal.length ? p.decadal : []);
  const lastDecadal = panels.length ? decadalOf(panels[0])[decadalOf(panels[0]).length - 1] : null;
  const cutoffYear = lastDecadal ? lastDecadal.start - 1 : null;
  const cutoffIndex = cutoffYear === null ? -1 : years.indexOf(cutoffYear);
  if (cutoffIndex < 0) {
    diffs.push(
      `推不出「至 ${cutoffYear}」的截止年：years 里没有 ${cutoffYear} —— 截止年应由最后一个十年的起始年 − 1 推导，不该硬编码`
    );
    canCompute = false;
  }

  if (!canCompute) {
    diffs.forEach((d) => bad(`HC9 ${d}`));
  } else {
    // 年度值只发布到 valuesDecimals 位小数 ⇒ 每个值的舍入误差 ≤ 半格，均值传播后仍是半格
    const valueEps = 0.5 * Math.pow(10, -Number(prec.valuesDecimals)) + 1e-9;
    const slopeEps = olsSlopeEps(years, valueEps);
    const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const maxIdxOf = (arr) => arr.reduce((bi, v, i) => (v > arr[bi] ? i : bi), 0);

    /* ---- HC9-1 十年均值：由该十年的年度值重算 ---- */
    for (const panel of panels) {
      for (const dec of decadalOf(panel)) {
        const i0 = years.indexOf(dec.start);
        if (i0 < 0) {
          diffs.push(`${panel.key}：十年段 ${dec.label} 的起始年 ${dec.start} 不在 years 里`);
          continue;
        }
        const slice = panel.values.slice(i0, i0 + dec.nYears);
        if (slice.length !== dec.nYears) {
          diffs.push(`${panel.key}：十年段 ${dec.label} 取不满 ${dec.nYears} 年`);
          continue;
        }
        const mean = meanOf(slice);
        const tol = STAT_HALF.decadalValue + valueEps;
        if (Math.abs(mean - dec.value) > tol) {
          diffs.push(
            `${panel.key}：十年均值 ${dec.label} 发布 ${dec.value}，由年度值重算得 ${num(mean)}（容差 ${num(tol)}）`
          );
        }
      }
    }

    /* ---- HC9-2 趋势斜率：由全部年度值重算 ---- */
    for (const panel of panels) {
      const pub = (panel.trend || {}).perDecade;
      if (pub === undefined) {
        diffs.push(`${panel.key}：trend.perDecade 没写`);
        continue;
      }
      const sl = olsPerDecade(years, panel.values);
      const tol = STAT_HALF.trendPerDecade + slopeEps;
      if (Math.abs(sl - pub) > tol) {
        diffs.push(
          `${panel.key}：趋势发布 ${pub}/十年，由年度值重算得 ${num(sl)}（容差 ${num(tol)}）`
        );
      }
    }

    /* ---- HC9-3 Mann-Kendall p 值：重算 S → 双侧正态近似 p，与发布值逐字比 ---- */
    const declared = Array.isArray(prec.roundedTies) ? prec.roundedTies : [];
    for (const panel of panels) {
      const trend = panel.trend || {};
      const decl = declared.filter((t) => t && t.panel === panel.key);

      // ① 发布值里舍入后相等的并列对
      const foundPairs = [];
      for (const g of tieGroups(panel.values)) {
        if (g.length > 2) {
          diffs.push(
            `${panel.key}：${g.length} 个年度值舍入后相等（${g.map((i) => years[i]).join("、")}）—— ` +
              "自动解算不了这种并列组，得在 precision.roundedTies 里登记完整次序"
          );
          continue;
        }
        foundPairs.push([years[g[0]], years[g[1]]].sort((a, b) => a - b));
      }
      // ② 与登记核对：两个集合必须完全一样
      const declPairs = [];
      for (const t of decl) {
        if (!Array.isArray(t.years) || t.years.length !== 2) {
          diffs.push(`${panel.key}：precision.roundedTies 里有一条 years 不是两个年份 —— 并列对必须写清是哪两年`);
          continue;
        }
        declPairs.push(t.years.slice().sort((a, b) => a - b));
      }
      const foundSet = new Set(foundPairs.map((p) => p.join("+")));
      const declSet = new Set(declPairs.map((p) => p.join("+")));
      for (const k of foundSet) {
        if (!declSet.has(k)) {
          diffs.push(
            `${panel.key}：年度值 ${k} 两年舍入后相等（这是四舍五入造出来的并列），但 precision.roundedTies 里没登记 —— ` +
              "并列解不出来，p 值无从复现"
          );
        }
      }
      for (const k of declSet) {
        if (!foundSet.has(k)) {
          diffs.push(`${panel.key}：precision.roundedTies 登记了并列对 ${k}，但年度值里这两年的数并不相等 —— 登记与数据对不上`);
        }
      }
      // ③ 登记本身要合法
      let declBroken = false;
      for (const t of decl) {
        if (!Array.isArray(t.years) || t.years.length !== 2) continue;
        const [ya, yb] = t.years.slice().sort((a, b) => a - b);
        const ia = years.indexOf(ya);
        const ib = years.indexOf(yb);
        if (ia < 0 || ib < 0) {
          diffs.push(`${panel.key}：precision.roundedTies 里的并列对 ${ya}+${yb} 有年份不在 years 里`);
          declBroken = true;
          continue;
        }
        if (panel.values[ia] !== panel.values[ib]) {
          diffs.push(
            `${panel.key}：登记的并列对 ${ya}+${yb} 在年度值里并不相等（${panel.values[ia]} vs ${panel.values[ib]}）`
          );
          declBroken = true;
        }
        if (t.roundedValue !== undefined && Number(t.roundedValue) !== Number(panel.values[ia])) {
          diffs.push(
            `${panel.key}：并列对 ${ya}+${yb} 登记的 roundedValue 是 ${t.roundedValue}，年度值里是 ${panel.values[ia]}`
          );
        }
        if (t.resolvedOrder !== "ascending" && t.resolvedOrder !== "descending") {
          diffs.push(
            `${panel.key}：并列对 ${ya}+${yb} 的 resolvedOrder 只能是 "ascending"（早的一年更小）或 "descending"`
          );
          declBroken = true;
        }
      }

      // ④ 重算 p：全序列 + 「至截止年」
      const segs = [
        { tag: "mkP", pub: trend.mkP, seg: panel.values },
        { tag: "mkPto2019", pub: trend.mkPto2019, seg: panel.values.slice(0, cutoffIndex + 1) },
      ];
      for (const sg of segs) {
        if (sg.pub === undefined) {
          diffs.push(`${panel.key}：trend.${sg.tag} 没写`);
          continue;
        }
        if (declBroken) continue; // 登记本身有问题，上面已经报过了
        const S0 = mkS(sg.seg);
        let delta = 0;
        for (const t of decl) {
          if (!Array.isArray(t.years) || t.years.length !== 2) continue;
          if (t.resolvedOrder !== "ascending" && t.resolvedOrder !== "descending") continue;
          const ia = years.indexOf(t.years[0]);
          const ib = years.indexOf(t.years[1]);
          if (ia < 0 || ib < 0) continue;
          if (ia >= sg.seg.length || ib >= sg.seg.length) continue; // 不在比较区间里
          delta += t.resolvedOrder === "ascending" ? 1 : -1;
        }
        const p = mkPValue(S0 + delta, sg.seg.length);
        if (p.toFixed(4) !== Number(sg.pub).toFixed(4)) {
          diffs.push(
            `${panel.key}：Mann-Kendall ${sg.tag} 发布 ${sg.pub}，由年度值重算得 ${p.toFixed(4)}（S=${S0 + delta}，并列按登记解算）`
          );
        }
      }
    }

    /* ---- HC9-4 summary 里的派生量：由年度值重算 ---- */
    const s = data.summary || {};
    const pShare = panels.find((p) => p.key === "r95pShare");
    const pRx = panels.find((p) => p.key === "rx1day");
    if (!pShare || !pRx) {
      diffs.push("panels 里找不到 r95pShare / rx1day —— summary 的派生量无从复算");
    } else {
      const checkNum = (label, published, recomputed, halfKey, extraEps) => {
        if (published === undefined || published === null) {
          diffs.push(`summary.${label} 没写`);
          return;
        }
        const tol = STAT_HALF[halfKey] + valueEps + (extraEps || 0);
        if (Math.abs(recomputed - published) > tol) {
          diffs.push(
            `summary.${label} 发布 ${published}，由年度值重算得 ${num(recomputed)}（容差 ${num(tol)}）`
          );
        }
      };
      const checkYear = (label, published, recomputed) => {
        if (published !== recomputed) {
          diffs.push(`summary.${label} 发布 ${published}，由年度值重算得 ${recomputed}`);
        }
      };

      // 最近十年：起点由最后一个十年段推导
      const recentStart = lastDecadal.start;
      const iRecent = years.indexOf(recentStart);

      checkNum("meanSharePct", s.meanSharePct, meanOf(pShare.values), "meanSharePct");
      checkNum("meanRx1dayMm", s.meanRx1dayMm, meanOf(pRx.values), "meanRx1dayMm");
      checkNum("recentSharePct", s.recentSharePct, meanOf(pShare.values.slice(iRecent)), "recentSharePct");
      checkNum("recentRx1dayMm", s.recentRx1dayMm, meanOf(pRx.values.slice(iRecent)), "recentRx1dayMm");

      // 极值与极值年份
      const iMax = maxIdxOf(pShare.values);
      checkYear("shareRecordYear", s.shareRecordYear, years[iMax]);
      checkNum("shareRecordValue", s.shareRecordValue, pShare.values[iMax], "shareRecordValue");

      // 「2020 之前」的旧最大值：分界由最近十年的起始年推导，不硬编码
      const iPreMax = maxIdxOf(pShare.values.slice(0, iRecent));
      checkYear("sharePre2020MaxYear", s.sharePre2020MaxYear, years[iPreMax]);
      checkNum("sharePre2020MaxValue", s.sharePre2020MaxValue, pShare.values[iPreMax], "sharePre2020MaxValue");

      // 超过旧最大值的年份
      const above = [];
      for (let i = 0; i < pShare.values.length; i++) {
        if (pShare.values[i] > pShare.values[iPreMax]) above.push(years[i]);
      }
      if (JSON.stringify(above) !== JSON.stringify(s.shareYearsAbovePre2020Max || [])) {
        diffs.push(
          `summary.shareYearsAbovePre2020Max 发布 ${JSON.stringify(s.shareYearsAbovePre2020Max)}，` +
            `由年度值重算得 ${JSON.stringify(above)}`
        );
      }

      // 早期十年均值的区间（除最近十年外的所有十年均值，由年度值重算）
      const decMeans = decadalOf(pRx).slice(0, -1).map((dec) => {
        const i0 = years.indexOf(dec.start);
        return meanOf(pRx.values.slice(i0, i0 + dec.nYears));
      });
      // 十年均值本身是发布到 STAT_DECIMALS.decadalValue 位小数的 ⇒ 区间下限要多留这一层舍入
      const decEps = STAT_HALF.decadalValue;
      const range = s.earlierRx1dayRange || [];
      checkNum("earlierRx1dayRange 下界", range[0], Math.min(...decMeans), decEps);
      checkNum("earlierRx1dayRange 上界", range[1], Math.max(...decMeans), decEps);
    }

    if (diffs.length) {
      diffs.forEach((d) => bad(`HC9 ${d}`));
    } else {
      const tieCount = declared.length;
      ok(
        `HC9 发布的统计量已可从年度值复现（${panels.length} 个面板的十年均值与趋势斜率、` +
          `Mann-Kendall p 值（toFixed(4) 逐字相等，${tieCount} 条并列按登记解算）、` +
          `summary 的派生量；跳过 3 个无法由年度值推出的量：meanAnnualMm / r95pAmount1960sMm / r95pAmountRecentMm）`
      );
    }
  }
}

if (problems) {
  console.error(`\n首页降水图门禁未通过：${problems} 项不符预期。`);
  process.exit(1);
}
console.log(
  "首页降水图门禁通过：钩子齐全、读数与数据同源、键盘可达、模块与样式都在位、动态 import 全部可解析、出处与登记事实一致、区域范围已写明、发布的统计量已可从年度值复现。"
);
