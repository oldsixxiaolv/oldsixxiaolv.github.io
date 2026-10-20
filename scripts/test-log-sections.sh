#!/bin/bash
# 「日志节不得消失」门禁的故障注入自测。
#
# 为什么要有这个脚本：
#   门禁自己也需要被证伪过。否则"门禁在工作"又是一句没人看守的话。
#   而且只断言**退出码**是不够的 —— 退出码只证明"有东西被抓住了"，
#   不证明"是被设计的那条判据抓住的"。所以下面每条用例都额外断言
#   **输出里出现的判据名 / 名字**，红因与设计意图不符即判失败。
#
# 用法：bash scripts/test-log-sections.sh
# 沙箱建在 mktemp -d 出来的临时目录里，不碰仓库工作树。
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
GATE="$DIR/check-log-sections.cjs"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/mh-lsgate-test-XXXXXX")"
trap 'rm -rf "$BASE"' EXIT

PASS=0; FAIL=0
say() { printf '\n=== %s ===\n' "$1"; }
# 断言：命令退出码为 0，且输出含某串
expect_ok()   { local name="$1" out="$2" code="$3"
  if [ "$code" = 0 ]; then echo "  ✓ $name（exit 0）"; PASS=$((PASS+1));
  else echo "  ✗ $name 期望 exit 0，实得 $code"; echo "$out" | sed 's/^/      /'; FAIL=$((FAIL+1)); fi; }
# 断言：命令退出码非 0，且输出里出现指定的判据关键词（红因断言）
expect_red()  { local name="$1" out="$2" code="$3"; shift 3
  if [ "$code" = 0 ]; then echo "  ✗ $name 期望红，实际是绿 —— 门禁没抓住这个场景"; FAIL=$((FAIL+1)); return; fi
  local miss=""
  for kw in "$@"; do echo "$out" | grep -qF -- "$kw" || miss="$miss [$kw]"; done
  if [ -z "$miss" ]; then echo "  ✓ $name（红，红因为设计的那条判据）"; PASS=$((PASS+1));
  else echo "  ✗ $name 红了，但红因里缺:$miss —— 抓到的不是设计的那条判据"; echo "$out" | sed 's/^/      /'; FAIL=$((FAIL+1)); fi; }

# 建一个沙箱仓库：累积追加日志（只增不减），最后按 KILL 决定是否发生"删节事故"
build_repo() {
  local SB="$1" KILL="$2"
  mkdir -p "$SB/scripts" "$SB/docs"
  cp "$GATE" "$SB/scripts/check-log-sections.cjs"
  ( cd "$SB" || exit 1
    git init -q . && git config user.email injector@example.com && git config user.name injector
    printf '# 注入用日志\n\n## 待决策（需要本人拍板，任务不会自己动）\n\n- 注入用的一条登记条目（沙箱）\n\n---\n' > docs/IMPROVEMENT-LOG.md
    git add -A >/dev/null && git commit -qm "chore: 建带中央待决策段的空日志"
    for i in 2 3 4 5 6 7 8 9 10 11; do
      printf '## 场次 %02d：铺垫节\n' "$i" >> docs/IMPROVEMENT-LOG.md
      git add -A >/dev/null && git commit -qm "docs(log): 铺垫 $i"
    done
    printf '## 2026-10-19 · 注入场次：会被扫掉的一节\n\n这一节随后被一次提交整节扫掉。\n' >> docs/IMPROVEMENT-LOG.md
    git add -A >/dev/null && git commit -qm "docs(log): 新增注入用的一节"
    if [ "$KILL" = yes ]; then
      grep -v '会被扫掉的一节' docs/IMPROVEMENT-LOG.md > docs/IMPROVEMENT-LOG.md.tmp
      mv docs/IMPROVEMENT-LOG.md.tmp docs/IMPROVEMENT-LOG.md
      git add -A >/dev/null && git commit -qm "docs(log): 模拟并发事故——把整节扫掉"
    elif [ "$KILL" = heal ]; then
      grep -v '会被扫掉的一节' docs/IMPROVEMENT-LOG.md > docs/IMPROVEMENT-LOG.md.tmp
      mv docs/IMPROVEMENT-LOG.md.tmp docs/IMPROVEMENT-LOG.md
      git add -A >/dev/null && git commit -qm "docs(log): 事故：把整节扫掉"
      printf '## 2026-10-19 · 注入场次：会被扫掉的一节\n\n这一节随后被一次提交整节扫掉。\n' >> docs/IMPROVEMENT-LOG.md
      git add -A >/dev/null && git commit -qm "docs(log): 恢复：补回该节"
    else
      printf '\n（对照沙箱：无删节，只多一条无关记录。）\n' >> docs/IMPROVEMENT-LOG.md
      git add -A >/dev/null && git commit -qm "docs(log): 对照，无删节"
    fi ) >/dev/null 2>&1
}
run_gate() { ( cd "$1" && node scripts/check-log-sections.cjs 2>&1 ); }
gate_code() { ( cd "$1" && node scripts/check-log-sections.cjs >/dev/null 2>&1 ); echo $?; }

