#!/usr/bin/env node
/**
 * 自测档位静态清单守卫 · 包装器 —— 缺陷 D71 的修法（接线这一半）。
 *
 * 为什么要有这个包装器：
 *   2026-10-22 实测：全仓接在 build 链上的 `scripts/test-*.cjs` 里，
 *   只有 readme / figure-cover / css-publish 这几个自己带了「档位清单守卫」，
 *   其余的只断言"跑过的档位按预期触发"——**不核对"该跑的档位都跑了"**。
 *   后果：把某档从自测里删掉，矩阵照样全绿。少跑一档没人看得出来。
 *
 * 这个包装器干什么：
 *   跑一个自测 → 从它的输出里抽出行首编号 → 与 `scripts/lib/selftest-slots.cjs`
 *   里那份**静态清单**比对（按出现次数比，不是按集合比）→ 少跑 / 多跑都判红。
 *
 * 为什么清单要独立于各自测：
 *   从实现反推的清单会跟着实现一起变（删档时清单也少一项 ⇒ 照样绿），
 *   那就不是守卫，是镜子。集中登记的清单独立于各自测实现 ⇒ 删档时清单不变 ⇒ 当场红。
 *
 * 为什么按出现次数比、不按集合比：
 *   实测全仓有若干自测存在"多档共用一个编号"（D11 / DY11 / C1 / M1 …）。
 *   只比集合的话，删掉共用编号里的其中一档，编号还在 ⇒ 守卫看不见 ⇒ 洞还在。
 *   按次数比，那一档少一次就会被逮到。
 *
 * 用法：`node scripts/run-selftest.cjs scripts/test-xxx.cjs`
 *   退出码：自测本身红 ⇒ 透传自测的退出码；自测绿但清单对不上 ⇒ 1；清单里没登记这个
 *   自测 ⇒ 1（守卫对它无效，必须红，不许静默放行）。
 *
 * 编号用独立字母体系 SF*（静态清单守卫），与 scripts/check-selftest-guard.cjs 的
 * SG*（元门禁）各管一段，互不重叠。
 */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { SLOTS, NOISE } = require(path.join(__dirname, "lib", "selftest-slots.cjs"));

/* ---------- 抽取规则：什么样的行算"一档" ---------- */

/** 行首标记：✓ / ✔ / · （各自测的记法不统一，三种都认）。 */
const MARK = /^\s*(?:✓|✔|·)\s+/;
/**
 * 编号 token：行首第一个 token 形如 `SP0` / `INJ-4b` / `N-CE1` / `COV2a` / `G-BASE`。
 * 必须是"拉丁字母起头、可含数字、可带连字符段"，且后面紧跟空白或标点。
 */
