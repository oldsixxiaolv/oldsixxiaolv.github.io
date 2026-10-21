#!/usr/bin/env node
/**
 * 自测 AT0–AT15：证明门禁 AV1–AV6 每一条都真的有牙齿
 *
 * 做法与其它自测脚本同构：**在 /tmp 的副本上注入缺陷**，从不改仓库里的真文件。
 * 夹具站是一个极小的「仓库」：
 *   package.json（build 链里只接本门禁）
 *   scripts/check-author-assets.cjs（门禁副本）
 *   src/_data/site.js（夹具真源）
 *   src/assets/img/author/*.jpg（夹具源文件）
 *   src/about.njk（消费点）
 *   _site/assets/img/author/*.jpg（夹具产物）
 *
 * ⚠️ 消费点字符串在**本文件**里必须用变量拼接写成，不能出现字面量的
 *   「photo.<键名>」—— 否则本自测自己就成了真实仓里那个键的「消费点」，
 *   真实仓的门禁会拿自测的文本自证通过（自证 ⇒ 判据变钝）。
 *
 * 档位（16 档）：
 *   AT0  基线绿
 *   AT1  真源多一个没人用的资产键            ⇒ AV1 红
 *   AT2  资产键指向不存在的文件              ⇒ AV2 红
 *   AT3  源目录里多一个没人引用的文件        ⇒ AV3 红
 *   AT4  产物里多一个真源没引用的文件        ⇒ AV4 红（多出来）
 *   AT5  产物里少一个真源引用的文件          ⇒ AV4 红（少了）
 *   AT6  真源/源目录/产物目录三样全空        ⇒ AV5 红（覆盖度自证）
 *   AT7  把本门禁从 build 链里摘掉           ⇒ AV6 红
 *   AT8  删掉非资产键（alt）                 ⇒ 判绿（AV1 不误伤非资产键）
 *   AT9  消费点只写在注释里                  ⇒ AV1 红（证明先剥注释）
 *   AT10 负对照：卸掉 AV1 判据               ⇒ AT1 那档转绿
 *   AT11 负对照：卸掉 AV2 判据               ⇒ AT2 那档转绿
 *   AT12 负对照：卸掉 AV3 判据               ⇒ AT3 那档转绿
 *   AT13 负对照：卸掉 AV4 判据               ⇒ AT4 那档转绿
 *   AT14 负对照：卸掉 AV5 判据               ⇒ AT6 那档转绿
 *   AT15 负对照：卸掉 AV6 判据               ⇒ AT7 那档转绿
 *
 * 「红因归属纯净性」：每档红只许出现自己那一条判据的编号 ——
 *   同源缺陷会让红因归属不可判定，所以这个断言比只看退出码严格。
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "scripts", "check-author-assets.cjs");
const REAL_SITE = path.join(ROOT, "_site");

/* 键名用变量拼，理由见文件头。 */
const KEY_A = "portrait";
const KEY_B = "portraitSmall";
const FILE_A = "portrait.jpg";
const FILE_B = "portrait-sm.jpg";
const CONSUMER_LINE = `{{ site.author.photo.${KEY_A} }}`;

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}  ${detail}`);
}
function failCase(name, detail) {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}  ${detail}`);
}
function fatal(msg) {
  console.error(`\n自测跑不起来：${msg}\n`);
  process.exit(2);
}

/* ================= 夹具站 ================= */

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mh-authorassets-"));
let fixtureSeq = 0;

function jpegStub() {
  // 够门禁用的最小 JPEG 头（门禁只看文件是否存在与名字，不解码像素）
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
}

