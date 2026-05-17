#!/usr/bin/env node
// teardown.js — close every non-system window on the active macOS Space.
// Uses the same Quartz visibility query as capture.js, then closes each
// window via its app's scripting dictionary when one exists, falling back
// to System Events + Cmd+W for non-scriptable apps.
//
// Note: closing a Terminal window with a running command pops macOS's
// "process is still running" dialog. That's macOS behavior, not ours —
// disable via Terminal > Settings > Profiles > Shell > "Ask before closing"
// if it bothers you. Also: this closes the Raycast script's own caller IF
// you ran it from a terminal; from Raycast itself, no terminal is harmed.

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

function osa(script) {
  return execSync('osascript', { input: script, encoding: 'utf8' }).trim();
}

// Reuse the cached Swift binary from capture.js. If it's missing, the user
// hasn't run capture yet — we ask them to do that first (capture compiles it).
function visibleWindows() {
  const binPath = path.join(__dirname, 'lib', 'visible-windows');
  if (!fs.existsSync(binPath)) {
    console.error('lib/visible-windows not built yet. Run "Layout: Capture Current" once to build it.');
    process.exit(1);
  }
  try {
    const out = execSync(JSON.stringify(binPath), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(out);
  } catch (e) {
    console.error('Quartz query failed: ' + ((e.stderr || '').toString() || e.message));
    process.exit(1);
  }
}

const SKIP = new Set([
  'Dock', 'SystemUIServer', 'Window Server', 'Spotlight', 'Raycast',
  'Notification Center', 'Control Center', 'TextInputMenuAgent',
  'Wallpaper', 'WindowManager', 'loginwindow',
]);

// AppleScript snippet that walks an app's windows and closes the one whose
// top-left corner is within ±2 pixels of (x, y).
function closeViaDict(appKind, w) {
  const windowsKw = appKind === 'Finder' ? 'Finder windows' : 'windows';
  const closeKw   = appKind === 'Terminal' ? 'close win saving no' : 'close win';
  osa(`
    tell application "${appKind}"
      repeat with win in ${windowsKw}
        try
          set b to bounds of win
          if (item 1 of b) >= ${w.x - 2} and (item 1 of b) <= ${w.x + 2} and (item 2 of b) >= ${w.y - 2} and (item 2 of b) <= ${w.y + 2} then
            ${closeKw}
            return
          end if
        end try
      end repeat
    end tell
  `);
}

// Generic: find the right window via System Events position, raise it,
// then send Cmd+W. Requires Accessibility permission for the running shell.
function closeViaSystemEvents(w) {
  osa(`
    tell application "System Events"
      tell process "${w.app}"
        set targetWin to missing value
        repeat with win in windows
          try
            set p to position of win
            if (item 1 of p) >= ${w.x - 2} and (item 1 of p) <= ${w.x + 2} and (item 2 of p) >= ${w.y - 2} and (item 2 of p) <= ${w.y + 2} then
              set targetWin to win
              exit repeat
            end if
          end try
        end repeat
        if targetWin is not missing value then
          perform action "AXRaise" of targetWin
          set frontmost to true
        end if
      end tell
      delay 0.1
      keystroke "w" using command down
    end tell
  `);
}

const DICT_CLOSERS = new Set(['Terminal', 'Safari', 'Finder']);

function closeWindow(w) {
  if (DICT_CLOSERS.has(w.app)) return closeViaDict(w.app, w);
  return closeViaSystemEvents(w);
}

function main() {
  const visible = visibleWindows();
  const targets = visible.filter(w => !SKIP.has(w.app));
  if (!targets.length) {
    console.log('Nothing to close.');
    return;
  }
  console.log(`> tearing down ${targets.length} window(s)`);
  let closed = 0, failed = 0;
  for (const w of targets) {
    try {
      closeWindow(w);
      console.log(`  ok  ${w.app} [${w.x},${w.y}]`);
      closed++;
    } catch (e) {
      console.error(`  err ${w.app} [${w.x},${w.y}] -> ${e.message.split('\n')[0].slice(0, 120)}`);
      failed++;
    }
  }
  console.log(`> done: ${closed} closed${failed ? `, ${failed} failed` : ''}`);
}

main();
