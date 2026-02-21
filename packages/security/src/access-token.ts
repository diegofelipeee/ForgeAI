import { randomBytes } from 'node:crypto';
import { createLogger } from '@forgeai/shared';

const logger = createLogger('Security:AccessToken');

export interface AccessToken {
  token: string;
  expiresAt: Date;
  createdAt: Date;
  used: boolean;
  ipAddress?: string;
}

export interface AccessTokenConfig {
  /** Token lifetime in seconds (default: 300 = 5 minutes) */
  tokenTTL?: number;
  /** Maximum active tokens at once (default: 5) */
  maxActiveTokens?: number;
  /** Failed attempt limit before IP lockout (default: 10) */
  maxFailedAttempts?: number;
  /** IP lockout duration in seconds (default: 900 = 15 minutes) */
  lockoutDuration?: number;
}

export class AccessTokenManager {
  private tokens: Map<string, AccessToken> = new Map();
  private failedAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();
  private tokenTTL: number;
  private maxActiveTokens: number;
  private maxFailedAttempts: number;
  private lockoutDuration: number;

  constructor(config?: AccessTokenConfig) {
    this.tokenTTL = config?.tokenTTL ?? 300;
    this.maxActiveTokens = config?.maxActiveTokens ?? 5;
    this.maxFailedAttempts = config?.maxFailedAttempts ?? 10;
    this.lockoutDuration = config?.lockoutDuration ?? 900;
    logger.info('AccessTokenManager initialized', { tokenTTL: this.tokenTTL, maxActive: this.maxActiveTokens });
  }

  /**
   * Generate a new temporary access token.
   * Returns the token string and its expiration time.
   */
  generate(): { token: string; expiresAt: Date; expiresInSeconds: number } {
    // Cleanup expired tokens first
    this.cleanup();

    // Enforce max active tokens
    if (this.tokens.size >= this.maxActiveTokens) {
      // Remove oldest token
      const oldest = [...this.tokens.entries()]
        .sort(([, a], [, b]) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (oldest) {
        this.tokens.delete(oldest[0]);
      }
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.tokenTTL * 1000);

    this.tokens.set(token, {
      token,
      expiresAt,
      createdAt: new Date(),
      used: false,
    });

    logger.info('Access token generated', {
      expiresAt: expiresAt.toISOString(),
      activeTokens: this.tokens.size,
    });

    return { token, expiresAt, expiresInSeconds: this.tokenTTL };
  }

  /**
   * Validate and consume an access token.
   * Returns true if the token is valid and marks it as used.
   */
  validate(token: string, ipAddress?: string): { valid: boolean; reason?: string } {
    // Check IP lockout
    if (ipAddress) {
      const attempts = this.failedAttempts.get(ipAddress);
      if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
        const remainingSec = Math.ceil((attempts.lockedUntil.getTime() - Date.now()) / 1000);
        logger.warn('Access attempt from locked IP', { ipAddress, remainingSec });
        return { valid: false, reason: `IP locked out. Try again in ${remainingSec}s` };
      }
    }

    const stored = this.tokens.get(token);

    if (!stored) {
      this.recordFailedAttempt(ipAddress);
      return { valid: false, reason: 'Invalid token' };
    }

    if (stored.used) {
      this.tokens.delete(token);
      this.recordFailedAttempt(ipAddress);
      return { valid: false, reason: 'Token already used' };
    }

    if (stored.expiresAt < new Date()) {
      this.tokens.delete(token);
      this.recordFailedAttempt(ipAddress);
      return { valid: false, reason: 'Token expired' };
    }

    // Mark as used and remove
    stored.used = true;
    stored.ipAddress = ipAddress;
    this.tokens.delete(token);

    // Clear failed attempts for this IP on success
    if (ipAddress) {
      this.failedAttempts.delete(ipAddress);
    }

    logger.info('Access token validated successfully', { ipAddress });
    return { valid: true };
  }

  /**
   * Record a failed validation attempt for rate limiting.
   */
  private recordFailedAttempt(ipAddress?: string): void {
    if (!ipAddress) return;

    const existing = this.failedAttempts.get(ipAddress) || { count: 0 };
    existing.count++;

    if (existing.count >= this.maxFailedAttempts) {
      existing.lockedUntil = new Date(Date.now() + this.lockoutDuration * 1000);
      logger.warn('IP locked out due to failed access attempts', {
        ipAddress,
        attempts: existing.count,
        lockedUntilSec: this.lockoutDuration,
      });
    }

    this.failedAttempts.set(ipAddress, existing);
  }

  /**
   * Get count of active (non-expired, non-used) tokens.
   */
  get activeCount(): number {
    this.cleanup();
    return this.tokens.size;
  }

  /**
   * Remove all expired tokens and old lockout records.
   */
  private cleanup(): void {
    const now = new Date();
    for (const [key, token] of this.tokens) {
      if (token.expiresAt < now || token.used) {
        this.tokens.delete(key);
      }
    }
    // Clean old lockouts
    for (const [ip, data] of this.failedAttempts) {
      if (data.lockedUntil && data.lockedUntil < now) {
        this.failedAttempts.delete(ip);
      }
    }
  }

  /**
   * Revoke all active tokens (emergency).
   */
  revokeAll(): number {
    const count = this.tokens.size;
    this.tokens.clear();
    logger.warn('All access tokens revoked', { count });
    return count;
  }
}

export function createAccessTokenManager(config?: AccessTokenConfig): AccessTokenManager {
  return new AccessTokenManager(config);
}
