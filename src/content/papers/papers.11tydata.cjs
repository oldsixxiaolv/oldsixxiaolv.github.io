/* ============================================================================
 * src/content/papers/papers.11tydata.cjs · papers 子目录默认 front-matter
 * ========================================================================== */
const fs = require("fs");
const path = require("path");
const { getSlugFromData } = require("../../eleventy-helpers.cjs");
const { draftGuards } = require("../../eleventy-draft.cjs");

module.exports = {
  layout: "layouts/paper.njk",
  // ⚠️ 草稿抑制：Eleventy 3 **完全不认识 `draft`**（上游源码零命中）⇒
  //   写 `draft: true` 原本会被照常发布（页面 + sitemap + feed + 列表页）。
  //   这里接上上游推荐的两件套：permalink 侧不写盘 ＋ 集合侧不进任何集合。
  //   ⚠️ 只接一件是半拉子抑制（详见 src/eleventy-draft.cjs 文件头）。
  // ⚠️ **路径模板必须与 `permalink:` 同一行**（信息架构门禁 IAC1 / IAC13 用
  //   不跨行的正则提取 permalink 家族前缀 `/papers/`；折行就提不出来 ⇒ 判红）。
  permalink: (data) => draftGuards.permalink(`/papers/${getSlugFromData(data)}/`, data),
  // 把当前论文的 slug 显式暴露给 layout（layout 中 page 对象指向 layout 自身，
  // 不能直接用 page.fileSlugStem 拿到内容页 slug）
  eleventyComputed: {
    slug: (data) => getSlugFromData(data),
    // 草稿不进任何集合（⇒ sitemap / feed / 列表页都看不到它）。
    eleventyExcludeFromCollections: (data) =>
      draftGuards.excludeFromCollections(data),
    // 批注开关：paper.njk 靠它决定要不要把 annotationsUrl 传给
    // paper-reader/main.js。判据是「这篇论文的目录下真实存在
    // annotations.json」——构建期按文件存在与否逐篇判定，
    // 有文件的论文页挂批注侧栏，没有的整段跳过批注模块（不会对必然
    // 404 的地址发请求）。passthrough copy（eleventy.config.js 里
    // src/content/papers/**/annotations.json 那条）负责把这份 JSON
    // 送到产物里供浏览器 fetch。
    hasAnnotations: (data) => {
      const input = data.page && data.page.inputPath;
      if (!input) return false;
      return fs.existsSync(
        path.join(path.dirname(path.resolve(input)), "annotations.json")
      );
    },
  },
  tags: ["papers"],
};
