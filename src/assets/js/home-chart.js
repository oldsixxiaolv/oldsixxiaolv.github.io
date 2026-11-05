/* home-chart.js · interactive year readout for the homepage precipitation chart
 * ---------------------------------------------------------------------------
 * What it adds (ROADMAP M2, item 3 — "make the homepage data chart interactive"):
 *   · a vertical time cursor that snaps to the nearest year
 *   · a dot on the data line at that year
 *   · a readout line under the plot: year, annual value, decade mean
 *   · full keyboard operation (left/right arrows, Home/End, Escape)
 *
 * Why the geometry arrives from the renderer instead of being recomputed here:
 *   The SVG carries a data-chart attribute written by scripts/lib/chart-svg.cjs.
 *   It holds the viewBox size, the plot rectangle, the value → pixel scale, the
 *   years, the values and the decadal means. Recomputing any of that in the
 *   browser would mean keeping a second copy of the geometry, and the two
 *   copies would drift apart. Here the readout and the drawn line are guaranteed
 *   to talk about the same numbers.
 *
 * Why the cursor and the dot are HTML elements rather than SVG nodes:
 *   The SVG in this repo carries no class names and no colours (see the header
 *   of scripts/lib/chart-svg.cjs) — the stroke colour comes from the surrounding
 *   custom property --chart-stroke, which differs per panel. As HTML children of
 *   the canvas they inherit that variable for free, and they can be positioned
 *   with plain percentages of the canvas box.
 *
 * Motion: cursor and dot coordinates snap 1:1 with pointer scrubbing and
 *   keyboard arrow navigation (no layout-triggering left/top/height transition);
 *   only the dot's composite-only transform scale is transitioned inside a
 *   prefers-reduced-motion: no-preference CSS block.
 *
 * Public API:
 *   initHomeChart(root) — 唯一入口。root 默认 document；
 *   返回初始化了几个面板（0 表示这张图不在页面上）。
 * ------------------------------------------------------------------------- */

const PANEL_SELECTOR = "[data-chart-panel]";

/** 读出 SVG 上的机器可读数据；读不到就返回 null（宁可没有交互，也不要错的交互） */
function parseChart(svg) {
  const raw = svg.getAttribute("data-chart");
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_) {
    return null;
  }
  if (!data || !Array.isArray(data.values) || !data.values.length) return null;
  if (!Array.isArray(data.years) || data.years.length !== data.values.length) return null;
  if (!data.plot || !data.scale || !data.viewW || !data.viewH) return null;
  return data;
}

/** 第 i 个年份在 viewBox 里的 x 坐标 */
function xForIndex(data, i) {
  const n = data.values.length;
  const t = n > 1 ? i / (n - 1) : 0;
  return data.plot.l + t * (data.plot.r - data.plot.l);
}

/** 数值在 viewBox 里的 y 坐标（与渲染器用同一个 scale） */
function yForValue(data, value) {
  const span = data.scale.hi - data.scale.lo;
  if (!span) return data.plot.b;
  const t = (value - data.scale.lo) / span;
  return data.plot.b - t * (data.plot.b - data.plot.t);
}

/** 某个年份落在哪个十年均值里（最后一段是 2020-2025，只有六年） */
function decadeFor(data, year) {
  const decades = Array.isArray(data.decades) ? data.decades : [];
  let found = null;
  for (const d of decades) {
    if (year >= d.start && year < d.start + d.nYears) found = d;
  }
  return found;
}

/** viewBox 坐标 → 画布百分比 */
function pct(units, viewUnits) {
  return `${(units / viewUnits) * 100}%`;
}

function initPanel(panel) {
  const canvas = panel.querySelector("[data-chart-canvas]");
  const svg = canvas && canvas.querySelector("svg");
  const cursor = panel.querySelector("[data-chart-cursor]");
  const dot = panel.querySelector("[data-chart-dot]");
  const main = panel.querySelector("[data-chart-readout-main]");
  const mean = panel.querySelector("[data-chart-readout-mean]");
  if (!canvas || !svg || !cursor || !dot || !main || !mean) return false;

  const data = parseChart(svg);
  if (!data) return false;

  // 提示语只有一处：模板里那句初始文案。恢复时用读回来的原文，不另抄一份。
  const hint = main.textContent.trim();
  const last = data.values.length - 1;
  let peakIdx = 0;
  for (let i = 1; i <= last; i += 1) {
    if (data.values[i] > data.values[peakIdx]) peakIdx = i;
  }
  let index = -1;

  function show(i) {
    if (i < 0 || i > last) return;
    index = i;
    const year = data.years[i];
    const value = data.values[i];
    const x = xForIndex(data, i);
    const y = yForValue(data, value);

    cursor.hidden = false;
    cursor.style.left = pct(x, data.viewW);
    cursor.style.top = pct(data.plot.t, data.viewH);
    cursor.style.height = pct(data.plot.b - data.plot.t, data.viewH);

    dot.hidden = false;
    dot.style.left = pct(x, data.viewW);
    dot.style.top = pct(y, data.viewH);

    main.textContent = `${year} — ${value.toFixed(2)} ${data.unit}`;
    const decade = decadeFor(data, year);
    mean.textContent = decade
      ? `${decade.label} mean ${decade.value.toFixed(2)} ${data.unit}`
      : "";
  }

  function clear() {
    index = -1;
    cursor.hidden = true;
    dot.hidden = true;
    main.textContent = hint;
    mean.textContent = "";
  }

  /** 鼠标/触点 → 最近的年份下标 */
  function indexAt(clientX) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return -1;
    const viewX = ((clientX - rect.left) / rect.width) * data.viewW;
    const t = (viewX - data.plot.l) / (data.plot.r - data.plot.l);
    const i = Math.round(t * last);
    return Math.max(0, Math.min(last, i));
  }

  canvas.addEventListener("pointermove", (event) => {
    const i = indexAt(event.clientX);
    if (i >= 0) show(i);
  });

  // 触屏没有 hover：点一下也要能读数
  canvas.addEventListener("click", (event) => {
    const i = indexAt(event.clientX);
    if (i >= 0) show(i);
  });

  canvas.addEventListener("pointerleave", () => show(peakIdx));

  canvas.addEventListener("keydown", (event) => {
    let next;
    switch (event.key) {
      case "ArrowLeft":
        next = (index < 0 ? 0 : index) - 1;
        break;
      case "ArrowRight":
        next = (index < 0 ? 0 : index) + 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Escape":
        clear();
        event.preventDefault();
        return;
      default:
        return;
    }
    event.preventDefault();
    show(Math.max(0, Math.min(last, next)));
  });

  canvas.addEventListener("blur", () => show(peakIdx));

  // 默认高亮历史极值年份（2021），首屏滚入即呈现完整游标与读数状态
  show(peakIdx);

  return true;
}

export function initHomeChart(root) {
  const scope = root || document;
  const panels = scope.querySelectorAll(PANEL_SELECTOR);
  let ready = 0;
  panels.forEach((panel) => {
    if (initPanel(panel)) ready += 1;
  });
  return ready;
}
