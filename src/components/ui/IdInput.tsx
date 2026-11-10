import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/i18n';
import { loadCatalog } from '@/data/catalog';
import { Artwork } from '@/components/fx/Artwork';
import { buildSuggestions, rankSuggestions, splitLastToken, type SuggestKind, type Suggestion } from '@/lib/suggest';

const cache = new Map<SuggestKind, Promise<Suggestion[]>>();

/** Loads one kind's catalog on first use and keeps the flattened suggestions for the session. */
export function loadKind(kind: SuggestKind): Promise<Suggestion[]> {
  let promise = cache.get(kind);
  if (!promise) {
    promise = (async () => {
      switch (kind) {
        case 'avatar':
          return buildSuggestions(kind, { characters: await loadCatalog('characters') });
        case 'weapon':
          return buildSuggestions(kind, { weapons: await loadCatalog('weapons') });
        case 'artifact':
          return buildSuggestions(kind, { artifacts: await loadCatalog('artifacts') });
        case 'material':
        case 'namecard':
          return buildSuggestions(kind, { materials: await loadCatalog('materials') });
        case 'monster':
          return buildSuggestions(kind, { monsters: await loadCatalog('monsters') });
        case 'scene':
          return buildSuggestions(kind, { scenes: await loadCatalog('scenes') });
        case 'point':
          return buildSuggestions(kind, { teleports: await loadCatalog('teleports') });
        case 'player':
          // Online players come from the live server, not the catalog (see CommandLine).
          return [];
      }
    })();
    promise.catch(() => cache.delete(kind));
    cache.set(kind, promise);
  }
  return promise;
}

/**
 * A text field that completes game IDs from the catalog while you type, like command suggestions in
 * a game console: ↑/↓ move, Enter or Tab insert, Esc closes. With `multi`, only the last token of a
 * comma/space separated value is completed.
 */
export function IdInput({
  id,
  value,
  onChange,
  kinds,
  multi = false,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  kinds: SuggestKind[];
  multi?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const t = useT();
  const [all, setAll] = useState<Suggestion[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = `${id ?? 'idinput'}-list`;
  const kindKey = kinds.join(',');

  // Catalogs load lazily, the first time the field is used.
  const [wanted, setWanted] = useState(false);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    Promise.all(kinds.map(loadKind)).then(
      (lists) => alive && setAll(lists.flat()),
      () => alive && setAll([]),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, kindKey]);

  const { head, token } = splitLastToken(value, multi);
  const results = useMemo(() => (all ? rankSuggestions(all, token) : []), [all, token]);
  useEffect(() => setActive(0), [token, kindKey]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const pick = (s: Suggestion) => {
    onChange(`${head}${s.id}`);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const count = results.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (count === 0) return;
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % count : (i - 1 + count) % count));
    } else if (e.key === 'Enter' && open && count > 0) {
      e.preventDefault();
      pick(results[Math.min(active, count - 1)]);
    } else if (e.key === 'Tab' && open && count > 0 && token.trim() !== '') {
      e.preventDefault();
      pick(results[Math.min(active, count - 1)]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const showList = open && wanted;
  return (
    <div className="relative">
      <input
        id={id}
        className="field font-mono text-sm"
        role="combobox"
        aria-expanded={showList && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && results.length > 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onFocus={() => {
          setWanted(true);
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setWanted(true);
          setOpen(true);
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gold/25 bg-night shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
          {all === null ? (
            <p className="px-3 py-3 text-xs text-dim">{t('commands.loadingIds')}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-dim">{t('search.empty', { q: token })}</p>
          ) : (
            <ul id={listId} ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {results.map((s, i) => (
                <li
                  key={`${s.kind}-${s.id}`}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseMove={() => setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 px-2.5 py-1.5 ${i === active ? 'bg-gold/10' : ''}`}
                >
                  <Artwork icon={s.icon} name={s.en} rarity={s.rarity ?? 0} size={32} rounded="rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ivory">{t.loc({ en: s.en, th: s.th })}</span>
                    <span className="block truncate text-[11px] text-dim">{s.sub}</span>
                  </span>
                  <span className="font-mono text-xs text-gold">{s.id}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-line px-3 py-1.5 text-[10px] text-dim">{t('commands.pickHint')}</p>
        </div>
      )}
    </div>
  );
}
