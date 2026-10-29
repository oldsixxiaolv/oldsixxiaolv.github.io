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
 *   DP7 部署工作流里 action 的**执行运行时**必须是 node24 ——
 *      action 跑在哪个 Node 上由**上游 action.yml 的 `runs.using`** 决定，
 *      不由本仓库决定 ⇒ 用老版本 = 把发布管线建在**已 EOL** 的运行时上
 *      （Node 20 已于 2026-04-30 结束支持）。
 *      口径是**离线静态**的（门禁不联网，CI 也没有网络依赖）：
 *      仓内一张「node24 底线表」（action → 允许的最低大版本）
 *      ＋ 一张「基线表」（action → 当前批准的 tag 与 SHA），
 *      后者是 DP7 的**版本预言机** —— 工作流里钉的 SHA 查它才知道跑在什么运行时上。
 *   DP8 部署工作流必须**串行化部署且不杀在途** ——
 *      `concurrency` 段必须存在（否则两次推送可能并发部署，
 *      旧的那次后到会把新的覆盖掉），且 `cancel-in-progress` 不得为 `true`
 *      （true ⇒ 新推送一到就把**正在跑的生产部署**杀掉，站点停在半更新状态，
 *      而那次 run 在 GitHub 上显示为 cancelled 而不是 failed ⇒ 没有失败告警）。
 *      官方 Pages 静态站点模板写的就是 false。
 *   DP9 每个 job 必须声明 `timeout-minutes` ——
 *      GitHub 的 job 默认上限是 **360 分钟**；配合 DP8 的「不杀在途」，
 *      一次挂死的部署能独占 concurrency group 六小时，
 *      期间的推送全被折叠成唯一一个 pending ⇒ 站点长时间不更新。
 *   DP12 **钉住的 SHA 必须有人替它往前推** ——
 *      `.github/dependabot.yml` 必须在，且必须覆盖 `github-actions` 与 `npm` 两个生态、
 *      每个生态都得有 `schedule`。
 *      为什么这条和 DP5 是**一对**：DP5 说「action 必须钉到 commit SHA」
 *      （tag 是可移动引用）⇒ 但 **GitHub 官方 secure-use 指南写明：action 钉到 SHA
 *      之后，Dependabot 的安全告警通道会静默**（告警只覆盖按语义化版本命名的 action）
 *      ⇒ 恰恰在采用了更强做法的时候，告警通道反而安静了。
 *      ⇒ 必须靠**版本更新**这条通道把「有人替我把 pin 往前推」自动化 ——
 *        **不是把 pin 放开**（放开就退回可移动引用了）。
 *      ⚠️ 四个子判据各自一条红因：
 *        ① **文件在不在**；
 *        ② **`version: 2` 在不在**（GitHub 认的是它；没有它**整份配置被忽略**
 *           ⇒ 文件在仓库里看着有，GitHub 侧一条都不会跑 —— 这就是
 *           「形状不对 ⇒ 恒绿」那一族：文件在，机制不在）；
 *        ③ **两个生态齐不齐 + 每个生态有没有 schedule**
 *           （没有 schedule 的条目**永远不会被检查** ⇒ 看着在配置里，实际一条都不跑）；
 *        ④ **每个生态的 `directory` 是不是 `/`**（清单在仓库根与 `.github/workflows`
 *           ⇒ 目录写错 ⇒ Dependabot 去别的目录找清单、找不到 ⇒ **一条都不跑**
 *           —— 与 ③ 同一种恒绿，2026-10-28 复核时补上）。
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
 *   · DP12 是**静态**的：它只确认「那份配置在、且覆盖了这两个生态」——
 *     **不能**确认 GitHub 侧 Dependabot 真的开着、也不会确认 PR 真的被开出来
 *     （这一格要真正确认，得去 GitHub 的 Dependabot 页面看有没有提过 PR）。
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

/* ---------------- DP5 / DP6 / DP7 / DP8 / DP9：部署工作流本身 ---------------- */

