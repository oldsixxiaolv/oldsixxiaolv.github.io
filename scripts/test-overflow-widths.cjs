#!/usr/bin/env node
/**
 * 窄屏溢出门禁的**多档宽度自测** —— 证明"多档"这件事真的在跑。
 *
 * 为什么要有这个自测（缺陷清单 D4 的配套）：
 *   D4 修的是「窄屏溢出门禁只测 390px 一个宽度」。修完之后，**新的失效形态**出现了：
 *   门禁的参数被改成多档，但**代码只跑了第一档**——门禁照样 exit 0、
 *   照样打印一堆 ✓，读起来完全像在工作，而 768–1024 那一段**依旧没人把关**。
 *   这正是本仓反复在修的那一族缺陷：「看着在、其实不生效」。
 *   ⇒ 必须有一个**独立于门禁本体**的证据：每一档都被真的测了，
 *     且每一档都能抓到溢出。
 *
 * 档位断言：
 *   M0 基线   —— 干净页面在**每一档**都判绿（不误报）
 *   M1 溢出   —— 注入一个超宽元素的页面在**每一档**都判红（判据有牙齿，且逐档生效）
 *   M2 宽度   —— 门禁实际跑过的档位集合 = 它自己的默认档位集合（没被悄悄少跑）
 *   M3 断点   —— 每一个 CSS 宽度媒体查询的「匹配」与「不匹配」两侧都被测到
 *                （以后 CSS 加了新断点，这一档会判红，逼着门禁的档位列表同步）
 *   M4 参数   —— `--width abc` 这类拼错的宽度**判红**，而不是当成"没传"悄悄退回默认档
 *   M5 窄带   —— 正文列被挤窄（缺陷清单 D11 那一族）**判红**；
 *                正文列够宽**判绿**（不误报）；正文列选择器没命中**判红**（不许悄悄跳过）
 *   M6 分支   —— 窄屏用**比例**判（≤1024px 的 85%），宽屏用**绝对值**判（480px）：
 *                一个「占视口一半」的正文列在窄屏判红、在 1440px 判绿
 *                （若宽屏也按 85% 判，1440px 那行就会红 ⇒ 这一行断言能钉住分支）
 *   M7 阻断   —— 门禁里「把外部字体请求在浏览器层拦掉」那一步**被摘掉**时，
 *                门禁必须**当场判红**，且红因点名「外部字体域 / 没有被阻断」，
 *                **不是**「load 事件等不到」那种超时（缺陷清单 D74 的配套负对照）
 *   M8 密闭   —— 测量期间从「产物之外」拿到响应时，门禁必须**当场判红**，
 *                红因点名「不是本机产物服务」并带上那个资源的地址（D74 的配套负对照）
 *   M9 推导   —— 门禁里「从产物自身推导外域主机」那一步**被摘掉**时，
 *                门禁必须**当场判红**，且红因点名 D75 与那个漏掉的外域主机，
 *                **不是**「load 事件等不到」那种超时（缺陷清单 D75 的配套负对照）
 *   M10 逃逸  —— 页面在**脚本里**发起外域请求（静态扫描看不到的那一类）时，
 *                门禁必须**当场判红**并点名那个外域主机；
 *                把这条判据卸掉后同一夹具必须**转绿**（证明那条红确实是它判出来的）
 *
 * 用法：node scripts/test-overflow-widths.cjs
 *   （已接进 npm run build，见 package.json 的 check:overflow-selftest）
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-overflow.cjs");
const CSS_DIR = path.join(ROOT, "src", "assets", "css");

let failures = 0;
function ok(label, detail) {
  console.log(`  ✓ ${label}${detail ? `  ${detail}` : ""}`);
}
function bad(label, detail) {
  failures++;
  console.log(`  ✗ ${label}${detail ? `  ${detail}` : ""}`);
}
/**
 * 跳过（不是「红」）。
 *
 * 为什么要有第三档（D109）：**工具层面的故障不能被记成被测对象失败**。
 * 浏览器层坏掉时（起不来 / 连不上 / 等不到回音），门禁一次测量都没做成 ⇒
 * 下面那些「M2 至少跑了 3 档」「M3 断点两侧都被测到」全会红 ——
 * 一次**工具故障**被伪装成「九条判据都坏了」，读报告的人会去查判据，
 * 而真正坏的是浏览器那一环。
 * ⇒ 三档分明：**绿 / 判红 / 跳过**。跳过用 `⊘` 记号
 *   （静态清单守卫只认 `✓/✔/·` 三种行首标记，`⊘` 行不进档位比对）。
 */
