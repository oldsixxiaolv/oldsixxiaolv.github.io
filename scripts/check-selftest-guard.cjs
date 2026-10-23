#!/usr/bin/env node
/**
 * 自测档位静态清单守卫 · 元门禁 —— 缺陷 D71 的修法（守"接线"这一半）。
 *
 * 为什么要有这道门禁：
 *   缺陷 D71 实测：全仓接在 build 链上的 `scripts/test-*.cjs` 里，只有 readme /
 *   figure-cover / css-publish 这几个自己带了「档位清单守卫」，其余的只断言
 *   "跑过的档位按预期触发"——不核对"该跑的档位都跑了"⇒ 删掉一档，矩阵照样全绿。
 *
 *   修法是「静态清单 + 包装器」：`scripts/run-selftest.cjs` 跑每个自测，
 *   从输出里抽行首编号，与 `scripts/lib/selftest-slots.cjs` 的静态清单双向比对。
 *   但这套机制本身也会失灵，而且失灵的样子**和"没问题"一模一样**：
 *     · 某个自测没登记进静态清单 ⇒ 守卫对它完全无效（它照样绿）；
 *     · 某个自测的 npm 命令绕过了包装器 ⇒ 守卫对它完全无效；
 *     · 静态清单里留着一个已经没人跑的自测 ⇒ 清单在骗人（看着有守，其实在守空气）；
 *     · 接线和清单被一起砍掉 ⇒ 全绿，但什么都没守。
 *   这四条都是"看起来在、其实不生效"那一族，本门禁就是它们的看守。
 *
 * 四条判据：
 *   SG1 登记表覆盖 —— 每个接在 build 链上的自测，静态清单里必须有对应条目。
 *   SG2 必须经由包装器 —— ① 包装器自己必须被 build 链上的 npm script 引用；
 *                        ② 每个接在 build 链上的自测，其 npm 命令必须经由包装器。
 *   SG3 清单不许有孤儿 —— 静态清单里的每个条目，都必须对应一个真实存在、
 *                        且接在 build 链上的自测脚本。
 *   SG4 覆盖度自证 —— 接线自测数与静态清单条目数都不得低于下限
 *                        （空跑保护：这两边被一起砍掉时，SG1 / SG3 会一起绿）。
 *   SG5 登记自洽 —— EXTRA（行首标记行的显式去处）本身不能自相矛盾。
 *
 * ⚠️ 诚实边界（写清楚才算数）：
 *   · 本门禁只保证"接线与清单这一层是自洽的"，**不保证静态清单里的编号本身是对的**
 *     —— 编号对不对由包装器在实际跑的时候比（少跑 / 多跑都判红）。
 *   · 本门禁不检查自测内部逻辑；自测逻辑的证据是各自测自己的负对照。
 *   · 「接线自测数 == 清单条目数」这个等式由 SG1（不缺）与 SG3（不多）双向蕴含，
 *     本门禁不单独判它 —— 单判一个"两个数相等"很容易在两边一起被改坏时一起变绿。
 *   · SG5 在 EXTRA 为空时没有可比对的东西 —— **这不是空跑**：那种情况下真正的
 *     守门人是包装器的兜底判据（每有一条行首标记行没有出处就当场判红）。
 *
 * 编号用独立字母体系 SG*（静态清单守卫 · 元门禁），与 scripts/run-selftest.cjs 的
 * SF*（包装器）各管一段，互不重叠。
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "package.json");
const SCRIPTS_DIR = path.join(ROOT, "scripts");
const WRAPPER = "scripts/run-selftest.cjs";

const { SLOTS, EXTRA } = require(path.join(__dirname, "lib", "selftest-slots.cjs"));

/**
 * 接线自测数的下限 —— **空跑保护**。
 * 接线解析坏掉、或接线与静态清单被一起砍掉时，SG1 与 SG3 可能一起绿；
 * 这一条是那种情况下唯一还会红的东西。取一个很松的下限：它只会随自测变多而更松，
 * 真要收紧时必须同时改这里并在改进日志里记一笔。
 */
const MIN_WIRED = 10;

