#!/bin/bash
# Shared runner for all Raycast wrappers in this folder.
# Raycast launches scripts with a minimal PATH (no nvm, no homebrew), so we
# resolve `node` here once. Per-profile wrappers just call:
#   exec "$(dirname "$0")/_run.sh" launch <profile>
#   exec "$(dirname "$0")/_run.sh" capture <profile>

NODE_DIR="$HOME/.nvm/versions/node/$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)/bin"
export PATH="$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/sbin:$PATH"

DIR="$(cd "$(dirname "$0")/.." && pwd)"

case "$1" in
  launch)   exec node "$DIR/launch.js"   "$2" ;;
  capture)  exec node "$DIR/capture.js"  "$2" ;;
  teardown) exec node "$DIR/teardown.js"      ;;
  delete)   exec node "$DIR/delete.js"   "$2" ;;
  *)
    echo "usage: $(basename "$0") {launch|capture|teardown|delete} [name]" >&2
    exit 1
    ;;
esac
