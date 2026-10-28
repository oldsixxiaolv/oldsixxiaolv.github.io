#!/usr/bin/env node
/**
 * 逐字路径解析（大小写敏感）—— 让门禁的结论**不取决于文件系统的大小写敏感性**。
 *
 * 为什么要有它（2026-10-28 实测，D119）：
 *   门禁判「被引用的文件在不在」用的是 `fs.existsSync`。
 *   而 `fs.existsSync` 的**大小写行为取决于文件系统**：
 *     · macOS 的 APFS / exFAT（默认）：**大小写不敏感**
 *       ⇒ 实测 `fs.existsSync('src/_data/SITE.JS')` 返回 **true**
 *         （真实文件叫 `site.js`）—— 写错大小写的引用**照样"存在"**；
 *     · Linux（CI 的 ubuntu-latest）：**大小写敏感**
 *       ⇒ 同一个路径**不存在**。
 *   ⇒ 同一份树、同一个缺陷：**本机绿、CI 红**。
 *     · 源侧（模板里写错大小写的资产 URL）：本机整条 build 链全绿，
 *       推到 CI 才红（红因还只是笼统的「仓内没有这个文件」），
 *       本地预览一切正常、线上（GitHub Pages 跑在 Linux 上）却是 **404**。
 *     · 产物侧（verify-site 判据 1 的本地引用解析）：同一个洞，同一种漂移。
 *
 * 本模块怎么解决：
 *   **不使用 `fs.existsSync`**，改成**逐段 readdir**——
 *   readdir 返回的是目录项的**真实字节名**，与文件系统敏感不敏感无关。
 *   逐段比对下来，三种结果：
 *     · `ok`      —— 路径逐字存在；
 *     · `case`    —— 路径不存在，但存在**仅大小写不同**的同名项
 *                    （这是"大小写不一致"，不是"根本没有"——两者的修法完全不同）；
 *     · `missing` —— 路径不存在，且没有同形项。
 *   ⇒ 同一个缺陷，在大小写敏感的盘与不敏感的盘上得到**同一个结论、同一个归因**。
 *
 * ⚠️ 为什么必须区分 `case` 与 `missing`（不能合并成"不存在"）：
 *   两者的修法完全不同 —— `case` 是**改引用方**（把大小写改成真的那个），
 *   `missing` 是**补文件**（或改白名单）。混成一条红因 ⇒ 修的人会跑错方向。
 *   而且在**大小写不敏感**的机器上，`missing` 这个结论根本判不出来
 *   （existsSync 会说 true）⇒ 不区分就等于没修。
 *
 * ⚠️ 边界（诚实写清楚，不假装扫全了）：
 *   · 只判**大小写**这一种偏差，不判 Unicode 归一化（NFC/NFD）、不判同形异码字；
 *   · 不判**软链接**指向的文件名（只按目录项的名字逐字比）；
 *   · 目录项读不到（权限 / 目录不存在）时一律按 `missing` 报 —— 那不是"没问题"，
 *     调用方必须把它当成"不存在"处理，不能当成"没问题"；
 *   · **不做跨平台路径语义**：调用方必须先给出**绝对路径**。
 */
"use strict";

const fs = require("fs");
const path = require("path");

/* 目录清单缓存：同一轮里同一个目录往往被反复解析
   （TR1 扫 170+ 个文件、每处引用都要解析一遍路径）。
   ⚠️ 缓存只在**单次运行**内有效 —— 门禁跑完即退，不存在"清单过期"的问题。 */
const dirCache = new Map();

function readDirSafe(dir) {
  if (dirCache.has(dir)) return dirCache.get(dir);
  let entries = null;
  try {
    entries = fs.readdirSync(dir);
  } catch (e) {
    entries = null;
  }
  dirCache.set(dir, entries);
  return entries;
}

/**
 * 逐字解析一个绝对路径。
 *
 * @param {string} absPath 绝对路径
 * @returns {{status: "ok"|"case"|"missing", at?: string, dir?: string, actual?: string[]}}
 *   status=ok      —— 路径逐字存在
 *   status=case    —— 首个不匹配的路径段只与真实项**大小写不同**
 *                     （at=写的那段，actual=目录里真实存在的同名项，dir=它所在的目录）
 *   status=missing —— 路径不存在（at=第一个找不到的路径段，dir=它所在的目录）
 */
function resolveCaseExact(absPath) {
  const parts = path.resolve(absPath).split(path.sep).filter(Boolean);
  let cur = path.sep;

  for (const seg of parts) {
    const entries = readDirSafe(cur);
    if (entries === null) {
      // 目录读不到：按"不存在"处理（调用方不得当成"没问题"）。
      return { status: "missing", at: seg, dir: cur, reason: "目录读不到" };
    }
    if (entries.includes(seg)) {
      cur = path.join(cur, seg);
      continue;
    }
    const same = entries.filter((e) => e.toLowerCase() === seg.toLowerCase());
    if (same.length > 0) {
      return { status: "case", at: seg, dir: cur, actual: same };
    }
    return { status: "missing", at: seg, dir: cur };
  }

  return { status: "ok" };
}

/**
 * 把解析结果写成人话（红因正文用）。
 * @param {string} shownPath  门禁原来会显示的那个路径（一般是拼出来的目标）
 * @param {object} res        resolveCaseExact 的返回值
 * @param {string} relOf      把绝对路径换算成"给人看"的相对路径的函数
 */
function describeCase(res, shownPath, relOf) {
  const show = (p) => (typeof relOf === "function" ? relOf(p) : p);
  if (res.status === "case") {
    const actual = (res.actual || []).join(" / ");
    return (
      `${shownPath} 的**大小写与真实文件对不上**` +
      `（目录 ${show(res.dir)} 里真实的名字是 ${actual}）`
    );
  }
  return `${shownPath}（${res.at ? `在 ${show(res.dir)} 这一段就断了` : "找不到"}）`;
}

module.exports = { resolveCaseExact, describeCase };
