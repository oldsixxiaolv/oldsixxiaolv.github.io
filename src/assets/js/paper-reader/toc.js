/* paper-reader/toc.js
 * ---------------------------------------------------------------------------
 * Table of Contents — auto-built from the paper's h2/h3 headings.
 * Sticky sidebar; current section highlighted via IntersectionObserver.
 * Independent of annotations.
 *
 * Phase 2B.6: lifted from paper-reader.js as a stand-alone module. Auto-creates
 * a host `<aside class="paper-toc">` inside `.paper-reader-wrap` if the
 * template didn't render one explicitly.
 * ------------------------------------------------------------------------- */

const HEADING_SELECTOR = "h2[id], h3[id]";

export function init(ctx) {
  const paperRoot = ctx.paperRoot;
  if (!paperRoot) return;

  // 1. locate the 3-col wrapper: paperRoot's direct parent should be the wrap.
  //    Defensive: if not, walk up looking for one, or create one around the article.
  let wrap = paperRoot.parentElement;
  if (!wrap || !wrap.classList.contains("paper-reader-wrap")) {
    wrap = paperRoot.closest(".paper-reader-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "paper-reader-wrap";
      paperRoot.parentNode.insertBefore(wrap, paperRoot);
      wrap.appendChild(paperRoot);
    }
  }
  let host = paperRoot.querySelector(".paper-toc, [data-toc-host]");

  // If no explicit TOC slot exists, auto-create one before the paper article.
  if (!host && wrap) {
    host = document.createElement("aside");
    host.className = "paper-toc";
    host.setAttribute("aria-label", "Contents");
    host.dataset.tocHost = "";
    wrap.insertBefore(host, paperRoot);
  }
  if (!host) return;

  const headings = [...paperRoot.querySelectorAll(HEADING_SELECTOR)].filter((h) => h.id);
  if (!headings.length) {
    host.remove();
    return;
  }

  // Build nav tree.
  // Use <p> for the TOC label — avoid competing with article <h1> in heading order.
  // aria-label on the <aside> already conveys the TOC's role to assistive tech.
  const title = document.createElement("p");
  title.className = "paper-toc__title";
  title.textContent = "Contents";
  host.appendChild(title);

  const list = document.createElement("ol");
  list.className = "paper-toc__list";
  for (const h of headings) {
    const li = document.createElement("li");
    li.className = `paper-toc__item paper-toc__item--${h.tagName.toLowerCase()}`;
    const a = document.createElement("a");
    a.className = "paper-toc__link";
    a.href = `#${h.id}`;
    a.textContent = h.textContent.trim();
    a.dataset.targetId = h.id;
    li.appendChild(a);
    list.appendChild(li);
  }
  host.appendChild(list);

  // Track current section in viewport.
  const links = [...list.querySelectorAll(".paper-toc__link")];
  const byId = new Map(headings.map((h) => [h.id, h]));
  const setActive = (id) => {
    links.forEach((a) => {
      const active = a.dataset.targetId === id;
      a.classList.toggle("is-active", active);
      if (active) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: 0 }
    );
    headings.forEach((h) => io.observe(h));
  }

  // Smooth scroll into view on click.
  host.addEventListener("click", (e) => {
    const a = e.target.closest(".paper-toc__link");
    if (!a) return;
    const target = byId.get(a.dataset.targetId);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(a.dataset.targetId);
    history.replaceState(null, "", a.getAttribute("href"));
  });

  // Initialize with first heading.
  if (headings[0]) setActive(headings[0].id);
}

export default { init };
