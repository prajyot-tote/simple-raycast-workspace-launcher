#!/usr/bin/env node
// launch.js — load a profile JSON and spawn/position all its windows.
// Usage: node launch.js <profile-name>
// Profiles live in ./profiles/<profile-name>.json
//
// Profile schema:
// {
//   "name": "Human-readable label",
//   "windows": [
//     {
//       "app": "Terminal" | "WezTerm" | "Safari" | "Finder" | <any app name>,
//       "bounds": [x1, y1, x2, y2],   // pixels from top-left of main display.
//                                     // Each value may also be "50%" (resolved
//                                     // against screen size) or "menu" (= menu
//                                     // bar height).
//       // Terminal / WezTerm:
//       "cwd": "~/path",
//       "command": "shell command to run",
//       // Safari:
//       "tabs": ["https://a", "https://b"],
//       // Finder / generic with file arg:
//       "path": "~/some/path",
//       // Generic apps:
//       "process": "ProcessName",   // optional, defaults to app name. Used
//                                   // when System Events process name differs
//                                   // from the .app bundle name.
//       "openArgs": "extra args for `open -na`"
//     }
//   ]
// }

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PROFILE_DIR = path.join(__dirname, 'profiles');

function expandPath(p) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

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

function screenSize() {
  const out = osa(`tell application "Finder" to get bounds of window of desktop`);
  const [l, t, r, b] = out.split(',').map(s => parseInt(s.trim(), 10));
  return { w: r - l, h: b - t };
}

function menuBarHeight() {
  const out = tryOsa(
    `tell application "System Events" to get item 2 of (size of menu bar 1 of first application process whose frontmost is true)`,
    '25'
  );
  return parseInt(out, 10) || 25;
}

function resolveBounds(bounds, { w, h }, menuH) {
  return bounds.map((v, i) => {
    if (v === 'menu') return menuH;
    if (typeof v === 'string' && v.endsWith('%')) {
      const pct = parseFloat(v) / 100;
      return Math.round((i % 2 === 0 ? w : h) * pct);
    }
    return v;
  });
}

function quoteAS(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function quoteShell(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function spawnTerminal(win) {
  const cwd = expandPath(win.cwd);
  const cmd = win.command || '';
  const full = [cwd && `cd ${quoteShell(cwd)}`, cmd].filter(Boolean).join(' && ');
  const [x1, y1, x2, y2] = win.bounds;
  // `do script` with no `in` clause creates a new window in default Terminal config.
  osa(`
    tell application "Terminal"
      activate
      do script ${quoteAS(full)}
      delay 0.2
      set bounds of front window to {${x1}, ${y1}, ${x2}, ${y2}}
    end tell
  `);
}

function spawnWezTerm(win) {
  const cwd = expandPath(win.cwd) || os.homedir();
  const cmd = win.command;
  // Keep the shell alive after the command finishes so the window stays usable.
  const wrapped = cmd ? `${cmd}; exec ${process.env.SHELL || '/bin/zsh'}` : '';
  const tail = wrapped ? `-- /bin/sh -c ${quoteShell(wrapped)}` : '';
  execSync(`open -na WezTerm --args start --cwd ${quoteShell(cwd)} ${tail}`);
  if (!waitForAppWindow('WezTerm', 30)) {
    throw new Error('WezTerm window did not appear within 4.5s');
  }
  positionAppWindow('WezTerm', win.bounds);
}

function spawnSafari(win) {
  const tabs = (win.tabs && win.tabs.length) ? win.tabs : [win.url || 'about:blank'];
  const [first, ...rest] = tabs;
  const [x1, y1, x2, y2] = win.bounds;
  const tabScript = rest.map(u =>
    `tell front window to make new tab with properties {URL:${quoteAS(u)}}`
  ).join('\n      ');
  osa(`
    tell application "Safari"
      activate
      make new document with properties {URL:${quoteAS(first)}}
      delay 0.3
      ${tabScript}
      set bounds of front window to {${x1}, ${y1}, ${x2}, ${y2}}
    end tell
  `);
}

function spawnFinder(win) {
  const p = expandPath(win.path || '~');
  const [x1, y1, x2, y2] = win.bounds;
  osa(`
    tell application "Finder"
      activate
      set newWin to make new Finder window
      set target of newWin to (POSIX file ${quoteAS(p)}) as alias
      set bounds of newWin to {${x1}, ${y1}, ${x2}, ${y2}}
    end tell
  `);
}

function waitForAppWindow(processName, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const n = tryOsa(
      `tell application "System Events" to tell process ${quoteAS(processName)} to count of windows`,
      '0'
    );
    if (parseInt(n, 10) > 0) return true;
    execSync('sleep 0.15');
  }
  return false;
}

function positionAppWindow(processName, bounds) {
  const [x1, y1, x2, y2] = bounds;
  const w = x2 - x1, h = y2 - y1;
  osa(`
    tell application "System Events" to tell process ${quoteAS(processName)}
      if (count of windows) > 0 then
        set position of front window to {${x1}, ${y1}}
        set size of front window to {${w}, ${h}}
      end if
    end tell
  `);
}

function spawnGeneric(win) {
  const app = win.app;
  const processName = win.process || app;
  const target = win.path ? ' ' + quoteShell(expandPath(win.path)) : '';
  if (win.openArgs) {
    execSync(`open -na ${quoteShell(app)} --args ${win.openArgs}`);
  } else {
    execSync(`open -a ${quoteShell(app)}${target}`);
  }
  if (!waitForAppWindow(processName, 30)) {
    throw new Error(`${processName} window did not appear within 4.5s`);
  }
  positionAppWindow(processName, win.bounds);
}

const ADAPTERS = {
  Terminal: spawnTerminal,
  WezTerm: spawnWezTerm,
  Safari: spawnSafari,
  Finder: spawnFinder,
};

function main() {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error('usage: launch.js <profile-name>');
    process.exit(1);
  }
  const file = path.join(PROFILE_DIR, `${profileName}.json`);
  if (!fs.existsSync(file)) {
    console.error(`profile not found: ${file}`);
    process.exit(1);
  }
  const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  const screen = screenSize();
  const menuH = menuBarHeight();
  console.log(`> ${profile.name || profileName} (${profile.windows.length} windows, ${screen.w}x${screen.h}, menu ${menuH}px)`);
  for (const [i, win] of profile.windows.entries()) {
    const resolved = { ...win, bounds: resolveBounds(win.bounds, screen, menuH) };
    const adapter = ADAPTERS[win.app] || spawnGeneric;
    const label = `${i + 1}. ${win.app}${win.command ? ' :: ' + win.command.slice(0, 50) : ''}${win.tabs ? ' :: ' + win.tabs.length + ' tab(s)' : ''}${win.path ? ' :: ' + win.path : ''}`;
    try {
      adapter(resolved);
      console.log(`  ok  ${label}`);
    } catch (e) {
      console.error(`  err ${label} -- ${e.message}`);
    }
  }
}

main();
