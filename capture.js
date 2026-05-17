#!/usr/bin/env node
// capture.js — snapshot windows on the CURRENT macOS Space into a profile JSON.
// Usage:
//   node capture.js                  -> print JSON to stdout
//   node capture.js <profile-name>   -> write to ./profiles/<name>.json + Raycast wrapper
//
// Visibility filtering: we query Quartz CGWindowListCopyWindowInfo with the
// kCGWindowListOptionOnScreenOnly flag — that returns ONLY windows currently
// on-screen (i.e. on the active Space and not minimized). App-specific
// enumerators (Terminal/Safari/Finder) are then cross-referenced against this
// list by bounds so we keep the rich data (cwd, URLs, paths) for visible
// windows only. Generic apps are taken straight from the Quartz list.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function osa(script) {
  return execSync('osascript', { input: script, encoding: 'utf8' }).trim();
}

function tryOsa(script, fallback = '') {
  try {
    return execSync('osascript', {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch { return fallback; }
}

function parseInts(str) {
  return str.split(',').map(s => parseInt(s.trim(), 10));
}

function tildify(p) {
  if (!p) return p;
  const home = os.homedir();
  return p === home ? '~' : p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
}

// Returns [{ app, pid, bounds: {x,y,w,h} }] for every normal window currently
// on the active Space. Null if Quartz query failed (we then fall back to
// returning everything across all Spaces).
// Compile lib/visible-windows.swift into a cached binary on first use (or
// when the source is newer than the binary). Subsequent capture runs just
// execute the binary (~50ms vs the ~5–10s `swift` interpreter cold start).
function compileVisBinary() {
  const libDir = path.join(__dirname, 'lib');
  const srcPath = path.join(libDir, 'visible-windows.swift');
  const binPath = path.join(libDir, 'visible-windows');
  const binStat = fs.existsSync(binPath) ? fs.statSync(binPath) : null;
  const srcStat = fs.statSync(srcPath);
  if (!binStat || srcStat.mtimeMs > binStat.mtimeMs) {
    console.error('compiling Swift helper (one-time, ~5s)…');
    execSync(`/usr/bin/xcrun swiftc -O ${JSON.stringify(srcPath)} -o ${JSON.stringify(binPath)}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return binPath;
}

function visibleWindows() {
  // Why Swift: JXA's CF<->NS bridge is unreliable under Raycast's spawn
  // context (ObjC.deepUnwrap returns a non-iterable wrapper, NSArray methods
  // on CFArray return undefined). Swift handles the bridging natively.
  try {
    const binPath = compileVisBinary();
    const out = execSync(JSON.stringify(binPath), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return JSON.parse(out);
  } catch (e) {
    const stderr = (e.stderr || '').toString().trim();
    const msg = (stderr || e.message || String(e)).slice(0, 400);
    if (msg.includes('xcrun: error') || msg.includes('Command Line Tools')) {
      console.error('warning: Xcode CLT not found; run: xcode-select --install');
    } else {
      console.error(`warning: Quartz query failed -> ${msg}`);
    }
    console.error('         capturing windows from ALL Spaces as fallback');
    return null;
  }
}

function isVisible(visible, appName, bounds) {
  if (!visible) return true;
  const [l, t, r, b] = bounds;
  const w = r - l, h = b - t;
  return visible.some(v =>
    v.app === appName &&
    Math.abs(v.x - l) <= 2 &&
    Math.abs(v.y - t) <= 2 &&
    Math.abs(v.w - w) <= 2 &&
    Math.abs(v.h - h) <= 2
  );
}

// Find the foreground command running on a tty (the thing the user is staring
// at: `claude --resume …`, `pnpm dev`, `tail -f log`, etc.). Returns "" if
// the shell is sitting at the prompt. Best-effort: misses backgrounded jobs,
// joins pipelines into just the first command, and rewrites "node /abs/path"
// shebang resolutions back to the binary name when obvious.
function getForegroundCommand(tty) {
  if (!tty) return '';
  const m = tty.match(/\/dev\/tty(\w+)$/);
  if (!m) return '';
  const short = m[1];
  let raw;
  try {
    raw = execSync(`ps -t ${short} -o stat=,command=`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch { return ''; }
  const fg = raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .filter(l => /^\S*\+/.test(l))  // STAT contains '+' = foreground proc group
    .map(l => l.replace(/^\S+\s+/, '').trim())
    .filter(c => !/^-?(?:\/\S+\/)?(?:zsh|bash|fish|tcsh|dash|sh|ksh)\b\s*$/.test(c));
  if (!fg.length) return '';
  let cmd = fg[0];
  // Rewrite "/abs/node /abs/bin/foo args" -> "foo args" (same for python/ruby/bun).
  const wrapped = cmd.match(/^\/\S+\/(?:node|python3?|ruby|bun)\s+\/\S+\/([\w.-]+)(\s.*)?$/);
  if (wrapped) cmd = wrapped[1] + (wrapped[2] || '');
  return cmd;
}

function captureTerminal(visible) {
  const out = [];
  const count = parseInt(tryOsa(`tell application "Terminal" to count of windows`, '0'), 10);
  for (let i = 1; i <= count; i++) {
    const bounds = parseInts(tryOsa(`tell application "Terminal" to get bounds of window ${i}`));
    if (bounds.length !== 4 || bounds.some(isNaN)) continue;
    if (!isVisible(visible, 'Terminal', bounds)) continue;
    const tty = tryOsa(`tell application "Terminal" to get tty of selected tab of window ${i}`);
    let cwd = '';
    if (tty) {
      try {
        const pid = execSync(`lsof -t ${JSON.stringify(tty)} | head -1`, { encoding: 'utf8' }).trim();
        if (pid) {
          const lsof = execSync(`lsof -a -p ${pid} -d cwd -Fn`, { encoding: 'utf8' });
          const line = lsof.split('\n').find(l => l.startsWith('n'));
          if (line) cwd = line.slice(1);
        }
      } catch {}
    }
    out.push({ app: 'Terminal', bounds, cwd: tildify(cwd), command: getForegroundCommand(tty) });
  }
  return out;
}

function captureSafari(visible) {
  const out = [];
  const count = parseInt(tryOsa(`tell application "Safari" to count of windows`, '0'), 10);
  for (let i = 1; i <= count; i++) {
    const bounds = parseInts(tryOsa(`tell application "Safari" to get bounds of window ${i}`));
    if (bounds.length !== 4 || bounds.some(isNaN)) continue;
    if (!isVisible(visible, 'Safari', bounds)) continue;
    const urlList = tryOsa(`tell application "Safari" to get URL of every tab of window ${i}`);
    const tabs = urlList.split(',').map(s => s.trim()).filter(Boolean);
    out.push({ app: 'Safari', bounds, tabs });
  }
  return out;
}

function captureFinder(visible) {
  const out = [];
  const count = parseInt(tryOsa(`tell application "Finder" to count of Finder windows`, '0'), 10);
  for (let i = 1; i <= count; i++) {
    const bounds = parseInts(tryOsa(`tell application "Finder" to get bounds of Finder window ${i}`));
    if (bounds.length !== 4 || bounds.some(isNaN)) continue;
    if (!isVisible(visible, 'Finder', bounds)) continue;
    const p = tryOsa(`tell application "Finder" to get POSIX path of (target of Finder window ${i} as alias)`);
    out.push({ app: 'Finder', bounds, path: tildify(p) });
  }
  return out;
}

function captureGeneric(visible) {
  const skip = new Set([
    'Terminal', 'Safari', 'Finder', 'Dock', 'SystemUIServer', 'Window Server',
    'Spotlight', 'Raycast', 'Notification Center', 'Control Center',
    'TextInputMenuAgent', 'Wallpaper', 'WindowManager',
  ]);
  if (visible) {
    // Quartz-driven: only on-screen windows.
    return visible
      .filter(v => !skip.has(v.app) && v.w >= 80 && v.h >= 80)
      .map(v => ({ app: v.app, bounds: [v.x, v.y, v.x + v.w, v.y + v.h] }));
  }
  // Fallback: System Events enumeration (includes all Spaces).
  const out = [];
  const raw = tryOsa(`tell application "System Events" to get name of every application process whose visible is true`);
  const names = raw.split(',').map(s => s.trim()).filter(Boolean);
  for (const name of names) {
    if (skip.has(name)) continue;
    const count = parseInt(tryOsa(`tell application "System Events" to tell process ${JSON.stringify(name)} to count of windows`, '0'), 10);
    for (let i = 1; i <= count; i++) {
      const pos = tryOsa(`tell application "System Events" to tell process ${JSON.stringify(name)} to get position of window ${i}`);
      const size = tryOsa(`tell application "System Events" to tell process ${JSON.stringify(name)} to get size of window ${i}`);
      const [x, y] = parseInts(pos);
      const [w, h] = parseInts(size);
      if ([x, y, w, h].some(isNaN)) continue;
      if (w < 80 || h < 80) continue;
      out.push({ app: name, bounds: [x, y, x + w, y + h] });
    }
  }
  return out;
}

function ensureRaycastWrapper(profileName) {
  const wrapperPath = path.join(__dirname, 'raycast', `launch-${profileName}.sh`);
  if (fs.existsSync(wrapperPath)) {
    console.error(`wrapper exists, leaving as-is: ${wrapperPath}`);
    return;
  }
  const title = profileName
    .split(/[-_]/)
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
  const content = `#!/bin/bash

# @raycast.schemaVersion 1
# @raycast.title Layout: ${title}
# @raycast.mode silent
# @raycast.packageName Layouts
# @raycast.icon 🪟
# @raycast.description Open the ${profileName} window layout

exec "$(dirname "$0")/_run.sh" launch ${profileName}
`;
  fs.writeFileSync(wrapperPath, content);
  fs.chmodSync(wrapperPath, 0o755);
  console.error(`wrote ${wrapperPath}  (Raycast picks it up automatically)`);
}

function main() {
  const outName = process.argv[2];
  const visible = visibleWindows();
  const windows = [
    ...captureTerminal(visible),
    ...captureSafari(visible),
    ...captureFinder(visible),
    ...captureGeneric(visible),
  ];
  const profile = { name: outName || 'captured', windows };
  const json = JSON.stringify(profile, null, 2);
  if (outName) {
    const outPath = path.join(__dirname, 'profiles', `${outName}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath)) {
      const backup = outPath + '.bak';
      fs.copyFileSync(outPath, backup);
      console.error(`backed up existing -> ${backup}`);
    }
    fs.writeFileSync(outPath, json + '\n');
    console.error(`wrote ${outPath}  (${windows.length} windows)`);
    ensureRaycastWrapper(outName);
  } else {
    console.log(json);
  }
}

main();
