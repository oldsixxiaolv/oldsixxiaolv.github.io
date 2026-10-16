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

  url: "https://oldsixxiaolv.github.io/MeteoHub",
  locale: "zh-CN",
  buildYear: new Date().getFullYear(),

  // —— 主导航 ——
  // 只保留站点真正存在的版块。论文精读 / 作品集 曾是独立页面，现改为
  // 首页与博客里的内容，不再作为顶层入口。
  nav: [
    { label: "Home", href: "/" },
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
    affiliationUrl: "https://www.iap.cas.cn/",
    affiliationEn: "Institute of Atmospheric Physics, Chinese Academy of Sciences",

    // 双单位：博士在兰州大学，现在在���科院大气所
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
    researchgate: "https://www.researchgate.net/profile/Yihang-Lv-4",
    zenodo: "https://doi.org/10.5281/zenodo.18041880",

    // 源码仓库。页脚的「Edit on GitHub」用它拼 /edit/<branch>/<path> 直达
    // GitHub 网页编辑器——静态站没有后端，这是唯一不需要自建登录就能改内容的
    // 路径，且只有有推送权限的人能提交（改完由 CI 自动重新构建上线）。
    repo: "https://github.com/oldsixxiaolv/MeteoHub",
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
    sameAs: [
      "https://orcid.org/0009-0005-3511-0546",
      "https://github.com/oldsixxiaolv",
      "https://www.researchgate.net/profile/Yihang-Lv-4",
      "https://blog.csdn.net/lvyihang200411",
      "mailto:lvyihang26@mails.ucas.ac.cn",
    ],

    knowsAbout: [
      "Thunderstorm Lightning",
      "Data Assimilation",
      "Machine Learning",
      "Extreme Precipitation",
      "Radar Remote Sensing",
      "Severe Convection",
      "Atmospheric Science",
      "雷暴雷电",
      "数据同化",
      "机器学习",
      "极端降水",
      "强对流天气",
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
      title:
        "New Insights From TRMM Legacy: Stage-Dependent Relationships Between Lightning and Convective Structure in Thunderstorms Over Tropical Africa",
      authors:
        "Xueke Wu, Yihang Lyu, Xiaoqun Hu, Zihao Zhang, Yuhang Hu, Guohao Hu, Xingyi Lin",
      journal: "Journal of Geophysical Research: Atmospheres",
      shortJournal: "JGR: Atmospheres",
      volume: "131",
      issue: "11",
      articleNumber: "e2026JD046836",
      pages: null,
      year: 2026,
      month: 6,          // 2026-06-01 在线发表
      doi: "10.1029/2026JD046836",
      url: "https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2026JD046836",
      pdf: "https://agupubs.onlinelibrary.wiley.com/doi/epdf/10.1029/2026JD046836",
      status: "published",     // 已于 2026-06-01 在线发表，2026-05-22 接收
      role: "co",              // 第二作者
      affiliation: "Lanzhou University",
      affiliationZh: "兰州大学 · 干旱区教育部重点实验室",
      // 本人的数据/软件产出：Zenodo 上第一作者
      software: {
        label: "Thunderstorm stage identification",
        author: "Lyu, Y. (2025)",
        doi: "10.5281/zenodo.18041880",
        url: "https://doi.org/10.5281/zenodo.18041880",
      },
      code: "https://github.com/oldsixxiaolv/Manuscript_Lvyh",
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
  //  ⚠️ 这里不要出现 feed / RSS：站点已不再提供 RSS。
  social: [
    { label: "GitHub", href: "https://github.com/oldsixxiaolv" },
    { label: "ORCID", href: "https://orcid.org/0009-0005-3511-0546" },
    { label: "ResearchGate", href: "https://www.researchgate.net/profile/Yihang-Lv-4" },
    { label: "CSDN", href: "https://blog.csdn.net/lvyihang200411" },
    { label: "Email", href: "mailto:lvyihang26@mails.ucas.ac.cn" },
  ],
};
