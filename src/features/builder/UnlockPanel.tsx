import { useState } from 'react';
import { Info, UserPlus } from 'lucide-react';
import { useT } from '@/i18n';
import { api, type OwnedAvatar } from '@/api/nukva';
import { useCapability, useSession } from '@/stores/session';
import { Artwork } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { DenialNotice, IdTag, RangeField, RarityStars, Segmented, Stepper } from '@/components/ui/Primitives';
import type { Character } from '@/data/types';
import { AVATAR_CAPS, fitAscension, levelLabel, levelMarks, validAscensions } from '@/lib/progression';

/**
 * Unlocks a character the player does not own: level and ascension, constellation and talents are
 * set in the same grant (POST /players/{uid}/avatars), which the server reads back before answering.
 */
export function UnlockPanel({ character: c, onUnlocked }: { character: Character; onUnlocked: () => void }) {
  const t = useT();
  const uid = useSession((s) => s.uid);
  const cap = useCapability('avatars.grant');
  const [level, setLevel] = useState(90);
  const [asc, setAsc] = useState(6);
  const [cons, setCons] = useState(0);
  const [talents, setTalents] = useState({ normal: 1, skill: 1, burst: 1 });
  const [spec, setSpec] = useState<OperationSpec<OwnedAvatar> | null>(null);
  const name = t.loc(c.name);
  const unreleased = c.release === 'not-in-codex';

  const review = () => {
    const body = { avatarId: c.id, level, promoteLevel: asc, constellation: cons, ...talents };
    setSpec({
      title: `${t('builder.unlockTitle', { name })}`,
      capability: 'avatars.grant',
      action: 'avatar.grant',
      summary: `${name} ${levelLabel(AVATAR_CAPS, level, asc)} C${cons} T${talents.normal}/${talents.skill}/${talents.burst}`,
      lines: [
        { label: t('characters.title'), value: `${name} (#${c.id})` },
        { label: t('common.level'), value: levelLabel(AVATAR_CAPS, level, asc) },
        { label: t('characters.constellation'), value: `C${cons}` },
        { label: t('characters.talents'), value: `${talents.normal} / ${talents.skill} / ${talents.burst}` },
        ...(uid ? [{ label: 'UID', value: String(uid) }] : []),
      ],
      request: { method: 'POST', path: '/players/{uid}/avatars', body },
      run: (conn, target) => api.grantAvatar(conn, target, body),
      judge: (r) => ({ status: 'success', detail: `Lv${r.level}/${AVATAR_CAPS[r.promoteLevel] ?? '?'} C${r.constellation}` }),
    });
  };

  return (
    <section className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <Artwork icon={c.icon} name={c.name.en} element={c.element} rarity={c.rarity} size={72} rounded="rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl text-ivory">{name}</h2>
            <IdTag id={c.id} />
            <RarityStars rarity={c.rarity} size={11} />
          </div>
          <div className="text-xs text-mist">
            {t.dyn(`elements.${c.element}`)} · {t.dyn(`weapons.${c.weapon}`)}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-gold/20 bg-gold/[0.04] p-3 text-sm text-gold">
        <Info size={15} className="mt-0.5 shrink-0" /> {t('builder.notOwnedUnlock')}
      </div>
      {c.release === 'traveler' && <p className="text-xs text-cyan">{t('builder.travelerNote')}</p>}
      {unreleased && <p className="text-xs text-warn">{t('builder.unreleasedNote')}</p>}

      <RangeField
        label={t('common.level')}
        value={level}
        onChange={(v) => {
          setLevel(v);
          setAsc((a) => fitAscension(AVATAR_CAPS, v, a));
        }}
        min={1}
        max={90}
        marks={levelMarks(AVATAR_CAPS)}
      />
      <div className="flex flex-wrap items-center gap-3">
        {validAscensions(AVATAR_CAPS, level).length > 1 ? (
          <Segmented label={t('builder.ascensionLabel')} value={asc} onChange={setAsc} options={validAscensions(AVATAR_CAPS, level).map((p) => ({ value: p, label: levelLabel(AVATAR_CAPS, level, p) }))} />
        ) : (
          <span className="rounded-md border border-line px-2 py-1 font-mono text-xs text-mist">{levelLabel(AVATAR_CAPS, level, asc)}</span>
        )}
      </div>
      <div>
        <div className="label">{t('characters.constellation')}</div>
        <Segmented label={t('characters.constellation')} value={cons} onChange={setCons} options={[0, 1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `C${n}` }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['normal', 'skill', 'burst'] as const).map((key) => (
          <div key={key}>
            <div className="label truncate" title={t.loc(c.talents?.[key]?.name)}>
              {t.dyn(`characters.${key}`)}
            </div>
            <Stepper value={talents[key]} onChange={(v) => setTalents((cur) => ({ ...cur, [key]: v }))} min={1} max={10} label={t.dyn(`characters.${key}`)} />
          </div>
        ))}
      </div>
      {!cap.allowed && cap.reason !== 'preview' && <DenialNotice reason={cap.reason} role={cap.role} compact />}
      <button className="btn btn-primary w-full" onClick={review}>
        <UserPlus size={15} /> {t('builder.unlock')}
      </button>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => onUnlocked()} />
    </section>
  );
}
