#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Launcher: Capture Current
# @raycast.mode fullOutput
# @raycast.packageName Launcher
# @raycast.icon 📸
# @raycast.argument1 { "type": "text", "placeholder": "profile name (e.g. dev)", "optional": false }
# @raycast.description Snapshot current windows into profiles/<name>.json

exec "$(dirname "$0")/_run.sh" capture "$1"
