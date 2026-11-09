import { useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Copy, Lock, Minus, Plus, ShieldAlert, Sparkles, Unplug } from 'lucide-react';
import { useT } from '@/i18n';
import { ease } from '@/lib/motion';
import { elementColor, rarityColor } from '@/components/fx/Artwork';
import type { Denial } from '@/stores/session';

export function PageHeader({ eyebrow, title, lead, actions }: { eyebrow: string; title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="eyebrow mb-2 flex items-center gap-3">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-gold" />
          {eyebrow}
        </div>
        <h1 className="title-display text-gilded text-3xl leading-tight md:text-[2.4rem]">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-sm text-mist">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = '', corners = false, title, eyebrow, actions }: {
  children: ReactNode;
  className?: string;
  corners?: boolean;
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`panel ${corners ? 'panel-corners' : ''} ${className}`}>
      {(title || eyebrow || actions) && (
        <header className="flex items-center justify-between gap-3 pb-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="title-display truncate text-[0.95rem]">{title}</h2>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonGrid({ count = 12, className = 'h-40' }: { count?: number; className?: string }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full border border-line text-gold/80">{icon ?? <Sparkles size={22} />}</div>
      <div className="title-display text-base">{title}</div>
      {children && <div className="max-w-md text-sm text-mist">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 px-6 py-10 text-center">
      <AlertTriangle className="text-danger" />
      <div className="title-display">{t('states.errorTitle')}</div>
      <p className="max-w-lg text-sm text-mist">{error instanceof Error ? error.message : String(error)}</p>
      {onRetry && (
        <button className="btn btn-ghost btn-sm" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

/** Explains why an action is unavailable (preview, disconnected, unsupported, role). */
export function DenialNotice({ reason, role, compact = false }: { reason: Denial; role?: string | null; compact?: boolean }) {
  const t = useT();
  if (!reason) return null;
  const map = {
    preview: { icon: <Sparkles size={16} />, text: t('states.previewText'), tone: 'text-warn border-warn/30 bg-warn/5' },
    disconnected: { icon: <Unplug size={16} />, text: t('states.disconnectedText'), tone: 'text-pale border-pale/25 bg-pale/5' },
    unsupported: { icon: <Lock size={16} />, text: `${t('states.unsupportedTitle')} — ${t('states.unsupportedText')}`, tone: 'text-mist border-line bg-white/[0.02]' },
    role: { icon: <ShieldAlert size={16} />, text: t('states.permissionText', { role: role ?? '?' }), tone: 'text-danger border-danger/30 bg-danger/5' },
  }[reason];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border ${map.tone} ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}>
      <span className="mt-0.5 shrink-0">{map.icon}</span>
      <span>{map.text}</span>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  id?: string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min));
  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-pale/15 bg-abyss/60">
      <button type="button" className="px-2.5 text-mist hover:text-ivory disabled:opacity-30" onClick={() => onChange(clamp(value - step))} disabled={value <= min} aria-label={`Decrease ${label ?? ''}`}>
        <Minus size={14} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className="w-full min-w-0 bg-transparent py-2 text-center font-mono text-sm text-ivory outline-none"
        value={value}
        min={min}
        max={max}
        aria-label={label}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
      <button type="button" className="px-2.5 text-mist hover:text-ivory disabled:opacity-30" onClick={() => onChange(clamp(value + step))} disabled={value >= max} aria-label={`Increase ${label ?? ''}`}>
        <Plus size={14} />
      </button>
    </div>
  );
}

export function RangeField({ label, value, onChange, min, max, marks }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; marks?: number[] }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="label mb-0">{label}</span>
        <span className="font-mono text-lg text-gold-bright">{value}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/5" />
        <div className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-gold-deep via-gold to-gold-bright shadow-[0_0_12px_rgba(226,194,125,0.5)]" style={{ width: `${pct}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rotate-45 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-gold-bright [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rotate-45 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-[3px] [&::-webkit-slider-thumb]:bg-gold-bright [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(247,228,176,0.8)]"
        />
      </div>
      {marks && (
        <div className="mt-1 flex justify-between font-mono text-[10px] text-dim">
          {marks.map((m) => (
            <button key={m} type="button" className="hover:text-gold" onClick={() => onChange(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-abyss/50 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={active}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${active ? 'text-abyss' : 'text-mist hover:text-ivory'}`}
          >
            {active && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-lg bg-gradient-to-b from-gold-bright to-gold" transition={{ duration: 0.3, ease }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RarityStars({ rarity, size = 11 }: { rarity: number; size?: number }) {
  if (!rarity) return null;
  return (
    <span className="inline-flex items-center gap-[1px]" aria-label={`${rarity} star`} style={{ color: rarityColor(rarity) }}>
      {Array.from({ length: rarity }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 10 10" aria-hidden>
          <path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

export function ElementDot({ element, label }: { element: string; label?: string }) {
  const color = elementColor(element);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color }}>
      <span className="h-2 w-2 rotate-45 rounded-[2px]" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      {label}
    </span>
  );
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          // clipboard blocked: nothing else to do
        }
      }}
      aria-label={`${t('common.copy')} ${label ?? value}`}
    >
      {done ? <Check size={14} className="text-ok" /> : <Copy size={14} />}
      {label && <span>{done ? t('common.copied') : label}</span>}
    </button>
  );
}

export function IdTag({ id }: { id: number | string }) {
  return <span className="rounded-md border border-pale/15 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-pale">#{id}</span>;
}

export function Stat({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold tracking-[0.12em] text-dim uppercase">{label}</div>
      <div className={`mt-1 truncate font-display text-2xl ${accent ? 'text-gilded' : 'text-ivory'}`}>{value}</div>
    </div>
  );
}
