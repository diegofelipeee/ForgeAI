import { BrowserWindow, dialog } from 'electron';

export function setupAutoUpdate(mainWindow: BrowserWindow): void {
  // Dynamic import to avoid issues in development
  try {
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info: { version: string }) => {
      mainWindow.webContents.send('update-available', { version: info.version });
    });

    autoUpdater.on('update-downloaded', (info: { version: string }) => {
      mainWindow.webContents.send('update-downloaded', { version: info.version });

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'ForgeAI Update',
        message: `Version ${info.version} is ready to install.`,
        detail: 'The update will be installed when you restart ForgeAI.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    });

    autoUpdater.on('error', (err: Error) => {
      console.error('Auto-update error:', err.message);
    });

    // Check for updates after 5 seconds, then every 4 hours
    setTimeout(() => autoUpdater.checkForUpdates(), 5_000);
    setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1_000);
  } catch (err) {
    console.warn('Auto-updater not available:', err);
  }
}
