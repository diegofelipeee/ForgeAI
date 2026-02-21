import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

interface ForgeSettings {
  gatewayUrl: string;
  minimizeToTray: boolean;
  startOnBoot: boolean;
  globalHotkey: string;
  notifications: boolean;
  autoUpdate: boolean;
  windowBounds: { width: number; height: number };
  [key: string]: unknown;
}

const DEFAULTS: ForgeSettings = {
  gatewayUrl: 'http://127.0.0.1:18800',
  minimizeToTray: true,
  startOnBoot: false,
  globalHotkey: 'CommandOrControl+Shift+F',
  notifications: true,
  autoUpdate: true,
  windowBounds: { width: 1280, height: 820 },
};

class SettingsStore {
  private data: ForgeSettings;
  private filePath: string;

  constructor() {
    const userDataPath = app.getPath('userData');
    if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true });
    this.filePath = join(userDataPath, 'forgeai-settings.json');
    this.data = { ...DEFAULTS };
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = { ...DEFAULTS, ...parsed };
      }
    } catch {
      this.data = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch {
      // Silently fail on write errors
    }
  }

  get(key: string): unknown {
    return key in this.data ? this.data[key] : undefined;
  }

  set(key: string, value: unknown): void {
    this.data[key] = value;
    this.save();
  }
}

export const store = new SettingsStore();
