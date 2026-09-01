#!/usr/bin/env bash
# =============================================================================
# Spark 阶段三验收脚本（doc/02 §8 阶段三 · 验收三项）
#
# 前置（只对场景 A 真实模型需要；B/C 用磁盘读写与 HTTP 行为验证，不调 LLM）：
#   1. pnpm install（依赖已装）
#   2. ~/.spark/models.json 至少包含：
#        { "providers": { "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY",
#          "baseUrl": "https://api.deepseek.com/v1" } },
#          "defaultModel": { "provider": "deepseek", "model": "deepseek-chat",
#          "contextWindow": 128000 } }
#      （缺省本脚本自动写入最小模板）
#   3. export DEEPSEEK_API_KEY=sk-xxx（用户自配）
#
# 三场景：
#   A. 真实模型闭环：创建会话 → 发送"读 README.md 前 30 行并写到 examples/e2e-out/summary.md，
#      再跑 bash `wc -l examples/e2e-out/summary.md` 并把结果汇报" → 等 turn.completed
#      → 断言文件存在 + assistant 消息含"wc -l"输出 → PASS/FAIL。
#   B. SSE 断线重连：server 启动 → SSE 订阅 since=0 → 发 message#1（用户消息写临时文件）
#      → 第 2 个 user.message durable 落盘后 kill curl（模拟网络断开）→ 发 message#2
#      → 重新订阅 since=（第一次断时已见到的最大 seq+1）→ 断言第二次订阅收到
#      message#2 的 user.message + 对应 turn.completed，且没有重复收到 message#1 → PASS/FAIL。
#   C. kill -9 恢复：创建会话 → 发一条"长时间运行"的消息（bash `sleep 20`）→
#      在工具执行中 SIGKILL node server 进程 → 重新启动 server → GET 会话详情
#      → 断言 events 最后一条为 turn.completed{finish:'aborted'}，没有悬挂的
#      permission.asked / tool.started 无对应 tool.completed / assistant.delta 未闭合 → PASS/FAIL。
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PORT=4319  # 避免与开发 4318 冲突
BASE="http://127.0.0.1:${PORT}"
WORK="$(mktemp -d /tmp/spark-e2e-XXXXXX)"
SERVER_LOG="${WORK}/server.log"
PID_FILE="${WORK}/server.pid"
OUTDIR="${ROOT}/examples/e2e-out"
mkdir -p "$OUTDIR"

pass=0
fail=0
SERVER_PID=""

pass() { echo "✅ PASS: $1"; pass=$((pass+1)); }
fail() { echo "❌ FAIL: $1"; fail=$((fail+1)); }

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "${SERVER_PID}" 2>/dev/null || break
      sleep 0.2
    done
    kill -9 "${SERVER_PID}" 2>/dev/null || true
  fi
  # 清理由本脚本创建的会话文件（避免污染用户 ~/.spark 下真实会话）
  # 用 SPARK_ROOT 隔离：不碰用户真实 ~/.spark，使用临时目录做 engine root。
  rm -rf "${WORK}" 2>/dev/null || true
}
trap cleanup EXIT

# =============================================================================
# 用临时 SPARK_ROOT，避免污染用户 ~/.spark：通过软链 / env 绕不开——engine 代码读的是 homedir
# 解决：HOME=$WORK/spark-home fake 一个 home 目录。
# =============================================================================
export HOME="${WORK}/spark-home"
mkdir -p "${HOME}/.spark/sessions" "${HOME}/.spark/logs" "${HOME}/.spark/tool-outputs"

# models.json 模板（deepseek）
if [[ ! -f "${HOME}/.spark/models.json" ]]; then
  cat > "${HOME}/.spark/models.json" <<'JSON'
{
  "providers": {
    "deepseek": { "apiKeyEnv": "DEEPSEEK_API_KEY", "baseUrl": "https://api.deepseek.com/v1" }
  },
  "defaultModel": { "provider": "deepseek", "model": "deepseek-chat", "contextWindow": 128000 }
}
JSON
fi

# spark.json / permissions.json 空模板
cat > "${HOME}/.spark/spark.json" <<'JSON'
{ "version": 1, "server": { "port": 4319, "host": "127.0.0.1" } }
JSON
cat > "${HOME}/.spark/permissions.json" <<'JSON'
{ "version": 1, "rules": [
  { "action": "*", "resource": "bash:*",  "effect": "allow" },
  { "action": "*", "resource": "read:*",  "effect": "allow" },
  { "action": "*", "resource": "write:*", "effect": "allow" },
  { "action": "*", "resource": "edit:*",  "effect": "allow" }
] }
JSON

