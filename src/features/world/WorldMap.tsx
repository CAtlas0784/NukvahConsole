import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Minus, Plus, RotateCcw, Search } from 'lucide-react';
import { useT } from '@/i18n';
import { useCatalog } from '@/data/catalog';
import { SkeletonGrid } from '@/components/ui/Primitives';
import type { TeleportKind, TeleportPoint } from '@/data/types';
import { normalize } from '@/lib/search';
import { boundsOf, checkPoint, countChecks, landingOf as landing, project, type PointCheck, type ServerPoint } from '@/lib/worldMap';

export const KIND_COLOR: Record<TeleportKind, string> = {
  statue: '#e2c27d',
  waypoint: '#7ef0ff',
  domain: '#ff8a5c',
  virtual: '#b48cff',
  'scene-jump': '#9ed65b',
  other: '#8f97a8',
};
const KINDS = Object.keys(KIND_COLOR) as TeleportKind[];

export const pointKey = (p: TeleportPoint) => `${p.sceneId}:${p.pointId}`;

/** Coordinate fallback for points the server does not confirm: slightly above the point's landing position. */
export const landingOf = landing;

export const CHECK_COLOR: Record<PointCheck, string> = { verified: 'text-ok', moved: 'text-warn', missing: 'text-danger', unchecked: 'text-dim' };

export function pointTitle(p: TeleportPoint, loc: (v: { en: string; th?: string }) => string): string {
  const area = p.area ? loc(p.area) : null;
  const base = `${p.kind} #${p.pointId}`;
  return area ? `${area} · ${base}` : base;
}

/**
 * Teleport points of one scene drawn by their real coordinates (X right, Z up), taken from the scene
 * point files the catalog is built from. No map imagery is bundled, so this is a coordinate map:
 * accurate positions, no terrain. Picking a point fills the teleport form; nothing is sent from here.
 */
