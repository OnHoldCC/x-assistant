#!/bin/bash
set -euo pipefail
skill_scripts=$(cd "$(dirname "$0")" && pwd)
app_home="$HOME/Library/Application Support/OnHoldAssistant"
previous=''
for argument in "$@"; do
  if [ "$previous" = '--home' ]; then app_home="$argument"; fi
  previous="$argument"
done
[ "$previous" != '--home' ] || { echo '--home requires a directory' >&2; exit 1; }
[ -n "$app_home" ] && [ "$app_home" != '/' ] && [ "$app_home" != "$HOME" ] || { echo 'Unsafe install directory' >&2; exit 1; }
if [ -d "$app_home" ]; then
  resolved_home=$(cd "$app_home" && pwd -P)
  [ "$resolved_home" != '/' ] && [ "$resolved_home" != "$HOME" ] || { echo 'Unsafe install directory' >&2; exit 1; }
fi
node_root="$app_home/agent-node"
compatible() { "$1" -e 'const [m,n]=process.versions.node.split(".").map(Number);process.exit(m>22||m===22&&n>=20?0:1)' >/dev/null 2>&1; }
node_binary=''
if command -v node >/dev/null 2>&1 && compatible "$(command -v node)"; then node_binary=$(command -v node); fi
if [ -z "$node_binary" ]; then
  [ "$(uname -s)" = Darwin ] || { echo 'This bootstrap supports macOS only' >&2; exit 1; }
  case "$(uname -m)" in
    arm64) architecture=arm64; checksum=89c682593d76cd44233fa53b1563264e7de9cbb189cad169135c5b4fadfbc0a7 ;;
    x86_64) architecture=x64; checksum=d132557e7ee2b85af08b0c8c34338e65c6430f2238d01f727728ef42dc83b035 ;;
    *) echo 'Unsupported macOS architecture' >&2; exit 1 ;;
  esac
  release="node-v24.22.1-darwin-$architecture"
  node_binary="$node_root/$release/bin/node"
  if [ -e "$node_root" ] || [ -L "$node_root" ]; then
    [ ! -L "$node_root" ] && [ "$(cat "$node_root/.onhold-node" 2>/dev/null)" = 'onhold-assistant-node-v1' ] && compatible "$node_binary" || { echo 'Existing Node directory is not usable; files preserved' >&2; exit 1; }
  else
    mkdir -p "$app_home"
    resolved_home=$(cd "$app_home" && pwd -P)
    [ "$resolved_home" != '/' ] && [ "$resolved_home" != "$HOME" ] || { echo 'Unsafe install directory' >&2; exit 1; }
    node_lock="$app_home/.node-bootstrap.lock"
    mkdir "$node_lock" 2>/dev/null || { echo 'Another Node bootstrap is running; files preserved' >&2; exit 1; }
    stage=$(mktemp -d "$app_home/.node-stage.XXXXXX")
    trap 'rm -rf "$stage"; rmdir "$node_lock" 2>/dev/null || true' EXIT
    echo 'Downloading verified private Node.js 24.22.1...' >&2
    curl --fail --location --retry 2 --connect-timeout 30 --output "$stage/node.tar.gz" "https://nodejs.org/dist/v24.22.1/$release.tar.gz"
    printf '%s  %s\n' "$checksum" "$stage/node.tar.gz" | shasum -a 256 -c - >/dev/null
    tar -xzf "$stage/node.tar.gz" -C "$stage"
    compatible "$stage/$release/bin/node" || { echo 'Downloaded Node cannot run' >&2; exit 1; }
    rm "$stage/node.tar.gz"
    printf '%s\n' 'onhold-assistant-node-v1' > "$stage/.onhold-node"
    [ ! -e "$node_root" ] && [ ! -L "$node_root" ] || { echo 'Node destination changed; files preserved' >&2; exit 1; }
    mv "$stage" "$node_root"
    rmdir "$node_lock"
    trap - EXIT
  fi
fi
set +e
"$node_binary" "$skill_scripts/setup.mjs" "$@"
result=$?
set -e
if [ "$result" -eq 0 ] && [ "${1:-}" = uninstall ] && [ ! -L "$node_root" ] && [ -f "$node_root/.onhold-node" ] && [ "$(cat "$node_root/.onhold-node")" = 'onhold-assistant-node-v1' ]; then rm -rf "$node_root"; fi
exit "$result"
