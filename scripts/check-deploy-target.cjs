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
 *   DP6 **每个工作流**的**顶层** permissions 必须只读 ——
 *      顶层不写 = 用**仓库默认**的 token 权限（可能是 read-write）；
 *      顶层写 = **每个 job** 都持有（含跑完整条 build 链、也就是执行仓内代码的那个）。
 *      写权限要收窄到具体 job（deploy job 需要 `pages: write` + `id-token: write`，
 *      官方 deploy-pages 文档写明「执行部署的 job 至少需要这两个」）。
 *      口径对齐 **OpenSSF Scorecard 的 Token-Permissions 判据**（Risk: High）。
 *      ⚠️ **扫描面是 `.github/workflows/` 下的全部工作流**（2026-10-29 12:30 场次扩展）：
 *        此前只管 deploy.yml ⇒ 多出来的第二份工作流**顶层写权限零覆盖**（实测坐实）。
 *      ⚠️ **两种写法都必须认得**（官方 workflow-syntax 里都合法）：
 *        块式（`permissions:` 下面缩进列作用域）与**标量式**
 *        （`permissions: write-all` / `permissions: read-all`）。
 *        只认块式 ⇒ 顶层一个 `write-all` 就能把**每个 job** 变成全量写权限，
 *        而门禁**零红因**（2026-10-29 09:30 场次用隔离探针实测坐实过）
 *        ⇒ 那正是「形状漏判 ⇒ 恒绿」那一族。
 *      ⚠️ **读不懂的形状一律判红**（fail closed）—— 「判不了」≠「没有」。
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
 *      ⚠️ **声明了还不够，值必须小**（2026-10-29 15:30 场次补，隔离探针实测坐实）：
 *        此前 DP9 只判「有没有声明」⇒ 写 `timeout-minutes: 360`（正是 GitHub 的默认上限）
 *        照样判绿、exit 0 ⇒ **兜底等于没有兜底** ⇒ D104「不杀在途」这条取舍的前提
 *        被悄悄废掉（而那条取舍本身是有代价的，不该被一个数字悄悄取消）。
 *        ⇒ 同一个判据里补两条子判据（同一件事只让一条判据说话）：
 *          ① **值必须读得出是整数** —— `${{ ... }}` 之类静态读不出来 ⇒ fail closed；
 *          ② **值不得超过上限** —— 本仓的政策：60 分钟
 *             （比 GitHub 的 360 分钟上限小一个量级：一次挂死最多堵住发布管线一小时，
 *               而不是六小时；现有三个 job 分别 30 / 15 / 20 分钟，60 是最宽裕的余量）。
 *        ⚠️ 口径**只作用在部署工作流**（它才是 `concurrency: pages` 那个组的一员）：
 *          别的 workflow 挂死占的是它自己的机时，堵不住发布管线。
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
 *   DP13 **CI 里「不装依赖就执行」的脚本，require 链必须零第三方依赖** ——
 *      部署工作流的 `verify-live` job **没有 `npm ci` 步骤** ⇒ 那个 job 里
 *      **没有 node_modules** ⇒ 它执行的脚本若 require 了一个第三方包，
 *      会直接抛 "Cannot find module" ⇒ **部署后的线上核查整个跑不起来**
 *      （站点已经发上去了，核查却崩了；而且红因是一句看不懂的模块缺失）。
 *      本条扫的是「**没有 `npm ci` 的 job**」里的所有 node 调用
 *      （脚本文件与 `node -e` 内联代码都算），静态顺着 require 图往下走：
 *      只允许 **Node 内置模块** ＋ **仓内相对路径**。
 *      ⚠️ **「判不了」与「没有」必须分开**：require 的参数不是字面量
 *      （`require(name)`）⇒ 静态判不出来 ⇒ **判红**，不假装判过。
 *      ⚠️ 块标量（`run: |`）必须一起读：部署工作流里「等站点起来」那一步
 *      就是块标量 ⇒ 只看 `run:` 那一行会把它的内容整段漏掉（漏掉 ⇒ 那个 job
 *      看起来「没有 node 调用」⇒ 判据空转）。
 *   DP14 **「等站点起来」必须等的是「这次部署的内容」，不是「站点有响应」** ——
 *      部署完到域名真正生效有一段传播延迟（Pages 走 CDN 边缘）。
 *      ⚠️ **只探测 HTTP 状态码是不够的**：**旧部署也返回 200** ⇒ 等待循环
 *      第 1 次探测就退出 ⇒ 它**根本没等到新版本生效** ⇒ 核查门禁拿**旧内容**
 *      与**新产物**逐项比（L1 路由 / L2 canonical / L4 sitemap 路径集 / L6 feed）
 *      ⇒ **一次完全健康的部署可能让 CI 变红**（假红）。
 *      假红的代价不是「多报一次」，而是**训练人忽略 CI** ⇒ 整条门禁链失去价值。
 *      ⇒ 判据锚在**构建标记**上：产物 `_site/robots.txt` 里有一行
 *      `# generated-at: <ISO>`（每次构建都不同，由 eleventy.config.js 的
 *      buildStamp filter 在**构建那一刻**生成）⇒ 线上 robots.txt 的这一行
 *      与产物一致 ⇒ **线上跑的就是这次部署的内容**。
 *      五个子判据各自一条红因：
 *        ① **放行条件必须是「构建标记相等」** —— 等待步骤的 run 块里必须
 *           同时出现 `generated-at`（标记键）、`_site/robots.txt`（产物侧），
 *           **且必须有一侧不是从产物取的**（⚠️ 独立复核抓到的**高危假绿**：
 *           只比较「产物 vs 产物」的恒等式**根本不去线上取**，却能骗过
 *           前两条 ⇒ 等待步骤看着在等、其实没等）；
 *           ⚠️ **「有一侧不是从产物取的」还必须收紧成「构建标记本身不是从产物取的」**
 *           （2026-11-01 场次补）：原来那一条只判「这一步里**别处**还有一次
 *           去线上取 robots.txt」—— 而**取到的未必是构建标记**（例如取 TTL 的那一次）
 *           ⇒ 「拿产物跟产物比」的恒等比较可以躲在**别处还有一次线上取数**的背后，
 *           骗过它 ⇒ **高危假绿**。
 *           ⚠️ 这**不是假想**：本轮新增的「现读线上 TTL」**恰好就是第二次线上取
 *           robots.txt** ⇒ 等于**本轮自己给 DP14 造了一个新的假绿入口**
 *           ⇒ 必须同步收紧（否则新判据 DP20 与老判据 DP14 互相打洞）。
 *           收紧后的判法：**逐行**看提到 `generated-at` 的行 —— 只要**有一行**
 *           提到 `generated-at` 且**那一行不含 `_site/robots.txt`**，就说明标记
 *           是从**产物以外**提取的。
 *           ⚠️ **不要求同一行同时出现 `robots.txt`**：把线上正文先存进变量、
 *           下一行再提取标记，是同样合法的写法 ⇒ 按同行判会**假红**
 *           （自测里有一档「必须判绿」专门守这一条）；
 *        ② **收尾必须判红退出** —— 等待步骤的**最后一条非空命令**必须是
 *           `exit 1` ⇒ 它的结局只有两种：标记相等（成功）或预算耗尽（失败）。
 *           ⚠️ 不得静默继续：静默继续 ⇒ 旧站点的路由与 canonical 恰好一致时，
 *           核查门禁会**全绿** ⇒ 「这次部署没生效」变成**假绿**；
 *           ⚠️ **成功出口也必须存在**（只有 `exit 1` ⇒ 每次都走满等待预算才判红
 *           ⇒ 「部署没生效」这个结论会被脚本自身的错误伪装出来）；
 *        ③ **等待步骤必须在核查步骤之前** —— 顺序反了 ⇒ 核查照样跑在旧内容上；
 *        ④ **核查 job 里必须真的跑 `check-live-site.cjs`**（豁免登记里写着它是
 *           唯一自动调用点，而那只是一段理由文字 ⇒ 删掉那一步没有任何门禁会发现
 *           ⇒ 部署后的线上核查**静默停摆**）；
 *        ⑤ **等待步骤与核查步骤必须无条件执行、且失败不能被吞** —— 带 `if:`
 *           ⇒ 这一步可能**永远不执行**；带 `continue-on-error: true` ⇒ 它**失败
 *           也不会让 job 失败** ⇒ 两格都名存实亡（正是「把报警通道弄静默」那一族）。
 *      ⚠️ DP14 是**静态**的：它判的是「等待步骤的写法对不对」，
 *        **不能**证明 CDN 那一刻真的切过去了（那一格由 CI 实跑给出结论）。
 *
 *   DP15 **工作流的「触发事件类型」必须被守住** ——
 *      本仓的策略：**发布靠 push，手动跑靠 workflow_dispatch**，此外一律不许。
 *      ⚠️ 为什么这一格要有人守着（2026-10-29 场次实测的**看护缺口**）：
 *        全仓门禁逐条核对下来，DP 族**只核了 push 的分支过滤**（DP3：推的分支
 *        在不在触发分支里）—— **触发器的「集合」本身与「事件类型」本身，
 *        此前零门禁覆盖** ⇒ 当时体检干净（触发器确实只有 push main +
 *        workflow_dispatch）只是**那一刻的事实**，没有任何东西保证它继续是这样
 *        ⇒ 属「当前没事 ≠ 有东西保证它继续没事」这一族。
 *      为什么危险事件要单独点名（口径以 GitHub 官方文档为准，见下）：
 *        · pull_request_target —— ⚠️ **官方口径是「它默认是安全的」**：
 *          工作流文件取自**默认分支**，默认不执行 fork 的代码；风险来自作者
 *          **把 checkout 指向 PR 的头**（`ref: ${{ github.event.pull_request.head.sha }}`）
 *          或把 `repository:` 指向 fork ⇒ 那时 fork 的代码带着**仓库 secret 与写权限**
 *          跑起来 —— 官方把这种形态叫 **pwn request**，并写明它「是多起供应链失陷的根因」。
 *          ⇒ 本仓取**比官方默认更严**的口径：**直接不许这个事件类型** ——
 *          理由不是「它本身不安全」（那是错的），而是：本仓**没有需要它的场景**
 *          （没有 PR 工作流、没有要给 fork 跑测试），而**误用的代价不可逆**
 *          （fork PR 可改站点、读走 secret）。
 *        · workflow_run —— 官方明写：被它触发的工作流**即使前一个工作流没有权限**，
 *          也能拿到 secret 与写权限；官方对它标了 WARNING：跑不可信代码会导致
 *          **缓存投毒**与「意外获得写权限 / 读走 secret」。
 *      允许集之外的触发器（pull_request / schedule / repository_dispatch /
 *        issues / issue_comment …）同样判红：本仓没有 PR 工作流，多一个触发器
 *        就多一条「在你没预期的时机、用你没预期的上下文跑起来」的路。
 *        ⚠️ 官方口径：**pull_request** 触发时 token 是**只读**的、也不给别的 secret，
 *        还有 fork 审批策略 ⇒ 它比 pull_request_target 安全得多 —— 本条同样取
 *        **更严**的口径，理由同上（本仓不需要它，误用的代价是白烧 CI 与缓存投毒面）。
 *        ⚠️ **允许集是政策，写死在源码里**：将来真要加（例如待拍板 60 的
 *        周期性审计需要 schedule），必须**显式改这一行并在改进日志里记一笔** ——
 *        「悄悄加一个触发器」与「显式改政策」的区别，就是有没有人看见。
 *      三条红因各自一条：
 *        ① **危险事件类型**（pull_request_target / workflow_run）—— 任何工作流；
 *        ② **允许集之外的事件类型**；
 *        ③ **其余工作流读不出事件类型** ⇒ fail closed（判不了 ≠ 没有）。
 *           ⚠️ deploy.yml 那一份由 DP3 报（读不到触发分支）——
 *           **同一件事只让一条判据说话**。
 *
 *   DP16 **job 级 permissions 的写权限，只许留在真正需要它的那个 job 上** ——
 *      ⚠️ 为什么这一格此前**零门禁覆盖**（2026-10-29 场次**隔离探针实测**坐实）：
 *        DP6 只看**顶层** —— 给跑仓内代码的 job（build / verify-live）单独加
 *        `contents: write` / `pages: write` / `id-token: write`，门禁**零红因**。
 *        ⇒ 当时的「顶层是只读的」只是**顶层那一格**的事实，
 *        **没有任何东西保证写权限不会从 job 级漏进来** ⇒ 与 D125 / D126 同族。
 *      危害（三种写权限各自能干什么）：
 *        · `contents: write` ⇒ 那个 job 能**改仓库、推代码**（仓内代码 = 仓里可被改的代码）；
 *        · `pages: write` ⇒ 能**改线上站点**（自己发一次 Pages 部署）；
 *        · `id-token: write` ⇒ 能**铸造 OIDC JWT**，拿着仓库的身份去第三方云换凭据
 *          （官方 deploy-pages 文档写明它正是执行部署的 job 需要的那个 ⇒ 它也最值钱）。
 *      口径（本仓的**政策**，比上游默认更严，理由见下）：
 *        · **有资格持写权限的 job = 执行 Pages 部署的那个 job**
 *          （认它靠「步骤里用了 actions/deploy-pages」，**不靠 job 名字** ——
 *           改 job 名字不该让门禁失效，动了它也不该让权限悄悄放宽）；
 *        · 那个 job 里**只有 `pages` 与 `id-token` 两个作用域**能是 write。
 *      ⚠️ **为什么比上游默认更严**：官方只说「执行部署的 job **至少**需要
 *        `pages: write` + `id-token: write`」，**没有**说别的 job 一律不许拿写权限
 *        ⇒ 官方默认是「由作者负责收窄」。本仓取更严的口径，理由是
 *        **本仓没有需要它的场景，而误用的代价不可逆**（与 DP15 同一条理由）。
 *        ⇒ 与 DP15 一样，这是**政策、写死在源码里**：将来真要放宽，
 *        必须**显式改这一行并在改进日志里记一笔**。
 *      三条红因各自一条：
 *        ① **不该有的 job 拿了写权限** —— 不是执行部署的那个 job，却持 write；
 *        ② **执行部署的那个 job 拿了超出需要的写权限** —— 作用域不在 {pages, id-token} 内；
 *        ③ **job 级 permissions 的写法读不懂** ⇒ fail closed（判不了 ≠ 没有）。
 *      ⚠️ **顶层写权限归 DP6 管**（同一件事只让一条判据说话）：
 *        顶层 `write-all` ⇒ 每个 job 都继承 ⇒ 由 DP6 报，DP16 不重复报。
 *      ⚠️ **扫描面是 `.github/workflows/` 下的全部工作流**（与 DP15 同一口径）：
 *        多出来的第二份工作流同样不许拿写权限。
 *
 *   DP17 **checkout 不得把凭据留在工作区** ——
 *      `actions/checkout` 的 `persist-credentials` **默认是 true** ⇒ **令牌会被持久化**
 *      （上游 README 原文：「The auth token is persisted in the local git config. This enables
 *      your scripts to run authenticated git commands. The token is removed during post-job
 *      cleanup. Set \`persist-credentials: false\` to opt-out.」）
 *      ⇒ **那个 job 之后跑的任何代码**（依赖包的 postinstall 脚本、仓内 100+ 道门禁脚本、
 *      构建脚本）都能把它读走；job 收尾才清理。
 *      ⚠️ **存放位置随版本变**（本仓钉的是 checkout v7）：v6 起「persist-credentials now
 *      stores credentials in a separate file under \`$RUNNER_TEMP\` instead of directly in
 *      \`.git/config\`」⇒ 本条守的是「**要不要持久化**」，不是「存在哪个文件里」。
 *      危害随那个 job 的权限放大：本仓执行部署的 job 持 `pages: write` + `id-token: write`
 *      ⇒ 令牌落在那里 = 线上站点与 OIDC 身份一起交给了那个 job 里的任何代码。
 *      官方口径：不需要拿 token 做后续操作时就该关掉它（上游 README 的 `persist-credentials`
 *      输入默认就是 true，关掉是 opt-out）。
 *      ⇒ 本仓的 build 链只用**本地** git 读历史（git log / git rev-parse），
 *        不做任何需要鉴权的远端操作 ⇒ 关掉零影响。
 *      ⚠️ **这一格此前零门禁覆盖**（2026-10-29 15:30 场次隔离探针实测坐实）：
 *        工作流里本来就写着 `persist-credentials: false`（还带注释解释），
 *        但**把那行删掉，门禁零红因、exit 0** ⇒ 属「当前没事 ≠ 有东西保证它继续没事」。
 *      两条红因各自一条：
 *        ① **凭据被留在了工作区** —— 没写（默认 true）或显式写 true；
 *        ② **写法读不出来** —— `${{ ... }}` 之类静态判不出 ⇒ fail closed。
 *      ⚠️ **扫描面是 `.github/workflows/` 下的全部工作流**（与 DP6 / DP15 / DP16 同一口径）。
 *
 *   DP18 **线上核查必须在依赖链上晚于执行部署的那个 job** ——
 *      豁免登记（`scripts/check-gates-wired.cjs` 的 EXEMPT）里写明：
 *      「它的正确位置是**部署之后**：deploy.yml 的 verify-live job（needs: deploy）
 *      是唯一的自动调用点」—— 但那句话**此前没有任何门禁守着**。
 *      ⚠️ **这一格此前零门禁覆盖**（2026-10-29 18:30 场次隔离探针实测坐实）：
 *        把核查步骤（等待 + 核查）整体挪进 **build job** ⇒ 门禁**零红因、exit 0**，
 *        而且它还**正向确认**「部署后的线上核查跑在这次部署的内容上」—— **一句假话**。
 *        把 verify-live 的 `needs: deploy` 改成 `needs: build` ⇒ 同样零红因。
 *      ⇒ 危害不是「多报一次」：核查挪到部署之前 ⇒ 等待步骤等满 600 秒才判红 ⇒
 *        **build job 失败 ⇒ deploy job 被跳过 ⇒ 站点从此不再更新**；
 *        而红因写的是「线上没切到这次部署的内容」⇒ **把工作流写错误报成 CDN 问题**。
 *      判据：跑 `check-live-site.cjs` 的那个 job，其 `needs:`（直接或间接）必须包含
 *      执行 Pages 部署的那个 job（认它靠步骤里用了 `actions/deploy-pages`，**不靠 job 名字** ——
 *      与 DP16 同一口径，两处共用同一个识别函数）。
 *      两条红因各自一条：
 *        ① **needs 依赖链里没有执行部署的那个 job**（含「核查与部署挤在同一个 job 里」）；
 *        ② **needs 依赖链读不出来** ⇒ fail closed（判不了 ≠ 没有）。
 *      ⚠️ **前提不在场就不判**：认不出部署 job ⇒ DP16 报；认不出核查 job ⇒ DP14 报
 *        —— **同一件事只让一条判据说话**。
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
 *   · DP13 是**静态**的：它判的是「require 链里有没有第三方包」。
 *     它**不执行**那些脚本 ⇒ 「实际在 CI 里跑起来会不会崩」这一格它证不了；
 *     它能证的是「在那个 job 里没有 node_modules 的前提下，这些脚本**不可能**
 *     需要第三方包」—— 需要 ⇒ 必然崩。
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
      /* ⚠️ **整行取值，不要只取第一个词**：`timeout-minutes: ${{ matrix.minutes }}`
       *   带空格，只取 `(\S+)` 会拿到 `${{` —— 读不出来与读成别的东西是两回事，
       *   红因文案必须让人一眼看出原值是什么。 */
      const m = /^[ \t]+timeout-minutes[ \t]*:[ \t]*(.*)$/.exec(line);
      if (m) cur.timeout = stripYamlComment(m[1]).trim();
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
 * 去掉一行里的 YAML 注释（`#` 只有在行首、或前面是空白时才算注释的开头）。
 * 引号里的 `#` 不算注释。
 */
function stripYamlComment(s) {
  let inS = false;
  let inD = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === "#" && !inS && !inD && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

/** 一行文本的缩进宽度。 */
function indentOfLine(l) {
  return (l.match(/^\s*/) || [""])[0].length;
}

/**
 * 读第 idx 行上的 permissions 声明（块式 / 流式 / 标量）。
 *
 * 返回 { present, form, scalar, entries, declLineNo }：
 *   form: "block"（下面缩进列作用域）/ "flow"（{a: b} 流式映射）/
 *         "scalar"（read-all / write-all）/ "unknown"（读不懂的形状）
 *   entries: [{ scope, value, lineNo }] —— block/flow 才有
 *
 * ⚠️ **块的边界按缩进判**（续行必须比声明行更深）：
 *   否则 job 级的 permissions 块会把紧随其后的 `steps:` 也吃进去
 *   ⇒ 那个键的值为空 ⇒ 被判成「读不懂」⇒ **假红**。
 * ⚠️ **标量写法必须一起认**（官方 workflow-syntax 里都合法）：
 *   `permissions: write-all` / `permissions: read-all` —— 只认块式的话，
 *   顶层一个 `write-all` 就能把每个 job 变成全量写权限，而门禁零红因
 *   （2026-10-29 场次用隔离探针实测坐实过这个漏判）。
 */
function readPermissionsAt(lines, idx) {
  const declIndent = indentOfLine(lines[idx]);
  /* ⚠️ 去掉「键名 + 冒号」那段前缀，只留**值**：
     `permissions: write-all` 的值是 write-all，不是 "permissions: write-all"。 */
  const raw = lines[idx].replace(/^[ \t]*[A-Za-z0-9_-]+[ \t]*:[ \t]*/, "");
  const inline = stripYamlComment(raw).trim();
  if (inline) {
    if (inline.startsWith("{")) {
      return {
        present: true,
        form: "flow",
        scalar: null,
        entries: parseFlowPermissions(inline, idx + 1),
        declLineNo: idx + 1,
      };
    }
    const scalar = inline.replace(/^["']|["']$/g, "").trim();
    if (scalar === "read-all" || scalar === "write-all") {
      return { present: true, form: "scalar", scalar, entries: [], declLineNo: idx + 1 };
    }
    return { present: true, form: "unknown", scalar, entries: [], declLineNo: idx + 1 };
  }
  const entries = [];
  for (let j = idx + 1; j < lines.length; j++) {
    const line = lines[j];
    if (!line.trim()) continue;
    if (indentOfLine(line) <= declIndent) break; // 出了这个块
    const m = /^[ \t]*([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!m) {
      entries.push({ scope: null, value: null, lineNo: j + 1 });
      continue;
    }
    entries.push({
      scope: m[1],
      value: stripYamlComment(m[2]).trim().replace(/^["']|["']$/g, ""),
      lineNo: j + 1,
    });
  }
  return { present: true, form: "block", scalar: null, entries, declLineNo: idx + 1 };
}

/** 流式映射 `{contents: read, pages: write}` 拆成条目。 */
function parseFlowPermissions(inline, lineNo) {
  const body = inline.replace(/^\{/, "").replace(/\}\s*$/, "");
  const out = [];
  for (const part of body.split(",")) {
    const t = part.trim();
    if (!t) continue;
    const m = /^([A-Za-z0-9_-]+)[ \t]*:[ \t]*(.*)$/.exec(t);
    if (!m) {
      out.push({ scope: null, value: null, lineNo });
      continue;
    }
    out.push({
      scope: m[1],
      value: stripYamlComment(m[2]).trim().replace(/^["']|["']$/g, ""),
      lineNo,
    });
  }
  return out;
}

/**
 * 工作流**顶层**（列 0）的 permissions 声明。
 * present=false ⇒ **顶层根本没写 permissions** ⇒ GitHub 用**仓库默认**的
 *   token 权限（可能是 read-write）⇒ 那才是真的没设防。
 */
function topLevelPermissions(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^permissions[ \t]*:/.test(lines[i])) continue;
    return readPermissionsAt(lines, i);
  }
  return { present: false, form: "none", scalar: null, entries: [], declLineNo: null };
}

/** permissions 的取值只有这三种（官方语义：read / write / none）。 */
const PERM_VALUES = new Set(["read", "write", "none"]);

/**
 * 一处 permissions 声明里「哪些作用域是 write」「哪些读不懂」。
 * 返回 { unreadable: [条目], writes: [{ scope, lineNo, label }] }。
 *
 * ⚠️ **「读不懂」与「没有」必须分开**（判不了 ≠ 没有）：
 *   形状不认识、作用域名不认识、取值不是 read/write/none ⇒ 一律进 unreadable。
 */
function inspectPermissions(perms) {
  const unreadable = [];
  const writes = [];
  if (perms.form === "scalar") {
    if (perms.scalar === "write-all") {
      writes.push({ scope: "*", lineNo: perms.declLineNo, label: "write-all（全部作用域都写）" });
    }
    return { unreadable, writes };
  }
  if (perms.form === "unknown") {
    /* ⚠️ 形状本身读不懂 ⇒ 一律进 unreadable（判不了 ≠ 没有）。 */
    unreadable.push({ scope: null, value: null, lineNo: perms.declLineNo });
    return { unreadable, writes };
  }
  for (const e of perms.entries) {
    if (!e.scope || !e.value || !PERM_VALUES.has(e.value)) {
      unreadable.push(e);
      continue;
    }
    if (e.value === "write") {
      writes.push({ scope: e.scope, lineNo: e.lineNo, label: e.scope });
    }
  }
  return { unreadable, writes };
}

/**
 * `.github/workflows/` 下的全部工作流文件（DP6 / DP15 / DP16 共用这一份清单）。
 *
 * ⚠️ **必须跳过 macOS 的 AppleDouble 资源叉**（`._*`）与 `.DS_Store`：
 *   本仓的工作卷是 exFAT ⇒ 每次外部编辑都会在旁边留下一个 `._deploy.yml`
 *   （它是**资源分叉**，不是工作流）⇒ 不跳过的话，本机判红、干净克隆（CI）判绿
 *   ⇒ **同一个仓库在两个平台给出相反结论**（D119 那条「判定与运行环境无关」）。
 * ⚠️ 目录不存在 ⇒ 返回空数组（DP3 会报「读不到触发分支」，不重复报）。
 */
function listWorkflowFiles() {
  const dir = path.join(ROOT, ".github", "workflows");
  const out = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (e.name.startsWith("._")) continue;
      if (e.name === ".DS_Store") continue;
      if (!/\.ya?ml$/i.test(e.name)) continue;
      out.push({ name: e.name, rel: `.github/workflows/${e.name}` });
    }
  } catch (_) {
    /* 目录不存在 ⇒ 空列表（由 DP3 报「读不到触发分支」，同一件事只让一条判据说话）。 */
  }
  return out;
}

/* 汇总日志要用到的几组量：在块外声明，块内赋值（块内 const 会出作用域）。 */
let remoteRefs = [];
let conc = { present: false, group: null, cancel: null, lineNo: null };
let jobs = [];
/* ⚠️ `refs` 也要在外面声明 —— DP6 那段被拆成了独立的顶层段落，
   于是 DP5 里定义的 `refs` 不再与 DP7 同处一个块（否则 DP7 拿不到它）。 */
let refs = [];

if (wfText !== null) {
  refs = actionRefs(wfText);
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

}

/* ---------------- DP6：每个工作流的顶层 permissions 必须只读 ---------------- */

/**
 * 顶层 permissions 的判定 —— **每个工作流都要过这一关**（不止 deploy.yml）。
 *
 * ⚠️ **为什么扩到全部工作流**（2026-10-29 12:30 场次实测的看护缺口）：
 *   DP6 此前只看 deploy.yml ⇒ **多出来的第二份工作流**的顶层权限**零门禁覆盖** ——
 *   给它写 `permissions: write-all`，门禁 exit 0、零红因 ⇒ 那把「隐形全量写权限」
 *   就从**新入口**溜进来了（与 D127 的 job 级缺口同一族：入口不止一个）。
 *   ⇒ 顶层不写 = 用**仓库默认**的 token 权限（可能是 read-write）⇒ 漏写 =
 *   那个工作流里的每个 job 都握着写权限 ⇒ **不能只对一份工作流设防**。
 * ⚠️ **官方口径**（GitHub Docs「Security hardening for GitHub Actions」）：
 *   「It's good security practice to set the default permission for the GITHUB_TOKEN
 *   to read access only for repository contents. The permissions can then be increased,
 *   as required, for individual jobs within the workflow file.」
 *   ⇒ 本条正是那句话的**机器可核对版**：顶层只读 ＋ 写权限按 job 放开（DP16）。
 * ⚠️ **比上游默认更严的地方**：官方是**建议**；本仓**要求每个工作流都显式声明**顶层
 *   permissions（哪怕写 `permissions: read-all` 或 `permissions: {}`）⇒ 理由与 DP15/DP16
 *   同一条：**本仓没有需要它的工作流，而漏写的代价不可逆**（默认权限可能是 read-write）。
 *   ⇒ 这是**政策、写死在源码里**：将来放宽必须**显式改并在改进日志里记一笔**。
 */
/* DP6 查到的量（供汇总文案用；判红时不需要）。 */
let dp6Workflows = 0;

for (const wfFile of listWorkflowFiles()) {
  const text = fs.readFileSync(path.join(ROOT, ".github", "workflows", wfFile.name), "utf8");
  dp6Workflows++;
  const perms = topLevelPermissions(text);
  if (!perms.present) {
    fail(
      `DP6 ${wfFile.rel} 的顶层没有 permissions 声明 —— 顶层不写就是用**仓库默认**的 token 权限，` +
        `而仓库默认可能是 read-write ⇒ 那个工作流里的每个 job 都握着一把能改仓库的钥匙。` +
        `顶层至少要写 contents: read（写权限只给真正需要的 job）。`
    );
    continue;
  }
  const insp = inspectPermissions(perms);
  if (insp.unreadable.length) {
    fail(
      `DP6 ${wfFile.rel} 的顶层 permissions 的写法读不懂（${insp.unreadable.length} 处）：` +
        insp.unreadable.map((e) => `${wfFile.rel}:${e.lineNo}`).join("；") +
        ` —— **「判不了」不等于「没有」** ⇒ 顶层到底给了哪些权限判不出来 ⇒ 判红。` +
        `顶层只能写块式（permissions: 下面缩进列作用域）或官方那两种标量` +
        `（read-all / write-all）；读不懂就得改门禁，不能绕过去。`
    );
    continue;
  }
  if (insp.writes.length) {
    fail(
      `DP6 ${wfFile.rel} 的顶层给了写权限（${insp.writes.length} 处）：` +
        insp.writes.map((w) => `${wfFile.rel}:${w.lineNo} 的「${w.label}」`).join("；") +
        ` —— 顶层写权限 = **每个 job** 都持有（含跑完整条 build 链、也就是执行仓内代码的那个）。` +
        `写权限要收窄到具体 job（deploy job 需要 pages: write + id-token: write）。`
    );
  }
}

/* ---- 回到「部署工作流本身」这一组 ---- */
if (wfText !== null) {
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

  /* ⚠️ **兜底值必须小**（本仓的政策）：GitHub 的 job 默认上限是 360 分钟；
   *   D104 选了「不取消在途的生产部署」⇒ 一次挂死的 job 能一直占着
   *   `concurrency: pages` 那个组 ⇒ 兜底值就是这条取舍的**唯一刹车**。
   *   刹车写成 360 分钟 = 没写 ⇒ 写死 60 分钟（现有 job 是 30 / 15 / 20）。 */
  const MAX_TIMEOUT_MINUTES = 60;

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
    /* ⚠️ **声明了还不够，值必须读得出、且必须小**（2026-10-29 15:30 场次补）：
     *   此前 DP9 只判「有没有声明」⇒ `timeout-minutes: 360` 照样判绿 ⇒
     *   **兜底等于没有兜底** ⇒ D104「不杀在途」这条取舍的前提被悄悄废掉。 */
    const unreadTimeout = [];
    const tooBigTimeout = [];
    for (const j of jobs) {
      if (j.timeout === null) continue; // 上面那条已经报过了
      const v = Number(j.timeout);
      if (!Number.isInteger(v) || v <= 0) {
        unreadTimeout.push(j);
        continue;
      }
      if (v > MAX_TIMEOUT_MINUTES) tooBigTimeout.push(j);
    }
    if (unreadTimeout.length) {
      fail(
        `DP9 有 ${unreadTimeout.length} 个 job 的 timeout-minutes 的值读不出来：` +
          unreadTimeout
            .map((j) => `${WORKFLOW}:${j.lineNo} 的「${j.name}」（${j.timeout}）`)
            .join("；") +
          ` —— **「判不了」不等于「没有」**：门禁静态读不出它运行时求值成多少分钟，` +
          `就没法确认这个兜底够不够小 ⇒ 只能当成「可能没有刹车」来报。`
      );
    }
    if (tooBigTimeout.length) {
      fail(
        `DP9 有 ${tooBigTimeout.length} 个 job 的 timeout-minutes 超过上限（${MAX_TIMEOUT_MINUTES} 分钟）：` +
          tooBigTimeout
            .map((j) => `${WORKFLOW}:${j.lineNo} 的「${j.name}」（${j.timeout} 分钟）`)
            .join("；") +
          ` —— 配合 DP8 的「不杀在途」，timeout-minutes 就是这条取舍的**唯一刹车**：` +
          `写成一个挡不住事的大数（GitHub 的默认上限是 360 分钟）= 没写刹车 ⇒ ` +
          `一次挂死的 job 能占住 \`concurrency: pages\` 那个组六小时，` +
          `期间的推送全被折叠成唯一一个 pending ⇒ 站点长时间不更新。`
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

/* ---------------- DP13：CI 里「不装依赖就执行」的脚本必须零第三方依赖 ---------------- */

/**
 * 工作流里每个 job 的 `run:` 步骤。
 * ⚠️ **必须处理 YAML 的块标量**（`run: |`）：部署工作流里
 *   「等站点起来」那一步就是块标量 ⇒ 只看 `run:` 那一行会把它的内容整段漏掉
 *   （漏掉 ⇒ 那个 job 看起来「没有 node 调用」⇒ 判据空转）。
 *
 * ⚠️ 每一步还带出两个**决定「它会不会跑、失败了算不算数」**的键：
 *   `if:`（条件）与 `continue-on-error:`（吞不吞失败）。
 *   独立复核抓到的高危假绿就靠它们现形：一个带 `if: false` 的核查步骤
 *   **永远不执行**，而门禁若只认「这一步的 run 里提到了那个脚本」⇒ 判绿。
 *   ⇒ 这两个键必须**按步骤块**归属（不能扫整份工作流，否则别处的 `if:` 连坐）。
 */
function workflowRunSteps(text) {
  const lines = text.split("\n");
  const indentOf = (l) => (l.match(/^\s*/) || [""])[0].length;
  const jobsIdx = lines.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (jobsIdx < 0) return [];
  const base = indentOf(lines[jobsIdx]);
  const steps = [];
  let job = null;
  /* 步骤标记（`- name:` / `- uses:` / `- run:` 那一行的 `-`）。 */
  const STEP_MARK_RE = /^[ \t]*-[ \t]/;
  /** 一个步骤块（[from, to)）里的 `if:` 与 `continue-on-error:`。 */
  const stepGuardOf = (from, to) => {
    let ifCond = null;
    let continueOnError = null;
    for (let k = from; k < to; k++) {
      const mIf = /^[ \t]*if:[ \t]*(.*)$/.exec(lines[k]);
      if (mIf) {
        ifCond = (ifCond === null ? "" : ifCond + " ") + mIf[1].trim();
        continue;
      }
      const mCo = /^[ \t]*continue-on-error:[ \t]*(.*)$/.exec(lines[k]);
      if (mCo) continueOnError = mCo[1].trim().toLowerCase();
    }
    return { ifCond, continueOnError };
  };
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOf(line);
    if (ind <= base) break; // 出了 jobs 段
    if (ind === base + 2) {
      const m = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:/.exec(line);
      if (m) {
        job = m[1];
        continue;
      }
    }
    const rm = /^[ \t]*run:[ \t]*([|>][-+]?)?[ \t]*(.*)$/.exec(line);
    if (!rm || !job) continue;
    let cmd = rm[2] || "";
    /* 这一步的 `run:` 块结束于哪一行（块标量才有；单行就是它自己）。 */
    let end = i;
    if (rm[1]) {
      /* 块标量：收集后续缩进更大的行直到出块 */
      const body = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const bl = lines[j];
        if (!bl.trim()) {
          body.push("");
          continue;
        }
        if (indentOf(bl) <= ind) break;
        body.push(bl.trim());
      }
      cmd = body.join("\n");
      end = j - 1;
    }
    /* 步骤块的范围：从本步骤的 `- ` 标记，到下一个 `- ` 标记（或 job 末尾）。 */
    let start = i;
    while (start > jobsIdx && !STEP_MARK_RE.test(lines[start])) start--;
    let stop = end + 1;
    while (stop < lines.length && !STEP_MARK_RE.test(lines[stop])) stop++;
    const g = stepGuardOf(start, stop);
    steps.push({
      job,
      lineNo: i + 1,
      cmd,
      ifCond: g.ifCond,
      continueOnError: g.continueOnError,
    });
  }
  return steps;
}

/**
 * 跑线上核查的那一步（认它靠步骤的命令里出现了 check-live-site.cjs）。
 * DP14 与 DP18 共用这一处识别 —— **同一件事只认一处**。
 */
function liveCheckStepOf(runSteps) {
  const checkSteps = runSteps.filter((s) => /check-live-site\.cjs/.test(s.cmd));
  return checkSteps.length ? checkSteps[0] : null;
}

/** 一条 run 命令里会执行的 node：脚本文件与内联代码。 */
function nodeInvocations(cmd) {
  const out = [];
  for (const m of cmd.matchAll(/(?:^|[\s;&|(`])node\s+([^\s;&|`)]+)/g)) {
    if (m[1].startsWith("-")) continue; // -e / --version 之类
    out.push({ kind: "file", path: m[1] });
  }
  for (const m of cmd.matchAll(/node\s+-e\s+(['"])([\s\S]*?)\1/g)) {
    out.push({ kind: "inline", code: m[2] });
  }
  return out;
}

/** Node 内置模块名单（权威来源是运行时自己，不是手抄的清单）。 */
const NODE_BUILTINS = new Set(require("module").builtinModules.map((m) => m.replace(/^node:/, "")));

/**
 * 静态解析一个仓内文件的 require 图。
 * 返回 { thirdParty: [{ spec, from }], unresolvable: [{ expr, from }] }。
 *
 * ⚠️ **能解析的形态只有两种**（其余一律记进 unresolvable ⇒ 判红）：
 *   ① `require("字面量")`；
 *   ② `require(path.join(ROOT, "字面量"))` —— 本仓 `check-live-site.cjs` 就是这种。
 * ⚠️ 「判不了」与「没有」必须分开 ⇒ 解析不了的**不许**当成"没有第三方依赖"。
 */
function requireGraph(root, startFile) {
  const thirdParty = [];
  const unresolvable = [];
  const seen = new Set();
  const rel = (f) => path.relative(root, f) || path.basename(f);

  const visit = (abs) => {
    if (seen.has(abs)) return;
    seen.add(abs);
    if (!fs.existsSync(abs)) {
      unresolvable.push({ expr: rel(abs), from: rel(abs) });
      return;
    }
    const src = fs.readFileSync(abs, "utf8");
    const total = (src.match(/require\s*\(/g) || []).length;
    let resolved = 0;

    const specs = [];
    for (const m of src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
      specs.push({ spec: m[1], base: "file" });
    }
    for (const m of src.matchAll(
      /require\(\s*path\.join\(\s*ROOT\s*,\s*["']([^"']+)["']\s*\)\s*\)/g
    )) {
      /* `path.join(ROOT, …)` 是**相对仓库根**的，不是相对当前文件 ⇒ base 不同。 */
      specs.push({ spec: "./" + m[1], base: "root" });
    }
    resolved = specs.length;

    for (const { spec, base } of specs) {
      const bare = spec.replace(/^node:/, "");
      if (NODE_BUILTINS.has(bare)) continue;
      if (spec.startsWith(".")) {
        const from = base === "root" ? root : path.dirname(abs);
        visit(path.resolve(from, spec));
        continue;
      }
      thirdParty.push({ spec, from: rel(abs) });
    }
    if (total > resolved) {
      unresolvable.push({
        expr: "有一个 require 的参数不是字面量",
        from: rel(abs),
      });
    }
  };

  visit(path.resolve(root, startFile));
  return { thirdParty, unresolvable };
}

/* ---------------- DP13：不装依赖就执行的脚本，require 链必须零第三方依赖 ---------------- */

/** DP13 查到的「没有 npm ci 的 job 里执行的 node 脚本」（供汇总文案用）。 */
let dp13Checked = [];

if (wfText !== null) {
  const runSteps = workflowRunSteps(wfText);
  const jobsWithInstall = new Set(
    runSteps.filter((s) => /\bnpm\s+ci\b/.test(s.cmd)).map((s) => s.job)
  );

  /* 收集「没有 `npm ci` 的 job」里会执行的 node 脚本。 */
  const noInstallTargets = [];
  for (const s of runSteps) {
    if (jobsWithInstall.has(s.job)) continue;
    for (const inv of nodeInvocations(s.cmd)) {
      if (inv.kind === "file") {
        noInstallTargets.push({
          job: s.job,
          lineNo: s.lineNo,
          label: inv.path,
          file: inv.path,
        });
      } else {
        /* 内联代码里的 require：相对路径按**仓库根**解（node -e 的 cwd 就是仓库根）。 */
        for (const m of inv.code.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
          noInstallTargets.push({
            job: s.job,
            lineNo: s.lineNo,
            label: `node -e 里的 require("${m[1]}")`,
            file: m[1].startsWith(".") ? m[1] : null,
            spec: m[1],
          });
        }
      }
    }
  }

  const dp13ThirdParty = [];
  const dp13Unknown = [];
  for (const t of noInstallTargets) {
    dp13Checked.push(`${t.label}（${t.job} job）`);
    if (t.spec && !t.spec.startsWith(".")) {
      const bare = t.spec.replace(/^node:/, "");
      if (!NODE_BUILTINS.has(bare)) {
        dp13ThirdParty.push({ spec: t.spec, from: `${t.label}（${t.job} job 第 ${t.lineNo} 行）` });
      }
      continue;
    }
    const g = requireGraph(ROOT, t.file);
    for (const x of g.thirdParty) {
      dp13ThirdParty.push({ spec: x.spec, from: `${x.from}（经 ${t.label}）` });
    }
    for (const x of g.unresolvable) {
      dp13Unknown.push({ expr: x.expr, from: `${x.from}（经 ${t.label}）` });
    }
  }

  if (dp13ThirdParty.length) {
    fail(
      `DP13 有 ${dp13ThirdParty.length} 处第三方依赖出现在**没有 \`npm ci\` 的 job** 里跑的脚本上：` +
        dp13ThirdParty.map((x) => `「${x.spec}」（${x.from}）`).join("、") +
        ` —— 那个 job 里**没有 node_modules** ⇒ 这条 require 会直接抛 ` +
        `"Cannot find module" ⇒ 部署后的线上核查**整个跑不起来**（站点已经发上去了，核查却崩了）。`
    );
  }
  if (dp13Unknown.length) {
    fail(
      `DP13 有 ${dp13Unknown.length} 处 require 的参数不是字面量，无法静态判定它是不是第三方依赖：` +
        dp13Unknown.map((x) => `（${x.from}：${x.expr}）`).join("、") +
        ` —— **「判不了」不等于「没有」** ⇒ 那个 job 里没有 node_modules，` +
        `静态判不出来就必须当成「可能有」来报。`
    );
  }
}

/* ---------------- DP14：「等站点起来」必须等的是这次部署的内容 ---------------- */

/** DP14 查到的两个步骤（供汇总文案用）。 */
let dp14WaitStep = null;
let dp14CheckStep = null;

if (wfText !== null) {
  const runSteps = workflowRunSteps(wfText);
  const jobList = workflowJobs(wfText);

  /* 跑线上核查的那一步 —— 它的 job 就是「核查 job」。 */
  const checkStep = liveCheckStepOf(runSteps);
  const checkJob = checkStep ? checkStep.job : null;

  /* 「按构建标记放行」的等待步骤的判据：
   *   ① 出现 `generated-at`（构建标记的键）；
   *   ② 出现 `_site/robots.txt`（**产物侧**：标记要从本次部署的产物里取）；
   *   ③ **必须有一侧不是从产物取的** —— 去掉所有 `_site/robots.txt` 之后
   *      还得剩下 `robots.txt`。
   *      ⚠️ 这一条是补**独立复核抓到的那个高危假绿**的：前两条只数「字样」，
   *      于是「产物 vs 产物」的恒等比较（`got=$(sed … _site/robots.txt)`，
   *      **根本不去线上取**）也能骗过它们 ⇒ 等待步骤看着在等、其实没等。
   *   ④ **构建标记本身必须有一条「不绑在产物上」的提取**（2026-11-01 场次补）——
   *      第 ③ 条只判「这一步里**别处**还有一次去线上取 robots.txt」，
   *      而**取到的未必是构建标记** ⇒ 「产物 vs 产物」的恒等比较可以躲在
   *      **别处还有一次线上取数**的背后骗过第 ③ 条。
   *      ⚠️ 本轮新增的「现读线上 TTL」**恰好就是第二次线上取 robots.txt**
   *      ⇒ 本轮自己给 DP14 造了一个新的假绿入口 ⇒ 必须同步收紧。
   *      判法：**逐行**看提到 `generated-at` 的行 —— 只要**有一行**提到
   *      `generated-at` 且**那一行不含 `_site/robots.txt`** ⇒ 标记是从产物以外
   *      提取的。
   *      ⚠️ **不要求同一行同时出现 `robots.txt`**：把线上正文先存进变量、下一行
   *      再提取标记，是同样合法的写法 ⇒ 按同行判会**假红**。
   */
  const isStampWait = (cmd) => {
    if (!cmd.includes("generated-at")) return false;
    if (!cmd.includes("_site/robots.txt")) return false;
    const outsideArtifact = cmd.split("_site/robots.txt").join("");
    if (!outsideArtifact.includes("robots.txt")) return false;
    /* ④ 构建标记必须有一条不绑在产物上的提取。 */
    const liveStamp = cmd
      .split("\n")
      .filter((l) => l.includes("generated-at"))
      .some((l) => !l.includes("_site/robots.txt"));
    return liveStamp;
  };

  const wait = checkJob
    ? runSteps.find((s) => s.job === checkJob && s !== checkStep && isStampWait(s.cmd)) || null
    : null;

  if (jobList.length === 0) {
    /* ⚠️ **前提不在场 ⇒ 本条不判**（不是判绿，也不是判红）：
     *   工作流里一个 job 都没有 ⇒「核查 job」这一格**根本不存在**，
     *   「线上核查有没有被调用」这件事**判不了** ⇒ 那是 **DP9b**（读不到任何 job）
     *   负责的事。**「判不了」与「没有」必须分开。** */
  } else if (!checkJob) {
    fail(
      `DP14 部署工作流里没有跑线上核查（check-live-site.cjs）的那一步 —— ` +
        `「部署后的线上核查」这一格**没人负责**了：豁免登记里写着它的唯一自动调用点` +
        `是 verify-live job，而把这一步删掉**没有任何门禁会发现** ⇒ 核查静默停摆` +
        `（本地门禁只查本地产物 ⇒ 「线上对不对」又变成没人看的事）。`
    );
  } else {
    dp14CheckStep = checkStep;
    /* ⚠️ **这两步的「会不会跑 / 失败算不算数」要独立判，且合成一条红因** ——
     *   · 不能挂在「等待步骤已找到」那个分支里：等待步骤坏掉时，
     *     这两条事实就跟着一起不报了（⇒ 报出来的原因不完整 ⇒ 排查要多绕一圈）。
     *   · 独立复核抓到的高危假绿之二就落在这里：`if: false` 的核查步骤
     *     **永远不执行**，而门禁若只认「run 里提到了那个脚本」⇒ 判绿。
     *   · 两条事实各合成**一条**红因（自测框架要求「一个片段只认领一个调用点」）。 */
    const guardIf = [];
    const guardCo = [];
    if (checkStep.ifCond !== null) guardIf.push(`核查步骤（${checkStep.ifCond}）`);
    if (checkStep.continueOnError === "true") guardCo.push("核查步骤");
    if (wait) {
      if (wait.ifCond !== null) guardIf.push(`等待步骤（${wait.ifCond}）`);
      if (wait.continueOnError === "true") guardCo.push("等待步骤");
    }
    if (guardIf.length) {
      fail(
        `DP14 有步骤带了一个 if: 条件（${guardIf.join("、")}）—— ` +
          `它可能**永远不执行** ⇒ 「等这次部署的内容」与「跑线上核查」` +
          `这两格都名存实亡 ⇒ 必须无条件执行。`
      );
    }
    if (guardCo.length) {
      fail(
        `DP14 有步骤带了一个 continue-on-error: true（${guardCo.join("、")}）—— ` +
          `它**失败也不会让 job 失败** ⇒ 这一格出问题时没人知道` +
          `（核查崩了、等待超时了，都会被吞掉 ⇒ 报出来的是绿灯）。`
      );
    }
    if (!wait) {
      fail(
        `DP14 核查 job「${checkJob}」里没有按构建标记放行的等待步骤 —— ` +
          `只探测 HTTP 状态码是不够的：**旧部署也返回 200** ⇒ 等待循环第 1 次探测就退出` +
          `⇒ 它等到的不是「这次部署的内容」而是「站点还在」⇒ 核查门禁拿**旧内容**与` +
          `**新产物**逐项比 ⇒ **一次完全健康的部署可能让 CI 变红**（假红）。` +
          `判据锚在构建标记上：产物 _site/robots.txt 的 \`# generated-at:\` 行` +
          `（每次构建都不同）＝线上 robots.txt 的同一行 ⇒ 线上跑的就是这次部署的内容。` +
          `⚠️ **「标记要从产物以外提取」也是硬条件**：只比较「产物 vs 产物」的恒等式` +
          `（两边都读 _site/robots.txt）恒为真 ⇒ 等待步骤看着在等、其实没等` +
          `⇒ 「这次部署没生效」变成**假绿**（比假红更难发现）。`
      );
    } else {
      dp14WaitStep = wait;
      const lastLine = (wait.cmd.split("\n").filter((l) => l.trim()).pop() || "").trim();
      /* ⚠️ 允许行尾注释（`exit 1 # 预算耗尽`）—— 独立复核实测过：
       *   不允许的话，那**完全合法**的写法会被误判红（假红）。 */
      if (!/^exit\s+1\b/.test(lastLine)) {
        fail(
          `DP14 等待步骤的收尾不是失败退出（最后一条命令是「${lastLine || "（空）"}」）—— ` +
            `这一步的结局应当只有两种：构建标记相等（成功）或等待预算耗尽（失败）。` +
            `**不得静默继续**：静默继续 ⇒ 旧站点的路由与 canonical 恰好一致时，` +
            `核查门禁会**全绿** ⇒ 「这次部署没生效」变成**假绿**（比假红更难发现）。`
        );
      }
      /* ⚠️ **成功出口也必须存在**：只有 `exit 1` 的等待步骤 = 每次都超时
       *   ⇒ CI 恒红（而且红因指向「部署没生效」，实际是脚本自己写错了）。 */
      if (!/(^|[\s;&|])exit\s+0\b/.test(wait.cmd)) {
        fail(
          `DP14 等待步骤没有成功出口（整段里找不到 exit 0）—— ` +
            `只有失败出口 ⇒ 每次部署都会走满等待预算才判红 ⇒ ` +
            `「部署没生效」这个结论会被一个**脚本自身的错误**伪装出来。`
        );
      }
      if (checkStep && wait.lineNo > checkStep.lineNo) {
        fail(
          `DP14 等待步骤排在核查步骤**之后**（等待在第 ${wait.lineNo} 行、` +
            `核查在第 ${checkStep.lineNo} 行）—— 顺序反了 ⇒ 核查照样跑在旧内容上` +
            `⇒ 等于没等。`
        );
      }
    }
  }
}

/* ---------------- DP15：工作流的触发事件类型 ---------------- */

/** 允许的触发事件类型（本仓的政策：发布靠 push，手动跑靠 workflow_dispatch）。 */
const ALLOWED_TRIGGERS = new Set(["push", "workflow_dispatch"]);
/** 危险的事件类型：出现即判红（它们是「权限被绕过」的入口）。 */
const DANGEROUS_TRIGGERS = new Set(["pull_request_target", "workflow_run"]);

/**
 * 抽出一个工作流的触发事件（on: 块的一级键）。
 *
 * 口径：`on:` 一定在**顶层**（缩进 0），所以只认顶层的 `on:`；
 * 块式写法（on: 下面第一层缩进的键）与流式写法（on: [a, b] / on: a）都认。
 * ⚠️ **注释不算事件名**：事件名必须匹配 `键名:` 的形状 ⇒ 注释行（以 # 开头）
 *    自然被排除（⇒ 门禁头里解释「为什么禁 pull_request_target」不会误伤自己）。
 *
 * @returns {{state: string, events: string[]}}
 *   state: "ok"（读到了事件名）/ "no-on"（文件里没有 on: 段）/ "unparsable"（有 on: 段但读不出事件名）
 */
function workflowTriggerEvents(text) {
  const lines = text.split("\n");
  const indentOf = (l) => (l.match(/^\s*/) || [""])[0].length;
  const onIdx = lines.findIndex((l) => /^["']?on["']?\s*:/.test(l));
  if (onIdx < 0) return { state: "no-on", events: [] };

  /* 流式写法：on: [push, workflow_dispatch] / on: push / on: {push: {...}} */
  const inline = lines[onIdx]
    .replace(/^["']?on["']?\s*:\s*/, "")
    .replace(/\s+#.*$/, "")
    .trim();
  if (inline) {
    let events = [];
    if (inline.startsWith("[")) {
      events = inline
        .slice(1, -1)
        .split(",")
        .map((x) => x.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (inline.startsWith("{")) {
      events = inline
        .slice(1, -1)
        .split(",")
        .map((x) => x.split(":")[0].trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      events = [inline.replace(/^["']|["']$/g, "")];
    }
    if (events.length) return { state: "ok", events };
  }

  /* 块式写法：on: 块里第一层缩进的键就是事件名。 */
  const base = indentOf(lines[onIdx]);
  const block = [];
  for (let i = onIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    if (indentOf(lines[i]) <= base) break;
    block.push(lines[i]);
  }
  if (!block.length) return { state: "unparsable", events: [] };
  const minIndent = Math.min(...block.map(indentOf));
  const events = [];
  for (const l of block) {
    if (indentOf(l) !== minIndent) continue;
    const m = /^\s*["']?([A-Za-z_][A-Za-z0-9_-]*)["']?\s*:/.exec(l);
    if (m) events.push(m[1]);
  }
  if (!events.length) return { state: "unparsable", events: [] };
  return { state: "ok", events };
}

/* DP15 查到的量（供汇总文案用；判红时不需要）。 */
let dp15Workflows = 0;
let dp15Events = 0;

const workflowDir = path.join(ROOT, ".github", "workflows");
/* ⚠️ 清单由 `listWorkflowFiles()` 统一给出（DP6 / DP15 / DP16 共用同一份）——
   枚举规则只写一遍 ⇒ `._*` 过滤之类的细节不会在两处漂移。 */
const workflowFiles = listWorkflowFiles();

for (const wfFile of workflowFiles) {
  const text = fs.readFileSync(path.join(workflowDir, wfFile.name), "utf8");
  const parsed = workflowTriggerEvents(text);
  if (parsed.state !== "ok") {
    /* ⚠️ deploy.yml 那一份由 DP3 报（读不到触发分支）—— 同一件事只让一条判据说话；
       这里只管**其余**工作流：否则新加一个形状怪的工作流会静默通过。 */
    if (wfFile.name === path.basename(WORKFLOW)) continue;
    fail(
      `DP15 ${wfFile.rel} 的事件类型一个都没解析出来（on: 段读不出来）—— ` +
        `「读不到」不等于「没有」⇒ 这一份工作流到底会被什么事件触发，判不出来 ⇒ 判红。`
    );
    continue;
  }
  dp15Workflows++;
  for (const ev of parsed.events) {
    dp15Events++;
    if (DANGEROUS_TRIGGERS.has(ev)) {
      fail(
        `DP15 ${wfFile.rel} 的触发事件 ${ev} 属于危险事件类型 —— ` +
          `官方口径：pull_request_target 默认取默认分支的代码（它本身是安全的），` +
          `但只要有人把 checkout 指向 PR 的头，就是 pwn request（fork 的代码带着仓库 secret 与写权限跑起来）；` +
          `workflow_run 则让被触发者**即使前一个工作流没有权限**也能拿到 secret 与写权限（官方对它标了 WARNING：缓存投毒与意外写权限）。` +
          `本仓没有需要这两个事件的场景，误用的代价不可逆 ⇒ 一律不许出现。`
      );
      continue;
    }
    if (!ALLOWED_TRIGGERS.has(ev)) {
      fail(
        `DP15 ${wfFile.rel} 的触发事件 ${ev} 不在允许的事件类型里` +
          `（允许集只有 push 与 workflow_dispatch）—— ` +
          `多出来的触发器意味着这个工作流会在你没预期的时机、用你没预期的上下文跑起来。` +
          `要加新的触发器，请显式改门禁里的允许集并在改进日志里记一笔。`
      );
    }
  }
}

/* ---------------- DP16：job 级 permissions 的写权限只许留在真正需要它的那个 job ---------------- */

/**
 * 执行 Pages 部署的那个 action —— 「有资格持写权限的 job」靠它认，**不靠 job 名字**。
 * 理由：改 job 名字不该让门禁失效；而把权限挪到别的 job 上，也不该靠改名字绕过。
 */
const DEPLOY_ACTION = "actions/deploy-pages";
/** 允许写成 write 的作用域（官方 deploy-pages 文档：执行部署的 job 至少需要这两个）。 */
const ALLOWED_WRITE_SCOPES = new Set(["pages", "id-token"]);

/**
 * 工作流里每个 job 的 **job 级 permissions** 与它用到的 action。
 *
 * 返回 [{ name, lineNo, perms, uses }]：
 *   perms —— readPermissionsAt 的结果；null = 这个 job 没写 permissions
 *            （⇒ 它继承顶层；顶层由 DP6 守着是只读的 ⇒ 这里不判）
 *   uses  —— 该 job 的**步骤级** uses: 引用（job 级 uses: 是复用工作流，不算）
 */
function workflowJobPermissions(text) {
  const lines = text.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (jobsIdx < 0) return [];
  const base = indentOfLine(lines[jobsIdx]);
  const out = [];
  let cur = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOfLine(line);
    if (ind <= base) break; // 出了 jobs 段
    if (ind === base + 2) {
      const m = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:/.exec(line);
      if (m) {
        cur = { name: m[1], lineNo: i + 1, perms: null, uses: [] };
        out.push(cur);
        continue;
      }
    }
    if (!cur) continue;
    if (ind === base + 4 && /^[ \t]+permissions[ \t]*:/.test(line)) {
      cur.perms = readPermissionsAt(lines, i);
      continue;
    }
    /* 步骤级的 uses:（缩进比 job 的键更深）；job 级 uses:（复用工作流）不算。 */
    if (ind > base + 4) {
      const um = /^[ \t]*(?:-\s*)?uses[ \t]*:[ \t]*(\S+)/.exec(line);
      if (um) cur.uses.push(um[1]);
    }
  }
  return out;
}

/**
 * 「有资格持写权限的 job」= 步骤里用了 actions/deploy-pages 的那些。
 * DP16 与 DP18 共用这一处识别 —— **同一件事只认一处**。
 * ⚠️ **不靠 job 名字**：改 job 名字不该让门禁失效，挪走动作也不该让权限悄悄放宽。
 */
function deployJobNames(jobList) {
  return jobList
    .filter((j) => j.uses.some((u) => u.startsWith(`${DEPLOY_ACTION}@`)))
    .map((j) => j.name);
}

/* DP16 查到的量（供汇总文案用；判红时不需要）。 */
let dp16Jobs = 0;
let dp16WriteJobs = [];

for (const wfFile of workflowFiles) {
  const text = fs.readFileSync(path.join(workflowDir, wfFile.name), "utf8");
  const jobList = workflowJobPermissions(text);
  const deployJobs = deployJobNames(jobList);
  const deploySet = new Set(deployJobs);
  for (const job of jobList) {
    if (!job.perms) continue;
    dp16Jobs++;
    const insp = inspectPermissions(job.perms);
    if (insp.unreadable.length) {
      fail(
        `DP16 ${wfFile.rel} 的 job「${job.name}」的 job 级 permissions 的写法读不懂` +
          `（${insp.unreadable.length} 处）：` +
          insp.unreadable.map((e) => `${wfFile.rel}:${e.lineNo}`).join("；") +
          ` —— **「判不了」不等于「没有」** ⇒ 这个 job 到底持有什么权限判不出来 ⇒ 判红。`
      );
      continue;
    }
    if (!insp.writes.length) continue;
    dp16WriteJobs.push(`${wfFile.rel} 的「${job.name}」`);
    if (!deploySet.has(job.name)) {
      fail(
        `DP16 ${wfFile.rel} 的 job「${job.name}」不是执行部署的那个 job，却拿了写权限` +
          `（${insp.writes.map((w) => w.label).join("、")}）—— ` +
          `本工作流里有资格持写权限的 job：${deployJobs.length ? deployJobs.join("、") : "（一个都没有）"}；` +
          `写权限只许留在执行 Pages 部署的那一个 job 上（它需要 pages: write + id-token: write，` +
          `官方 deploy-pages 文档写明「至少」这两个）。` +
          `别的 job 拿了写权限 ⇒ 那个 job 里跑的仓内代码（npm ci ＋ 整条门禁链 ＝ 仓里可被改的代码）` +
          `就握着一把能改仓库、能改线上站点、能铸 OIDC 令牌的钥匙。`
      );
      continue;
    }
    const extra = insp.writes.filter((w) => !ALLOWED_WRITE_SCOPES.has(w.scope));
    if (extra.length) {
      fail(
        `DP16 ${wfFile.rel} 的执行部署的那个 job「${job.name}」拿了超出需要的写权限` +
          `（${extra.map((w) => w.label).join("、")}）—— ` +
          `官方 deploy-pages 文档写明它需要的是 pages: write + id-token: write 两个作用域；` +
          `多出来的写权限（例如 contents: write ＝ 能改仓库、能推代码）没有理由出现在这里。`
      );
    }
  }
}

/* ---------------- DP17：checkout 不得把凭据留在工作区 ---------------- */

/**
 * 一个工作流里所有 `actions/checkout` 步骤，以及它们 `with:` 里的 persist-credentials。
 *
 * 返回 [{ job, lineNo, persist }]：
 *   persist = null（**没写这个键**）／字面量（true / false / `${{ … }}` …）。
 *
 * ⚠️ **块标量（`run: |`）里的正文不算步骤属性**：run 块里出现
 *   `uses:` / `with:` 字样的行必须跳过，否则脚本正文会伪装成配置。
 * ⚠️ **步骤块按缩进划界**：到下一个同缩进的步骤标记、或任何缩进更浅的行为止
 *   ⇒ job 级的键（`timeout-minutes:` 等）不会被误当成步骤 `with:` 的子键。
 */
function checkoutSteps(text) {
  const lines = text.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs[ \t]*:/.test(l));
  if (jobsIdx < 0) return [];
  const base = indentOfLine(lines[jobsIdx]);
  const STEP_MARK_RE = /^[ \t]*-[ \t]/;
  const out = [];
  let job = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOfLine(line);
    if (ind <= base) break; // 出了 jobs 段
    if (ind === base + 2) {
      const m = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:/.exec(line);
      if (m) {
        job = m[1];
        continue;
      }
    }
    if (!STEP_MARK_RE.test(line)) continue;
    const stepIndent = ind;
    /* 这一步的块：从本行到下一个同缩进的步骤标记，或缩进更浅的行。 */
    let stop = i + 1;
    while (stop < lines.length) {
      const l = lines[stop];
      if (!l.trim()) {
        stop++;
        continue;
      }
      const li = indentOfLine(l);
      if (li < stepIndent) break; // 缩进更浅 ⇒ 出了这一步
      if (li <= base + 2) break; // 出了这个 job
      if (li === stepIndent && STEP_MARK_RE.test(l)) break; // 下一步
      stop++;
    }
    const info = parseStepWith(lines.slice(i, stop));
    if (info && info.uses && info.uses.split("@")[0] === "actions/checkout") {
      out.push({ job, lineNo: i + 1, persist: info.persist });
    }
    i = stop - 1; // 这一块已经处理完
  }
  return out;
}

/**
 * 一个步骤块里的 `uses:` 与 `with: persist-credentials`。
 * 返回 { uses, persist }；persist 为 null 表示**没写**这个键。
 */
function parseStepWith(block) {
  let uses = null;
  let withAt = null; // { indent, inline, idx }
  let runIndent = -1; // run 块标量的缩进（比它更深的行是脚本正文）
  for (let k = 0; k < block.length; k++) {
    const l = block[k];
    const ind = indentOfLine(l);
    if (runIndent >= 0) {
      if (!l.trim() || ind > runIndent) continue;
      runIndent = -1;
    }
    const rm = /^[ \t]*(?:-[ \t]*)?run[ \t]*:[ \t]*([|>][-+]?)?/.exec(l);
    if (rm) {
      if (rm[1]) runIndent = ind;
      continue;
    }
    const um = /^[ \t]*(?:-[ \t]*)?uses[ \t]*:[ \t]*(\S+)/.exec(l);
    if (um && !uses) {
      uses = um[1];
      continue;
    }
    const wm = /^[ \t]*(?:-[ \t]*)?with[ \t]*:[ \t]*(.*)$/.exec(l);
    if (wm && !withAt) withAt = { indent: ind, inline: wm[1].trim(), idx: k };
  }
  let persist = null;
  if (withAt) {
    if (withAt.inline.startsWith("{")) {
      /* 流式映射：`with: {persist-credentials: false}` */
      const m = /persist-credentials[ \t]*:[ \t]*([^,}]+)/.exec(withAt.inline);
      if (m) persist = m[1].trim().replace(/^["']|["']$/g, "");
    } else {
      /* 块式映射。
       * ⚠️ **必须从 `with:` 那一行往后扫**：步骤标记行（`- name: X`）的缩进
       *   比 `with:` 浅 ⇒ 从块首开始扫会**当场 break**（一个字节都没扫到）
       *   ⇒ 于是「明明写了 persist-credentials: false」会被误判成「没写」。 */
      for (let k = withAt.idx + 1; k < block.length; k++) {
        const l = block[k];
        if (!l.trim()) continue;
        if (indentOfLine(l) <= withAt.indent) break; // 出了 with 块
        const m = /^[ \t]*persist-credentials[ \t]*:[ \t]*(.*)$/.exec(l);
        if (m) {
          persist = stripYamlComment(m[1]).trim().replace(/^["']|["']$/g, "");
          break;
        }
      }
    }
  }
  return { uses, persist };
}

/* DP17 查到的量（供汇总文案用）。 */
let dp17Checkouts = 0;

for (const wfFile of workflowFiles) {
  const text = fs.readFileSync(path.join(workflowDir, wfFile.name), "utf8");
  const bad = [];
  const unknown = [];
  for (const st of checkoutSteps(text)) {
    dp17Checkouts++;
    const raw = st.persist;
    if (raw === null) {
      bad.push(st); // 没写 = 默认 true
      continue;
    }
    if (/^false$/i.test(raw)) continue; // 关掉了 ✔
    if (/^true$/i.test(raw)) {
      bad.push(st); // 显式开着
      continue;
    }
    unknown.push(st); // 读不出来
  }
  if (bad.length) {
    fail(
      `DP17 ${wfFile.rel} 有 ${bad.length} 处 checkout 把凭据留在了工作区：` +
        bad
          .map(
            (st) =>
              `${wfFile.rel}:${st.lineNo} 的「${st.job}」job（persist-credentials ${st.persist === null ? "没写" : st.persist}）`
          )
          .join("；") +
        ` —— actions/checkout 的 persist-credentials **默认是 true** ⇒ **令牌会被持久化**` +
        `（v6 起放在 $RUNNER_TEMP 下的独立文件里，v5 及以前直接写进 .git/config）` +
        `⇒ 该 job 之后跑的每一步（依赖包的 postinstall 脚本、仓内的门禁脚本、构建脚本）` +
        `都能把它读走；那个 job 持写权限时后果更大。` +
        `必须显式写 persist-credentials: false（本仓的 build 链只用本地 git 读历史，关掉零影响）。`
    );
  }
  if (unknown.length) {
    fail(
      `DP17 ${wfFile.rel} 有 ${unknown.length} 处 checkout 的 persist-credentials 的写法读不出来：` +
        unknown.map((st) => `${wfFile.rel}:${st.lineNo} 的「${st.job}」job（${st.persist}）`).join("；") +
        ` —— **「判不了」不等于「没有」**：门禁静态看不见它在运行时求值成什么 ` +
        `⇒ 只能当成「可能留下了凭据」来报。`
    );
  }
}

/* ---------------- DP18：线上核查必须在依赖链上晚于执行部署的那个 job ---------------- */

/**
 * 工作流里每个 job 的 `needs:` 依赖。
 *
 * 返回 Map<jobName, { state, deps, lineNo }>：
 *   state = "ok"（读到了依赖列表）/ "none"（没写 needs ⇒ 无依赖）/ "unreadable"（写法读不出来）
 *
 * ⚠️ **认四种形状**（官方 workflow-syntax 里都合法）：
 *   ① 标量：     `needs: build`
 *   ② 流式数组： `needs: [build, other]`
 *   ③ 块式列表： `needs:` 下一层缩进列 `- build`
 *   ④ 块式映射： `needs:` 下一层缩进列 `build:`（带 outputs 的那种写法）
 *   读不懂的（例如 `needs: ${{ ... }}`）⇒ state = "unreadable" ⇒ **fail closed**。
 */
function jobNeeds(text) {
  const lines = text.split("\n");
  const jobsIdx = lines.findIndex((l) => /^jobs[ \t]*:/.test(l));
  const out = new Map();
  if (jobsIdx < 0) return out;
  const base = indentOfLine(lines[jobsIdx]);
  let cur = null;
  for (let i = jobsIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const ind = indentOfLine(line);
    if (ind <= base) break; // 出了 jobs 段
    if (ind === base + 2) {
      const m = /^[ \t]+([A-Za-z0-9_-]+)[ \t]*:/.exec(line);
      if (m) {
        cur = m[1];
        out.set(cur, { state: "none", deps: [], lineNo: i + 1 });
        continue;
      }
    }
    if (!cur || ind !== base + 4) continue;
    const m = /^[ \t]+needs[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!m) continue;
    const inline = stripYamlComment(m[1]).trim();
    const info = { state: "ok", deps: [], lineNo: i + 1 };
    if (inline) {
      if (inline.startsWith("[")) {
        info.deps = inline
          .slice(1, -1)
          .split(",")
          .map((x) => x.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else if (inline.startsWith("{")) {
        info.state = "unreadable";
      } else {
        const v = inline.replace(/^["']|["']$/g, "").trim();
        if (!v || v.includes("${{")) info.state = "unreadable";
        else info.deps = [v];
      }
    } else {
      /* 块式：needs: 下一层缩进列出的条目（列表或带 outputs 的映射）。
       * ⚠️ **注释行必须先滤掉**：它们不参与「首层缩进」的判定
       *   （否则一条缩进不同的注释会把首层判定带偏）。 */
      const block = [];
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l.trim()) continue;
        if (/^[ \t]*#/.test(l)) continue; // 注释行
        if (indentOfLine(l) <= base + 4) break;
        block.push(l);
      }
      if (!block.length) {
        info.state = "none"; // needs: 后面是空的 ⇒ 无依赖
      } else {
        const minIndent = Math.min(...block.map(indentOfLine));
        for (const l of block) {
          if (indentOfLine(l) !== minIndent) continue;
          const lm = /^[ \t]*-[ \t]*(.*)$/.exec(l);
          if (lm) {
            const v = lm[1].trim().replace(/^["']|["']$/g, "");
            if (!v || v.includes("${{")) info.state = "unreadable";
            else info.deps.push(v);
            continue;
          }
          const km = /^[ \t]*([A-Za-z0-9_.-]+)[ \t]*:/.exec(l);
          if (km) {
            info.deps.push(km[1]);
            continue;
          }
          info.state = "unreadable";
        }
      }
    }
    out.set(cur, info);
  }
  return out;
}

/**
 * 一个 job 的 needs 依赖链（传递闭包）。
 * 返回 { chain: Set<string>, unreadable: boolean }。
 */
function needsChainOf(needsMap, startJob) {
  const chain = new Set();
  const seen = new Set();
  let unreadable = false;
  const stack = [startJob];
  while (stack.length) {
    const j = stack.pop();
    if (seen.has(j)) continue;
    seen.add(j);
    const info = needsMap.get(j);
    if (!info) continue; // 链上出现未知 job ⇒ 它没有已声明的依赖
    if (info.state === "unreadable") {
      unreadable = true;
      continue;
    }
    for (const d of info.deps) {
      chain.add(d);
      stack.push(d);
    }
  }
  return { chain, unreadable };
}

/* DP18 查到的量（供汇总文案用）。 */
let dp18DeployJobs = [];
let dp18CheckJob = null;

if (wfText !== null) {
  dp18DeployJobs = deployJobNames(workflowJobPermissions(wfText));
  const dp18CheckStep = liveCheckStepOf(workflowRunSteps(wfText));
  dp18CheckJob = dp18CheckStep ? dp18CheckStep.job : null;

  /* ⚠️ **前提不在场 ⇒ 本条不判**（不是判绿，也不是判红）：
   *   · 认不出「执行部署的 job」⇒ 由 **DP16** 报（那个 job 的写权限没了归属）；
   *   · 认不出「核查 job」⇒ 由 **DP14** 报（线上核查没人跑）。
   *   ⇒ **同一件事只让一条判据说话。 */
  if (dp18DeployJobs.length && dp18CheckJob) {
    const { chain, unreadable } = needsChainOf(jobNeeds(wfText), dp18CheckJob);
    if (unreadable) {
      fail(
        `DP18 线上核查所在 job 的 needs 依赖链读不出来 —— ` +
          `判不了它排在部署之后还是之前 ⇒ **「判不了」不等于「没有」** ⇒ fail closed。`
      );
    } else if (!dp18DeployJobs.some((d) => chain.has(d))) {
      fail(
        `DP18 线上核查所在 job「${dp18CheckJob}」的 needs 依赖链里没有执行部署的那个 job` +
          `（${dp18DeployJobs.join("、")}）—— 「部署后的线上核查」这一格的位置被写坏了：` +
          `核查必须**在这次部署之后**跑（豁免登记里写明的理由：build 跑在 deploy 之前，` +
          `此时线上还是上一次部署，把它放进 build 等于每次都对着旧站点判红，` +
          `把「部署还没发生」误报成「代码坏了」）。` +
          `⚠️ 后果不是「多报一次」：核查挪到部署之前 ⇒ 等待步骤等满 600 秒才判红 ⇒ ` +
          `**build job 失败 ⇒ deploy job 被跳过 ⇒ 站点从此不再更新**；` +
          `而红因写的是「线上没切到这次部署的内容」⇒ **把工作流写错误报成 CDN 问题**。`
      );
    }
  }
}

/* ---------------- DP19：build job 的超时上限必须兜得住「按链段数自估的最坏耗时」 ---------------- */

/**
 * 每段的最坏耗时（秒）—— **门禁自己持有这个数**。
 *
 * ⚠️ 为什么按「链段数 × 每段最坏耗时」自估，而**不**写死一个实测总秒数
 *   （2026-11-01 场次实测坐实，不是假想）：
 *   写死总秒数（例：2026-10-29 记的「实测 286 秒 ≈ 4.8 分钟」）⇒ 链每加一道门禁，
 *   这个数就**过期** ⇒ 而**没有任何东西会提醒它过期** ⇒ 等它过期的那天，
 *   超时上限已经兜不住链了 ⇒ job 被超时**杀掉** ⇒ **站点停更**
 *   （而 push 本身是成功的 ⇒ 症状只有「站点停更」，极难归因到超时）。
 *   ⇒ 改按**段数**自估：链变长 ⇒ 下限自动跟着涨 ⇒ **不需要任何人维护基线**。
 *
 * 15 秒/段的依据（2026-11-01 实测，隔离克隆 + 官方源 + **Node 22 ＝ CI 的运行时**）：
 *   整链 **456 秒 ≈ 7.6 分钟**（npm ci 另计），链有 **122 段** ⇒ 平均 ≈ 3.7 秒/段。
 *   ⇒ 15 秒/段 ＝ 平均的 4 倍余量 ⇒ 链整体慢 4 倍才需要重看这个上限。
 *   ⚠️ 这仍是**估算**（不是保证）：门禁守的是「上限与链长成比例」这条不变式，
 *      不是「这个上限一定够」⇒ 真跑慢到兜不住时，报红的是**这个 job 被杀了**
 *      （症状：站点停更、workflow 显示 failed/cancelled）—— 那一刻要查的是
 *      **链为什么变慢**，而不是继续加大上限（加大上限＝把刹车拆了）。
 */
const WORST_SECONDS_PER_SEGMENT = 15;

/* DP19 查到的量（供汇总文案用）。 */
let dp19Segments = 0;
let dp19WorstMinutes = 0;
let dp19BuildTimeout = null;

if (wfText !== null) {
  // 链段数：口径与 scripts/check-doc-snapshot.cjs 的 **DS2** 一致（按 && 切段）。
  let segments = 0;
  let segmentsErr = null;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const cmd = (pkg.scripts && pkg.scripts.build) || "";
    segments = cmd
      .split("&&")
      .map((s) => s.trim())
      .filter(Boolean).length;
    if (!segments) segmentsErr = "package.json 的 scripts.build 数不出任何段";
  } catch (e) {
    segmentsErr = `读不到或解析不了 package.json（${String((e && e.message) || e).split("\n")[0]}）`;
  }
  const buildJob = jobs.find((j) => j.name === "build");
  if (segmentsErr) {
    fail(
      `DP19 数不出 build 链的段数 —— ${segmentsErr} —— ` +
        `**「判不了」不等于「没有」**：算不出链有多长 ⇒ 就算不出「超时上限兜不兜得住」⇒ fail closed。`
    );
  } else if (!buildJob) {
    // 认不出 build job ⇒ DP16 / DP9 那边会报它 ⇒ 这里不重复报（同一件事只让一条判据说话）。
  } else {
    const worstMinutes = Math.ceil((segments * WORST_SECONDS_PER_SEGMENT) / 60);
    const v = Number(buildJob.timeout);
    dp19Segments = segments;
    dp19WorstMinutes = worstMinutes;
    dp19BuildTimeout = buildJob.timeout;
    if (!Number.isInteger(v) || v <= 0) {
      // 值读不出来 ⇒ DP9 已经报过（「读不出来」是 DP9 的子判据）⇒ 这里不重复报。
    } else if (v < worstMinutes) {
      fail(
        `DP19 build job 的 timeout-minutes（${v} 分钟）兜不住 build 链的最坏耗时` +
          `（链 ${segments} 段 × 每段最坏 ${WORST_SECONDS_PER_SEGMENT} 秒 ⇒ 至少 ${worstMinutes} 分钟）—— ` +
          `⚠️ 后果不是「多报一次」：**job 会被超时杀掉 ⇒ deploy job 被跳过 ⇒ 站点停更**；` +
          `而 push 本身是成功的 ⇒ 症状只有「站点停更」，极难归因到超时。` +
          `⇒ 要么把 timeout-minutes 提到 ${worstMinutes} 分钟以上（但别超过 60，` +
          `DP9 守着那个刹车），要么**先查链为什么变慢**（加大上限＝把刹车拆了）。`
      );
    }
  }
}

/* ---------------- DP20：「等站点起来」的预算必须按线上实测的 TTL 现算 ---------------- */

/**
 * ⚠️ 为什么这条必须存在（2026-11-01 场次）：
 *   `verify-live` job 里那个等待步骤，原来把预算**写死成 600 秒**，
 *   而 600 正是当时实测的线上 `cache-control: max-age` ⇒ **余量为零**。
 *   ⇒ 只要 GitHub 把 TTL 调大一点（600 → 900），或某个边缘节点慢一点，
 *   就会「预算耗尽还没切过去」⇒ 判红 ⇒ **而这次部署其实成功了**
 *   ⇒ 一次**假红** ⇒ 假红的代价不是多报一次，而是**训练人忽略 CI**
 *   ⇒ 整条门禁链失去价值（这正是 D124 那次要消灭的东西）。
 *   ⇒ 修法（已落地）：每次运行**现读**线上响应头的 `max-age`，
 *     预算取 `max(600, TTL + 120)` ⇒ TTL 变了不必改代码。
 *
 * 判法：工作流里那个等待步骤的脚本**必须**出现「读 max-age」的逻辑
 *   （`cache-control` 与 `max-age` 两个锚点都要在）⇒ 写死 600 秒 ⇒ 判红。
 *   ⚠️ 这是**文本形状**判定（弱），但它守的正是「别把预算改回常数」这一层；
 *      而「预算取多少」这件事由**线上实测**决定（脚本自己读）⇒ 不由门禁猜。
 */
/* DP20 查到的量（供汇总文案用）。 */
let dp20WaitBudgetDynamic = false;

if (wfText !== null) {
  /* 等待步骤的锚点用**语义**而不是步骤名：它必须处理「构建标记」（generated-at）
   * 或持有 deadline ⇒ 改名、改写法都躲不掉（步骤名只是给人看的）。 */
  const waitSteps = (workflowRunSteps(wfText) || []).filter((s) => {
    const cmd = s.cmd || "";
    return /generated-at/.test(cmd) || /deadline=/.test(cmd);
  });
  if (!waitSteps.length) {
    // 认不出等待步骤 ⇒ DP14 会报「线上核查没人跑」⇒ 这里不重复报。
  } else {
    const script = waitSteps.map((s) => s.cmd).join("\n");
    const hasCacheControl = /cache-control/i.test(script);
    const hasMaxAge = /max-age/i.test(script);
    dp20WaitBudgetDynamic = hasCacheControl && hasMaxAge;
    if (!hasCacheControl || !hasMaxAge) {
      fail(
        `DP20 「等站点起来」的等待预算没有按线上实测的 CDN TTL 现算` +
          `（工作流里读 cache-control=${hasCacheControl ? "有" : "无"}、` +
          `max-age=${hasMaxAge ? "有" : "无"}）—— 预算写死成一个常数 ⇒ **余量为零**：` +
          `CDN 的 max-age 一变（实测今天是 600 秒）就会「预算耗尽还没切过去」⇒ 判红，` +
          `**而这次部署其实成功了** ⇒ 一次**假红** ⇒ 假红的代价是**训练人忽略 CI**，` +
          `整条门禁链失去价值。⇒ 预算必须**现读**线上响应头的 max-age，` +
          `取 \`max(600, TTL + 余量)\`。`
      );
    }
  }
}

/* ---------------- DP21：等待预算的上限必须小于该 job 的 timeout-minutes ---------------- */

/**
 * 等待预算的**上限**（秒）与 job 超时之间必须留出的余量（秒）。
 *
 * ⚠️ 为什么要有这条（2026-11-03 场次，源自 D132 留下的建议）：
 *   预算是**现算**的（TTL + 120 秒），而 job 的 `timeout-minutes` 是**死的**
 *   ⇒ 若 TTL 涨到「预算 ≥ job 上限」，**GitHub 会直接把这个 job 杀掉**
 *   ⇒ 红因变成「job 超时」（一句看不懂的话），而**不是**
 *     「线上在 X 秒内没有切到这次部署的内容」⇒ **失败方式变得不可读** ——
 *   那正是 D124 那次要消灭的那类损失（假红与不可读的失败同样训练人忽略 CI）。
 *   ⇒ 等待脚本里必须给预算一个**显式上限**，且它 + 余量 ≤ 该 job 的上限。
 *
 * ⚠️ 余量为什么是 60 秒：等待步骤**之前**还有 checkout / setup-node /
 *   下载产物（≈ 1~2 分钟），**之后**还有核查门禁本身 ⇒ 上限必须比
 *   「预算 + 准备时间」小 ⇒ 门禁这里只守「预算 + 1 分钟 ≤ job 上限」
 *   这条**必要条件**（准备时间是实测值，不是常量 ⇒ 门禁不猜它）。
 */
const DP21_MIN_SLACK_SECONDS = 60;

/* DP21 查到的量（供汇总文案用）。 */
let dp21BudgetCap = null;
let dp21JobTimeout = null;

if (wfText !== null) {
  /* 等待步骤的定位与 DP20 **同一处**（同一件事只认一处）。 */
  const waitSteps22 = (workflowRunSteps(wfText) || []).filter((s) => {
    const cmd = s.cmd || "";
    return /generated-at/.test(cmd) || /deadline=/.test(cmd);
  });
  if (!waitSteps22.length) {
    /* 认不出等待步骤 ⇒ DP14 / DP20 那边会报它 ⇒ 这里不重复报（同一件事只让一条判据说话）。 */
  } else {
    /* 预算上限的写法：`[ "$budget" -gt N ] && budget=N` ⇒ 取那个 N。 */
    const capMatch = waitSteps22
      .map((s) => s.cmd)
      .join("\n")
      .match(/["']?\$\{?budget\}?["']?\s*-gt\s*(\d+)/);
    const cap = capMatch ? Number(capMatch[1]) : null;
    /* 该 job 的 timeout-minutes（取等待步骤所在的那个 job）。 */
    const jobOfWait = jobs.find((j) => j.name === waitSteps22[0].job);
    const jobTimeoutMinutes = jobOfWait ? Number(jobOfWait.timeout) : null;

    if (cap === null) {
      fail(
        `DP21 「等站点起来」的等待预算**没有上限**—— 预算是现算的（TTL + 余量），` +
          `而 job 的 timeout-minutes 是死的 ⇒ TTL 一涨，预算就可能超过 job 上限，` +
          `**这个 job 会被 GitHub 直接杀掉** ⇒ 红因变成「job 超时」而不是` +
          `「线上没切到这次部署的内容」⇒ 失败方式不可读。` +
          `⇒ 等待脚本里必须给预算一个显式上限（形如 ` +
          `\`[ "$budget" -gt N ] && budget=N\`），且 N + ${DP21_MIN_SLACK_SECONDS} 秒 ≤ 该 job 的 timeout-minutes。`
      );
    } else if (jobOfWait && jobTimeoutMinutes === null) {
      /* timeout-minutes 读不出来 ⇒ DP9 已经报过 ⇒ 这里不重复报。 */
    } else if (jobTimeoutMinutes !== null) {
      dp21BudgetCap = cap;
      dp21JobTimeout = jobTimeoutMinutes;
      const jobSeconds = jobTimeoutMinutes * 60;
      if (cap + DP21_MIN_SLACK_SECONDS > jobSeconds) {
        fail(
          `DP21 「等站点起来」的等待预算上限（${cap} 秒）比该 job 的上限还大` +
            `（job「${jobOfWait.name}」的 timeout-minutes = ${jobTimeoutMinutes} 分钟 ` +
            `= ${jobSeconds} 秒）—— 预算跑满时 **job 会被 GitHub 杀掉** ⇒ ` +
            `红因变成「job 超时」（一句看不懂的话），而不是「线上在 ${cap}s 内没有切到` +
            `这次部署的内容」⇒ **失败方式不可读**。⇒ 预算上限 + ` +
            `${DP21_MIN_SLACK_SECONDS} 秒余量必须小于 job 上限：` +
            `要么把上限调小，要么把该 job 的 timeout-minutes 调大。`
        );
      }
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
  `  · 工作流里的 action 全部钉到 commit SHA（tag 是可移动引用）；` +
    `**每个工作流的顶层 permissions 都只读**（核了 ${dp6Workflows} 个工作流），写权限只留在具体 job 上。`
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
    `挂死的部署最多占住 concurrency group ${jobs.map((j) => j.timeout).join(" / ")} 分钟` +
    `（上限 60 分钟：兜底值必须真的挡得住事，写成 GitHub 的默认上限 360 分钟等于没写）。`
);
if (dbSummary) {
  console.log(
    `  · ${DEPENDABOT} 在位，检出 ${dbSummary.entries.length} 个生态条目` +
      `（${dbSummary.entries.map((e) => `${e.eco}（dir=${e.dir || "无"}、interval=${e.interval || "无"}）`).join("、")}）` +
      `—— 钉住的 SHA 有人替它往前推（告警通道在 SHA 钉法下会静默，靠版本更新这条通道补）。`
  );
}
console.log(
  `  · 没有 \`npm ci\` 的 job 里执行的 node 脚本共 ${dp13Checked.length} 个` +
    (dp13Checked.length ? `（${dp13Checked.join("、")}）` : "") +
    `—— 那些 job 里没有 node_modules ⇒ 它们的 require 链必须只含内置模块与仓内相对路径。`
);
if (dp14WaitStep && dp14CheckStep) {
  console.log(
    `  · 部署后的线上核查跑在**这次部署的内容**上：` +
      `等待步骤按**构建标记**放行（第 ${dp14WaitStep.lineNo} 行）→ ` +
      `核查步骤在它之后（第 ${dp14CheckStep.lineNo} 行，${dp14CheckStep.job} job）` +
      `—— 只等 HTTP 200 是不够的（旧部署也返回 200 ⇒ 等到的是旧版本）。`
  );
}
console.log(
  `  · 工作流的触发事件类型：核了 ${dp15Workflows} 个工作流、${dp15Events} 个事件类型` +
    `（允许集只有 push 与 workflow_dispatch；pull_request_target 与 workflow_run 一律不许出现）。`
);
console.log(
  `  · job 级 permissions：核了 ${dp16Jobs} 个声明了 permissions 的 job，` +
    (dp16WriteJobs.length
      ? `其中持写权限的有 ${dp16WriteJobs.length} 个（${dp16WriteJobs.join("、")}）—— ` +
        `写权限只许出现在执行 Pages 部署的那一个 job 上（pages: write + id-token: write）。`
      : `**没有一个 job 持写权限** —— 写权限只许出现在执行 Pages 部署的那一个 job 上。`)
);
console.log(
  `  · checkout 的凭据：核了 ${dp17Checkouts} 处 actions/checkout 步骤，` +
    `全部显式 persist-credentials: false —— 凭据不留在工作区，仓内代码与依赖脚本读不走它。`
);
if (dp18CheckJob && dp18DeployJobs.length) {
  const { chain } = needsChainOf(jobNeeds(wfText), dp18CheckJob);
  console.log(
    `  · 线上核查排在**这次部署之后**：核查 job「${dp18CheckJob}」的 needs 依赖链含` +
      `执行部署的 job「${dp18DeployJobs.join("、")}」（${[...chain].join(" → ") || "无"}）。`
  );
}
if (dp19Segments) {
  console.log(
    `  · build job 的超时上限：链 ${dp19Segments} 段 × 每段最坏 ${WORST_SECONDS_PER_SEGMENT} 秒` +
      ` ⇒ 最坏耗时至少 ${dp19WorstMinutes} 分钟，而 build job 的 timeout-minutes = ` +
      `${dp19BuildTimeout} 分钟（${dp19BuildTimeout >= dp19WorstMinutes ? "兜得住" : "**兜不住**"}）。`
  );
}
if (dp20WaitBudgetDynamic) {
  console.log(
    `  · 「等站点起来」的等待预算：**现读**线上响应头的 cache-control max-age` +
      `（不写死常数 ⇒ CDN 的 TTL 变了不必改代码 ⇒ 不会因为 TTL 变一次就假红）。`
  );
}
if (dp21BudgetCap !== null) {
  console.log(
    `  · 等待预算的**上限** ${dp21BudgetCap} 秒 ＋ ${DP21_MIN_SLACK_SECONDS} 秒余量 ≤ ` +
      `该 job 的 timeout-minutes（${dp21JobTimeout} 分钟）—— 预算跑满时是**脚本自己判红退出**，` +
      `不是被 GitHub 杀掉 job ⇒ 红因始终读得懂。`
  );
}
