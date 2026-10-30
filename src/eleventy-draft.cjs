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

/**
 * 这个**内容目录**是不是一篇草稿？
 *
 * ⚠️ 为什么需要它（2026-10-29 21:30 场次实测坐实，不是假想）：
 *   两处**按文件复制**的逻辑（不是 Eleventy 的模板渲染路径）**看不见**上面两件套：
 *     ① `eleventyConfig.addPassthroughCopy(...)` 复制论文的 annotations.json
 *        —— glob 复制，**不问**这篇论文是不是草稿；
 *     ② `copyCovers()`（eleventy.config.js 里的 eleventy.after 钩子）
 *        —— 对每个内容目录无条件复制 `cover.{svg,png,jpg,jpeg,webp}`。
 *   实测：给一篇**草稿**论文放上 annotations.json 与 cover.png ⇒
 *   **两个文件都进了 `_site/`**（实测：`_site/content/papers/<slug>/annotations.json`
 *   与 `_site/papers/<slug>/cover.png` 都在，且内容里的标记串能 grep 到）
 *   ⇒ 批注（作者对自己论文的批注，可能含未发表结论）与封面图（可能是未公开的结果图）
 *   **在草稿被压住之后仍然上线**。
 *
 * 口径：读**该内容目录里的模板文件**的 front matter（blog 是 index.md、
 * papers 是 paper.md、portfolio 是 index.md）⇒ 用与构建时**同一套**判定口径
 * （`isDraft`）⇒ 一处定义，两处使用。
 *
 * @param {string} contentDir 内容目录的绝对路径
 * @returns {boolean} true = 这一篇是草稿（附件不该复制）
 */
function isDraftDir(contentDir) {
  const fs = require("fs");
  const path = require("path");
  // 这个目录里**哪个**文件是模板？按各 section 的约定取第一个存在的。
  for (const name of ["index.md", "paper.md"]) {
    const f = path.join(contentDir, name);
    try {
      if (!fs.existsSync(f)) continue;
      // ⚠️ 用零依赖的顶层标量读取器，**不**用 gray-matter：
      //   本模块被 src/_data/site.js require ⇒ 它在 check-live-site.cjs 的
      //   依赖链上 ⇒ 那里**没有 node_modules** ⇒ 第三方包会让线上核查崩掉
      //   （发布落点门禁的 DP13 守这一条，本轮实测当场抓到）。
      const data = topLevelScalars(fs.readFileSync(f, "utf8"));
      // `draft` 读出来是**字符串**（顶层标量读取器不做类型转换）⇒
      // isDraft 本身就认字符串形态（"true"/"yes"/"on" ⇒ 草稿；"false"/"no"/"off" ⇒ 不是），
      // 这里**不**再额外转换（两处口径不许分叉）。
      return isDraft(data);
    } catch (e) {
      // 读不出 ⇒ 当作**不是**草稿（不误删已发布内容的附件）。
      return false;
    }
  }
  return false;
}


/**
 * 读一份 front matter 里的**顶层标量**（只认 `key: value` 这种顶格写法）。
 *
 * ⚠️ **为什么这里不用 gray-matter**（2026-10-29 21:30 场次实测踩到）：
 *   `src/_data/site.js` 被 `scripts/check-live-site.cjs` require，而**那个脚本跑在
 *   部署工作流的 `verify-live` job 里 —— 那个 job 没有 `npm ci` 步骤** ⇒
 *   那里**没有 node_modules** ⇒ site.js 只要 require 了任何第三方包，
 *   **线上核查整个跑不起来**（站点已经发上去了，核查却崩了）。
 *   ⇒ site.js 的依赖链必须只有「Node 内置 ＋ 本地文件」。
 *   发布落点门禁的 **DP13** 正是守这一条（它当场把这一处判红了）。
 *
 * ⚠️ **口径一致性怎么办**（这才是要紧的）：本函数**只读顶层标量**，
 *   而站内的论文 front matter **全是顶层标量**（无嵌套 YAML，实测确认）。
 *   ⇒ 对本站的写法，它与 YAML 解析器的结果一致；
 *   而「**真的**一致」由草稿门禁（DL5，在**有 node_modules** 的环境里跑）
 *   用 gray-matter **交叉核对**——两份口径不一致就判红。
 *   ⇒ 不是「两份副本各自演化」，而是「一份实现 ＋ 一处强制对账」。
 *
 * @param {string} text 文件全文
 * @returns {object} 顶层标量的键值表（值都是字符串）
 */
function topLevelScalars(text) {
  const out = {};
  if (typeof text !== "string") return out;
  // front matter = 开头第一对 --- ... ---
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    // 只认**顶格**的 `key: value`（缩进的行属于嵌套结构，一律不认）。
    const kv = /^([A-Za-z_][A-Za-z0-9_.-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    // 去掉行尾注释（值里没有 # 时不动它；有就按 YAML 的粗规则切）。
    if (v.startsWith('"') || v.startsWith("'")) {
      const q = v[0];
      const end = v.indexOf(q, 1);
      if (end > 0) v = v.slice(1, end);
    } else if (v.includes(" #")) {
      v = v.slice(0, v.indexOf(" #")).trim();
    }
    out[kv[1]] = v;
  }
  return out;
}

module.exports = { isDraft, isDraftDir, topLevelScalars, draftGuards };
