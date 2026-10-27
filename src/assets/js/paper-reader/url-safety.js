/* paper-reader/url-safety.js
 * ---------------------------------------------------------------------------
 * 外链协议白名单 —— 纯函数模块，**不依赖 DOM**。
 *
 * 为什么单独成一个文件：
 *   ① 渲染层只需要「这个 URL 能不能渲染成可点外链」这一个判断，单独成文件职责清楚；
 *   ② 它**不碰 DOM** ⇒ 门禁（scripts/check-url-safety.cjs）能在 Node 里
 *      **真的 import 它、喂一表输入、核对放行集合** ——
 *      静态扫描看不出白名单到底放行了什么，**行为实测**才算数。
 *
 * 为什么只放行 http / https：
 *   一条 `javascript` 协议的 href 在**被点击时就会执行脚本**；
 *   `data:` 能把任意文档内联进页面。
 *   ⇒ 注释里的链接只允许指向站外的 http(s) 资料；
 *   其余（脚本协议 / data: / 协议相对 / 相对路径 / 写错的）一律**不渲染成可点链接**。
 * --------------------------------------------------------------------------- */

/** 允许渲染成可点外链的协议（白名单）。 */
export const SAFE_LINK_SCHEMES = ["http:", "https:"];

/**
 * 一个 URL 是不是「可以渲染成可点外链」。
 *
 * 判据用 **URL 解析器**（而不是字符串前缀比对）⇒ 空白、大小写、换行都绕不过去：
 * URL 规范在解析前会去掉制表符与换行，所以 `"java\tscript:alert(1)"`
 * 解析出来的 protocol 就是脚本协议 ⇒ 被拒。
 *
 * @param {unknown} url 待判的 URL（任何类型；非字符串按字符串处理）
 * @returns {boolean} true = 可以渲染成可点外链
 */
export function isSafeLinkUrl(url) {
  const s = String(url ?? "").trim();
  if (!s) return false;
  let parsed;
  try {
    parsed = new URL(s);
  } catch (_) {
    /* 相对路径 / 协议相对 / 非法 URL ⇒ new URL 抛错 ⇒ 不放行 */
    return false;
  }
  return SAFE_LINK_SCHEMES.includes(parsed.protocol);
}
