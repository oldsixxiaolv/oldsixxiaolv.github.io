#!/usr/bin/env node
/**
 * 发布落点门禁 —— 守住「文档里的发布命令真的指向发布仓库」这条线。
 *
 * 为什么要有这道门禁（一次具体的实测，不是假想）：
 *   2026-10-22（D78 场次）实测：`docs/DEPLOY.md` 的「日常发布」一节写的是
 *   `git push oldsixxiaolv main`，而那个远端指向 `oldsixxiaolv/MeteoHub.git` ——
 *   **该仓库对本人账号已不存在**（`git ls-remote` 实测报 Repository not found）。
 *   于是「照文档操作」必然失败，站点累计的提交一直发不出去
 *   （缺陷 D6 一直修不掉，正是因为没人发现真正卡住的是**发布命令本身**）。
 *   同一份文档另有两处声明「本仓库本身就是用户站仓库 oldsixxiaolv.github.io」
 *   ⇒ **文档内部自相矛盾**：命令说推 A，声明说发布落点是 B。
 *
 * 判据：
 *   DP1 远端存在 —— 文档里每条发布命令的远端必须在 `git remote -v` 里真实存在。
 *   DP2 远端指向发布仓库 —— 该远端的 URL 必须指向**文档声明的发布仓库**
 *      （本条正是能抓住上述那个矛盾的那条）。
 *   DP3 分支会触发部署 —— 该命令推的分支必须在部署工作流的触发分支里
 *      （推到不触发的分支 ⇒ 推了也不会部署，且**不报错**，最难发现）。
 *   DP4 覆盖度自证 —— 至少检出 1 条发布命令、1 个远端、1 处发布仓库声明，
 *      且要扫的活文档都在；防「改空了通过」。
 *   DP5 部署工作流里的 action 必须钉到 **commit SHA** ——
 *      tag（`@v4`）是**可移动引用**：上游改 tag 就换了要跑的代码，
 *      而本仓库收不到任何通知 ⇒ 「发到公网域名上的字节」由第三方仓库的
 *      tag 决定，而不是由本仓库的提交决定。
 *      口径对齐 **OpenSSF Scorecard 的 Pinned-Dependencies 判据**（Risk: Medium，
 *      它明确把 GitHub workflows 列入扫描面）；`./本地路径` 天然钉死，豁免。
 *   DP6 部署工作流**顶层**的 permissions 必须只读 ——
 *      顶层不写 = 用**仓库默认**的 token 权限（可能 read-write）；
 *      顶层写 = **每个 job** 都持有（含跑完整条 build 链、也就是执行仓内代码的那个）。
 *      写权限要收窄到具体 job（deploy job 需要 `pages: write` + `id-token: write`，
 *      官方 deploy-pages 文档写明「执行部署的 job 至少需要这两个」）。
 *      口径对齐 **OpenSSF Scorecard 的 Token-Permissions 判据**（Risk: High）。
 *
 * ⚠️ 为什么只扫 README.md 与 docs/DEPLOY.md（**历史记录不扫**）：
 *   docs/IMPROVEMENT-LOG.md、docs/DEFECT-BACKLOG.md、docs/ROADMAP.md 是**历史记录** ——
 *   它们会**原样保留**当时的错误写法（缺陷条目里必须写着当时那条错的命令，
 *   否则就成了改写历史）。所以只扫承载「现在时」契约的那两份活文档。
 *
 * ⚠️ 为什么「发布命令」只认**代码块里**的那一行：
 *   读者是照着代码块抄命令的，正文里提及旧写法（例如「别再用那个已经失效的远端」）
 *   是在**解释**，不是在**发布** —— 两者混在一起判必然出假红。
 *   代价：把发布命令写在行内代码里（不在代码块）会被漏掉 ⇒ 但那时 DP4 会判红
 *   （「一条发布命令都没检出」），不会静默放过。
 *
 * ⚠️ 诚实边界（不写清楚就成了过度声称）：
 *   · 这道门禁是**静态**的：它查「文档命令 ↔ 本地 git 远端配置 ↔ 文档声明」三者一致，
 *     **不联网** ⇒ 远端仓库在 GitHub 上被删或改名这件事它**看不见**
 *     （2026-10-22 那次是靠人工 `git ls-remote` 发现的）。
 *     CI 里没有 SSH 密钥，build 链也必须保持零网络依赖。
 *   · 发布仓库声明靠「标记短语 + 反引号里的仓库名」解析；标记短语被改写时
 *     DP4c 会判红（而不是静默放过）。
 *   · 远端 URL 解析不出仓库名时，本门禁**不判**（判不了不等于有问题）。
 *
 * 环境变量（供 scripts/test-deploy-target.cjs 的注入矩阵用）：
 *   DPT_ROOT —— 覆盖仓库根（发布命令、远端、部署工作流都从这里找）。
 *              注入必须在副本上做，不动仓库里的文件。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(process.env.DPT_ROOT || path.join(__dirname, ".."));

/** 活文档面：承载「现在时」发布契约的两份文档（相对仓库根）。 */
const DOC_FILES = ["README.md", "docs/DEPLOY.md"];
/** 部署工作流（相对仓库根）—— push 到它的触发分支上才会部署。 */
const WORKFLOW = ".github/workflows/deploy.yml";