/**
 * **node24 底线表**：action 名 → 允许的**最低大版本**。
 *
 * 这张表记的是「哪个大版本开始把执行运行时换成 node24」这个**上游事实**，
 * 与本仓库当前钉在哪个版本**无关** ⇒ 有人降级版本并顺手改基线表骗不过它。
 *
 * 证据（2026-10-27 逐个拉上游 action.yml 看 `runs.using` 实测）：
 *   actions/checkout              v4=node20        v5 起 = node24
 *   actions/setup-node            v4=node20        v5 起 = node24
 *   actions/configure-pages       v5=node20        v6 起 = node24
 *   actions/upload-pages-artifact v3/v4=node20     v5 起 = node24（内层 upload-artifact v7）
 *                                 （v3/v4 是 composite，本身没有 `using:`，
 *                                   运行时由内层 upload-artifact 决定）
 *   actions/deploy-pages          v4=node20        v5 起 = node24
 *   actions/download-artifact     v4/v5/v6=node20  v7 起 = node24
 * Node 20 已于 **2026-04-30 结束支持（EOL）**，之后不再收安全更新
 * （nodejs/Release 的 schedule.json）。
 */
const NODE24_FLOOR = {
  "actions/checkout": 5,
  "actions/setup-node": 5,
  "actions/configure-pages": 6,
  "actions/upload-pages-artifact": 5,
  "actions/deploy-pages": 5,
  "actions/download-artifact": 7,
};

/**
 * **基线表**：action 名 → 当前批准的钉法（tag + 40 位 SHA）。
 *
 * 它是 DP7 的**版本预言机**：工作流里钉的 SHA 查这张表，才知道它对应哪个 tag、
 * 跑在哪个运行时上 ⇒ 这张表必须与工作流**逐字一致**（DP7c / DP7d 盯着）。
 *
 * ⚠️ 它与工作流是**两份副本**，副本对不上就判红 —— 这正是它存在的意义：
 *   「升级必须留一次有记录的提交」—— 改了 SHA 就得同步改表，
 *   而改表这件事本身就是审计痕迹（谁在什么时候把哪个 action 升到了哪一版）。
 *
 * 怎么升级：见 `.github/workflows/deploy.yml` 末尾「action 版本钉法」一节
 * （① tag→SHA 用 `git ls-remote` ② 逐版本实测 `runs.using`
 *  ③ 核对 input 兼容性 ④ 改工作流**并**改这张表 ⑤ 确认 commit 日期）。
 */
const PIN_BASELINE = {
  "actions/checkout": {
    tag: "v7",
    sha: "3d3c42e5aac5ba805825da76410c181273ba90b1",
  },
  "actions/setup-node": {
    tag: "v7",
    sha: "949feb2413d6458794dcd2491c4babbbce0c15c1",
  },
  "actions/configure-pages": {
    tag: "v6",
    sha: "45bfe0192ca1faeb007ade9deae92b16b8254a0d",
  },
  "actions/upload-pages-artifact": {
    tag: "v5",
    sha: "fc324d3547104276b827a68afc52ff2a11cc49c9",
  },
  "actions/deploy-pages": {
    tag: "v5",
    sha: "368f82528645a54fb793d4d04e342629a3f51346",
  },
  "actions/download-artifact": {
    tag: "v8",
    sha: "9000827ccba6bdab643e8b6fd33ac0654aef8333",
  },
};

/** 版本 tag 的大版本号（"v7" → 7）；认不出来返回 null。 */
function majorOf(tag) {
  const m = /^v?(\d+)/.exec(String(tag || ""));
  return m ? Number(m[1]) : null;
}

/**
 * 工作流**顶层**（列 0）的 concurrency 段。
 * 支持两种写法：
 *   块状：concurrency: / group: pages / cancel-in-progress: false
 *   行内：concurrency: {group: pages, cancel-in-progress: false}
 * 返回 { present, group, cancel, lineNo }。
 */
function topLevelConcurrency(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^concurrency[ \t]*:[ \t]*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const inline = m[1].trim();
    const entries = {};
    if (inline.startsWith("{")) {
      for (const part of inline.replace(/^\{/, "").replace(/\}$/, "").split(",")) {
        const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/.exec(part);
        if (kv) entries[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
      }
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        if (!/^[ \t]+\S/.test(lines[j])) break;
        const kv = /^\s*([A-Za-z0-9_-]+)\s*:\s*(.+?)\s*$/.exec(lines[j]);
        if (kv) entries[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
      }
    }
    return {
      present: true,
      group: entries.group || null,
      cancel: entries["cancel-in-progress"] === undefined ? null : entries["cancel-in-progress"],
      lineNo: i + 1,
    };
  }
  return { present: false, group: null, cancel: null, lineNo: null };
}

