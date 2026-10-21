/* paper-reader/main.js · entry orchestrator
 * ---------------------------------------------------------------------------
 * Phase 2B.6: split from monolithic paper-reader.js (21KB).
 * Each capability is its own ESM module, dynamically imported here so the
 * browser fetches them in parallel and only the ones the paper actually uses.
 *
 * Modules (dependency order):
 *   toc              · independent (headings → sticky)
 *   theme            · independent (annotation rerender on theme change)
 *   annotations      · async fetch (annotations.json → render right pane)
 *   highlight        · depends on annotations (2-way linking, IO)
 *
 * Public API:
 *   initPaperReader({ paperRoot, annotationsUrl }) — 唯一入口。
 *   paper.njk 是调用方，paperRoot / annotationsUrl 由它算好后传入；
 *   本模块不做自动探测（早期版本按 [data-paper] / URL 猜 slug，但那条路径
 *   拼出来的 /content/papers/ 少了 pathPrefix，部署到 GitHub Pages 子路径
 *   下必然 404，已随 auto-init 一起删除）。
 * ------------------------------------------------------------------------- */

export async function initPaperReader(opts = {}) {
  // 没有 paperRoot 说明调用方没给出上下文（例如误在非 paper 页调用），直接退出。
  if (!opts.paperRoot) return;

  // ---- 1. Fire independent modules in parallel ----
  const [tocMod, themeMod] = await Promise.all([
    import("./toc.js"),
    import("./theme.js"),
  ]);
  tocMod.init(opts);
  themeMod.init(opts);

  // ---- 2. Async fetch annotations, then mount highlight ----
  //       highlight 必须拿到 annotations.init() 的返回值（pane / wrap /
  //       itemNodes / annoByTarget / annoById / decorated），只把入参 ctx
  //       透传过去会让 highlight 在 `if (!pane || !wrap) return` 处静默退出：
  //       批注点击联动、←/→ 键盘导航、以及移动端的 .annot-toggle 开面板按钮
  //       全部不会挂载（移动端批注面板被 translateY(105%) 推出屏幕且没有按钮
  //       能拉回来，等于完全不可达）。
  //       没有 annotationsUrl（页面确实没有批注）时整段跳过：否则等于对着
  //       一个必然 404 的地址发一次请求，再刷一条 console 警告。
  if (opts.annotationsUrl) {
    try {
      const annos = await import("./annotations.js");
      const built = await annos.init(opts);
      const highlightMod = await import("./highlight.js");
      highlightMod.init({ ...opts, ...built });
    } catch (err) {
      // Annotations missing or network error — keep the TOC alive.
      // eslint-disable-next-line no-console
      console.warn("[paper-reader] annotations disabled:", err);
    }
  }

  // ---- 3. Mark page as paper-ready (CSS hooks, instrumentation) ----
  document.documentElement.classList.add("paper-ready");
}

export default { initPaperReader };