/** 「发布仓库声明」的标记短语：出现其中之一的那一段，才算在声明发布落点。 */
const DECL_MARKERS = ["用户站仓库", "仓库：", "发布仓库"];
/** 形如源码文件路径的 token（`scripts/x.cjs`）不是仓库名 —— 排除掉。 */
const SOURCE_EXT_RE =
  /\.(?:c?js|mjs|json|md|ya?ml|css|html|njk|txt|png|jpe?g|svg|xml|lock|ts|py|sh|toml|ini|csv|log|map)$/i;

const problems = [];
const fail = (m) => problems.push(m);

/* ---------------- 工具 ---------------- */

/** 文件在仓库根之内时给「相对路径:行号」，否则给绝对路径（自测副本会跑到仓库外）。 */
function where(file, lineNo) {
  const rel = path.relative(ROOT, file);
  const base = rel.startsWith("..") ? file : rel;
  return `${base}:${lineNo}`;
}

/**
 * 从远端 URL 里取出仓库名（最后一段，去掉 `.git`）。
 * 支持 SSH scp 形态（`git@host:owner/repo.git`）与 URL 形态（`https://host/owner/repo.git`）。
 */
function repoNameOfUrl(url) {
  let s = String(url || "").trim();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""); // 去协议
  s = s.replace(/^[^@/]*@/, ""); // 去 userinfo
  s = s.replace(/^[^:]*:([^/]*)\//, "$1/"); // scp 形态的 host:path
  const segs = s.split("/").filter(Boolean);
  if (segs.length < 2) return null;
  const name = segs[segs.length - 1].replace(/\.git$/, "");
  return name || null;
}

/** 从一个反引号里的 token 推出仓库名（认不出来就返回 null）。 */
function repoNameOfToken(tok) {
  const t = String(tok || "").trim();
  if (!t) return null;
  if (t.includes("@") || t.includes("://")) return null; // URL 不是仓库引用
  if (t.startsWith("/") || t.endsWith("/")) return null; // 路径不是仓库引用
  const segs = t.split("/").filter(Boolean);
  if (!segs.length) return null;
  const name = segs[segs.length - 1].replace(/\.git$/, "");
  /* 只认**用户站仓库**（`*.github.io`）—— 本项目的发布落点就是它。
     刻意收紧：声明集合一旦被正文里随手一个 token 污染，DP2 就会放行真正指错的远端
     （那是**静默失守**，比误报危险得多）。将来若改用别的仓库形态，
     本门禁会在 DP4c 上判红（响亮地失守，而不是安静地失守）。 */
  if (!name.endsWith(".github.io")) return null;
  return name;
}

/** 读 `git remote -v` → Map<远端名, URL>。读不到（不是 git 仓 / 没有 git）返回 null。 */
function readRemotes(root) {
  let text = "";
  try {
    text = execFileSync("git", ["remote", "-v"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    return null;
  }
  const out = new Map();
  for (const line of text.split("\n")) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim());
    if (!m) continue;
    if (m[3] === "fetch") out.set(m[1], m[2]); // fetch / push 的 URL 一般相同，取 fetch 那条
  }
  return out;
}

