#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Launcher: Teardown
# @raycast.mode compact
# @raycast.packageName Launcher
# @raycast.icon 💥
# @raycast.description Close every non-system window on the current Space

exec "$(dirname "$0")/_run.sh" teardown
