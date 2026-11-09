import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { Loader2, Search as SearchIcon, X } from 'lucide-react';
import { useT } from '@/i18n';
import { useSearchIndex } from '@/data/searchIndex';
import { search, type SearchKind } from '@/lib/search';
import { EmptyState, ErrorState, PageHeader, Panel, SkeletonGrid } from '@/components/ui/Primitives';
import { KIND_ICON, ResultRow, resultTarget } from './ResultRow';
import { usePageTitle } from './CommandPalette';
import { ease } from '@/lib/motion';

const KINDS: SearchKind[] = ['character', 'weapon', 'artifact', 'material', 'monster', 'scene', 'command'];
const EXAMPLES = ['ayaka', 'pyro', '10000073', 'mora', 'crown', 'emblem', 'boss', 'teleport', 'give'];

export default function SearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [kinds, setKinds] = useState<SearchKind[]>([]);
  const [limit, setLimit] = useState(60);
  const deferred = useDeferredValue(query);
  const { index, error } = useSearchIndex(t.lang, usePageTitle());

  const hits = useMemo(() => (index && deferred.trim() ? search(index, deferred, { kinds }) : []), [index, deferred, kinds]);
  const counts = useMemo(() => {
    const c: Partial<Record<SearchKind, number>> = {};
    if (index && deferred.trim()) for (const h of search(index, deferred)) c[h.doc.kind] = (c[h.doc.kind] ?? 0) + 1;
    return c;
  }, [index, deferred]);

  const update = (value: string) => {
    setQuery(value);
    setLimit(60);
    setParams(value ? { q: value } : {}, { replace: true });
  };

  return (
    <>
      <PageHeader eyebrow={t('search.eyebrow')} title={t('search.title')} lead={t('search.hint')} />
      <div className="panel panel-corners mb-5 flex items-center gap-3 px-5 py-4">
        {index ? <SearchIcon size={20} className="text-gold" /> : <Loader2 size={20} className="animate-spin text-gold" />}
        <input
          autoFocus
          value={query}
          onChange={(e) => update(e.target.value)}
          placeholder={t('search.placeholder')}
          className="w-full bg-transparent text-lg text-ivory placeholder:text-dim focus:outline-none"
          aria-label={t('common.search')}
        />
        {query && (
          <button className="btn btn-quiet btn-icon" onClick={() => update('')} aria-label={t('common.clear')}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <button className="chip" aria-pressed={kinds.length === 0} onClick={() => setKinds([])}>
          {t('common.all')}
        </button>
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k];
          const on = kinds.includes(k);
          return (
            <button key={k} className="chip" aria-pressed={on} onClick={() => setKinds((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}>
              <Icon size={12} />
              {t.dyn(`search.kinds.${k}`)}
              {counts[k] ? <span className="font-mono opacity-70">{counts[k]}</span> : null}
            </button>
          );
        })}
      </div>

      <Panel className="p-2">
        {error ? (
          <ErrorState error={error} />
        ) : !index ? (
          <div className="p-4">
            <SkeletonGrid count={6} className="h-14" />
          </div>
        ) : !deferred.trim() ? (
          <EmptyState icon={<SearchIcon size={22} />} title={t('search.idle')}>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((ex) => (
                <button key={ex} className="chip font-mono" onClick={() => update(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </EmptyState>
        ) : hits.length === 0 ? (
          <EmptyState title={t('search.empty', { q: deferred })} />
        ) : (
          <>
            <div className="px-3 pt-2 pb-1 text-xs text-dim">{t('common.showing', { n: Math.min(limit, hits.length), total: hits.length })}</div>
            <ul>
              {hits.slice(0, limit).map((hit, i) => (
                <motion.li key={`${hit.doc.kind}-${hit.doc.id}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.015, duration: 0.25, ease }}>
                  <ResultRow doc={hit.doc} onSelect={() => navigate(resultTarget(hit.doc).to)} />
                </motion.li>
              ))}
            </ul>
            {hits.length > limit && (
              <div className="p-3 text-center">
                <button className="btn btn-ghost btn-sm" onClick={() => setLimit((l) => l + 120)}>
                  {t('common.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
