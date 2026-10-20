#!/usr/bin/env node
/**
 * 移动端横向溢出检测 —— 找出在窄屏上把页面撑宽的元素。
 *
 * 为什么要有这个：改进日志里 P3 那条写着「换行规则要改，但**不能盲改**，
 * 需逐页回归验证」。盲改的根源是没人知道**到底哪个元素**在撑宽——
 * 只看 `scrollWidth` 只有一个数字，改完也说不清改没改对。
 * 这个脚本把「哪个选择器越界、越界多少像素」直接列出来，
 * 改完再跑一次，两次的清单一对比就知道有没有修好、有没有弄坏别的页面。
 *
 * 只依赖 Node 内置能力 + 本机 Chrome（CDP over WebSocket），不装任何包。
 *
 * ⚠️ 为什么从「单档 390px」改成**多档宽度**（2026-10-20 修缺陷清单 D4）：
 *   此前这个门禁**只测 390px 一个宽度**。本仓的宽度媒体查询有 **6 个像素值**
 *   （360 / 640 / 760 / 768 / 820 / 1024，见 src/assets/css/ 全部 .css，含
 *   components/ 子目录），而 **768–1024 这段区间、以及 >1024 的宽屏分支，
 *   全都没有横向溢出的把关**。
 *   >1024 恰恰是**布局最复杂**的一侧：`max-width:1024px` 之外，
 *   `.split` 是双栏、`.paper-reader-wrap` 是三栏、`.paper-toc` 才显示
 *   （layout.css / paper-reader.css / components/_paper.css）——
 *   多栏布局最容易横向撑破，却从来没被量过。
 *   ⇒ 「只测 390px」不等于「窄屏没问题」，只等于**窄的那一档没问题**。
 *
 *   默认档位的取法 = **每个宽度媒体查询的「匹配」与「不匹配」两侧都被测到**：
 *     · 360 —— `max-width:360px` 的匹配侧（也是最小常见手机宽度）
 *     · 390 —— 常见手机宽度（本仓历来用的那档）；`max-width:360px` 的不匹配侧
 *     · 640 —— `max-width:640px` 的匹配侧；其不匹配侧由 768 覆盖
 *     · 768 —— `max-width:768px` 的匹配侧，也是 `min-width:760px` 的不匹配侧
 *     · 820 —— `max-width:820px` 的匹配侧
 *     · 1024 —— `max-width:1024px` 的匹配侧
 *     · 1440 —— `max-width:1024px` 的**不匹配侧**（宽屏多栏那一侧）；
 *       且 >1320px（.paper-reader-wrap 的容器上限），能覆盖"容器被封顶"的情形
 *   ⇒ `max-width:760px` 的匹配侧由 640 覆盖、不匹配侧由 768 覆盖。
 *   （这条覆盖关系由 scripts/test-overflow-widths.cjs **逐条核对**，不靠人记；
 *    以后 CSS 加了新断点，那个自测会判红，逼着这里同步。）
 *
 * ⚠️ 为什么还要量「正文列宽」（2026-10-20 修缺陷清单 D11 的**复发**风险）：
 *   横向溢出这个判据有个**结构性盲区**：页面**没被撑宽**，但正文被挤成了一条窄带，
 *   `scrollWidth` 仍然是视口宽 ⇒ 这个门禁**全绿**。
 *   缺陷清单 D11 就是这一族：论文精读页在 ≤1024px 一直是两栏，
 *   正文被塞进第一列 `minmax(200px,1fr)` —— 实测 360~1024px 下正文宽度只有
 *   200~203px（占视口 20%），右边空出 110~690px；**build 与当时全部门禁都是绿的**。
 *   ⇒ 这个门禁现在同时盯两件事：
 *       ① 有没有元素把页面撑出横向滚动（原有判据，退出码同源）；
 *       ② 每个页面的**正文列**有没有被挤窄（新增判据）。
 *     判据：≤1024px 时正文列 ≥ 视口 **85%**（D11 自己写下的验收线）；
 *           >1024px 时正文列 ≥ **480px**（绝对下限，约 30 个中文字符的可读宽度）。
 *     为什么 ≥1024px 换成绝对值：宽屏下正文列是**居中定宽**的（实测最小 704px，
 *     1920px 档只有 48%），用比例判会误报；窄屏下它是**跟着视口走**的，
 *     用比例判才抓得住「被栅格挤成固定窄列」这一族。
 *     「正文列」是哪个元素，逐页写在下表的 CONTENT_COLUMN_RULES 里；
 *     没登记的页面默认盯 `main`；**选择器没命中 = 判红**（页面结构变了就得让人知道）。
 *
 * ⚠️ 为什么还要量「触点尺寸」（2026-10-20 修缺陷清单 D23）：
 *   前两条判据盯的都是**版面**（有没有撑破、正文有没有被挤窄），
 *   都没管**能不能点得中** —— 而这一族坏版式在手机上是**看不见**的：
 *   桌面截图上那七个资源出口（Paper / DOI / PDF / Code / Capsule / Data / Figure）
 *   排得整整齐齐，窄屏下却只剩 **13px 高**的一行小字，
 *   换成手指（或触屏笔）几乎点不准。
 *   实测 375px：`.home-pub__link` 高 **13px**、宽 34~63px；
 *   换行处上下两个的 24px 圆**互相相交**（实测圆心距 **17.4px < 24px**）
 *   ⇒ WCAG 2.5.8（Target Size, Minimum, AA）的 **spacing 例外不成立**
 *   ⇒ 这是**实打实的 AA 级不通过**，不是风格偏好。
 *   判据按 WCAG 原文实现：一个目标算通过有三条路
 *     ① 渲染尺寸 ≥ **24×24** CSS px（最省事、也最稳）；
 *     ② **spacing 例外** —— 以它的包围盒为圆心画 24px 直径的圆，
 *        这个圆**不与任何其它目标的盒子相交、也不与任何其它欠尺寸目标的圆相交**；
 *     ③ **行内例外** —— 目标**在句子里**（散文里的行内链接），
 *        尺寸受同一行非目标文字的行高约束 ⇒ 豁免。
 *   ⚠️ ③ 的判据是「**行内盒** 且 **最近的块级祖先去掉所有目标之后还剩着非目标文字**」，
 *      **不是**「只要是 inline 就放过」—— 那会把「独占一行、旁边没别的字」的链接也放过去。
 *   判据编号 TS1–TS4：
 *     TS1 触点判据**自证存活**（一个目标都没量到 ⇒ 判红，防判据空跑）；
 *     TS2 测量**覆盖度自证**（每页每档都量过触点，缺一次就判红）；
 *     TS3 ① / ② / ③ 三条路的判定本身；
 *     TS4 **豁免如实报数**（被行内例外放过的目标有几个，必须在通过文案里说出来 ——
 *        默默放过就等于判据自己把范围缩掉了）。
 *
 * 用法：
 *   node scripts/check-overflow.cjs                # 全部默认档位
 *   node scripts/check-overflow.cjs --width 320    # 只测某一档（调试用）
 *   node scripts/check-overflow.cjs --widths 390,768   # 只测指定的几档
 *
 * 环境变量：
 *   SITE_DIR —— 覆盖产物目录（故障注入用；与 scripts/check-jsonld.cjs 同一约定）。
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const SITE = process.env.SITE_DIR
  ? path.resolve(process.env.SITE_DIR)
  : path.resolve(__dirname, "../_site");

/* ---------- 找 Chrome ----------
 *
 * 此前这里把路径写死成 macOS 的 app bundle 路径
 * （/Applications/Google Chrome.app/...），于是这个脚本在 CI 上
 * **根本跑不起来** —— 它在 Linux 上找不到那个路径。
 * 这也是 scripts/check-gates-wired.cjs 里那条豁免的真实成因，
 * 但那条豁免**写的理由是错的**（见该文件 EXEMPT 处的订正）：
 * GitHub 的 ubuntu runner 镜像**自带 google-chrome**
 * （runner-images 的 Ubuntu 24.04 / 26.04 镜像 README 里
 *  "Browsers and Drivers" 一节明确列着 Google Chrome 与 ChromeDriver），
 * 所以真正缺的不是 Chrome，而是**找 Chrome 的方式只认 macOS**。
 *
 * 现在按三级查找，优先级从高到低：
 *   ① CHROME_PATH 环境变量（显式指定；显式指定却找不到 → 直接报错，
 *      不退回自动查找——显式指定的意图就是"我说的那个"）；
 *   ② PATH 里的 google-chrome / google-chrome-stable / chromium /
 *      chromium-browser（CI 上命中的是这一级）；
 *   ③ 各平台常见安装位置（macOS 的 app bundle、Linux 的 /usr/bin 等）。
 *
 * ⚠️ 找不到 Chrome 时**直接失败，不静默跳过**：
 * 量不了窄屏溢出却不报错，等于给这个门禁发了一张"已通过"的假证书——
 * 那正是本仓库反复在修的那一族缺陷（"看起来在、其实不生效"）。 */