/**
 * 工作流里的 job 与它们的 `timeout-minutes`。
 * jobs 段在列 0，job 名在缩进 2，job 的键在缩进 4。
 */
function workflowJobs(text) {
  const lines = text.split("\n");
  const indentOf = (l) => (l.match(/^\s*/) || [""])[0].length;
  const jobsIdx = lines.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (jobsIdx < 0) return [];
  const base = indentOf(lines[jobsIdx]);
  const jobs = [];
  let cur = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOf(line);
    if (ind <= base) break; // 出了 jobs 段
    if (ind === base + 2) {
      const m = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:/.exec(line);
      if (m) {
        cur = { name: m[1], lineNo: i + 1, timeout: null };
        jobs.push(cur);
        continue;
      }
    }
    if (cur && ind === base + 4) {
      const m = /^[ \t]+timeout-minutes[ \t]*:[ \t]*(\S+)/.exec(line);
      if (m) cur.timeout = m[1];
    }
  }
  return jobs;
}

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
 *
 * 同时把**行尾注释里的版本 tag** 也读出来（DP7 用）：
 * 行尾注释写着 `# v7` 是给人看的版本号 ⇒ 它可能与 SHA 对不上（注释会撒谎），
 * 所以它只能当「候选」，真正的版本由基线表按 SHA 反查（见 PIN_BASELINE）。
 */
