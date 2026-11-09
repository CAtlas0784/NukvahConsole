import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { BookmarkPlus, CheckCircle2, Clock, PackagePlus, Plus, Search, Send, Swords, Trash2, XCircle, Zap } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api, type GiveItemsResult } from '@/api/nukva';
import { useInventory } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { useOps, useToasts } from '@/stores/ops';
import { usePresets } from '@/stores/presets';
import { Artwork } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, ErrorState, IdTag, PageHeader, Panel, RarityStars, Segmented, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import type { Material } from '@/data/types';
import { normalize } from '@/lib/search';
import { ease } from '@/lib/motion';

type Group = 'all' | 'virtual' | 'AVATAR_MATERIAL' | 'EXP_FRUIT' | 'WEAPON_EXP_STONE' | 'CONSUME' | 'FOOD' | 'QUEST' | 'NAMECARD' | 'FURNITURE_FORMULA' | 'other';
const GROUPS: Group[] = ['all', 'virtual', 'AVATAR_MATERIAL', 'EXP_FRUIT', 'WEAPON_EXP_STONE', 'CONSUME', 'FOOD', 'NAMECARD', 'FURNITURE_FORMULA', 'QUEST', 'other'];

export function groupOf(m: Material): Group {
  if (m.item === 'virtual') return 'virtual';
  switch (m.type) {
    case 'AVATAR_MATERIAL':
    case 'AVATAR_TALENT_MATERIAL':
    case 'ELEM_CRYSTAL':
      return 'AVATAR_MATERIAL';
    case 'EXP_FRUIT':
      return 'EXP_FRUIT';
    case 'WEAPON_EXP_STONE':
      return 'WEAPON_EXP_STONE';
    case 'CONSUME':
    case 'CONSUME_BATCH_USE':
    case 'CHEST':
    case 'CHEST_BATCH_USE':
    case 'SELECTABLE_CHEST':
      return 'CONSUME';
    case 'FOOD':
    case 'SPICE_FOOD':
    case 'NOTICE_ADD_HP':
      return 'FOOD';
    case 'QUEST':
      return 'QUEST';
    case 'NAMECARD':
      return 'NAMECARD';
    case 'FURNITURE_FORMULA':
    case 'FURNITURE_SUITE_FORMULA':
    case 'WOOD':
    case 'HOME_SEED':
      return 'FURNITURE_FORMULA';
    default:
      return 'other';
  }
}

interface BatchEntry {
  itemId: number;
  amount: number;
}

