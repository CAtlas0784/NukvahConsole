import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { BookmarkPlus, Search, Sparkles, UserPlus, Wand2 } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { useAvatars } from '@/api/hooks';
import { api, type OwnedAvatar } from '@/api/nukva';
import { useCapability, useSession } from '@/stores/session';
import { usePresets } from '@/stores/presets';
import { useToasts } from '@/stores/ops';
import { Artwork, elementColor } from '@/components/fx/Artwork';
import { Drawer } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { CopyButton, DenialNotice, ElementDot, EmptyState, ErrorState, IdTag, PageHeader, RangeField, RarityStars, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import type { Character, Element, WeaponType } from '@/data/types';
import { ease } from '@/lib/motion';
import { normalize } from '@/lib/search';

const ELEMENTS: Element[] = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'];
const WEAPONS: WeaponType[] = ['sword', 'claymore', 'polearm', 'bow', 'catalyst'];

export default function Characters() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const characters = useCatalog('characters');
  const uid = useSession((s) => s.uid);
  const avatars = useAvatars(uid);
  const [query, setQuery] = useState('');
  const [element, setElement] = useState<Element | null>(null);
  const [weapon, setWeapon] = useState<WeaponType | null>(null);
  const [rarity, setRarity] = useState<number | null>(null);
  const [ownership, setOwnership] = useState<'all' | 'owned' | 'missing'>('all');

  const owned = useMemo(() => new Map((avatars.data ?? []).map((a) => [a.avatarId, a])), [avatars.data]);
  const selectedId = Number(params.get('id')) || null;
  const selected = selectedId ? byId(characters.data).get(selectedId) ?? null : null;

  const list = useMemo(() => {
    const q = normalize(query);
    return (characters.data ?? []).filter((c) => {
      if (element && c.element !== element) return false;
      if (weapon && c.weapon !== weapon) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (ownership === 'owned' && !owned.has(c.id)) return false;
      if (ownership === 'missing' && owned.has(c.id)) return false;
      if (q && !normalize(`${c.name.en} ${c.name.th ?? ''} ${c.key} ${c.id}`).includes(q)) return false;
      return true;
    });
  }, [characters.data, query, element, weapon, rarity, ownership, owned]);

  return (
    <>
      <PageHeader eyebrow={t('characters.eyebrow')} title={t('characters.title')} lead={uid ? `UID ${uid}${avatars.simulated ? ` · ${t('common.preview')}` : ''}` : t('characters.noPlayerLead')} />

      <div className="panel mb-6 space-y-4 p-4">
        <div className="relative">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input className="field pl-9" placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] tracking-[0.14em] text-dim uppercase">{t('characters.filterElement')}</span>
          {ELEMENTS.map((e) => (
            <button key={e} className="chip" aria-pressed={element === e} onClick={() => setElement(element === e ? null : e)} style={element === e ? undefined : { color: elementColor(e) }}>
              {t.dyn(`elements.${e}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[11px] tracking-[0.14em] text-dim uppercase">{t('characters.filterWeapon')}</span>
          {WEAPONS.map((w) => (
            <button key={w} className="chip" aria-pressed={weapon === w} onClick={() => setWeapon(weapon === w ? null : w)}>
              {t.dyn(`weapons.${w}`)}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-line" />
          {[5, 4].map((r) => (
            <button key={r} className="chip" aria-pressed={rarity === r} onClick={() => setRarity(rarity === r ? null : r)}>
              {t('common.stars', { n: r })}
            </button>
          ))}
          {avatars.data && (
            <>
              <span className="mx-2 h-4 w-px bg-line" />
              {(['all', 'owned', 'missing'] as const).map((o) => (
                <button key={o} className="chip" aria-pressed={ownership === o} onClick={() => setOwnership(o)}>
                  {o === 'all' ? t('common.all') : o === 'owned' ? t('common.owned') : t('common.notOwned')}
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {avatars.error ? <div className="mb-5"><ErrorState error={avatars.error} onRetry={avatars.refresh} /></div> : null}

      {characters.error ? (
        <ErrorState error={characters.error} onRetry={characters.retry} />
      ) : !characters.data ? (
        <SkeletonGrid count={18} className="h-56" />
      ) : list.length === 0 ? (
        <EmptyState title={t('search.empty', { q: query || '…' })} />
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-3.5">
          {list.map((c, i) => (
            <motion.li key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 24) * 0.012, duration: 0.35, ease }}>
              <CharacterCard character={c} owned={owned.get(c.id)} onOpen={() => setParams({ id: String(c.id) })} />
            </motion.li>
          ))}
        </ul>
      )}

      <CharacterDrawer character={selected} known={!!avatars.data} owned={selected ? owned.get(selected.id) : undefined} onClose={() => setParams({})} onChanged={avatars.refresh} />
    </>
  );
}

function CharacterCard({ character: c, owned, onOpen }: { character: Character; owned?: OwnedAvatar; onOpen: () => void }) {
  const t = useT();
  const color = elementColor(c.element);
  return (
    <button
      onClick={onOpen}
      className="panel panel-interactive tilt group relative flex w-full flex-col items-center overflow-hidden px-3 pt-5 pb-4 text-center"
      style={{ backgroundImage: `radial-gradient(120% 70% at 50% 0%, ${color}22, transparent 60%)` }}
    >
      <div className={`absolute inset-x-0 top-0 h-px ${c.rarity === 5 ? 'bg-gradient-to-r from-transparent via-gold to-transparent' : 'bg-gradient-to-r from-transparent via-violet to-transparent'}`} />
      {owned && (
        <span className="absolute top-2.5 right-2.5 rounded-full border border-ok/30 bg-ok/10 px-1.5 py-0.5 font-mono text-[10px] text-ok">
          {owned.level} · C{owned.constellation}
        </span>
      )}
      <div className="transition-transform duration-500 group-hover:scale-105">
        <Artwork icon={c.icon} name={c.name.en} element={c.element} rarity={c.rarity} size={86} rounded="rounded-full" />
      </div>
      <div className="mt-3 w-full truncate text-sm font-semibold text-ivory">{t.loc(c.name)}</div>
      <div className="mt-1 flex items-center gap-2">
        <RarityStars rarity={c.rarity} size={9} />
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-dim">
        <ElementDot element={c.element} label={t.dyn(`elements.${c.element}`)} />· {t.dyn(`weapons.${c.weapon}`)}
      </div>
    </button>
  );
}

function CharacterDrawer({ character, owned, known, onClose, onChanged }: { character: Character | null; owned?: OwnedAvatar; known: boolean; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const mode = useSession((s) => s.mode);
  const weapons = useCatalog('weapons');
  const artifacts = useCatalog('artifacts');
  const addPreset = usePresets((s) => s.add);
  const toast = useToasts((s) => s.show);
  const grantCap = useCapability('avatars.grant');
  const levelCap = useCapability('avatars.level');

  const [level, setLevel] = useState(90);
  const [cons, setCons] = useState(0);
  const [normal, setNormal] = useState(10);
  const [skill, setSkill] = useState(10);
  const [burst, setBurst] = useState(10);
  const [spec, setSpec] = useState<OperationSpec<OwnedAvatar> | null>(null);

  useEffect(() => {
    if (!character) return;
    setLevel(owned?.level ?? 90);
    setCons(owned?.constellation ?? 0);
    setNormal(owned?.talents?.normal.level ?? 10);
    setSkill(owned?.talents?.skill.level ?? 10);
    setBurst(owned?.talents?.burst.level ?? 10);
  }, [character, owned]);

  if (!character) return <Drawer open={false} onClose={onClose} title="">{null}</Drawer>;
  const c = character;
  const name = t.loc(c.name);
  const weaponName = (id: number) => t.loc(byId(weapons.data).get(id)?.name) || `#${id}`;
  const artifactName = (id: number) => {
    for (const set of artifacts.data?.sets ?? []) for (const list of Object.values(set.pieces)) for (const p of list ?? []) if (p.id === id) return t.loc(p.name);
    return `#${id}`;
  };

  const changes: { label: string; value: string }[] = [];
  if (owned) {
    if (level !== owned.level) changes.push({ label: t('common.level'), value: `${owned.level} → ${level}` });
    if (cons !== owned.constellation) changes.push({ label: t('characters.constellation'), value: `C${owned.constellation} → C${cons}` });
    if (owned.talents) {
      if (normal !== owned.talents.normal.level) changes.push({ label: t('characters.normal'), value: `${owned.talents.normal.level} → ${normal}` });
      if (skill !== owned.talents.skill.level) changes.push({ label: t('characters.skill'), value: `${owned.talents.skill.level} → ${skill}` });
      if (burst !== owned.talents.burst.level) changes.push({ label: t('characters.burst'), value: `${owned.talents.burst.level} → ${burst}` });
    }
  }

  const openGrant = () =>
    setSpec({
      title: `${t('characters.grant')} — ${name}`,
      capability: 'avatars.grant',
      action: 'avatar.grant',
      summary: `${name} Lv${level} C${cons} T${normal}/${skill}/${burst}`,
      lines: [
        { label: t('characters.title'), value: `${name} (#${c.id})` },
        { label: t('common.level'), value: String(level) },
        { label: t('characters.constellation'), value: `C${cons}` },
        { label: t('characters.normal'), value: String(normal) },
        { label: t('characters.skill'), value: String(skill) },
        { label: t('characters.burst'), value: String(burst) },
      ],
      request: { method: 'POST', path: '/players/{uid}/avatars', body: { avatarId: c.id, level, constellation: cons, normal, skill, burst } },
      run: (conn, target) => api.grantAvatar(conn, target, { avatarId: c.id, level, constellation: cons, normal, skill, burst }),
    });

  const openUpdate = () => {
    const body: Record<string, number> = {};
    if (owned && level !== owned.level) body.level = level;
    if (owned && cons !== owned.constellation) body.constellation = cons;
    if (owned?.talents) {
      if (normal !== owned.talents.normal.level) body.normal = normal;
      if (skill !== owned.talents.skill.level) body.skill = skill;
      if (burst !== owned.talents.burst.level) body.burst = burst;
    }
    setSpec({
      title: `${t('characters.update')} — ${name}`,
      capability: 'avatars.level',
      action: 'avatar.update',
      summary: `${name}: ${changes.map((x) => `${x.label} ${x.value}`).join(', ')}`,
      lines: changes,
      request: { method: 'PATCH', path: `/players/{uid}/avatars/${c.id}`, body },
      run: (conn, target) => api.updateAvatar(conn, target, c.id, body),
      judge: (result) =>
        result.rejected && result.rejected.length
          ? { status: 'partial', detail: `rejected: ${result.rejected.join(', ')}` }
          : { status: 'success', detail: `Lv${result.level} C${result.constellation}` },
    });
  };

  const denial = owned ? levelCap : grantCap;

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        eyebrow={`${t.dyn(`elements.${c.element}`)} · ${t.dyn(`weapons.${c.weapon}`)}`}
        title={name}
        footer={
          <>
            <button
              className="btn btn-ghost mr-auto"
              onClick={() => {
                addPreset({ kind: 'character', name: `${name} · Lv${level} C${cons}`, payload: { avatarId: c.id, level, constellation: cons, talents: { normal, skill, burst } } });
                toast({ tone: 'info', title: t('characters.saveAsPreset'), body: name });
              }}
            >
              <BookmarkPlus size={15} /> {t('characters.saveAsPreset')}
            </button>
            {owned ? (
              <button className="btn btn-primary" disabled={changes.length === 0} onClick={openUpdate}>
                <Wand2 size={15} /> {t('characters.update')}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={openGrant}>
                <UserPlus size={15} /> {t('characters.grant')}
              </button>
            )}
          </>
        }
      >
        <div className="space-y-7">
          <div className="flex items-center gap-5">
            <Artwork icon={c.icon} name={c.name.en} element={c.element} rarity={c.rarity} size={104} rounded="rounded-3xl" />
            <div className="min-w-0 space-y-2">
              <RarityStars rarity={c.rarity} size={13} />
              <div className="flex flex-wrap items-center gap-2">
                <IdTag id={c.id} />
                <CopyButton value={String(c.id)} />
              </div>
              <div className="font-mono text-xs text-dim">{c.key}</div>
            </div>
          </div>

          {mode === 'preview' && <DenialNotice reason="preview" compact />}
          {!uid ? (
            <p className="text-sm text-mist">{t('characters.noPlayerLead')}</p>
          ) : owned ? (
            <section>
              <div className="eyebrow mb-3">{t('characters.ownedState')}</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  [t('common.level'), owned.level],
                  [t('characters.constellation'), `C${owned.constellation}`],
                  [t('characters.friendship'), owned.fetterLevel],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl border border-line bg-abyss/40 py-3">
                    <div className="font-display text-xl text-gilded">{value}</div>
                    <div className="mt-1 text-[10px] tracking-wider text-dim uppercase">{label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-mist">{t('characters.weapon')}</span>
                  <span className="text-right text-ivory">{owned.weapon ? `${weaponName(owned.weapon.itemId)} · Lv${owned.weapon.level} · R${owned.weapon.refinement}` : t('characters.noWeapon')}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-mist">{t('characters.artifacts')}</span>
                  <span className="text-right text-ivory">{owned.artifacts.length ? owned.artifacts.map((a) => `${artifactName(a.itemId)} +${a.level - 1}`).join(', ') : t('characters.noArtifacts')}</span>
                </div>
              </div>
            </section>
          ) : known ? (
            <div className="flex items-center gap-2 rounded-xl border border-gold/20 bg-gold/[0.04] px-4 py-3 text-sm text-gold">
              <Sparkles size={15} /> {t('characters.notOwnedLead')}
            </div>
          ) : null}

          <section className="space-y-6">
            <RangeField label={t('common.level')} value={level} onChange={setLevel} min={1} max={90} marks={[1, 20, 40, 50, 60, 70, 80, 90]} />

            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="label mb-0">{t('characters.constellation')}</span>
                <span className="font-mono text-lg text-gold-bright">C{cons}</span>
              </div>
              <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label={t('characters.constellation')}>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => {
                  const on = n <= cons && n > 0;
                  const label = n === 0 ? 'C0' : t.loc(c.constellations[n - 1]?.name) || `C${n}`;
                  return (
                    <button
                      key={n}
                      role="radio"
                      aria-checked={cons === n}
                      title={label}
                      aria-label={label}
                      onClick={() => setCons(n)}
                      className={`group relative grid aspect-square place-items-center rounded-xl border transition-all ${on ? 'border-gold/60 bg-gold/15' : cons === n ? 'border-cyan/50 bg-cyan/10' : 'border-line bg-abyss/40 hover:border-gold/30'}`}
                    >
                      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${on ? 'text-gold-bright drop-shadow-[0_0_6px_rgba(247,228,176,0.8)]' : 'text-dim'}`} aria-hidden>
                        {n === 0 ? <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" /> : <path d="M12 2 L14.2 9.8 L22 12 L14.2 14.2 L12 22 L9.8 14.2 L2 12 L9.8 9.8 Z" fill="currentColor" />}
                      </svg>
                    </button>
                  );
                })}
              </div>
              {cons > 0 && c.constellations[cons - 1] && <p className="mt-2 text-xs text-mist">{t.loc(c.constellations[cons - 1].name)}</p>}
            </div>

            <div>
              <div className="label">{t('characters.talents')}</div>
              {(
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['normal', normal, setNormal],
                      ['skill', skill, setSkill],
                      ['burst', burst, setBurst],
                    ] as const
                  ).map(([key, value, setter]) => (
                    <div key={key}>
                      <div className="mb-1.5 truncate text-xs text-mist" title={t.loc(c.talents?.[key]?.name)}>
                        {t.dyn(`characters.${key}`)}
                      </div>
                      <Stepper value={value} onChange={setter} min={1} max={10} label={t.dyn(`characters.${key}`)} />
                      <div className="mt-1 truncate text-[11px] text-dim">{t.loc(c.talents?.[key]?.name)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {owned && changes.length > 0 && (
            <div className="rounded-xl border border-cyan/20 bg-cyan/[0.04] px-4 py-3 text-xs text-cyan">
              {t('characters.changed')}: {changes.map((x) => `${x.label} ${x.value}`).join(' · ')}
            </div>
          )}
          {!denial.allowed && denial.reason !== 'preview' && <DenialNotice reason={denial.reason} role={denial.role} compact />}
          <p className="text-xs text-dim">{t('characters.equipUnsupported')}</p>
        </div>
      </Drawer>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => onChanged()} />
    </>
  );
}
