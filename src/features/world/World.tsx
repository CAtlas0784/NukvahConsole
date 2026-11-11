import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { Bookmark, Crosshair, Globe2, MapPin, Orbit, Search, Skull, Trash2, Wand2 } from 'lucide-react';
import { useT } from '@/i18n';
import { byId, useCatalog } from '@/data/catalog';
import { api } from '@/api/nukva';
import { usePlayer, useServerScenePoints } from '@/api/hooks';
import { useSession } from '@/stores/session';
import { usePresets } from '@/stores/presets';
import { Orrery } from '@/components/fx/Orrery';
import { Artwork } from '@/components/fx/Artwork';
import { OperationDialog, type OperationSpec } from '@/components/ui/OperationDialog';
import { IdTag, Panel, RangeField, SkeletonGrid, Stepper } from '@/components/ui/Primitives';
import type { Scene, TeleportPoint } from '@/data/types';
import { WorldMap, landingOf, pointKey, pointTitle, CHECK_COLOR } from './WorldMap';
import { checkPoint, coordProblem } from '@/lib/worldMap';
import { normalize } from '@/lib/search';
import { ease } from '@/lib/motion';

const SCENE_TYPES = ['world', 'dungeon', 'room', 'hall_world', 'home_world', 'home_room'];

function sceneTitle(scene: Scene, t: ReturnType<typeof useT>) {
  if (scene.id === 3) return t('world.mainWorld');
  if (scene.name) return t.loc(scene.name);
  return scene.script ? scene.script.replace(/_LevelStreaming$/, '').replace(/([a-z])([A-Z])/g, '$1 $2') : `Scene ${scene.id}`;
}

