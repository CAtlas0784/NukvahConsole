import { useMemo } from 'react';
import en, { type Dictionary } from './en';
import th from './th';
import { useSettings, type Lang } from '@/stores/settings';
import type { Localized } from '@/data/types';

const dictionaries: Record<Lang, Dictionary> = { en, th };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = T extends string ? never : { [K in keyof T & string]: T[K] extends string ? K : K | Join<K, Paths<T[K]>> }[keyof T & string];
type Leaves<T> = T extends string ? never : { [K in keyof T & string]: T[K] extends string ? K : Join<K, Leaves<T[K]>> }[keyof T & string];

export type TKey = Leaves<Dictionary>;
export type TBranch = Paths<Dictionary>;

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as object)) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === 'string' ? node : undefined;
}

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const text = lookup(dictionaries[lang], key) ?? lookup(dictionaries.en, key) ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`)) : text;
}

/** Translation hook. `t('nav.dashboard')`; `t.dyn('search.kinds.' + kind)` for runtime keys. */
export function useT() {
  const lang = useSettings((s) => s.lang);
  return useMemo(() => {
    const t = (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
    return Object.assign(t, {
      lang,
      dyn: (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
      loc: (value: Localized | null | undefined) => (value ? (lang === 'th' && value.th ? value.th : value.en) : ''),
      num: (value: number) => value.toLocaleString(lang === 'th' ? 'th-TH' : 'en-US'),
    });
  }, [lang]);
}
