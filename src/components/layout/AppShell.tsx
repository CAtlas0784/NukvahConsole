import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, Info, Sparkles, X, XCircle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from '@/features/search/CommandPalette';
import { useSession } from '@/stores/session';
import { useToasts } from '@/stores/ops';
import { useT } from '@/i18n';
import { ease } from '@/lib/motion';

function PreviewBanner() {
  const t = useT();
  const mode = useSession((s) => s.mode);
  if (mode !== 'preview') return null;
  return (
    <div role="status" className="hatch flex items-center justify-center gap-2 border-b border-warn/30 bg-warn/[0.06] px-4 py-1.5 text-center text-xs font-semibold tracking-wide text-warn">
      <Sparkles size={13} /> {t('status.previewBanner')}
    </div>
  );
}

function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const icon = { success: <CheckCircle2 size={18} className="text-ok" />, error: <XCircle size={18} className="text-danger" />, warn: <AlertTriangle size={18} className="text-warn" />, info: <Info size={18} className="text-pale" /> };
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.3, ease }}
            className="panel pointer-events-auto flex items-start gap-3 p-4"
            role={toast.tone === 'error' ? 'alert' : 'status'}
          >
            <span className="mt-0.5">{icon[toast.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ivory">{toast.title}</div>
              {toast.body && <div className="mt-0.5 text-xs break-words text-mist">{toast.body}</div>}
            </div>
            <button className="text-dim hover:text-ivory" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function AppShell() {
  const location = useLocation();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
      if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => setMenu(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[70] focus:rounded-lg focus:bg-gold focus:px-3 focus:py-2 focus:text-abyss">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 border-r border-line/60 bg-night/60 backdrop-blur-xl lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {menu && (
          <motion.div className="fixed inset-0 z-40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-abyss/70" onClick={() => setMenu(false)} />
            <motion.aside
              className="absolute inset-y-0 left-0 w-[280px] border-r border-line bg-night"
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.35, ease }}
            >
              <Sidebar onNavigate={() => setMenu(false)} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <PreviewBanner />
        <Topbar onOpenPalette={() => setPalette(true)} onOpenMenu={() => setMenu(true)} />
        <main id="main" className="relative min-w-0 flex-1 px-4 py-8 md:px-8 lg:px-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(2px)' }}
              transition={{ duration: 0.38, ease }}
              className="mx-auto max-w-[1400px]"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <Toaster />
    </div>
  );
}
