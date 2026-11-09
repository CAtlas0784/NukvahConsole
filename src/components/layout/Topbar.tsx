import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Command, Languages, Menu, RefreshCw, Unplug, UserRound } from 'lucide-react';
import { useT } from '@/i18n';
import { useSession } from '@/stores/session';
import { useSettings } from '@/stores/settings';
import { useOnlinePlayers } from '@/api/hooks';
import { demoStatus } from '@/data/demo';
import { ease } from '@/lib/motion';

export function LinkStatus() {
  const t = useT();
  const mode = useSession((s) => s.mode);
  const status = useSession((s) => s.status) ?? (mode === 'preview' ? demoStatus : null);
  const tone = mode === 'connected' ? 'bg-ok shadow-[0_0_10px_#7be0b0]' : mode === 'preview' ? 'bg-warn shadow-[0_0_10px_#f2c46d]' : 'bg-danger';
  return (
    <div className="hidden items-center gap-3 rounded-full border border-line bg-abyss/50 py-1.5 pr-4 pl-3 text-xs xl:flex">
      <span className="relative flex h-2 w-2">
        {mode === 'connected' && <span className="absolute inset-0 animate-ping rounded-full bg-ok/60" />}
        <span className={`relative h-2 w-2 rounded-full ${tone}`} />
      </span>
      <span className="font-semibold text-ivory">
        {mode === 'connected' ? t('status.connected') : mode === 'preview' ? t('status.preview') : t('status.disconnected')}
      </span>
      {status && (
        <span className="text-dim">
          {status.gameVersion} · <span className="uppercase">{status.role}</span>
        </span>
      )}
    </div>
  );
}

function PlayerPicker() {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const setUid = useSession((s) => s.setUid);
  const mode = useSession((s) => s.mode);
  const players = useOnlinePlayers();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    players.refresh();
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const current = players.data?.find((p) => p.uid === uid);
  return (
    <div className="relative" ref={ref}>
      <button
        className="btn btn-ghost btn-sm justify-between sm:min-w-[150px]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={mode === 'gate'}
      >
        <span className="flex items-center gap-2">
          <UserRound size={14} className="text-gold" />
          {uid ? (
            <span className="font-mono">
              <span className="hidden sm:inline">{current?.nickname ? `${current.nickname} · ` : ''}</span>
              {uid}
            </span>
          ) : (
            <span className="text-mist">{t('player.none')}</span>
          )}
        </span>
        <ChevronDown size={14} className="opacity-60" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease }}
            className="panel absolute right-0 z-30 mt-2 w-72 p-3"
          >
            <form
              className="mb-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(draft);
                if (Number.isInteger(n) && n > 0) {
                  setUid(n);
                  setOpen(false);
                  setDraft('');
                }
              }}
            >
              <input className="field py-1.5 font-mono text-sm" inputMode="numeric" placeholder={t('player.enterUid')} value={draft} onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))} aria-label={t('player.enterUid')} />
              <button className="btn btn-primary btn-sm" type="submit">
                OK
              </button>
            </form>
            <div className="mb-1.5 flex items-center justify-between text-[11px] tracking-[0.14em] text-dim uppercase">
              {t('player.online')}
              <button className="btn btn-quiet btn-icon p-1" onClick={players.refresh} aria-label="Refresh">
                <RefreshCw size={12} className={players.loading ? 'animate-spin' : ''} />
              </button>
            </div>
            <ul role="listbox" className="max-h-64 space-y-1 overflow-y-auto">
              {(players.data ?? []).map((p) => (
                <li key={p.uid}>
                  <button
                    role="option"
                    aria-selected={p.uid === uid}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/5 ${p.uid === uid ? 'bg-gold/10 text-ivory' : 'text-mist'}`}
                    onClick={() => {
                      setUid(p.uid);
                      setOpen(false);
                    }}
                  >
                    <span>{p.nickname || '—'}</span>
                    <span className="font-mono text-xs">
                      {p.uid} · AR {p.adventureRank}
                    </span>
                  </button>
                </li>
              ))}
              {players.data && players.data.length === 0 && <li className="px-2 py-3 text-center text-xs text-dim">{t('player.noneOnline')}</li>}
              {mode !== 'connected' && mode !== 'preview' && <li className="px-2 py-3 text-center text-xs text-dim">{t('states.disconnectedText')}</li>}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Topbar({ onOpenPalette, onOpenMenu }: { onOpenPalette: () => void; onOpenMenu: () => void }) {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const set = useSettings((s) => s.set);
  const mode = useSession((s) => s.mode);
  const disconnect = useSession((s) => s.disconnect);
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);

  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 sm:gap-3 border-b border-line/60 bg-night/70 px-4 py-3 backdrop-blur-xl md:px-8">
      <button className="btn btn-quiet btn-icon lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu size={18} />
      </button>
      <button
        onClick={onOpenPalette}
        className="group flex min-w-[44px] flex-1 items-center gap-3 rounded-xl border border-pale/10 bg-abyss/50 px-3.5 py-2 text-left text-sm text-dim transition-colors hover:border-gold/30 md:max-w-md"
        aria-label={t('search.paletteHint')}
      >
        <Command size={15} className="text-gold/80 transition-transform group-hover:rotate-12" />
        <span className="truncate">{t('search.paletteHint')}…</span>
        <span className="ml-auto hidden gap-1 sm:flex">
          <kbd className="kbd">{isMac ? '⌘' : 'Ctrl'}</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <LinkStatus />
        <PlayerPicker />
        <button className="btn btn-ghost btn-sm" onClick={() => set({ lang: lang === 'en' ? 'th' : 'en' })} aria-label={t('settings.language')}>
          <Languages size={14} />
          <span className="font-semibold">{lang === 'en' ? 'TH' : 'EN'}</span>
        </button>
        {mode !== 'gate' && (
          <button className="btn btn-quiet btn-icon hidden sm:inline-flex" onClick={disconnect} aria-label={t('status.disconnect')} title={t('status.disconnect')}>
            <Unplug size={16} />
          </button>
        )}
      </div>
    </header>
  );
}