function actionRefs(text) {
  const out = [];
  const re = /^[ \t]*uses:[ \t]*(\S+)(?:[ \t]+#(.*))?$/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ref = m[1];
    const at = ref.lastIndexOf("@");
    const name = at >= 0 ? ref.slice(0, at) : ref;
    const sha = at >= 0 ? ref.slice(at + 1) : null;
    const comment = (m[2] || "").trim();
    const tagM = /^v?(\d+(?:\.\d+)*)$/.exec(comment);
    out.push({
      raw: ref,
      name,
      sha,
      comment,
      tag: tagM ? `v${tagM[1].split(".")[0]}` : null,
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

/* 汇总日志要用到的三组量：在块外声明，块内赋值（块内 const 会出作用域）。 */
let remoteRefs = [];
let conc = { present: false, group: null, cancel: null, lineNo: null };
let jobs = [];

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

  /* ---------------- DP7：action 的执行运行时必须是 node24 ---------------- */

  /* DP7 的版本预言机是**基线表**（按 SHA 反查 tag），
     底线表只回答「这个 action 最低要到哪个大版本才是 node24」。
     两者都离线 ⇒ 门禁不联网（CI 里也没有网络依赖）。 */
  /* DP7 只管**钉到 SHA** 的引用 —— 没钉 SHA 的由 DP5 负责（别把两条判据的红因
     搅在一起：DP5 报「没钉 SHA」，DP7 报「钉的这串字节跑在什么运行时上」）。 */
  remoteRefs = refs.filter((r) => r.kind === "remote" && r.pinned);
  const floorLow = [];
  const floorUnknown = [];
  const pinMismatch = [];
  const tagMismatch = [];
  for (const r of remoteRefs) {
    const base = PIN_BASELINE[r.name];
    const floor = NODE24_FLOOR[r.name];
    if (floor === undefined || !base) {
      /* 判不出它跑在什么运行时上 ⇒ 判红（判不了不等于没问题）。 */
      floorUnknown.push(r);
      continue;
    }
    /* 版本来源：**基线表**（按 SHA 反查，实际字节说了算）优先；
       SHA 不在基线表里时退回**行尾注释**（只是候选，它可能撒谎）——
       注释里的版本号低到 node20 底线以下 ⇒ 一律判红（宁可吵）。 */
    let tag = null;
    let src = null;
    if (r.sha === base.sha) {
      tag = base.tag;
      src = "baseline";
    } else if (r.tag) {
      tag = r.tag;
      src = "comment";
    }
    if (tag && majorOf(tag) < floor) {
      floorLow.push({ ref: r, tag, src, base, floor });
      continue;
    }
    if (r.sha !== base.sha) {
      /* 钉的字节与基线表登记的不一致 ⇒ 版本判不出来（行尾注释可能是错的）。 */
      pinMismatch.push({ ref: r, base });
      continue;
    }
    if (!r.tag) {
      tagMismatch.push({ ref: r, base, why: "行尾注释里没有可解析的版本 tag" });
    } else if (majorOf(r.tag) !== majorOf(base.tag)) {
      tagMismatch.push({ ref: r, base, why: `行尾注释写的是 ${r.comment}，而基线表里这串字节是 ${base.tag}` });
    }
  }
  if (floorLow.length) {
    fail(
      `DP7 有 ${floorLow.length} 个 action 的运行时低于 node24 底线：` +
        floorLow
          .map(
            (x) =>
              `${WORKFLOW}:${x.ref.lineNo} 的「${x.ref.raw}」（` +
              (x.src === "baseline"
                ? `基线表登记 ${x.tag}`
                : `行尾注释声称 ${x.tag}，而这串字节不在基线表里、版本判不准`) +
              `）—— node24 底线是 ${x.ref.name} ≥ v${x.floor}`
          )
          .join("；") +
        ` —— action 跑在哪个 Node 上由**上游 action.yml 的 runs.using** 决定，` +
        `低版本 = 跑在 **Node 20** 上，而 Node 20 已于 2026-04-30 结束支持（EOL），不再收安全更新。`
    );
  }
  if (floorUnknown.length) {
    fail(
      `DP7 有 ${floorUnknown.length} 个 action 判不出 node24 运行时：` +
        floorUnknown.map((r) => `${WORKFLOW}:${r.lineNo} 的「${r.raw}」`).join("；") +
        ` —— 它们不在门禁的「node24 底线表 / 基线表」里 ⇒ 无法确认它们跑在哪个 Node 上` +
        `（判不了不等于没问题）。请把该 action 登记进这两张表（先实测它的 runs.using）。`
    );
  }
  if (pinMismatch.length) {
    fail(
      `DP7 有 ${pinMismatch.length} 个 action 钉的 SHA 与基线表不一致：` +
        pinMismatch
          .map(
            (x) =>
              `${WORKFLOW}:${x.ref.lineNo} 的「${x.ref.raw}」（基线表登记 ${x.base.tag} = ${x.base.sha}）`
          )
          .join("；") +
        ` —— 升级必须**同时**改工作流与基线表（两份副本对不上就是没留记录）；` +
        `只改一边 ⇒ 这里判不出版本，也就判不出运行时。`
    );
  }
  if (tagMismatch.length) {
    fail(
      `DP7 有 ${tagMismatch.length} 个 action 行尾注释里的版本与基线表不一致：` +
        tagMismatch
          .map(
            (x) =>
              `${WORKFLOW}:${x.ref.lineNo} 的「${x.ref.raw}」—— ${x.why}`
          )
          .join("；") +
        ` —— 行尾注释是**给人看的**版本号，它与实际字节对不上时，读注释的人会被误导。`
    );
  }

  /* ---------------- DP8：部署必须串行化，且不杀在途 ---------------- */

  conc = topLevelConcurrency(wfText);
  if (!conc.present) {
    fail(
      `DP8 部署工作流没有 concurrency 段 —— 两次推送可能**并发部署**：` +
        `先开始的那次可能后结束，把**后开始**那次的产物覆盖掉（站点内容回退，` +
        `而且不报错）。concurrency 段必须存在（group + cancel-in-progress: false）。`
    );
  } else if (conc.cancel !== null && conc.cancel !== "false") {
    fail(
      `DP8 部署工作流第 ${conc.lineNo} 行的 cancel-in-progress 不是 false（是「${conc.cancel}」）—— ` +
        `true 意味着新推送一到就**杀掉正在跑的生产部署**：那次部署半途而废，` +
        `站点可能停在旧版本或不一致的中间态，而 run 在 GitHub 上显示为 cancelled 而不是 failed` +
        `（没有失败告警，最难发现）。官方 Pages 静态站点模板写的就是 false。` +
        `（写成 \${{ ... }} 表达式也不行：门禁静态看不见它在运行时求值成什么。）`
    );
  }

  /* ---------------- DP9：每个 job 都要有挂死兜底 ---------------- */

  jobs = workflowJobs(wfText);
  if (!jobs.length) {
    fail(
      `DP9 读不到任何 job —— 部署工作流里一个 job 都没有，「每个 job 有没有挂死兜底」这件事判不了，` +
        `要么工作流的 jobs 段写法变了（门禁要跟着更新），要么 job 被删光了。`
    );
  } else {
    const noTimeout = jobs.filter((j) => j.timeout === null);
    if (noTimeout.length) {
      fail(
        `DP9 有 ${noTimeout.length} 个 job 没有声明 timeout-minutes：` +
          noTimeout.map((j) => `${WORKFLOW}:${j.lineNo} 的「${j.name}」`).join("；") +
          ` —— GitHub 的 job 默认上限是 **360 分钟**；配合 DP8 的「不杀在途」，` +
          `一次挂死的部署能独占 concurrency group 六小时，期间的推送全被折叠成` +
          `唯一一个 pending ⇒ 站点长时间不更新。每个 job 都要写 timeout-minutes。`
      );
    }
  }
}

/* ---------------- DP10 / DP11：CI 的依赖安装方式与取包来源 ---------------- */

/** npm 官方源（CI 取包必须指向它）。 */
const OFFICIAL_NPM_REGISTRY = "https://registry.npmjs.org";

/**
 * 工作流里 npm 的 registry 配置。
 * 三种写法都吃：YAML `env:` 块、行内 shell 前缀、`npm config set`。
 * ⚠️ 扫**整份工作流**而不只扫某一步：YAML 的 `env` 可以挂在 workflow / job / step
 *   三级，任何一级设了都对该步骤生效 ⇒ 扫全文才是语义正确的口径。
 */
function npmRegistryConfig(text) {
  const registries = [];
  const replaces = [];
  const grab = (re, into) => {
    for (const m of text.matchAll(re)) into.push(m[1]);
  };
  grab(/NPM_CONFIG_REGISTRY\s*[:=]\s*["']?([^\s"'#]+)/g, registries);
  grab(/npm\s+config\s+set\s+registry\s+["']?([^\s"'#]+)/g, registries);
  grab(/NPM_CONFIG_REPLACE_REGISTRY_HOST\s*[:=]\s*["']?([^\s"'#]+)/g, replaces);
  grab(/npm\s+config\s+set\s+replace-registry-host\s+["']?([^\s"'#]+)/g, replaces);
  return { registries, replaces };
}

/** 工作流里跑 npm 安装的命令（只看 `run:` 行，正文里的说明不算）。 */
function npmInstallCommands(text) {
  const out = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const m = /^[ \t]*run:[ \t]*(.*)$/.exec(line);
    if (!m) return;
    for (const cmd of m[1].matchAll(/\bnpm\s+(ci|install)\b/g)) {
      out.push({ cmd: cmd[1], line: m[1].trim(), lineNo: i + 1 });
    }
  });
  return out;
}

if (wfText !== null) {
  const installs = npmInstallCommands(wfText);
  const usedInstall = installs.filter((x) => x.cmd === "install");
  const usedCi = installs.filter((x) => x.cmd === "ci");

  const dp10 = [];
  if (usedInstall.length) {
    dp10.push(
      `用了 npm install（${usedInstall.length} 处：${usedInstall.map((x) => x.line).join("；")}）—— ` +
        `npm install 会**绕过锁文件**去重新解析版本范围（还能顺手改写锁文件）⇒ ` +
        `构建不再可复现，一个未经审核的新版本会直接进入生产构建`
    );
  }
  if (!usedCi.length) {
    dp10.push(
      `找不到用 npm ci 安装依赖的步骤 —— 依赖安装必须走**锁文件安装**` +
        `（npm ci 严格按 package-lock.json 装，并逐个校验 integrity 哈希）`
    );
  }
  if (dp10.length) {
    fail(
      `DP10 CI 的依赖安装方式不对（${dp10.length} 处）：` + dp10.join("；") +
        ` —— 本仓的锁文件是「发出去的字节」的一部分，安装方式必须锁死。`
    );
  }

  const reg = npmRegistryConfig(wfText);
  const dp11 = [];
  if (!reg.registries.length) {
    dp11.push(
      `工作流里没有指定 npm registry —— 而锁文件里 **130 条 resolved 全部**指向 ` +
        `registry.npmmirror.com（本机用的第三方镜像）⇒ 不显式指定，GitHub 的 runner ` +
        `就会去那个第三方镜像取包（发布管线架在别人的可用性上）`
    );
  } else {
    const thirdParty = reg.registries.filter((r) => r !== OFFICIAL_NPM_REGISTRY);
    if (thirdParty.length) {
      dp11.push(
        `npm registry 指向了非官方源（${thirdParty.join("、")}）—— CI 取包必须指向 ` +
          `${OFFICIAL_NPM_REGISTRY}`
      );
    }
  }
  if (!reg.replaces.length) {
    dp11.push(
      `没有设 NPM_CONFIG_REPLACE_REGISTRY_HOST=always —— 光设 registry 不够：` +
        `npm 默认**照用锁文件里 resolved 的主机**（npm ≥ 8.3 才支持把它换成配置的 registry）`
    );
  } else if (!reg.replaces.includes("always")) {
    dp11.push(
      `NPM_CONFIG_REPLACE_REGISTRY_HOST 的值不是 always（是「${reg.replaces.join("、")}」）—— ` +
        `默认的 npmjs 只替换官方源的主机，改不动锁文件里指向第三方镜像的那 130 条`
    );
  }
  if (dp11.length) {
    fail(
      `DP11 CI 的取包来源不对（${dp11.length} 处）：` + dp11.join("；") +
        ` —— 换主机**不改内容**（integrity 哈希照旧校验），只是不让发布管线依赖第三方镜像。`
    );
  }
}

/* ---------------- DP12：钉住的 SHA 必须有人替它往前推 ---------------- */

/** Dependabot 配置文件（相对仓库根）。 */
const DEPENDABOT = ".github/dependabot.yml";
/** 必须覆盖的生态 —— action（钉在 SHA 上 ⇒ 告警通道静默）与 npm 依赖。 */
const DEPENDABOT_ECOSYSTEMS = ["github-actions", "npm"];
/** 解析结果（供汇总文案用；判红时不需要）。 */
let dbSummary = null;

/**
 * 解析 dependabot.yml —— 只取本门禁要判的四件事：
 *   `version: 2` 在不在、覆盖了哪些生态、每个生态有没有 `schedule.interval`、
 *   每个生态的 `directory` 是不是 `/`。
 *
 * ⚠️ **为什么不用 YAML 解析器**：本仓 package.json 没单列 js-yaml
 *   （它是 Eleventy 的传递依赖 ⇒ 幽灵依赖，另有事项登记）⇒ 这里用一个
 *   **只认本仓自己写的那份形状**的行扫描器。
 *   ⚠️ **读不懂的形状一律当成「不在」⇒ 判红（fail closed）** ——
 *   绝不能因为解析器读不懂就放行（那正是「形状错 ⇒ 恒绿」那一族）。
 *   代价：本门禁只认本仓自己写的那种扁平写法（每个生态一个 `- package-ecosystem:` 开头
 *   的条目，条目内缩进的 `directory:` / `schedule:` / `interval:`）。
 *   若以后改用 `groups:` / `multi-ecosystem:` 等高级写法，本门禁会**判红**
 *   —— 那是提醒「解析器要跟着升级」，不是误报。
 */
function parseDependabot(text) {
  const lines = text.split("\n");
  const entries = [];
  let cur = null;
  let versionOk = false;
  lines.forEach((line, i) => {
    const vm = /^version\s*:\s*["']?(\d+)["']?\s*$/.exec(line);
    if (vm) {
      if (vm[1] === "2") versionOk = true;
      return;
    }
    const em = /^\s*-\s*package-ecosystem\s*:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/.exec(line);
    if (em) {
      if (cur) entries.push(cur);
      cur = { eco: em[1], lineNo: i + 1, interval: null, dir: null };
      return;
    }
    if (!cur) return;
    const im = /^\s*interval\s*:\s*["']?([A-Za-z]+)["']?\s*$/.exec(line);
    if (im) cur.interval = im[1];
    const dm = /^\s*directory\s*:\s*["']?([^"'\s]+)["']?\s*$/.exec(line);
    if (dm) cur.dir = dm[1];
  });
  if (cur) entries.push(cur);
  return { versionOk, entries };
}

{
  const dbFile = path.join(ROOT, DEPENDABOT);
  if (!fs.existsSync(dbFile)) {
    fail(
      `DP12 缺少 dependabot 配置文件（${DEPENDABOT}）—— 本仓的 6 个 action 全部钉在 ` +
        `commit SHA 上（DP5 守着），而 GitHub 官方的 secure-use 指南写明：**action 钉到 ` +
        `SHA 之后，Dependabot 的安全告警通道会静默**（告警只覆盖按语义化版本命名的 action）` +
        `⇒ 恰恰在采用了更强做法的时候，告警通道反而安静了。必须靠**版本更新**这条通道，` +
        `把「有人替我把 pin 往前推」自动化（不是把 pin 放开）。`
    );
  } else {
    const db = parseDependabot(fs.readFileSync(dbFile, "utf8"));
    dbSummary = db;
    if (!db.versionOk) {
      fail(
        `DP12 dependabot 配置缺少 version: 2 —— GitHub 认的是 \`version: 2\`，` +
          `没有它**整份配置被忽略** ⇒ 配置在仓库里看着有，GitHub 侧**一条都不会跑**` +
          `（这是「形状不对 ⇒ 恒绿」那一族：文件在，机制不在）。`
      );
    }
    const missing = [];
    const noSchedule = [];
    const wrongDir = [];
    for (const eco of DEPENDABOT_ECOSYSTEMS) {
      const hits = db.entries.filter((e) => e.eco === eco);
      if (!hits.length) {
        missing.push(eco);
        continue;
      }
      for (const e of hits) {
        if (!e.interval) noSchedule.push(`${eco}（第 ${e.lineNo} 行那条）`);
        /* ⚠️ **directory 也得判**：清单在仓库根（package.json）与 `.github/workflows`
           ⇒ `directory` 必须是 `/`。写错目录 ⇒ Dependabot 去那个目录找清单，
           找不到就**一条都不跑** ⇒ 与「没有 schedule」同一种「看着在、实际不跑」的恒绿。 */
        if (e.dir !== "/") wrongDir.push(`${eco}（第 ${e.lineNo} 行那条：是「${e.dir || "没写"}」）`);
      }
    }
    if (missing.length) {
      fail(
        `DP12 dependabot 配置没有同时覆盖 github-actions 与 npm 两个生态（缺 ${missing.join("、")}）—— ` +
          `前者是「钉在 SHA 上的 action 有没有人推」，后者是「锁文件里那 130 个依赖的漏洞与更新` +
          `有没有人推」；少一个，那一维就回到「靠自觉」。`
      );
    }
    if (noSchedule.length) {
      fail(
        `DP12 dependabot 配置里 ${noSchedule.join("、")} 没有 schedule —— ` +
          `没有 schedule 的条目**永远不会被检查** ⇒ 它看着在配置里，实际一条都不会跑。`
      );
    }
    if (wrongDir.length) {
      fail(
        `DP12 dependabot 配置里 ${wrongDir.join("、")} 的 directory 不是 / —— ` +
          `清单在仓库根（package.json）与 \`.github/workflows\` ⇒ 目录必须是 \`/\`；` +
          `目录不对 ⇒ Dependabot 去那个目录找清单，找不到就**一条都不跑**` +
          `（与「缺 schedule」同一种恒绿：看着在配置里，实际不检查任何东西）。`
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
console.log(
  `  · action 的执行运行时全是 node24（Node 20 已于 2026-04-30 EOL）：` +
    `门禁按「node24 底线表 ＋ 基线表（按 SHA 反查版本）」离线核对，共核了 ${remoteRefs.length} 个已钉 SHA 的 action 引用。`
);
console.log(
  `  · concurrency：group=${conc.group || "（读不到）"}，` +
    `cancel-in-progress=${conc.cancel === null ? "（未写，默认 false）" : conc.cancel}` +
    ` —— 部署串行化，且不杀在途的生产部署。`
);
console.log(
  `  · 每个 job 都声明了 timeout-minutes（${jobs.length} 个 job）：` +
    `挂死的部署最多占住 concurrency group ${jobs.map((j) => j.timeout).join(" / ")} 分钟。`
);
if (dbSummary) {
  console.log(
    `  · ${DEPENDABOT} 在位，检出 ${dbSummary.entries.length} 个生态条目` +
      `（${dbSummary.entries.map((e) => `${e.eco}（dir=${e.dir || "无"}、interval=${e.interval || "无"}）`).join("、")}）` +
      `—— 钉住的 SHA 有人替它往前推（告警通道在 SHA 钉法下会静默，靠版本更新这条通道补）。`
  );
}
