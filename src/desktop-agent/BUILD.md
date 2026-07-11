# Building the FirmTrack Tracker installer

A system-tray-only Electron app that reports the active window on this PC to
FirmTrack every 30/60/300 seconds (configurable), so it can be reviewed and
converted into time entries from **TimeTrack > Activity Log** in the web app.

> **Note on auth:** this app authenticates against the API key system that
> already ships with FirmTrack — the `agent_api_keys` table and
> `/api/timetrack/activity` route (`x-api-key` header, key hashed at rest).
> It does **not** use a separate `tracker_api_keys` table or
> `/api/admin/tracker-key` route — an earlier draft of this spec called for
> a second, parallel key system; we consolidated onto the one already built
> and tested to avoid maintaining two auth paths for the same feature.

## Prerequisites

- Node.js 18+
- Windows, with Visual Studio Build Tools (C++ workload) and Python 3 —
  required by `electron-builder` to rebuild native modules (`active-win`'s
  dependencies) for the packaged app. If you only need to run it in dev
  (`npm start`), these aren't required.

## Setup

```
cd src/desktop-agent
npm install
```

## Run in development

```
npm start
```

This launches the tray-only app immediately — look for the blue circle icon
in the Windows system tray. Click it (or right-click > Settings) to open the
settings window and configure the server URL and API key.

## Build the installer

```
npm run build:installer
```

Output: `src/desktop-agent/dist/FirmTrack Tracker Setup 1.0.0.exe`

(`npm run build` also works — both run `electron-builder --win --x64`; the
`nsis` target is explicit in `build:installer` for clarity, since NSIS is
already the only configured Windows target in `electron-builder.yml`.)

The installer is a one-click NSIS installer (no install-directory picker,
per-user install, Start Menu shortcut, launches the app after install — no
desktop shortcut). Expect roughly 80–90MB, mostly Electron's runtime
(unavoidable with Electron; it's the trade-off for using web tech + a single
codebase instead of a native Win32 app).

## Getting an API key

1. Open the FirmTrack web app, sign in as the lawyer whose PC this is going
   on, and go to **TimeTrack > Activity Log**.
2. Click **Generate new agent key**. Copy it immediately — it's shown once.
3. In the tray app, open **Settings**, paste the key into **API key**, set
   **FirmTrack server URL** to your deployment's URL, and click **Save**.

Generate a separate key per lawyer/PC — don't share one, since activity is
attributed to whichever account generated the key.

## Self-hosted deployments

The **FirmTrack server URL** field in Settings is exactly what it sounds
like — point it at wherever your FirmTrack instance is deployed
(`https://yourfirm.example.com`). The installer doesn't bake in a server URL
at build time; every install configures it locally.

## Code signing (production)

Unsigned installers trigger a Windows SmartScreen warning. Before a public
release:

- Set `CSC_LINK` (path or URL to a `.pfx`) and `CSC_KEY_PASSWORD` env vars
  before running `npm run build:installer` — electron-builder signs
  automatically if these are present, no config change needed.
- A self-signed cert (`New-SelfSignedCertificate` in PowerShell) removes the
  warning for internal testing only; it won't satisfy SmartScreen for
  external users until you use a real OV/EV code-signing certificate from a
  CA.

See the comment block at the bottom of `electron-builder.yml` for the exact
config keys if you'd rather set the cert path there instead of env vars.

## Troubleshooting: "Electron failed to install correctly"

If `npm start` throws this error even after `npm install`, Node's `extract-zip`
(used internally by Electron's postinstall script) failed to fully extract
the downloaded Electron binary — `node_modules/electron/dist` will contain
only a `locales` folder (or be empty), missing `electron.exe`. This has been
observed even when the download itself completes correctly (verified via a
`~100MB`, 75-file zip in `%LOCALAPPDATA%\electron\Cache` that extracts fine
with Windows' own `Expand-Archive`) — the failure is specific to the Node
extraction path, likely antivirus/EDR interference with `node.exe` writing
many `.exe`/`.dll` files rapidly. `npm install` reports success regardless,
since the extraction failure isn't surfaced as an error.

Workaround — extract the cached zip manually and bypass `extract-zip`:

```powershell
$zip = Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -File | Select-Object -First 1
Remove-Item -Recurse -Force node_modules\electron\dist -ErrorAction SilentlyContinue
Expand-Archive -Path $zip.FullName -DestinationPath node_modules\electron\dist -Force
"electron.exe" | Out-File -NoNewline -Encoding ascii node_modules\electron\path.txt
npm start
```

If `%LOCALAPPDATA%\electron\Cache` has no zip yet (fresh machine, nothing
downloaded), run `npm install` once first to populate it, then apply the
workaround above.

## Replacing the placeholder icons

`assets/icon.png`, `assets/icon.ico`, `assets/tray-icon.png`, and
`assets/tray-icon-paused.png` are generated placeholders (solid blue/gray
circles) — there's no real FirmTrack logo yet. Swap them for real assets
(PNG for `icon.png`/tray icons, a real multi-resolution `.ico` for
`icon.ico`) before a public release. `assets/icon.svg` is the placeholder's
design source, kept for reference only — Windows doesn't use SVG for tray
or app icons.
