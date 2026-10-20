#!/bin/bash
# 本机预览用：依赖放在 .data/tooling，不修改系统安装。线上部署使用 docs/deploy.md。
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.data/tooling/bin:$PATH"
pg="$PWD/.data/tooling/postgres/native/bin/pg_ctl"
mkdir -p .data/logs

service_running() {
  local service="$1" pid entry cwd command
  [[ -f ".data/$service.pid" ]] || return 1
  pid="$(cat ".data/$service.pid")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  case "$service" in
    api) entry=apps/api/src/main.ts ;;
    worker) entry=apps/worker/src/main.ts ;;
    web) entry=apps/web/server.ts ;;
  esac
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
  command="$(ps -p "$pid" -o args=)"
  [[ "$cwd" == "$PWD" && "$command" == *"$entry"* ]]
}

case "${1:-start}" in
  start|serve)
    for binding in api:3001 web:3000; do
      service="${binding%:*}"; port="${binding#*:}"
      for listener in $(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true); do
        if ! service_running "$service" || [[ "$listener" != "$(cat ".data/$service.pid")" ]]; then
          echo "端口 $port 被其他进程（PID ${listener}）占用，停止启动；请先确认该进程所属项目。"
          exit 1
        fi
      done
    done
    if ! "$pg" -D .data/postgres status >/dev/null 2>&1; then
      "$pg" -D .data/postgres -l .data/postgres.log -o '-h 127.0.0.1 -p 55432 -k /tmp' -w start
    fi
    if [[ ! -f apps/web/build/server/index.js ]]; then
      npm run build -w @aihot/web
    fi
    for service in api worker web; do
      pidfile=".data/$service.pid"
      if service_running "$service"; then
        echo "$service 已在运行"
        continue
      fi
      case "$service" in
        api) entry=apps/api/src/main.ts ;;
        worker) entry=apps/worker/src/main.ts ;;
        web) entry=apps/web/server.ts ;;
      esac
      NODE_ENV=production nohup node --env-file=.env "$entry" > ".data/logs/$service.log" 2>&1 &
      echo "$!" > "$pidfile"
    done
    echo '已启动本地进程；网站 http://localhost:3000，后台 /admin。'
    echo '查看启动结果：bash scripts/local.sh status；日志：.data/logs/'
    if [[ "${1:-start}" == serve ]]; then
      trap 'bash scripts/local.sh stop' INT TERM
      wait
    fi
    ;;
  stop)
    for service in web worker api; do
      pidfile=".data/$service.pid"
      if [[ -f "$pidfile" ]]; then
        pid="$(cat "$pidfile")"
        if service_running "$service"; then
          kill "$pid"
          for ((i=0; i<210; i++)); do
            kill -0 "$pid" 2>/dev/null || break
            sleep 1
          done
          if kill -0 "$pid" 2>/dev/null; then
            echo "$service 尚未退出，保留数据库运行。请检查 .data/logs/$service.log。"
            exit 1
          fi
        fi
        rm -f "$pidfile"
      fi
    done
    if "$pg" -D .data/postgres status >/dev/null 2>&1; then
      "$pg" -D .data/postgres -m fast -w stop
    fi
    ;;
  status)
    "$pg" -D .data/postgres status || true
    for service in api worker web; do
      pidfile=".data/$service.pid"
      if service_running "$service"; then
        echo "$service: 运行中"
      else
        echo "$service: 未运行"
      fi
    done
    curl --fail --silent --show-error http://127.0.0.1:3000/api/health
    ;;
  *) echo '用法：bash scripts/local.sh start|serve|stop|status'; exit 1 ;;
esac