function skip(label, detail) {
  console.log(`  ⊘ ${label}（跳过）${detail ? `  ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  cond ? ok(label, detail) : bad(label, detail);
}

/**
 * 「浏览器层失败 ⇒ 提前收场」的信号。
 *
 * 用异常把控制流从中间那段断言里带出来，但**不**当作失败计入 ——
 * 真正的失败已经由 bad() 记过了，这里只负责跳出那一大段连锁断言。
 */
class BrowserLayerAbort extends Error {}

/* ---------- 造两个临时页面：一个干净、一个超宽 ---------- */
const VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1.0" />';

/**
 * 夹具页的公共骨架。
 *
 * ⚠️ 那句 `ordinary inline link` **不是装饰，别删**（2026-10-20 D23 实测）：
 *   D23 给 check-overflow.cjs 加了触点尺寸判据（WCAG 2.5.8），其中 **TS1** 是
 *   「一个触点都没量到 ⇒ 判红」——防止这条判据空跑。
 *   夹具页本来**一个交互目标都没有**（只有 <p> / <ul> / <div>），
 *   于是 TS1 在 M0 / M5 这两档「干净产物应当判绿」的自测里判红：
 *   门禁没错，是**夹具不像真页面**（真页面总有链接）。
 *   加一个**句子里**的链接正好顺带把「行内例外」那条路也走了一遍。
 *   删掉它 ⇒ 这份自测会红，且红因是 TS1 而不是它本该测的东西。
 *
 * ⚠️ 同族坑（AN2）：<main id="main"> + 指向它的行内跳转链接也是**必需的** ——
 *    窄屏溢出门禁的 AN2 要求「每一页每一档都至少量到一个滚动定位目标」，
 *    没有这条链接 ⇒ 量到 0 个 ⇒ AN2 自证判红 ⇒ 这份自测会因与本意无关的原因而红。
 */
function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${VIEWPORT_META}
<title>${title}</title>
</head>
<body>
<main id="main">
<h1>${title}</h1>
<p>This fixture page belongs to the overflow gate selftest and carries an
<a href="/">ordinary inline link</a> and a
<a href="#main">jump to the main content</a> so that the touch-target judgement
has something to measure at all.</p>
${body}
</main>
</body>
</html>
`;
}

/**
 * 在 <head> 里多塞一点东西的夹具页（给 M8 用：要挂一张**来自产物之外**的样式表）。
 * 用替换而不是改 page() 的签名 —— page() 的形状已经被 M0–M6 依赖着。
 */
function pageWithHead(title, body, headExtra) {
  return page(title, body).replace("</head>", `${headExtra}\n</head>`);
}

/**
 * 干净页：内容宽度不超过视口 ⇒ 任何档位都不该有横向滚动。
 * ⚠️ 必须带 viewport meta —— mobile 模拟下没有它，布局视口会退回 980px，
 *    那么"请求 360px、量到 980px"就是**量错了宽度**（门禁会判红，那是对的）。
 */
const OK_PAGE = page(
  "Overflow selftest — clean",
  `<p>A paragraph of ordinary prose that comfortably fits inside any of the widths
   this gate measures. It exists so the gate has something to measure that must
   <em>not</em> overflow at any width.</p>
   <ul><li>One</li><li>Two</li><li>Three</li></ul>`
);

/**
 * 超宽页：一个宽度是视口两倍的元素 ⇒ **每一档**都必然横向溢出。
 * 用 `200vw` 而不是写死像素：写死像素只能在一档生效，
 * 用 vw 才能保证"每一档都能被抓到"。
 */
const BAD_PAGE = page(
  "Overflow selftest — overflowing",
  `<p>This page deliberately contains an element that is twice the viewport width.</p>
   <div style="width:200vw;height:8px;background:#c00"></div>`
);

/* ---------- 正文列（窄带判据）的三个夹具 ----------
 *
 * 路由都放在 `/papers/<slug>/` 下 —— 门禁的规则表里，论文精读页这一路的
 * 正文列写死是 `.paper-body`，所以这三个夹具走的正是**真实规则**，
 * 不是另开一条只为测试存在的旁路。
 */
const PAPER_TEXT = `<p>A paragraph of ordinary prose standing in for the body text of a
   paper page. It only has to be long enough that the element carrying it reads as a
   real reading column rather than a label, so the gate has something meaningful to
   measure when it looks for a column squeezed into a narrow band.</p>`;

/** 正文列被压成 200px 窄带 ⇒ 窄屏判红（这就是 D11 坏掉的形态）。 */
const NARROW_PAPER = page(
  "Overflow selftest — narrow content column",
  `<div class="paper-body" style="width:200px">${PAPER_TEXT}</div>`
);
/** 正文列占满容器 ⇒ 判绿（这条判据不许误报）。 */
const WIDE_PAPER = page(
  "Overflow selftest — wide content column",
  `<div class="paper-body">${PAPER_TEXT}</div>`
);
/** 页面结构变了、`.paper-body` 不在了 ⇒ 判红（不许悄悄跳过）。 */
const MISSING_PAPER = page(
  "Overflow selftest — missing content column",
  PAPER_TEXT
);
/** 正文列恒为视口的一半 ⇒ 窄屏（比例判）红、宽屏（绝对值判）绿。 */
const HALF_PAPER = page(
  "Overflow selftest — half-width content column",
  `<div class="paper-body" style="width:50%">${PAPER_TEXT}</div>`
);

/* ---------- 跑门禁 ---------- */
/**
 * 同步睡一小会儿（毫秒）。
 *
 * 为什么需要它：这份自测是**顶层同步**结构（主流程在 try/finally 里），
 * 而 M8 要等一个**别的进程**（扮演「产物之外的东西」的小服务器）把端口写出来。
 * 同步等待的办法只有两个：轮询文件 + 阻塞等待。
 * 用 Atomics.wait 而不是 setTimeout —— 后者要事件循环转起来，
 * 而事件循环一旦被阻塞，子进程写好的文件就等不到被读。
 * ⚠️ 阻塞的是**本进程**，子进程是独立进程，照跑不误。
 */
function syncSleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 「产物之外」的第二个本机服务器（M8 用）。
 *
 * 它扮演的是「测量期间不该被依赖的东西」：门禁自己那个产物服务是
 * `http://127.0.0.1:<产物端口>`，这台是 `http://127.0.0.1:<另一个端口>` ——
 * **同机、不同 origin**（端口不同就是不同 origin）⇒ 正好是「产物之外」。
 * 写成一个独立文件、由子进程跑：门禁跑起来时是 spawnSync（**阻塞事件循环**），
 * 同一进程里的 http 服务在那段时间里根本没法应答。
 */
const EXT_SERVER_SRC = [
  'const http = require("http");',
  'const fs = require("fs");',
  'const readyFile = process.argv[2];',
  'const server = http.createServer((req, res) => {',
  '  if (req.url === "/ext.css") {',
  '    res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });',
  '    res.end("/* a stylesheet that does NOT come from the product site */\\n");',
  '    return;',
  '  }',
  '  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });',
  '  res.end("not found\\n");',
  '});',
  'server.listen(0, "127.0.0.1", () => {',
  '  fs.writeFileSync(readyFile, String(server.address().port));',
  '});',
].join("\n");

function runGate(dir, extraArgs, gatePath, envExtra) {
  const r = spawnSync(process.execPath, [gatePath || GATE, ...(extraArgs || [])], {
    cwd: ROOT,
    env: { ...process.env, SITE_DIR: dir, ...(envExtra || {}) },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    code: r.status,
    out: `${r.stdout || ""}\n${r.stderr || ""}`,
  };
}

/**
 * 解析门禁的输出：抽出「每档宽度」与「每档每页的结果」。
 * 门禁的输出格式是它自己的约定（见 check-overflow.cjs 的主流程）：
 *   视口宽度 360px，共 6 个页面
 *     ✓ /ok.html  (scrollWidth 360 / 视口 360)
 * 这里按行解析，靠"上一行是宽度头"来归属，**不靠行号**。
 */
function parseGateOutput(out) {
  const widths = [];
  const rows = [];
  let cur = null;
  let last = null;
  for (const line of out.split("\n")) {
    const h = line.match(/视口宽度 (\d+)px/);
    if (h) {
      cur = Number(h[1]);
      widths.push(cur);
      continue;
    }
    const p = line.match(
      /^\s*([✓✗])\s+(?:横向可拖\s+)?(\/\S+)\s+\(scrollWidth\s+(\d+)\s*\/\s*视口\s+(\d+)/
    );
    if (p && cur !== null) {
      last = {
        width: cur,
        route: p[2],
        passed: p[1] === "✓",
        scrollWidth: Number(p[3]),
        viewport: Number(p[4]),
        column: null,
      };
      rows.push(last);
      continue;
    }
    /* 正文列那行（紧跟在页面行后面）：`      正文列 .paper-body 942px 92%（下限 85%）✓`
       —— 没命中时是 `      正文列 .paper-body 未找到 ✗` */
    const c = line.match(
      /^\s*正文列\s+(\S+)\s+(?:(\d+)px\s+(\d+)%（下限\s+(.+?)）|未找到)\s*([✓✗])/
    );
    if (c && last) {
      last.column = {
        selector: c[1],
        found: c[2] !== undefined,
        width: c[2] !== undefined ? Number(c[2]) : null,
        percent: c[3] !== undefined ? Number(c[3]) : null,
        limit: c[4] || null,
        ok: c[5] === "✓",
      };
    }
  }
  return { widths, rows };
}

/* ---------- 解析 CSS 的宽度媒体查询 ---------- */
function walkCss(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkCss(p, acc);
    else if (e.name.endsWith(".css")) acc.push(p);
  }
  return acc;
}

/**
 * 解析 CSS 里的宽度媒体查询（**递归**进 components/ 等子目录）。
 * 同一个查询在多个文件里出现是常事 ⇒ 这里**按 (类型, 像素值) 去重**，
 * 但把出现的文件都记下来 —— 判红时要能直接说出"哪个文件、哪条查询"。
 */
function cssWidthQueries() {
  const files = walkCss(CSS_DIR, []);
  const byKey = new Map();
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    const re = /@media\s*\((max|min)-width:\s*(\d+)px\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const key = `${m[1]}:${Number(m[2])}`;
      if (!byKey.has(key)) byKey.set(key, { type: m[1], value: Number(m[2]), files: [] });
      const rel = path.relative(ROOT, f);
      if (!byKey.get(key).files.includes(rel)) byKey.get(key).files.push(rel);
    }
  }
  return [...byKey.values()].sort((a, b) => a.value - b.value || a.type.localeCompare(b.type));
}

/* ---------- 主流程 ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-overflow-selftest-"));
try {
  const dirtyDir = path.join(tmp, "dirty");
  const cleanDir = path.join(tmp, "clean");
  fs.mkdirSync(dirtyDir);
  fs.mkdirSync(cleanDir);
  fs.writeFileSync(path.join(dirtyDir, "ok.html"), OK_PAGE);
  fs.writeFileSync(path.join(dirtyDir, "bad.html"), BAD_PAGE);
  fs.writeFileSync(path.join(cleanDir, "ok.html"), OK_PAGE);

  /* M1：脏产物 —— 每一档都要抓到溢出 */
  const dirty = runGate(dirtyDir);
  const dp = parseGateOutput(dirty.out);
  const widths = dp.widths;

  /* ---------- 前置条件：门禁到底量到东西了没有 ----------
   *
   * 为什么要有这一段（D109）：**工具层面的故障不能被记成被测对象失败**。
   * 浏览器层坏掉时（起不来 / 连不上 / 等不到回音），门禁**一次测量都没做成** ⇒
   * 下面 M1/M2/M3 会**连锁全红**：
   *   M2「门禁实际跑了至少 3 档宽度」红（宽度集合是空的）、
   *   M3 每一条 CSS 断点断言也红（匹配侧与不匹配侧都是空的）……
   * ⇒ 一次**工具故障**被伪装成「九条判据都坏了」，
   *   读报告的人会去查判据，而真正坏的是浏览器那一环。
   * 修法：先分三档 —— **绿 / 判红 / 跳过**。
   *   量不到任何宽度时，只报**一条**红，并说清是「浏览器层失败」还是
   *   「门禁在测量之前就判红了」，其余断言标成**跳过**而不是红。
   */
  if (widths.length === 0) {
    const browserLayer = /浏览器层失败/.test(dirty.out);
    if (browserLayer) {
      bad(
        "M0 前置条件：门禁一次宽度都没量到 —— **浏览器层失败**（不是判据坏了）",
        `exit=${dirty.code}`
      );
      skip("M1 每一档都抓到溢出", "门禁没量到任何宽度");
      skip("M2 档位集合", "门禁没量到任何宽度");
      skip("M3 CSS 断点两侧都被测到", "门禁没量到任何宽度");
    } else {
      /* 不是浏览器层 ⇒ 门禁在**测量之前**就判红了（覆盖度自证那一类）。
         那也是真红，但红因在门禁自己的输出里，不该在这里重复叙述成九条。 */
      bad(
        "M0 前置条件：门禁一次宽度都没量到 —— 门禁在**测量之前**就判红了（不是判据坏了）",
        `exit=${dirty.code}`
      );
      skip("M1 每一档都抓到溢出", "门禁没量到任何宽度");
      skip("M2 档位集合", "门禁没量到任何宽度");
      skip("M3 CSS 断点两侧都被测到", "门禁没量到任何宽度");
    }
    throw new BrowserLayerAbort("门禁没量到任何宽度");
  }

  assert(
    dirty.code === 1,
    "M1 注入超宽元素后门禁判红",
    `exit=${dirty.code}`
  );
  assert(
    widths.length >= 3,
    "M2 门禁实际跑了至少 3 档宽度",
    `档位 = ${widths.join(" / ")}`
  );
  assert(
    new Set(widths).size === widths.length,
    "M2 档位没有重复",
    `${widths.length} 档`
  );
  for (const w of widths) {
    const badRow = dp.rows.find((r) => r.width === w && r.route === "/bad.html");
    const okRow = dp.rows.find((r) => r.width === w && r.route === "/ok.html");
    assert(
      !!badRow && !badRow.passed,
      `M1 宽度 ${w}px 抓到 /bad.html 的横向溢出`,
      badRow ? `scrollWidth ${badRow.scrollWidth} / 视口 ${badRow.viewport}` : "这一档没有 /bad.html 的测量记录"
    );
    assert(
      !!okRow && okRow.passed,
      `M1 宽度 ${w}px 下 /ok.html 判绿`,
      okRow ? `scrollWidth ${okRow.scrollWidth} / 视口 ${okRow.viewport}` : "这一档没有 /ok.html 的测量记录"
    );
    assert(
      !!badRow && Math.abs(badRow.viewport - w) <= 1,
      `M1 宽度 ${w}px 这一档真的被模拟成那个宽度`,
      badRow ? `量到的布局视口 = ${badRow.viewport}px` : "无记录"
    );
  }

  /* M0：干净产物 —— 每一档都判绿（不误报） */
  const clean = runGate(cleanDir);
  const cp = parseGateOutput(clean.out);
  assert(clean.code === 0, "M0 干净产物判绿（不误报）", `exit=${clean.code}`);
  for (const w of cp.widths) {
    const row = cp.rows.find((r) => r.width === w && r.route === "/ok.html");
    assert(!!row && row.passed, `M0 宽度 ${w}px 下 /ok.html 判绿`, row ? "" : "这一档没有测量记录");
  }
  assert(
    cp.widths.join(",") === widths.join(","),
    "M2 两轮跑出来的档位集合一致",
    `${cp.widths.join("/")}`
  );

  /* M3：CSS 断点与门禁档位的覆盖关系 */
  const queries = cssWidthQueries();
  assert(queries.length > 0, "M3 从 CSS 里读到了宽度媒体查询", `${queries.length} 条（已按值去重）`);
  for (const q of queries) {
    const matched = widths.filter((w) => (q.type === "max" ? w <= q.value : w >= q.value));
    const unmatched = widths.filter((w) => (q.type === "max" ? w > q.value : w < q.value));
    assert(
      matched.length > 0 && unmatched.length > 0,
      `M3 @media (${q.type}-width: ${q.value}px) 的匹配侧与不匹配侧都被测到`,
      `匹配侧 ${matched.join("/") || "无"} ｜ 不匹配侧 ${unmatched.join("/") || "无"} ｜ ` +
        `出现在 ${q.files.join("、")}`
    );
  }

  /* M4：拼错的宽度参数必须判红，而不是悄悄退回默认档 */
  const badArg = runGate(cleanDir, ["--width", "abc"]);
  assert(
    badArg.code === 1,
    "M4 拼错的 --width 判红（没有当成『没传』悄悄退回默认档）",
    `exit=${badArg.code}`
  );
  const badArg2 = runGate(cleanDir, ["--widths", "390,xyz"]);
  assert(
    badArg2.code === 1,
    "M4 拼错的 --widths 判红",
    `exit=${badArg2.code}`
  );

  /* ---------- M5 / M6：正文列（窄带）判据 ---------- */
  /* 只测三档：360 与 1024 落在**比例**分支，1440 落在**绝对值**分支。 */
  const COL_WIDTHS = "360,1024,1440";
  const colDir = path.join(tmp, "col");
  const wideOnlyDir = path.join(tmp, "col-wide");
  const writePaper = (dir, slug, html) => {
    const d = path.join(dir, "papers", slug);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, "index.html"), html);
  };
  writePaper(colDir, "selftest-narrow", NARROW_PAPER);
  writePaper(colDir, "selftest-missing", MISSING_PAPER);
  writePaper(colDir, "selftest-half", HALF_PAPER);
  writePaper(wideOnlyDir, "selftest-wide", WIDE_PAPER);

  const col = runGate(colDir, ["--widths", COL_WIDTHS]);
  const colOut = parseGateOutput(col.out);
  assert(col.code === 1, "M5 窄带/缺列的页面让门禁判红", `exit=${col.code}`);
  const rowOf = (route, w) => colOut.rows.find((r) => r.route === route && r.width === w);

  for (const w of [360, 1024]) {
    const r = rowOf("/papers/selftest-narrow/", w);
    assert(
      !!r && r.column && !r.column.ok && r.column.width === 200,
      `M5 宽度 ${w}px 抓到正文列被挤成窄带`,
      r && r.column ? `正文列 ${r.column.width}px（占 ${r.column.percent}%，下限 ${r.column.limit}）` : "这一档没有测量记录"
    );
  }
  const miss = rowOf("/papers/selftest-missing/", 360);
  assert(
    !!miss && miss.column && miss.column.found === false,
    "M5 正文列选择器没命中时判红（不许悄悄跳过）",
    miss && miss.column ? `选择器 ${miss.column.selector}` : "这一档没有测量记录"
  );
  assert(
    /正文列选择器没命中/.test(col.out),
    "M5 输出里说清了是「选择器没命中」",
    ""
  );

  /* 宽屏走**绝对值**分支：一个恒为视口一半的正文列（360px 时 180px、1440px 时 720px）
     在窄屏按 85% 判红，在 1440px 按 480px 判绿 —— 若宽屏也按比例判，
     1440px 那行会红 ⇒ 这一行断言把「分支」钉住了。 */
  for (const w of [360, 1024]) {
    const r = rowOf("/papers/selftest-half/", w);
    assert(
      !!r && r.column && !r.column.ok,
      `M6 宽度 ${w}px 半宽正文列按比例判红`,
      r && r.column ? `正文列 ${r.column.width}px（占 ${r.column.percent}%，下限 ${r.column.limit}）` : "这一档没有测量记录"
    );
  }
  const halfWide = rowOf("/papers/selftest-half/", 1440);
  assert(
    !!halfWide && halfWide.column && halfWide.column.ok && halfWide.column.width >= 480,
    "M6 宽度 1440px 半宽正文列按绝对值判绿（宽屏不走比例判据）",
    halfWide && halfWide.column ? `正文列 ${halfWide.column.width}px（占 ${halfWide.column.percent}%，下限 ${halfWide.column.limit}）` : "这一档没有测量记录"
  );

  /* 正文列够宽的站点必须判绿（这条判据不许误报） */
  const wideOnly = runGate(wideOnlyDir, ["--widths", COL_WIDTHS]);
  const wideOut = parseGateOutput(wideOnly.out);
  assert(wideOnly.code === 0, "M5 正文列够宽的站点判绿（不误报）", `exit=${wideOnly.code}`);
  for (const w of [360, 1024, 1440]) {
    const r = wideOut.rows.find((x) => x.route === "/papers/selftest-wide/" && x.width === w);
    assert(!!r && r.column && r.column.ok, `M5 宽度 ${w}px 宽正文列判绿`, r && r.column ? `正文列 ${r.column.width}px` : "这一档没有测量记录");
  }
