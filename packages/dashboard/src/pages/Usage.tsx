import { useEffect, useState } from 'react';
import { BarChart3, DollarSign, Zap, Clock, RefreshCw, Loader2, Wallet, CheckCircle2, XCircle, TrendingDown } from 'lucide-react';

interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
  byModel: Record<string, { requests: number; tokens: number; cost: number }>;
}

interface UsageRecord {
  id: string;
  sessionId: string;
  userId: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  durationMs: number;
  channelType?: string;
  createdAt: string;
}

interface ProviderBalance {
  provider: string;
  displayName: string;
  available: boolean;
  balance?: number;
  currency?: string;
}

export function UsagePage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [balances, setBalances] = useState<ProviderBalance[]>([]);
  const [totalBalance, setTotalBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, recRes] = await Promise.all([
        fetch('/api/usage').then(r => r.json()),
        fetch('/api/usage/records?limit=50').then(r => r.json()),
      ]);
      setSummary((sumRes as { summary: UsageSummary }).summary);
      setRecords((recRes as { records: UsageRecord[] }).records);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const loadBalances = async () => {
    setBalanceLoading(true);
    try {
      const res = await fetch('/api/providers/balances');
      const data = await res.json() as { balances: ProviderBalance[]; totalBalance: number };
      setBalances(data.balances ?? []);
      setTotalBalance(data.totalBalance ?? 0);
    } catch {
      // ignore
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => { loadData(); loadBalances(); }, []);

  const formatCost = (cost: number) => cost < 0.01 ? `$${cost.toFixed(6)}` : `$${cost.toFixed(4)}`;
  const formatBalance = (n: number) => n < 0.01 ? `$${n.toFixed(6)}` : `$${n.toFixed(2)}`;
  const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const availableBalances = balances.filter(b => b.available && b.balance != null);
  const unavailableProviders = balances.filter(b => !b.available);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-forge-500/20 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-forge-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Usage & Analytics</h1>
            <p className="text-sm text-zinc-500">Token usage, costs, and provider balances</p>
          </div>
        </div>
        <button onClick={() => { loadData(); loadBalances(); }} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading usage data...
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                <Zap className="w-3.5 h-3.5" /> REQUESTS
              </div>
              <p className="text-2xl font-bold text-white">{summary?.totalRequests ?? 0}</p>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                <BarChart3 className="w-3.5 h-3.5" /> TOKENS
              </div>
              <p className="text-2xl font-bold text-white">{formatTokens(summary?.totalTokens ?? 0)}</p>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                <TrendingDown className="w-3.5 h-3.5" /> CUSTO ESTIMADO
              </div>
              <p className="text-2xl font-bold text-amber-400">{formatCost(summary?.totalCost ?? 0)}</p>
              <p className="text-[10px] text-zinc-600 mt-1">baseado na tabela de precos</p>
            </div>
            <div className="bg-zinc-950/50 border border-emerald-800/30 rounded-xl p-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                <Wallet className="w-3.5 h-3.5" /> SALDO TOTAL
              </div>
              {balanceLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
              ) : availableBalances.length > 0 ? (
                <p className="text-2xl font-bold text-emerald-400">{formatBalance(totalBalance)}</p>
              ) : (
                <p className="text-lg font-bold text-zinc-600">--</p>
              )}
              <p className="text-[10px] text-zinc-600 mt-1">{availableBalances.length} provider{availableBalances.length !== 1 ? 's' : ''} com saldo</p>
            </div>
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium mb-2">
                <Clock className="w-3.5 h-3.5" /> AVG TOKENS/REQ
              </div>
              <p className="text-2xl font-bold text-white">
                {summary && summary.totalRequests > 0 ? formatTokens(Math.round(summary.totalTokens / summary.totalRequests)) : '0'}
              </p>
            </div>
          </div>

          {/* Provider Balances */}
          {balances.length > 0 && (
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Saldo dos Provedores
                </h3>
                <button onClick={loadBalances} disabled={balanceLoading} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
                  {balanceLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} atualizar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableBalances.map(b => (
                  <div key={b.provider} className="flex items-center justify-between bg-zinc-900/50 rounded-lg px-4 py-3 border border-zinc-800/50">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-sm font-medium text-white">{b.displayName}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400">{formatBalance(b.balance!)}</span>
                  </div>
                ))}
                {unavailableProviders.map(b => (
                  <div key={b.provider} className="flex items-center justify-between bg-zinc-900/30 rounded-lg px-4 py-3 border border-zinc-800/30">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-3.5 h-3.5 text-zinc-600" />
                      <span className="text-sm font-medium text-zinc-500">{b.displayName}</span>
                    </div>
                    <span className="text-xs text-zinc-600">sem API de saldo</span>
                  </div>
                ))}
              </div>
              {unavailableProviders.length > 0 && (
                <p className="text-[10px] text-zinc-600 mt-3">
                  Providers como OpenAI, Anthropic e Google nao disponibilizam API de consulta de saldo. Para esses, consulte o painel do provider.
                </p>
              )}
            </div>
          )}

          {/* By Provider & Model */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* By Provider */}
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 mb-4">Consumo por Provider</h3>
              {summary && Object.keys(summary.byProvider).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.byProvider).map(([provider, data]) => (
                    <div key={provider} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium text-white capitalize">{provider}</span>
                        <span className="text-xs text-zinc-500 ml-2">{data.requests} req</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-zinc-300">{formatTokens(data.tokens)}</span>
                        <span className="text-xs text-amber-400 ml-2">{formatCost(data.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Nenhum dado de uso</p>
              )}
            </div>

            {/* By Model */}
            <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-zinc-400 mb-4">Consumo por Modelo</h3>
              {summary && Object.keys(summary.byModel).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(summary.byModel).map(([model, data]) => (
                    <div key={model} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-mono text-white">{model}</span>
                        <span className="text-xs text-zinc-500 ml-2">{data.requests} req</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-zinc-300">{formatTokens(data.tokens)}</span>
                        <span className="text-xs text-amber-400 ml-2">{formatCost(data.cost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-600">Nenhum dado de uso</p>
              )}
            </div>
          </div>

          {/* Recent Records */}
          <div className="bg-zinc-950/50 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-400">Requisicoes Recentes</h3>
            </div>
            {records.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-500 text-xs">
                      <th className="px-4 py-3 text-left font-medium">Hora</th>
                      <th className="px-4 py-3 text-left font-medium">Modelo</th>
                      <th className="px-4 py-3 text-right font-medium">Tokens</th>
                      <th className="px-4 py-3 text-right font-medium">Custo Est.</th>
                      <th className="px-4 py-3 text-right font-medium">Latencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map(r => (
                      <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/20">
                        <td className="px-4 py-3 text-zinc-400">{new Date(r.createdAt).toLocaleTimeString()}</td>
                        <td className="px-4 py-3 font-mono text-white text-xs">{r.model}</td>
                        <td className="px-4 py-3 text-right text-zinc-300">{formatTokens(r.totalTokens)}</td>
                        <td className="px-4 py-3 text-right text-amber-400">{formatCost(r.cost)}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{r.durationMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-zinc-600 text-sm">Nenhum registro de uso. Envie uma mensagem para comecar o tracking.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
