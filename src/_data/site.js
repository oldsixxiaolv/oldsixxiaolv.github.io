// =============================================================================
//  MeteoHub · 全局站点数据
// =============================================================================
//  这是全站唯一的数据源。模板、JSON-LD、feed、sitemap 全部读这里。
//  ⚠️ 改内容只改这个文件，不要在模板里硬编码——历史上多处硬编码导致了
//     身份表述、姓名拼写、链接版本号在几处不一致。
// =============================================================================
module.exports = {
  title: "Yihang Lyu",
  shortTitle: "MeteoHub",
  // 站点定位：自我介绍 + 博客 + 科研分享 + 论文解释。不做复杂的东西。
  tagline: "Thunderstorms, lightning, and the physics of extreme precipitation.",
  description:
    "PhD student at the Institute of Atmospheric Physics, Chinese Academy of Sciences. Notes on thunderstorm lightning, data assimilation, and extreme precipitation.",

  // 站点公开地址。这是全站**唯一**的绝对地址来源：canonical / hreflang /
  // og:url / og:image / JSON-LD 的 url 与 image / sitemap 全部由它派生，
  // 不要在模板里另写域名。
  //
  // 为什么是这个地址：站点部署在**用户站仓库** oldsixxiaolv.github.io
  // （`<user>.github.io` 是用户站仓库，内容铺在域名根 `/`，没有 /MeteoHub/
  // 这一层），该仓库的 Pages 自定义域名设为 github.lvyihang.xyz。
  // 所以站点根就是 https://github.lvyihang.xyz/，url 里不能再加子路径。
  // ⚠️ 加错的后果很隐蔽：页面本身照常渲染（资源走相对路径，与挂载点无关），
  // 但 canonical / og:url / sitemap 会指向一个 404 的地址——搜索爬虫和
  // 微信、Twitter 的分享卡片拿到的都是死链，只有看源码才能发现。
  // deploy.yml 里的断言则防止有人不小心把 CNAME 混进产物（一个自定义
  // 域名只能属于一个站点，重复声明会导致部署被 GitHub 判为域名占用）。
  url: "https://github.lvyihang.xyz",

  // 页面语言标记。整站已统一为英文（正文、标签、导航、页面文案），
  // 但这里曾一直是 zh-CN —— 后果有两个：屏幕阅读器会用中文发音规则去念
  // 英文（每个词都念得很怪），搜索引擎会把英文查询的相关性判断往下压。
  // ⚠️ 改成 en **不代表**中文身份信息消失：alternateName 仍是「吕亦航」，
  //    照常写进 Person JSON-LD，那正是它该待的地方。
  locale: "en",
  buildYear: new Date().getFullYear(),

  // —— 网盘入口 ——
  // ⚠️ url 目前是 null：还没有确定链到哪个网盘。模板对 null 判空后整块
  // 不渲染，所以页面上不会出现一个点开是空白的"Cloud drive"。
  // 填上真实地址即可，无需改任何模板。
  drive: {
    label: "Cloud drive",
    url: null,
  },

  // —— 主导航 ——
  // 只保留站点真正存在的版块。论文精读 / 作品集 曾是独立页面，现改为
  // 首页与博客里的内容，不再作为顶层入口。
  nav: [
    { label: "Home", href: "/" },
    // Papers 排在 Blog 前面：对学术访客来说，产出比笔记更先被找。
    // 顺序与各模板的 eleventyNavigation.order 保持一致（Home 1 / Papers 2 /
    // Blog 3 / About 4），两处不一致时以 nav 数组为准——header.njk 读的是它。
    { label: "Papers", href: "/papers/" },
    { label: "Blog", href: "/blog/" },
    { label: "About", href: "/about/" },
  ],

  // ===========================================================================
  //  作者
  // ===========================================================================
  //  姓名有两处：学术署名（本人确认用 Lyu，论文作者列表即为此写法）与
  //  中文名。两者都以本文件为准，模板不要写死。
  author: {
    name: "Yihang Lyu",
    nameAsPublished: "Yihang Lyu",
    givenName: "Yihang",
    familyName: "Lyu",
    alternateName: "吕亦航",
    fullName: "吕亦航",

    jobTitle: "PhD Student",
    // role 已弃用，统一用 jobTitle
    role: "PhD Student",

    affiliation: "中科院大气物理研究所",
    affiliationShort: "IAP-CAS",
    affiliationUrl: "https://iap.cas.cn/",
    affiliationEn: "Institute of Atmospheric Physics, Chinese Academy of Sciences",

    // 双单位：博士在兰州大学，现在在中科院大气所
    affiliations: [
      { short: "IAP-CAS", name: "中科院大气物理研究所", en: "Institute of Atmospheric Physics, CAS" },
      { short: "LZU", name: "兰州大学", en: "Lanzhou University" },
    ],

    research: "雷暴雷电 · 数据同化 · 机器学习 · 极端降水",
    researchEn: "Thunderstorm Lightning · Data Assimilation · Machine Learning · Extreme Precipitation",

    // 当前聚焦（用于首页 FIELD NOTE 卡）
    currentFocus: "华北极端降水",
    currentFocusEn: "Extreme precipitation over North China",

    // FIELD NOTE 卡下半部分的三个短标签 / 页脚工具条。
    // 之前这一块写死的是「East Asian monsoon / QBO × MJO / ERA5-JRA-3Q」——
    // 那是上一版「东亚季风」人设的遗留，和本文件顶部的 research 完全对不上。
    // 改成读数据，以后改研究方向只动 site.js，不用去翻模板。
    focusPillars: [
      "Lightning & convective structure",
      "Radar and satellite retrievals",
      "Data assimilation",
    ],
    focusTools: ["TRMM · GPM", "Zenodo · ORCID"],

    bio:
      "PhD student at the Institute of Atmospheric Physics, Chinese Academy of Sciences. " +
      "I work on thunderstorm lightning and the convective structure behind it — how lightning " +
      "observations can be assimilated to improve forecasts, and how machine learning can help " +
      "read stage-dependent storm behaviour out of radar and lightning records. " +
      "Currently focused on extreme precipitation over North China.",

    // 联系方式
    email: "lvyihang26@mails.ucas.ac.cn",
    github: "https://github.com/oldsixxiaolv",
    orcid: "https://orcid.org/0009-0005-3511-0546",
    csdn: "https://blog.csdn.net/lvyihang200411",
    researchgate: "https://www.researchgate.net/profile/Yihang-Lyu",
    zenodo: "https://doi.org/10.5281/zenodo.18041880",
    // OpenAlex：开放学术图谱的作者实体，Semantic Scholar / CORE / 众多机构
    // 检索系统的上游数据源。本人的档案是**按 ORCID 精确反查**出来的
    // （api.openalex.org/authors/orcid:0009-0005-3511-0546 → A5121394231），
    // 档案里的 works 正是本论文 + Zenodo 数据集 + Code Ocean 胶囊这三条，
    // topics 落在 "Lightning and Electromagnetic Phenomena" 一带，与研究方向
    // 一致——不是重名碰巧撞上的。
    openalex: "https://openalex.org/A5121394231",

    // —— Twitter/X 句柄（2026-10-19 第五轮）——
    // ⚠️ 留 null 是**刻意的**，不是漏填。
    // twitter:site / twitter:creator 是**身份声明**：它的内容会被搜索引擎
    // 当成"这个账号属于本站作者"。此前 base.njk 里写死了两个猜测值
    // （@meteohub 实测是别人的账号、@oldsixxiaolv 在 X 上根本不存在），
    // 站点等于在对外声明归属给陌生账号。已改为**没有真实句柄就不输出**。
    // 填上本人真实的 X 句柄（含 @）后，base.njk 会自动输出这两个 meta。
    twitterSite: null,
    twitterCreator: null,

    // 源码仓库。页脚的「Edit on GitHub」用它拼 /edit/<branch>/<path> 直达
    // GitHub 网页编辑器——静态站没有后端，这是唯一不需要自建登录就能改内容的
    // 路径，且只有有推送权限的人能提交（改完由 CI 自动重新构建上线）。
    repo: "https://github.com/oldsixxiaolv/oldsixxiaolv.github.io",
    repoBranch: "main",

    // 教育经历。⚠️ 上一版 about.md 里写的「本科/硕士：南京信息工程大学」查不到
    // 任何佐证，且与「兰大本科 → 现中科院大气所」的实际路径冲突，已整段移除。
    // 现在这两条以本人确认为准；degree 用英文以便与全站英文版式一致。
    education: [
      {
        period: "2026—",
        degree: "PhD",
        field: "Atmospheric Science",
        institution: "University of Chinese Academy of Sciences",
        institutionShort: "UCAS",
        detail: "Institute of Atmospheric Physics, Chinese Academy of Sciences",
      },
      {
        period: "2022–2026",
        degree: "BSc",
        field: "Atmospheric Science",
        institution: "Lanzhou University",
        institutionShort: "LZU",
        detail: "College of Atmospheric Sciences",
      },
    ],

    // sameAs：Google 用它做实体消歧。⚠️ 只放**真实可访问**的 URL——
    // 占位符不会显示在页面上，但会被 dump 进 Person JSON-LD，等于主动告诉
    // 搜索引擎一个假身份。这里全部是已确认的真实链接。
    // ⚠️ sameAs 只放**可访问的身份标识 URL**。之前这里混了一个
    // mailto:lvyihang26@mails.ucas.ac.cn —— schema.org 的 sameAs 语义是
    // "同一个人的其他身份主页"，邮箱不是主页，而且它已经在 Person 的
    // email 字段里了。搜索引擎解析 sameAs 时对非 http(s) 方案的容错很差，
    // 留着只会稀释这条属性的可信度。
    sameAs: [
      "https://orcid.org/0009-0005-3511-0546",
      "https://github.com/oldsixxiaolv",
      "https://www.researchgate.net/profile/Yihang-Lyu",
      "https://blog.csdn.net/lvyihang200411",
      // OpenAlex 作者实体（按 ORCID 精确反查得到，非手写猜测）。
      // sameAs 的作用是让搜索引擎把散落各处的"同一个人"合并成一个实体；
      // OpenAlex 正是这类聚合库的上游，加上它对本条的归属判读更有利。
      "https://openalex.org/A5121394231",
    ],

    // 页面可见的关键词标签。**保持纯英文**——之前这里中英混排（雷暴雷电 /
    // 数据同化 / 机器学习…），在已经全英文的关于页上会戳出刺眼的中文块。
    // 中文名与中文单位仍保留在 alternateName / affiliationZh / education 里，
    // 供 JSON-LD 与将来的中文版使用，不混进英文标签。
    knowsAbout: [
      "Thunderstorm Lightning",
      "Data Assimilation",
      "Machine Learning",
      "Extreme Precipitation",
      "Radar Remote Sensing",
      "Severe Convection",
      "Atmospheric Dynamics",
      "Satellite Precipitation Retrieval",
    ],

    // —— 照片（首页人像卡 / 关于页 / Person JSON-LD 共用）——
    photo: {
      portrait: "/assets/img/author/portrait.jpg",
      portraitSmall: "/assets/img/author/portrait-sm.jpg",
      avatar: "/assets/img/author/avatar.jpg",
      avatarSmall: "/assets/img/author/avatar-sm.jpg",
      portraitSize: { width: 600, height: 750 },
      avatarSize: { width: 600, height: 600 },
      alt: "Yihang Lyu",
    },

    // —— 掌握的能力 ——
    // 来源：本人的本科简历（兰州大学大气科学学院）。分组是为了可扫读，
    // 措辞已改写为第三人称/名词短语，适配英文简历语境。
    skills: [
      {
        group: "Languages & Platforms",
        items: [
          { name: "Python", level: "proficient" },
          { name: "Fortran", level: "proficient" },
          { name: "Linux / Ubuntu", level: "proficient" },
          { name: "WRF model", level: "familiar" },
          { name: "LaTeX", level: "proficient" },
        ],
      },
      {
        group: "Data & Modelling",
        items: [
          { name: "xarray", level: "proficient" },
          { name: "NumPy / Pandas", level: "proficient" },
          { name: "Cartopy", level: "proficient" },
          { name: "netCDF", level: "proficient" },
          { name: "Dask", level: "familiar" },
          { name: "SPSS / STATA", level: "proficient" },
        ],
      },
      {
        group: "Visualisation",
        items: [
          { name: "Matplotlib", level: "proficient" },
          { name: "Leaflet", level: "proficient" },
          { name: "Origin", level: "proficient" },
          { name: "ArcGIS / QGIS", level: "familiar" },
        ],
      },
      {
        group: "Workflow",
        items: [
          { name: "Git", level: "proficient" },
          { name: "Docker", level: "familiar" },
          { name: "GitHub Actions", level: "familiar" },
          { name: "Python (scientific stack)", level: "proficient" },
        ],
      },
    ],
  },

  // ===========================================================================
  //  论文
  // ===========================================================================
  //  字段说明见各条注释。status 非 "published" 的条目模板会加不同角标，
  //  不会与已发表的混为一谈。缺失的可选字段一律不渲染。
  // ===========================================================================
  publications: [
    {
      // 唯一键。论文独立页（src/content/papers/<slug>/paper.md）用 front-matter
      // 的 `pubKey` 指回这里，页面与列表页共用同一份元数据，不会两处走样。
      key: "trmm-stages",
      // 论文详情页的 URL 段。必须与 src/content/papers/ 下的目录名一致
      // （papers.11tydata.cjs 用目录名生成 permalink），否则链接会 404。
      // 两处名字不同是有意的：key 是数据键（稳定语义），slug 是 URL 段
      // （可读性优先，允许日后调整而不动数据键）。
      slug: "trmm-thunderstorm-stages",

      title:
        "New Insights From TRMM Legacy: Stage-Dependent Relationships Between Lightning and Convective Structure in Thunderstorms Over Tropical Africa",

      // 作者改为**结构化数组**（此前是一个逗号分隔的字符串）。
      // 原因：要输出 `citation_author`（Google Scholar 逐条读）、BibTeX 的
      // "姓, 名"、以及作者各自的 ORCID，这三样都需要「名/姓/ORCID 分开」，
      // 从字符串里 split 再猜很容易错位。字符串形式由 authorNames filter
      // 派生，模板不再自己拼。
      // ORCID 来自 Crossref 官方记录（作者自己带 ORCID 提交的那三条）；
      // 没有 ORCID 的作者 orcid 写 null——不编造。
      authorList: [
        { name: "Xueke Wu",  given: "Xueke",  family: "Wu",  orcid: "0000-0001-6144-0120" },
        { name: "Yihang Lyu", given: "Yihang", family: "Lyu", orcid: "0009-0005-3511-0546" },
        { name: "Xiaoqun Hu", given: "Xiaoqun", family: "Hu", orcid: null },
        { name: "Zihao Zhang", given: "Zihao", family: "Zhang", orcid: null },
        { name: "Yuhang Hu",  given: "Yuhang", family: "Hu",  orcid: null },
        { name: "Guohao Hu",  given: "Guohao", family: "Hu",  orcid: "0009-0002-2576-1108" },
        { name: "Xingyi Lin", given: "Xingyi", family: "Lin", orcid: null },
      ],

      journal: "Journal of Geophysical Research: Atmospheres",
      shortJournal: "JGR: Atmospheres",
      publisher: "American Geophysical Union (AGU)",
      issn: { print: "2169-897X", electronic: "2169-8996" },
      volume: "131",
      issue: "11",
      articleNumber: "e2026JD046836",
      pages: null,
      year: 2026,
      month: 6,          // 2026-06-01 在线发表
      doi: "10.1029/2026JD046836",
      url: "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2026JD046836",
      // PDF 直链用 Wiley 的 /doi/pdf/ 形式。Crossref 登记的 vor PDF contentUrl
      // 就是这条（content-type: application/pdf）；此前用的 /doi/epdf/ 是
      // "下载 PDF"的中间页，喂给 Google 的 citation_pdf_url 会被当成网页。
      pdf: "https://agupubs.onlinelibrary.wiley.com/doi/pdf/10.1029/2026JD046836",
      // 出版流程日期（Crossref assertion 字段）。审稿过程对学术主页读者有用。
      dates: { received: "2026-04-04", accepted: "2026-05-22", published: "2026-06-01" },
      // 摘要取自 Crossref 登记的 VOR 摘要（JATS 标签已剥离）。此前站点只有
      // 标题+刊名，读者看不出这篇做了什么；摘要是最缺的那一块。
      abstract:
        "The Tropical Rainfall Measuring Mission (TRMM) satellite provides simultaneous " +
        "radar and lightning observations, offering critical insights into severe convection " +
        "across regional and global scales; however, its snapshot nature constrains research on " +
        "thunderstorm evolution. To address this, establishing a clustering framework is " +
        "essential for understanding the stage-dependent relationship between lightning and " +
        "radar echo structural features and for improving lightning parameterization schemes. " +
        "Using 16 years of TRMM observations from tropical Africa, the global hotspot for " +
        "lightning and thunderstorms, we developed a machine learning-based K-means clustering " +
        "method that classifies snapshot thunderstorms by their radar echo structure. Based on " +
        "this classification, compact storms were further grouped into three clusters, which " +
        "effectively capture the physical processes of thunderstorm evolution and are " +
        "consistent with the known life cycle characteristics; therefore, they are identified as " +
        "Pre-Mature, Mature, and Post-Mature stages. Mature-stage storms are, unsurprisingly, the " +
        "strongest. In comparison, the other two stages, reflecting the trade-off between " +
        "convective intensity and horizontal scale, Pre-Mature storms show smaller horizontal " +
        "scales yet higher lightning density (per unit area) despite comparable lightning flash " +
        "rates, while Post-Mature storms exhibit the reverse (larger scales accompanied by lower " +
        "lightning density). Accordingly, the stage-dependent relationships between lightning " +
        "activity and convective intensity are examined. Similar correlation coefficients, but " +
        "distinct linear fitting parameters, are observed across stages, revealing stage-specific " +
        "electrification mechanisms and emphasizing the necessity of stage-dependent analysis. By " +
        "emphasizing stage-dependent analysis, this work advances the understanding of severe " +
        "storm dynamics over tropical Africa and extends the utility of snapshot observations " +
        "from precipitation radar onboard low-Earth-orbit satellites.",
      // 关键词：论文主题 ∪ 站点 knowsAbout（**并集**，不是交集——TRMM、
      // radar echo structure、tropical Africa 只来自论文，data assimilation、
      // machine learning 只来自 knowsAbout）。
      // citation_keywords 供 Google Scholar 检索用，页面上也作为可见标签展示。
      keywords: [
        "thunderstorm",
        "lightning",
        "TRMM",
        "radar echo structure",
        "convective organization",
        "data assimilation",
        "machine learning",
        "tropical Africa",
      ],
      // 开放获取状态。Unpaywall 查得 oa_status = closed（付费墙内）。
      // ⚠️ 此前 paper.njk 的 JSON-LD 把 isAccessibleForFree 写死成 true，
      // 对一篇非开放获取的论文来说那是**假声明**，搜索引擎会当真。改为数据驱动。
      openAccess: false,
      status: "published",     // 已于 2026-06-01 在线发表，2026-05-22 接收
      role: "co",              // 第二作者
      affiliation: "Lanzhou University",
      affiliationZh: "兰州大学 · 干旱区教育部重点实验室",
      // 本人的数据/软件产出：Zenodo 上第一作者。
      //
      // ⚠️ 这里有一个容易踩的坑：Zenodo 的一个"概念"（concept）下面有多个
      // 版本 DOI，而**同一个概念可以改标题**。本条数据的情况是：
      //   概念 DOI  10.5281/zenodo.16662143
      //     ├─ v1.0  10.5281/zenodo.16662144  标题 "Thunderstorms stage identification"，2025-08-01
      //     └─ v2.0  10.5281/zenodo.18041880  标题改成论文标题，2026-06-09（发表时更新）
      // 论文参考文献表里那条（Crossref reference [29]）写的是
      //   "Lyu Y.(2025). Thunderstorms stage identification[Software].Zenodo.
      //    https://doi.org/10.5281/zenodo.18041880"
      // —— 标题沿用 v1.0 时期的名字，DOI 指向 v2.0。这是作者投稿时的真实写法，
      // 本站与论文保持一致（读者照论文里的引用去查，能查到同一条记录）。
      //
      // conceptDoi 另给一个"所有版本"DOI：Zenodo 的规范做法是——要引用
      // "你用的那一版"就用版本 DOI，要引用"这个数据集整体"就用概念 DOI
      // （概念 DOI 永远指向最新版，标题改了也不会失效）。给两个，读者自选。
      software: {
        // ⚠️ 标题是复数 "Thunderstorms"：论文参考文献表里那条写的就是
        // "Thunderstorms stage identification"（Crossref reference 实测）。
        // 少了 s 会和论文里的写法对不上，读者按论文去 Zenodo 核对时看着像另一个东西。
        label: "Thunderstorms stage identification",
        // —— v2.0 在 Zenodo 上**当前登记的标题**（DataCite 逐字核对）——
        // 读者点开 DOI 看到的就是这个标题。它与上面的 label（= citeTitle，
        // 论文参考文献表里那条的写法）不同：同一个 Zenodo 概念允许改标题，
        // v2.0 发布时把标题改成了论文标题。
        //
        // 页面与结构化数据都用这一条当"数据集的名字"——登记名与页面显示名
        // 不一致才是真问题。而**引用条目**（BibTeX）仍用 citeTitle，与论文
        // 参考文献表逐字一致：那是"读者在自己论文里怎么写"的问题，
        // 两种口径各管各的，页面把两个标题都摆出来并说明差异，
        // 不替作者选边（见 IMPROVEMENT-LOG.md 待决策段）。
        registeredTitle:
          "New Insights from TRMM Legacy: Stage-Dependent Relationships Between " +
          "Lightning and Convective Structure in Thunderstorms Over Tropical Africa",
        author: "Lyu, Y. (2025)",
        doi: "10.5281/zenodo.18041880",
        url: "https://doi.org/10.5281/zenodo.18041880",
        // ↓ 以下取自 https://api.datacite.org/dois/10.5281/zenodo.18041880
        //    （第十三轮重新拉取逐字核对：resourceType=Dataset、version=2.0、
        //    license=CC BY 4.0、registeredTitle、conceptDoi 均与登记一致）
        resourceType: "Dataset",
        version: "2.0",
        // ⚠️ publisher 是**唯一**没照抄登记的一项：DataCite 登记里它是
        //    "Lyu yihang"（Zenodo 把数据作者填进 publisher 字段），
        //    而 "Zenodo" 是 Zenodo 自己导出的 BibTeX 里 publisher 的通行写法。
        //    引用条目里写 "Zenodo" 才是 Zotero / 读者认的形态 → 保持不变。
        publisher: "Zenodo",
        license: "CC BY 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        // 引用用的年份与标题：与论文参考文献表里的那条完全一致，
        // 这样论文和本站给出的引用对得上，不会出现"同一份数据两个年份"。
        citeTitle: "Thunderstorms stage identification",
        citeYear: 2025,
        citeAuthor: "Lyu, Yihang",
        // ⚠️ citeVersion **故意留空（null）**：这条引用的标题沿用 v1.0 时期的
        // 写法（与论文参考文献表逐字一致），DOI 指向的却是 v2.0。若再补一个
        // version = 2.0，条目就成了"v1.0 的标题 + v2.0 的版本号 + v2.0 的 DOI"，
        // 自相矛盾。论文原文那条也没有版本号，这里同样不加。
        citeVersion: null,
        // "所有版本"DOI（概念 DOI）。上面 doi 指向的 v2.0 将来若被 v3.0
        // 取代，概念 DOI 仍能解析到最新一版。
        conceptDoi: "10.5281/zenodo.16662143",
        conceptUrl: "https://doi.org/10.5281/zenodo.16662143",
      },
      code: "https://github.com/oldsixxiaolv/Manuscript_Lvyh",
      // Code Ocean 可复现计算胶囊：整篇论文的代码 + 数据 + 运行环境打包成
      // 一个可一键重跑的 capsule，DOI 已注册（DataCite，10.24433 前缀）。
      // 这是同行评审里最认的"可复现性"证据，比单纯给个 GitHub 仓硬得多。
      // DOI 来自本人在 Zenodo 数据集描述里的说明，已用 DataCite API 核对：
      //   https://api.datacite.org/dois/10.24433/CO.6720035.v1
      capsule: {
        label: "Code Ocean capsule",
        doi: "10.24433/CO.6720035.v1",
        url: "https://codeocean.com/capsule/5084350/tree/v1",
        // ↓ 以下取自 https://api.datacite.org/dois/10.24433/CO.6720035.v1
        // DataCite 登记的 resourceTypeGeneral 是 "Software"（胶囊是软件制品）；
        // resourceType 这里放给人看的 "Capsule"，dataciteType 保留登记原值。
        resourceType: "Capsule",
        dataciteType: "Software",
        version: "1.0",
        publisher: "Code Ocean",
        license: "Apache-2.0",
        licenseUrl: "http://www.apache.org/licenses/LICENSE-2.0",
        // 引用标题必须**逐字等于 DataCite 登记标题**：
        // "New Insights from TRMM Legacy: Stage-Dependent Relationships Between
        // Lightning and Convective Structure in Thunderstorms Over Tropical Africa"。
        // 不要自己加后缀（如"— reproducible capsule"）——那样生成的引用
        // 在 Code Ocean / DataCite 侧对不上任何已登记记录。
        citeTitle:
          "New Insights from TRMM Legacy: Stage-Dependent Relationships Between " +
          "Lightning and Convective Structure in Thunderstorms Over Tropical Africa",
        citeYear: 2026,
        citeAuthor: "Lyu, Yihang",
        // 胶囊的引用要写清版本：它的标题 / DOI / 版本号三者本来就一致
        // （DataCite 登记的 v1.0，标题也是登记原题），没有上面数据集那种
        // "v1.0 标题 + v2.0 DOI" 的错位。
        citeVersion: "1.0",
      },
      // 基金资助。学术主页标注基金号是硬性惯例——资助方与项目号要能被检索到。
      // 来源：兰州大学大气科学学院对该成果的官方报道。
      funding: [
        { id: "42275068", agency: "National Natural Science Foundation of China" },
        { id: "20250030065", agency: "National Innovation and Entrepreneurship Training Program" },
      ],
      figure: {
        src: "/assets/img/publications/trmm-fig10.jpg",
        width: 1400,
        height: 745,
        alt:
          "Fig. 10 — Three-dimensional structural profiles of Pre-Mature, Mature and Post-Mature thunderstorms (a, violin plots stratified by 20/30/40 dBZ) and the corresponding cumulative distributions of lightning rate and 40 dBZ flash density (b–d).",
        caption:
          "Mean three-dimensional structural features (a) and lightning activity (b–d) for different thunderstorm stages based on TRMM satellite data.",
      },
    },
  ],

  // ===========================================================================
  //  社交 / 页脚链接
  // ===========================================================================
  //  RSS 不放在这里：订阅源走 <link rel="alternate"> 与页脚的独立入口
  //  （feed.njk / footer.njk），那是浏览器的"订阅"语义，不是"社交身份"。
  //  ⚠️ 此前这里留着一句"站点已不再提供 RSS"的注释——那是内容归档期的状态，
  //  2026-10-19 第一轮已把 /feed.xml 恢复，注释没跟着改，属于过期文档。
  social: [
    { label: "GitHub", href: "https://github.com/oldsixxiaolv" },
    { label: "ORCID", href: "https://orcid.org/0009-0005-3511-0546" },
    { label: "ResearchGate", href: "https://www.researchgate.net/profile/Yihang-Lyu" },
    { label: "CSDN", href: "https://blog.csdn.net/lvyihang200411" },
    { label: "Email", href: "mailto:lvyihang26@mails.ucas.ac.cn" },
  ],
};
