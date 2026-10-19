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
    printf '# 注入用日志\n' > docs/IMPROVEMENT-LOG.md
    git add -A >/dev/null && git commit -qm "chore: 建空日志"
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

printf '\n================ 结论 ================\n'
printf '通过 %d 条，失败 %d 条\n' "$PASS" "$FAIL"
[ "$FAIL" = 0 ] || exit 1
echo "门禁的自测全绿。"