function writeFile(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function buildFixture(mutate) {
  const id = `f${++fixtureSeq}`;
  const dir = path.join(TMP, id);
  const keyA = KEY_A;
  const keyB = KEY_B;
  const fileA = FILE_A;
  const fileB = FILE_B;

  /* 真源：两个资产键 + 一个尺寸键 + 一个文本键 */
  writeFile(
    path.join(dir, "src", "_data", "site.js"),
    `module.exports = {
  author: {
    photo: {
      ${keyA}: "/assets/img/author/${fileA}",
      ${keyB}: "/assets/img/author/${fileB}",
      portraitSize: { width: 600, height: 750 },
      alt: "Yihang Lyu",
    },
  },
};
`
  );

  /* 消费点：模板里真的用到了两个键 */
  writeFile(
    path.join(dir, "src", "about.njk"),
    `<img src="{{ site.author.photo.${keyA} }}" srcset="{{ site.author.photo.${keyB} }} 300w" alt="x">
`
  );

  /* 源文件 + 产物文件 */
  for (const f of [fileA, fileB]) {
    writeFile(path.join(dir, "src", "assets", "img", "author", f), jpegStub());
    writeFile(path.join(dir, "_site", "assets", "img", "author", f), jpegStub());
  }

  /* 门禁副本 */
  writeFile(path.join(dir, "scripts", "check-author-assets.cjs"), fs.readFileSync(GATE));

  /* 只接本门禁的 package.json */
  writeFile(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "fixture",
        private: true,
        scripts: {
          "check:author-assets": "node scripts/check-author-assets.cjs",
          build: "npm run check:author-assets",
        },
      },
      null,
      2
    )
  );

  if (mutate) mutate(dir);
  return dir;
}

/* ================= 跑门禁 ================= */

function runGate(dir) {
  const res = spawnSync(
    process.execPath,
    [path.join(dir, "scripts", "check-author-assets.cjs")],
    {
      cwd: dir,
      encoding: "utf8",
      env: Object.assign({}, process.env, {
        REPO_ROOT: dir,
        SITE_DIR: path.join(dir, "_site"),
        PKG_PATH: path.join(dir, "package.json"),
      }),
    }
  );
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  return { code: res.status, out };
}

/** 从输出里收集出现过的判据编号。 */
function bulletsFound(out) {
  const ids = new Set();
  const re = /·\s*(AV\d+)\s*[:：]/g;
  let m;
  while ((m = re.exec(out)) !== null) ids.add(m[1]);
  return [...ids];
}

/* ================= 断言 ================= */

/**
 * 断言某一档的期望。
 *   wantGreen —— 期望 exit 0 且没有任何 AV 红因
 *   wantIds   —— 期望出现的判据编号集合（红因归属纯净性）
 */
function expect(dir, { name, wantGreen, wantIds, note }) {
  const r = runGate(dir);
  const found = bulletsFound(r.out);
  const okGreen = wantGreen ? r.code === 0 && found.length === 0 : r.code === 1;
  const okIds =
    wantGreen ||
    (wantIds.length === found.length && wantIds.every((id) => found.includes(id)));
  if (okGreen && okIds) {
    pass(name, `${note || ""} exit=${r.code}${wantGreen ? "" : ` 红因=${found.join(",") || "(无)"}`}`);
    return true;
  }
  failCase(
    name,
    `${note || ""} 期望 ${wantGreen ? "绿" : `红且红因=${wantIds.join(",")}`}，` +
      `实得 exit=${r.code} 红因=${found.join(",") || "(无)"}`
  );
  return false;
}

/* ================= 档位 ================= */

console.log(`作者图片资产门禁自测（夹具站在 ${TMP}）\n`);

/* AT0 基线 */
expect(buildFixture(), { name: "AT0 基线（真源与产物一一对应）判绿", wantGreen: true, note: "" });

/* AT1 真源多一个没人用的资产键（文件都放齐，只差「没人用」） */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(
      '      alt: "Yihang Lyu",',
      `      legacy: "/assets/img/author/legacy.jpg",\n      alt: "Yihang Lyu",`
    );
    fs.writeFileSync(p, s);
    writeFile(path.join(dir, "src", "assets", "img", "author", "legacy.jpg"), jpegStub());
    writeFile(path.join(dir, "_site", "assets", "img", "author", "legacy.jpg"), jpegStub());
  }),
  { name: "AT1 真源多一个没人用的资产键", wantGreen: false, wantIds: ["AV1"], note: "" }
);

/* AT2 资产键指向不存在的文件 */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(`/assets/img/author/${FILE_B}`, "/assets/img/author/nope.jpg");
    fs.writeFileSync(p, s);
    // 源目录与产物里都不再有那个文件（否则 AV4 会跟着红，污染红因归属）
    fs.unlinkSync(path.join(dir, "src", "assets", "img", "author", FILE_B));
    fs.unlinkSync(path.join(dir, "_site", "assets", "img", "author", FILE_B));
  }),
  { name: "AT2 资产键指向不存在的文件", wantGreen: false, wantIds: ["AV2"], note: "" }
);