const CHROME_ENV_VAR = "CHROME_PATH";
const CHROME_NAMES = [
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
];
const CHROME_PATHS = [
  // macOS
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
  "/snap/bin/chromium",
];

function findChrome() {
  const explicit = process.env[CHROME_ENV_VAR];
  if (explicit) {
    // ⚠️ 返回形状必须与下面两条一致（{ bin, reason }）：
    //   早先这里直接 `return explicit`（一个字符串），于是主流程里的
    //   `found.bin` 是 undefined → 走「找不到浏览器」分支 →
    //   **显式指定的 CHROME_PATH 永远不生效**（而且是静默不生效）。
    if (fs.existsSync(explicit)) return { bin: explicit, reason: null };
    return {
      bin: null,
      reason:
        `${CHROME_ENV_VAR} 指向的浏览器不存在：${explicit}\n` +
        `  （显式指定时不退回自动查找——你指的就是这一个。）`,
    };
  }

  // ② PATH
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const name of CHROME_NAMES) {
    for (const dir of dirs) {
      const p = path.join(dir, name);
      try {
        fs.accessSync(p, fs.constants.X_OK);
        return { bin: p, reason: null };
      } catch {
        /* 换下一个 */
      }
    }
  }

  // ③ 常见安装位置
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return { bin: p, reason: null };
  }
  return { bin: null, reason: null };
}

