/* ============================================================================
 * 首页极端降水图 —— 手写 inline SVG 渲染器（构建期生成，页面零 JS）
 * ----------------------------------------------------------------------------
 * 为什么自己写，而不是引图表库：
 *   本仓的硬约束是「整个文件夹扔到哪都能跑」——不引外部服务、不装运行时依赖。
 *   图表库要么是 npm 包（要 node_modules），要么是 CDN 上的 JS（要联网）。
 *   两条都破坏这条约束。这里的 SVG 是**构建期**用 Node 算出来的，
 *   产物里是纯 <svg> 标签，页面上一行 JS 都没有。
 *
 * 为什么数据与图必须同源（这条比"好看"重要）：
 *   数值只存在 src/_data/extremePrecip.json 一处，这张图从那份 JSON 画出来。
 *   于是「图和数对不上」在结构上就不可能发生，不需要再设一道门禁去对账。
 *
 * 口径（与图注里写的是同一套话，改一处必须改两处）：
 *   · 湿日 wet day  = 日降水 ≥ 1 mm
 *   · 阈值 threshold = 每格点 1960-2025 **自身**湿日降水量的 95 百分位
 *   · R95p  = 该年超过阈值那几天的降水之和（区域面积加权平均）
 *   · Rx1day= 各格点年最大 1 日降水的区域平均值
 *   · 面积权重 = cos(纬度)；只统计框内的**陆地**格点（数据集自带陆海掩膜）
 *
 * ⚠️ 样式约定（踩过一次就别再踩）：
 *   SVG 内部**不写任何 class**。原因：scripts/check-dead-css.cjs 判"死 CSS"时，
 *   只在 src/ 下的模板/数据/脚本里找类名落点；**渲染器输出里的类名它看不见**，
 *   于是"只出现在渲染器里的类"会被误判成死类并判红。
 *   → SVG 内部只用元素选择器（line / polyline / path / circle / text），
 *     颜色由外层面板的 CSS 变量 --chart-stroke 决定，SVG 自己不写颜色。
 * ========================================================================== */

/* 画布与绘图区（viewBox 单位）。
   ⚠️ 字号为什么定成 11：SVG 里的字号跟着 viewBox 一起缩放，而这个图在
   桌面（约 392px 宽）与手机（约 319px 宽）两处的缩放系数不同 ——
   11 × 392/360 ≈ 12px（桌面）、11 × 319/360 ≈ 9.7px（手机），
   两头都还在可读范围。若把 viewBox 再放大，手机端会掉到 8px 以下。
   改 viewBox 宽度时，这三个数要一起重算。 */
const VIEW = { w: 360, h: 236 };
const PLOT = { left: 46, right: 350, top: 24, bottom: 200 };

/** XML 转义：图注/标题虽然是我们自己写的，仍然过一遍 */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 取一个"好看的"刻度步长：1 / 2 / 5 × 10^k */
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** 由数据算出 y 轴范围与刻度（上下各留 8% 余量） */
function scaleY(values, tickCount = 4) {
  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const pad = (max - min) * 0.08 || 1;
  const step = niceStep((max - min + 2 * pad) / tickCount);
  const lo = Math.floor((min - pad) / step) * step;
  const hi = Math.ceil((max + pad) / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)));
  return { lo, hi, step, ticks };
}

/** 刻度标签：步长 < 1 时保留小数，否则取整 */
function fmtTick(v, step) {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return String(Number(v.toFixed(d)));
}

/** 无障碍描述：直接从数据生成，读者（和屏幕阅读器）拿到的是同一批数 */
function describe(panel, years) {
  const vals = panel.values;
  const min = Math.min.apply(null, vals);
  const max = Math.max.apply(null, vals);
  const minY = years[vals.indexOf(min)];
  const maxY = years[vals.indexOf(max)];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const bits = [
    `Annual values ${years[0]} to ${years[years.length - 1]}.`,
    `Lowest ${fmtTick(min, 0.01)} ${panel.unit} in ${minY}, highest ${fmtTick(max, 0.01)} ${panel.unit} in ${maxY}, mean ${fmtTick(mean, 0.01)} ${panel.unit}.`,
  ];
  if (panel.trend) {
    bits.push(
      `Least-squares trend ${panel.trend.perDecade} ${panel.unit} per decade, ` +
        `Mann-Kendall p = ${panel.trend.mkP}.`
    );
  }
  return bits.join(" ");
}

