const { getSlugFromData } = require("../../eleventy-helpers.cjs");

module.exports = {
  layout: "layouts/detail.njk",
  permalink: (data) => `/blog/${getSlugFromData(data)}/`,
  tags: ["blog"],
  // 这一族页面在结构化数据里**自称什么作品**（2026-10-24；缺陷清单 D94）。
  // 论文页用 front matter 的 `pubKey` 指向 site.js 里那一条论文，博客这边
  // 没有可指向的外部登记条目，于是用**集合级**的裸键标出实体类型。
  //   · 裸键（不是 site.*）—— 模板读的就是裸键，判据也按数据层的三条路径回源
  //     （front matter 顶层 / eleventyComputed / 目录数据文件）。
  //   · 放**目录数据文件**而不是文章 front matter —— 写作契约（front matter
  //     字段表）不因此变动：这一族页面的实体类型是**站点的事**，不是每篇文章
  //     要各写一遍的事；写进 front matter 只会让作者多一个必填字段。
  //   · 值是 schema.org 的实体类型名，与论文页的 ScholarlyArticle 同一套词表。
  structuredType: "BlogPosting",
  eleventyComputed: {
    prev: (data) => {
      const all = (data.collections && data.collections.blog) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx > 0 ? all[idx - 1] : null;
    },
    next: (data) => {
      const all = (data.collections && data.collections.blog) || [];
      const idx = all.findIndex((it) => (it.url || "") === (data.page.url || ""));
      return idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
    },
  },
};