/** 默认档位 —— 取法与理由见文件头。 */
const DEFAULT_WIDTHS = [360, 390, 640, 768, 820, 1024, 1440];

/* ---------- 正文列（窄带检测）的判据与规则表 ---------- */

/** ≤1024px：正文列至少要占视口的这个比例（D11 自己写下的验收线）。 */
const CONTENT_MIN_RATIO = 0.85;
/** >1024px：正文列的绝对下限（px）—— 宽屏正文是居中定宽的，只能这么判。 */
const CONTENT_MIN_PX_WIDE = 480;
/** 比例判据适用的宽度上限（与站点的 1024px 断点一致）。 */
const CONTENT_RATIO_MAX_WIDTH = 1024;

/**
 * 每页的「正文列」= 承载正文的那个元素。
 *
 * 为什么逐页写死而不是自动推断（这轮踩过的坑）：
 *   试过「拿正文里最长的那段文字所在的元素」这种通用推断，结果**误报**——
 *   首页英雄区在 768px 是**分栏**设计（实测一段正文只有 336px = 44%），
 *   关于页的 bio 同样在分栏里（483px = 63%）；这些是**有意为之**，不是排版坏掉。
 *   反过来，「正文列被挤窄」这一族（D11）在通用推断下**又抓得住**，
 *   两头不兼容 ⇒ 只能把「这一页的正文列是哪个元素」显式写出来。
 *
 * 匹配规则：先找**完全相等**的，再找带通配符的前缀规则（`/papers/` + 通配 + `/`
 * 匹配 `/papers/<slug>/`）。`/papers/`（列表页）与 `/papers/<slug>/`（精读页）
 * 是两个不同的正文列，所以顺序上完全相等优先。
 *
 * 没登记的路由 ⇒ 默认盯 `main`（主容器不该被挤窄）。
 * ⚠️ 选择器**没命中**一律判红：页面结构变了却悄悄跳过 = 假绿。
 */
const CONTENT_COLUMN_RULES = [
  { match: "/", selector: ".home-hero", note: "首页英雄区（标题+导语+降水图）；它在 ≤1024px 是单栏，实测占视口 91~92%" },
  { match: "/papers/*/", selector: ".paper-body", note: "论文精读页的正文列（D11 坏掉的就是这一列）" },
  { match: "/papers/", selector: "article", note: "论文列表装在 article 容器里" },
  { match: "/blog/", selector: "article", note: "博客列表装在 article 容器里（当前为空状态页）" },
  { match: "/about/", selector: "article", note: "关于页正文在 article 里（英雄区是分栏，不算正文列）" },
  { match: "/404.html", selector: "main", note: "短页，盯主容器" },
];

/** 取某个路由的正文列规则。 */
function contentColumnRule(route) {
  for (const r of CONTENT_COLUMN_RULES) {
    if (!r.match.includes("*") && r.match === route) return r;
  }
  for (const r of CONTENT_COLUMN_RULES) {
    if (!r.match.includes("*")) continue;
    const star = r.match.indexOf("*");
    const prefix = r.match.slice(0, star);
    const suffix = r.match.slice(star + 1);
    if (route.length > prefix.length && route.startsWith(prefix) && route.endsWith(suffix)) {
      return r;
    }
  }
  return { match: "(默认)", selector: "main", note: "未登记的路由，盯主容器" };
}

/* ---------- 触点尺寸（WCAG 2.5.8 Target Size, Minimum）---------- */

/**
 * 触点最小尺寸（CSS px）—— WCAG 2.5.8 的下限。
 * 判据实现照 WCAG 原文：一个目标只要满足「≥24×24」或「spacing 例外成立」
 * 或「行内例外」三者之一，就算通过（详见文件头）。
 */
const TARGET_MIN = 24;

/**
 * 判定一个目标算不算「在句子里」（行内例外）。
 * 判据两条同时成立才算：
 *   ① 自身是**行内盒**（computed display === 'inline'）——
 *      行内盒的尺寸受同一行非目标文字的行高约束，这正是 WCAG 说的
 *      「its size is otherwise constrained by the line-height of non-target text」；
 *   ② **父元素里还有别的文字** —— 只有自己一段文字的链接不算「在句子里」，
 *      它的大小没受任何非目标文字约束 ⇒ 行内例外不成立，要走 ① / ② 两条路。
 */
function isInSentence(t) {
  return t.display === "inline" && t.inSentence;
}

/** 以目标包围盒为圆心、半径 TARGET_MIN/2 的圆。 */
function targetCircle(t) {
  return { cx: t.x + t.w / 2, cy: t.y + t.h / 2, r: TARGET_MIN / 2 };
}

/** 两个圆是否相交（相切不算相交 —— WCAG 说的是 "does not intersect"）。 */
function circlesHit(a, b) {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r;
}