/** 一行里的发布命令（`git push <远端> <分支>`）。 */
function parsePush(line) {
  const m = /\bgit\s+push\b(.*)$/.exec(line);
  if (!m) return null;
  const tokens = m[1].split(/\s+/).filter(Boolean);
  const positional = [];
  for (const t of tokens) {
    if (t.startsWith("#")) break; // 行尾注释
    if (["&&", "||", ";", "|", "&", ">"].includes(t)) break; // 命令结束
    if (t.startsWith("-")) continue; // 选项（--force / -u 等）
    positional.push(t);
  }
  if (!positional.length) return null;
  const remote = positional[0];
  let branch = positional[1] || "";
  if (branch.includes(":")) branch = branch.slice(branch.lastIndexOf(":") + 1); // HEAD:main
  return { remote, branch };
}

/** 文档里检出的发布命令（带出处）。 */
function findPublishCommands(docs) {
  const out = [];
  for (const d of docs) {
    let inFence = false;
    d.lines.forEach((line, i) => {
      /* 围栏行本身不是命令，它只切换「当前在不在代码块里」。 */
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return;
      }
      /* 发布命令只认**代码块里**的那一行 —— 读者是照着代码块抄的，
         正文里提及旧命令（例如「别再用那个旧远端」）不是发布命令。 */
      if (!inFence) return;
      const parsed = parsePush(line);
      if (parsed) out.push({ ...parsed, where: where(d.file, i + 1), line: line.trim() });
    });
  }
  return out;
}

/** 按空行切段：声明短语与仓库名可能在同一段的相邻行上。 */
function paragraphs(text) {
  return text.split(/\n\s*\n/);
}

