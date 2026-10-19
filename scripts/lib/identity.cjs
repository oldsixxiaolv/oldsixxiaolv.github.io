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
 *   · scripts/check-identity-handles.cjs → **只做漂移核对**，**不**取期望集
 *
 * ⚠️ 本模块**不是判据的期望集**（2026-10-19 修正，实测过的那种盲区）：
 *   判据（scripts/check-identity-handles.cjs）里**自己写死**了一份独立期望集
 *   ORACLE_SAMEAS，不从本模块取。原因是实测过的形态：本模块**正是产物的发射源**
 *   （site.js 从这里取 author.sameAs），期望集若也取自本模块，两者就是同源的
 *   ——有人把本模块里的某条句柄**等长替换**成别的（条数不变、ORCID 仍在），
 *   重建后产物与期望集**一起**变，判据在"拿自己和自己比" → **全绿**。
 *   改短 / 改长 / 整片消失两版都抓得到，**只有等长替换这一形态会被吃掉**。
 *   现在本模块的清单只承担 I2d 的**漂移核对**角色：它与独立期望集必须逐项一致，
 *   漂了就判红。
 *
 * ⚠️ 要增删一条身份句柄：**两处都要改**——
 *   ① 本文件的 IDENTITY_SAMEAS；② 门禁里的 ORACLE_SAMEAS + EXPECTED_COUNT
 *   + ORACLE_SET_SHA256（哈希锚；合法增删后跑一次门禁，红因里会给出该贴的新值）。
 *   漏改任一处 → 门禁判红（这是有意的：漂了就该叫）。
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
