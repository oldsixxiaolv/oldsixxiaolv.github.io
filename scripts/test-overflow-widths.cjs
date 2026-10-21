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
 * 四档断言：
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
 *
 * 用法：node scripts/test-overflow-widths.cjs
 *   （已接进 npm run build，见 package.json 的 check:overflow-selftest）
 */
const { spawnSync } = require("child_process");
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
function assert(cond, label, detail) {
  cond ? ok(label, detail) : bad(label, detail);
}

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
function runGate(dir, extraArgs) {
  const r = spawnSync(process.execPath, [GATE, ...(extraArgs || [])], {
    cwd: ROOT,
    env: { ...process.env, SITE_DIR: dir },
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
