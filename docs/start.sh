#!/usr/bin/env bash
# =============================================================================
# data-quality 一键启动脚本
# =============================================================================
# 用法:
#   ./docs/start.sh                  # 启动 Web UI(默认端口 3000)
#   ./docs/start.sh 8080             # 指定端口
#   ./docs/start.sh --cli <sql> <docs>  # CLI 模式,审查 SQL 后退出
#
# 前置条件:
#   - .env 已配置(参考 .env.example)
#   - dist/ 已构建(pnpm build 或 pnpm install && pnpm build)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[INFO]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# -----------------------------------------------------------------------------
# 前置检查
# -----------------------------------------------------------------------------
check_prereqs() {
  # Node 版本
  if ! command -v node >/dev/null 2>&1; then
    err "未找到 node,请先安装 Node.js >= 20.19"
    exit 1
  fi

  local node_major
  node_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$node_major" -lt 20 ]; then
    err "Node 版本过低($(node -v)),需要 >= 20.19"
    exit 1
  fi

  # dist 产物
  if [ ! -f "$ROOT_DIR/dist/web.js" ] || [ ! -f "$ROOT_DIR/dist/index.js" ]; then
    warn "dist/ 缺失或不完整,正在构建..."
    if [ ! -d "$ROOT_DIR/node_modules" ]; then
      info "安装依赖..."
      pnpm install || npm install
    fi
    info "构建 dist/..."
    pnpm build || npm run build
  fi

  # .env 配置
  if [ ! -f "$ROOT_DIR/.env" ]; then
    err ".env 不存在,请先 cp .env.example .env 并填入 OPENAI_API_KEY"
    exit 1
  fi

  # 端口占用(仅 Web 模式)
  if [ "${1:-}" != "--cli" ]; then
    local port="${1:-3000}"
    if lsof -ti :"$port" >/dev/null 2>&1; then
      err "端口 $port 已被占用,可用:./docs/start.sh <其他端口>"
      lsof -i :"$port" || true
      exit 1
    fi
  fi
}

# -----------------------------------------------------------------------------
# 主逻辑
# -----------------------------------------------------------------------------
main() {
  check_prereqs "$@"

  # CLI 模式
  if [ "${1:-}" = "--cli" ]; then
    local sql="${2:?用法:start.sh --cli <sql文件> <docs目录>}"
    local docs="${3:?用法:start.sh --cli <sql文件> <docs目录>}"
    info "CLI 模式:审查 $sql (参考文档 $docs)"
    exec node "$ROOT_DIR/dist/index.js" --sql "$sql" --docs "$docs"
  fi

  # Web 模式
  local port="${1:-3000}"
  export PORT="$port"
  info "启动 Web UI:http://localhost:$port"
  info "按 Ctrl+C 停止"
  exec node "$ROOT_DIR/dist/web.js"
}

main "$@"