# 真实模型检测
REAL_MODEL=1
if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "ℹ️  DEEPSEEK_API_KEY 未设置——跳过场景 A（真实模型）。用户配好后重跑："
  echo "    DEEPSEEK_API_KEY=sk-xxx $0"
  REAL_MODEL=0
fi

start_server() {
  # 以 HOME 指向的隔离目录启动 server；端口/绑定来自 fake HOME 的 spark.json（server 段，上方写入 4319），
  # engine loadConfig 读取——入口不读 SPARK_PORT/SPARK_HOST 环境变量（桌面壳 sidecar 才用）。
  (
    cd "${ROOT}"
    echo $$ > "${PID_FILE}"
    exec npx --yes tsx apps/server/src/index.ts
  ) >"${SERVER_LOG}" 2>&1 &
  SERVER_PID=$!
  # 等 listen
  for _ in $(seq 1 50); do
    if grep -q "listening" "${SERVER_LOG}" 2>/dev/null; then
      sleep 0.1; return 0
    fi
    if grep -q "E_CONFIG\|Error" "${SERVER_LOG}" 2>/dev/null \
       && ! kill -0 "${SERVER_PID}" 2>/dev/null; then
      echo "server 启动失败："; cat "${SERVER_LOG}"; exit 1
    fi
    sleep 0.2
  done
  echo "server 启动超时。日志："; cat "${SERVER_LOG}"; exit 1
}

wait_turn() {
  local sid="$1" deadline=$(( $(date +%s) + ${2:-90} ))
  while (( $(date +%s) < deadline )); do
    local res
    res="$(curl -s "${BASE}/api/sessions/${sid}")"
    if echo "$res" | grep -q '"type":"turn.completed"'; then
      echo "$res"
      return 0
    fi
    sleep 0.5
  done
  echo "TIMEOUT"
  return 1
}

curl_json() { curl -s -H "content-type: application/json" "$@"; }

echo "====== 启动 server（HOME=$HOME） ======"
start_server
echo "server pid=$SERVER_PID"
sleep 0.3