/* ---------- M7：阻断那一步被摘掉 ⇒ 门禁必须当场判红 ----------
   *
   * 这一档是「D74 修法有没有牙齿」的**行为级负对照**。
   * 做法：把门禁**复制**一份到临时目录，用**同行替换**（行数不变）把
   *   「把外部字体请求在浏览器层拦掉」那一步换成一行注释，
   * 然后拿这份副本去跑 —— 它必须判红，且红因必须点名
   *   「外部字体域」+「没有被阻断」。
   * ⚠️ 夹具站**刻意不含任何外链资源**：否则副本会先栽在
   *   「load 事件等不到」上，红因变成超时 ⇒ 归属不纯。
   *   所以这一档额外断言输出里**不能出现「超时」**——
   *   这条断言才是本档的 teeth：它区分「探针抓到了被摘掉的阻断」
   *   与「页面压根没加载完」这两种完全不同的红。
   */
  const BLOCK_LINE =
    '  await cdp.send("Network.setBlockedURLs", { urls: blockedPatterns }, sessionId);';
  const gateSource = fs.readFileSync(GATE, "utf8");
  const blockCount = gateSource.split(BLOCK_LINE).length - 1;
  if (blockCount !== 1) {
    bad(
      "M7 门禁源码里「阻断外部字体」那一步**恰好出现一次**（注入点唯一）",
      `实际出现 ${blockCount} 次 —— 注入点没了，本档跳过（否则红因会串味）`
    );
  } else {
    ok("M7 门禁源码里「阻断外部字体」那一步**恰好出现一次**（注入点唯一）", "");
    const copyDir = path.join(tmp, "gate-copy");
    fs.mkdirSync(copyDir);
    const copyPath = path.join(copyDir, "check-overflow.cjs");
    fs.writeFileSync(
      copyPath,
      gateSource.replace(BLOCK_LINE, "  // [M7 注入] 阻断外部字体的这一步被摘掉了")
    );
    const m7 = runGate(cleanDir, [], copyPath);
    assert(m7.code === 1, "M7 阻断被摘掉后门禁判红", `exit=${m7.code}`);
    assert(/外部字体域/.test(m7.out), "M7 红因点名「外部字体域」", "");
    assert(/没有被阻断/.test(m7.out), "M7 红因说明「外部字体请求没有被阻断」", "");
    assert(!/超时/.test(m7.out), "M7 红因归属纯净：输出里没有「超时」（不是 load 等不到）", "");
  }

  /* ---------- M8：密闭性自证不是空跑 ----------
   *
   * D74 修法有第二道自证：「测量期间除了本机产物服务，任何请求拿到响应都判红」。
   * 但真站那一路的外域字体**已经被拦掉了**，所以在真站上**永远观测不到**
   * 「拿到了响应」这件事 ⇒ 这道自证有可能**整场都在空跑**。
   * 要证明它有牙齿，得**人为造一个「产物之外的东西」**：
   * 这里用第二个本机服务器（另一个端口 ⇒ 另一个 origin）扮演它，
   * 夹具页从那儿挂一张样式表 ⇒ 门禁必须判红，且红因点名
   *   「不是本机产物服务」并带上那个资源的地址。
   */
  const extServerPath = path.join(tmp, "ext-server.cjs");
  const extReadyPath = path.join(tmp, "ext-ready.txt");
  fs.writeFileSync(extServerPath, EXT_SERVER_SRC);
  const extChild = spawn(process.execPath, [extServerPath, extReadyPath], { stdio: "ignore" });
  try {
    let extPort = null;
    for (let i = 0; i < 100 && extPort === null; i++) {
      syncSleep(100);
      if (fs.existsSync(extReadyPath)) {
        const t = fs.readFileSync(extReadyPath, "utf8").trim();
        if (/^\d+$/.test(t)) extPort = Number(t);
      }
    }
    if (extPort === null) {
      bad("M8 「产物之外」的第二个本机服务起来了", "等 10s 也没拿到它的端口");
    } else {
      ok("M8 「产物之外」的第二个本机服务起来了", `端口 ${extPort}`);
      const extDir = path.join(tmp, "ext-site");
      fs.mkdirSync(extDir);
      /* ⚠️ 文件名**不能**叫 index.html：路由 "/" 在门禁的正文列规则表里
         登记的是 `.home-hero`，夹具里没有它 ⇒ 会多出一条「选择器没命中」的红因，
         把本档的红因搅浑。叫 ext.html 就落到默认规则 `main` 上，干净。 */
      fs.writeFileSync(
        path.join(extDir, "ext.html"),
        pageWithHead(
          "Overflow selftest — external stylesheet",
          `<p>This fixture page loads one stylesheet from a second local server, which
             stands in for anything outside the product site.</p>`,
          `<link rel="stylesheet" href="http://127.0.0.1:${extPort}/ext.css">`
        )
      );
      const m8 = runGate(extDir);
      assert(
        m8.code === 1,
        "M8 产物之外的资源被加载时门禁判红（密闭性自证不是空跑）",
        `exit=${m8.code}`
      );
      assert(/不是本机产物服务/.test(m8.out), "M8 红因点名「不是本机产物服务」", "");
      assert(/ext\.css/.test(m8.out), "M8 红因点名那个外部样式表 ext.css", "");
      assert(
        !/外部字体域/.test(m8.out),
        "M8 红因归属纯净：没有混入外部字体探针那一档的红因",
        ""
      );
    }
  } finally {
    try {
      extChild.kill("SIGTERM");
    } catch {
      /* 子进程已经退出了，kill 报错不影响判定 */
    }
  }

  /* ---------- M9：阻断清单的推导被摘掉 ⇒ 门禁必须当场判红 ----------
   *
   * D74 留下的阻断清单是**手写的两域**：站点将来新增任何外域子资源，
   * 那个域都不在清单里 ⇒ 页面又要等它 ⇒ 测量重新依赖外网
   * ⇒ **D74 的症状原样复发**，而没有任何一道门禁会说一个字。
   * D75 把清单改成「手写底线 ∪ 从产物自身推导」，这一档是它的**行为级负对照**：
   * 把「从产物推导」这一步摘掉，覆盖度自证必须当场红，并点名那个漏掉的主机。
   *
   * 做法：夹具页挂一张**外域**样式表（https://cdn.example.org/probe.css）——
   *   · 真门禁：推导把那个域自动收进阻断清单 ⇒ 页面照常加载 ⇒ 判绿；
   *   · 门禁副本：把推导那一步换成空集合 ⇒ 阻断清单只剩手写底线
   *     ⇒ 覆盖度自证在**起 Chrome 之前**就判红。
   * ⚠️ 红因必须**归属纯净**：输出里不能出现「超时」——
   *   否则分不清是「覆盖度自证抓到了被摘掉的推导」还是「页面压根没加载完」。
   */
  const DERIVE_LINE =
    "  const derivedHosts = deriveExternalHosts(SITE, [...pages, ...styleFiles]);";
  const deriveCount = gateSource.split(DERIVE_LINE).length - 1;
  if (deriveCount !== 1) {
    bad(
      "M9 门禁源码里「从产物推导外域主机」那一步**恰好出现一次**（注入点唯一）",
      `实际出现 ${deriveCount} 次 —— 注入点没了，本档跳过（否则红因会串味）`
    );
  } else {
    ok("M9 门禁源码里「从产物推导外域主机」那一步**恰好出现一次**（注入点唯一）", "");
    const m9Dir = path.join(tmp, "m9-site");
    fs.mkdirSync(m9Dir);
    fs.writeFileSync(
      path.join(m9Dir, "probe.html"),
      pageWithHead(
        "Overflow selftest — external stylesheet in the product",
        `<p>This fixture page loads one stylesheet from an external host, which is
             what the product site may legitimately do.</p>`,
        `<link rel="stylesheet" href="https://cdn.example.org/probe.css">`
      )
    );
    const m9Real = runGate(m9Dir);
    assert(
      m9Real.code === 0,
      "M9 外域子资源在真门禁下判绿（推导把它收进了阻断清单）",
      `exit=${m9Real.code}`
    );
    const m9CopyDir = path.join(tmp, "gate-copy-m9");
    fs.mkdirSync(m9CopyDir);
    const m9CopyPath = path.join(m9CopyDir, "check-overflow.cjs");
    fs.writeFileSync(
      m9CopyPath,
      gateSource.replace(DERIVE_LINE, "  const derivedHosts = new Set();")
    );
    const m9 = runGate(m9Dir, [], m9CopyPath);
    assert(m9.code === 1, "M9 推导被摘掉后门禁判红", `exit=${m9.code}`);
    assert(/D75/.test(m9.out), "M9 红因点名 D75（阻断清单覆盖自证）", "");
    assert(
      /cdn\.example\.org/.test(m9.out),
      "M9 红因点名那个漏掉的外域主机 cdn.example.org",
      ""
    );
    assert(
      !/超时/.test(m9.out),
      "M9 红因归属纯净：输出里没有「超时」（不是 load 等不到）",
      ""
    );
    assert(
      !/外部字体域/.test(m9.out),
      "M9 红因归属纯净：没有混入外部字体探针那一档的红因",
      ""
    );
  }

  /* ---------- M10：运行期逃逸判据不是空跑 ----------
   *
   * D75 还有第二道：**运行期兜底** —— 测量期间浏览器向
   * 「**没有被阻断**的外域主机」发起请求 ⇒ 判红。
   * 静态扫描看不到的那一类（JS 里 fetch、运行时才拼出来的地址）靠它兜住。
   *
   * 这一档用「页面在脚本里 fetch 一个外域地址」来制造这种情况：
   *   · 真门禁 ⇒ 判红，红因点名 D75 与那个外域主机；
   *   · 门禁副本（把逃逸判据的条件换成 false）⇒ 同一夹具**判绿**
   *     —— 绿了就说明那条红确实是这条判据判出来的，不是别的红因。
   * ⚠️ 这个 fetch 是**异步**的：它不阻塞 load 事件 ⇒ 门禁能把这一轮量完，
   *   红因才是「逃逸」而不是「超时」。
   */
  const ESCAPE_LINE = "  if (escapedHosts.size > 0) {";
  const escapeCount = gateSource.split(ESCAPE_LINE).length - 1;
  if (escapeCount !== 1) {
    bad(
      "M10 门禁源码里「运行期逃逸」那一条判据**恰好出现一次**（注入点唯一）",
      `实际出现 ${escapeCount} 次 —— 注入点没了，本档跳过（否则红因会串味）`
    );
  } else {
    ok("M10 门禁源码里「运行期逃逸」那一条判据**恰好出现一次**（注入点唯一）", "");
    const m10Dir = path.join(tmp, "m10-site");
    fs.mkdirSync(m10Dir);
    fs.writeFileSync(
      path.join(m10Dir, "fetch.html"),
      page(
        "Overflow selftest — runtime external request",
        `<p>This fixture page asks for an external resource from script at run time,
           which no static scan of the product can see.</p>
         <script>
           fetch("https://cdn.example.org/probe.json", { mode: "no-cors" }).catch(function () {});
         </script>`
      )
    );
    const m10 = runGate(m10Dir);
    assert(
      m10.code === 1,
      "M10 页面在脚本里发起外域请求时门禁判红（静态扫描看不到的那类）",
      `exit=${m10.code}`
    );
    assert(/D75/.test(m10.out), "M10 红因点名 D75（运行期逃逸判据）", "");
    assert(
      /cdn\.example\.org/.test(m10.out),
      "M10 红因点名那个外域主机 cdn.example.org",
      ""
    );
    assert(
      !/超时/.test(m10.out),
      "M10 红因归属纯净：输出里没有「超时」（不是 load 等不到）",
      ""
    );
    const m10CopyDir = path.join(tmp, "gate-copy-m10");
    fs.mkdirSync(m10CopyDir);
    const m10CopyPath = path.join(m10CopyDir, "check-overflow.cjs");
    fs.writeFileSync(
      m10CopyPath,
      gateSource.replace(ESCAPE_LINE, "  if (false) {")
    );
    const m10Copy = runGate(m10Dir, [], m10CopyPath);
    assert(
      m10Copy.code === 0,
      "M10 逃逸判据被卸掉后同一夹具判绿（证明这条红确实是它判出来的）",
      `exit=${m10Copy.code}`
    );
  }

  /* ---------- M11：门禁的浏览器与本机代理配置解耦（D109 的行为级对照） ----------
   *
   * 这一档证的是 BR1：Chrome 必须**不走代理**。
   *
   * 怎么在**不碰机器全局设置**的前提下造出「这台机器配了代理」的场景：
   *   给 Chrome 注入两枚旗标：
   *     --proxy-bypass-list=<-loopback>          取消 Chrome 对回环地址的隐式豁免
   *     --proxy-server=http://127.0.0.1:<端口>    把请求交给代理
   *   而那个代理是**挂死**的（接受连接但永不回话）⇒ 走代理的请求会一直挂着。
   *   ⇒ 于是「门禁访问本机临时服务」这件事被代理接管 ⇒ 页面永远加载不完。
   *   （这两枚旗标是本机实测有效的，见 check-overflow.cjs 文件头的 D109 说明；
   *     实测：同组旗标加 `--no-proxy-server` ⇒ 直连成功。）
   *
   * 两档必须**一起**跑，缺一不可：
   *   · 真门禁副本（保留 `--no-proxy-server`）⇒ 必须**判绿**：
   *     证明 BR1 真的把代理压住了（这一档是「新代码有效」的证明）。
   *   · 摘掉 `--no-proxy-server` 的副本 ⇒ 必须**判红**、且红因是**浏览器层**：
   *     证明这个场景**有牙齿**（不是恒绿、也不是恒红）。
   *     只有「摘掉修复就红」这一半，红才真的是这条判据判出来的。
   */
  const PROXY_SRC = [
    'const http = require("http");',
    'const fs = require("fs");',
    'const readyFile = process.argv[2];',
    '/* 正规的 HTTP 服务（**不要**用裸 TCP 直接切断连接：',
    '   那样 Chrome 会以为连接被重置而**重试**，启动被拖慢 ⇒',
    '   「副本 A 判绿」那条断言会偶发红 —— 测的又变成启动速度了）。 */',
    'const server = http.createServer((req, res) => {',
    '  res.writeHead(502, { "content-type": "text/plain" });',
    '  res.end("proxy is not working");',
    '});',
    'server.listen(0, "127.0.0.1", () => {',
    '  fs.writeFileSync(readyFile, String(server.address().port));',
    '});',
  ].join("\n");

  const proxySrcPath = path.join(tmp, "hanging-proxy.cjs");
  const proxyReadyPath = path.join(tmp, "hanging-proxy-port.txt");
  fs.writeFileSync(proxySrcPath, PROXY_SRC);
  const proxyChild = spawn(process.execPath, [proxySrcPath, proxyReadyPath], { stdio: "ignore" });
  try {
    let proxyPort = null;
    for (let i = 0; i < 100 && proxyPort === null; i++) {
      syncSleep(100);
      if (fs.existsSync(proxyReadyPath)) {
        const t = fs.readFileSync(proxyReadyPath, "utf8").trim();
        if (/^\d+$/.test(t)) proxyPort = Number(t);
      }
    }
    if (proxyPort === null) {
      bad("M11 「不工作的代理」起来了（立刻回 502）", "等 10s 也没拿到它的端口");
    } else {
      ok("M11 「不工作的代理」起来了（立刻回 502）", `端口 ${proxyPort}`);
      /* 两个注入点：旗标插在哪儿、摘除哪一行 —— 都必须**恰好出现一次**，
         否则注入会落到别的地方（或根本没生效），红因就会串味。 */
      const INJECT_POINT = '      "--headless=new",';
      const NO_PROXY_LINE = '      "--no-proxy-server",';
      const injectCount = gateSource.split(INJECT_POINT).length - 1;
      const noProxyCount = gateSource.split(NO_PROXY_LINE).length - 1;
      assert(
        injectCount === 1,
        "M11 门禁源码里「注入代理旗标」的位置**恰好出现一次**（注入点唯一）",
        `实际 ${injectCount} 次`
      );
      assert(
        noProxyCount === 1,
        "M11 门禁源码里 `--no-proxy-server` **恰好出现一次**（摘除点唯一）",
        `实际 ${noProxyCount} 次`
      );
      if (injectCount === 1 && noProxyCount === 1) {
        const proxyFlags =
          `      "--proxy-bypass-list=<-loopback>",\n` +
          `      "--proxy-server=http://127.0.0.1:${proxyPort}",`;
        const withProxy = gateSource.replace(INJECT_POINT, `${INJECT_POINT}\n${proxyFlags}`);

        /* 副本 A：注入代理旗标，保留真门禁的 `--no-proxy-server` */
        const copyADir = path.join(tmp, "gate-copy-m11a");
        fs.mkdirSync(copyADir);
        const copyAPath = path.join(copyADir, "check-overflow.cjs");
        fs.writeFileSync(copyAPath, withProxy);

        /* 副本 B：同样注入代理旗标，但把 `--no-proxy-server` 摘掉 */
        const copyBDir = path.join(tmp, "gate-copy-m11b");
        fs.mkdirSync(copyBDir);
        const copyBPath = path.join(copyBDir, "check-overflow.cjs");
        fs.writeFileSync(copyBPath, withProxy.replace(NO_PROXY_LINE, ""));

        const m11a = runGate(cleanDir, ["--timeout", "8000"], copyAPath);
        assert(
          m11a.code === 0,
          "M11 注入代理旗标后门禁仍判绿（BR1：浏览器不碰代理）",
          m11a.code === 0
            ? ""
            : `exit=${m11a.code}；输出末段：${(m11a.out.trim().split("\n").filter((l) => l.trim()).slice(-4).join(" / ") || "").slice(0, 260)}`
        );
        const m11b = runGate(cleanDir, ["--timeout", "8000"], copyBPath);
        assert(
          m11b.code === 1,
          "M11 摘掉 `--no-proxy-server` 后同一场景判红（这个场景有牙齿）",
          `exit=${m11b.code}`
        );
        assert(
          /浏览器层失败/.test(m11b.out),
          "M11 那一档的红因是**浏览器层**（不是页面判红）",
          /* 红因回显：断言红的时候要能一眼看出**它**红在哪，
             而不是让人再去手动复现一遍。 */
          /浏览器层失败/.test(m11b.out)
            ? ""
            : `输出末段：${(m11b.out.trim().split("\n").slice(-6).join(" / ") || "").slice(0, 300)}`
        );
        assert(
          !/横向溢出/.test(m11b.out),
          "M11 那一档的红因不含「横向溢出」（与页面判红可区分）",
          ""
        );
      }
    }
  } finally {
    try {
      proxyChild.kill("SIGTERM");
    } catch {
      /* 子进程已经退出了，kill 报错不影响判定 */
    }
  }

  /* ---------- M12：浏览器层失败的红因归属（D109 的 BR2 / BR3 / BR4） ----------
   *
   * 造一个**接得上、却不回话**的浏览器：假浏览器起一个永不回应的 HTTP 服务，
   * 把它的端口写进 DevToolsActivePort ⇒ 门禁「起浏览器、拿端口」都成功，
   * 但连调试端点时会**一直挂着** ⇒ 门禁必须靠**有界等待**兜住（BR2），
   * 并给出浏览器层的专属红因（BR3）。
   * 这一档证五件事：
   *   ① 门禁**判红**（不是悄悄跳过、不是悄悄绿），而且**没有挂住**（BR2）；
   *   ② 红因**点名「浏览器层」**；
   *   ③ 红因**不含「横向溢出」**，也**不是一整页未捕获异常的栈回溯**
   *      —— 否则读报告的人会照着「页面有问题」去查产品，而问题在测量这一环；
   *   ④ 红因**说得出是「等超时了」**（证明是有界等待兜住的，不是别的失败）；
   *   ⑤ 失败之后**浏览器进程已被回收**（不留垃圾进程在机器上）。
   * ⚠️ 假浏览器要能直接执行（shebang + 可执行位）——
   *   macOS / Linux 才有这个形态；本仓的 CI 是 ubuntu，本机是 macOS。
   */
  const FAKE_CHROME_SRC = [
    "#!/usr/bin/env node",
    '/* 假浏览器：起一个**永不回话**的 HTTP 服务，把它的端口写进 DevToolsActivePort。',
    "   ⇒ 门禁「起浏览器、拿端口」都成功，但连调试端点时会一直挂着 ⇒",
    "   门禁必须靠有界等待兜住，并给出浏览器层的专属红因。 */",
    'const http = require("http");',
    'const fs = require("fs");',
    'const path = require("path");',
    "const args = process.argv.slice(2);",
    'const dirArg = args.find((a) => a.startsWith("--user-data-dir="));',
    'const dir = dirArg ? dirArg.slice("--user-data-dir=".length) : null;',
    "const server = http.createServer(() => { /* 接受请求但永不回应 */ });",
    'server.listen(0, "127.0.0.1", () => {',
    '  /* 先记「我起来了」与自己的 pid（门禁失败后要能查它有没有被回收），',
    "   再写端口文件 —— 顺序不能反：门禁是看到端口文件才继续的。 */",
    '  fs.writeFileSync(path.join(__dirname, "fake-chrome-started.txt"), String(process.pid));',
    '  if (dir) fs.writeFileSync(path.join(dir, "DevToolsActivePort"), String(server.address().port) + "\\n");',
    "});",
    "setInterval(() => {}, 1000);",
  ].join("\n");

  const fakeChrome = path.join(tmp, "fake-chrome.cjs");
  const fakeMarker = path.join(tmp, "fake-chrome-started.txt");
  fs.writeFileSync(fakeChrome, FAKE_CHROME_SRC);
  fs.chmodSync(fakeChrome, 0o755);

  const m12 = runGate(cleanDir, ["--timeout", "3000"], undefined, {
    CHROME_PATH: fakeChrome,
  });
  assert(
    fs.existsSync(fakeMarker),
    "M12 假浏览器真的被门禁启动了（这一档的场景确实被演练到）",
    fs.existsSync(fakeMarker) ? "" : "没有留下启动标记 —— 这一档没真跑起来"
  );
  assert(m12.code === 1, "M12 浏览器层失败时门禁判红（而且**没有挂住**）", `exit=${m12.code}`);
  assert(/浏览器层失败/.test(m12.out), "M12 红因点名「浏览器层」", "");
  assert(
    /超时/.test(m12.out),
    "M12 红因说得出是「等超时了」（BR2：有界等待兜住了，没有挂死）",
    ""
  );
  assert(
    !/横向溢出/.test(m12.out),
    "M12 红因不含「横向溢出」（与页面判红可区分）",
    ""
  );
  assert(
    !/^\s+at\s/m.test(m12.out),
    "M12 红因不是一整页未捕获异常的栈回溯",
    ""
  );
  /* BR4：失败之后浏览器进程必须被回收（此前失败路径直接抛出去 ⇒ 进程留在机器上）。 */
  let fakeAlive = false;
  let fakePid = null;
  if (fs.existsSync(fakeMarker)) {
    fakePid = Number(fs.readFileSync(fakeMarker, "utf8").trim());
    try {
      process.kill(fakePid, 0);
      fakeAlive = true;
    } catch {
      fakeAlive = false; // 进程已经不在了
    }
  }
  assert(
    fakePid !== null && !fakeAlive,
    "M12 失败后浏览器进程已被回收（不留垃圾进程）",
    fakePid === null ? "没有 pid 可查" : `pid ${fakePid} ${fakeAlive ? "还在" : "已回收"}`
  );
} catch (e) {
  /* 「浏览器层失败 ⇒ 提前收场」是**有意的提前退出**，不是意外：
     失败已经由 bad() 记过了，这里只负责别把栈回溯打出来。 */
  if (!(e instanceof BrowserLayerAbort)) throw e;
} finally {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响结果，交给系统回收 */
  }
}

if (failures) {
  console.error(`\n窄屏溢出门禁的多档宽度自测**未通过**：${failures} 项不符预期。`);
  process.exit(1);
}
console.log("\n窄屏溢出门禁的多档宽度自测通过：每一档都被真的测了，且与 CSS 断点两侧对齐。");