/* ---------- 读 package.json ---------- */
if (!fs.existsSync(PKG)) {
  console.error("自测静态清单守卫元门禁未通过：\n");
  console.error("  ✗ 找不到 package.json，无法确认各自测是怎么接线的。");
  process.exit(1);
}
let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
} catch (e) {
  console.error("自测静态清单守卫元门禁未通过：\n");
  console.error(`  ✗ package.json 解析失败：${e.message}`);
  process.exit(1);
}
const SCRIPTS = pkg.scripts || {};

/* ---------- 从 build 出发，算出"可达"的 npm script 集合 ---------- */
const NPM_RUN_RE = /\bnpm\s+run\s+([A-Za-z0-9:_-]+)/g;
function reachableFromBuild() {
  const seen = new Set();
  const queue = ["build"];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const cmd = SCRIPTS[name] || "";
    NPM_RUN_RE.lastIndex = 0;
    let m;
    while ((m = NPM_RUN_RE.exec(cmd)) !== null) {
      if (SCRIPTS[m[1]] !== undefined) queue.push(m[1]);
    }
  }
  return seen;
}
const REACHABLE = reachableFromBuild();

/* ---------- 接线上的自测：basename → 引用它的 npm script ---------- */
const SELFTEST_RE = /scripts\/(test-[A-Za-z0-9_-]+\.cjs)/g;
const wired = new Map(); // basename → [npm script 名]
for (const name of REACHABLE) {
  const cmd = SCRIPTS[name] || "";
  SELFTEST_RE.lastIndex = 0;
  let m;
  while ((m = SELFTEST_RE.exec(cmd)) !== null) {
    if (!wired.has(m[1])) wired.set(m[1], []);
    if (!wired.get(m[1]).includes(name)) wired.get(m[1]).push(name);
  }
}

const problems = [];

/* ---------- SG1：接线上的自测必须都在静态清单里 ---------- */
for (const [file, refs] of wired) {
  if (SLOTS[file] === undefined) {
    problems.push(
      `SG1 ${file} 接在 build 链上（${refs.join(" / ")}），但静态清单 ` +
        `（scripts/lib/selftest-slots.cjs）里没有它的条目 —— ` +
        `守卫对它完全无效（它绿不绿都跟清单无关，等于没守）。` +
        `请把它的档位号登记进静态清单。`
    );
  }
}

/* ---------- SG2：接线必须经由包装器 ---------- */
const wrapperRefs = Object.keys(SCRIPTS).filter((n) => (SCRIPTS[n] || "").includes(WRAPPER));
const wrapperLive = wrapperRefs.filter((n) => REACHABLE.has(n));
if (!wrapperLive.length) {
  problems.push(
    `SG2 包装器 ${WRAPPER} 没有被 build 链上的任何 npm script 引用 —— ` +
      `整套静态清单守卫等于没跑（它自己被摘掉了）。`
  );
}
for (const [file, refs] of wired) {
  const bypassing = refs.filter((n) => !(SCRIPTS[n] || "").includes(WRAPPER));
  if (bypassing.length) {
    problems.push(
      `SG2 ${file} 的 npm 命令（${bypassing.join(" / ")}）**绕过了包装器** ${WRAPPER} —— ` +
        `这一档的编号不会被拿去和静态清单比对，等于这个自测没人守。` +
        `请把命令改成 node ${WRAPPER} scripts/${file}。`
    );
  }
}

/* ---------- SG3：静态清单不许有孤儿 ---------- */
for (const file of Object.keys(SLOTS)) {
  if (!fs.existsSync(path.join(SCRIPTS_DIR, file))) {
    problems.push(
      `SG3 静态清单里的 scripts/${file} 已经不在仓库里了 —— ` +
        `删掉这条登记，别让清单烂在里面（清单烂着 = 看着有守、其实在守空气）。`
    );
    continue;
  }
  if (!wired.has(file)) {
    problems.push(
      `SG3 静态清单里登记了 scripts/${file}，但它没有接在 build 链上 —— ` +
        `这一条登记在骗人（看着像有人守，其实谁也没跑它）。` +
        `要么把它接进 build 链（经由包装器），要么把这条登记删掉。`
    );
  }
}

/* ---------- SG4：覆盖度自证（空跑保护） ---------- */
if (wired.size < MIN_WIRED) {
  problems.push(
    `SG4 只认出 ${wired.size} 个接线上的自测（下限 ${MIN_WIRED}）—— ` +
      `接线解析可能已经失效（"没报错"和"没问题"长得一模一样），必须判红。`
  );
}
if (Object.keys(SLOTS).length < MIN_WIRED) {
  problems.push(
    `SG4 静态清单只登记了 ${Object.keys(SLOTS).length} 个自测（下限 ${MIN_WIRED}）—— ` +
      `清单可能已被清空或没接上，这时 SG1 / SG3 会一起绿，必须有这一条兜住。`
  );
}

