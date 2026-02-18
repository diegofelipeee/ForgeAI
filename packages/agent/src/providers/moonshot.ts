import { OpenAICompatibleProvider } from './openai-compatible.js';
import type { ProviderBalance } from './base.js';

export class MoonshotProvider extends OpenAICompatibleProvider {
  constructor(apiKey?: string) {
    super({
      name: 'moonshot',
      displayName: 'Kimi (Moonshot)',
      baseUrl: 'https://api.moonshot.ai',
      apiKeyEnv: 'MOONSHOT_API_KEY',
      models: [
        'kimi-k2.5',
        'kimi-k2-0711-preview',
        'kimi-k2-0905-preview',
        'moonshot-v1-auto',
        'moonshot-v1-8k',
        'moonshot-v1-32k',
        'moonshot-v1-128k',
      ],
      extraBody: { thinking: { type: 'disabled' } },
      maxTemperature: 0.6,
    }, apiKey);
  }

  async getBalance(): Promise<ProviderBalance> {
    if (!this.isConfigured()) {
      return { provider: this.name, displayName: this.displayName, available: false };
    }
    try {
      const res = await fetch('https://api.moonshot.ai/v1/users/me/balance', {
        headers: { 'Authorization': `Bearer ${this.getApiKey()}` },
      });
      if (!res.ok) return { provider: this.name, displayName: this.displayName, available: false };
      const data = await res.json() as { data?: { available_balance?: number; cash_balance?: number; voucher_balance?: number } };
      const bal = data.data;
      if (!bal) return { provider: this.name, displayName: this.displayName, available: false };
      // Moonshot global API (api.moonshot.ai) returns balance in USD
      const balance = bal.available_balance ?? 0;
      return { provider: this.name, displayName: this.displayName, available: true, balance, currency: 'USD', raw: data as Record<string, unknown> };
    } catch {
      return { provider: this.name, displayName: this.displayName, available: false };
    }
  }
}
