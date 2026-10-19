/**
 * 身份句柄的**单一真源** —— 本人（Yihang Lyu）的 5 条身份句柄。
 *
 * 为什么是共享模块，而不是"site.js 一份、门禁一份"：
 *   本仓库刚为 git 判据立的规矩治的正是这个病——"判据两处各抄一份 →
 *   改一处忘另一处"（12dedb0 把它抽成 scripts/lib/git-error.cjs 就是那个
 *   教训的产物）。身份句柄同理：站点数据与门禁都必须从**同一处**取清单。
 *
 * 谁 require 谁：
 *   · src/_data/site.js   → author.orcid / author.sameAs（权威标识 + 身份清单）
 *   · scripts/check-identity-handles.cjs → 判据用的期望集合
 *
 * ⚠️ 但**弱不变量必须留在门禁里，不能下放到本模块**：
 *   判据里要判"条数 == 5""集合含本人 ORCID"这两条。它们**不依赖清单内容**，
 *   所以只能写在判据里（scripts/check-identity-handles.cjs）；如果写在这里，
 *   有人把本模块改短成 1 条，门禁的期望集合跟着变短，门禁就红不了——
 *   那等于判据被自己卸掉。这与"清单内容单一来源"不冲突：
 *   **清单内容单一来源；不依赖清单内容的锚留在判据里。**
 *
 * ⚠️ 要增删一条身份句柄：改本文件的 IDENTITY_SAMEAS 一处即可
 *   （site.js 与门禁都从这里取）。但**门的锚**（条数、ORCID）在门禁脚本里，
 *   增删句柄时条数要同步改门禁里的 EXPECTED_COUNT —— 忘了改，门禁会判红。
 */
const OWNER_ORCID = "https://orcid.org/0009-0005-3511-0546";

const IDENTITY_SAMEAS = [
  OWNER_ORCID,
  "https://github.com/oldsixxiaolv",
  "https://www.researchgate.net/profile/Yihang-Lyu",
  "https://blog.csdn.net/lvyihang200411",
  // OpenAlex 作者实体（按 ORCID 精确反查得到，非手写猜测）：
  // https://api.openalex.org/authors/orcid:0009-0005-3511-0546 → A5121394231
  // OpenAlex 正是各类聚合库的上游，sameAs 带上它对"同一个人"的归属判读更有利。
  "https://openalex.org/A5121394231",
];

module.exports = { OWNER_ORCID, IDENTITY_SAMEAS };
