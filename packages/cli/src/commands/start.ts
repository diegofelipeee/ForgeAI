import type { Command } from 'commander';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createGateway } from '@forgeai/core';
import { initDatabase, runMigrations } from '@forgeai/core';
import { MySQLAuditStore } from '@forgeai/core';
import { APP_NAME } from '@forgeai/shared';

const DEFAULT_SECRETS = ['change-me-to-a-random-jwt-secret', 'change-me-to-a-strong-password', 'change-me-to-a-random-secret'];

function isDefaultOrEmpty(value: string | undefined): boolean {
  return !value || DEFAULT_SECRETS.includes(value);
}

/** Auto-generate and persist secrets on first run so docker compose up "just works". */
function resolveSecrets(forgeDir: string): { jwtSecret: string; vaultPassword: string } {
  const secretsPath = resolve(forgeDir, 'generated-secrets.json');

  // Try to load previously generated secrets
  let saved: Record<string, string> = {};
  if (existsSync(secretsPath)) {
    try { saved = JSON.parse(readFileSync(secretsPath, 'utf-8')); } catch { /* ignore */ }
  }

  let jwtSecret = process.env['JWT_SECRET'];
  let vaultPassword = process.env['VAULT_MASTER_PASSWORD'];
  let generated = false;

  if (isDefaultOrEmpty(jwtSecret)) {
    jwtSecret = saved['jwtSecret'] ?? randomBytes(32).toString('hex');
    generated = true;
  }

  if (isDefaultOrEmpty(vaultPassword)) {
    vaultPassword = saved['vaultPassword'] ?? randomBytes(24).toString('base64url');
    generated = true;
  }

  // Persist for next restart
  if (generated && !existsSync(secretsPath)) {
    if (!existsSync(forgeDir)) mkdirSync(forgeDir, { recursive: true });
    writeFileSync(secretsPath, JSON.stringify({ jwtSecret, vaultPassword }, null, 2), { mode: 0o600 });
    console.log('🔐 Security secrets auto-generated and saved to .forgeai/generated-secrets.json');
    console.log('   To use your own secrets, set JWT_SECRET and VAULT_MASTER_PASSWORD in .env\n');
  }

  return { jwtSecret: jwtSecret!, vaultPassword: vaultPassword! };
}

export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description(`Start the ${APP_NAME} Gateway`)
    .option('-H, --host <host>', 'Gateway host', process.env['GATEWAY_HOST'] || '127.0.0.1')
    .option('-p, --port <port>', 'Gateway port', process.env['GATEWAY_PORT'] || '18800')
    .option('--migrate', 'Run database migrations before starting', false)
    .option('--verbose', 'Enable verbose logging', false)
    .action(async (options: { host: string; port: string; migrate: boolean; verbose: boolean }) => {
      console.log(`\n🔥 Starting ${APP_NAME} Gateway...\n`);

      const forgeDir = resolve(process.cwd(), '.forgeai');
      const { jwtSecret, vaultPassword } = resolveSecrets(forgeDir);

      try {
        // Initialize database
        console.log('📦 Connecting to MySQL...');
        const db = await initDatabase();

        if (options.migrate) {
          console.log('🔄 Running migrations...');
          await runMigrations();
        }

        // Create gateway
        const gateway = createGateway({
          host: options.host,
          port: Number(options.port),
          jwtSecret,
          vaultPassword,
          rateLimitWindowMs: Number(process.env['RATE_LIMIT_WINDOW_MS']) || 60_000,
          rateLimitMaxRequests: Number(process.env['RATE_LIMIT_MAX_REQUESTS']) || 60,
        });

        // Connect audit logger to MySQL
        const auditStore = new MySQLAuditStore(db);
        gateway.auditLogger.setStore(auditStore);

        // Initialize vault with file persistence
        const vaultFilePath = resolve(process.cwd(), '.forgeai', 'vault.json');
        console.log('🔐 Initializing Vault...');
        await gateway.vault.initialize(vaultPassword, undefined, vaultFilePath);

        // Initialize and start
        await gateway.initialize();
        await gateway.start();

        const g = '\x1b[90m';
        const w = '\x1b[97m';
        const o = '\x1b[38;5;208m';
        const gr = '\x1b[32m';
        const r = '\x1b[0m';

        console.log(`${gr}  Gateway is running!${r}`);
        console.log(`${g}  ──────────────────────────────────────────────${r}`);
        console.log(`${w}  HTTP${g}  ${o}http://${options.host}:${options.port}${r}`);
        console.log(`${w}  WS${g}    ${o}ws://${options.host}:${options.port}/ws${r}`);
        console.log(`${g}  ──────────────────────────────────────────────${r}`);
        console.log(`${w}  Security${g}  RBAC ${gr}✓${g} | Vault ${gr}✓${g} | RateLimit ${gr}✓${g} | PromptGuard ${gr}✓${r}`);
        console.log(`${g}            AuditLog ${gr}✓${g} | InputSanitizer ${gr}✓${g} | 2FA ${gr}✓${r}`);
        console.log('');

        // Graceful shutdown
        const shutdown = async () => {
          console.log('\n🛑 Shutting down...');
          await gateway.stop();
          process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

      } catch (error) {
        console.error('❌ Failed to start gateway:', error);
        process.exit(1);
      }
    });
}