/** 文档里声明的发布仓库名（去重）。 */
function findDeclaredRepos(docs) {
  const out = new Set();
  for (const d of docs) {
    for (const para of paragraphs(d.text)) {
      if (!DECL_MARKERS.some((mk) => para.includes(mk))) continue;
      for (const m of para.matchAll(/`([^`]+)`/g)) {
        const name = repoNameOfToken(m[1]);
        if (name) out.add(name);
      }
    }
  }
  return out;
}

/** 解析部署工作流里 push 的触发分支。 */
function workflowPushBranches(text) {
  const lines = text.split("\n");
  const indentOf = (l) => (l.match(/^\s*/) || [""])[0].length;
  const onIdx = lines.findIndex((l) => /^on\s*:/.test(l));
  if (onIdx < 0) return { state: "no-on" };
  const base = indentOf(lines[onIdx]);
  const onBlock = [];
  for (let i = onIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (indentOf(lines[i]) <= base) break;
    onBlock.push(lines[i]);
  }
  const pushIdx = onBlock.findIndex((l) => /^\s*push\s*:/.test(l));
  if (pushIdx < 0) return { state: "no-push" };
  const pushIndent = indentOf(onBlock[pushIdx]);
  const pushBlock = [onBlock[pushIdx]];
  for (let i = pushIdx + 1; i < onBlock.length; i++) {
    if (indentOf(onBlock[i]) <= pushIndent) break;
    pushBlock.push(onBlock[i]);
  }
  const joined = pushBlock.join("\n");
  const list = (raw) =>
    raw
      .split(",")
      .map((x) => x.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  const m = /branches\s*:\s*\[([^\]]*)\]/.exec(joined);
  if (m) return { state: "ok", branches: list(m[1]) };
  const m2 = /branches\s*:\s*([^\n]+)/.exec(joined);
  if (m2) return { state: "ok", branches: list(m2[1]) };
  return { state: "all-branches" }; // push 没写分支过滤 ⇒ 任何分支都触发
}

/* ---------------- 扫描 ---------------- */

/** 读活文档（缺失的记下来，由 DP4 判红）。 */
const docs = [];
const missingDocs = [];
for (const rel of DOC_FILES) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    missingDocs.push(rel);
    continue;
  }
  const text = fs.readFileSync(file, "utf8");
  docs.push({ file, rel, text, lines: text.split("\n") });
}

const commands = findPublishCommands(docs);
const declared = findDeclaredRepos(docs);
const remotes = readRemotes(ROOT);

let wf = { state: "no-file" };
let wfText = null;
const wfFile = path.join(ROOT, WORKFLOW);
if (fs.existsSync(wfFile)) {
  wfText = fs.readFileSync(wfFile, "utf8");
  wf = workflowPushBranches(wfText);
}

/* ---------------- DP1 / DP2 / DP3 ---------------- */

for (const cmd of commands) {
  /* DP3 分支：不依赖远端是否存在（推错分支与远端对不对是两件事）。 */
  if (cmd.branch && wf.state === "ok" && !wf.branches.includes(cmd.branch)) {
    fail(
      `DP3 ${cmd.where} 分支不在部署工作流的触发分支里（分支「${cmd.branch}」，` +
        `工作流只在 [${wf.branches.join(", ")}] 上触发）—— 推到不触发的分支**不报错也不部署**` +
        `（推完了看不出任何异常，站点纹丝不动）。该命令：${cmd.line}`
    );
  }

  const url = remotes ? remotes.get(cmd.remote) : undefined;
  if (url === undefined) {
    /* DP1 远端不存在 ⇒ DP2 判不了（没有 URL 可解析），所以这里不再报 DP2。 */
    const avail = remotes && remotes.size ? [...remotes.keys()].join(" / ") : "（一个都没有）";
    fail(
      `DP1 ${cmd.where} 发布命令里的远端「${cmd.remote}」在 git remote -v 里不存在 —— ` +
        `照这条命令操作必然失败。当前可用的远端：${avail}。该命令：${cmd.line}`
    );
    continue;
  }

  const name = repoNameOfUrl(url);
  if (declared.size && (!name || !declared.has(name))) {
    fail(
      `DP2 ${cmd.where} 与文档声明的发布仓库对不上：远端「${cmd.remote}」（${url}）` +
        `${name ? `指向的仓库是「${name}」` : "解析不出仓库名"}，` +
        `而文档声明的发布落点是 ${[...declared].join(" / ")} —— 命令与声明必须指向同一个仓库，` +
        `否则「照文档发布」会推到别处去。该命令：${cmd.line}`
    );
  }
}

/* ---------------- DP4 覆盖度自证 ---------------- */

/* DP3b：读不到部署工作流的触发分支 ⇒ DP3 判不了（判不了不等于没问题，必须报出来）。 */
if (wf.state !== "ok" && wf.state !== "all-branches") {
  fail(
    `DP3 读不到部署工作流的触发分支（${WORKFLOW} 的状态是 ${wf.state}）—— ` +
      `「发布命令推的分支会不会触发部署」这件事判不了，必须报出来而不是静默放过。`
  );
}

if (missingDocs.length) {
  fail(
    `DP4 要扫的活文档不在：${missingDocs.join(" / ")} —— 扫描面被收窄了，` +
      `这道门禁已经看不到其中一份发布契约，等于没在检查。`
  );
}
if (commands.length < 1) {
  fail(
    `DP4 一条发布命令都没检出 —— 发布命令只认**代码块里**的那一行（读者是照着代码块抄的）；` +
      `要么文档里的发布写法变了（门禁要跟着更新），要么发布命令被删光了；` +
      `删光不是「修好了」，是「不再检查了」。`
  );
}
if (!remotes || remotes.size < 1) {
  fail(
    `DP4 一个远端都没检出 —— 读不到 git remote -v（不是 git 仓 / 没有 git / 没有远端）。` +
      `没有远端清单就没法核对发布命令指向哪里。`
  );
}
if (declared.size < 1) {
  fail(
    `DP4 一处发布仓库声明都没检出 —— 文档必须有一处说明发布落点是哪个仓库` +
      `（标记短语：${DECL_MARKERS.join(" / ")}），否则「发布命令指的是不是发布仓库」无从判断。`
  );
}

/* ---------------- DP5 / DP6：部署工作流本身的钉法与权限 ---------------- */

/**
 * 工作流里所有 `uses:` 引用的 action。
 * 口径（对齐 **OpenSSF Scorecard 的 Pinned-Dependencies** 判据，Risk: Medium）：
 *   · `owner/repo@<ref>` —— 必须是 **40 位十六进制的 commit SHA**。
 *     tag（`@v4`）是**可移动引用**：上游把 tag 指到别的 commit，
 *     要跑的代码就变了，而你**不会收到任何通知** ⇒
 *     「发到公网域名上的字节」由一个第三方仓库的 tag 决定，
 *     而不是由本仓库的提交决定。
 *   · `./local/path` —— 本仓自己的 action，内容就在仓库里 ⇒ 天然钉死；
 *   · `docker://…` —— 容器镜像，另说（本仓当前不用）。
 */
function actionRefs(text) {
  const out = [];
  const re = /^[ \t]*uses:[ \t]*(\S+)(?:[ \t]+#.*)?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    const at = ref.lastIndexOf("@");
    out.push({
      raw: ref,
      lineNo: text.slice(0, m.index).split("\n").length,
      kind: ref.startsWith("./") ? "local" : ref.startsWith("docker://") ? "docker" : at >= 0 ? "remote" : "other",
      pinned: at >= 0 && /^[0-9a-f]{40}$/.test(ref.slice(at + 1)),
    });
  }
  return out;
}

/**
 * 工作流**顶层**（列 0）的 permissions 块。
 * ⚠️ 只看顶层 —— job 级带 `write` 是**有意为之**（deploy job 需要
 *   `pages: write` + `id-token: write`，官方 deploy-pages 文档写明
 *   「执行部署的 job 至少需要这两个」）。
 * 返回 { present, entries }：present=false ⇒ **顶层根本没写 permissions**
 *   ⇒ GitHub 用**仓库默认**的 token 权限（可能�� read-write）⇒ 那才是真的没设防。
 */
function topLevelPermissions(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^permissions[ \t]*:[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline.startsWith("{")) {
      return { present: true, entries: [{ lineNo: i + 1, text: inline }] };
    }
    const entries = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (!/^[ \t]+\S/.test(lines[j])) break;
      entries.push({ lineNo: j + 1, text: lines[j].trim() });
    }
    return { present: true, entries };
  }
  return { present: false, entries: [] };
}

if (wfText !== null) {
  const refs = actionRefs(wfText);
  const unpinned = refs.filter((r) => r.kind === "remote" && !r.pinned);
  if (unpinned.length) {
    fail(
      `DP5 部署工作流里有 action 没有钉到 commit SHA（${unpinned.length} 处）：` +
        unpinned.map((r) => `${WORKFLOW}:${r.lineNo} 的「${r.raw}」`).join("；") +
        ` —— tag 是可移动引用：上游改了 tag，要跑的代码就变了，而本仓库收不到任何通知。` +
        `请钉到 40 位 commit SHA（升级命令见该文件末尾的「action 版本钉法」）。`
    );
  }
  if (refs.length < 1) {
    fail(
      `DP5 一个 action 引用都没检出 —— 「工作流里的 action 有没有钉到 SHA」这件事判不了，` +
        `要么工作流写法变了（门禁要跟着更新），要么 action 引用被删光了。`
    );
  }

  const perms = topLevelPermissions(wfText);
  if (!perms.present) {
    fail(
      `DP6 部署工作流顶层没有 permissions 声明 —— 顶层不写就是用**仓库默认**的 token 权限，` +
        `而仓库默认可能是 read-write ⇒ 跑完整条 build 链的 job 会握着一把能改仓库的钥匙。` +
        `顶层至少要写 contents: read（写权限只给真正需要的 job）。`
    );
  } else {
    const writes = perms.entries.filter((e) => /:[ \t]*write\b/.test(e.text));
    if (writes.length) {
      fail(
        `DP6 部署工作流顶层给了写权限（${writes.length} 处）：` +
          writes.map((e) => `${WORKFLOW}:${e.lineNo} 的「${e.text}」`).join("；") +
          ` —— 顶层写权限 = **每个 job** 都持有（含跑完整条 build 链、也就是执行仓内代码的那个）。` +
          `写权限要收窄到具体 job（deploy job 需要 pages: write + id-token: write）。`
      );
    }
  }
}

/* ---------------- 汇总 ---------------- */
if (problems.length) {
  console.error("发布落点门禁未通过：\n");
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  console.error("");
  console.error(
    "  判据出处：docs/DEFECT-BACKLOG.md D77（D77 场次实测：文档里的发布命令指向已不存在的远端）。"
  );
  console.error("");
  process.exit(1);
}

console.log(
  `发布落点门禁通过：${docs.length} 份活文档里检出 ${commands.length} 条发布命令、` +
    `${remotes.size} 个远端、${declared.size} 处发布仓库声明（${[...declared].join(" / ")}），` +
    `远端与分支都指向真正的发布落点。`
);
console.log(
  `  · 本门禁是静态的：不联网 ⇒ 远端在 GitHub 上被删/改名它看不见（那次靠人工 git ls-remote 查出来）。`
);
console.log(
  `  · 部署工作流 ${WORKFLOW} 的 push 触发分支：` +
    `${wf.state === "ok" ? `[${wf.branches.join(", ")}]` : wf.state}。`
);
console.log(
  `  · 工作流里的 action 全部钉到 commit SHA（tag 是可移动引用）；顶层 permissions 只读，` +
    `写权限只留在具体 job 上。`
);
