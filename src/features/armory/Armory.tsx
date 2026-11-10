import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useT } from '@/i18n';
import { PageHeader, Segmented } from '@/components/ui/Primitives';
import { ArtifactForge } from './ArtifactForge';
import { WeaponForge } from './WeaponForge';

export default function Armory() {
  const t = useT();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'weapon' | 'artifact'>(params.get('set') ? 'artifact' : 'weapon');
  return (
    <>
      <PageHeader
        eyebrow={t('armory.eyebrow')}
        title={t('armory.title')}
        actions={<Segmented label="armory-tab" value={tab} onChange={setTab} options={[{ value: 'weapon', label: t('armory.weaponTab') }, { value: 'artifact', label: t('armory.artifactTab') }]} />}
      />
      {tab === 'weapon' ? <WeaponForge initial={Number(params.get('weapon')) || null} initialType={params.get('type')} equipTo={Number(params.get('equip')) || null} /> : <ArtifactForge initial={Number(params.get('set')) || null} />}
    </>
  );
}

// ------------------------------------------------------------------ weapons: see WeaponForge.tsx
