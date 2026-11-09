import { ArrowUpRight, Boxes, Gem, Globe2, Hexagon, ScrollText, Skull, Swords, UserRound } from 'lucide-react';
import { useT } from '@/i18n';
import { Artwork } from '@/components/fx/Artwork';
import { IdTag, RarityStars } from '@/components/ui/Primitives';
import type { SearchDoc, SearchKind } from '@/lib/search';
import type { Character } from '@/data/types';

export const KIND_ICON: Record<SearchKind, typeof Gem> = {
  character: UserRound,
  weapon: Swords,
  artifact: Hexagon,
  material: Boxes,
  monster: Skull,
  scene: Globe2,
  command: ScrollText,
  page: ArrowUpRight,
};

/** Where a result leads, plus the verb shown on its action. */
export function resultTarget(doc: SearchDoc): { to: string; verb: 'open' | 'give' | 'grant' | 'teleport' | 'spawn' | 'build' | 'view' } {
  switch (doc.kind) {
    case 'character':
      return { to: `/characters?id=${doc.id}`, verb: 'grant' };
    case 'weapon':
      return { to: `/armory?weapon=${doc.id}`, verb: 'build' };
    case 'artifact':
      return { to: `/armory?set=${doc.id}`, verb: 'build' };
    case 'material':
      return { to: `/inventory?item=${doc.id}`, verb: 'give' };
    case 'monster':
      return { to: `/world?monster=${doc.id}`, verb: 'spawn' };
    case 'scene':
      return { to: `/world?scene=${doc.id}`, verb: 'teleport' };
    case 'command':
      return { to: `/commands?cmd=${encodeURIComponent(String(doc.id))}`, verb: 'view' };
    case 'page':
      return { to: String(doc.id), verb: 'open' };
  }
}

export function ResultRow({ doc, active, onSelect, compact = false }: { doc: SearchDoc; active?: boolean; onSelect: () => void; compact?: boolean }) {
  const t = useT();
  const Icon = KIND_ICON[doc.kind];
  const target = resultTarget(doc);
  const element = doc.kind === 'character' ? (doc.ref as Character).element : undefined;
  const title = t.loc(doc.title);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-active={active || undefined}
      className={`group flex w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${compact ? 'py-2' : 'py-2.5'} ${
        active ? 'bg-gradient-to-r from-gold/[0.14] to-transparent ring-1 ring-gold/30' : 'hover:bg-white/[0.035]'
      }`}
    >
      {doc.kind === 'page' || doc.kind === 'command' ? (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line bg-abyss/60 text-gold">
          <Icon size={17} />
        </div>
      ) : (
        <Artwork icon={doc.icon} name={doc.title.en} element={element} rarity={doc.rarity} size={compact ? 38 : 44} rounded="rounded-xl" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`truncate font-medium ${active ? 'text-ivory' : 'text-ivory/90'}`}>{doc.kind === 'command' ? `/${title}` : title}</span>
          {doc.rarity ? <RarityStars rarity={doc.rarity} size={9} /> : null}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-dim">
          <span className="inline-flex items-center gap-1">
            <Icon size={11} />
            {t.dyn(`search.kinds.${doc.kind}`)}
          </span>
          {doc.subtitle && <span className="truncate">· {doc.subtitle}</span>}
        </div>
      </div>
      {doc.kind !== 'page' && <IdTag id={doc.id} />}
      <span className={`hidden shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold sm:inline ${active ? 'border-gold/40 text-gold' : 'border-transparent text-dim group-hover:text-mist'}`}>
        {t.dyn(`search.${target.verb}`)}
      </span>
    </button>
  );
}