export default function Inventory() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const materials = useCatalog('materials');
  const status = useSession((s) => s.status);
  const maxStack = status?.limits.maxStackAmount ?? 1_000_000;
  const maxBatch = status?.limits.maxBatchSize ?? 50;
  const [tab, setTab] = useState<'catalog' | 'owned' | 'history'>('catalog');
  const [group, setGroup] = useState<Group>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(96);
  const [batch, setBatch] = useState<BatchEntry[]>([]);
  const [amounts, setAmounts] = useState<Record<number, number>>({});
  const [spec, setSpec] = useState<OperationSpec<GiveItemsResult> | null>(null);
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const index = byId(materials.data);

  const focusId = Number(params.get('item')) || null;
  useEffect(() => {
    if (focusId && materials.data) {
      const m = index.get(focusId);
      if (m) {
        setQuery(String(m.id));
        setGroup('all');
        setTab('catalog');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, materials.data]);

  const list = useMemo(() => {
    const q = normalize(query);
    return (materials.data ?? []).filter((m) => {
      if (group !== 'all' && groupOf(m) !== group) return false;
      if (q && !(String(m.id).startsWith(q) || normalize(`${m.name.en} ${m.name.th ?? ''}`).includes(q))) return false;
      return true;
    });
  }, [materials.data, group, query]);

  const amountOf = (id: number) => amounts[id] ?? 1;
  const addToBatch = (id: number, amount: number) =>
    setBatch((cur) => {
      const existing = cur.find((e) => e.itemId === id);
      if (existing) return cur.map((e) => (e.itemId === id ? { ...e, amount: Math.min(maxStack, e.amount + amount) } : e));
      if (cur.length >= maxBatch) return cur;
      return [...cur, { itemId: id, amount }];
    });

  const nameOf = (id: number) => t.loc(index.get(id)?.name) || `#${id}`;
  const giveSpec = (entries: BatchEntry[]): OperationSpec<GiveItemsResult> => ({
    title: entries.length === 1 ? `${t('search.give')} — ${nameOf(entries[0].itemId)}` : `${t('inventory.submitBatch')} (${entries.length})`,
    capability: 'items.give',
    action: 'items.give',
    summary: entries.map((e) => `${nameOf(e.itemId)} ×${e.amount}`).join(', '),
    lines: entries.map((e) => ({ label: `#${e.itemId}`, value: `${nameOf(e.itemId)} × ${t.num(e.amount)}` })),
    request: { method: 'POST', path: '/players/{uid}/items', body: { items: entries } },
    run: (conn, uid) => api.giveItems(conn, uid, entries),
    judge: (r) => {
      const failed = r.results.filter((x) => !x.success);
      if (failed.length === 0) return { status: 'success' };
      if (failed.length === r.results.length) return { status: 'failed', detail: failed.map((f) => f.note).filter(Boolean)[0] ?? 'server added nothing' };
      return { status: 'partial', detail: `not added: ${failed.map((f) => `#${f.itemId}${f.note ? ` (${f.note})` : ''}`).join(', ')}` };
    },
  });

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
              { value: 'catalog', label: t('inventory.catalog') },
              { value: 'owned', label: t('inventory.owned') },
              { value: 'history', label: t('inventory.history') },
            ]}
          />
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {tab === 'catalog' && (
            <>
              <div className="panel mb-5 space-y-3 p-4">
                <div className="relative">
                  <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
                  <input className="field pl-9" placeholder={`${t('common.search')} — ${t('common.id')} / name`} value={query} onChange={(e) => { setQuery(e.target.value); setLimit(96); if (focusId) setParams({}, { replace: true }); }} aria-label={t('common.search')} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {GROUPS.map((g) => (
                    <button key={g} className="chip" aria-pressed={group === g} onClick={() => { setGroup(g); setLimit(96); }}>
                      {t.dyn(`inventory.types.${g}`)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-xs text-dim">
                  <Swords size={12} /> <Link to="/armory" className="underline decoration-dotted hover:text-gold">{t('armory.title')}</Link>
                </div>
              </div>
              {materials.error ? (
                <ErrorState error={materials.error} onRetry={materials.retry} />
              ) : !materials.data ? (
                <SkeletonGrid count={12} className="h-32" />
              ) : list.length === 0 ? (
                <EmptyState title={t('search.empty', { q: query })} />
              ) : (
                <>
                  <div className="mb-3 text-xs text-dim">{t('common.showing', { n: Math.min(limit, list.length), total: list.length })}</div>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
                    {list.slice(0, limit).map((m) => (
                      <li key={m.id} className={`panel panel-interactive flex flex-col gap-3 p-3.5 ${m.id === focusId ? 'ring-1 ring-cyan/60' : ''}`}>
                        <div className="flex items-start gap-3">
                          <Artwork icon={m.icon} name={m.name.en} rarity={m.rarity} size={46} rounded="rounded-xl" />
                          <div className="min-w-0 flex-1">
                            <div className="line-clamp-2 text-sm font-medium text-ivory" title={t.loc(m.name)}>
                              {t.loc(m.name)}
                            </div>
                            <div className="mt-1 flex items-center gap-2">
                              <IdTag id={m.id} />
                              <RarityStars rarity={m.rarity} size={8} />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-[118px]">
                            <Stepper value={amountOf(m.id)} onChange={(v) => setAmounts((a) => ({ ...a, [m.id]: v }))} min={1} max={maxStack} label={t('common.amount')} />
                          </div>
                          <button className="btn btn-ghost btn-icon" onClick={() => addToBatch(m.id, amountOf(m.id))} aria-label={t('inventory.addToBatch')} title={t('inventory.addToBatch')}>
                            <Plus size={15} />
                          </button>
                          <button className="btn btn-primary btn-sm ml-auto" onClick={() => setSpec(giveSpec([{ itemId: m.id, amount: amountOf(m.id) }]))}>
                            <Zap size={13} /> {t('search.give')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {list.length > limit && (
                    <div className="mt-5 text-center">
                      <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 192)}>
                        {t('common.loadMore')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
          {tab === 'owned' && <OwnedInventory />}
          {tab === 'history' && <History />}
        </div>

        {/* Batch tray */}
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Panel corners className="p-5" eyebrow={t('inventory.batch')} title={`${batch.length} / ${maxBatch}`}>
            <div className="px-0">
              {batch.length === 0 ? (
                <p className="py-8 text-center text-sm text-dim">{t('inventory.batchEmpty')}</p>
              ) : (
                <ul className="scroll-fade -mx-1 max-h-[46vh] space-y-2 overflow-y-auto px-1 py-2">
                  <AnimatePresence initial={false}>
                    {batch.map((e) => (
                      <motion.li key={e.itemId} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25, ease }} className="flex items-center gap-2.5 rounded-xl border border-line bg-abyss/40 p-2">
                        <Artwork icon={index.get(e.itemId)?.icon} name={nameOf(e.itemId)} rarity={index.get(e.itemId)?.rarity} size={34} rounded="rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-ivory">{nameOf(e.itemId)}</div>
                          <div className="mt-1 w-[110px]">
                            <Stepper value={e.amount} onChange={(v) => setBatch((cur) => cur.map((x) => (x.itemId === e.itemId ? { ...x, amount: v } : x)))} min={1} max={maxStack} label={t('common.amount')} />
                          </div>
                        </div>
                        <button className="btn btn-quiet btn-icon" onClick={() => setBatch((cur) => cur.filter((x) => x.itemId !== e.itemId))} aria-label={t('common.remove')}>
                          <Trash2 size={14} />
                        </button>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
              <p className="mt-2 text-[11px] text-dim">{t('inventory.maxNote', { n: t.num(maxStack) })}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn btn-primary flex-1" disabled={batch.length === 0} onClick={() => setSpec(giveSpec(batch))}>
                  <Send size={15} /> {t('inventory.submitBatch')}
                </button>
                <button
                  className="btn btn-ghost btn-icon"
                  disabled={batch.length === 0}
                  title={t('characters.saveAsPreset')}
                  aria-label={t('characters.saveAsPreset')}
                  onClick={() => {
                    addPreset({ kind: 'bundle', name: `${t('presets.kinds.bundle')} · ${batch.length}`, payload: { items: batch } });
                    toast({ tone: 'info', title: t('characters.saveAsPreset'), body: `${batch.length} items` });
                  }}
                >
                  <BookmarkPlus size={15} />
                </button>
                <button className="btn btn-quiet btn-icon" disabled={batch.length === 0} onClick={() => setBatch([])} aria-label={t('common.clear')}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </Panel>
        </aside>
      </div>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => spec && spec.lines.length > 1 && setBatch([])} />
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
  const [query, setQuery] = useState('');
  const names = useMemo(() => {
    const map = new Map<number, string>();
    for (const m of materials.data ?? []) map.set(m.id, t.loc(m.name));
    for (const w of weapons.data ?? []) map.set(w.id, t.loc(w.name));
    return map;
  }, [materials.data, weapons.data, t]);

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