/**
 * 画一个面板。
 * @param {object} data  整份 extremePrecip 数据（要拿 years）
 * @param {object} panel 面板定义
 * @returns {string} <svg> 字符串
 */
function renderChartPanel(data, panel) {
  const years = data.years;
  const vals = panel.values;
  if (!Array.isArray(vals) || vals.length !== years.length) {
    throw new Error("chart-svg: 面板数值长度与年份数不一致");
  }
  const y0 = years[0];
  const y1 = years[years.length - 1];
  const x = (yr) => PLOT.left + ((yr - y0) / (y1 - y0)) * (PLOT.right - PLOT.left);

  const decadalVals = panel.decadal.map((d) => d.value);
  const sc = scaleY(vals.concat(decadalVals));
  const y = (v) => PLOT.bottom - ((v - sc.lo) / (sc.hi - sc.lo)) * (PLOT.bottom - PLOT.top);

  const id = `chart-${panel.key}`;
  const out = [];

  /* 交互层需要的机器可读数据（2026-10-20 补 · 对应 ROADMAP M2 第 3 项）
   *
   * 为什么挂成一个 data-chart JSON，而不是让 JS 去猜：
   *   · 绘图区在 viewBox 里的几何（plot）与数值→像素的映射（scale）**只有这里知道**
   *     ——让前端重算一遍，就等于让它维护第二份几何，两份迟早对不上。
   *   · 于是这份 JSON 与画出来的线**同源**：都是 panel.values / panel.decadal /
   *     sc 三样东西算出来的，不存在"图是 A、数是 B"的可能。
   *   · 键值是 data-*，不是 class ⇒ scripts/check-dead-css.cjs 看不见它、
   *     不会把它误判成死类（那个门禁只认类名）。
   *   · SVG 内部仍然不写任何 class、也不写颜色（见文件头）——
   *     游标与数据点由 JS 摆成 HTML 元素，颜色走外层 --chart-stroke。
   */
  const chartData = {
    y0,
    y1,
    years,
    viewW: VIEW.w,
    viewH: VIEW.h,
    plot: { l: PLOT.left, r: PLOT.right, t: PLOT.top, b: PLOT.bottom },
    scale: { lo: sc.lo, hi: sc.hi },
    unit: panel.unit,
    values: vals,
    decades: panel.decadal.map((d) => ({
      label: d.label,
      start: d.start,
      nYears: d.nYears,
      value: d.value,
    })),
  };

  out.push(
    `<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="100%" ` +
      `role="img" aria-labelledby="${id}-title" aria-describedby="${id}-desc" ` +
      `data-chart="${esc(JSON.stringify(chartData))}">`
  );
  out.push(`<desc id="${id}-desc">${esc(describe(panel, years))}</desc>`);

  // 网格线 + y 轴刻度
  for (const t of sc.ticks) {
    const yy = y(t).toFixed(1);
    out.push(`<line x1="${PLOT.left}" y1="${yy}" x2="${PLOT.right}" y2="${yy}" />`);
    out.push(
      `<text x="${PLOT.left - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle">${fmtTick(t, sc.step)}</text>`
    );
  }

  // 坐标轴
  out.push(`<line x1="${PLOT.left}" y1="${PLOT.top}" x2="${PLOT.left}" y2="${PLOT.bottom}" />`);
  out.push(`<line x1="${PLOT.left}" y1="${PLOT.bottom}" x2="${PLOT.right}" y2="${PLOT.bottom}" />`);

  // x 轴刻度：每 10 年一个，最后一年不标（贴边会顶出去）
  for (let yr = Math.ceil(y0 / 10) * 10; yr <= y1; yr += 10) {
    out.push(
      `<text x="${x(yr).toFixed(1)}" y="${PLOT.bottom + 16}" text-anchor="middle">${yr}</text>`
    );
  }

  // y 轴含义
  out.push(`<text x="2" y="13">${esc(panel.axis)}</text>`);

  // 逐年序列（细线）
  const pts = vals.map((v, i) => `${x(years[i]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  out.push(`<polyline points="${pts}" />`);

  // 十年平均（粗线 + 点）；点画在那一段的**中点**上
  const dpts = panel.decadal.map((d) => {
    const mid = d.start + (d.nYears - 1) / 2;
    return [x(mid), y(d.value)];
  });
  out.push(
    `<path d="M${dpts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L")}" />`
  );
  for (const p of dpts) {
    out.push(`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" />`);
  }

  out.push("</svg>");
  return out.join("");
}

module.exports = { renderChartPanel };
