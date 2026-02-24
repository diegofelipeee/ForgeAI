import { useState, useEffect, useRef, useCallback } from 'react';
import { Flame, Send, Settings, X, Minus, Info } from 'lucide-react';

// Tauri API will be available at runtime via window.__TAURI__
declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    __showAbout?: () => void;
  }
}

const invoke = (cmd: string, args?: Record<string, unknown>) =>
  window.__TAURI__?.core.invoke(cmd, args) ?? Promise.reject('Tauri not available');

interface CompanionStatus {
  connected: boolean;
  gateway_url: string | null;
  safety_active: boolean;
  version: string;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

type View = 'chat' | 'setup' | 'settings' | 'about';

// ─── Window Controls (close hides to tray) ───
function WindowControls() {
  const handleClose = async () => {
    try {
      const win = window.__TAURI__?.core;
      if (win) await win.invoke('plugin:window|hide', { label: 'main' }).catch(() => {});
    } catch {}
    // Fallback: use Tauri window API
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().hide();
    } catch {}
  };

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch {}
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={handleMinimize}
        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
        title="Minimize"
      >
        <Minus className="w-3 h-3" />
      </button>
      <button
        onClick={handleClose}
        className="w-6 h-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all"
        title="Close to tray"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('chat');
  const [status, setStatus] = useState<CompanionStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [gatewayUrl, setGatewayUrl] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [pairing, setPairing] = useState(false);
  const [pairError, setPairError] = useState('');
  const messagesEnd = useRef<HTMLDivElement>(null);

  const showAbout = useCallback(() => setView('about'), []);

