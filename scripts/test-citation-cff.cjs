#!/usr/bin/env node
/**
 * CITATION.cff 门禁的**自测**（注入矩阵）—— 证明 CF7 / CF8 每一条都**能变红**。
 *
 * 为什么要有这个自测：
 *   一条**永远不会红**的判据，给出的是"看起来很确定的绿"——它比没有判据更坏，
 *   因为它把"盲区"包装成"已核过"。CF7 / CF8 是本门禁里唯二**靠解析器**、
 *   不靠正则的判据（正则只做"行首 key:"那一层），最容易写成"看起来在跑、
 *   其实结构上不可能触发"。本仓已经吃过好几次这种亏（遮罩把目标文本本身吃掉、
 *   覆盖度只覆盖一半还照样打印"通过"）。
 *   所以"这条判据结构上能不能触发"本身必须**被证明**，而不是假定。
 *
 * 做法：把 CITATION.cff **复制**一份到临时目录，在副本上逐个注入缺陷，
 *   用 `CFF_PATH` 环境变量把门禁指向副本，然后断言门禁**确实**报出了
 *   对应的那条红因。
 *   ⚠️ 全程**不动仓库里真的那份 CITATION.cff** —— 注入必须在副本上做。
 *   （这是门禁里加 `CFF_PATH` 这个开关的原因：没有它，自测就只能去改
 *     仓库文件，改坏了就是事故。README 门禁用的是同一个模式。）
 *
 * 十档：
 *   M0 基线（原样）                    → 必须**全绿**（证明这套判据不是空跑）
 *   M1 文件不是合法 YAML                → CF7（真解析）
 *   M2 同一个键写了两遍                  → CF7（真解析）
 *   M3 顶层多一个官方没有的字段           → CF7（顶层字段表）
 *   M4 顶层键被引号包着（正则认不出）     → CF7（解析器与正则对账）
 *   M5 顶层 type 写成 article            → CF8（type 取值域）
 *   M6 doi 写成 doi.org 解析器 URL        → CF8（doi 格式）
 *   M7 orcid 少了 https://orcid.org/ 前缀 → CF8（orcid 格式）
 *   M8 preferred-citation 少了 title     → CF8（reference required）
 *   M9 keywords 是空列表                 → CF8（minItems）
 *
 * 用法：node scripts/test-citation-cff.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(__dirname, "check-citation-cff.cjs");
const REAL = path.join(ROOT, "CITATION.cff");

if (!fs.existsSync(REAL)) {
  console.error("CITATION.cff 自测失败：找不到仓库根目录的 CITATION.cff。");
  process.exit(1);
}

const original = fs.readFileSync(REAL, "utf8");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mh-cff-selftest-"));
const copyPath = path.join(tmp, "CITATION.cff");

/** 替换一次；锚点不存在就抛错（坏跑必须当场暴露，不能记成"测过了"）。 */
function replaceOnce(text, from, to) {
  if (!text.includes(from)) throw new Error(`注入锚点不存在：找不到「${from}」`);
  const out = text.replace(from, to);
  if (out === text) throw new Error(`注入没有改变内容：「${from}」`);
  return out;
}

/** 正则替换一次；没匹配上就抛错（同上：坏跑当场暴露）。 */
function replaceRegexOnce(text, re, to) {
  const out = text.replace(re, to);
  if (out === text) throw new Error(`注入没有匹配到内容：${re}`);
  return out;
}

/** 删掉以 prefix 开头的那一整行。 */
function dropLine(text, prefix) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.startsWith(prefix));
  if (i < 0) throw new Error(`注入锚点不存在：找不到以「${prefix}」开头的行`);
  lines.splice(i, 1);
  const out = lines.join("\n");
  if (out === text) throw new Error(`注入没有改变内容：「${prefix}」`);
  return out;
}