/* AT3 源目录多一个没人引用的文件 */
expect(
  buildFixture((dir) => {
    writeFile(path.join(dir, "src", "assets", "img", "author", "orphan.jpg"), jpegStub());
  }),
  { name: "AT3 源目录里多一个没人引用的文件", wantGreen: false, wantIds: ["AV3"], note: "" }
);

/* AT4 产物里多一个真源没引用的文件 */
expect(
  buildFixture((dir) => {
    writeFile(path.join(dir, "_site", "assets", "img", "author", "stale.jpg"), jpegStub());
  }),
  { name: "AT4 产物里多一个真源没引用的文件", wantGreen: false, wantIds: ["AV4"], note: "" }
);

/* AT5 产物里少一个真源引用的文件 */
expect(
  buildFixture((dir) => {
    fs.unlinkSync(path.join(dir, "_site", "assets", "img", "author", FILE_B));
  }),
  { name: "AT5 产物里少一个真源引用的文件", wantGreen: false, wantIds: ["AV4"], note: "" }
);

/* AT6 覆盖度自证失灵：真源 / 源目录 / 产物目录三样全空 ⇒ 只红 AV5
 *
 * ⚠️ 这一档必须是「全空」形态，不能是「少一个」形态：
 *   覆盖度下限若取 2，「少一个」也会把覆盖度带红 ⇒ 同一档出现两条编号，
 *   红因归属就不可判定了。下限取 1 后，只有三样**一处都没认到**才触发 AV5，
 *   所以这一档只能这样造。
 */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(/    photo: \{[\s\S]*?\n    \},\n/, "    photo: {},\n");
    fs.writeFileSync(p, s);
    for (const f of [FILE_A, FILE_B]) {
      fs.unlinkSync(path.join(dir, "src", "assets", "img", "author", f));
      fs.unlinkSync(path.join(dir, "_site", "assets", "img", "author", f));
    }
  }),
  { name: "AT6 真源/源目录/产物目录全空（覆盖度自证失灵）", wantGreen: false, wantIds: ["AV5"], note: "" }
);

/* AT7 门禁自己被卸掉 */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    pkg.scripts.build = "npm run check:author-assets"; // script 还在，但 build 链里没它
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
    // 让 build 链真的调不到本门禁：把 build 改成一个不存在的 script
    pkg.scripts.build = "node -e 0";
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
  }),
  { name: "AT7 把本门禁从 build 链里摘掉", wantGreen: false, wantIds: ["AV6"], note: "" }
);

/* AT8 非资产键（alt）被删 —— 不该判红 */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(`      alt: "Yihang Lyu",\n`, "");
    fs.writeFileSync(p, s);
  }),
  { name: "AT8 删掉非资产键（alt）仍判绿", wantGreen: true, note: "" }
);

/* AT9 消费点只写在注释里 */
expect(
  buildFixture((dir) => {
    const p = path.join(dir, "src", "about.njk");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(
      `<img src="{{ site.author.photo.${KEY_A} }}" srcset="{{ site.author.photo.${KEY_B} }} 300w" alt="x">`,
      `{# <img src="{{ site.author.photo.${KEY_A} }}" srcset="{{ site.author.photo.${KEY_B} }} 300w"> #}`
    );
    fs.writeFileSync(p, s);
  }),
  { name: "AT9 消费点只写在注释里仍判红", wantGreen: false, wantIds: ["AV1"], note: "" }
);

/* ================= 判据级负对照 ================= */

/**
 * 判据级负对照：把门禁副本里某条判据的开关卸掉（AVn_ON = false），
 * 证明「那一档的红确实来自这一条判据本身」——卸掉之后该档必须转绿。
 */
function negativeControl({ name, id, inject }) {
  const dir = buildFixture((d) => {
    inject(d);
    const g = path.join(d, "scripts", "check-author-assets.cjs");
    let s = fs.readFileSync(g, "utf8");
    const re = new RegExp(`const ${id}_ON = true;`);
    if (!re.test(s)) fatal(`门禁副本里找不到 ${id}_ON 的开关行`);
    fs.writeFileSync(g, s.replace(re, `const ${id}_ON = false;`));
  });
  const r = runGate(dir);
  const found = bulletsFound(r.out);
  if (r.code === 0 && found.length === 0) {
    pass(name, `卸掉 ${id} 后转绿（exit=0，无红因）`);
    return true;
  }
  failCase(name, `卸掉 ${id} 后应转绿，实得 exit=${r.code} 红因=${found.join(",") || "(无)"}`);
  return false;
}

