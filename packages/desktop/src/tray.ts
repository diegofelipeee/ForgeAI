import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';

let tray: Tray | null = null;
let quitCallback: (() => void) | null = null;

export function setQuitCallback(cb: () => void): void {
  quitCallback = cb;
}

export function createTray(mainWindow: BrowserWindow, iconPath: string): Tray {
  const icon = iconPath
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('ForgeAI — AI Assistant');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show ForgeAI',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      },
    },
    {
      label: 'Open Chat',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('navigate', '/chat');
      },
    },
    { type: 'separator' },
    {
      label: 'Start on Boot',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit ForgeAI',
      click: () => {
        if (quitCallback) quitCallback();
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click to show window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
