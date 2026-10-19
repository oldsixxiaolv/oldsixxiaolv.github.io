/* theme.js · light/dark mode toggle with localStorage persistence */
(function () {
  "use strict";

  const STORAGE_KEY = "meteohub-theme";
  const root = document.documentElement;

  function getSystem() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function apply(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else if (theme === "light") {
      root.setAttribute("data-theme", "light");
    } else {
      root.removeAttribute("data-theme");
    }
    // Update all toggle buttons.
    // ⚠️ 只写 aria-pressed，**不写 aria-label**：可访问名必须稳定，状态只由
    //    aria-pressed 表达（ARIA 切换按钮的标准模式）。名字跟着状态变会坏两件事：
    //      ① 语音控制（"click Dark theme"）在切换一次之后就再也匹配不到这个按钮；
    //      ② 同一个状态被 aria-label 和 aria-pressed 各编码一遍，读屏会念重复。
    //    此前这一行把 aria-label 写成中文（"切换到深色模式"），而静态 HTML
    //    写的是英文——同一个按钮的可访问名取决于 JS 跑没跑，页面语言也就此
    //    自相矛盾（全站已统一为英文，见 src/_data/site.js 的 locale 说明）。
    document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
      const current = root.getAttribute("data-theme") || getSystem();
      btn.setAttribute("aria-pressed", current === "dark" ? "true" : "false");
    });
  }

  // Initial: prefer saved → system
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  apply(saved || getSystem());

  // Toggle handler (event delegation)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-toggle]");
    if (!btn) return;
    e.preventDefault();
    const current = root.getAttribute("data-theme") || getSystem();
    const next = current === "dark" ? "light" : "dark";
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    apply(next);
  });

  // React to system change (only if user has not explicitly chosen)
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => {
      let userChosen = null;
      try { userChosen = localStorage.getItem(STORAGE_KEY); } catch (_) {}
      if (!userChosen) apply(e.matches ? "dark" : "light");
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }
})();