export default function World() {
  const t = useT();
  const [params] = useSearchParams();
  const uid = useSession((s) => s.uid);
  const status = useSession((s) => s.status);
  const player = usePlayer(uid);
  const scenes = useCatalog('scenes');
  const monsters = useCatalog('monsters');
  const bookmarks = usePresets((s) => s.bookmarks);
  const addBookmark = usePresets((s) => s.addBookmark);
  const removeBookmark = usePresets((s) => s.removeBookmark);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [spec, setSpec] = useState<OperationSpec<any> | null>(null);

  // World level
  const [wl, setWl] = useState(8);
  useEffect(() => {
    if (player.data) setWl(player.data.worldLevel);
  }, [player.data]);

  // Teleport
  const [sceneQuery, setSceneQuery] = useState('');
  const [sceneType, setSceneType] = useState('world');
  const [sceneId, setSceneId] = useState<number | null>(Number(params.get('scene')) || 3);
  const [coords, setCoords] = useState({ x: '', y: '', z: '' });
  const [bookmarkName, setBookmarkName] = useState('');
  const [pickedPoint, setPickedPoint] = useState<TeleportPoint | null>(null);
  const pickPoint = (p: TeleportPoint) => {
    const at = landingOf(p);
    setPickedPoint(p);
    setSceneId(p.sceneId);
    setCoords({ x: String(at.x), y: String(at.y), z: String(at.z) });
    document.getElementById('teleport-form')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Spawn
  const [monsterQuery, setMonsterQuery] = useState('');
  const [monsterId, setMonsterId] = useState<number | null>(Number(params.get('monster')) || null);
  const [amount, setAmount] = useState(1);
  const [level, setLevel] = useState(90);

  useEffect(() => {
    const s = Number(params.get('scene'));
    if (s && scenes.data) {
      setSceneId(s);
      const sc = byId(scenes.data).get(s);
      if (sc) setSceneType(sc.type);
    }
  }, [params, scenes.data]);
  useEffect(() => {
    const m = Number(params.get('monster'));
    if (m) setMonsterId(m);
  }, [params]);
  useEffect(() => {
    if (location.hash === '#world-level') document.getElementById('world-level')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sceneList = useMemo(() => {
    const q = normalize(sceneQuery);
    return (scenes.data ?? []).filter((s) => (q ? true : s.type === sceneType) && (!q || String(s.id).startsWith(q) || normalize(`${s.name?.en ?? ''} ${s.name?.th ?? ''} ${s.script ?? ''}`).includes(q))).slice(0, 200);
  }, [scenes.data, sceneQuery, sceneType]);
  const monsterList = useMemo(() => {
    const q = normalize(monsterQuery);
    return (monsters.data ?? []).filter((m) => !q || String(m.id).startsWith(q) || normalize(`${m.name.en} ${m.name.th ?? ''} ${m.key}`).includes(q)).slice(0, 120);
  }, [monsters.data, monsterQuery]);

  const scene = sceneId ? byId(scenes.data).get(sceneId) : undefined;
  const monster = monsterId ? byId(monsters.data).get(monsterId) : undefined;
  const parsed = ['x', 'y', 'z'].map((k) => coords[k as 'x'].trim());
  const hasCoords = parsed.every((v) => v !== '' && Number.isFinite(Number(v)));
  const coordIssue = coordProblem(coords);
  const partialCoords = coordIssue !== null;
  const serverPoints = useServerScenePoints(sceneId);
  // A picked point is sent by id only when the server confirms it and the fields still hold its landing spot.
  const pickedLanding = pickedPoint ? landingOf(pickedPoint) : null;
  const pointCheck = pickedPoint && pickedPoint.sceneId === sceneId ? checkPoint(pickedPoint, serverPoints.data) : null;
  const byPoint =
    pointCheck === 'verified' && pickedLanding && coords.x === String(pickedLanding.x) && coords.y === String(pickedLanding.y) && coords.z === String(pickedLanding.z);
  const maxEntities = status?.limits.maxEntities ?? 20;

  return (
    <div className="relative overflow-x-clip">
      {/* Distinct atmosphere for World Authority */}
      <div className="pointer-events-none fixed inset-0 -z-[5] bg-[radial-gradient(900px_600px_at_70%_20%,rgba(142,127,224,0.20),transparent_60%),radial-gradient(800px_600px_at_20%_90%,rgba(126,240,255,0.10),transparent_60%)]" aria-hidden />
      <div className="pointer-events-none absolute -top-40 right-[-180px] -z-[1] opacity-30" aria-hidden>
        <Orrery size={760} />
      </div>

      <header className="mb-9">
        <div className="mb-2 flex items-center gap-3 font-display text-[0.68rem] tracking-[0.32em] text-cyan uppercase">
          <Orbit size={13} /> {t('world.eyebrow')}
        </div>
        <h1 className="font-display text-[2.6rem] leading-tight tracking-wide text-ivory md:text-5xl">
          <span className="bg-gradient-to-r from-ivory via-pale to-violet bg-clip-text text-transparent">{t('world.title')}</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-mist">{t('world.lead')}</p>
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[400px_1fr]">
        {/* World level */}
        <Panel corners className="border-violet/25 p-6" eyebrow={<span className="text-violet">{t('world.worldLevel')}</span>}>
          <div id="world-level" className="flex flex-col items-center">
            <div className="relative h-56 w-56">
              <svg viewBox="-110 -110 220 220" className="absolute inset-0" aria-hidden>
                <circle r="100" fill="none" stroke="#8e7fe0" strokeOpacity="0.25" />
                <circle r="78" fill="none" stroke="#7ef0ff" strokeOpacity="0.15" strokeDasharray="2 5" />
              </svg>
              {Array.from({ length: 10 }, (_, n) => {
                const angle = (n / 10) * Math.PI * 2 - Math.PI / 2;
                const x = Math.cos(angle) * 100;
                const y = Math.sin(angle) * 100;
                const active = n === wl;
                return (
                  <button
                    key={n}
                    onClick={() => setWl(n)}
                    aria-pressed={active}
                    aria-label={`${t('world.worldLevel')} ${n}`}
                    className={`absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border font-display text-sm transition-all ${active ? 'border-cyan bg-cyan/20 text-ivory shadow-[0_0_18px_rgba(126,240,255,0.6)]' : n < wl ? 'border-violet/50 bg-violet/10 text-pale' : 'border-line bg-abyss/70 text-dim hover:border-violet/50'}`}
                    style={{ left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)` }}
                  >
                    {n}
                  </button>
                );
              })}
              <motion.div key={wl} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease }} className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="font-display text-6xl text-ivory drop-shadow-[0_0_20px_rgba(142,127,224,0.6)]">{wl}</div>
                  <div className="mt-1 text-[10px] tracking-[0.3em] text-dim uppercase">{player.data ? `now ${player.data.worldLevel}` : 'WL'}</div>
                </div>
              </motion.div>
            </div>
            <button
              className="btn btn-primary mt-6 w-full"
              disabled={player.data?.worldLevel === wl}
              onClick={() =>
                setSpec({
                  title: t('world.setWorldLevel'),
                  capability: 'world.level',
                  action: 'world.level',
                  summary: `WL ${player.data?.worldLevel ?? '?'} → ${wl}`,
                  lines: [{ label: t('world.worldLevel'), value: `${player.data?.worldLevel ?? '?'} → ${wl}` }],
                  request: { method: 'POST', path: '/players/{uid}/world-level', body: { worldLevel: wl } },
                  run: (conn, target) => api.setWorldLevel(conn, target, wl),
                })
              }
            >
              <Wand2 size={15} /> {t('world.setWorldLevel')}
            </button>
          </div>
        </Panel>

        {/* Teleport */}
        <Panel className="p-6" eyebrow={<span className="text-cyan">{t('world.teleport')}</span>}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="min-w-0">
              <div className="relative mb-3">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
                <input className="field pl-9" placeholder={`${t('world.scene')} — ${t('common.id')} / name`} value={sceneQuery} onChange={(e) => setSceneQuery(e.target.value)} aria-label={t('world.scene')} />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {SCENE_TYPES.map((type) => (
                  <button key={type} className="chip" aria-pressed={!sceneQuery && sceneType === type} onClick={() => { setSceneType(type); setSceneQuery(''); }}>
                    {type.replace('_', ' ')}
                  </button>
                ))}
              </div>
              {!scenes.data ? (
                <SkeletonGrid count={6} className="h-10" />
              ) : (
                <ul className="scroll-fade max-h-80 space-y-1 overflow-y-auto py-2" role="listbox" aria-label={t('world.scene')}>
                  {sceneList.map((s) => (
                    <li key={s.id}>
                      <button role="option" aria-selected={sceneId === s.id} onClick={() => setSceneId(s.id)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${sceneId === s.id ? 'bg-cyan/10 text-ivory ring-1 ring-cyan/40' : 'text-mist hover:bg-white/[0.03]'}`}>
                        <Globe2 size={14} className={sceneId === s.id ? 'text-cyan' : 'text-dim'} />
                        <span className="min-w-0 flex-1 truncate">{sceneTitle(s, t)}</span>
                        <IdTag id={s.id} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div id="teleport-form" className="space-y-4">
              {pickedPoint && pickedPoint.sceneId === sceneId && (
                <div className="rounded-xl border border-cyan/25 bg-cyan/[0.05] px-3 py-2 text-xs text-pale">
                  <div>{t('world.mapPicked', { name: pointTitle(pickedPoint, t.loc) })}</div>
                  {pointCheck && <div className={`mt-1 ${CHECK_COLOR[pointCheck]}`}>{t.dyn(`world.checkLong.${pointCheck}`)}</div>}
                </div>
              )}
              {player.data && typeof player.data.unlockedPoints === 'number' && (
                <p className="text-[11px] text-dim">{t('world.unlockedInfo', { scene: player.data.sceneId, unlocked: player.data.unlockedPoints, total: player.data.scenePoints ?? 0 })}</p>
              )}
              <div className="rounded-2xl border border-cyan/20 bg-cyan/[0.03] p-4">
                <div className="text-[11px] tracking-[0.16em] text-dim uppercase">{t('world.scene')}</div>
                <div className="mt-1 font-display text-lg text-ivory">{scene ? sceneTitle(scene, t) : '—'}</div>
                {scene && <div className="mt-1 font-mono text-xs text-dim">#{scene.id} · {scene.type} · {scene.script ?? '—'}</div>}
              </div>
              <div>
                <div className="label">{t('world.coordinates')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['x', 'y', 'z'] as const).map((axis) => (
                    <input key={axis} className="field font-mono text-sm" placeholder={axis.toUpperCase()} inputMode="decimal" value={coords[axis]} onChange={(e) => setCoords((c) => ({ ...c, [axis]: e.target.value.replace(/[^\d.-]/g, '') }))} aria-label={axis.toUpperCase()} />
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-dim">{t('world.coordinatesHint')}</p>
                {coordIssue && <p className="mt-1 text-xs text-warn">{t.dyn(`world.coordProblem.${coordIssue}`)}</p>}
                {player.data?.position && (
                  <button className="btn btn-quiet btn-sm mt-1 -ml-2" onClick={() => { const p = player.data!.position!; setCoords({ x: p.x.toFixed(2), y: p.y.toFixed(2), z: p.z.toFixed(2) }); setSceneId(player.data!.sceneId); }}>
                    <Crosshair size={13} /> {t('world.useCurrent')}
                  </button>
                )}
              </div>
              <button
                className="btn btn-primary w-full"
                disabled={!scene || partialCoords}
                onClick={() => {
                  if (!scene) return;
                  const body = byPoint && pickedPoint
                    ? { sceneId: scene.id, pointId: pickedPoint.pointId }
                    : hasCoords
                      ? { sceneId: scene.id, x: Number(coords.x), y: Number(coords.y), z: Number(coords.z) }
                      : { sceneId: scene.id };
                  setSpec({
                    title: t('world.teleportNow'),
                    capability: 'world.teleport',
                    action: 'world.teleport',
                    summary: `→ ${sceneTitle(scene, t)}${hasCoords ? ` (${coords.x}, ${coords.y}, ${coords.z})` : ''}`,
                    lines: [
                      { label: t('world.scene'), value: `${sceneTitle(scene, t)} (#${scene.id})` },
                      byPoint && pickedPoint
                        ? { label: t('world.destination'), value: t('world.destinationPoint', { id: pickedPoint.pointId }) }
                        : { label: t('world.coordinates'), value: hasCoords ? `${coords.x}, ${coords.y}, ${coords.z}` : t('world.defaultSpawn') },
                    ],
                    request: { method: 'POST', path: '/players/{uid}/teleport', body },
                    run: (conn, target) => api.teleport(conn, target, body),
                    judge: (r) => ({
                      status: 'success',
                      detail: r.position ? `scene ${r.sceneId} @ ${r.position.x.toFixed(1)}, ${r.position.y.toFixed(1)}, ${r.position.z.toFixed(1)}` : `scene ${r.sceneId}`,
                    }),
                  });
                }}
              >
                <MapPin size={15} /> {t('world.teleportNow')}
              </button>

              <div className="border-t border-line pt-4">
                <div className="label flex items-center gap-1.5">
                  <Bookmark size={12} /> {t('world.bookmarks')}
                </div>
                <form
                  className="mb-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!hasCoords || !scene || !bookmarkName.trim()) return;
                    addBookmark({ name: bookmarkName.trim(), sceneId: scene.id, x: Number(coords.x), y: Number(coords.y), z: Number(coords.z) });
                    setBookmarkName('');
                  }}
                >
                  <input className="field py-1.5 text-sm" placeholder={t('world.bookmarkName')} value={bookmarkName} onChange={(e) => setBookmarkName(e.target.value)} aria-label={t('world.bookmarkName')} />
                  <button className="btn btn-ghost btn-sm" disabled={!hasCoords || !bookmarkName.trim()} type="submit">
                    {t('common.save')}
                  </button>
                </form>
                {bookmarks.length === 0 ? (
                  <p className="text-xs text-dim">{t('world.noBookmarks')}</p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {bookmarks.map((b) => (
                      <li key={b.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                        <button className="min-w-0 flex-1 truncate text-left text-ivory" onClick={() => { setSceneId(b.sceneId); setCoords({ x: String(b.x), y: String(b.y), z: String(b.z) }); }}>
                          {b.name} <span className="font-mono text-[11px] text-dim">#{b.sceneId}</span>
                        </button>
                        <button className="text-dim hover:text-danger" onClick={() => removeBookmark(b.id)} aria-label={t('common.delete')}>
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Panel>

        {/* Teleport map */}
        <Panel className="p-6 xl:col-span-2" eyebrow={<span className="text-cyan">{t('world.map')}</span>}>
          <p className="-mt-1 mb-4 text-sm text-mist">{t('world.mapLead')}</p>
          {serverPoints.error ? <p className="mb-3 text-xs text-warn">{t('world.serverPointsFailed')}</p> : null}
          <WorldMap sceneId={sceneId} selected={pickedPoint ? pointKey(pickedPoint) : null} onPick={pickPoint} server={serverPoints.data} />
        </Panel>

        {/* Spawn */}
        <Panel className="p-6 xl:col-span-2" eyebrow={<span className="text-danger/90">{t('world.spawn')}</span>}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="min-w-0">
              <div className="relative mb-3">
                <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
                <input className="field pl-9" placeholder={`${t('world.monster')} — ${t('common.id')} / name`} value={monsterQuery} onChange={(e) => setMonsterQuery(e.target.value)} aria-label={t('world.monster')} />
              </div>
              {!monsters.data ? (
                <SkeletonGrid count={8} className="h-14" />
              ) : (
                <ul className="grid max-h-96 grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2 overflow-y-auto pr-1">
                  {monsterList.map((m) => (
                    <li key={m.id}>
                      <button onClick={() => setMonsterId(m.id)} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${monsterId === m.id ? 'border-danger/50 bg-danger/[0.07]' : 'border-line hover:border-danger/30'}`}>
                        <Artwork icon={m.icon} name={m.name.en} element={m.type === 'boss' ? 'pyro' : 'none'} size={38} rounded="rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ivory">{t.loc(m.name)}</div>
                          <div className="truncate font-mono text-[10px] text-dim">
                            {m.type} · {m.key}
                          </div>
                        </div>
                        <IdTag id={m.id} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-5">
              <div className="rounded-2xl border border-danger/20 bg-danger/[0.03] p-4">
                <div className="text-[11px] tracking-[0.16em] text-dim uppercase">{t('world.monster')}</div>
                <div className="mt-1 font-display text-lg text-ivory">{monster ? t.loc(monster.name) : '—'}</div>
                {monster && <div className="mt-1 font-mono text-xs text-dim">#{monster.id} · {monster.key}</div>}
              </div>
              <div>
                <div className="label">{t('common.amount')}</div>
                <div className="max-w-[160px]">
                  <Stepper value={amount} onChange={setAmount} min={1} max={maxEntities} label={t('common.amount')} />
                </div>
              </div>
              <RangeField label={t('common.level')} value={level} onChange={setLevel} min={1} max={200} marks={[1, 50, 90, 100, 150, 200]} />
              <p className="text-xs text-dim">{t('world.spawnNote')}</p>
              <button
                className="btn btn-danger w-full"
                disabled={!monster}
                onClick={() => {
                  if (!monster) return;
                  const body = { monsterId: monster.id, amount, level };
                  setSpec({
                    title: t('world.spawnNow'),
                    capability: 'world.spawn',
                    action: 'world.spawn',
                    summary: `${t.loc(monster.name)} ×${amount} Lv${level}`,
                    lines: [
                      { label: t('world.monster'), value: `${t.loc(monster.name)} (#${monster.id})` },
                      { label: t('common.amount'), value: String(amount) },
                      { label: t('common.level'), value: String(level) },
                    ],
                    request: { method: 'POST', path: '/players/{uid}/spawn', body },
                    run: (conn, target) => api.spawn(conn, target, body),
                    judge: (r: { spawned: number; success: boolean }) => (r.success ? { status: 'success', detail: `${r.spawned} spawned` } : { status: 'partial', detail: `${r.spawned}/${amount}` }),
                  });
                }}
              >
                <Skull size={15} /> {t('world.spawnNow')}
              </button>
            </div>
          </div>
        </Panel>
      </div>
      <OperationDialog spec={spec} onClose={() => setSpec(null)} onDone={() => player.refresh()} />
    </div>
  );
}