export function WorldMap({
  sceneId,
  selected,
  onPick,
  server,
}: {
  sceneId: number | null;
  selected: string | null;
  onPick: (point: TeleportPoint) => void;
  /** The server's own points for this scene (connected); undefined = not checked. */
  server?: Map<number, ServerPoint>;
}) {
  const t = useT();
  const teleports = useCatalog('teleports');
  const [kinds, setKinds] = useState<Set<TeleportKind>>(() => new Set(KINDS.filter((k) => k !== 'other')));
  const [query, setQuery] = useState('');
  const [view, setView] = useState({ zoom: 1, cx: 0.5, cy: 0.5 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const inScene = useMemo(() => (teleports.data ?? []).filter((p) => p.sceneId === sceneId), [teleports.data, sceneId]);
  const bounds = useMemo(() => boundsOf(inScene), [inScene]);
  const checks = useMemo(() => countChecks(inScene, server), [inScene, server]);
  const visible = useMemo(() => {
    const q = normalize(query);
    return inScene.filter(
      (p) =>
        kinds.has(p.kind) &&
        (!q ||
          String(p.pointId) === q ||
          p.dungeonIds.some((d) => String(d).startsWith(q)) ||
          normalize(`${p.area?.en ?? ''} ${p.area?.th ?? ''} ${p.kind} ${p.type}`).includes(q)),
    );
  }, [inScene, kinds, query]);

  if (!teleports.data) return <SkeletonGrid count={1} className="h-80" />;

  const counts = new Map<TeleportKind, number>();
  for (const p of inScene) counts.set(p.kind, (counts.get(p.kind) ?? 0) + 1);

  // Square viewport in map units, zoomed and centred on (cx, cy) as fractions of the bounds.
  const size = 1000;
  const toSvg = (p: TeleportPoint) => (bounds ? project(p.pos, bounds, size) : { x: 0, y: 0 });
  const vw = size / view.zoom;
  const vx = view.cx * size - vw / 2;
  const vy = view.cy * size - vw / 2;
  const r = Math.max(2.5, 7 / Math.sqrt(view.zoom));

  const zoomBy = (factor: number) => setView((v) => ({ ...v, zoom: Math.min(40, Math.max(1, v.zoom * factor)) }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label={t('world.mapKinds')}>
          {KINDS.map((k) => (
            <button
              key={k}
              className="chip"
              aria-pressed={kinds.has(k)}
              onClick={() =>
                setKinds((s) => {
                  const next = new Set(s);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                })
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[k] }} />
              {t.dyn(`world.kind.${k}`)} <span className="font-mono text-[10px] opacity-70">{counts.get(k) ?? 0}</span>
            </button>
          ))}
        </div>
        {inScene.length === 0 ? (
          <div className="grid h-72 place-items-center rounded-2xl border border-line bg-abyss/60 p-6 text-center text-sm text-dim">{t('world.mapNoPoints', { id: sceneId ?? '—' })}</div>
        ) : (
          <div className="relative overflow-hidden rounded-2xl border border-cyan/20 bg-[radial-gradient(circle_at_50%_40%,rgba(126,240,255,0.06),transparent_70%),#060a18]">
            <svg
              ref={svgRef}
              viewBox={`${vx} ${vy} ${vw} ${vw}`}
              className="block aspect-square max-h-[560px] w-full cursor-grab touch-none active:cursor-grabbing"
              role="img"
              aria-label={t('world.map')}
              onWheel={(e) => zoomBy(e.deltaY < 0 ? 1.25 : 0.8)}
              onPointerDown={(e) => {
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                const box = svgRef.current?.getBoundingClientRect();
                if (!d || !box) return;
                const scale = 1 / (box.width * view.zoom);
                setView((v) => ({ ...v, cx: d.cx - (e.clientX - d.x) * scale, cy: d.cy - (e.clientY - d.y) * scale }));
              }}
              onPointerUp={() => (drag.current = null)}
            >
              <g stroke="#7ef0ff" strokeOpacity="0.06" strokeWidth={1 / view.zoom}>
                {Array.from({ length: 11 }, (_, i) => (
                  <g key={i}>
                    <line x1={i * 100} y1={0} x2={i * 100} y2={size} />
                    <line x1={0} y1={i * 100} x2={size} y2={i * 100} />
                  </g>
                ))}
              </g>
              {visible.map((p) => {
                const at = toSvg(p);
                const key = pointKey(p);
                const isSel = key === selected;
                return (
                  <circle
                    key={key}
                    cx={at.x}
                    cy={at.y}
                    r={isSel ? r * 1.9 : r}
                    fill={KIND_COLOR[p.kind]}
                    fillOpacity={isSel ? 1 : 0.8}
                    stroke={isSel ? '#fffaf0' : '#060a18'}
                    strokeWidth={(isSel ? 2 : 0.8) / Math.sqrt(view.zoom)}
                    className="cursor-pointer"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onPick(p)}
                  >
                    <title>{`${pointTitle(p, t.loc)} (${p.pos.x.toFixed(0)}, ${p.pos.y.toFixed(0)}, ${p.pos.z.toFixed(0)})`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="absolute top-3 right-3 flex flex-col gap-1.5">
              <button className="btn btn-ghost btn-sm" onClick={() => zoomBy(1.5)} aria-label={t('world.zoomIn')}>
                <Plus size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => zoomBy(1 / 1.5)} aria-label={t('world.zoomOut')}>
                <Minus size={14} />
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setView({ zoom: 1, cx: 0.5, cy: 0.5 })} aria-label={t('world.resetView')}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-dim">{t('world.mapNote')}</p>
        {server && inScene.length > 0 && (
          <p className="mt-1 text-xs text-mist">
            {t('world.serverCheck', { verified: checks.verified, total: inScene.length })}
            {checks.missing + checks.moved > 0 && <span className="text-warn"> · {t('world.serverCheckMissing', { n: checks.missing + checks.moved })}</span>}
          </p>
        )}
      </div>
      <div className="min-w-0">
        <div className="relative mb-3">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-dim" />
          <input className="field pl-9" placeholder={t('world.mapSearch')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('world.mapSearch')} />
        </div>
        <div className="mb-2 text-xs text-dim">{t('world.mapShown', { n: visible.length, total: inScene.length })}</div>
        <ul className="scroll-fade max-h-[520px] space-y-1 overflow-y-auto py-1 pr-1" role="listbox" aria-label={t('world.map')}>
          {visible.slice(0, 300).map((p) => {
            const key = pointKey(p);
            return (
              <li key={key}>
                <button
                  role="option"
                  aria-selected={key === selected}
                  onClick={() => onPick(p)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${key === selected ? 'bg-cyan/10 text-ivory ring-1 ring-cyan/40' : 'text-mist hover:bg-white/[0.03]'}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: KIND_COLOR[p.kind] }} />
                  <span className="min-w-0 flex-1 truncate">{p.area ? t.loc(p.area) : t.dyn(`world.kind.${p.kind}`)}</span>
                  <span className="font-mono text-[10px] text-dim">
                    #{p.pointId}
                    {p.dungeonIds.length ? ` · D${p.dungeonIds[0]}` : ''}
                  </span>
                  {server &&
                    (checkPoint(p, server) === 'verified' ? (
                      <CheckCircle2 size={12} className="shrink-0 text-ok" aria-label={t('world.check.verified')} />
                    ) : (
                      <CircleAlert size={12} className="shrink-0 text-warn" aria-label={t.dyn(`world.check.${checkPoint(p, server)}`)} />
                    ))}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
