import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Icon,
  List,
  Toast,
  confirmAlert,
  showToast,
} from "@raycast/api";
import { execFileSync, spawn } from "child_process";
import { existsSync, promises as fs } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { useEffect, useState } from "react";

// Locate the repo. The Extension lives at <repo>/extension/src/browse.tsx,
// so going up two levels from __dirname gives the repo root in dev mode.
// In built form, ray copies us into a temp dir, so we fall back to a known
// path under ~/Documents/Work/Personal. Users on a different machine can
// override via the LAUNCHER_REPO env var.
const REPO_DIR =
  process.env.LAUNCHER_REPO ||
  (existsSync(join(__dirname, "..", "..", "launch.js"))
    ? join(__dirname, "..", "..")
    : join(homedir(), "Documents/Work/Personal/simple-raycast-workspace-launcher"));

const PROFILES_DIR = join(REPO_DIR, "profiles");

type WindowEntry = {
  app: string;
  bounds: unknown[];
  cwd?: string;
  command?: string;
  tabs?: string[];
  path?: string;
};

type Profile = {
  name: string;
  path: string;
  windowCount: number;
  appCounts: Record<string, number>;
};

async function loadProfiles(): Promise<Profile[]> {
  if (!existsSync(PROFILES_DIR)) return [];
  const files = (await fs.readdir(PROFILES_DIR)).filter(
    (f) => f.endsWith(".json") && !f.endsWith(".bak.json") && !f.endsWith(".json.bak"),
  );
  const profiles: Profile[] = [];
  for (const f of files) {
    const p = join(PROFILES_DIR, f);
    try {
      const text = await fs.readFile(p, "utf8");
      const json = JSON.parse(text);
      const wins: WindowEntry[] = Array.isArray(json.windows) ? json.windows : [];
      const counts: Record<string, number> = {};
      for (const w of wins) {
        counts[w.app] = (counts[w.app] || 0) + 1;
      }
      profiles.push({
        name: basename(f, ".json"),
        path: p,
        windowCount: wins.length,
        appCounts: counts,
      });
    } catch {
      // ignore malformed profile JSONs
    }
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

function formatAppCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([app, n]) => `${app} ×${n}`)
    .join(", ");
}

// Spawn a Node script that does long-running side-effecty work (launch a layout).
// Detached + ignored stdio so the Extension can return immediately while the
// engine continues opening windows.
function spawnEngineDetached(scriptName: string, ...args: string[]) {
  const child = spawn(process.execPath, [join(REPO_DIR, scriptName), ...args], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      // Make sure osascript, lsof, etc. resolve under Raycast's spawn context.
      PATH: `${process.env.PATH || ""}:/usr/bin:/usr/sbin:/bin:/opt/homebrew/bin:/usr/local/bin`,
    },
  });
  child.unref();
}

// Run a short, synchronous Node script (delete) and surface errors.
function runEngineSync(scriptName: string, ...args: string[]): string {
  return execFileSync(process.execPath, [join(REPO_DIR, scriptName), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${process.env.PATH || ""}:/usr/bin:/usr/sbin:/bin:/opt/homebrew/bin:/usr/local/bin`,
    },
  });
}

export default function Browse() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setProfiles(await loadProfiles());
    } catch (e) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to read profiles",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <List isLoading={loading} navigationTitle="Saved Layouts" searchBarPlaceholder="Filter layouts…">
      {!loading && profiles.length === 0 ? (
        <List.EmptyView
          icon={Icon.Tray}
          title="No layouts saved yet"
          description='Run "Launcher: Capture Current" to save your first one.'
        />
      ) : (
        profiles.map((p) => (
          <List.Item
            key={p.name}
            icon={{ source: Icon.Window, tintColor: Color.Blue }}
            title={p.name}
            subtitle={`${p.windowCount} window${p.windowCount === 1 ? "" : "s"}`}
            accessories={[{ text: formatAppCounts(p.appCounts) }]}
            actions={
              <ActionPanel>
                <Action
                  title="Launch"
                  icon={Icon.Rocket}
                  onAction={async () => {
                    spawnEngineDetached("launch.js", p.name);
                    await showToast({
                      style: Toast.Style.Success,
                      title: `Launching ${p.name}…`,
                    });
                  }}
                />
                <Action.Open
                  title="Edit JSON"
                  target={p.path}
                  icon={Icon.Pencil}
                  shortcut={{ modifiers: ["cmd"], key: "e" }}
                />
                <Action.ShowInFinder
                  path={p.path}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
                <Action
                  title="Reveal Containing Folder"
                  icon={Icon.Folder}
                  shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                  onAction={async () => {
                    await showToast({ style: Toast.Style.Success, title: dirname(p.path) });
                  }}
                />
                <Action
                  title="Delete"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  shortcut={{ modifiers: ["cmd"], key: "delete" }}
                  onAction={async () => {
                    const confirmed = await confirmAlert({
                      title: `Delete "${p.name}"?`,
                      message:
                        "Removes the profile JSON and its Raycast wrapper. Windows currently on screen are NOT closed — use Teardown for that.",
                      primaryAction: {
                        title: "Delete",
                        style: Alert.ActionStyle.Destructive,
                      },
                    });
                    if (!confirmed) return;
                    try {
                      runEngineSync("delete.js", p.name);
                      await showToast({
                        style: Toast.Style.Success,
                        title: `Deleted ${p.name}`,
                      });
                      await refresh();
                    } catch (e) {
                      await showToast({
                        style: Toast.Style.Failure,
                        title: "Delete failed",
                        message: e instanceof Error ? e.message : String(e),
                      });
                    }
                  }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