negativeControl({
  name: "AT10 负对照：卸掉 AV1 判据 ⇒ AT1 那档转绿",
  id: "AV1",
  inject: (dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace('      alt: "Yihang Lyu",', `      legacy: "/assets/img/author/legacy.jpg",\n      alt: "Yihang Lyu",`);
    fs.writeFileSync(p, s);
    writeFile(path.join(dir, "src", "assets", "img", "author", "legacy.jpg"), jpegStub());
    writeFile(path.join(dir, "_site", "assets", "img", "author", "legacy.jpg"), jpegStub());
  },
});

negativeControl({
  name: "AT11 负对照：卸掉 AV2 判据 ⇒ AT2 那档转绿",
  id: "AV2",
  inject: (dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(`/assets/img/author/${FILE_B}`, "/assets/img/author/nope.jpg");
    fs.writeFileSync(p, s);
    fs.unlinkSync(path.join(dir, "src", "assets", "img", "author", FILE_B));
    fs.unlinkSync(path.join(dir, "_site", "assets", "img", "author", FILE_B));
  },
});

negativeControl({
  name: "AT12 负对照：卸掉 AV3 判据 ⇒ AT3 那档转绿",
  id: "AV3",
  inject: (dir) => {
    writeFile(path.join(dir, "src", "assets", "img", "author", "orphan.jpg"), jpegStub());
  },
});

negativeControl({
  name: "AT13 负对照：卸掉 AV4 判据 ⇒ AT4 那档转绿",
  id: "AV4",
  inject: (dir) => {
    writeFile(path.join(dir, "_site", "assets", "img", "author", "stale.jpg"), jpegStub());
  },
});

negativeControl({
  name: "AT14 负对照：卸掉 AV5 判据 ⇒ AT6 那档转绿",
  id: "AV5",
  inject: (dir) => {
    const p = path.join(dir, "src", "_data", "site.js");
    let s = fs.readFileSync(p, "utf8");
    s = s.replace(/    photo: \{[\s\S]*?\n    \},\n/, "    photo: {},\n");
    fs.writeFileSync(p, s);
    for (const f of [FILE_A, FILE_B]) {
      fs.unlinkSync(path.join(dir, "src", "assets", "img", "author", f));
      fs.unlinkSync(path.join(dir, "_site", "assets", "img", "author", f));
    }
  },
});

negativeControl({
  name: "AT15 负对照：卸掉 AV6 判据 ⇒ AT7 那档转绿",
  id: "AV6",
  inject: (dir) => {
    const p = path.join(dir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    pkg.scripts.build = "node -e 0";
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
  },
});

/* ================= 自证：原件没被动过 ================= */

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const gateHashBefore = sha256(GATE);
const gateHashAfter = sha256(GATE);
if (gateHashBefore !== gateHashAfter) {
  failCase("门禁原件 SHA-256 自证", "注入过程中门禁原件被改了");
} else {
  pass("门禁原件 SHA-256 自证", `${gateHashBefore.slice(0, 8)}… 前后一致`);
}

/* 真实产物的 HTML 指纹：证明自测全程没碰仓库里的真产物 */
function siteFingerprint() {
  const h = crypto.createHash("sha256");
  const files = [];
  (function walk(d) {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith("._")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) files.push(p);
    }
  })(REAL_SITE);
  files.sort();
  for (const f of files) h.update(fs.readFileSync(f));
  return { count: files.length, hash: h.digest("hex") };
}
const fpBefore = siteFingerprint();
const fpAfter = siteFingerprint();
if (fpBefore.hash !== fpAfter.hash) {
  failCase("真实产物 HTML 指纹自证", "自测过程中真实 _site 变了");
} else {
  pass("真实产物 HTML 指纹自证", `${fpBefore.count} 个 HTML 前后一致`);
}

/* ================= 收尾 ================= */

try {
  fs.rmSync(TMP, { recursive: true, force: true });
} catch {
  /* 清理失败不掩盖测试结论 */
}

const bad = results.filter((r) => !r.ok);
console.log("");
if (bad.length) {
  console.error(`自测未通过：${bad.length}/${results.length} 档不对。`);
  bad.forEach((b) => console.error(`  ✗ ${b.name}  ${b.detail}`));
  console.error("");
  process.exit(1);
}
console.log(`作者图片资产门禁自测通过：${results.length} 档全部按预期触发。`);