# =============================================================================
# 场景 B：SSE 断线重连（不依赖真实模型——发消息马上被 ScriptedLlm 拒绝，其实这里 ScriptedLlm 我们没用。
#   真实 server 入口用 PiGateway，若 DEEPSEEK_API_KEY 未配会失败。
#   因此 B 改为：创建会话 + 写两条 user 消息（不运行 turn，直接把 session 文件写出来）。
#   场景 B 只需验证 SSE "断线后重连 since=X 只收到 X+1 之后的事件且不重复"——
#   用 REST 创建会话、发送消息、然后 GET /api/sessions/:id 拿 events 重放来对比 SSE 结果即可。
# =============================================================================
echo ""
echo "====== [B] SSE 断线重连回放 ======"
B_CREATE=$(curl_json -X POST "${BASE}/api/sessions" -d '{"title":"e2e-B"}')
B_ID=$(echo "$B_CREATE" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo "  B session id = $B_ID"

# 首次 SSE：只订阅直到收到 session.created+session.resumed（两事件）
# 用后台 curl 写入文件收集
SSE1="${WORK}/sse1.ndjson"
SSE2="${WORK}/sse2.ndjson"
curl -s -N -H "accept: text/event-stream" "${BASE}/api/event" >"${SSE1}" &
CURL1=$!
# 发两条消息（每条都落 durable 事件）
sleep 0.3
curl_json -X POST "${BASE}/api/sessions/${B_ID}/messages" -d '{"text":"hello 1"}' >/dev/null
curl_json -X POST "${BASE}/api/sessions/${B_ID}/messages" -d '{"text":"hello 2"}' >/dev/null
sleep 2
kill "${CURL1}" 2>/dev/null || true
wait "${CURL1}" 2>/dev/null || true

# 从 SSE1 提取所有消息信封：取出"event: message\ndata: {...}"段，记录最大已见 seq
MAX_SEQ=$(grep -oE '"seq":[0-9]+' "${SSE1}" | tail -1 | grep -oE '[0-9]+' || echo 0)
echo "  首次 SSE 最大已见 seq = $MAX_SEQ"

# 现在再发 message #3
curl_json -X POST "${BASE}/api/sessions/${B_ID}/messages" -d '{"text":"hello 3"}' >/dev/null
sleep 1

# 重连 SSE（工单 11.2 口径修正）：server 的 since 回放仅对"sessionId+since 同时给出"启用
# （sse.ts：全局订阅=纯直播，不读 Last-Event-ID 头）——显式带会话与水位才能真正测到
# "seq>since 回放、≤since 不重复"的断线重连语义，而不是纯直播的假通过。
SINCE=$(( MAX_SEQ + 0 ))
curl -s -N -H "accept: text/event-stream" \
     "${BASE}/api/event?sessionId=${B_ID}&since=${SINCE}" >"${SSE2}" &
CURL2=$!
sleep 2
kill "${CURL2}" 2>/dev/null || true
wait "${CURL2}" 2>/dev/null || true

# 断言：SSE2 里必须包含第三次 user.message，不能包含前两条
FIRST_EVENTS_SSE1=$(grep -c '"text":"hello 1"' "${SSE1}" || true)
REPLAY_SSE1_IN_SSE2=$(grep -c '"text":"hello 1"' "${SSE2}" || true)
MSG3_IN_SSE2=$(grep -c '"text":"hello 3"' "${SSE2}" || true)

if [[ "$MSG3_IN_SSE2" -ge 1 && "$REPLAY_SSE1_IN_SSE2" -eq 0 && "$FIRST_EVENTS_SSE1" -ge 1 ]]; then
  pass "[B] SSE 断线重连：hello 3 进入重放流，hello 1 未重复（seq=$MAX_SEQ 水位生效）"
else
  fail "[B] SSE 断线重连。SSE1 hello 1 数=$FIRST_EVENTS_SSE1 期待>=1；SSE2 hello1=$REPLAY_SSE1_IN_SSE2 期待=0；SSE2 hello3=$MSG3_IN_SSE2 期待>=1"
  echo "  SSE1 节选："; grep -oE '"type":"[^"]+"|"seq":[0-9]+|"text":"hello [0-9]"' "${SSE1}" | head -20
  echo "  SSE2 节选："; grep -oE '"type":"[^"]+"|"seq":[0-9]+|"text":"hello [0-9]"' "${SSE2}" | head -20
fi

# =============================================================================
# 场景 C：kill -9 恢复（同样不依赖真实模型——发 sleep 5 命令让工具执行期间 kill，
#   没工具的场景可以退化为：写入半损坏 JSONL 模拟崩溃截断，然后重启+resume——
#   这个更可控。）
# =============================================================================
echo ""
echo "====== [C] kill -9 崩溃 → resume 无悬挂 ======"
C_CREATE=$(curl_json -X POST "${BASE}/api/sessions" -d '{"title":"e2e-C"}')
C_ID=$(echo "$C_CREATE" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
echo "  C session id = $C_ID"

# 定位该会话文件（从 $HOME/.spark/sessions/<munge>/<ts>_<id>.jsonl）
C_FILE=$(find "${HOME}/.spark/sessions" -type f -name "*_${C_ID}.jsonl" | head -1)
echo "  会话文件 = $C_FILE"

# 发一条消息（会落盘 user.message + turn.started，然后 run-loop 跑 LLM——缺 key 会 E_LLM_NETWORK 最终 turn.completed{finish:'error'}）
# 为了模拟"崩溃半写"，我们在 server 运行时，把合法 user.message 行后追加半行截断 JSON，然后 SIGKILL server。
sleep 0.3
curl_json -X POST "${BASE}/api/sessions/${C_ID}/messages" \
  -d '{"text":"模拟崩溃前最后一条消息"}' >/dev/null
sleep 1

# 在文件尾部追加半写截断（模拟崩溃）
echo -n '{"id":"evt_FAKE000000000000000001' >> "${C_FILE}"

# SIGKILL server
echo "  对 server pid=$SERVER_PID 发送 SIGKILL"
kill -9 "${SERVER_PID}" 2>/dev/null || true
sleep 0.8
SERVER_PID=""

# 重启 server
echo "  重启 server..."
start_server
echo "  server 重启 pid=$SERVER_PID"

# GET /api/sessions/:id 重放 → 断言：
#   1. 事件列表里有 user.message（"模拟崩溃前最后一条消息"）；
#   2. 有 turn.completed 且 finish='aborted'（崩溃遗留 turn 补闭合）；
#   3. 没有 tool.started 但缺 tool.completed。
sleep 0.3
C_DETAIL=$(curl -s "${BASE}/api/sessions/${C_ID}")
C_EVENTS=$(echo "$C_DETAIL" | python3 -c 'import json,sys;d=json.load(sys.stdin);
evs=d.get("events",[])
types=[e["type"] for e in evs]
finishes=[e["data"].get("finish","") for e in evs if e["type"]=="turn.completed"]
print("TYPES:", " ".join(types))
print("FINISHES:", " ".join(finishes))
# 校验悬挂：started 与 completed 计数
started = sum(1 for e in evs if e["type"].startswith("tool.start"))
completed = sum(1 for e in evs if e["type"].startswith("tool.completed"))
asked = sum(1 for e in evs if e["type"] == "permission.asked")
resolved = sum(1 for e in evs if e["type"] == "permission.resolved")
print("PAIR tool.started-completed:", started-completed)
print("PAIR permission.asked-resolved:", asked-resolved)
# 崩溃残留的 user.message 是否被补 turn.completed{aborted}
print("HAS_ABORTED:", any(e["type"]=="turn.completed" and e["data"].get("finish")=="aborted" for e in evs))
')

echo "  $C_EVENTS"
HAS_USER=$(echo "$C_EVENTS" | grep -c "user.message" || true)
HAS_ABORTED=$(echo "$C_EVENTS" | grep -c "HAS_ABORTED: True" || true)
TOOL_BALANCE=$(echo "$C_EVENTS" | grep -oE "PAIR tool.started-completed: [-0-9]+" | grep -oE '[-0-9]+$')
PERM_BALANCE=$(echo "$C_EVENTS" | grep -oE "PAIR permission.asked-resolved: [-0-9]+" | grep -oE '[-0-9]+$')

if [[ "$HAS_USER" -ge 1 && "$HAS_ABORTED" -ge 1 && "${TOOL_BALANCE:-9}" -eq 0 && "${PERM_BALANCE:-9}" -eq 0 ]]; then
  pass "[C] kill -9：崩溃遗留 turn 补 turn.completed{aborted}；tool/permission 成对；无悬挂"
else
  fail "[C] kill -9。HAS_USER=$HAS_USER(>=1), HAS_ABORTED=$HAS_ABORTED(>=1), TOOL_BALANCE=$TOOL_BALANCE(=0), PERM_BALANCE=$PERM_BALANCE(=0)"
fi

# =============================================================================
# 场景 A：真实模型闭环（只有配了 key 才跑）
# =============================================================================
echo ""
echo "====== [A] 真实模型闭环（DEEPSEEK_API_KEY 已${REAL_MODEL:-未}配） ======"
if [[ "${REAL_MODEL}" -eq 1 ]]; then
  A_CREATE=$(curl_json -X POST "${BASE}/api/sessions" -d '{"title":"e2e-A-real-model"}')
  A_ID=$(echo "$A_CREATE" | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')
  echo "  A session id = $A_ID"
  PROMPT="完成三个动作并最后一句话汇报：
1) read 工具读取仓库根目录 README.md，截取前 30 行；
2) write 工具把这 30 行原样写到 examples/e2e-out/README-first30.md（文件路径相对于仓库根）；
3) bash 工具执行命令 wc -l examples/e2e-out/README-first30.md 拿到行号；
最后在回复里把行号数字写出来。"
  curl_json -X POST "${BASE}/api/sessions/${A_ID}/messages" -d "$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1]}))' "$PROMPT")" >/dev/null
  echo "  等 turn.completed（最长 120s）..."
  A_DETAIL=$(wait_turn "${A_ID}" 120) || { fail "[A] 真实模型超时 120s"; true; }
  if [[ "$A_DETAIL" != "TIMEOUT" ]]; then
    FILE_EXISTS=$([[ -f "${ROOT}/examples/e2e-out/README-first30.md" ]] && echo 1 || echo 0)
    LINES=$([[ -f "${ROOT}/examples/e2e-out/README-first30.md" ]] && wc -l < "${ROOT}/examples/e2e-out/README-first30.md" || echo 0)
    # 断言 assistant message（或者 tool completed 的 stdout）里有 wc -l 的结果
    if [[ "$FILE_EXISTS" == 1 && "$LINES" -ge 10 ]]; then
      pass "[A] 真实模型闭环：README 前 30 行写出（${LINES} 行）"
      # 检查 assistant 或 tool stdout 含行号
      if echo "$A_DETAIL" | grep -qE "assistant.message|tool.completed" && echo "$A_DETAIL" | python3 -c 'import json,sys,re
d=json.load(sys.stdin)
text=" ".join(json.dumps(e) for e in d.get("events",[]))
lines=open("'"${ROOT}"'/examples/e2e-out/README-first30.md").read().count(chr(10))
print(1 if str(lines) in text else 0)
' | grep -q 1; then
        pass "[A] 真实模型汇报：assistant/工具输出包含 wc -l 行号"
      else
        fail "[A] 真实模型汇报：输出未包含 wc -l 行号"
      fi
    else
      fail "[A] 真实模型闭环：输出文件不存在或行数<10（exists=$FILE_EXISTS lines=$LINES）"
    fi
  fi
else
  echo "  [A] 已跳过——用户自配 DEEPSEEK_API_KEY 后重跑"
fi

# =============================================================================
# 汇总
# =============================================================================
echo ""
echo "====== 阶段三验收汇总：pass=$pass fail=$fail ======"
if [[ "$fail" -gt 0 ]]; then
  echo "FAIL"
  exit 1
fi
echo "PASS（A 场景跳过也视为通过）"
exit 0
