/**
 * 自测档位静态清单 —— 缺陷 D71 的修法核心（集中登记表）。
 *
 * 为什么要有这个文件：
 *   2026-10-22 实测：全仓接在 build 链上的 `scripts/test-*.cjs`
 *   里，只有 readme / figure-cover / css-publish 这几个自己带了「档位清单守卫」，
 *   其余的绝大多数只断言"跑过的档位按预期触发"——**不核对"该跑的档位都跑了"**。
 *   后果：把某档从自测里删掉，矩阵照样全绿（少跑一档没人看得出来）。
 *   这一族正是"看起来在、其实不生效"的变体。
 *
 * 这里放什么：
 *   · SLOTS —— **每个自测每次跑完应当出现的行首编号**（静态声明，独立于各自测实现）。
 *     登记的是"编号 + 出现次数"（同一编号出现多次就登记多次）：
 *     实测全仓有若干自测存在"多档共用一个编号"的情况（实测 D11 / DY11 / C1 等），
 *     只比集合的话，删掉其中一档编号还在 ⇒ 守卫看不见；按次数比才守得住。
 *   · NOISE —— 行首有编号、但那一行**不是一档**的编号（收尾汇总行 / 辅助自检行）。
 *     噪声不参与比对：它不是档位，门禁改判据编号时不该把它算进来。
 *
 * 为什么是集中登记，而不是给每个自测各写一份：
 *   各自测的结构差异极大（CASES 数组型 / 硬编码流程型 / results 数组型 / 动态生成档位号型），
 *   逐个加守卫要改几百处、逐文件写硬编码清单，出错率极高。
 *   集中登记还有一个更重要的好处：**这份清单独立于各自测实现**——
 *   删掉自测里的某一档，清单不会跟着变 ⇒ 守卫当场红（这才是"独立声明"，
 *   从实现反推的清单删档时会一起变，等于没守）。
 *
 * ⚠️ 诚实边界（写清楚才算数）：
 *   · 守卫只能看见**打了行首编号**的档。有个别档位行不打编号（实测：css-braces 的
 *     「COV 覆盖度自证」、identity-derivation 的「ID6c' …」），删掉它们守卫看不见。
 *   · 编号是行首第一个 token；正文里出现的编号（如「门禁 A8：…」）不算档位号。
 *   · 本清单随自测演进而变：**改了自测的档位集合，就要同步改这里**（改完记得在
 *     docs/IMPROVEMENT-LOG.md 里记一笔，别让它悄悄漂）。
 */
