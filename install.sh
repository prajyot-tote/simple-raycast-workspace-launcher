#!/bin/bash
# install.sh — one-time setup on a new Mac.
# Verifies dependencies, compiles the Swift helper, and prints the
# manual steps that have to be done in macOS / Raycast UIs (which can't
# be scripted).

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Verifying Xcode Command Line Tools"
if ! /usr/bin/xcode-select -p >/dev/null 2>&1; then
  echo "ERROR: Xcode Command Line Tools required."
  echo "Install with:  xcode-select --install"
  exit 1
fi
echo "    OK ($(/usr/bin/xcode-select -p))"

echo "==> Compiling Swift helper (lib/visible-windows)"
/usr/bin/xcrun swiftc -O "$SCRIPT_DIR/lib/visible-windows.swift" -o "$SCRIPT_DIR/lib/visible-windows"
echo "    OK"

echo "==> Verifying node"
if [ -d "$HOME/.nvm/versions/node" ]; then
  LATEST="$(ls -1 "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)"
  echo "    nvm detected; raycast/_run.sh resolves $HOME/.nvm/versions/node/$LATEST/bin/node"
elif [ -x "/opt/homebrew/bin/node" ]; then
  echo "    Homebrew node at /opt/homebrew/bin/node — already in _run.sh PATH"
elif [ -x "/usr/local/bin/node" ]; then
  echo "    Intel-Homebrew/system node at /usr/local/bin/node — already in _run.sh PATH"
elif command -v node >/dev/null 2>&1; then
  echo "    node at $(command -v node) — if not in /opt/homebrew/bin or /usr/local/bin,"
  echo "    edit raycast/_run.sh to prepend its directory to PATH"
else
  echo "ERROR: node not found. Install Node.js (any version) and re-run."
  exit 1
fi

chmod +x "$SCRIPT_DIR"/{launch,capture,teardown}.js
chmod +x "$SCRIPT_DIR"/raycast/*.sh

cat <<EOF

==> Setup complete.

Four one-time manual steps (macOS won't let scripts do these):

1. Register the Raycast script directory:
     Raycast → Settings → Extensions → Script Commands → Add Directory
     Path: $SCRIPT_DIR/raycast/

2. Grant Automation permissions when macOS prompts on first run
   (Terminal, Safari, Finder). System Settings → Privacy & Security
   → Automation.

3. Grant Raycast Accessibility access (needed for the teardown command's
   Cmd+W on generic apps). System Settings → Privacy & Security
   → Accessibility → add Raycast.

4. (Recommended) Keep new windows on the current Space:
   System Settings → Desktop & Dock → Mission Control →
   turn OFF "When switching to an application, switch to a Space with
   open windows for the application".

Then, in Raycast, run "Layout: Capture Current" to save your first layout.
EOF
