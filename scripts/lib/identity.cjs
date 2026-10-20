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
 * ⚠️ 要增删一条身份句柄：**三个文件、五个改动点**——
 *   ⚠️ 2026-10-19 实测校准：这一段此前写的是"**两处**都要改"，**与事实不符**。
 *      下面①②是那"两处"，但还有第三处（③），漏了它门禁照样判红。
 *   ① 本文件的 IDENTITY_SAMEAS ＋/－那一条；
 *   ② 门禁 scripts/check-identity-handles.cjs 的 ORACLE_SAMEAS ＋/－那一条
 *      ＋ EXPECTED_COUNT 改数 ＋ ORACLE_SET_SHA256 贴新哈希（哈希锚；合法
 *      增删后跑一次门禁，红因里会直接给出该贴的新值）；
 *   ③ src/_data/site.js 的 site.author 里**该平台的可见身份链接字段**
 *      （author.github / author.csdn / author.researchgate / author.openalex
 *      那一族）＋/－一项。
 *
 *   ⚠️ 第 ③ 处最容易被漏，原因在门禁里：I5 刻意**跳过** author.sameAs
 *      （机读路径由 I1 / I2 管），它只认 site.author 里**单独写出来的**
 *      可见链接字段 → 只加清单、不加可见字段，门禁必然判红。
 *      实测（隔离克隆 2026-10-19）：只改 ①② → 门禁 exit 1，唯一红因
 *      「site.author 里**数据源侧**的身份主页形态链接缺 https://gitlab.com/lvyihang」；
 *      再补上 ③ → 门禁 exit 0（走绿）。
 *
 *   ⚠️ 那条红因**只说数据层名（site.author），不点名 src/_data/site.js**
 *      ——红因里点名文件 / 直接写出同步清单属"待拍板 23"，未代拍。
 *      所以"到底要改哪几处"目前只能靠这段注释说清。
 *
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
