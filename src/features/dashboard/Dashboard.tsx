import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Activity, ArrowUpRight, Boxes, Check, Clock, Coins, Gem, Globe2, Lock, MapPin, Package, RefreshCw, ScrollText, Sparkles, UserPlus, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useSession } from '@/stores/session';
import { useOps } from '@/stores/ops';
import { useAudit, usePlayer } from '@/api/hooks';
import { useCatalog } from '@/data/catalog';
import { demoStatus } from '@/data/demo';
import { ErrorState, PageHeader, Panel, Skeleton, Stat } from '@/components/ui/Primitives';
import { NukvahSigil } from '@/components/fx/NukvahSigil';
import { ease } from '@/lib/motion';
import type { Capability } from '@/api/nukva';

const ALL_CAPS: Capability[] = [
  'players.read',
  'avatars.read',
  'avatars.grant',
  'avatars.level',
  'avatars.constellation',
  'avatars.talents',
  'avatars.equip',
  'avatars.fetter',
  'inventory.read',
  'items.give',
  'weapons.give',
  'artifacts.give',
  'world.level',
  'world.teleport',
  'world.spawn',
  'commands.list',
  'commands.execute',
  'audit.read',
];

const fade = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.05 * i, duration: 0.5, ease } });

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function relative(ts: number, lang: string) {
  const rtf = new Intl.RelativeTimeFormat(lang === 'th' ? 'th' : 'en', { numeric: 'auto' });
  const diff = (ts - Date.now()) / 1000;
  if (Math.abs(diff) < 60) return rtf.format(Math.round(diff), 'second');
  if (Math.abs(diff) < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (Math.abs(diff) < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

export default function Dashboard() {
  const t = useT();
  const mode = useSession((s) => s.mode);
  const status = useSession((s) => s.status) ?? (mode === 'preview' ? demoStatus : null);
  const uid = useSession((s) => s.uid);
  const player = usePlayer(uid);
  const audit = useAudit(12);
  const history = useOps((s) => s.history);
  const meta = useCatalog('meta');
  const refreshStatus = useSession((s) => s.refreshStatus);

  const inv = player.data?.inventory ?? {};
  const invTotal = Object.values(inv).reduce((a, b) => a + b, 0) || 1;
  const recent = audit.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        actions={
          <button className="btn btn-ghost btn-sm" onClick={() => { player.refresh(); audit.refresh(); refreshStatus().catch(() => undefined); }}>
            <RefreshCw size={14} className={player.loading ? 'animate-spin' : ''} /> {t('common.retry')}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Server */}
        <motion.div {...fade(0)}>
          <Panel corners className="tilt relative h-full overflow-hidden p-6">
            <div className="pointer-events-none absolute -top-6 -right-8 opacity-30" aria-hidden>
              <NukvahSigil size={170} body={false} />
            </div>
            <div className="eyebrow mb-4">{t('dashboard.serverPanel')}</div>
            {status ? (
              <div className="relative space-y-4">
                <div>
                  <div className="title-display text-xl">{status.server}</div>
                  <div className="mt-1 text-xs text-dim">
                    {status.runMode} · {t('status.bridge')} {status.bridgeVersion}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                  <Stat label={t('status.version')} value={status.gameVersion} accent />
                  <Stat label={t('status.online')} value={status.onlinePlayers} />
                  <Stat label={t('status.uptime')} value={formatUptime(status.uptimeSeconds)} />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border border-gold/30 px-2.5 py-1 font-semibold tracking-wider text-gold uppercase">{status.role}</span>
                  {mode === 'preview' && <span className="hatch rounded-full border border-warn/30 px-2.5 py-1 font-semibold text-warn">{t('common.preview')}</span>}
                </div>
              </div>
            ) : (
              <Skeleton className="h-32" />
            )}
          </Panel>
        </motion.div>

        {/* Subject */}
        <motion.div {...fade(1)} className="lg:col-span-2">
          <Panel className="h-full p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="eyebrow">{t('dashboard.playerPanel')}</div>
              {player.simulated && <span className="hatch rounded-full border border-warn/30 px-2 py-0.5 text-[10px] font-bold tracking-wider text-warn uppercase">{t('common.preview')}</span>}
            </div>
            {!uid ? (
              <p className="py-10 text-center text-sm text-mist">{t('dashboard.selectPlayer')}</p>
            ) : player.error ? (
              <ErrorState error={player.error} onRetry={player.refresh} />
            ) : !player.data ? (
              <div className="grid gap-4 sm:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
                  <div className="title-display text-gilded text-4xl">{player.data.nickname || '—'}</div>
                  <div className="pb-1 font-mono text-sm text-pale">UID {player.data.uid}</div>
                  {player.data.signature && <div className="w-full truncate text-sm text-dim italic">“{player.data.signature}”</div>}
                </div>
                <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
                  <Stat label={t('player.ar')} value={player.data.adventureRank} accent />
                  <Stat label={t('player.wl')} value={player.data.worldLevel} />
                  <Stat label={t('player.characters')} value={player.data.avatarCount} />
                  <Stat label={t('player.scene')} value={player.data.sceneId} />
                </div>
                {player.data.position && (
                  <div className="flex items-center gap-2 font-mono text-xs text-dim">
                    <MapPin size={12} className="text-gold" />
                    {player.data.position.x.toFixed(1)}, {player.data.position.y.toFixed(1)}, {player.data.position.z.toFixed(1)}
                  </div>
                )}
              </div>
            )}
          </Panel>
        </motion.div>

        {/* Currencies */}
        <motion.div {...fade(2)}>
          <Panel className="h-full p-6" eyebrow={t('dashboard.currencies')}>
            <div className="space-y-4 px-0">
              {[
                { icon: Gem, label: t('dashboard.primogems'), value: player.data?.currencies.primogems, color: 'text-cyan' },
                { icon: Coins, label: t('dashboard.mora'), value: player.data?.currencies.mora, color: 'text-gold' },
                { icon: Sparkles, label: t('dashboard.crystals'), value: player.data?.currencies.genesisCrystals, color: 'text-violet' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className={`grid h-10 w-10 place-items-center rounded-xl border border-line bg-abyss/50 ${color}`}>
                    <Icon size={17} />
                  </div>
                  <div className="flex-1 text-sm text-mist">{label}</div>
                  <div className="font-mono text-lg text-ivory">{value === undefined ? '—' : t.num(value)}</div>
                </div>
              ))}
            </div>
          </Panel>
        </motion.div>

        {/* Inventory summary */}
        <motion.div {...fade(3)}>
          <Panel className="h-full p-6" eyebrow={t('dashboard.inventoryPanel')}>
            {Object.keys(inv).length === 0 ? (
              <p className="py-8 text-center text-sm text-dim">{player.loading ? t('common.loading') : '—'}</p>
            ) : (
              <ul className="space-y-3.5">
                {Object.entries(inv)
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <li key={type}>
                      <div className="mb-1.5 flex justify-between text-xs">
                        <span className="text-mist">{type.replace(/^ITEM_/, '').toLowerCase()}</span>
                        <span className="font-mono text-ivory">{t.num(count)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                        <motion.div className="h-full rounded-full bg-gradient-to-r from-gold-deep via-gold to-gold-bright" initial={{ width: 0 }} animate={{ width: `${(count / invTotal) * 100}%` }} transition={{ duration: 0.9, ease }} />
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>
        </motion.div>

        {/* Quick actions */}
        <motion.div {...fade(4)}>
          <Panel className="h-full p-6" eyebrow={t('dashboard.quick')}>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { to: '/inventory', icon: Package, label: t('dashboard.qGive') },
                { to: '/characters', icon: UserPlus, label: t('dashboard.qGrant') },
                { to: '/world', icon: MapPin, label: t('dashboard.qTeleport') },
                { to: '/world#world-level', icon: Globe2, label: t('dashboard.qWorld') },
                { to: '/commands', icon: ScrollText, label: t('dashboard.qCommands') },
                { to: '/search', icon: Boxes, label: t('nav.search') },
              ].map(({ to, icon: Icon, label }) => (
                <Link key={label} to={to} className="panel-interactive tilt group flex flex-col gap-3 rounded-xl border border-line bg-abyss/40 p-3.5" data-tilt-max="10">
                  <Icon size={18} className="text-gold transition-transform group-hover:scale-110" />
                  <span className="flex items-center justify-between text-sm text-ivory">
                    {label} <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-70" />
                  </span>
                </Link>
              ))}
            </div>
          </Panel>
        </motion.div>

        {/* Recent */}
        <motion.div {...fade(5)} className="lg:col-span-2">
          <Panel className="h-full p-6" eyebrow={t('dashboard.recent')}>
            {recent.length === 0 && history.length === 0 ? (
              <p className="py-8 text-center text-sm text-dim">{audit.loading ? t('common.loading') : t('dashboard.recentEmpty')}</p>
            ) : (
              <ol className="relative space-y-1 border-l border-line pl-5">
                {(recent.length ? recent.map((a) => ({ key: `${a.timestamp}-${a.action}`, ts: a.timestamp, action: a.action, ok: a.success, text: `${a.tokenId} · UID ${a.targetUid ?? '—'} · ${a.message}` })) : history.slice(0, 12).map((h) => ({ key: h.id, ts: h.ts, action: h.action, ok: h.status === 'success', text: h.summary }))).map((row) => (
                  <li key={row.key} className="relative py-2">
                    <span className={`absolute top-3.5 -left-[25px] grid h-3 w-3 place-items-center rounded-full border ${row.ok ? 'border-ok/60 bg-ok/20' : 'border-danger/60 bg-danger/20'}`}>
                      {row.ok ? <Check size={7} className="text-ok" /> : <X size={7} className="text-danger" />}
                    </span>
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-mono text-xs text-gold">{row.action}</span>
                      <span className="truncate text-sm text-ivory/90">{row.text}</span>
                      <span className="ml-auto flex items-center gap-1 text-[11px] text-dim">
                        <Clock size={11} />
                        {relative(row.ts, t.lang)}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </motion.div>

        {/* Catalog & capabilities */}
        <motion.div {...fade(6)}>
          <Panel className="h-full p-6" eyebrow={t('dashboard.catalog')}>
            <p className="-mt-1 mb-4 text-xs text-dim">
              {t('dashboard.catalogLead')}
              {meta.data?.gameVersion ? ` · ${meta.data.gameVersion}` : ''}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {meta.data
                ? Object.entries(meta.data.counts).map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-white/[0.04] py-1">
                      <dt className="text-mist capitalize">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt>
                      <dd className="font-mono text-ivory">{t.num(v)}</dd>
                    </div>
                  ))
                : <Skeleton className="col-span-2 h-24" />}
            </dl>
          </Panel>
        </motion.div>

        <motion.div {...fade(7)} className="lg:col-span-3">
          <Panel className="p-6" eyebrow={t('dashboard.capabilities')}>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPS.map((cap) => {
                const on = !!status?.capabilities.includes(cap);
                return (
                  <span key={cap} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${on ? 'border-ok/30 text-ok' : 'border-line text-dim'}`}>
                    {on ? <Activity size={11} /> : <Lock size={11} />}
                    {cap}
                  </span>
                );
              })}
            </div>
          </Panel>
        </motion.div>
      </div>
    </>
  );
}
