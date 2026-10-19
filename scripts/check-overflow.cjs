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
 * 用法：
 *   node scripts/check-overflow.cjs            # 检查 _site/ 下所有页面（390px）
 *   node scripts/check-overflow.cjs --width 320
 */
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const SITE = path.resolve(__dirname, "../_site");

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

const argWidth = (() => {
  const i = process.argv.indexOf("--width");
  return i > -1 ? Number(process.argv[i + 1]) : 390;
})();
const VIEWPORT = argWidth;

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

/* ---------- 4. 页面里的测量脚本 ---------- */
const MEASURE = `(() => {
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
  return {
    vw,
    pageScrollWidth: document.documentElement.scrollWidth,
    hasHScroll: document.documentElement.scrollWidth > vw + 1,
    overflow: minimal.slice(0, 12),
    scrollers: scrollers.slice(0, 8),
    offcanvas: offcanvas.slice(0, 3),
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
          "  这个门禁要用真实浏览器量窄屏（390px）下的横向溢出，量不了就不算通过——\n" +
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
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT, height: 844, deviceScaleFactor: 2, mobile: true,
  }, sessionId);

  let bad = 0;
  console.log(`视口宽度 ${VIEWPORT}px，共 ${routes.length} 个页面\n`);

  for (const route of routes) {
    const url = `http://127.0.0.1:${port}${route}`;
    const loaded = cdp.once("Page.loadEventFired");
    await cdp.send("Page.navigate", { url }, sessionId);
    await loaded;
    await new Promise((r) => setTimeout(r, 250)); // 等字体/布局稳定

    const res = await cdp.send("Runtime.evaluate", { expression: MEASURE, returnByValue: true }, sessionId);
    const m = res.result.value;

    const status = m.hasHScroll ? "✗ 横向可拖" : "✓";
    console.log(`${status} ${route}  (scrollWidth ${m.pageScrollWidth} / 视口 ${m.vw})`);
    /* ⚠️ 退出码必须与打出来的 ✓/✗ **同源**：判据一律用 hasHScroll
       （页面真的能横向滚动 = documentElement.scrollWidth > 视口）。
       此前这里用的是 `m.overflow.length`（元素矩形扫描的结果）——两个条件
       不是一回事，矩形扫描**抓不到"内容溢出"**：一个 div 的盒子宽度仍是
       390px（超长内容撑在盒子里面），矩形扫描看不到它，但页面确实能横滚。
       结果就是：脚本打印"✗ 横向可拖"、退出码却给 0。
       ——"永远通过的检查比没有检查更糟"：谁把它接进 CI，谁就会拿到假绿。
       2026-10-19 实测（注入一个 400 字符长串的 div）：
         scrollWidth 4416 / 视口 390，输出 ✗，退出码 0。 */
    if (m.hasHScroll) bad++;
    if (m.overflow.length) {
      m.overflow.forEach((o) => console.log(`      越界 ${o.over}px  ${o.sel}`));
    }
    m.scrollers.forEach((o) => console.log(`      （容器内有意横滚）${o.sel}`));
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

  console.log(bad ? `\n✗ ${bad} 个页面存在横向溢出` : "\n✓ 所有页面在窄屏下均无横向溢出");
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error("检查失败：", e.message);
  process.exit(1);
});
