import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, PackagePlus, XCircle } from 'lucide-react';
import { useT } from '@/i18n';
import { useCatalog } from '@/data/catalog';
import { useInventory } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useOps } from '@/stores/ops';
import { EmptyState, ErrorState, PageHeader, Panel, Segmented, SkeletonGrid } from '@/components/ui/Primitives';
import { normalize } from '@/lib/search';
import { ItemSpawner } from './ItemSpawner';

export default function Inventory() {
  const t = useT();
  const [tab, setTab] = useState<'catalog' | 'owned' | 'history'>('catalog');
  return (
    <>
      <PageHeader
        eyebrow={t('inventory.eyebrow')}
        title={t('inventory.title')}
        actions={
          <Segmented
            label="inventory-tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'catalog', label: t('spawner.tab') },
              { value: 'owned', label: t('inventory.owned') },
              { value: 'history', label: t('inventory.history') },
            ]}
          />
        }
      />
      {tab === 'catalog' && <ItemSpawner />}
      {tab === 'owned' && <OwnedInventory />}
      {tab === 'history' && <History />}
    </>
  );
}

function OwnedInventory() {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const mode = useSession((s) => s.mode);
  const inv = useInventory(uid);
  const materials = useCatalog('materials');
  const weapons = useCatalog('weapons');
  const furniture = useCatalog('furniture');
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of materials.data ?? []) map.set(m.id, t.loc(m.name));
    for (const w of weapons.data ?? []) map.set(w.id, t.loc(w.name));
    for (const f of furniture.data ?? []) map.set(f.id, t.loc(f.name));
    return map;
  }, [materials.data, weapons.data, furniture.data, t]);

  if (mode !== 'connected') return <EmptyState title={t('states.disconnectedText')} />;
  if (!uid) return <EmptyState title={t('states.needPlayer')} />;
  if (inv.error) return <ErrorState error={inv.error} onRetry={inv.refresh} />;
  if (!inv.data) return <SkeletonGrid count={8} className="h-12" />;
  const q = normalize(query);
  const rows = inv.data.filter((i) => !q || String(i.itemId).startsWith(q) || normalize(names.get(i.itemId) ?? '').includes(q));
  return (
    <Panel className="overflow-hidden">
      <div className="p-4">
        <input className="field" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-night/95 text-left text-[11px] tracking-[0.12em] text-dim uppercase">
            <tr>
              <th className="px-4 py-2 font-semibold">{t('common.id')}</th>
              <th className="px-4 py-2 font-semibold">Name</th>
              <th className="px-4 py-2 font-semibold">Type</th>
              <th className="px-4 py-2 text-right font-semibold">{t('common.amount')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 600).map((i) => (
              <tr key={i.guid} className="border-t border-white/[0.04] hover:bg-white/[0.02]">
                <td className="px-4 py-2 font-mono text-xs text-pale">{i.itemId}</td>
                <td className="px-4 py-2 text-ivory">{names.get(i.itemId) ?? '—'}</td>
                <td className="px-4 py-2 text-xs text-mist">{i.type.replace('ITEM_', '').toLowerCase()}{i.level > 1 ? ` · Lv${i.level}` : ''}{i.refinement ? ` · R${i.refinement}` : ''}</td>
                <td className="px-4 py-2 text-right font-mono text-ivory">{t.num(i.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function History() {
  const t = useT();
  const history = useOps((s) => s.history);
  const clear = useOps((s) => s.clear);
  if (history.length === 0) return <EmptyState icon={<Clock size={22} />} title={t('inventory.historyEmpty')} />;
  return (
    <Panel className="p-4" actions={<button className="btn btn-quiet btn-sm" onClick={clear}>{t('common.clear')}</button>} title={t('inventory.history')}>
      <ul className="divide-y divide-white/[0.04]">
        {history.map((h) => (
          <li key={h.id} className="flex items-start gap-3 px-3 py-3">
            {h.status === 'success' ? <CheckCircle2 size={16} className="mt-0.5 text-ok" /> : h.status === 'partial' ? <PackagePlus size={16} className="mt-0.5 text-warn" /> : <XCircle size={16} className="mt-0.5 text-danger" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <span className="font-mono text-xs text-gold">{h.action}</span>
                <span className="text-sm text-ivory">{h.summary}</span>
              </div>
              {h.detail && <div className="mt-0.5 text-xs break-words text-dim">{h.detail}</div>}
            </div>
            <div className="shrink-0 text-right text-[11px] text-dim">
              <div>{new Date(h.ts).toLocaleString(t.lang === 'th' ? 'th-TH' : 'en-US')}</div>
              {h.uid && <div className="font-mono">UID {h.uid}</div>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
