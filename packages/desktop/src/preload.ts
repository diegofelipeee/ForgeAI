import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('forgeDesktop', {
  // Window controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  toggle: () => ipcRenderer.invoke('window-toggle'),

  // Gateway
  getGatewayUrl: () => ipcRenderer.invoke('get-gateway-url'),

  // Native notifications
  showNotification: (opts: { title: string; body: string; silent?: boolean }) =>
    ipcRenderer.invoke('show-notification', opts),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // Updates
  checkUpdates: () => ipcRenderer.invoke('check-updates'),

  // Listen for navigation commands from main process
  onNavigate: (callback: (path: string) => void) => {
    ipcRenderer.on('navigate', (_event, path: string) => callback(path));
  },

  // Listen for update events
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  onUpdateDownloaded: (callback: (info: { version: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_event, info) => callback(info));
  },

  // Platform info
  platform: process.platform,
  isPackaged: process.argv.includes('--packaged'),
});
