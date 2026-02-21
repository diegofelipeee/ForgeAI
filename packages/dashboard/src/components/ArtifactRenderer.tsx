import { useState, useRef, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2, X, ExternalLink, Code2, Copy, Check, RefreshCw, Trash2 } from 'lucide-react';

interface ArtifactData {
  id: string;
  sessionId: string;
  type: string;
  title: string;
  content: string;
  language?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactRendererProps {
  artifact: ArtifactData;
  onDelete?: (id: string) => void;
  onInteraction?: (id: string, action: string, data?: Record<string, unknown>) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  html: { label: 'HTML', color: 'bg-orange-500/20 text-orange-400' },
  react: { label: 'React', color: 'bg-cyan-500/20 text-cyan-400' },
  svg: { label: 'SVG', color: 'bg-pink-500/20 text-pink-400' },
  mermaid: { label: 'Mermaid', color: 'bg-purple-500/20 text-purple-400' },
  chart: { label: 'Chart', color: 'bg-emerald-500/20 text-emerald-400' },
  markdown: { label: 'Markdown', color: 'bg-blue-500/20 text-blue-400' },
  code: { label: 'Code', color: 'bg-yellow-500/20 text-yellow-400' },
};

export function ArtifactRenderer({ artifact, onDelete, onInteraction }: ArtifactRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);

  const renderUrl = `/api/artifacts/${artifact.id}/render`;
  const typeMeta = TYPE_LABELS[artifact.type] || { label: artifact.type, color: 'bg-zinc-500/20 text-zinc-400' };

  // Listen for postMessage from iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.data?.type === 'artifact_interaction' && onInteraction) {
      onInteraction(artifact.id, event.data.action, event.data.data);
    }
  }, [artifact.id, onInteraction]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const copyContent = () => {
    navigator.clipboard.writeText(artifact.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const refreshIframe = () => {
    if (iframeRef.current) {
      iframeRef.current.src = `${renderUrl}?v=${Date.now()}`;
    }
  };

  return (
    <div className={`rounded-xl border border-zinc-700/50 bg-zinc-900/80 overflow-hidden transition-all ${expanded ? 'fixed inset-4 z-50 shadow-2xl' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/60 border-b border-zinc-700/50">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeMeta.color}`}>
            {typeMeta.label}
          </span>
          <span className="text-sm font-medium text-zinc-200 truncate">{artifact.title}</span>
          <span className="text-[10px] text-zinc-500">v{artifact.version}</span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={copyContent} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors" title="Copy source">
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setShowSource(!showSource)} className={`p-1.5 rounded-md transition-colors ${showSource ? 'text-forge-400 bg-forge-500/20' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'}`} title="View source">
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={refreshIframe} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a href={renderUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors" title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors" title={expanded ? 'Minimize' : 'Maximize'}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          {onDelete && (
            <button onClick={() => onDelete(artifact.id)} className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          {expanded && (
            <button onClick={() => setExpanded(false)} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 transition-colors" title="Close">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {showSource ? (
        <div className="p-4 max-h-[400px] overflow-auto">
          <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-words leading-relaxed">
            {artifact.content}
          </pre>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={renderUrl}
          title={artifact.title}
          sandbox="allow-scripts allow-same-origin"
          className={`w-full border-0 bg-zinc-950 ${expanded ? 'flex-1 h-[calc(100%-44px)]' : 'h-[350px]'}`}
        />
      )}
    </div>
  );
}

export default ArtifactRenderer;
