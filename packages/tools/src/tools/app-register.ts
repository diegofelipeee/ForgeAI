import { BaseTool } from '../base.js';
import type { ToolDefinition, ToolResult } from '../base.js';
import { createLogger } from '@forgeai/shared';

const logger = createLogger('Tool:AppRegister');

// ─── Minimal interfaces to avoid circular deps ──────────

interface AppRegistryEntry {
  port: number;
  name: string;
  createdAt: string;
  description?: string;
}

interface AppRegistryRef {
  set(name: string, entry: AppRegistryEntry): void;
  has(name: string): boolean;
  get(name: string): AppRegistryEntry | undefined;
  entries(): IterableIterator<[string, AppRegistryEntry]>;
}

interface AppManagerRef {
  startApp(params: {
    name: string;
    port: number;
    cwd: string;
    command: string;
    args?: string[];
    description?: string;
  }): Promise<{ success: boolean; error?: string }>;
}

interface VaultRef {
  isInitialized(): boolean;
  set(key: string, value: string): void;
  get(key: string): string | null;
}

interface AppRegisterRefs {
  appRegistry: AppRegistryRef;
  appManager: AppManagerRef | null;
  vault: VaultRef | null;
  publicUrl: string;
  getSiteUrl: (name: string) => string;
}

// ─── Global Ref (set by gateway) ─────────────────────────

let refs: AppRegisterRefs | null = null;

export function setAppRegisterRefs(r: AppRegisterRefs): void {
  refs = r;
  logger.info('AppRegister refs set');
}

// ─── Tool ────────────────────────────────────────────────

export class AppRegisterTool extends BaseTool {
  readonly definition: ToolDefinition = {
    name: 'app_register',
    description: `Register and optionally start a dynamic web app so it becomes accessible via the ForgeAI proxy.
This is the PREFERRED way to make apps accessible. It registers the app in the internal registry and optionally starts it as a managed process with auto-restart and health checks.

Two modes:
1. MANAGED (recommended): Provide cwd + command — AppManager starts the process, monitors health, and auto-restarts on crash.
2. UNMANAGED: Only provide name + port — registers the app for proxy routing. You must start the process yourself first.

After registration, the app is accessible at /apps/<name>/ (name-based URL).
Do NOT use curl to call /api/apps/register — use this tool instead.`,
    category: 'utility',
    dangerous: false,
    parameters: [
      { name: 'name', type: 'string', description: 'App name (lowercase, alphanumeric + hyphens, e.g. "war-monitor", "portfolio"). Must be descriptive — it becomes part of the public URL.', required: true },
      { name: 'port', type: 'number', description: 'Port number the app listens on (1024-65535). Must not conflict with reserved ports (18800, 3306).', required: true },
      { name: 'cwd', type: 'string', description: 'Working directory of the app (absolute path, e.g. "/root/.forgeai/workspace/my-app"). Required for managed mode.', required: false },
      { name: 'command', type: 'string', description: 'Command to start the app (e.g. "node", "python3"). Required for managed mode.', required: false },
      { name: 'args', type: 'array', description: 'Arguments for the command (e.g. ["server.js"] or ["app.py"]). Used with command.', required: false },
      { name: 'description', type: 'string', description: 'Short description of the app.', required: false },
    ],
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!refs) {
      return { success: false, error: 'AppRegister not initialized — refs not set by gateway', duration: 0 };
    }

    const validationError = this.validateParams(params);
    if (validationError) return { success: false, error: validationError, duration: 0 };

    const rawName = String(params['name']).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    const port = Number(params['port']);
    const cwd = params['cwd'] ? String(params['cwd']).trim() : null;
    const command = params['command'] ? String(params['command']).trim() : null;
    const args = Array.isArray(params['args']) ? params['args'].map(String) : [];
    const description = params['description'] ? String(params['description']).trim() : undefined;

    // Validate name
    if (!rawName || rawName.length < 2) {
      return { success: false, error: 'App name must be at least 2 characters (alphanumeric + hyphens)', duration: 0 };
    }

    // Validate port
    if (port < 1024 || port > 65535) {
      return { success: false, error: 'Port must be between 1024 and 65535', duration: 0 };
    }
    const reservedPorts = [18800, 3306];
    if (reservedPorts.includes(port)) {
      return { success: false, error: `Port ${port} is reserved (${port === 18800 ? 'Gateway' : 'MySQL'}). Choose a different port.`, duration: 0 };
    }

    const { result, duration } = await this.timed(async () => {
      const actions: string[] = [];

      // 1. Register in appRegistry
      refs!.appRegistry.set(rawName, {
        port,
        name: rawName,
        createdAt: new Date().toISOString(),
        description,
      });
      actions.push(`Registered app "${rawName}" on port ${port}`);

      // 2. If cwd + command provided, start as managed app
      let managed = false;
      if (cwd && command && refs!.appManager) {
        const startResult = await refs!.appManager.startApp({
          name: rawName,
          port,
          cwd,
          command,
          args,
          description,
        });
        managed = startResult.success;
        if (startResult.success) {
          actions.push(`Started as managed app (auto-restart enabled)`);
        } else {
          actions.push(`Managed start failed: ${startResult.error} — app is registered but not managed`);
        }
      } else if (cwd && command && !refs!.appManager) {
        actions.push('AppManager not available — registered as unmanaged');
      }

      // 3. Persist to vault
      if (refs!.vault?.isInitialized()) {
        const registryData = JSON.stringify(Array.from(refs!.appRegistry.entries()));
        refs!.vault.set('config:app_registry', registryData);
        actions.push('Registry persisted to vault');
      }

      // 4. Build URL
      const url = refs!.getSiteUrl(rawName);

      logger.info('App registered via tool', { name: rawName, port, managed, url });

      return {
        registered: true,
        name: rawName,
        port,
        url,
        managed,
        actions,
      };
    });

    return { success: true, data: result, duration };
  }
}