/** 圆与矩形是否相交（相切不算相交）。 */
function circleHitsRect(c, r) {
  const nx = Math.max(r.x, Math.min(c.cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(c.cy, r.y + r.h));
  return Math.hypot(nx - c.cx, ny - c.cy) < c.r;
}

/**
 * 按 WCAG 2.5.8 判定一批目标。
 * 返回 { violations, exemptInline, undersized }：
 *   violations —— 没过三条路的（每个附上「撞上了谁」）
 *   exemptInline —— 走行内例外的（数量要在通过文案里报出来，TS4）
 *   undersized —— 渲染尺寸不足 24×24 的（不论过没过，都报出来供人看）
 */
function evaluateTargets(targets) {
  const violations = [];
  let exemptInline = 0;
  let undersized = 0;
  for (const t of targets) {
    const small = t.w < TARGET_MIN || t.h < TARGET_MIN;
    if (small) undersized++;
    if (isInSentence(t)) {
      exemptInline++;
      continue;
    }
    if (t.w >= TARGET_MIN && t.h >= TARGET_MIN) continue;
    // spacing 例外：24px 圆不许碰到任何别的目标，也不许碰到别的欠尺寸目标的圆
    const c = targetCircle(t);
    let hit = null;
    for (const o of targets) {
      if (o === t) continue;
      if (circleHitsRect(c, o)) {
        hit = { other: o, why: "圆与它的盒子相交" };
        break;
      }
      if ((o.w < TARGET_MIN || o.h < TARGET_MIN) && circlesHit(c, targetCircle(o))) {
        hit = { other: o, why: "圆与它的 24px 圆相交" };
        break;
      }
    }
    if (hit) violations.push({ target: t, ...hit });
  }
  return { violations, exemptInline, undersized };
}

/**
 * 解析命令行里的宽度档位。
 *   --width N        只测某一档（可重复；保留旧写法，别的地方还在用）
 *   --widths a,b,c   只测指定的几档
 * 一个都不给 ⇒ 用 DEFAULT_WIDTHS。
 * ⚠️ 解析失败**直接判红退出**：把一个拼错的宽度当成"没传"而悄悄退回默认档位，
 *   等于给门禁发一张"我测过了"的假证书。
 */
function parseWidths(argv) {
  const list = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--width") {
      const raw = argv[i + 1];
      const v = Number(raw);
      if (raw === undefined || !Number.isFinite(v) || v <= 0) {
        throw new Error(`--width 需要一个正整数，收到：${raw === undefined ? "(缺值)" : raw}`);
      }
      list.push(v);
      i++;
    } else if (argv[i] === "--widths") {
      const raw = argv[i + 1];
      if (raw === undefined) throw new Error("--widths 后面要跟一串宽度，比如 --widths 390,768");
      for (const part of String(raw).split(",")) {
        const t = part.trim();
        if (!t) continue;
        const v = Number(t);
        if (!Number.isFinite(v) || v <= 0) throw new Error(`--widths 里有一个不是正整数：${t}`);
        list.push(v);
      }
      i++;
    }
  }
  return list.length ? [...new Set(list)] : DEFAULT_WIDTHS.slice();
}

let WIDTHS;
try {
  WIDTHS = parseWidths(process.argv.slice(2));
} catch (e) {
  console.error("✗ " + e.message);
  console.error("  用法：node scripts/check-overflow.cjs [--width N | --widths a,b,c]");
  process.exit(1);
}

/* ---------- 1. 起一个临时静态服务器（只服务 _site/） ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".bib": "text/plain; charset=utf-8",
};
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(SITE, p);
      if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end("not found");
        return;
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

/* ---------- 2. 起 Chrome 并连上 CDP ---------- */
async function startChrome(chromeBin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-cdp-"));
  /* CI（Linux）上要额外两枚旗标：容器的沙箱常常起不来，
     /dev/shm 常常只有 64MB 而 Chrome 拿它当共享内存会崩。
     两条都只在 Linux 上加——macOS 本机不需要，也不该降级本机的沙箱。 */
  const linuxOnly = process.platform === "linux"
    ? ["--no-sandbox", "--disable-dev-shm-usage"]
    : [];
  const proc = spawn(
    chromeBin,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--disable-extensions",
      ...linuxOnly,
    ],
    { stdio: "ignore" }
  );

  // Chrome 把实际端口写在 user-data-dir/DevToolsActivePort
  const portFile = path.join(dir, "DevToolsActivePort");
  let port = null;
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (fs.existsSync(portFile)) {
      const t = fs.readFileSync(portFile, "utf8").split("\n");
      if (t[0] && t[0].trim()) {
        port = Number(t[0].trim());
        break;
      }
    }
  }
  if (!port) throw new Error("Chrome 启动超时，没拿到调试端口");
  return { proc, port, dir };
}

