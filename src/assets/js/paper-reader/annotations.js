/* paper-reader/annotations.js
 * ---------------------------------------------------------------------------
 * Annotations subsystem — fetch annotations.json, build the side pane,
 * decorate annotated paragraphs / headings in the DOM, set up the filter UI.
 *
 * Returns a context object so highlight.js can attach behavior without
 * re-fetching or re-rendering anything.
 *
 * Phase 2B.6: lifted from paper-reader.js §2–5, §9. Hover/keyboard handlers
 * live in highlight.js; this module owns DOM structure + data only.
 * ------------------------------------------------------------------------- */

import { externalLinkAttrs } from "./url-safety.js";

const KIND_LABELS = {
  question: "Question",
  insight:  "Insight",
  critique: "Critique",
  link:     "Link",
  figure:   "Figure",
  typo:     "Correction",
};

const KIND_ICONS = {
  question: "M9 9a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM9 13h.01M9 17h.01",
  insight:  "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z",
  critique: "M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
  link:     "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  figure:   "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  typo:     "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
};

// ---- DOM helpers (shared) ----
/**
 * 建元素。
 *
 * ⚠ **不提供**「把字符串当 HTML 解析」的入口：以前这里有个 `html:` 分支
 * （走 innerHTML），全仓**零处使用**（实测 `grep -rn "html:" src/` = 0），
 * 却是个现成的注入原语 —— 数据一旦流进去就是脚本执行。
 * ⇒ 已删除；站内文本一律走 `createTextNode` / `textContent`，
 *    这条线由门禁守着（scripts/check-url-safety.cjs 的「字符串不当 HTML 解析」那条）。
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "aria" && typeof v === "object") for (const [ak, av] of Object.entries(v)) node.setAttribute(`aria-${ak}`, av);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function svgIcon(name) {
  const path = KIND_ICONS[name] || KIND_ICONS.question;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", path);
  svg.appendChild(p);
  return svg;
}

function resolveAnchor(anchor, paperRoot) {
  if (!anchor || !anchor.value) return null;
  if (anchor.type === "paragraph" || anchor.type === "selector") {
    const sel = anchor.type === "paragraph" ? `#${anchor.value}` : anchor.value;
    return paperRoot.querySelector(sel);
  }
  if (anchor.type === "text") {
    const needle = anchor.value;
    const occ = anchor.occurrence || 1;
    const walker = document.createTreeWalker(paperRoot, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || !node.nodeValue.includes(needle)) continue;
      count++;
      if (count === occ) {
        let block = node.parentElement;
        while (block && block !== paperRoot && !/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(block.tagName)) {
          block = block.parentElement;
        }
        return block || paperRoot;
      }
    }
  }
  if (anchor.type === "section") {
    const headings = paperRoot.querySelectorAll("h2, h3");
    for (const h of headings) {
      if (h.textContent && h.textContent.includes(anchor.value)) return h;
    }
  }
  return null;
}

function getAllAnchorTargets(paperRoot) {
  const sel = "p[id], h2[id], h3[id], li[id], blockquote[id], pre[id]";
  return Array.from(paperRoot.querySelectorAll(sel));
}

function indexAnnotationsByAnchor(annotations) {
  const map = new Map();
  for (const a of annotations) {
    if (!a.anchor || !a.anchor.value) continue;
    const list = map.get(a.anchor.value) || [];
    list.push(a);
    map.set(a.anchor.value, list);
  }
  return map;
}

function makeAnnotationId(id) {
  return `ann-${id}`;
}

// ---- Public API ----
export async function init(ctx) {
  const { paperRoot, annotationsUrl, paneTitle = "Annotations" } = ctx;
  if (!paperRoot || !annotationsUrl) {
    return { annoMap: new Map(), itemNodes: new Map(), pane: null };
  }
  paperRoot.classList.add("paper-reader");
  let wrap = paperRoot.parentElement;
  if (!wrap || !wrap.classList.contains("paper-reader-wrap")) {
    // defensive: walk up to find existing wrap, else create one around the article
    wrap = paperRoot.closest(".paper-reader-wrap");
    if (!wrap) {
      wrap = el("div", { class: "paper-reader-wrap" });
      paperRoot.parentNode.insertBefore(wrap, paperRoot);
      wrap.appendChild(paperRoot);
    }
  }

  const res = await fetch(annotationsUrl, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Failed to load ${annotationsUrl}: ${res.status}`);
  const data = await res.json();
  const annotations = Array.isArray(data.annotations) ? data.annotations : [];

  // Build maps
  const annoByTarget = new Map();
  const annoById = new Map();
  const decorated = [];
  for (const a of annotations) {
    const target = resolveAnchor(a.anchor, paperRoot);
    if (!target) {
      // eslint-disable-next-line no-console
      console.warn(`[annotations] ${a.id}: anchor "${a.anchor?.value}" not found`);
      continue;
    }
    annoByTarget.set(target, (annoByTarget.get(target) || []).concat(a));
    annoById.set(a.id, { anno: a, target });
  }

  // Decorate DOM targets
  for (const [target, annos] of annoByTarget.entries()) {
    const primary = annos[0];
    target.classList.add("paper-anchor", `paper-anchor--${primary.kind}`);
    target.dataset.annotationIds = annos.map((a) => a.id).join(" ");
    const badge = el("span", {
      class: "paper-anchor__count",
      aria: { label: `${annos.length} annotations` },
    }, String(annos.length));
    target.appendChild(badge);
    decorated.push({ target, annos, primary });
  }

  // Order annotations by DOM appearance
  const allTargets = getAllAnchorTargets(paperRoot);
  const orderedAnnos = [];
  const seen = new Set();
  for (const t of allTargets) {
    const list = annoByTarget.get(t);
    if (!list) continue;
    for (const a of list) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      orderedAnnos.push(a);
    }
  }
  for (const a of annotations) {
    if (!seen.has(a.id)) orderedAnnos.push(a);
  }

  // Render right pane
  const pane = el("aside", {
    class: "annot-pane",
    aria: { label: `${paneTitle} (${orderedAnnos.length})` },
  });
  const head = el("header", { class: "annot-pane__head" },
    el("h2", {}, `${paneTitle} `,
      el("span", { class: "badge annot-pane__count" }, String(orderedAnnos.length))
    ),
    el("input", {
      type: "search",
      placeholder: "Filter by title / body / tag…",
      aria: { label: "Filter annotations" },
      class: "annot-pane__filter",
    })
  );
  const kinds = [...new Set(orderedAnnos.map((a) => a.kind).filter(Boolean))];
  const filterBar = el("div", { class: "annot-filters", role: "group", aria: { label: "Filter annotations by type" } },
    el("button", { class: "annot-filter is-active", type: "button", dataset: { kind: "all" }, aria: { pressed: "true" } }, "All"),
    ...kinds.map((kind) => el("button", { class: `annot-filter annot-filter--${kind}`, type: "button", dataset: { kind }, aria: { pressed: "false" } }, KIND_LABELS[kind] || kind))
  );
  head.appendChild(filterBar);
  const list = el("ol", { class: "annot-list" });

  const itemNodes = new Map();
  for (const a of orderedAnnos) {
    const info = annoById.get(a.id);
    const target = info ? info.target : null;

    // ---- semantic structure (a11y-clean) ----
    // <li>  (pure list item)
    //   <article class="annot-card">  (no role override, not interactive)
    //     <button class="annot-card__head">  (the toggle, click target)
    //       meta + h3
    //     </button>
    //     <div class="annot-card__body">  (expandable content)
    //       body + tags + links  ← links live here, not inside the button
    //     </div>
    //   </article>
    // </li>
    const li = el("li", { class: "annot-item-wrap" });
    const cardId = makeAnnotationId(a.id) + "-card";
    const bodyId = makeAnnotationId(a.id) + "-body";
    const card = el("article", {
      class: `annot-card annot-card--${a.kind}`,
      dataset: { annotationId: a.id, kind: a.kind },
      id: cardId,
    });
    // annot-item 是给 CSS 的契约类：paper-reader.css 的 .annot-item.is-active /
    // .annot-item.is-flash / 入场动画、a11y.css 的 forced-colors 边框，以及
    // highlight.js 清除上一个 active 卡的 querySelectorAll 都靠它。
    // 只给 annot-card__head 的话这些规则全部选不中，active 高亮会完全失效。
    const head = el("button", {
      type: "button",
      class: "annot-item annot-card__head",
      dataset: { annotationId: a.id },
      aria: {
        expanded: "false",
        controls: bodyId,
        describedby: target ? makeAnnotationId(a.id) : null,
        label: `${KIND_LABELS[a.kind] || a.kind}: ${a.title}`,
      },
    });
    const meta = el("span", { class: "annot-meta" },
      el("span", { class: `annot-kind annot-kind--${a.kind}` },
        svgIcon(a.kind), ` ${KIND_LABELS[a.kind] || a.kind}`
      ),
      a.createdAt ? el("time", { datetime: a.createdAt }, a.createdAt) : null
    );
    // <button> 的内容模型只允许 phrasing content，<h3> 属于 flow content，
    // 塞进去是无效 HTML，而且可访问名已经被上面的 aria-label 覆盖，
    // 标题层级对它没有价值。用 <span> + .annot-title（display:block）保持排版。
    const title = el("span", { class: "annot-title" }, a.title || "");
    head.append(meta, title);

    const bodyContent = el("div", { class: "annot-card__body", id: bodyId });
    if (a.body) bodyContent.appendChild(el("p", { class: "annot-body" }, a.body));
    if (a.tags && a.tags.length) {
      bodyContent.appendChild(
        el("ul", { class: "annot-tags" },
          ...a.tags.map((t) => el("li", { class: "annot-tag" }, `#${t}`)))
      );
    }
    if (a.links && a.links.length) {
      bodyContent.appendChild(
        el("ul", { class: "annot-links" },
          ...a.links.map((l) => {
            /* 外链 URL 走**协议白名单**（src/assets/js/paper-reader/url-safety.js）：
               只放行 http/https。脚本协议与 data: 一律**不渲染成可点链接** ——
               一条脚本协议的链接在被点击时就会执行。
               ⚠ href **只能**由白名单模块产出（externalLinkAttrs）——
                  门禁（check-url-safety.cjs 的「渲染层必须绑在白名单上」那条）
                  正是靠「paper-reader 里除白名单模块外不得出现 href」守着这条线。 */
            const attrs = externalLinkAttrs(l.url);
            if (!attrs) {
              /* 降级成纯文本：**不画箭头**（箭头会让人以为它能点），
                 并用 title 说明为什么不可点。 */
              return el(
                "li",
                {},
                el(
                  "span",
                  {
                    class: "annot-link--unsafe",
                    title: "This link's scheme is not on the allow list, so it is not clickable",
                  },
                  l.label
                )
              );
            }
            return el("li", {}, el("a", attrs, `${l.label} →`));
          })
        )
      );
    }

    card.append(head, bodyContent);
    // aria-expanded: head button controls body; true = body shown (always, no collapse UI).
    head.setAttribute("aria-expanded", "true");
    li.appendChild(card);
    if (target) target.setAttribute("aria-describedby", cardId);

    list.appendChild(li);
    // backwards-compat: keep `itemNodes` mapping for existing click handlers,
    // pointing at the head button (the new click target).
    itemNodes.set(a.id, head);
  }

  pane.append(head, list);
  wrap.appendChild(pane);
  pane.id = "paper-annotations";

  // Filter wiring — hides the <li> wrapper so the whole card disappears.
  const filterInput = pane.querySelector(".annot-pane__filter");
  const activeKinds = new Set();
  const liByItem = new Map();  // map head -> li
  for (const [id, item] of itemNodes.entries()) {
    liByItem.set(item, item.closest("li.annot-item-wrap"));
  }
  const applyFilter = () => {
    const q = (filterInput?.value || "").trim().toLowerCase();
    let shown = 0;
    for (const [id, item] of itemNodes.entries()) {
      const a = annoById.get(id)?.anno;
      if (!a) continue;
      const hay = `${a.title || ""} ${a.body || ""} ${(a.tags || []).join(" ")}`.toLowerCase();
      const matchesText = !q || hay.includes(q);
      const matchesKind = !activeKinds.size || activeKinds.has(a.kind);
      const li = liByItem.get(item);
      if (li) li.hidden = !(matchesText && matchesKind);
      if (!li || !li.hidden) shown++;
    }
    pane.querySelector(".annot-pane__count").textContent =
      (q || activeKinds.size) ? `${shown} / ${orderedAnnos.length}` : String(orderedAnnos.length);
  };
  filterInput?.addEventListener("input", applyFilter);
  filterBar.querySelectorAll(".annot-filter").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.kind;
      if (kind === "all") activeKinds.clear();
      else if (activeKinds.has(kind)) activeKinds.delete(kind);
      else activeKinds.add(kind);
      filterBar.querySelectorAll(".annot-filter").forEach((b) => {
        const active = b.dataset.kind === "all" ? !activeKinds.size : activeKinds.has(b.dataset.kind);
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", String(active));
      });
      applyFilter();
    });
  });

  // Expose data for highlight.js
  return {
    pane,
    itemNodes,
    annoByTarget,
    annoById,
    decorated,
    wrap,
    applyFilter,
  };
}

// Re-export helpers for highlight.js
export const helpers = {
  makeAnnotationId,
  KIND_LABELS,
};

export default { init, helpers };
