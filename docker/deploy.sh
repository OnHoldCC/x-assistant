#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
action="${1:-install}"
compose=(docker compose --project-name onhold --project-directory "$PWD")
export ONHOLD_SOURCE_COMMIT="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
if [[ -n "$(git status --porcelain --untracked-files=no 2>/dev/null || true)" ]]; then ONHOLD_SOURCE_COMMIT="$ONHOLD_SOURCE_COMMIT-dirty"; fi
install_dir="${ONHOLD_INSTALL_DIR:-$PWD}"
if ! command -v docker >/dev/null; then echo '[需要处理] 未安装 Docker，请由安装 Skill 安装官方 Docker Desktop/Engine。' >&2; exit 2; fi
if ! docker info >/dev/null 2>&1; then echo '[需要处理] Docker 引擎未就绪，请启动 Docker；首次使用由用户完成官方授权。' >&2; exit 2; fi
docker compose version >/dev/null
profiles="${COMPOSE_PROFILES:-$(sed -n 's/^COMPOSE_PROFILES=//p' .env 2>/dev/null || true)}"
case "$action" in
  status|doctor) "${compose[@]}" --profile '*' ps -a; exit ;;
  stop) "${compose[@]}" --profile '*' stop; echo '[已停止] 数据和已下载模型保留'; exit ;;
  verify) "${compose[@]}" exec -T web onhold-backend --health-check --port "${ONHOLD_HTTP_PORT:-18431}" ;;
  install|start|upgrade|backup|translation|agent|login) ;;
  *) echo '用法：install|start|upgrade|backup|translation|agent|login|status|stop|verify' >&2; exit 2 ;;
esac
if [[ "$action" == translation || "$action" == agent || "$action" == login ]]; then
  selected="$action"; [[ "$selected" == login ]] && selected=agent
  if [[ ",$profiles," != *",$selected,"* ]]; then
    profiles="${profiles:+$profiles,}$selected"
    temporary="$(mktemp .env.XXXXXX)"
    if [[ -f .env ]]; then sed '/^COMPOSE_PROFILES=/d' .env > "$temporary"; fi
    printf '\nCOMPOSE_PROFILES=%s\n' "$profiles" >> "$temporary"
    chmod 600 "$temporary"; mv "$temporary" .env
  fi
fi
profiles="$(printf '%s' "$profiles" | tr ',' '\n' | sed '/^scoring$/d' | paste -sd, -)"
export COMPOSE_PROFILES="$profiles"
model_mode=''
[[ ",$profiles," == *',translation,'* ]] && model_mode=translation

if [[ "$action" == verify ]]; then
  if [[ -n "$model_mode" ]]; then "${compose[@]}" exec -T gateway node docker/verify.mjs "$model_mode"; fi
  exit
fi
for service in web gateway; do
  port=18427; [[ "$service" == web ]] && port="${ONHOLD_HTTP_PORT:-18431}"
  [[ "$service" == gateway && -z "$model_mode" ]] && continue
  if [[ -z "$("${compose[@]}" ps --status running -q "$service")" ]] && (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; then
    echo "[需要处理] 端口 $port 被其他程序占用，请关闭旧 OnHold 服务后继续；未停止其他程序。" >&2; exit 2
  fi
done
if [[ "$action" == upgrade || "$action" == backup ]]; then
  echo '[备份] 停止本项目并备份私有数据卷'
  "${compose[@]}" --profile '*' stop
  mkdir -p "$install_dir/backups"; chmod 700 "$install_dir/backups"
  "${compose[@]}" run --rm --no-deps -T web tar -C /data -czf - . > "$install_dir/backups/state-$(date -u +%Y%m%dT%H%M%SZ).tgz"
  chmod 600 "$install_dir"/backups/*.tgz
  if [[ "$action" == backup ]]; then exit; fi
fi
echo '[1/6 环境检查] Docker 和 Compose 已就绪'
echo '[2/6 构建后台] 只包含网页与 Rust，构建工具不进入最终镜像'
"${compose[@]}" --progress plain build web
"${compose[@]}" up -d --wait --wait-timeout 120 web
if [[ -n "$model_mode" ]]; then
  echo '[3/6 可选模型环境] 仅构建用户已启用的服务'
  "${compose[@]}" --progress plain build gateway
  echo '[4/6 权重下载与校验] 显示实际字节、百分比及速度'
  "${compose[@]}" up --no-deps --abort-on-container-exit --exit-code-from translation-init translation-init
else
  echo '[3–4/6] 未启用本地翻译模型，跳过环境与权重下载'
fi
if [[ ",$profiles," == *',agent,'* ]]; then "${compose[@]}" --progress plain build agent; fi
echo '[5/6 启动] 等待已选服务的健康检查'
"${compose[@]}" up -d --remove-orphans --wait --wait-timeout 360
echo '[6/6 验证] 检查后台与已启用模型'
"${compose[@]}" exec -T web onhold-backend --health-check --port "${ONHOLD_HTTP_PORT:-18431}"
if [[ -n "$model_mode" ]]; then "${compose[@]}" exec -T gateway node docker/verify.mjs "$model_mode"; fi
extension_next="$(mktemp -d "$install_dir/.extension-next.XXXXXX")"
"${compose[@]}" cp web:/opt/onhold/extension/. "$extension_next/"
if [[ -d "$install_dir/extension" ]]; then mv "$install_dir/extension" "$install_dir/extension.previous-$(date -u +%Y%m%dT%H%M%SZ)"; fi
mv "$extension_next" "$install_dir/extension"
echo "[部署完成] 后台 http://127.0.0.1:${ONHOLD_HTTP_PORT:-18431}/ ；插件目录 $install_dir/extension"
if [[ "$action" == login ]]; then "${compose[@]}" exec agent codex login --device-auth; fi
echo '[下一步] 初装：安装插件 → 连接；升级：打开后台 /#/connect?upgrade=1 自动重载并验证插件。'
