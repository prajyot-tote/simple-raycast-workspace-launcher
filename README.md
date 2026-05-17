# Simple Raycast Workspace Launcher

Save your Mac workspace as JSON. One Raycast hotkey opens it back.

Capture the windows currently on your screen — Terminals with their working directory and running command, Safari with its tabs, Finder with its path, anything else by position and size. Replay any saved layout with a single Raycast keystroke. Tear down the current Space the same way.

## Features

- **Capture current windows** to a JSON profile, with Terminal cwd + foreground command, Safari tab URLs, and Finder paths.
- **Current-Space filter** via macOS Quartz — only on-screen windows are saved, not windows hidden on other Spaces.
- **Launch any saved layout** with one Raycast command.
- **Teardown the current Space** to close every non-system window at once.
- **Auto-registers** new Raycast commands when you capture a new profile.
- **Per-app adapters**: Terminal, WezTerm, Safari, Finder, plus a generic fallback that works on any app.

## Requirements

- macOS (uses AppleScript + Quartz + System Events)
- [Raycast](https://www.raycast.com)
- Node.js (any recent version; resolved via nvm / Homebrew / system path)
- Xcode Command Line Tools (`xcode-select --install`) — needed once to compile the Swift helper

## Installation

```bash
git clone https://github.com/prajyot-tote/simple-raycast-workspace-launcher.git
cd simple-raycast-workspace-launcher
bash install.sh
```

`install.sh` verifies Xcode CLT, compiles the Swift helper, and prints the four one-time manual steps you have to do per machine (see below).

## Usage

In Raycast:

- **Layout: Capture Current** — snapshot the windows currently visible on this Space. Prompts for a profile name. Auto-creates a matching `Layout: <Name>` command.
- **Layout: \<Name\>** — relaunch a saved layout.
- **Layout: Teardown** — close every non-system window on the current Space.

## Profile Schema

Profiles live in `profiles/<name>.json`. Each is a list of windows.

```json
{
  "name": "Dev",
  "windows": [
    {
      "app": "Terminal",
      "bounds": [0, "menu", 600, "100%"],
      "cwd": "~/projects/my-app",
      "command": "pnpm dev"
    },
    {
      "app": "Safari",
      "bounds": [600, "menu", "100%", "50%"],
      "tabs": ["http://localhost:3000"]
    },
    {
      "app": "Finder",
      "bounds": [600, "50%", "100%", "100%"],
      "path": "~/Downloads"
    }
  ]
}
```

### Window fields

| Field | Type | Required | Description |
|---|---|---|---|
| `app` | string | yes | `Terminal`, `WezTerm`, `Safari`, `Finder`, or any other app name |
| `bounds` | `[x1, y1, x2, y2]` | yes | Pixel coords from top-left of main display. Each value can also be `"50%"` (percent of screen) or `"menu"` (= menu bar height) |
| `cwd` | string | no | Working directory to `cd` into (Terminal / WezTerm). Use `~` for home |
| `command` | string | no | Shell command to run after `cd` (Terminal / WezTerm) |
| `tabs` | string[] | no | URLs to open as tabs (Safari) |
| `path` | string | no | Folder to open (Finder, or any app launched with a path arg) |
| `process` | string | no | System Events process name if it differs from `app` (generic apps) |
| `openArgs` | string | no | Extra args passed to `open -na <app> --args ...` (generic apps) |

## Per-Machine One-Time Setup

The installer can't do these for you — macOS scopes them per machine + per app.

1. **Add the script directory to Raycast.** Raycast → Settings → Extensions → Script Commands → Add Directory → `./raycast/`.
2. **Grant Automation permissions** when macOS prompts on first capture / launch (Terminal, Safari, Finder).
3. **Grant Accessibility permission** to Raycast (System Settings → Privacy & Security → Accessibility) — needed for closing generic-app windows via Cmd+W during teardown.
4. **Keep layouts on the current Space.** System Settings → Desktop & Dock → Mission Control → turn OFF *"When switching to an application, switch to a Space with open windows for the application"*. Without this, launching an app whose windows live on another Space will yank you over there.

## Limitations

Be realistic about what's capturable:

- **Profiles don't transfer between machines.** Pixel bounds are tied to your display configuration; cwds and commands assume specific directories / installed binaries.
- **Terminal capture: foreground command only.** Pipelines collapse to the first command; backgrounded jobs are invisible.
- **Session state isn't captured.** `claude --resume <id>` would save with the id if it's literally in the command line, but session resumption depends on the app — no scrollback, no TUI state.
- **Electron / web apps** (Linear, Notion, Slack, most non-Apple apps) don't expose AppleScript dictionaries — only bounds + bundle. Tabs and internal state aren't accessible.
- **Closing a Terminal with a running command** triggers macOS's "process is still running" dialog. Suppress via Terminal → Settings → Profiles → Shell → Ask before closing → Never.

## License

[MIT](LICENSE)
