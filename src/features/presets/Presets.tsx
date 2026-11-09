import { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Download, Layers, Package, Play, Swords, Trash2, Upload, UserRound } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api } from '@/api/nukva';
import type { Connection } from '@/api/client';
import { usePresets } from '@/stores/presets';
import { describeError } from '@/stores/ops';
import { Modal } from '@/components/ui/Overlay';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { EmptyState, PageHeader, Panel } from '@/components/ui/Primitives';
import { buildPresetFile, validatePresetFile, type ImportReport, type KnownIds, type Preset } from '@/lib/presets';
import type { Capability } from '@/api/nukva';
import { ease } from '@/lib/motion';

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

/** Turns a preset into the same typed, server-verified operations the individual pages use. */
function planSteps(preset: Preset): { capability: Capability; steps: { label: string; run: (c: Connection, uid: number) => Promise<string> }[] } {
  switch (preset.kind) {
    case 'character': {
      const p = preset.payload;
      return {
        capability: 'avatars.grant',
        steps: [
          {
            label: `character #${p.avatarId}`,
            run: async (c, uid) => {
              const owned = (await api.avatars(c, uid)).find((a) => a.avatarId === p.avatarId);
              if (!owned) {
                await api.grantAvatar(c, uid, { avatarId: p.avatarId, level: p.level, constellation: p.constellation, talentLevel: p.talents.normal });
                const r = await api.updateAvatar(c, uid, p.avatarId, { skill: p.talents.skill, burst: p.talents.burst });
                return `granted · Lv${r.level} C${r.constellation}${r.rejected?.length ? ` · rejected ${r.rejected.join(',')}` : ''}`;
              }
              const r = await api.updateAvatar(c, uid, p.avatarId, { level: p.level, constellation: p.constellation, ...p.talents });
              if (r.rejected?.length) throw new Error(`rejected: ${r.rejected.join(', ')}`);
              return `updated · Lv${r.level} C${r.constellation}`;
            },
          },
        ],
      };
    }
    case 'equipment': {
      const p = preset.payload;
      const steps: { label: string; run: (c: Connection, uid: number) => Promise<string> }[] = [];
      if (p.weapon) {
        const w = p.weapon;
        steps.push({
          label: `weapon #${w.itemId}`,
          run: async (c, uid) => {
            const r = await api.giveItems(c, uid, [{ itemId: w.itemId, amount: 1, level: w.level, refinement: w.refinement }]);
            if (!r.success) throw new Error('server added nothing');
            return `Lv${w.level} R${w.refinement}`;
          },
        });
      }
      for (const a of p.artifacts) {
        steps.push({
          label: `artifact #${a.itemId}`,
          run: async (c, uid) => {
            const r = await api.giveArtifact(c, uid, { itemId: a.itemId, level: a.level, ...(a.mainPropId ? { mainPropId: a.mainPropId } : {}), appendPropIds: a.appendPropIds });
            if (!r.success) throw new Error('server added nothing');
            return `+${a.level - 1}`;
          },
        });
      }
      return { capability: p.weapon ? 'weapons.give' : 'artifacts.give', steps };
    }
    case 'bundle': {
      const items = preset.payload.items;
      return {
        capability: 'items.give',
        steps: [
          {
            label: `${items.length} item(s)`,
            run: async (c, uid) => {
              const r = await api.giveItems(c, uid, items);
              const failed = r.results.filter((x) => !x.success);
              if (failed.length) throw new Error(`not added: ${failed.map((f) => `#${f.itemId}`).join(', ')}`);
              return `${r.results.length} added`;
            },
          },
        ],
      };
    }
  }
}

const KIND_ICON = { character: UserRound, equipment: Swords, bundle: Package };

export default function Presets() {
  const t = useT();
  const presets = usePresets((s) => s.presets);
  const remove = usePresets((s) => s.remove);
  const addMany = usePresets((s) => s.addMany);
  const characters = useCatalog('characters');
  const weapons = useCatalog('weapons');
  const materials = useCatalog('materials');
  const artifacts = useCatalog('artifacts');
  const meta = useCatalog('meta');
  const fileRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [spec, setSpec] = useState<OperationSpec<StepResult[]> | null>(null);

  const known: KnownIds | null = useMemo(() => {
    if (!characters.data || !weapons.data || !materials.data || !artifacts.data) return null;
    const pieceIds = artifacts.data.sets.flatMap((s) => Object.values(s.pieces).flatMap((l) => (l ?? []).map((p) => p.id)));
    return {
      avatars: new Set(characters.data.map((c) => c.id)),
      items: new Set([...materials.data.map((m) => m.id), ...weapons.data.map((w) => w.id), ...pieceIds]),
      mainProps: new Set(Object.values(artifacts.data.mainProps).flat().map((m) => m.id)),
      subProps: new Set(Object.values(artifacts.data.subProps).flat().map((m) => m.id)),
      gameVersion: meta.data?.gameVersion ?? null,
    };
  }, [characters.data, weapons.data, materials.data, artifacts.data, meta.data]);

  const describe = (p: Preset): string => {
    if (p.kind === 'character') {
      const c = byId(characters.data).get(p.payload.avatarId);
      return `${c ? t.loc(c.name) : `#${p.payload.avatarId}`} · Lv${p.payload.level} · C${p.payload.constellation} · ${p.payload.talents.normal}/${p.payload.talents.skill}/${p.payload.talents.burst}`;
    }
    if (p.kind === 'equipment') {
      const w = p.payload.weapon ? byId(weapons.data).get(p.payload.weapon.itemId) : null;
      return [w ? `${t.loc(w.name)} R${p.payload.weapon!.refinement}` : null, p.payload.artifacts.length ? `${p.payload.artifacts.length} artifact(s)` : null].filter(Boolean).join(' · ');
    }
    const names = p.payload.items.slice(0, 3).map((i) => `${t.loc(byId(materials.data).get(i.itemId)?.name) || `#${i.itemId}`} ×${i.amount}`);
    return names.join(', ') + (p.payload.items.length > 3 ? ` +${p.payload.items.length - 3}` : '');
  };

  const apply = (preset: Preset) => {
    const plan = planSteps(preset);
    setSpec({
      title: `${t('presets.apply')} — ${preset.name}`,
      capability: plan.capability,
      action: `preset.${preset.kind}`,
      summary: preset.name,
      lines: [
        { label: t.dyn(`presets.kinds.${preset.kind}`), value: describe(preset) },
        { label: 'Steps', value: plan.steps.map((s) => s.label).join(' → ') },
      ],
      request: { method: 'POST', path: '/players/{uid}/…', body: preset.payload },
      run: async (conn, uid) => {
        const results: StepResult[] = [];
        for (const step of plan.steps) {
          try {
            results.push({ step: step.label, ok: true, detail: await step.run(conn, uid) });
          } catch (error) {
            results.push({ step: step.label, ok: false, detail: describeError(error) });
          }
        }
        return results;
      },
      judge: (results) => {
        const failed = results.filter((r) => !r.ok);
        const detail = results.map((r) => `${r.ok ? '✓' : '✗'} ${r.step}: ${r.detail}`).join(' | ');
        if (failed.length === 0) return { status: 'success', detail };
        return { status: failed.length === results.length ? 'failed' : 'partial', detail };
      },
    });
  };

  const exportAll = () => {
    const file = buildPresetFile(presets, meta.data?.gameVersion ?? null);
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nukva-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFile = async (file: File) => {
    if (!known) return;
    let parsed: unknown;
    try {
      if (file.size > 2_000_000) throw new Error('file too large');
      parsed = JSON.parse(await file.text());
    } catch (error) {
      setReport({ presets: [], errors: [{ index: -1, name: file.name, message: describeError(error) }], warnings: [] });
      return;
    }
    const result = validatePresetFile(parsed, known);
    if (result.presets.length) addMany(result.presets);
    setReport(result);
  };

  const groups = (['character', 'equipment', 'bundle'] as const).map((kind) => ({ kind, items: presets.filter((p) => p.kind === kind) }));

  return (
    <>
      <PageHeader
        eyebrow={t('presets.eyebrow')}
        title={t('presets.title')}
        lead={t('presets.lead')}
        actions={
          <>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={!known}>
              <Upload size={14} /> {t('presets.import')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={exportAll} disabled={presets.length === 0}>
              <Download size={14} /> {t('presets.export')}
            </button>
          </>
        }
      />
      {presets.length === 0 ? (
        <Panel>
          <EmptyState icon={<Layers size={22} />} title={t('presets.title')}>
            {t('presets.empty')}
          </EmptyState>
        </Panel>
      ) : (
        <div className="space-y-8">
          {groups.filter((g) => g.items.length).map((g) => {
            const Icon = KIND_ICON[g.kind];
            return (
              <section key={g.kind}>
                <div className="eyebrow mb-3 flex items-center gap-2">
                  <Icon size={13} /> {t.dyn(`presets.kinds.${g.kind}`)} · {g.items.length}
                </div>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {g.items.map((p, i) => (
                    <motion.li key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03, ease }} className="panel panel-interactive flex flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ivory">{p.name}</div>
                          <div className="mt-1 line-clamp-2 text-xs text-mist">{describe(p)}</div>
                        </div>
                        <button className="text-dim hover:text-danger" onClick={() => remove(p.id)} aria-label={`${t('common.delete')} ${p.name}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="mt-auto flex items-center justify-between">
                        <span className="text-[11px] text-dim">{t('presets.steps', { n: planSteps(p).steps.length })}</span>
                        <button className="btn btn-primary btn-sm" onClick={() => apply(p)}>
                          <Play size={13} /> {t('presets.apply')}
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={!!report} onClose={() => setReport(null)} title={t('presets.import')} footer={<button className="btn btn-primary" onClick={() => setReport(null)}>{t('common.close')}</button>}>
        {report && (
          <div className="space-y-4 text-sm">
            <p className="text-ivory">{t('presets.importResult', { n: report.presets.length })}</p>
            {report.warnings.length > 0 && (
              <div>
                <div className="label text-warn">{t('presets.importWarnings')}</div>
                <ul className="space-y-1 text-xs text-warn/90">
                  {report.warnings.map((w, i) => (
                    <li key={i}>
                      {w.name}: {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.errors.length > 0 && (
              <div>
                <div className="label text-danger">{t('presets.importErrors')}</div>
                <ul className="space-y-1 text-xs text-danger/90">
                  {report.errors.map((e, i) => (
                    <li key={i}>
                      {e.name}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} />
    </>
  );
}
