#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Launcher: Delete
# @raycast.mode compact
# @raycast.packageName Launcher
# @raycast.icon 🗑️
# @raycast.argument1 { "type": "text", "placeholder": "profile name to delete", "optional": false }
# @raycast.description Remove a saved launcher profile and its Raycast wrapper

exec "$(dirname "$0")/_run.sh" delete "$1"
