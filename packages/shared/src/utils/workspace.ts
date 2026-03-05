import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync, existsSync } from 'node:fs';

/**
 * Resolve the ForgeAI workspace root directory.
 *
 * Priority:
 * 1. FORGEAI_WORKSPACE env var (explicit override)
 * 2. ~/.forgeai/workspace (user home — decoupled from project, like OpenClaw)
 *
 * On Linux/VPS: /root/.forgeai/workspace
 * On Windows:   C:\Users\<user>\.forgeai\workspace
 *
 * The directory is created automatically if it doesn't exist.
 */
export function resolveWorkspaceRoot(): string {
  if (process.env['FORGEAI_WORKSPACE']) {
    const custom = resolve(process.env['FORGEAI_WORKSPACE']);
    ensureDir(custom);
    return custom;
  }

  const home = homedir();
  const workspace = resolve(home, '.forgeai', 'workspace');
  ensureDir(workspace);
  return workspace;
}

/**
 * Resolve the ForgeAI data root directory (~/.forgeai).
 * Used for config, vault, screenshots, etc.
 */
export function resolveForgeAIRoot(): string {
  if (process.env['FORGEAI_HOME']) {
    const custom = resolve(process.env['FORGEAI_HOME']);
    ensureDir(custom);
    return custom;
  }

  const home = homedir();
  const forgeaiRoot = resolve(home, '.forgeai');
  ensureDir(forgeaiRoot);
  return forgeaiRoot;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch { /* may race with another process */ }
  }
}
