import { useState, useEffect, useCallback } from 'react';
import { Save, Check, Loader2, Eye, EyeOff, Radio, Wifi, WifiOff, Trash2, Plus, X, Shield, Users, UserPlus, Power, Link2, Copy, Clock, Ticket } from 'lucide-react';
import { api, type PairingCode } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface ChannelField {
  key: string;
  labelKey: string;
  placeholderKey: string;
  envKey: string;
}

interface ChannelMeta {
  name: string;
  displayName: string;
  configured: boolean;
  descriptionKey: string;
  fields: ChannelField[];
  hasPermissions: boolean;
}

interface LiveChannel {
  name: string;
  connected: boolean;
  hasPermissions: boolean;
  permissions?: {
    allowedUsers: string[];
    allowedGroups: string[];
    adminUsers: string[];
    respondInGroups: 'always' | 'mention' | 'never';
  };
}

const CHANNELS_META: ChannelMeta[] = [
  {
    name: 'telegram',
    displayName: 'Telegram',
    configured: false,
    descriptionKey: 'channels.telegramDesc',
    fields: [
      { key: 'botToken', labelKey: 'channels.botToken', placeholderKey: 'channels.telegramBotTokenPlaceholder', envKey: 'TELEGRAM_BOT_TOKEN' },
    ],
    hasPermissions: true,
  },
  {
    name: 'discord',
    displayName: 'Discord',
    configured: false,
    descriptionKey: 'channels.discordDesc',
    fields: [
      { key: 'botToken', labelKey: 'channels.botToken', placeholderKey: 'channels.discordBotTokenPlaceholder', envKey: 'DISCORD_BOT_TOKEN' },
    ],
    hasPermissions: false,
  },
  {
    name: 'slack',
    displayName: 'Slack',
    configured: false,
    descriptionKey: 'channels.slackDesc',
    fields: [
      { key: 'botToken', labelKey: 'channels.slackBotToken', placeholderKey: 'channels.slackBotTokenPlaceholder', envKey: 'SLACK_BOT_TOKEN' },
      { key: 'appToken', labelKey: 'channels.slackAppToken', placeholderKey: 'channels.slackAppTokenPlaceholder', envKey: 'SLACK_APP_TOKEN' },
      { key: 'signingSecret', labelKey: 'channels.slackSigningSecret', placeholderKey: 'channels.slackSigningSecretPlaceholder', envKey: 'SLACK_SIGNING_SECRET' },
    ],
    hasPermissions: false,
  },
  {
    name: 'whatsapp',
    displayName: 'WhatsApp',
    configured: false,
    descriptionKey: 'channels.whatsappDesc',
    fields: [],
    hasPermissions: true,
  },
  {
    name: 'teams',
    displayName: 'Microsoft Teams',
    configured: false,
    descriptionKey: 'channels.teamsDesc',
    fields: [
      { key: 'appId', labelKey: 'channels.teamsAppId', placeholderKey: 'channels.teamsAppIdPlaceholder', envKey: 'TEAMS_APP_ID' },
      { key: 'appPassword', labelKey: 'channels.teamsAppPassword', placeholderKey: 'channels.teamsAppPasswordPlaceholder', envKey: 'TEAMS_APP_PASSWORD' },
    ],
    hasPermissions: false,
  },
  {
    name: 'webchat',
    displayName: 'WebChat',
    configured: false,
    descriptionKey: 'channels.webchatDesc',
    fields: [],
    hasPermissions: false,
  },
];