const TOKEN = /^([A-Za-z][A-Za-z0-9]{0,5}(?:-[A-Za-z0-9]+)*)(?=\s|$|[：:，,（(、。；;！!？?])/;

/**
 * 一个 token 算不算"档位号"：
 *   · 含数字（SP0 / INJ-0 / N-CE1 / COV2a）—— 绝大多数自测的档位号都是这种；
 *   · 或是全大写连字符形态（G-BASE）—— verify-site 的基线档是这种。
 * 不含数字的普通词（COV / token / verify-site）不算档位号：
 *   它们要么是辅助自检行，要么是收尾汇总行。
 */
function looksLikeId(tok) {
  if (/\d/.test(tok)) return true;
  if (/^[A-Z]+(?:-[A-Z0-9]+)+$/.test(tok)) return true;
  return false;
}

/** 从一段输出里抽出全部行首编号（按出现顺序，保留重复）。 */
function extractIds(text) {
  const ids = [];
  for (const line of String(text).split("\n")) {
    if (!MARK.test(line)) continue;
    const rest = line.replace(MARK, "");
    const m = rest.match(TOKEN);
    if (!m) continue;
    if (!looksLikeId(m[1])) continue;
    ids.push(m[1]);
  }
  return ids;
}

/** 编号 → 出现次数。 */
function bag(ids) {
  const m = new Map();
  for (const id of ids) m.set(id, (m.get(id) || 0) + 1);
  return m;
}

/**
 * 从观测里减掉噪声编号（噪声不是一档，不参与比对）。
 * ⚠️ 减到 0 必须**删键**，不能留一个计数为 0 的键 ——
 *    留着的话，它会被当成「实到 0 次、清单里没有」的**多跑**红因报出来（自相矛盾）。
 */
function dropNoise(counts, noise) {
  const out = new Map(counts);
  for (const nz of noise || []) {
    const n = out.get(nz) || 0;
    if (n > 1) out.set(nz, n - 1);
    else out.delete(nz);
  }
  return out;
}

/**
 * 双向比对：少的报"少跑"，多的报"多跑"。
 * @returns {{missing: Array<[string, number, number]>, extra: Array<[string, number]>}}
 *   missing: [编号, 清单要求次数, 实到次数]
 *   extra:   [编号, 实到次数]（清单里没有这个编号）
 */
function compareSlots(expectedIds, observedIds, noise) {
  const want = bag(expectedIds || []);
  const got = dropNoise(bag(observedIds || []), noise);
  const missing = [];
  const extra = [];
  for (const [id, n] of want) {
    const m = got.get(id) || 0;
    if (m < n) missing.push([id, n, m]);
  }
  for (const [id, n] of got) {
    if (!want.has(id)) extra.push([id, n]);
  }
  return { missing, extra };
}

/* ---------- 跑起来 ---------- */

const target = process.argv[2];
if (!target) {
  console.error("自测档位静态清单守卫未通过：\n");
  console.error("  ✗ 用法：node scripts/run-selftest.cjs scripts/test-xxx.cjs");
  process.exit(1);
}

const abs = path.resolve(process.cwd(), target);
const name = path.basename(abs);
const entry = SLOTS[name];

if (!entry) {
  console.error("自测档位静态清单守卫未通过：\n");
  console.error(
    `  ✗ ${name} 不在静态清单（scripts/lib/selftest-slots.cjs）里 —— ` +
      `守卫对它无效（等于没守）。请把它的档位号登记进去。`
  );
  process.exit(1);
}
if (!fs.existsSync(abs)) {
  console.error("自测档位静态清单守卫未通过：\n");
  console.error(`  ✗ 找不到自测文件：${target}`);
  process.exit(1);
}

const child = spawn(process.execPath, [abs], {
  cwd: process.cwd(),
  stdio: ["ignore", "pipe", "pipe"],
});
let outBuf = "";
let errBuf = "";
/** 最后一次写出去的内容是否以换行结尾（自测的输出不一定以换行收尾）。 */
let endedWithNl = true;
child.stdout.on("data", (d) => {
  outBuf += d;
  endedWithNl = d.toString().endsWith("\n");
  process.stdout.write(d);
});
child.stderr.on("data", (d) => {
  errBuf += d;
  endedWithNl = d.toString().endsWith("\n");
  process.stderr.write(d);
});

child.on("close", (code) => {
  const observed = extractIds(outBuf).concat(extractIds(errBuf));
  const { missing, extra } = compareSlots(entry, observed, NOISE[name]);

  if (code !== 0) {
    console.error("");
    console.error(
      `自测本身未通过（exit=${code}）：${name} —— 静态清单守卫不参与判定，` +
        `但失败必须透传，不许被包装器吞掉。`
    );
    process.exit(typeof code === "number" ? code : 1);
  }

  if (missing.length || extra.length) {
    console.error("");
    console.error("自测档位静态清单守卫未通过：\n");
    for (const [id, n, m] of missing) {
      console.error(
        `  ✗ SF1 ${name} 少跑了档位 ${id}：清单要求 ${n} 次，实到 ${m} 次 —— ` +
          `「该跑的档位都跑了」这件事没被证明。`
      );
    }
    for (const [id, n] of extra) {
      console.error(
        `  ✗ SF2 ${name} 多跑了档位 ${id}：实到 ${n} 次，静态清单里没有 —— ` +
          `清单与自测已经不同步（改了自测就要同步改清单）。`
      );
    }
    console.error("");
    console.error("  静态清单：scripts/lib/selftest-slots.cjs");
    console.error(
      "  改法：要么把这一档补回自测，要么同步改静态清单（改清单要在改进日志里记一笔）。"
    );
    process.exit(1);
  }

  const uniq = new Set(entry).size;
  if (!endedWithNl) console.log("");
  console.log(
    `  ✓ 静态清单守卫：${name} 跑了 ${entry.length} 条编号（${uniq} 个唯一编号），` +
      `与静态清单完全一致（少跑 / 多跑都没有）。`
  );
  process.exit(0);
});
