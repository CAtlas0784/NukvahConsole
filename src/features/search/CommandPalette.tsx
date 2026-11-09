import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { CornerDownLeft, Loader2, Search } from 'lucide-react';
import { useT } from '@/i18n';
import { useSearchIndex } from '@/data/searchIndex';
import { search } from '@/lib/search';
import { ease } from '@/lib/motion';
import { ResultRow, resultTarget } from './ResultRow';
import { translate } from '@/i18n';

export function usePageTitle() {
  return (key: string) => ({ en: translate('en', key), th: translate('th', key) });
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const { index } = useSearchIndex(t.lang, usePageTitle());
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => (index && query.trim() ? search(index, query, { limit: 40 }) : []), [index, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (i: number) => {
    const hit = hits[i];
    if (!hit) return;
    navigate(resultTarget(hit.doc).to);
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-abyss/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t('search.paletteHint')}
            className="panel panel-corners relative w-full max-w-2xl overflow-hidden"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.28, ease }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(hits.length - 1, a + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                choose(active);
              }
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4">
              {index ? <Search size={18} className="text-gold" /> : <Loader2 size={18} className="animate-spin text-gold" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('search.placeholder')}
                className="w-full bg-transparent text-base text-ivory placeholder:text-dim focus:outline-none"
                aria-label={t('common.search')}
                role="combobox"
                aria-expanded={hits.length > 0}
                aria-controls="palette-results"
              />
              <kbd className="kbd">Esc</kbd>
            </div>
            <div className="rune-rule" />
            <div ref={listRef} id="palette-results" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
              {!query.trim() && <div className="px-4 py-8 text-center text-sm text-dim">{t('search.hint')}</div>}
              {query.trim() && index && hits.length === 0 && <div className="px-4 py-8 text-center text-sm text-mist">{t('search.empty', { q: query })}</div>}
              {hits.map((hit, i) => (
                <div key={`${hit.doc.kind}-${hit.doc.id}`} onMouseMove={() => setActive(i)}>
                  <ResultRow doc={hit.doc} active={i === active} onSelect={() => choose(i)} compact />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-[11px] text-dim">
              <span className="flex items-center gap-1">
                <kbd className="kbd">↑</kbd>
                <kbd className="kbd">↓</kbd>
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft size={12} /> {t('search.open')}
              </span>
              {hits.length > 0 && <span className="ml-auto">{t('common.results', { n: hits.length })}</span>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