function PermissionsPanel({ channelName, permissions, onRefresh }: {
  channelName: string;
  permissions: { allowedUsers: string[]; allowedGroups: string[]; adminUsers: string[]; respondInGroups: 'always' | 'mention' | 'never' };
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const [newUser, setNewUser] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [newAdmin, setNewAdmin] = useState('');
  const [busy, setBusy] = useState(false);

  const updateGroupMode = async (mode: 'always' | 'mention' | 'never') => {
    setBusy(true);
    try {
      await fetch(`/api/channels/${channelName}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respondInGroups: mode }),
      });
      onRefresh();
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const addItem = async (type: 'users' | 'groups' | 'admins', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const body = type === 'groups' ? { groupId: value.trim() } : { userId: value.trim() };
      await api.post(`/api/channels/${channelName}/permissions/${type}`, body);
      setter('');
      onRefresh();
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const removeItem = async (type: 'users' | 'groups' | 'admins', id: string) => {
    setBusy(true);
    try {
      await api.del(`/api/channels/${channelName}/permissions/${type}/${encodeURIComponent(id)}`);
      onRefresh();
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  const renderList = (
    title: string,
    icon: React.ReactNode,
    items: string[],
    type: 'users' | 'groups' | 'admins',
    inputValue: string,
    setInput: (v: string) => void,
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
        {icon}
        {title}
        <span className="text-zinc-600">({items.length || t('common.all')})</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && (
          <span className="text-[10px] text-zinc-600 italic">{t('channels.noRestrictions')}</span>
        )}
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 bg-zinc-800 text-zinc-300 text-[11px] px-2 py-0.5 rounded-md">
            {item}
            <button
              title={t('channels.removeItem').replace('{item}', item)}
              onClick={() => removeItem(type, item)}
              disabled={busy}
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem(type, inputValue, setInput)}
          className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-forge-500/50"
        />
        <button
          title={t('channels.addItem').replace('{type}', type.slice(0, -1))}
          onClick={() => addItem(type, inputValue, setInput)}
          disabled={busy || !inputValue.trim()}
          className="px-2 py-1 rounded bg-forge-500/80 hover:bg-forge-500 text-white text-[11px] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="mt-3 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
        <Shield className="w-3.5 h-3.5 text-forge-400" />
        {t('channels.permissions')}
        <span className="text-[10px] text-zinc-600 font-normal ml-auto">{t('channels.savedToVault')}</span>
      </div>

      <div className="space-y-1">
        <div className="text-xs text-zinc-400 font-medium">{t('channels.groupResponseMode')}</div>
        <div className="flex gap-1.5">
          {(['always', 'mention', 'never'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => updateGroupMode(mode)}
              disabled={busy}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                permissions.respondInGroups === mode
                  ? 'bg-forge-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode === 'always' ? t('channels.respondAlways') : mode === 'mention' ? t('channels.respondMention') : t('channels.respondNever')}
            </button>
          ))}
        </div>
      </div>

      {renderList(t('channels.allowedUsers'), <Users className="w-3 h-3" />, permissions.allowedUsers, 'users', newUser, setNewUser,
        channelName === 'telegram' ? t('channels.telegramUserId') : t('channels.phoneNumber'))}
      {renderList(t('channels.allowedGroups'), <Users className="w-3 h-3" />, permissions.allowedGroups, 'groups', newGroup, setNewGroup,
        channelName === 'telegram' ? t('channels.telegramGroupId') : t('channels.whatsappGroupJid'))}
      {renderList(t('channels.adminUsers'), <UserPlus className="w-3 h-3" />, permissions.adminUsers, 'admins', newAdmin, setNewAdmin,
        channelName === 'telegram' ? t('channels.telegramAdminUserId') : t('channels.adminPhone'))}
      <p className="text-[10px] text-zinc-600">
        {channelName === 'telegram'
          ? t('channels.tipTelegram')
          : t('channels.tipWhatsapp')}
      </p>
    </div>
  );
}

function PairingPanel() {
  const { t } = useI18n();
  const [codes, setCodes] = useState<PairingCode[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresIn, setExpiresIn] = useState(24);

  const loadCodes = useCallback(() => {
    api.getPairingCodes().then(r => setCodes(r.codes ?? [])).catch(() => {});
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const generate = async () => {
    setGenerating(true);
    try {
      await api.generatePairingCode({ expiresInHours: expiresIn, maxUses, role, label: label || undefined });
      setLabel('');
      loadCodes();
    } catch { /* ignore */ } finally { setGenerating(false); }
  };

  const revoke = async (code: string) => {
    try {
      await api.revokePairingCode(code);
      loadCodes();
    } catch { /* ignore */ }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const isExpired = (c: PairingCode) => new Date(c.expiresAt) < new Date();
  const isFull = (c: PairingCode) => c.usedBy.length >= c.maxUses;
  const timeLeft = (c: PairingCode) => {
    const ms = new Date(c.expiresAt).getTime() - Date.now();
    if (ms <= 0) return t('channels.expired');
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const activeCodes = codes.filter(c => !isExpired(c) && !isFull(c));
  const usedCodes = codes.filter(c => isExpired(c) || isFull(c));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Link2 className="w-5 h-5 text-forge-400" />
          {t('channels.pairingCodes')}
        </h2>
        <span className="text-xs text-zinc-500">
          {t('channels.activeCount').replace('{count}', String(activeCodes.length))}
        </span>
      </div>

      <div className="rounded-xl border border-zinc-800 p-5 space-y-4">
        <p className="text-xs text-zinc-400">
          {t('channels.pairingDesc')}
        </p>

        {/* Generate form */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="text-[11px] text-zinc-500 mb-1 block">{t('channels.labelOptional')}</label>
            <input
              type="text"
              placeholder={t('channels.labelPlaceholder')}
              value={label}
              onChange={e => setLabel(e.target.value)}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-forge-500/50"
            />
          </div>
          <div className="w-24">
            <label className="text-[11px] text-zinc-500 mb-1 block">{t('channels.accessLevel')}</label>
            <select
              title={t('channels.accessLevel')}
              value={role}
              onChange={e => setRole(e.target.value as 'user' | 'admin')}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-forge-500/50"
            >
              <option value="user">{t('channels.user')}</option>
              <option value="admin">{t('channels.admin')}</option>
            </select>
          </div>
          <div className="w-20">
            <label className="text-[11px] text-zinc-500 mb-1 block">{t('channels.maxUses')}</label>
            <input
              type="number"
              title={t('channels.maxUses')}
              min={1}
              max={100}
              value={maxUses}
              onChange={e => setMaxUses(Number(e.target.value))}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-forge-500/50"
            />
          </div>
          <div className="w-24">
            <label className="text-[11px] text-zinc-500 mb-1 block">{t('channels.expiresIn')}</label>
            <select
              title={t('channels.expiresIn')}
              value={expiresIn}
              onChange={e => setExpiresIn(Number(e.target.value))}
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-2 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-forge-500/50"
            >
              <option value={1}>{t('channels.expires1h')}</option>
              <option value={6}>{t('channels.expires6h')}</option>
              <option value={24}>{t('channels.expires24h')}</option>
              <option value={168}>{t('channels.expires7d')}</option>
              <option value={720}>{t('channels.expires30d')}</option>
            </select>
          </div>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-forge-500 hover:bg-forge-600 text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ticket className="w-4 h-4" />}
            {t('channels.generateCode')}
          </button>
        </div>

        {/* Active codes */}
        {activeCodes.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-400 font-medium flex items-center gap-1">
              <Link2 className="w-3 h-3" /> {t('channels.activeCodes')}
            </div>
            {activeCodes.map(c => (
              <div key={c.code} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg px-4 py-3 border border-zinc-700/50">
                <code className="text-forge-400 font-mono text-sm font-bold tracking-wider">{c.code}</code>
                <button
                  title={t('common.copy')}
                  onClick={() => copyCode(c.code)}
                  className="text-zinc-500 hover:text-forge-400 transition-colors"
                >
                  {copied === c.code ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <div className="flex-1 flex items-center gap-3 text-[11px] text-zinc-500">
                  {c.label && <span className="text-zinc-400">{c.label}</span>}
                  <span className={c.role === 'admin' ? 'text-amber-400' : 'text-zinc-400'}>
                    {c.role === 'admin' ? t('channels.adminBadge') : t('channels.userBadge')}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeLeft(c)}
                  </span>
                  <span>{t('channels.usesCount').replace('{used}', String(c.usedBy.length)).replace('{max}', String(c.maxUses))}</span>
                </div>
                <button
                  title={t('common.revoke')}
                  onClick={() => revoke(c.code)}
                  className="text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Used/expired codes */}
        {usedCodes.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 font-medium">{t('channels.expiredOrUsed')}</div>
            {usedCodes.slice(0, 5).map(c => (
              <div key={c.code} className="flex items-center gap-3 bg-zinc-900/50 rounded-lg px-4 py-2 border border-zinc-800/50 opacity-60">
                <code className="text-zinc-500 font-mono text-xs">{c.code}</code>
                <div className="flex-1 flex items-center gap-3 text-[10px] text-zinc-600">
                  {c.label && <span>{c.label}</span>}
                  <span>{isExpired(c) ? t('channels.expired') : t('channels.usesCount').replace('{used}', String(c.usedBy.length)).replace('{max}', String(c.maxUses))}</span>
                  {c.usedBy.length > 0 && <span>{t('channels.usedBy').replace('{users}', c.usedBy.join(', '))}</span>}
                </div>
                <button
                  title={t('common.delete')}
                  onClick={() => revoke(c.code)}
                  className="text-zinc-700 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {codes.length === 0 && (
          <p className="text-xs text-zinc-600 italic text-center py-2">
            {t('channels.noCodesYet')}
          </p>
        )}
      </div>
    </section>
  );
}

export function ChannelsPage() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<ChannelMeta[]>(CHANNELS_META);
  const [liveChannels, setLiveChannels] = useState<LiveChannel[]>([]);
  const [values, setValues] = useState<Record<string, Record<string, string>>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [showField, setShowField] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [expandedPerms, setExpandedPerms] = useState<Record<string, boolean>>({});
  const [waEnabled, setWaEnabled] = useState(false);
  const [waToggling, setWaToggling] = useState(false);

  const loadWaStatus = useCallback(() => {
    api.get('/api/channels/whatsapp/enabled').then((r: any) => {
      if (r) setWaEnabled(r.enabled ?? false);
    }).catch(() => {});
  }, []);

  const toggleWhatsApp = async () => {
    setWaToggling(true);
    try {
      if (waEnabled) {
        await api.del('/api/channels/whatsapp/enable');
      } else {
        await api.post('/api/channels/whatsapp/enable');
      }
      loadWaStatus();
    } catch { /* ignore */ } finally { setWaToggling(false); }
  };

  const loadStatus = useCallback(() => {
    api.get('/api/channels/status').then((r: any) => {
      if (r?.channels) {
        setChannels(prev => prev.map(ch => {
          const remote = r.channels.find((c: any) => c.name === ch.name);
          return remote ? { ...ch, configured: remote.configured } : ch;
        }));
      }
    }).catch(() => {});
  }, []);

  const loadLive = useCallback(() => {
    api.get('/api/channels/live').then((r: any) => {
      if (r?.channels) setLiveChannels(r.channels);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    loadStatus();
    loadLive();
    loadWaStatus();
    const interval = setInterval(loadLive, 10000);
    return () => clearInterval(interval);
  }, [loadStatus, loadLive, loadWaStatus]);

  const handleSave = async (channelName: string) => {
    const channelValues = values[channelName];
    if (!channelValues || Object.values(channelValues).every(v => !v?.trim())) return;

    setSaving(s => ({ ...s, [channelName]: true }));
    try {
      await api.post(`/api/channels/${channelName}/configure`, channelValues);
      setSaved(s => ({ ...s, [channelName]: true }));
      setValues(v => ({ ...v, [channelName]: {} }));
      setTimeout(() => setSaved(s => ({ ...s, [channelName]: false })), 2000);
      loadStatus();
    } catch {
      // error
    } finally {
      setSaving(s => ({ ...s, [channelName]: false }));
    }
  };

  const updateValue = (channel: string, field: string, value: string) => {
    setValues(v => ({
      ...v,
      [channel]: { ...(v[channel] ?? {}), [field]: value },
    }));
  };

  const hasValues = (channelName: string) => {
    const cv = values[channelName];
    return cv && Object.values(cv).some(v => v?.trim());
  };

  const handleRemove = async (channelName: string) => {
    const ch = channels.find(c => c.name === channelName);
    if (!confirm(t('channels.removeTokensConfirm').replace('{channel}', ch?.displayName ?? channelName))) return;
    setDeleting(s => ({ ...s, [channelName]: true }));
    try {
      await api.del(`/api/channels/${channelName}/key`);
      loadStatus();
    } catch {
      // error
    } finally {
      setDeleting(s => ({ ...s, [channelName]: false }));
    }
  };

  const getLiveInfo = (name: string) => liveChannels.find(c => c.name === name);
  const connectedCount = channels.filter(c => c.configured).length;
  const liveCount = liveChannels.filter(c => c.connected).length;

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('channels.title')}</h1>
        <p className="text-sm text-zinc-400 mt-1">{t('channels.configure')}</p>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-forge-400" />
            {t('channels.messagingChannels')}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              {t('channels.configuredCount').replace('{configured}', String(connectedCount)).replace('{total}', String(channels.length))}
            </span>
            {liveCount > 0 && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                {t('channels.liveCount').replace('{count}', String(liveCount))}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 divide-y divide-zinc-800">
          {channels.map(channel => {
            const isSaving = saving[channel.name] ?? false;
            const isSaved = saved[channel.name] ?? false;
            const noFields = channel.fields.length === 0 && !channel.hasPermissions;
            const live = getLiveInfo(channel.name);
            const isLive = live?.connected ?? false;
            const permsExpanded = expandedPerms[channel.name] ?? false;

            return (
              <div key={channel.name} className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{channel.displayName}</span>
                      {isLive ? (
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                      ) : channel.configured ? (
                        <Wifi className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
                      )}
                      {(channel.hasPermissions || live?.hasPermissions) && (
                        <button
                          title={t('channels.togglePermissions')}
                          onClick={() => setExpandedPerms(s => ({ ...s, [channel.name]: !permsExpanded }))}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            permsExpanded
                              ? 'bg-forge-500/20 text-forge-400'
                              : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
                          }`}
                        >
                          <Shield className="w-3 h-3 inline mr-0.5" />
                          {t('channels.permissions')}
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{t(channel.descriptionKey)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    isLive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : channel.configured || (channel.name === 'whatsapp' && waEnabled)
                        ? 'bg-amber-500/20 text-amber-400'
                        : channel.name === 'webchat'
                          ? 'bg-zinc-700 text-zinc-400'
                          : 'bg-zinc-700 text-zinc-400'
                  }`}>
                    {isLive ? t('common.live')
                      : channel.name === 'whatsapp' && waEnabled ? t('channels.enabledRestart')
                      : channel.configured ? t('channels.configured')
                      : channel.name === 'webchat' ? t('channels.alwaysOn')
                      : t('channels.notSet')}
                  </span>
                </div>

                {channel.fields.length > 0 && (
                  <div className="space-y-2">
                    {channel.fields.map((field, index) => {
                      const fieldKey = `${channel.name}:${field.key}`;
                      const isVisible = showField[fieldKey] ?? false;

                      return (
                        <div key={field.key}>
                          <label className="text-xs text-zinc-400 mb-1 block">{t(field.labelKey)}</label>
                          <div className="flex gap-2">
                            <div className="flex-1 relative">
                              <input
                                type={isVisible ? 'text' : 'password'}
                                placeholder={channel.configured ? '••••••••••••' : t(field.placeholderKey)}
                                value={values[channel.name]?.[field.key] ?? ''}
                                onChange={e => updateValue(channel.name, field.key, e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSave(channel.name)}
                                className="w-full bg-zinc-800/50 border border-zinc-700 rounded-lg px-3 py-2 pr-9 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-forge-500/50"
                              />
                              <button
                                aria-label={isVisible ? t('channels.hide') : t('channels.show')}
                                onClick={() => setShowField(s => ({ ...s, [fieldKey]: !isVisible }))}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                              >
                                {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>

                            {index === channel.fields.length - 1 && (
                              <>
                                <button
                                  aria-label={t('channels.saveConfigAria').replace('{channel}', channel.displayName)}
                                  onClick={() => handleSave(channel.name)}
                                  disabled={isSaving || !hasValues(channel.name)}
                                  className={`px-3 py-2 rounded-lg text-white text-xs font-medium transition-all ${
                                    isSaved
                                      ? 'bg-emerald-500'
                                      : isSaving
                                        ? 'bg-forge-500/50 cursor-wait'
                                        : hasValues(channel.name)
                                          ? 'bg-forge-500 hover:bg-forge-600'
                                          : 'bg-zinc-700 cursor-not-allowed opacity-50'
                                  }`}
                                >
                                  {isSaved ? <Check className="w-4 h-4" /> : isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                </button>

                                {channel.configured && channel.name !== 'webchat' && (
                                  <button
                                    aria-label={t('channels.removeConfigAria').replace('{channel}', channel.displayName)}
                                    onClick={() => handleRemove(channel.name)}
                                    disabled={deleting[channel.name]}
                                    className="px-3 py-2 rounded-lg text-red-400 hover:text-white hover:bg-red-500/80 border border-red-500/30 text-xs font-medium transition-all"
                                  >
                                    {deleting[channel.name] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-zinc-500">{t('channels.storedEncrypted')}</p>
                  </div>
                )}

                {channel.name === 'whatsapp' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={toggleWhatsApp}
                        disabled={waToggling}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          waEnabled || isLive
                            ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                        }`}
                      >
                        {waToggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
                        {waEnabled || isLive ? t('channels.disableWhatsapp') : t('channels.enableWhatsapp')}
                      </button>
                      {isLive && <span className="text-[10px] text-emerald-400">{t('common.connected')}</span>}
                      {waEnabled && !isLive && <span className="text-[10px] text-amber-400">{t('channels.restartGatewayQr')}</span>}
                    </div>
                    <p className="text-[10px] text-zinc-500">
                      {t('channels.whatsappHelp')}
                    </p>
                  </div>
                )}

                {noFields && channel.name === 'webchat' && (
                  <p className="text-xs text-zinc-500 italic">{t('channels.websocketEndpoint')}</p>
                )}

                {(channel.hasPermissions || live?.hasPermissions) && permsExpanded && live?.permissions && (
                  <PermissionsPanel
                    channelName={channel.name}
                    permissions={live.permissions}
                    onRefresh={loadLive}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <PairingPanel />
    </div>
  );
}

export default ChannelsPage;
