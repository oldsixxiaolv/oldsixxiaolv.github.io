const { getSlugFromData } = require("../../eleventy-helpers.cjs");
const { draftGuards } = require("../../eleventy-draft.cjs");

module.exports = {
  layout: "layouts/detail.njk",
  // ⚠️ 草稿抑制：Eleventy 3 **完全不认识 `draft`**（上游源码零命中）⇒
  //   写 `draft: true` 原本会被照常发布（页面 + 正文进产物 + sitemap + feed + 列表页）。
  //   这里接上上游推荐的两件套：permalink 侧不写盘 ＋ 集合侧不进任何集合。
  //   ⚠️ 只接一件是半拉子抑制（详见 src/eleventy-draft.cjs 文件头）。
  // ⚠️ **路径模板必须与 `permalink:` 同一行**（信息架构门禁 IAC1 / IAC13 用
  //   不跨行的正则提取 permalink 家族前缀 `/portfolio/`；折行就提不出来 ⇒ 判红）。
  permalink: (data) => draftGuards.permalink(`/portfolio/${getSlugFromData(data)}/`, data),
  tags: ["portfolio"],
  eleventyComputed: {
    // 草稿不进任何集合（⇒ sitemap / feed / 列表页都看不到它）。
    eleventyExcludeFromCollections: (data) =>
      draftGuards.excludeFromCollections(data),
    prev: (data) => {
      const all = (data.collections && data.collections.portfolio) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx > 0 ? all[idx - 1] : null;
    },
    next: (data) => {
      const all = (data.collections && data.collections.portfolio) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    },
  },
};