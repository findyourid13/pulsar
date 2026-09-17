# Pulsar

[English](README.md) | [한국어](README.ko.md)

Displays one of your Cosmo objekts as a slowly rotating card that floats above your other windows.

Pulsar is not affiliated with, endorsed by, or supported by MODHAUS or its artists. Objekt artwork is MODHAUS's; Pulsar fetches it per-user at runtime and caches it locally, and never bundles or redistributes it.

## Features

Pulsar renders one objekt — a digital photocard from MODHAUS's Cosmo: the Gate app — as a double-sided card that spins slowly on your desktop, always on top, click-through everywhere except the card itself. Sign in with your Cosmo email to spin your own collection.

Everything is controlled from the tray icon:

- **Appearance** — jump to the next objekt, pick a size, adjust opacity
- **Spinning** — pause, change spin speed (15/30/60s per revolution), or reverse direction
- **Collection** — choose which objekts to show, shuffle on a schedule (or never), refresh on demand, see when it was last cached
- **Connection** — sign in or out of Cosmo, see whether the collection is live, cached, or unavailable
- **Utilities** — toggle click-through on the card, recenter it on screen
- **System** — launch at login

## Getting started

Download the latest build from [Releases](https://github.com/findyourid13/pulsar/releases) — a `.dmg` for macOS or an installer for Windows.

The build is unsigned, so your OS will warn on first launch:

- **macOS**: "Apple could not verify..." — right-click the app → Open, then confirm.
- **Windows**: SmartScreen "Windows protected your PC" → More info → Run anyway.

On first launch the card shows a placeholder — use the tray icon's "Sign in to Cosmo…" to spin your own collection. Pulsar checks for updates automatically.

## Building from source

```sh
npm install
npm run dev
```

Requires Node.js and npm.

```sh
npm run build        # electron-vite production build
npm run package      # build + electron-builder, for the host platform
npm run package:mac  # dmg
npm run package:win  # nsis installer
```

Cross-building the Windows NSIS installer from macOS needs `wine` installed (electron-builder shells out to it for the installer step); without it, `--dir` still produces a working unpacked `dist/win-unpacked/` build to sanity-check packaging.