const SLOTS = {
  "test-404-depth.cjs": [
    "N0", "N1", "N2", "N3", "N4", "NC1", "NC2", "NC3",
    "NC4"
  ],
  "test-a11y-contrast.cjs": [
    "C0", "C0", "C1", "C1", "C1", "C2", "C2", "C3",
    "C3", "C4", "C4", "C5", "C5"
  ],
  "test-about-dataset.cjs": [
    "AT0", "AT1", "AT2", "AT3", "AT4", "AT5", "AT6", "AT7",
    "AT8", "AT9", "AT10", "AT11", "AT12", "AT13", "AT14"
  ],
  "test-artifact-metadata.cjs": [
    "G0", "G1", "G2", "G3", "M1a", "M1b", "M2a", "M3a",
    "M3b", "M4a", "M5a", "M6a", "M7a", "M8a", "N-M1", "N-M2",
    "N-M3", "N-M4", "N-M5", "N-M6", "N-M7", "N-M8", "P-M1", "P-M7",
    "COV-A", "COV-B"
  ],
  "test-author-assets.cjs": [
    "AT0", "AT1", "AT2", "AT3", "AT4", "AT5", "AT6", "AT7",
    "AT8", "AT9", "AT10", "AT11", "AT12", "AT13", "AT14", "AT15"
  ],
  "test-block-language.cjs": [
    "BL0", "BL1", "BL2", "BL3a", "BL3b", "BL4", "BL5a", "BL5b",
    "BL6", "BL7", "BL8a", "BL8b"
  ],
  "test-blog-frontmatter.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7",
    "M8", "M9", "M10", "M11", "M12", "M13", "M14", "M15",
    "M16", "M17", "M18", "M19"
  ],
  "test-citation-cff.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7",
    "M8", "M9"
  ],
  "test-citation-meta.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7",
    "M8", "M9", "M10", "M11", "M12", "M13", "M14", "M15"
  ],
  "test-copy-export.cjs": [
    "G1", "G2", "G3", "G4", "G5", "CE1", "CE2", "CE3",
    "CE4", "CE5", "CE6", "CE7", "CE8a", "CE8b", "CE9", "N-CE1",
    "N-CE2", "N-CE3", "N-CE4", "N-CE5", "N-CE6", "N-CE7", "N-CE8", "N-CE9",
    "P-CE4"
  ],
  "test-css-braces.cjs": [
    "G0", "G1", "G2", "G3", "G4", "CB1a", "CB1b", "CB1c",
    "CB1d", "CB2", "CB2b", "CB3a", "CB3b", "CB4", "CB4pkg", "N-CB1",
    "N-CB2", "N-CB2", "N-CB3", "N-CB3", "N-CB4", "P-CB3", "COV2a", "COV2b",
    "COV2c", "COV2d", "COV2e", "COV2f"
  ],
  "test-css-comment-weight.cjs": [
    "CW0", "CW1a", "CW1b", "CW2", "CW3a", "CW3b", "CW4a", "CW4b",
    "CW5", "CW6", "CW7", "CW8", "CQ1a", "CQ1b", "CQ2a", "CQ2b",
    "CQ3a", "CQ3b", "CQ3c", "CQ1n", "CQ2n", "CQ3n"
  ],
  "test-css-publish.cjs": [
    "CU0", "CU0b", "CU22", "CU1", "CU2", "CU3", "CU4", "CU5",
    "CU6", "CU7", "CU8", "CU9", "CU10", "CU11", "CU19", "CU20",
    "CU12", "CU13", "CU14", "CU15", "CU16", "CU17", "CU18", "CU21",
    "CU23", "CU24"
  ],
  "test-dead-css.cjs": [
    "DY0", "DY1", "DY2", "DY3", "DY4", "DY5", "DY6", "DY7",
    "DY8", "DY8", "DY9", "DY10", "DY11", "DY11", "DY11", "DY12"
  ],
  "test-decision-ids.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7",
    "M8", "M9", "M10", "M11", "M12", "M13"
  ],
  "test-design-system-contract.cjs": [
    "DT0", "DT1", "DT2", "DT3", "DT4", "DT5", "DT6", "DT7",
    "DT8", "DT9", "DT10"
  ],
  "test-doc-snapshot.cjs": [
    "SP0", "SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "SP7",
    "SP8", "SP9", "SP10", "SP11", "NC-DS1", "NC-DS2", "NC-DS3", "NC-DS4",
    "COV2a", "COV2b", "COV2c", "COV2d", "COV2e", "COV2f", "COV2g"
  ],
  "test-feed-discovery.cjs": [
    "FT0", "FT1", "FT2", "FT3", "FT4", "FT5", "FT6", "FT7",
    "FT8", "FT9", "FT10", "FT11", "FT12", "FT13", "FT14", "FT15",
    "FT16", "FT17", "FT18", "FT19", "FT20"
  ],
  "test-feed-title.cjs": [
    "FZ0", "FZ1", "FZ2", "FZ3", "FZ4", "FZ5", "FZ6", "FZ7",
    "FZ8", "FZ9", "FZ10", "FZ11", "FZ12", "FZ13", "FZ14", "FZ15",
    "FZ16"
  ],
  "test-figure-cover.cjs": [
    "SP0", "SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "SP7",
    "SP8", "SP9", "SP10", "SP11", "SP12", "SP13", "SP14", "SP15",
    "SP16", "SP17", "SP18", "SP19", "SP20", "SP21", "SP22", "NC-CV1",
    "NC-CV2", "NC-CV3", "NC-CV4", "COV1", "COV2", "COV3", "COV4", "COV5",
    "COV6", "COV7"
  ],
  "test-focus-ring.cjs": [
    "FS0", "FS1", "FS2", "FS3", "FS4", "FS5", "FS6", "FS7",
    "FS8", "FS9", "FS10", "FS11", "FS12", "FS13", "FS14", "FS15",
    "FS16", "FS17", "FS18", "FS19", "FS20", "FS21", "FS22", "FS23",
    "FS24", "FS25"
  ],
  "test-home-chart.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7",
    "M8", "M9", "M10", "M11", "M12", "M13", "M14", "M15",
    "M16", "M17", "M18", "M19", "M20", "M21", "M22", "M23",
    "M24"
  ],
  "test-identity-derivation.cjs": [
    "G0", "G1", "G2", "G3", "ID0a", "ID1a", "ID2a", "ID3a",
    "ID4a", "ID5a", "ID6a", "ID6b", "ID6c", "ID6d", "ID7a", "N-ID0",
    "N-ID1", "N-ID2", "N-ID3", "N-ID4", "N-ID5", "N-ID6a", "N-ID6b", "N-ID6c",
    "N-ID6d", "N-ID7", "P-ID1", "P-ID7", "COV-A", "COV-B", "RE-1", "RE-2",
    "RE-3"
  ],
  "test-identity-handles.cjs": [
    "IH0", "IH1", "IH2", "IH3", "IH4", "IH5", "IH6", "IH7",
    "IH8", "IH9", "IH10", "IH11", "IH12", "IH13", "IH14", "IH15",
    "IH16", "IH35", "IH29", "IH17", "IH18", "IH19", "IH20", "IH21",
    "IH22", "IH30", "IH23", "IH24", "IH25", "IH26", "IH27", "IH28",
    "IH36", "IH31", "IH32", "IH33", "IH34", "NC1", "NC2", "NC3",
    "NC4", "NC5", "NC6", "NC7", "NC8", "NC9", "NC10", "NC11",
    "NC12", "NC13", "NC14", "NC15", "NC16", "NC17", "NC18", "NC19",
    "NC20", "NC21", "NC22", "NC23", "NC24", "NC25", "NC26", "NC27",
    "NC28", "NC29", "NC30"
  ],
  "test-image-assets.cjs": [
    "IM0", "IM1", "IM2", "IM3", "IM4", "IM5", "IM6", "IM7",
    "IM8", "IM9", "IM10", "IM11", "IM12", "IM13", "IM14", "IM15",
    "IM16", "IM17", "IM18", "IM19"
  ],
  "test-img-loading.cjs": [
    "IS0", "IS1", "IS2", "IS3", "IS4", "IS5", "IS6", "IS7",
    "IS8", "IS9", "IS10", "IS11", "IS12", "IS13", "IS14", "IS15",
    "IS16"
  ],
  "test-img-publish.cjs": [
    "IU0", "IU1", "IU2", "IU3", "IU4", "IU5", "IU6", "IU7",
    "IU8", "IU9", "IU10"
  ],
  "test-img-srcset.cjs": [
    "ST0", "ST1", "ST2", "ST3", "ST4", "ST5", "ST6", "ST7",
    "ST8", "ST9", "ST10", "ST11", "ST12", "ST13", "ST14", "ST15",
    "ST16"
  ],
  "test-js-targets.cjs": [
    "JB0", "JB1", "JB2", "JB3", "JB4", "JB5", "JB6", "JB7",
    "JB8", "JB9", "JB10", "JB10", "JB10", "JB10", "JB11", "JB12",
    "JB13", "JB14"
  ],
  "test-jsonld.cjs": [
    "G0", "G1", "G2", "G3", "J0", "J1", "J2", "J3",
    "J4", "J5", "J6", "J7", "J8", "J9", "J10", "J11",
    "J11b", "J12", "N-J0", "N-J1", "N-J2", "N-J3", "N-J4", "N-J5",
    "N-J6", "N-J7", "N-J8", "N-J9", "N-J10", "N-J11", "N-J11b", "N-J12",
    "P-J10a", "P-J10b", "P-J11a", "RE-1", "RE-2", "RE-3"
  ],
  "test-lang.cjs": [
    "LG0", "LG1", "LG1b", "LG2", "LG2b", "LG3", "LG4", "LG5",
    "LG6", "LG7", "LG8", "LG9", "LG10", "LG11", "LG12", "LG13",
    "LG14", "LG15", "LG16", "LG17", "LG18", "LG19", "LG20", "LG21",
    "LG22", "LG23", "LG24", "LG25"
  ],
  "test-live-site.cjs": [
    "M0", "M1", "M2", "M3", "M4", "M5", "M6"
  ],
  "test-mount-contract.cjs": [
    "MT0", "MT0r", "MT1", "MT2", "MT3", "MT4", "MT5", "MT6",
    "MT7", "MT8", "MT9", "MT10", "MT11", "NC1", "NC2", "NC3",
    "NC4"
  ],
  "test-navigation-contract.cjs": [
    "NT0", "NT1", "NT2", "NT3", "NT4", "NT5", "NT6", "NT7",
    "NT8"
  ],
  "test-overflow-anchors.cjs": [
    "A0", "A0", "A1", "A1", "A1", "A1", "A2", "A3",
    "A4", "A5", "A6", "A7"
  ],
  "test-overflow-targets.cjs": [
    "T0", "T1", "T1", "T1", "T1", "T2", "T3", "T4",
    "T5"
  ],
  "test-overflow-widths.cjs": [
    "M1", "M2", "M2", "M1", "M1", "M1", "M1", "M1",
    "M1", "M1", "M1", "M1", "M1", "M1", "M1", "M1",
    "M1", "M1", "M1", "M1", "M1", "M1", "M1", "M1",
    "M0", "M0", "M0", "M0", "M0", "M0", "M0", "M0",
    "M2", "M3", "M3", "M3", "M3", "M3", "M3", "M3",
    "M3", "M4", "M4", "M5", "M5", "M5", "M5", "M5",
    "M6", "M6", "M6", "M5", "M5", "M5", "M5"
  ],
  "test-page-deps.cjs": [
    "LT0", "LT1", "LT2", "LT3", "LT4", "LT5", "LT6", "LT7",
    "LT7"
  ],
  "test-print-theme.cjs": [
    "PT0", "PT1", "PT2a", "PT2b", "PT2c", "PT3a", "PT3b", "PT3c",
    "PT3d", "PT4a", "PT4b", "PT5", "PT6a", "PT6b", "PT6c", "PT6d",
    "PT7a", "PT7b", "PT7c", "PT8", "PT9", "PT10", "PT11", "PT12",
    "PT13", "PT14", "PT15"
  ],
  "test-readme.cjs": [
    "SP0", "SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "SP7",
    "SP8", "SP9", "SP10", "SP11", "SP12", "SP13", "SP14", "SP15",
    "SP16", "SP17", "SP18", "SP19", "SP20", "SP21", "SP22", "NC-RD1",
    "NC-RD2", "NC-RD3", "NC-RD4", "NC-RD5", "NC-RD6", "NC-RD7", "NC-E1", "NC-E2",
    "NC-E3", "NC-E4", "COV2a", "COV2b", "COV2c", "COV2d", "COV2e", "COV2f",
    "COV2g"
  ],
  "test-selftest-guard.cjs": [
    "MSG0", "MSG1", "MSG2", "MSG3", "MSG4", "MSG5", "MSG6", "MSG7",
    "MSG8"
  ],
  "test-site-js.cjs": [
    "JT0", "JT1", "JT2", "JT3", "JT4", "JT5", "JT6", "JT7",
    "JT8", "JT9", "JT10", "JT11", "JT12", "JT13", "JT14", "JT15",
    "JT16", "JT17"
  ],
  "test-site-language.cjs": [
    "TX0", "TX1", "TX2", "TX3", "TX4", "TX5", "TX6"
  ],
  "test-tag-leak.cjs": [
    "N0", "N1", "N2", "N3", "N4", "N5", "N6", "N7",
    "N8", "N9", "N10", "NC1", "NC2", "NC3", "NC4", "NC5"
  ],
  "test-target-blank-rel.cjs": [
    "GB0", "GB1", "GB2", "GB3", "GB4", "GB5", "GB6", "GB7",
    "GB8", "GB9", "GB10", "GB11", "GB12", "GB13", "GB14", "GB15",
    "GB16", "GB17", "GB18", "GB19", "GB20", "GB21", "GB22"
  ],
  "test-third-party.cjs": [
    "TD0", "TD1a", "TD1b", "TD1c", "TD2a", "TD2b", "TD2c", "TD3a",
    "TD3b", "TD4a", "TD4b", "TD4c", "TD4d", "TD5a", "TD5b", "TD1n",
    "TD2n", "TD3n", "TD4n", "TDW1", "TDW2"
  ],
  "test-tool-routes.cjs": [
    "TT0", "TT1", "TT2", "TT3", "TT4", "TT5", "TT6", "TT7",
    "TT8", "TT9", "TT10", "TT11", "TT12", "TT13", "TT14"
  ],
  "test-tracked-refs.cjs": [
    "G0", "G1", "G2", "T1a", "T1b", "T2a", "T2b", "T3",
    "T4a", "T4b", "N-TR1", "N-TR2", "N-TR3", "N-TR4", "P-TR4", "P-TR3",
    "COV-A", "COV-B"
  ],
  "test-verify-site.cjs": [
    "G-BASE", "INJ-0", "NEG-0", "INJ-1", "NEG-1", "INJ-2", "NEG-2", "INJ-3",
    "NEG-3", "INJ-4b", "NEG-4b", "INJ-4c", "NEG-4c", "INJ-5", "NEG-5", "INJ-6",
    "NEG-6", "INJ-7", "NEG-7", "INJ-8", "NEG-8", "INJ-9", "NEG-9", "INJ-10",
    "NEG-10", "INJ-11", "NEG-11", "INJ-12", "NEG-12", "INJ-13", "NEG-13", "INJ-14",
    "NEG-14", "INJ-15", "NEG-15", "INJ-16", "NEG-16", "INJ-17", "NEG-17", "INJ-18",
    "NEG-18", "INJ-19", "NEG-19", "INJ-20", "NEG-20", "INJ-21", "NEG-21", "INJ-22",
    "NEG-22", "INJ-23", "NEG-23", "INJ-25", "NEG-25", "INJ-26", "NEG-26", "INJ-27",
    "NEG-27", "INJ-28", "NEG-28", "INJ-24", "NEG-24", "INJ-29", "NEG-29", "INJ-30",
    "NEG-30", "INJ-31", "NEG-31", "INJ-32", "NEG-32", "INJ-33", "NEG-33", "P-33a",
    "P-33b", "P-33c", "R-1", "R-2", "G-IMMUT"
  ],
  "test-wrapping.cjs": [
    "G0", "G1", "G2", "G3", "G4", "G5", "W1a", "W1b",
    "W1c", "W2a", "W2b", "W2c", "W2d", "W2e", "W3", "W4a",
    "W4b", "N-W1", "N-W2", "N-W3", "N-W4", "P-W4", "COV-A", "COV-B"
  ],
};

/**
 * 噪声编号：行首有编号但**不是一档**的行（收尾汇总 / 辅助自检）。
 * 键是自测文件名（basename），值是要从观测里减掉的编号。
 */
const NOISE = {
  "test-a11y-contrast.cjs": ["A8"],
};

module.exports = { SLOTS, NOISE };
