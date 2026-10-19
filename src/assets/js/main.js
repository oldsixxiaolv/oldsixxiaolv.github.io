/* main.js · entry: theme + nav + reading progress + motion utils */
import "./theme.js";
import "./nav.js";

// Reveal content as it enters the viewport without hiding it when JS is unavailable.
(function initReveal() {
  const nodes = [...document.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;

  // Keep the static page visible until the enhancement is ready.
  document.documentElement.classList.add("motion-ready");
  nodes.forEach((node) => {
    const delay = Number(node.dataset.revealDelay || 0);
    node.style.setProperty("--reveal-delay", `${delay}ms`);
    node.classList.add("reveal");
  });

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    nodes.forEach((node) => node.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries, instance) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      instance.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -8%" });

  nodes.forEach((node) => observer.observe(node));
})();

/* main.js · entry: theme + nav + reveal motion
 *
 * 阅读进度条不在这里：paper-reader/reading-progress.js 是它的正式实现
 * （原 main.js §2 的 IIFE 已搬过去），paper 页由 paper.njk 动态 import 挂载。
 * 两份都留着会让 paper 页注册两个 scroll 监听、同一个 bar 被写两次宽度。 */

// Current year in footer
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = new Date().getFullYear();
});

/* Copy-to-clipboard for [data-copy-target] blocks.
 *
 * 访客到论文页最常做的事就是"复制这条 BibTeX"。不引第三方库：
 * navigator.clipboard 在 https / localhost 下可用，失败时回退到
 * 选中文本 + execCommand（老浏览器兜底），再失败就什么都不做——
 * 按钮只是提示文案变了，功能本身不依赖它。
 *
 * 无 JS 时 <pre> 里的 BibTeX 仍然完整可见、可手动选中复制，
 * 所以这个增强是纯增量，不是必需项。
 */
(function initCopyButtons() {
  const buttons = [...document.querySelectorAll("[data-copy-target]")];
  if (!buttons.length) return;

  const sourceOf = (btn) => {
    const id = btn.dataset.copyTarget;
    const el = id ? document.getElementById(id) : null;
    if (el) return el;
    // 按钮本身带 data-copy-source 时，复制同级 pre。
    const sel = btn.dataset.copySource;
    return sel ? btn.querySelector(sel) || document.querySelector(sel) : null;
  };

  const flash = (btn, msg) => {
    const original = btn.dataset.copyLabel || btn.textContent;
    btn.dataset.copyLabel = original;
    btn.textContent = msg;
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = original;
      btn.disabled = false;
    }, 1800);
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const src = sourceOf(btn);
      if (!src) return;
      const text = src.textContent.trim();

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
        flash(btn, "Copied");
      } catch (err) {
        flash(btn, "Copy failed");
      }
    });
  });
})();