say "用例 1：对照沙箱（无删节）—— 期望绿"
build_repo "$BASE/ctl" no
expect_ok "无删节不误报" "$(run_gate "$BASE/ctl")" "$(gate_code "$BASE/ctl")"

say "用例 2：注入删节事故 —— 期望红，且红因指名到节与提交"
build_repo "$BASE/kill" yes
OUT="$(run_gate "$BASE/kill")"; CODE="$(gate_code "$BASE/kill")"
REMOVED_BY="$(cd "$BASE/kill" && git log --format=%h -1 --grep='模拟并发事故')"
expect_red "删节被抓到" "$OUT" "$CODE" "会被扫掉的一节" "$REMOVED_BY" "在提交"

say "用例 3：删了又补回来 —— 期望绿（判据可自愈）"
build_repo "$BASE/heal" heal
expect_ok "删后补回判绿" "$(run_gate "$BASE/heal")" "$(gate_code "$BASE/heal")"

say "用例 4：历史被截断（提交数不足）—— 期望红，且红因指向覆盖不足"
SB="$BASE/shallow"; mkdir -p "$SB/scripts" "$SB/docs"
cp "$GATE" "$SB/scripts/check-log-sections.cjs"
( cd "$SB" && git init -q . && git config user.email injector@example.com && git config user.name injector
  printf '# 注入用日志\n\n## 只有三节\n' > docs/IMPROVEMENT-LOG.md
  git add -A >/dev/null && git commit -qm c1
  printf 'x\n' > f.txt; git add -A >/dev/null; git commit -qm c2
  printf 'y\n' > f.txt; git add -A >/dev/null; git commit -qm c3 ) >/dev/null 2>&1
expect_red "空跑被拦下" "$(run_gate "$SB")" "$(gate_code "$SB")" "历史" "空跑"

say "用例 5：工作树被旧基线整份覆盖（HEAD 有的节，工作树没有）—— 期望红，且红因指名该节"
SB="$BASE/wtclobber"; build_repo "$SB" no
# 模拟"拿旧基线覆盖工作树"：把工作树上的某一节整节抹掉（**不动 HEAD**，不提交）
( cd "$SB" && grep -v '场次 07：铺垫节' docs/IMPROVEMENT-LOG.md > docs/.tmp-log && mv docs/.tmp-log docs/IMPROVEMENT-LOG.md )
OUT="$(run_gate "$SB")"; CODE="$(gate_code "$SB")"
expect_red "工作树丢节被抓到" "$OUT" "$CODE" "场次 07：铺垫节" "工作树" "HEAD"

say "用例 6：工作树比 HEAD 多一节（未提交的在途内容）—— 期望绿（不得误报）"
SB="$BASE/wtextra"; build_repo "$SB" no
( cd "$SB" && printf '## 2026-10-19 · 注入场次：还没提交的一节\n\n这节在工作树里，还没进 HEAD。\n' >> docs/IMPROVEMENT-LOG.md )
expect_ok "工作树多节不误报" "$(run_gate "$SB")" "$(gate_code "$SB")"

say "用例 7：同一个节标题出现两份（工作树侧，未提交）—— 期望红，且红因指名该标题与份数"
SB="$BASE/wtdup"; build_repo "$SB" no
( cd "$SB" && printf '\n## 场次 07：铺垫节\n\n这一节在工作树里出现了第二份（LS6 抓的就是它）。\n' >> docs/IMPROVEMENT-LOG.md )
OUT="$(run_gate "$SB")"; CODE="$(gate_code "$SB")"
expect_red "工作树侧重复节标题被抓到" "$OUT" "$CODE" "场次 07：铺垫节" "工作树上的日志里同一个" "2 份"

say "用例 8：同一个节标题出现两份（已进 HEAD）—— 期望红，且红因指名 HEAD 侧"
SB="$BASE/headdup"; build_repo "$SB" no
( cd "$SB" && printf '\n## 场次 07：铺垫节\n\n这一节被提交进去了，于是 HEAD 上也有两份。\n' >> docs/IMPROVEMENT-LOG.md \
  && git add -A >/dev/null && git commit -qm "docs(log): 注入：同一节标题两份（已提交）" )
OUT="$(run_gate "$SB")"; CODE="$(gate_code "$SB")"
expect_red "HEAD 侧重复节标题被抓到" "$OUT" "$CODE" "HEAD 上的日志里同一个" "场次 07：铺垫节" "2 份"

say "用例 9：中央待决策段标题出现两份 —— 期望红（由 LS5 报，LS6 不重复报）"
SB="$BASE/centdup"; build_repo "$SB" no
( cd "$SB" && printf '\n## 待决策（需要本人拍板，任务不会自己动）\n\n- 副本\n\n---\n' >> docs/IMPROVEMENT-LOG.md )
OUT="$(run_gate "$SB")"; CODE="$(gate_code "$SB")"
expect_red "中央段标题副本被抓到" "$OUT" "$CODE" "中央待决策段的标题出现了" "2 次"

printf '\n================ 结论 ================\n'
printf '通过 %d 条，失败 %d 条\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ] || exit 1
echo "门禁的自测全绿。"