/* ---------- SG5：EXTRA 登记必须自洽 ---------- */
/**
 * EXTRA（scripts/lib/selftest-slots.cjs）是「每个行首标记行的显式去处」：
 * 要么是静态清单里的编号，要么是登记过的锚点，要么被显式声明成「不是一档」。
 * 这一条守的是**登记本身不能自相矛盾**：
 *   · 登记了一个不在静态清单里的文件 ⇒ 这条登记是孤儿（它守的东西不在守卫视野里）；
 *   · 锚点词与该文件的清单编号重叠 ⇒ 同一个词既是编号又是锚点，判定说不清；
 *   · 锚点词与「显式声明不是一档」的词重叠 ⇒ 自相矛盾；
 *   · 同一个文件里同一个词登记了两次 ⇒ 次数说不清；
 *   · 锚点的 count 不是 ≥1 的整数 ⇒ 锚点没有意义。
 */
for (const [file, reg] of Object.entries(EXTRA)) {
  if (SLOTS[file] === undefined) {
    problems.push(
      `SG5 EXTRA 里登记了 scripts/${file}，但静态清单里没有它的条目 —— ` +
        `这条登记是孤儿（它守的东西根本不在守卫视野里）。`
    );
    continue;
  }
  const ids = new Set(SLOTS[file]);
  const anchors = (reg && reg.anchors) || [];
  const notSlots = (reg && reg.notSlots) || [];
  const seenAnchor = new Set();
  for (const a of anchors) {
    const w = a && a.word;
    if (typeof w !== "string" || !w) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 有一条锚点登记没有合法的 word —— 锚点必须写清行首词。`
      );
      continue;
    }
    if (seenAnchor.has(w)) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的锚点「${w}」登记了两次 —— 同一个词的次数说不清。`
      );
    }
    seenAnchor.add(w);
    if (ids.has(w)) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的锚点「${w}」与静态清单的编号重合 —— ` +
          `同一个词既是编号又是锚点，判定说不清。`
      );
    }
    if (notSlots.includes(w)) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的锚点「${w}」与「显式声明不是一档」的词重合 —— 自相矛盾。`
      );
    }
    if (!Number.isInteger(a.count) || a.count < 1) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的锚点「${w}」的 count 必须是 ≥1 的整数` +
          `（现在是 ${JSON.stringify(a.count)}）。`
      );
    }
  }
  const seenNot = new Set();
  for (const w of notSlots) {
    if (seenNot.has(w)) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的「不是一档」词「${w}」登记了两次。`
      );
    }
    seenNot.add(w);
    if (ids.has(w)) {
      problems.push(
        `SG5 EXTRA 里 scripts/${file} 的「不是一档」词「${w}」与静态清单的编号重合 —— ` +
          `同一个词既是编号又不是档，自相矛盾。`
      );
    }
  }
}

/* ---------- 汇总 ---------- */
if (problems.length) {
  console.error("自测静态清单守卫元门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  process.exit(1);
}

const registryKeys = Object.keys(SLOTS);
const totalSlots = registryKeys.reduce((a, k) => a + SLOTS[k].length, 0);
const extraKeys = Object.keys(EXTRA);
const extraAnchors = extraKeys.reduce(
  (a, k) => a + (((EXTRA[k] && EXTRA[k].anchors) || []).length),
  0
);
const extraNotSlots = extraKeys.reduce(
  (a, k) => a + (((EXTRA[k] && EXTRA[k].notSlots) || []).length),
  0
);
console.log(
  `自测静态清单守卫元门禁通过：${wired.size} 个接在 build 链上的自测全部经由 ${WRAPPER}，` +
    `静态清单登记了 ${registryKeys.length} 个自测 / ${totalSlots} 条档位号，` +
    `接线与清单双向自洽（不缺、不多），包装器本身也在 build 链上，` +
    `EXTRA 登记 ${extraKeys.length} 个自测（锚点 ${extraAnchors} 个 / 显式非档位 ${extraNotSlots} 个）且自洽。`
);
