import { useMemo, useRef } from 'react';
import { Copy, Download, Image as ImageIcon } from 'lucide-react';
import { useT } from '@/i18n';
import { useToasts } from '@/stores/ops';
import { useSettings } from '@/stores/settings';
import { Artwork, elementColor, rarityColor } from '@/components/fx/Artwork';
import { RarityStars } from '@/components/ui/Primitives';
import { SLOTS, type Slot } from '@/data/types';
import { activeSets, slotOf, summaryText, type SummaryInput } from '@/lib/builder';
import { mainStatName, pieceName, slotLabel, weaponName, type TabCtx } from './shared';

const W = 1100;
const H = 620;

/** Loads an operator-hosted image for the canvas; resolves null on any failure so a sigil is drawn instead. */
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 4000);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

export function SummaryTab({ ctx }: { ctx: TabCtx }) {
  const t = useT();
  const toast = useToasts((s) => s.show);
  const assetBase = useSettings((s) => s.assetBase);
  const { character, owned } = ctx;
  const name = t.loc(character.name);
  const weapon = owned.weapon;
  const weaponInfo = weapon ? ctx.weapons.find((w) => w.id === weapon.itemId) : undefined;
  const sets = useMemo(() => activeSets(owned.artifacts, ctx.pieces), [owned.artifacts, ctx.pieces]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const bySlot = new Map<Slot, (typeof owned.artifacts)[number]>();
  for (const a of owned.artifacts) {
    const s = slotOf(a.slot);
    if (s) bySlot.set(s, a);
  }

  const input: SummaryInput = {
    name,
    id: character.id,
    level: owned.level,
    constellation: owned.constellation,
    talents: owned.talents ? { normal: owned.talents.normal.level, skill: owned.talents.skill.level, burst: owned.talents.burst.level } : null,
    weapon: weapon ? `${weaponName(ctx, t, weapon.itemId)} Lv${weapon.level} R${weapon.refinement}` : null,
    artifacts: SLOTS.flatMap((s) => {
      const a = bySlot.get(s);
      return a ? [{ slot: slotLabel(t, s), label: `${pieceName(ctx, t, a.itemId)} +${a.level - 1} · ${mainStatName(ctx, t, a.itemId, a.mainPropId)}` }] : [];
    }),
  };
  const text = summaryText(input, { level: t('common.level'), talents: t('characters.talents'), weapon: t('characters.weapon'), artifacts: t('characters.artifacts'), none: t('builder.none') });

  const fail = () => toast({ tone: 'error', title: t('builder.copyFailed'), body: '' });

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ tone: 'success', title: t('builder.copied'), body: name });
    } catch {
      fail();
    }
  };

  /** Draws the card; remote images are used only when an asset base is configured and CORS allows it. */
  const render = async (): Promise<HTMLCanvasElement> => {
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('canvas');
    const accent = elementColor(character.element);
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0d1330');
    bg.addColorStop(1, '#050816');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = `${accent}22`;
    g.fillRect(0, 0, 320, H);

    const img = async (icon: string | undefined | null) => (assetBase && icon ? loadImage(`${assetBase}/${icon}.png`) : null);
    const drawIcon = (image: HTMLImageElement | null, x: number, y: number, size: number, color: string, label: string) => {
      g.save();
      g.beginPath();
      g.roundRect(x, y, size, size, 14);
      g.clip();
      g.fillStyle = `${color}33`;
      g.fillRect(x, y, size, size);
      if (image) g.drawImage(image, x, y, size, size);
      else {
        g.fillStyle = color;
        g.font = `600 ${Math.round(size * 0.34)}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(label.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase(), x + size / 2, y + size / 2);
      }
      g.restore();
      g.strokeStyle = `${color}88`;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(x, y, size, size, 14);
      g.stroke();
    };

    const [portrait, weaponImg, ...relicImgs] = await Promise.all([
      img(character.icon),
      img(weaponInfo?.icon),
      ...SLOTS.map((s) => {
        const a = bySlot.get(s);
        return img(a ? ctx.pieces.get(a.itemId)?.piece.icon : null);
      }),
    ]);

    drawIcon(portrait, 40, 40, 240, accent, name);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#f4f0e6';
    g.font = '600 34px sans-serif';
    g.fillText(name, 40, 330);
    g.fillStyle = '#c9b27a';
    g.font = '24px sans-serif';
    g.fillText(`Lv ${owned.level} · C${owned.constellation}`, 40, 368);
    if (owned.talents) {
      g.fillStyle = '#a9c8ec';
      g.fillText(`${owned.talents.normal.level} / ${owned.talents.skill.level} / ${owned.talents.burst.level}`, 40, 406);
    }
    if (weapon) {
      drawIcon(weaponImg, 40, 440, 110, rarityColor(weaponInfo?.rarity ?? 4), weaponName(ctx, t, weapon.itemId));
      g.fillStyle = '#f4f0e6';
      g.font = '600 20px sans-serif';
      g.fillText(weaponName(ctx, t, weapon.itemId).slice(0, 22), 166, 480);
      g.fillStyle = '#c9b27a';
      g.font = '18px sans-serif';
      g.fillText(`Lv${weapon.level} · R${weapon.refinement}`, 166, 508);
    }

    SLOTS.forEach((s, i) => {
      const a = bySlot.get(s);
      const x = 360 + (i % 2) * 360;
      const y = 40 + Math.floor(i / 2) * 150;
      g.fillStyle = '#ffffff0d';
      g.beginPath();
      g.roundRect(x, y, 340, 130, 16);
      g.fill();
      g.fillStyle = '#7f8aa6';
      g.font = '16px sans-serif';
      g.fillText(slotLabel(t, s), x + 130, y + 32);
      if (a) {
        const piece = ctx.pieces.get(a.itemId);
        drawIcon(relicImgs[i], x + 14, y + 16, 98, rarityColor(piece?.piece.rarity ?? 5), pieceName(ctx, t, a.itemId));
        g.fillStyle = '#f4f0e6';
        g.font = '600 18px sans-serif';
        g.fillText(pieceName(ctx, t, a.itemId).slice(0, 24), x + 130, y + 62);
        g.fillStyle = '#c9b27a';
        g.font = '16px sans-serif';
        g.fillText(`+${a.level - 1} · ${mainStatName(ctx, t, a.itemId, a.mainPropId)}`.slice(0, 30), x + 130, y + 90);
      } else {
        g.fillStyle = '#7f8aa6';
        g.font = '18px sans-serif';
        g.fillText(`+ ${t('builder.slotEmpty')}`, x + 130, y + 70);
      }
    });
    g.fillStyle = '#c9b27a';
    g.font = '600 20px sans-serif';
    g.fillText(sets.map((s) => `${t.loc(s.set.name)} ×${s.count}`).join('   ·   ').slice(0, 70), 360, 560);
    return canvas;
  };

  const toBlob = (canvas: HTMLCanvasElement) =>
    new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/png'));

  const copyImage = async () => {
    try {
      const blob = await toBlob(await render());
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ tone: 'success', title: t('builder.copied'), body: name });
    } catch {
      fail();
    }
  };

  const saveImage = async () => {
    try {
      const blob = await toBlob(await render());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${character.key || character.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      fail();
    }
  };

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow">{t('builder.summaryTitle')}</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={copyText}>
            <Copy size={15} /> {t('builder.copyText')}
          </button>
          <button className="btn btn-ghost" onClick={copyImage}>
            <ImageIcon size={15} /> {t('builder.copyImage')}
          </button>
          <button className="btn btn-primary" onClick={saveImage}>
            <Download size={15} /> {t('builder.saveImage')}
          </button>
        </div>
      </div>

      <div className="grid gap-5 rounded-2xl border border-line bg-abyss/50 p-4 md:grid-cols-[220px_1fr]" style={{ backgroundImage: `radial-gradient(90% 60% at 0% 0%, ${elementColor(character.element)}22, transparent 70%)` }}>
        <div className="flex flex-col items-center gap-3 text-center md:items-start md:text-left">
          <Artwork icon={character.icon} name={character.name.en} element={character.element} rarity={character.rarity} size={160} rounded="rounded-3xl" />
          <div className="font-display text-xl text-ivory">{name}</div>
          <RarityStars rarity={character.rarity} size={12} />
          <div className="font-mono text-sm text-gold">
            Lv {owned.level} · C{owned.constellation}
          </div>
          {owned.talents && (
            <div className="font-mono text-xs text-mist">
              {owned.talents.normal.level} / {owned.talents.skill.level} / {owned.talents.burst.level}
            </div>
          )}
          {weapon && (
            <div className="flex items-center gap-3 text-left">
              <Artwork icon={weaponInfo?.icon} name={weaponName(ctx, t, weapon.itemId)} rarity={weaponInfo?.rarity} size={56} rounded="rounded-xl" />
              <div className="min-w-0">
                <div className="truncate text-sm text-ivory">{weaponName(ctx, t, weapon.itemId)}</div>
                <div className="font-mono text-[11px] text-dim">
                  Lv{weapon.level} · R{weapon.refinement}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="space-y-4">
          <ul className="grid gap-3 sm:grid-cols-2">
            {SLOTS.map((s) => {
              const a = bySlot.get(s);
              const info = a ? ctx.pieces.get(a.itemId) : undefined;
              return (
                <li key={s} className="flex items-center gap-3 rounded-xl border border-line bg-white/[0.03] p-2.5">
                  <Artwork icon={info?.piece.icon} name={a ? pieceName(ctx, t, a.itemId) : slotLabel(t, s)} rarity={info?.piece.rarity ?? 0} size={52} rounded="rounded-xl" />
                  <div className="min-w-0">
                    <div className="text-[11px] text-dim">{slotLabel(t, s)}</div>
                    {a ? (
                      <>
                        <div className="truncate text-sm text-ivory">{pieceName(ctx, t, a.itemId)}</div>
                        <div className="truncate font-mono text-[11px] text-gold">
                          +{a.level - 1} · {mainStatName(ctx, t, a.itemId, a.mainPropId)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-dim">+ {t('builder.slotEmpty')}</div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {sets.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {sets.map((s) => (
                <li key={s.set.id} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold">
                  {t.loc(s.set.name)} · {t('builder.pieces', { n: s.count })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-pale/10 bg-abyss/80 p-3 font-mono text-[12px] leading-relaxed text-pale">{text}</pre>
      <canvas ref={canvasRef} className="hidden" aria-hidden />
    </section>
  );
}