/* ---------- 3. 极简 CDP 客户端 ---------- */
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) {
        this.listeners.forEach((fn) => fn(msg));
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  once(method, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等待 ${method} 超时`)), timeoutMs);
      const fn = (msg) => {
        if (msg.method === method) {
          clearTimeout(timer);
          this.listeners = this.listeners.filter((x) => x !== fn);
          resolve(msg.params);
        }
      };
      this.listeners.push(fn);
    });
  }
}

/* ---------- 4. 页面里的测量脚本 ----------
 *
 * 传进来一个正文列选择器，一并量它的宽度（窄带检测用）。
 * 选择器**量不到**时 found=false —— 门禁据此判红，不当作「没事」。
 */
const measureScript = (contentSelector) => `(() => {
  const CONTENT_SELECTOR = ${JSON.stringify(contentSelector)};
  const vw = document.documentElement.clientWidth;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.className && typeof el.className === 'string') {
      s += '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.');
    }
    return s;
  };
  // 祖先里只要有一层是横向可滚容器，这个元素越界就是**有意为之**
  // （比如代码块、横向滑动的大图），不算把页面撑坏。
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const overflow = [], scrollers = [], offcanvas = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') continue;
    if (r.right <= vw + 1 && r.left < -1) {
      // 被故意挪到屏幕左侧之外（如 skip-link、隐藏的抽屉）——不撑宽页面
      if (cs.position === 'absolute' || cs.position === 'fixed') { offcanvas.push(sel(el)); continue; }
    }
    if (r.right > vw + 1 || r.left < -1) {
      const rec = { sel: sel(el), left: Math.round(r.left), right: Math.round(r.right), over: Math.round(Math.max(r.right - vw, -r.left)) };
      if (inScroller(el)) scrollers.push(rec);
      else overflow.push(rec);
    }
  }
  // 只保留最外层的越界元素（子元素通常只是跟着父元素一起越界）
  const minimal = overflow.filter(o => !overflow.some(p => p !== o && p.sel !== o.sel && p.left <= o.left && p.right >= o.right));
  // 正文列：量它的**盒子宽度**（不含外边距），与视口比
  const ce = CONTENT_SELECTOR ? document.querySelector(CONTENT_SELECTOR) : null;
  const content = {
    selector: CONTENT_SELECTOR,
    found: !!ce,
    width: ce ? Math.round(ce.getBoundingClientRect().width) : null,
  };
  /* ---------- 触点（WCAG 2.5.8）----------
     只收**能用指针激活**的目标（链接 / 按钮 / 表单控件 / role=button）。
     刻意不收 [tabindex] 之类：可聚焦不等于可点击 ——
     首页降水图那个 tabindex="0" 的画布是**读数用**的可聚焦组，不是指针目标。 */
  const TARGET_SELECTOR = 'a[href], button, input, select, textarea, [role="button"]';
  const targets = [];
  for (const el of document.querySelectorAll(TARGET_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    /* 「在句子里」：**向上找到最近的块级祖先**，看它去掉所有目标之后还剩不剩
       非目标文字。剩下的文字就是和它同处一个行内排版上下文的那些字
       （作者串里的「, 」、正文里的句子……）⇒ 它的尺寸受非目标文字的行高约束
       ⇒ 走行内例外。
       ⚠️ 为什么不能只看**直接父级**：本人（site.author）的名字被
       一个 strong.home-pub__self 包着，直接父级去掉目标后是空的，
       而它其实在作者串「Xueke Wu, Yihang Lyu, Guohao Hu」里 —— 那个「, 」
       是**祖父级**里的非目标文字。所以要往上走到块级祖先为止。
       ⚠️ 为什么必须止于**块级**：块级祖先是行内排版上下文的边界；
       再往上走（到 <body>）几乎总能捞到文字，那样**任何**链接都会被当成
       「在句子里」，例外就等于没有。 */
    let inSentence = false;
    let node = el;
    while (node && node !== document.documentElement) {
      const ncs = getComputedStyle(node);
      const blockish =
        !/^(inline|inline-block|inline-flex|inline-grid|ruby|ruby-base|ruby-text|contents)$/.test(ncs.display);
      if (blockish) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll(TARGET_SELECTOR).forEach((n) => n.remove());
        inSentence = (clone.textContent || "").replace(/\\s+/g, " ").trim().length > 0;
        break;
      }
      node = node.parentElement;
    }
    targets.push({
      sel: sel(el),
      text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      x: Math.round(r.left * 10) / 10,
      y: Math.round(r.top * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      display: cs.display,
      inSentence,
    });
  }
  return {
    vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    hasHScroll: document.documentElement.scrollWidth > vw + 1,
    overflow: minimal.slice(0, 12),
    scrollers: scrollers.slice(0, 8),
    offcanvas: offcanvas.slice(0, 3),
    content,
    targets,
  };
})()`;

/* ---------- 主流程 ---------- */
(async () => {
  if (!fs.existsSync(SITE)) {
    console.error(`✗ 找不到 ${SITE}，请先运行 npm run build`);
    process.exit(1);
  }
  const found = findChrome();
  if (!found.bin) {
    if (found.reason) {
      console.error(`✗ ${found.reason}`);
    } else {
      console.error(
        "✗ 找不到可用的 Chrome / Chromium。\n" +
          "  这个门禁要用真实浏览器量多档宽度下的横向溢出，量不了就不算通过——\n" +
          "  静默跳过等于给这个门禁发一张「已通过」的假证书。\n" +
          "  · macOS：装 Google Chrome，或设 CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n" +
          "  · Linux / CI：GitHub 的 ubuntu runner 镜像自带 google-chrome，应能自动找到；\n" +
          "    若在此报错，说明 runner 镜像变了（把它加进 deploy.yml 的安装步骤），\n" +
          "    或设 CHROME_PATH=/usr/bin/google-chrome 明确指定。"
      );
    }
    process.exit(1);
  }
  const chromeBin = found.bin;
  console.log(`浏览器：${chromeBin}`);

  /* WebSocket 全局：Node 21.0.0 引入，**22.0.0 起不再需要 --experimental-websocket**，
     22.4.0 起转正。Node 20 上它默认不开（要加旗标），
     早于 20.10 的版本干脆没有 → 直接 new WebSocket(...) 会抛
     "WebSocket is not defined"，看不出是版本问题。
     这里提前判一次，把话说清楚。 */
  if (typeof WebSocket !== "function") {
    console.error(
      "✗ 当前 Node 没有全局 WebSocket（CDP over WebSocket 需要它）。\n" +
        "  · Node ≥ 22.4 默认可用\n" +
        "  · Node 20 需要 --experimental-websocket 旗标（本仓库不采用那条路）\n" +
        "  · 更早的版本没有该全局\n" +
        `  当前版本：${process.version}`
    );
    process.exit(1);
  }

  const pages = [];
  (function walk(dir, base) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.name.startsWith("._")) continue;
      if (e.isDirectory()) walk(p, base + e.name + "/");
      else if (e.name.endsWith(".html")) pages.push(base + e.name);
    }
  })(SITE, "");
  const routes = pages.map((p) => (p.endsWith("/index.html") ? "/" + p.slice(0, -"index.html".length) : "/" + p));

  const { server, port } = await startServer();
  const chrome = await startChrome(chromeBin);
  const wsUrl = `ws://127.0.0.1:${chrome.port}/devtools/browser/${(await fetch(`http://127.0.0.1:${chrome.port}/json/version`).then((r) => r.json())).webSocketDebuggerUrl.split("/").pop()}`;

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const cdp = new CDP(ws);

  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);

  let bad = 0;
  let measured = 0;
  const badPairs = []; // { width, route, scrollWidth } —— 溢出到底在哪一档、哪一页
  const viewportMismatch = []; // { width, route, actual } —— 请求的宽度与量到的布局视口对不上
  const perWidth = new Map(); // width → 该档测了多少页
  const narrowColumns = []; // { width, route, selector, contentWidth, min, reason } —— 正文被挤窄的位置
  const columnNotFound = []; // { width, route, selector } —— 正文列选择器没命中
  let columnChecked = 0; // 正文列实际量了多少次（自证用）
  const targetViolations = []; // { width, route, target, other, why } —— 触点没达到 WCAG 2.5.8
  let targetMeasured = 0; // 量到过触点的（页 × 档）次数（自证用）
  let targetCount = 0; // 一共量到多少个触点（自证用）
  let inlineExempt = 0; // 走行内例外被豁免的目标总数（TS4 如实报数）

  for (const width of WIDTHS) {
    /* ⚠️ 每一档都要**重新设置**设备尺寸 —— 只设一次的话，
       后面几档量到的还是第一档的布局（看起来跑了很多档，其实量的是同一个宽度）。 */
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height: 844, deviceScaleFactor: 2, mobile: true,
    }, sessionId);

    console.log(`视口宽度 ${width}px，共 ${routes.length} 个页面`);
    for (const route of routes) {
      const url = `http://127.0.0.1:${port}${route}`;
      const loaded = cdp.once("Page.loadEventFired");
      await cdp.send("Page.navigate", { url }, sessionId);
      await loaded;
      await new Promise((r) => setTimeout(r, 250)); // 等字体/布局稳定

      const rule = contentColumnRule(route);
      const res = await cdp.send(
        "Runtime.evaluate",
        { expression: measureScript(rule.selector), returnByValue: true },
        sessionId
      );
      const m = res.result.value;
      measured++;
      perWidth.set(width, (perWidth.get(width) || 0) + 1);

      /* ⚠️ 量到的布局视口宽度必须等于请求的宽度 —— 不等就说明**这一档根本没被
         模拟成那个宽度**（典型成因：页面没有 viewport meta，mobile 模拟会退回
         980px 的布局视口）。这种情况下"这一档没溢出"是**假绿**，必须判红。 */
      if (Math.abs(m.vw - width) > 1) {
        viewportMismatch.push({ width, route, actual: m.vw });
      }

      /* ---------- 正文列（窄带检测） ---------- */
      const c = m.content;
      const useRatio = m.vw <= CONTENT_RATIO_MAX_WIDTH;
      const minWidth = useRatio
        ? Math.round(m.vw * CONTENT_MIN_RATIO)
        : CONTENT_MIN_PX_WIDE;
      let columnOk = true;
      let columnNote = "";
      if (!c.found) {
        columnOk = false;
        columnNote = "正文列选择器没命中（页面结构变了？）";
        columnNotFound.push({ width, route, selector: rule.selector });
      } else if (c.width < minWidth) {
        columnOk = false;
        columnNote = useRatio
          ? `正文被挤成窄带（占视口 ${Math.round((c.width / m.vw) * 100)}%，下限 ${Math.round(CONTENT_MIN_RATIO * 100)}%）`
          : `正文列太窄（${c.width}px，下限 ${CONTENT_MIN_PX_WIDE}px）`;
        narrowColumns.push({
          width, route, selector: rule.selector,
          contentWidth: c.width, viewport: m.vw, min: minWidth,
          reason: useRatio ? "ratio" : "absolute",
        });
      }
      if (c.found) columnChecked++;
      const pct = c.found ? Math.round((c.width / m.vw) * 100) : null;
      const columnLine = c.found
        ? `      正文列 ${c.selector} ${c.width}px ${pct}%（下限 ${useRatio ? `${Math.round(CONTENT_MIN_RATIO * 100)}%` : `${CONTENT_MIN_PX_WIDE}px`}）${columnOk ? "✓" : "✗"}`
        : `      正文列 ${c.selector} 未找到 ✗`;

      /* ---------- 触点尺寸（WCAG 2.5.8） ---------- */
      const targets = m.targets || [];
      targetMeasured++;
      targetCount += targets.length;
      const tEval = evaluateTargets(targets);
      inlineExempt += tEval.exemptInline;
      const smallest = targets.reduce(
        (acc, t) => (acc === null || t.h < acc.h ? t : acc),
        null
      );
      const targetLine =
        `      触点 ${targets.length} 个` +
        (smallest ? `（最矮 ${Math.round(smallest.h)}×${Math.round(smallest.w)}px ${smallest.sel}）` : "") +
        (tEval.undersized ? `，其中 ${tEval.undersized} 个不足 ${TARGET_MIN}×${TARGET_MIN}` : "") +
        (tEval.violations.length ? ` ✗ ${tEval.violations.length} 个不达标` : " ✓");
      tEval.violations.forEach((v) => {
        targetViolations.push({
          width, route,
          target: v.target, other: v.other, why: v.why,
        });
      });

      /* ⚠️ 行首的 ✓/✗ 现在代表**本页本档的全部判据**（横向溢出 + 正文列宽 + 触点尺寸）；
         退出码与它同源 —— 下面几处计数加起来就是最终退出码的依据。 */
      const status = m.hasHScroll
        ? "✗ 横向可拖"
        : columnOk && tEval.violations.length === 0
        ? "✓"
        : "✗";
      console.log(`  ${status} ${route}  (scrollWidth ${m.pageScrollWidth} / 视口 ${m.vw})`);
      console.log(columnLine);
      console.log(targetLine);
      if (columnNote) console.log(`      ${columnNote}`);
      tEval.violations.forEach((v) => {
        console.log(
          `      触点过小：${v.target.sel}「${v.target.text}」${Math.round(v.target.w)}×${Math.round(v.target.h)}px` +
            `（下限 ${TARGET_MIN}×${TARGET_MIN}，且 ${v.why}：${v.other.sel}「${v.other.text}」）`
        );
      });
      /* ⚠️ 退出码必须与打出来的 ✓/✗ **同源**：判据一律用 hasHScroll
         （页面真的能横向滚动 = documentElement.scrollWidth > 视口）。
         此前这里用的是 `m.overflow.length`（元素矩形扫描的结果）——两个条件
         不是一回事，矩形扫描**抓不到"内容溢出"**：一个 div 的盒子宽度仍是
         390px（超长内容撑在盒子里面），矩形扫描看不到它，但页面确实能横滚。
         结果就是：脚本打印"✗ 横向可拖"、退出码却给 0。
         ——"永远通过的检查比没有检查更糟"：谁把它接进 CI，谁就会拿到假绿。
       2026-10-19 实测（注入一个 400 字符长串的 div）：
         scrollWidth 4416 / 视口 390，输出 ✗，退出码 0。 */
      if (m.hasHScroll) {
        bad++;
        badPairs.push({ width, route, scrollWidth: m.pageScrollWidth });
      }
      if (m.overflow.length) {
        m.overflow.forEach((o) => console.log(`      越界 ${o.over}px  ${o.sel}`));
      }
      m.scrollers.forEach((o) => console.log(`      （容器内有意横滚）${o.sel}`));
    }
    console.log("");
  }

  /* ---------- 自证：每一档到底测了没有 ---------- */
  const problems = [];
  const expected = WIDTHS.length * routes.length;
  if (measured !== expected) {
    problems.push(
      `测量次数对不上：期望 ${WIDTHS.length} 档 × ${routes.length} 页 = ${expected} 次，实际 ${measured} 次 —— 有一档没跑完。`
    );
  }
  for (const w of WIDTHS) {
    const n = perWidth.get(w) || 0;
    if (n !== routes.length) {
      problems.push(`宽度 ${w}px 只测了 ${n} 个页面（应为 ${routes.length} 个）—— 这一档没被完整测量。`);
    }
  }
  if (viewportMismatch.length) {
    problems.push(
      `${viewportMismatch.length} 处「请求的视口宽度」与「实际量到的布局视口宽度」不符 —— ` +
        `这些档位等于没被真正测到：` +
        viewportMismatch.map((x) => `${x.route}@${x.width}px→${x.actual}px`).join("、")
    );
  }
  /* 正文列也自证：每一页每一档都要量过一次（量到 = 选择器命中）。 */
  if (columnChecked + columnNotFound.length !== expected) {
    problems.push(
      `正文列测量次数对不上：期望 ${expected} 次，实际 ${columnChecked + columnNotFound.length} 次 —— ` +
        `有一页没被量到。`
    );
  }
  /* TS1 / TS2：触点判据自证 —— 每页每档都要量一次触点，且**至少量到过一个**。
     一个都没量到 = 判据空跑（选择器写错、页面结构变了……）⇒ 判红。 */
  if (targetMeasured !== expected) {
    problems.push(
      `触点测量次数对不上：期望 ${expected} 次（每页每档一次），实际 ${targetMeasured} 次 —— ` +
        `有一页没被量到触点。`
    );
  }
  if (targetCount === 0) {
    problems.push(
      `TS1 一个触点都没量到 —— 触点判据此刻等于**空跑**，空跑的门禁等于没有门禁，所以判红。`
    );
  }

  ws.close();
  chrome.proc.kill();
  server.close();
  // Chrome 退出前还在写盘，直接删会报 ENOTEMPTY；等它真的退出再清理。
  await new Promise((r) => {
    chrome.proc.once("exit", r);
    setTimeout(r, 3000);
  });
  try {
    fs.rmSync(chrome.dir, { recursive: true, force: true });
  } catch {
    /* 临时目录清不掉不影响结果，交给系统回收 */
  }

  const widthList = WIDTHS.join(" / ");
  if (problems.length) {
    console.error("\n✗ 窄屏溢出门禁未通过：\n");
    problems.forEach((p) => console.error(`  ✗ ${p}`));
    if (badPairs.length) {
      console.error(`\n  横向溢出位置（宽度 → 路由）：`);
      badPairs.forEach((b) => console.error(`    · ${b.width}px  ${b.route}  (scrollWidth ${b.scrollWidth})`));
    }
    console.error("");
    process.exit(1);
  }
  if (bad) {
    console.error(`\n✗ ${bad} 处横向溢出（宽度 → 路由）：`);
    badPairs.forEach((b) => console.error(`  · ${b.width}px  ${b.route}  (scrollWidth ${b.scrollWidth})`));
    console.error("");
    process.exit(1);
  }
  if (columnNotFound.length) {
    console.error(`\n✗ ${columnNotFound.length} 处「正文列选择器没命中」—— 页面结构变了，门禁不能装作没看见：`);
    columnNotFound.forEach((n) => console.error(`  · ${n.width}px  ${n.route}  选择器 ${n.selector}`));
    console.error("");
    process.exit(1);
  }
  if (narrowColumns.length) {
    console.error(`\n✗ ${narrowColumns.length} 处「正文被挤成窄带」（宽度 → 路由）：`);
    narrowColumns.forEach((n) => {
      const limit = n.reason === "ratio"
        ? `下限 ${Math.round(CONTENT_MIN_RATIO * 100)}%`
        : `下限 ${CONTENT_MIN_PX_WIDE}px`;
      console.error(`  · ${n.width}px  ${n.route}  正文列 ${n.selector} ${n.contentWidth}px / 视口 ${n.viewport}px（${limit}）`);
    });
    console.error("");
    process.exit(1);
  }
  if (targetViolations.length) {
    console.error(
      `\n✗ ${targetViolations.length} 处触点未达 WCAG 2.5.8（Target Size, Minimum, AA）` +
        `（下限 ${TARGET_MIN}×${TARGET_MIN} CSS px，或 spacing 例外成立）：`
    );
    targetViolations.forEach((v) => {
      console.error(
        `  · ${v.width}px  ${v.route}  ${v.target.sel}「${v.target.text}」` +
          `${Math.round(v.target.w)}×${Math.round(v.target.h)}px（${v.why}：${v.other.sel}「${v.other.text}」）`
      );
    });
    console.error("");
    process.exit(1);
  }
  console.log(
    `✓ 所有页面在 ${WIDTHS.length} 档宽度（${widthList}）下均无横向溢出，` +
      `且正文列都不窄、触点都达到 WCAG 2.5.8 的要求` +
      `（共 ${measured} 次测量，${routes.length} 个页面；` +
      `量到触点 ${targetCount} 个，其中 ${inlineExempt} 个按**行内例外**豁免）`
  );
  process.exit(0);
})().catch((e) => {
  console.error("检查失败：", e.message);
  process.exit(1);
});
