import { createTransport, type Transporter } from 'nodemailer';
import { randomInt } from 'node:crypto';
import { createLogger } from '@forgeai/shared';

const logger = createLogger('Security:EmailOTP');

export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean; // true for 465, false for 587/25
  user: string;
  pass: string;
  from: string;    // e.g. "ForgeAI <noreply@yourdomain.com>"
}

export interface PendingEmailOTP {
  code: string;
  email: string;
  createdAt: number;
  attempts: number;
}

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;

export class EmailOTPService {
  private transporter: Transporter | null = null;
  private config: SMTPConfig | null = null;
  private pendingCodes: Map<string, PendingEmailOTP> = new Map();

  /**
   * Configure SMTP transport. Can be called at any time to update config.
   */
  configure(config: SMTPConfig): void {
    this.config = config;
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
      tls: {
        rejectUnauthorized: false, // Allow self-signed certs for internal SMTP
      },
    });
    logger.info('SMTP configured', { host: config.host, port: config.port, from: config.from });
  }

  /**
   * Configure from environment variables.
   * Returns true if all required vars are present.
   */
  configureFromEnv(): boolean {
    const host = process.env['SMTP_HOST'];
    const port = process.env['SMTP_PORT'];
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];
    const from = process.env['SMTP_FROM'];

    if (!host || !user || !pass) {
      logger.debug('SMTP not configured (missing SMTP_HOST, SMTP_USER, or SMTP_PASS)');
      return false;
    }

    this.configure({
      host,
      port: Number(port) || 587,
      secure: Number(port) === 465,
      user,
      pass,
      from: from || `ForgeAI <${user}>`,
    });
    return true;
  }

  isConfigured(): boolean {
    return this.transporter !== null && this.config !== null;
  }

  /**
   * Generate a 6-digit OTP, store it, and send via email.
   * @param sessionId - Unique session identifier to tie the OTP to
   * @param email - Recipient email address
   * @returns true if email sent successfully
   */
  async sendOTP(sessionId: string, email: string): Promise<boolean> {
    if (!this.transporter || !this.config) {
      logger.error('Cannot send OTP: SMTP not configured');
      return false;
    }

    // Generate cryptographically secure 6-digit code
    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');

    // Store pending OTP
    this.pendingCodes.set(sessionId, {
      code,
      email,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Auto-cleanup after expiry
    setTimeout(() => {
      this.pendingCodes.delete(sessionId);
    }, OTP_EXPIRY_MS + 10_000);

    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: email,
        subject: '🔐 ForgeAI — Security Verification Code',
        html: this.buildEmailHTML(code),
        text: `Your ForgeAI verification code is: ${code}\n\nThis code expires in 5 minutes.\nIf you did not request this, please ignore this email.`,
      });

      logger.info('Email OTP sent', { email: this.maskEmail(email), sessionId });
      return true;
    } catch (err) {
      logger.error('Failed to send email OTP', { error: String(err), email: this.maskEmail(email) });
      this.pendingCodes.delete(sessionId);
      return false;
    }
  }

  /**
   * Verify the OTP code for a given session.
   */
  verify(sessionId: string, code: string): { valid: boolean; reason?: string } {
    const pending = this.pendingCodes.get(sessionId);

    if (!pending) {
      return { valid: false, reason: 'No pending email verification or code expired.' };
    }

    // Check expiry
    if (Date.now() - pending.createdAt > OTP_EXPIRY_MS) {
      this.pendingCodes.delete(sessionId);
      return { valid: false, reason: 'Email verification code expired. Request a new one.' };
    }

    // Check attempts
    pending.attempts++;
    if (pending.attempts > MAX_ATTEMPTS) {
      this.pendingCodes.delete(sessionId);
      return { valid: false, reason: 'Too many failed attempts. Request a new code.' };
    }

    // Constant-time comparison to prevent timing attacks
    if (code.length !== pending.code.length) {
      return { valid: false, reason: 'Invalid code.' };
    }

    let mismatch = 0;
    for (let i = 0; i < code.length; i++) {
      mismatch |= code.charCodeAt(i) ^ pending.code.charCodeAt(i);
    }

    if (mismatch !== 0) {
      return { valid: false, reason: 'Invalid code.' };
    }

    // Valid — consume the code
    this.pendingCodes.delete(sessionId);
    logger.info('Email OTP verified', { sessionId });
    return { valid: true };
  }

  /**
   * Check if there's a pending OTP for this session.
   */
  hasPending(sessionId: string): boolean {
    const pending = this.pendingCodes.get(sessionId);
    if (!pending) return false;
    if (Date.now() - pending.createdAt > OTP_EXPIRY_MS) {
      this.pendingCodes.delete(sessionId);
      return false;
    }
    return true;
  }

  /**
   * Test SMTP connection.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!this.transporter) {
      return { ok: false, error: 'SMTP not configured' };
    }
    try {
      await this.transporter.verify();
      logger.info('SMTP connection test passed');
      return { ok: true };
    } catch (err) {
      logger.error('SMTP connection test failed', { error: String(err) });
      return { ok: false, error: String(err) };
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    const masked = local.length > 2
      ? local[0] + '*'.repeat(local.length - 2) + local[local.length - 1]
      : '**';
    return `${masked}@${domain}`;
  }

  private buildEmailHTML(code: string): string {
    const digits = code.split('').map(d =>
      `<span style="display:inline-block;width:42px;height:52px;line-height:52px;text-align:center;font-size:28px;font-weight:700;color:#fff;background:#1a1a1a;border:2px solid #333;border-radius:8px;margin:0 3px;font-family:'Fira Code',monospace;">${d}</span>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#111;border:1px solid #222;border-radius:16px;padding:40px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">🔥</div>
    <h1 style="color:#fff;font-size:20px;margin-bottom:4px;">ForgeAI Security</h1>
    <p style="color:#888;font-size:13px;margin-bottom:28px;">External access verification code</p>
    <div style="margin:24px 0;">
      ${digits}
    </div>
    <p style="color:#ff6b35;font-size:14px;font-weight:600;margin-top:20px;">This code expires in 5 minutes</p>
    <hr style="border:none;border-top:1px solid #222;margin:24px 0;">
    <p style="color:#555;font-size:11px;line-height:1.5;">
      This code was requested for an external login to your ForgeAI instance.<br>
      If you did not request this, someone may be trying to access your system.<br>
      <strong style="color:#888;">Do not share this code with anyone.</strong>
    </p>
  </div>
</body>
</html>`;
  }
}

export function createEmailOTPService(): EmailOTPService {
  return new EmailOTPService();
}
