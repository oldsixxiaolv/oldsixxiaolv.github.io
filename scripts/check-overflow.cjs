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
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
async function startChrome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mh-cdp-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--hide-scrollbars",
      "--disable-extensions",
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
  if (!fs.existsSync(CHROME)) {
    console.error(`✗ 找不到 Chrome：${CHROME}`);
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
  const chrome = await startChrome();
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
    if (m.overflow.length) {
      bad++;
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
