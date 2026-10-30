/* ============================================================================
 * src/eleventy-draft.cjs · 草稿抑制的唯一真源
 * ----------------------------------------------------------------------------
 * 它回答一个问题：**一篇内容是不是「作者不想现在发布」的草稿？**
 *
 * ⚠️ 为什么这个文件存在（2026-10-29 21:30 场次实测，不是假想）：
 *   Eleventy **3.x 完全不认识 `draft` 这个字段** ——
 *   实测 `grep -rni draft node_modules/@11ty/eleventy/src/` **零命中**；
 *   上游 `Template.js` 只认 `permalink: false`（注释原文：「`permalink: false`
 *   means render but no file system write, e.g. use in collections only」）。
 *   ⇒ 一篇文章写 `draft: true`，Eleventy 3 **照样发布**：页面写进 `_site/`、
 *   正文进产物、`sitemap.xml` 与 `feed.xml` 各有一条、列表页也有一张卡
 *   （本场次在**真实仓副本**上实测：草稿页被发布、`SECRET-DRAFT-BODY-MARKER`
 *   出现在产物里、sitemap 2 处、feed 2 处、列表页 2 处）。
 *   ⇒ `draft: true` 在本仓是一个**空字段**：作者以为它拦住了发布，它一个字都没做。
 *
 *   上游社区的标准做法是**两件套**（Eleventy 维护者与社区文章一致）：
 *     ① `permalink: false`                —— 不把页面写到磁盘；
 *     ② `eleventyExcludeFromCollections` —— 不让它进任何集合
 *                                        （⇒ 于是 sitemap / feed / 列表页都看不到它）。
 *   ⚠️ **两件套缺一不可**（本场次逐个探针实测）：
 *     · 只做 ①：模板**仍留在集合里**（`url: false`）⇒ feed 的 `feedItems`
 *       会拿它当一条 item（`path` 为空）⇒ **feed 里出现一条指向站点根的坏条目**，
 *       列表页也会渲染出这张卡（`post.url` 为假）—— 半拉子的抑制。
 *     · 只做 ②：页面**照样写进 `_site/`**（能被猜到 URL 直接访问）—— 抑制不彻底。
 *     · 两件都做：产物里**彻底没有它**（页面不写、集合里没有、sitemap/feed/列表页都没有）。
 *     ⇒ 本模块提供的是「判断」，两个动作由**调用方**分别接上（见下方 `draftGuards`）。
 *
 * ⚠️ **诚实边界（必须写清楚，否则就是在给人假安全感）**：
 *   本模块与它的接线只管住**产物面**（`_site/` 与它派生出的 sitemap / feed / 列表页）。
 *   **源码面管不住**：本站的**发布仓就是源码仓**，而它是 **PUBLIC**
 *   （`gh repo view oldsixxiaolv/oldsixxiaolv.github.io` → `visibility: PUBLIC`）
 *   ⇒ 一篇草稿的**正文在 GitHub 上人人可读**（`src/content/blog/<slug>/index.md`）。
 *   ⇒ **产物面抑制 ≠ 保密**。真要保密，草稿就不能放进这个仓
 *   （这属于取舍，已登记为待拍板 67，本轮**不代拍**）。
 *
 * 判定口径：`draft` 为**真值**即算草稿。
 *   · YAML `draft: true`  → 布尔 true ⇒ 草稿。
 *   · YAML `draft: "true"`（带引号）→ 字符串 ⇒ 也算草稿（作者写字符串时
 *     想的还是草稿；本仓的口径是「凡是表达了「先别发」的，一律当草稿」）。
 *   · YAML `draft: false` → 布尔 false ⇒ **不是**草稿（显式声明要发布）。
 *   · `draft` 缺席 ⇒ 不是草稿。
 *   ⚠️ 这条口径与 Eleventy 上游**无关**（上游压根没有这个字段），
 *      是**本仓自己的约定**；改口径要显式改这里并在改进日志里记一笔。
 * ========================================================================== */

/**
 * 这份数据是不是一篇草稿。
 *
 * @param {object} data 模板的数据级（front matter + 数据文件 + 全局数据合并后的结果）
 * @returns {boolean} true = 草稿（应当不发布）
 */
function isDraft(data) {
  if (!data || typeof data !== "object") return false;
  const v = data.draft;
  if (v === undefined || v === null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    // 空串与 "false" 是「显式说不算草稿」；其余字符串都当草稿。
    return s !== "" && s !== "false" && s !== "no" && s !== "off";
  }
  // 数字 / 数组 / 对象：作者写了 `draft:` 这个键就是想表达「先别发」⇒ 算草稿。
  return true;
}

/**
 * 草稿该接的**两件套**，各自返回 Eleventy 认得的值。
 *
 * 用法（目录数据文件 `*.11tydata.cjs` 里）：
 *   module.exports = {
 *     permalink: (data) => draftGuards.permalink(`/blog/${getSlugFromData(data)}/`, data),
 *     eleventyComputed: {
 *       eleventyExcludeFromCollections: (data) => draftGuards.excludeFromCollections(data),
 *       ...
 *     },
 *   };
 *
 * ⚠️ 为什么把两件套**放在一处**而不是让每个调用方各写各的：
 *   只接一件 ⇒ 半拉子抑制（详见文件头「两件套缺一不可」那段实测）。
 *   ⇒ 这两件事必须**成对出现**，放在一起才不会被漏掉其中一件。
 */
const draftGuards = {
  /**
   * permalink 侧：草稿 ⇒ 返回 false（Eleventy 3 的「渲染但不写盘」语义）。
   * 非草稿 ⇒ 原样返回调用方给的正常路径。
   *
   * ⚠️ **参数顺序是「路径在前」**，不是「数据在前」—— 这不是风格问题：
   *   信息架构门禁（scripts/check-information-architecture.cjs 的 IAC1 / IAC13）
   *   用**正则**从数据文件里提取 permalink 的家族前缀（`/blog/`），
   *   那条正则要求模板串**后面紧跟** `,` 或 `}`（前瞻 `(?=[,}\s])`）。
   *   若写成 `draftGuards.permalink(data, \`/blog/.../\`)`，
   *   模板串后面跟的是 `)` ⇒ 前瞻失败 ⇒ 前缀提不出来 ⇒
   *   「已实现集合家族」整个变空 ⇒ IAC 把**所有**路径都判成「既没实现、
   *   也没被承认没实现」⇒ 一片假红（本轮实测踩到）。
   *   ⇒ 把路径放在第一个参数，调用点就写成
   *     `draftGuards.permalink(\`/blog/...\`, data),`
   *   模板串后面紧跟 `,` ⇒ 两条口径同时满足。
   */
  permalink(normalPath, data) {
    return isDraft(data) ? false : normalPath;
  },

  /**
   * 集合侧：草稿 ⇒ 返回 true（`eleventyExcludeFromCollections: true`
   * ⇒ 它不进任何集合 ⇒ sitemap / feed / 列表页都看不到它）。
   * 非草稿 ⇒ 返回 false（**不是** undefined —— 显式 false 与「没写」等价，
   * 但写成 false 能让「这处接线存在」这件事在源码上一眼可见）。
   */
  excludeFromCollections(data) {
    return isDraft(data) ? true : false;
  },
};

module.exports = { isDraft, draftGuards };
