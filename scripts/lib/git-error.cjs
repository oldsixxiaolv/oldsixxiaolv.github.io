/* git 失败的分类 —— 抽成共享模块。
 *
 * ⚠️ 为什么要有这个模块（2026-10-19）：
 *   判据原本在 eleventy.config.js 与 scripts/verify-site.cjs 各抄一份，
 *   于是"改一处、忘另一处"就可能让**两边的行为不一致** —— 而这两边恰恰
 *   必须一致：它们一起决定"门禁到底有没有真的核对过 lastmod"。
 *   抄两份的代价，原注释里已经写明过（"两边必须一起改"）——
 *   那种约定靠人记，迟早会漏。**抽成一份，两边不可能再漂移。**
 *
 * 分类（2026-10-19 实测 9 种形态，Node v26.8.1；表见 docs/IMPROVEMENT-LOG.md
 * 「C2 判据复验」段）：
 *   "unavailable"    git 不在 PATH（ENOENT）→ 本来就没有 git 历史（源码 zip 分发）
 *   "no-history"     git 跑了但退出码非 0（如 128 "not a git repository"）
 *   "unknown"        git **判定不出来**：被信号杀（SIGKILL/SIGTERM/SIGSEGV）、
 *                    存在但不可执行（EACCES/ENOEXEC）、缓冲区溢出（ENOBUFS）……
 *   "program-error"  编程错误（TypeError / ReferenceError）——**没有 status 属性**
 *
 * ⚠️ "unknown" 为什么**不能**降级成"没有 git 历史"：
 *   降级 = 把"判不出来"说成"没有 git 历史" → 门禁的规则 C/D/E
 *   （逐页核对 lastmod +「lastmod 整体消失」兜底）整块被跳过 →
 *   门禁报"源码 zip 分发"而全绿，实际上一页都没验证过。
 *   端到端实测（2026-10-19）：删掉 sitemap 的 source 标注 ——
 *   git 可用时 exit 1 判红；git 被 SIGKILL 时 exit 0 全绿（同一缺陷两种结果）。
 *   → "判不出来"必须**响亮地失败**，不能悄悄降级。
 *
 * ⚠️ 旧判据 `(typeof e.status === "number" || e.code === "ENOENT")` 的注释
 *   写的是"spawn 失败 → e.code 是字符串"，而实现只认 ENOENT ——
 *   **注释承诺的比实现多**：EACCES 等其实并没有被降级，而是崩栈。
 *   崩栈方向没错（fail-closed），但看不出"是 git 跑不起来"还是"代码写错了"。
 *   下面把它分成四类，让每一种都有名字、有出处。
 */
"use strict";

/* 把一个 git 子进程错误归到四类之一。 */
const classifyGitError = (e) => {
  if (!e || typeof e !== "object") return "program-error";
  // 编程错误没有 status 属性 —— 这正是它与"子进程失败"的分界线
  if (!("status" in e)) return "program-error";
  if (e.code === "ENOENT") return "unavailable"; // git 不在 PATH
  if (e.signal) return "unknown"; // 被信号杀
  if (typeof e.code === "string") return "unknown"; // spawn 失败：EACCES / ENOEXEC / ENOBUFS …
  if (typeof e.status === "number") return "no-history"; // git 跑了但退出码非 0
  return "unknown";
};

/* 降级 or 抛：
 *   可降级（返回 null = "这里没有 git 历史"）：unavailable / no-history
 *   必须抛：unknown（判定不出来）、program-error（编程错误）
 */
const degradeOrThrow = (e) => {
  const kind = classifyGitError(e);
  if (kind === "unavailable" || kind === "no-history") return null;
  if (kind === "unknown") {
    const how = (e && (e.signal || e.code || "status=" + e.status)) || "未知";
    throw new Error(
      "git 判定不出来（" + how + "）—— 不能当成『没有 git 历史』降级：" +
        "降级会让 lastmod 整套判据（逐页核对 +「lastmod 整体消失」兜底）被整块跳过，" +
        "门禁会报『源码 zip 分发』而全绿，实际上一页都没验证过。",
      { cause: e }
    );
  }
  throw e; // 编程错误：原样抛出，不伪装成"没有 git 历史"
};

module.exports = { classifyGitError, degradeOrThrow };