  useEffect(() => {
    window.__showAbout = showAbout;
    loadStatus();
    return () => { delete window.__showAbout; };
  }, [showAbout]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadStatus = async () => {
    try {
      const s = (await invoke('get_status')) as CompanionStatus;
      setStatus(s);
      if (!s.connected) setView('setup');
    } catch {
      setView('setup');
    }
  };

  const handlePair = async () => {
    setPairing(true);
    setPairError('');
    try {
      await invoke('pair_with_gateway', {
        gatewayUrl: gatewayUrl.trim(),
        pairingCode: pairingCode.trim(),
      });
      await loadStatus();
      setView('chat');
      setMessages([
        {
          role: 'system',
          content: 'Connected to ForgeAI Gateway! Say something or type a command.',
          timestamp: Date.now(),
        },
      ]);
    } catch (e) {
      setPairError(String(e));
    }
    setPairing(false);
  };

  const handleDisconnect = async () => {
    try {
      await invoke('disconnect');
      setStatus(null);
      setView('setup');
      setMessages([]);
    } catch {}
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text, timestamp: Date.now() },
    ]);
    setLoading(true);

    try {
      const result = (await invoke('execute_action', {
        request: {
          action: 'shell',
          command: text,
          path: null,
          content: null,
          process_name: null,
          app_name: null,
          confirmed: false,
        },
      })) as { success: boolean; output: string; safety: { risk: string; reason: string } };

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.success ? result.output : `⚠️ ${result.output}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${e}`, timestamp: Date.now() },
      ]);
    }
    setLoading(false);
  };

  // ─── About View ───
  if (view === 'about') {
    return (
      <div className="w-[380px] h-[520px] bg-zinc-950 rounded-2xl border border-zinc-800 flex flex-col overflow-hidden">
        <div data-tauri-drag-region className="h-10 flex items-center justify-between px-4 border-b border-zinc-800/50 shrink-0">
          <span className="text-[11px] text-zinc-500 font-medium select-none">About</span>
          <WindowControls />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center mb-5 shadow-lg shadow-orange-500/20">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white">ForgeAI Companion</h2>
          <p className="text-xs text-zinc-500 mt-1">Version {status?.version || '1.0.0'}</p>
          <div className="mt-6 w-full space-y-2 text-xs">
            <div className="flex justify-between py-2 px-3 rounded-lg bg-zinc-900/50">
              <span className="text-zinc-500">Safety System</span>
              <span className="text-emerald-400">Active</span>
            </div>
            <div className="flex justify-between py-2 px-3 rounded-lg bg-zinc-900/50">
              <span className="text-zinc-500">Platform</span>
              <span className="text-zinc-300">Windows x64</span>
            </div>
            <div className="flex justify-between py-2 px-3 rounded-lg bg-zinc-900/50">
              <span className="text-zinc-500">Engine</span>
              <span className="text-zinc-300">Tauri 2 + Rust</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-600 mt-6">getforgeai.com</p>
          <button
            onClick={() => setView(status?.connected ? 'chat' : 'setup')}
            className="mt-4 px-6 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-all"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // ─── Setup View ───
  if (view === 'setup') {
    return (
      <div className="w-[380px] h-[520px] bg-zinc-950 rounded-2xl border border-zinc-800 flex flex-col overflow-hidden">
        {/* Title bar / drag region */}
        <div data-tauri-drag-region className="h-10 flex items-center justify-between px-4 border-b border-zinc-800/50 shrink-0">
          <div className="flex items-center gap-2 select-none pointer-events-none">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
              <Flame className="w-3 h-3 text-white" />
            </div>
            <span className="text-[11px] text-zinc-500 font-medium">ForgeAI Companion</span>
          </div>
          <WindowControls />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col px-6 py-5">
          {/* Logo + title centered */}
          <div className="flex flex-col items-center pt-4 pb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center shadow-lg shadow-orange-500/15">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-base font-semibold text-white mt-3">Connect to Gateway</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Enter your Gateway URL and pairing code</p>
          </div>

          {/* Form */}
          <div className="space-y-4 flex-1">
            <div>
              <label className="text-[11px] text-zinc-400 mb-1.5 block font-medium">Gateway URL</label>
              <input
                type="url"
                placeholder="http://127.0.0.1:18800"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 font-mono transition-all"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 mb-1.5 block font-medium">Pairing Code</label>
              <input
                type="text"
                placeholder="FORGE-XXXX-XXXX"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                maxLength={14}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 font-mono tracking-wider text-center transition-all"
              />
            </div>

            {pairError && (
              <div className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {pairError}
              </div>
            )}

            <button
              onClick={handlePair}
              disabled={pairing || !gatewayUrl.trim() || pairingCode.length < 6}
              className="w-full py-2 rounded-lg text-white text-[13px] font-medium bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              {pairing ? 'Connecting...' : 'Connect'}
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50 mt-4">
            <p className="text-[10px] text-zinc-600">
              Dashboard → Settings → Pairing
            </p>
            <button
              onClick={() => setView('about')}
              className="text-zinc-600 hover:text-zinc-400 transition-all"
              title="About"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Chat View ───
  return (
    <div className="w-[380px] h-[520px] bg-zinc-950 rounded-2xl border border-zinc-800 flex flex-col overflow-hidden">
      {/* Header / drag region */}
      <div data-tauri-drag-region className="h-12 flex items-center justify-between px-3 border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2.5 pointer-events-none select-none">
          <div className="relative">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
              <Flame className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border-[1.5px] border-zinc-950" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white leading-tight">ForgeAI</p>
            <p className="text-[9px] text-emerald-400 leading-tight">Connected</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setView(view === 'settings' ? 'chat' : 'settings')}
            className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all"
            title="Settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <WindowControls />
        </div>
      </div>

      {/* Settings panel */}
      {view === 'settings' && (
        <div className="px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/30 space-y-2 animate-fade-in">
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-zinc-500">Gateway</span>
            <span className="text-[11px] text-zinc-300 font-mono truncate max-w-[200px]">{status?.gateway_url || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-zinc-500">Safety</span>
            <span className="text-[11px] text-emerald-400">Active</span>
          </div>
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-zinc-500">Version</span>
            <span className="text-[11px] text-zinc-300">{status?.version || '—'}</span>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => setView('about')}
              className="flex-1 py-1.5 rounded-lg text-zinc-400 text-[11px] font-medium border border-zinc-700 hover:bg-zinc-800 transition-all"
            >
              About
            </button>
            <button
              onClick={handleDisconnect}
              className="flex-1 py-1.5 rounded-lg text-red-400 text-[11px] font-medium border border-red-500/30 hover:bg-red-500/10 transition-all"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center mb-3 animate-float shadow-lg shadow-orange-500/15">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <p className="text-[13px] text-zinc-400 font-medium">Hey! I'm ForgeAI</p>
            <p className="text-[11px] text-zinc-600 mt-1 max-w-[220px] leading-relaxed">
              Ask me anything or give me a command. I can manage files, launch apps, and more.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-orange-500 text-white rounded-br-md'
                  : msg.role === 'system'
                  ? 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 rounded-bl-md'
                  : 'bg-zinc-800 text-zinc-200 rounded-bl-md'
              }`}
            >
              <pre className="whitespace-pre-wrap font-[inherit]">{msg.content}</pre>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-zinc-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce bounce-dot-1" />
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce bounce-dot-2" />
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce bounce-dot-3" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-zinc-800/50">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-zinc-900/80 border border-zinc-800 rounded-lg px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-lg bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:from-zinc-700 disabled:to-zinc-700 flex items-center justify-center transition-all"
            title="Send message"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}