/** 在副本上注入 → 跑门禁 → 返回 {code, out} */
function run(mutate) {
  let text = original;
  if (mutate) text = mutate(text);
  fs.writeFileSync(copyPath, text);
  const r = spawnSync(process.execPath, [GATE], {
    env: { ...process.env, CFF_PATH: copyPath },
    encoding: "utf8",
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const CASES = [
  {
    id: "M0",
    desc: "基线（原样）",
    expect: "green",
    mutate: null,
  },
  {
    id: "M1",
    desc: "文件不是合法 YAML（缩进里塞了 Tab）",
    expect: "red",
    sub: "不是合法的 YAML",
    mutate: (t) => replaceRegexOnce(t, /\nkeywords:\n {2}- "Thunderstorm Lightning/, '\nkeywords:\n\t- "Thunderstorm Lightning'),
  },
  {
    id: "M2",
    desc: "同一个键写了两遍",
    expect: "red",
    sub: "同一个键写了两遍",
    mutate: (t) => replaceOnce(t, "\ntitle: ", '\ntitle: "duplicate"\ntitle: '),
  },
  {
    id: "M3",
    desc: "顶层多一个官方 schema 没有的字段",
    expect: "red",
    sub: "官方 CFF 1.2.0 schema 的顶层字段表里没有",
    mutate: (t) => replaceOnce(t, "\ntype: software\n", '\ntype: software\nauther: "typo"\n'),
  },
  {
    id: "M4",
    desc: "顶层键被引号包着（逐行正则认不出，解析器认得出）",
    expect: "red",
    sub: "逐行正则却认不出",
    mutate: (t) => replaceOnce(t, "\ntitle: ", '\n"title": '),
  },
  {
    id: "M5",
    desc: "顶层 type 写成 article（article 只是 reference 的 type）",
    expect: "red",
    sub: "顶层 type",
    mutate: (t) => replaceOnce(t, "\ntype: software\n", "\ntype: article\n"),
  },
  {
    id: "M6",
    desc: "doi 写成 doi.org 解析器 URL（官方要裸 DOI）",
    expect: "red",
    sub: "不符合官方 schema 的 doi 格式",
    mutate: (t) => replaceOnce(t, '\n  doi: "', '\n  doi: "https://doi.org/'),
  },
  {
    id: "M7",
    desc: "orcid 少了 https://orcid.org/ 前缀",
    expect: "red",
    sub: "不符合官方 schema 的 orcid 格式",
    mutate: (t) =>
      replaceOnce(
        t,
        '\n    orcid: "https://orcid.org/0009-0005-3511-0546"',
        '\n    orcid: "0009-0005-3511-0546"'
      ),
  },
  {
    id: "M8",
    desc: "preferred-citation 少了 title（reference required）",
    expect: "red",
    sub: "preferred-citation 缺必需字段",
    mutate: (t) => dropLine(t, '  title: "New Insights'),
  },
  {
    id: "M9",
    desc: "keywords 是空列表（官方 minItems: 1）",
    expect: "red",
    sub: "keywords 是空的",
    mutate: (t) => replaceRegexOnce(t, /\nkeywords:\n(?: {2}- "[^"]*"\n)+/, "\nkeywords: []\n"),
  },
];

let failed = 0;
console.log("CITATION.cff 自测（注入矩阵）：\n");

for (const c of CASES) {
  let r;
  try {
    r = run(c.mutate);
  } catch (e) {
    console.error(`  ✗ ${c.id} ${c.desc} —— 注入本身坏了：${e.message}`);
    failed++;
    continue;
  }
  if (c.expect === "green") {
    if (r.code === 0) {
      console.log(`  ✓ ${c.id} ${c.desc} → 门禁全绿（exit 0）`);
    } else {
      console.error(`  ✗ ${c.id} ${c.desc} → 期望 exit 0，实际 ${r.code}`);
      console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
      failed++;
    }
  } else if (r.code === 1 && r.out.includes(c.sub)) {
    console.log(`  ✓ ${c.id} ${c.desc} → 判红，红因命中「${c.sub}」`);
  } else {
    console.error(`  ✗ ${c.id} ${c.desc} → 期望判红且红因含「${c.sub}」，实际 exit ${r.code}`);
    console.error(r.out.split("\n").map((l) => "      " + l).join("\n"));
    failed++;
  }
}

/* 自证：仓库里真的那份 CITATION.cff 一个字节都没被动过。 */
if (fs.readFileSync(REAL, "utf8") !== original) {
  console.error("\n  ✗ 仓库里的 CITATION.cff 被改了 —— 自测必须只在副本上注入。");
  failed++;
}

fs.rmSync(tmp, { recursive: true, force: true });

console.log("");
if (failed) {
  console.error(`CITATION.cff 自测未通过：${failed}/${CASES.length} 档不对。\n`);
  process.exit(1);
}
console.log(`CITATION.cff 自测通过：${CASES.length} 档全部符合预期（注入只在副本上做，仓库那份未被改动）。\n`);
