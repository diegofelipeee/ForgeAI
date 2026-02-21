# @forgeai/desktop

Native Electron desktop wrapper for ForgeAI Dashboard.

## Features

- **System Tray** — ForgeAI runs in background, accessible via tray icon
- **Global Hotkeys** — `Ctrl+Shift+F` toggle window, `Ctrl+Shift+C` quick chat
- **Native Notifications** — OS-level notifications for agent events
- **Auto-Update** — Automatic updates via GitHub Releases (electron-updater)
- **Startup on Boot** — Optional auto-start with the OS
- **Single Instance** — Only one ForgeAI window at a time
- **Minimize to Tray** — Close button minimizes instead of quitting

## Development

```bash
# Install dependencies
pnpm install

# Build the desktop package
pnpm --filter @forgeai/desktop build

# Run in development (requires dashboard dev server on port 3000)
pnpm --filter @forgeai/desktop dev
```

## Building Distributables

```bash
# Build for current platform
pnpm --filter @forgeai/desktop dist

# Platform-specific
pnpm --filter @forgeai/desktop dist:win    # Windows (NSIS + Portable)
pnpm --filter @forgeai/desktop dist:mac    # macOS (DMG + ZIP)
pnpm --filter @forgeai/desktop dist:linux  # Linux (AppImage + DEB)
```

## Icons

Place your icons in the `assets/` directory:
- `icon.ico` — Windows (256x256)
- `icon.icns` — macOS
- `icon.png` — Linux (512x512)

## Architecture

```
src/
├── main.ts      — Electron main process (window, IPC, lifecycle)
├── preload.ts   — Context bridge (exposes native APIs to renderer)
├── tray.ts      — System tray with context menu
├── updater.ts   — Auto-update via electron-updater
└── store.ts     — Persistent settings (electron-store)
```

The desktop app loads the Dashboard (React) either from:
1. **Development**: Vite dev server at `http://127.0.0.1:3000`
2. **Production**: Built dashboard files bundled in `extraResources`
