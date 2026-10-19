/* paper-reader/highlight.js
 * ---------------------------------------------------------------------------
 * All interactive handlers for the paper reader:
 *   · Click on annotation card → scroll + flash target paragraph
 *   · Click on decorated paragraph → activate matching card + scroll pane
 *   · Mobile toggle (open / close side pane)
 *   · Keyboard nav (← / → jump between decorated paragraphs; Esc clear)
 *   · IntersectionObserver: as user scrolls, activate matching card
 *   · Direct ?a=id deep-link
 *
 * Phase 2B.6: lifted from paper-reader.js §5 (card click handlers), §6 (mobile
 * toggle), §7 (keyboard nav), §8 (IO), §11 (deep-link).
 * ------------------------------------------------------------------------- */

export function init(ctx) {
  const { pane, itemNodes, annoByTarget, annoById, decorated, wrap } = ctx;
  if (!pane || !wrap) return;

  // ---- Mobile / responsive pane toggle ----
  const mobileQuery = window.matchMedia("(max-width: 768px)");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "annot-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", pane.id);
  toggle.textContent = "View annotations";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "annot-close";
  close.textContent = "Back to text";
  const setPaneOpen = (open) => {
    wrap.classList.toggle("is-pane-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (!open && mobileQuery.matches) toggle.focus({ preventScroll: true });
  };
  close.addEventListener("click", () => setPaneOpen(false));
  toggle.addEventListener("click", () => setPaneOpen(!wrap.classList.contains("is-pane-open")));
  pane.querySelector(".annot-pane__head").prepend(close);
  wrap.appendChild(toggle);

  // ---- Click on card → activate target ----
  for (const [id, item] of itemNodes.entries()) {
    const info = annoById.get(id);
    const target = info ? info.target : null;
    const activate = (scroll = true) => {
      if (mobileQuery.matches) setPaneOpen(false);
      clearActive();
      item.classList.add("is-active");
      if (target) {
        target.classList.add("is-active");
        if (scroll) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.add("is-flash");
          setTimeout(() => target.classList.remove("is-flash"), 1400);
        }
      }
    };
    // head 是原生 <button>，Enter / Space 浏览器会自动派发 click，
    // 再挂一层 keydown 只会让 activate() 跑两次（双份 smooth scroll + 双份 flash 定时器）。
    item.addEventListener("click", () => activate(true));
  }

  // ---- Click on decorated paragraph → activate first card ----
  for (const { target, annos } of decorated) {
    const onTargetActivate = () => {
      if (mobileQuery.matches) setPaneOpen(true);
      clearActive();
      target.classList.add("is-active");
      const firstId = annos[0].id;
      const item = itemNodes.get(firstId);
      if (item) {
        item.classList.add("is-active");
        item.scrollIntoView({ behavior: "smooth", block: "center" });
        item.classList.add("is-flash");
        setTimeout(() => item.classList.remove("is-flash"), 1400);
      }
      target.classList.add("is-flash");
      setTimeout(() => target.classList.remove("is-flash"), 1400);
    };
    target.style.cursor = "pointer";
    // 只有非标题元素才覆盖 role。给 <h2>/<h3> 加 role="button" 会把标题从
    // 无障碍树里抹掉，屏幕阅读器的标题导航（rotor / by heading）会整段丢失，
    // 代价远大于「可点击标题没被播报成按钮」。标题保留原角色 + tabindex。
    if (!/^H[1-6]$/.test(target.tagName)) {
      target.setAttribute("role", "button");
    }
    target.setAttribute("tabindex", "0");
    target.addEventListener("click", onTargetActivate);
    target.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onTargetActivate();
      }
    });
  }

  // ---- Keyboard navigation: ← / →, Esc ----
  const allDecorated = decorated.map((d) => d.target);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearActive();
      if (wrap.classList.contains("is-pane-open")) setPaneOpen(false);
      return;
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    // 监听器挂在 document 上，e.target 有可能是 document 本身（没有焦点元素时
    // 某些浏览器把 keydown 派发到 document），Document 上没有 closest()，
    // 不加这个判断会直接抛 TypeError 并中断整个键盘导航。
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (!wrap.contains(document.activeElement)) return;
    if (!allDecorated.length) return;
    const cur = document.activeElement;
    let idx = allDecorated.findIndex((t) => t === cur || t.contains(cur));
    if (idx === -1) idx = 0;
    let next = idx + (e.key === "ArrowRight" ? 1 : -1);
    if (next < 0) next = allDecorated.length - 1;
    if (next >= allDecorated.length) next = 0;
    e.preventDefault();
    allDecorated[next].focus();
    allDecorated[next].click();
  });

  // ---- IntersectionObserver: track active section as user scrolls ----
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        const tgt = visible[0].target;
        const ids = (tgt.dataset.annotationIds || "").split(/\s+/).filter(Boolean);
        const firstId = ids[0];
        if (!firstId) return;
        wrap.querySelectorAll(".annot-item.is-active").forEach((n) => n.classList.remove("is-active"));
        const card = itemNodes.get(firstId);
        if (card) {
          card.classList.add("is-active");
          // Only scroll the side pane when the card has drifted out of view,
          // to avoid feedback loops during smooth-scroll activation.
          const rect = card.getBoundingClientRect();
          const paneRect = pane.getBoundingClientRect();
          if (rect.top < paneRect.top || rect.bottom > paneRect.bottom) {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );
    for (const { target } of decorated) io.observe(target);
  }

  // ---- Direct ?a=id deep link ----
  const url = new URL(location.href);
  const directId = url.searchParams.get("a");
  if (directId && itemNodes.has(directId)) {
    setTimeout(() => itemNodes.get(directId).click(), 60);
  }

  function clearActive() {
    wrap.querySelectorAll(".is-active").forEach((n) => n.classList.remove("is-active"));
    wrap.querySelectorAll(".is-flash").forEach((n) => n.classList.remove("is-flash"));
  }

  // Expose for tests / external callers
  return { setPaneOpen, clearActive };
}

export default { init };
