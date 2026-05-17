#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Layout: Teardown
# @raycast.mode compact
# @raycast.packageName Layouts
# @raycast.icon ❌
# @raycast.description Close every non-system window on the current Space

exec "$(dirname "$0")/_run.sh" teardown
