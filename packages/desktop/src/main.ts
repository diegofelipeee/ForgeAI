import { app, BrowserWindow, globalShortcut, ipcMain, shell, Notification, nativeImage } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { createTray, destroyTray, setQuitCallback } from './tray';
import { setupAutoUpdate } from './updater';
import { store } from './store';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const GATEWAY_URL = store.get('gatewayUrl') as string;
const DASHBOARD_PORT = 3000;

function getIconPath(): string {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  // In development: assets folder next to src
  const devPath = join(__dirname, '..', 'assets', iconName);
  // In production: assets folder in app resources
  const prodPath = join(process.resourcesPath, 'app', 'assets', iconName);
  if (existsSync(devPath)) return devPath;
  if (existsSync(prodPath)) return prodPath;
  return '';
}

function getDashboardURL(): string {
  // In development: connect to vite dev server
  if (!app.isPackaged) {
    return `http://127.0.0.1:${DASHBOARD_PORT}`;
  }
  // In production: load built dashboard from resources
  const dashboardPath = join(process.resourcesPath, 'dashboard', 'index.html');
  if (existsSync(dashboardPath)) {
    return `file://${dashboardPath}`;
  }
  // Fallback: connect to gateway's served dashboard
  return GATEWAY_URL;
}

function createMainWindow(): BrowserWindow {
  const iconPath = getIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'ForgeAI',
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined,
    backgroundColor: '#09090b',
    show: false,
    frame: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  const dashboardURL = getDashboardURL();
  mainWindow.loadURL(dashboardURL);

  // Show when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // External links open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (e) => {
    if (store.get('minimizeToTray') && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

function registerGlobalHotkeys(): void {
  // Toggle ForgeAI window
  globalShortcut.register('CommandOrControl+Shift+F', () => {
    if (!mainWindow) {
      createMainWindow();
      return;
    }
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Quick Chat focus (opens and focuses the chat input)
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (!mainWindow) createMainWindow();
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send('navigate', '/chat');
  });
}

function setupIPC(): void {
  // Get gateway URL
  ipcMain.handle('get-gateway-url', () => GATEWAY_URL);

  // Show native notification
  ipcMain.handle('show-notification', (_event, opts: { title: string; body: string; silent?: boolean }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: opts.title,
        body: opts.body,
        icon: getIconPath() || undefined,
        silent: opts.silent ?? false,
      });
      notification.on('click', () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notification.show();
    }
  });

  // Window controls
  ipcMain.handle('window-minimize', () => mainWindow?.minimize());
  ipcMain.handle('window-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('window-close', () => mainWindow?.close());
  ipcMain.handle('window-toggle', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { mainWindow?.show(); mainWindow?.focus(); }
  });

  // Settings
  ipcMain.handle('get-setting', (_event, key: string) => store.get(key));
  ipcMain.handle('set-setting', (_event, key: string, value: unknown) => {
    store.set(key, value);
    // Handle startup on boot toggle
    if (key === 'startOnBoot') {
      app.setLoginItemSettings({ openAtLogin: value as boolean });
    }
  });

  // App info
  ipcMain.handle('get-app-info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  }));

  // Check for updates manually
  ipcMain.handle('check-updates', () => {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.checkForUpdates();
  });
}

// ─── App Lifecycle ───────────────────────────────────────────

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', () => {
  createMainWindow();
  setQuitCallback(() => { isQuitting = true; });
  createTray(mainWindow!, getIconPath());
  registerGlobalHotkeys();
  setupIPC();

  if (app.isPackaged) {
    setupAutoUpdate(mainWindow!);
  }

  // Apply startup on boot from saved setting
  const startOnBoot = store.get('startOnBoot') as boolean;
  app.setLoginItemSettings({ openAtLogin: startOnBoot });
});

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked
  if (!mainWindow) createMainWindow();
  else mainWindow.show();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  destroyTray();
});

export { mainWindow, getIconPath };
