import { useState } from 'react';
import { Clapperboard, Info, Link2, Trash2, Unplug } from 'lucide-react';
import { useT } from '@/i18n';
import { useSettings, type IntroMode, type MotionPref } from '@/stores/settings';
import { useIntro } from '@/stores/intro';
import { introFor } from '@/content/intro';
import { useSession } from '@/stores/session';
import { useCatalog } from '@/data/catalog';
import { PageHeader, Panel, Segmented } from '@/components/ui/Primitives';
import { safeStorage } from '@/lib/storage';

export default function Settings() {
  const t = useT();
  const s = useSettings();
  const mode = useSession((x) => x.mode);
  const baseUrl = useSession((x) => x.baseUrl);
  const status = useSession((x) => x.status);
  const disconnect = useSession((x) => x.disconnect);
  const meta = useCatalog('meta');
  const [assetDraft, setAssetDraft] = useState(s.assetBase);

  return (
    <>
      <PageHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel className="space-y-6 p-6">
          <div>
            <div className="label">{t('settings.language')}</div>
            <Segmented label="language" value={s.lang} onChange={(lang) => s.set({ lang })} options={[{ value: 'en', label: 'English' }, { value: 'th', label: 'ภาษาไทย' }]} />
          </div>
          <div>
            <div className="label">{t('settings.motion')}</div>
            <Segmented<MotionPref>
              label="motion"
              value={s.motion}
              onChange={(motion) => s.set({ motion })}
              options={[
                { value: 'system', label: t('settings.motionSystem') },
                { value: 'reduced', label: t('settings.motionReduced') },
                { value: 'full', label: t('settings.motionFull') },
              ]}
            />
          </div>
          <div>
            <div className="label">{t('settings.intro')}</div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented<IntroMode>
                label="intro"
                value={s.introMode}
                onChange={(introMode) => s.set({ introMode })}
                options={[
                  { value: 'session', label: t('settings.introSession') },
                  { value: 'version', label: t('settings.introVersion') },
                  { value: 'off', label: t('settings.introOff') },
                ]}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => useIntro.getState().play(introFor(status?.gameVersion))}>
                <Clapperboard size={14} /> {t('settings.replayIntro')}
              </button>
            </div>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span className="text-sm text-ivory">{t('settings.ambient')}</span>
            <input type="checkbox" className="h-4 w-4 accent-[#e2c27d]" checked={s.ambient} onChange={(e) => s.set({ ambient: e.target.checked })} />
          </label>
          <div>
            <label className="label" htmlFor="asset-base">
              {t('settings.assets')}
            </label>
            <div className="flex gap-2">
              <input id="asset-base" className="field font-mono text-sm" placeholder="https://assets.example.com/ui" value={assetDraft} onChange={(e) => setAssetDraft(e.target.value)} />
              <button className="btn btn-ghost" onClick={() => s.set({ assetBase: assetDraft.trim().replace(/\/+$/, '') })}>
                {t('common.save')}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-dim">{t('settings.assetsHint')}</p>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel className="p-6" eyebrow={t('settings.connection')}>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-mist">Mode</dt>
                <dd className="text-ivory">{mode}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-mist">URL</dt>
                <dd className="truncate font-mono text-xs text-ivory">{mode === 'connected' ? baseUrl : '—'}</dd>
              </div>
              {status && (
                <>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t('status.role')}</dt>
                    <dd className="text-ivory uppercase">{status.role}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-mist">{t('status.bridge')}</dt>
                    <dd className="font-mono text-ivory">v{status.bridgeVersion} · API {status.apiVersion}</dd>
                  </div>
                </>
              )}
            </dl>
            <button className="btn btn-ghost btn-sm mt-4" onClick={disconnect}>
              {mode === 'connected' ? <Unplug size={14} /> : <Link2 size={14} />} {mode === 'connected' ? t('status.disconnect') : t('gate.connect')}
            </button>
          </Panel>
          <Panel className="p-6" eyebrow={t('settings.clearData')}>
            <p className="mb-3 text-sm text-mist">{t('settings.clearDataHint')}</p>
            <button
              className="btn btn-ghost btn-sm text-danger"
              onClick={() => {
                if (!window.confirm(t('settings.clearDataHint'))) return;
                const store = safeStorage('local');
                ['nukva.settings', 'nukva.history', 'nukva.presets', 'nukva.uid', 'nukva.lastUrl'].forEach((k) => store.removeItem(k));
                location.reload();
              }}
            >
              <Trash2 size={14} /> {t('settings.clearData')}
            </button>
          </Panel>
          <Panel className="p-6" eyebrow={t('settings.about')}>
            <p className="flex gap-2 text-sm leading-relaxed text-mist">
              <Info size={15} className="mt-0.5 shrink-0 text-gold" />
              {t('settings.aboutText')}
            </p>
            {meta.data && (
              <p className="mt-3 font-mono text-[11px] text-dim">
                catalog {meta.data.gameVersion} · {new Date(meta.data.generatedAt).toLocaleString()}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
