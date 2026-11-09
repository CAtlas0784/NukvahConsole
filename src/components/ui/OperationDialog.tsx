import { useState, type ReactNode } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from './Overlay';
import { DenialNotice } from './Primitives';
import { useT } from '@/i18n';
import { useCapability, useConnection, useSession } from '@/stores/session';
import { runOperation, type OpStatus } from '@/stores/ops';
import { API_PREFIX, type Connection } from '@/api/client';
import type { Capability } from '@/api/nukva';

export interface OperationSpec<T> {
  title: string;
  capability: Capability;
  action: string;
  summary: string;
  lines: { label: string; value: ReactNode }[];
  request: { method: 'POST' | 'PATCH'; path: string; body: unknown };
  run: (conn: Connection, uid: number) => Promise<T>;
  judge?: (result: T) => { status: OpStatus; detail?: string };
  requiresPlayer?: boolean;
  /** Overrides the success toast title (e.g. raw commands report execution, not outcome). */
  successLabel?: string;
}

/**
 * Step 6–8 of the workflow: preview the exact request, confirm, then report the server's verdict.
 * The confirm button is disabled unless the link is live and the capability/role allow it.
 */
export function OperationDialog<T>({ spec, onClose, onDone }: { spec: OperationSpec<T> | null; onClose: () => void; onDone?: (result: T) => void }) {
  const t = useT();
  const conn = useConnection();
  const uid = useSession((s) => s.uid);
  const cap = useCapability(spec?.capability ?? 'players.read');
  const [busy, setBusy] = useState(false);
  const needsPlayer = spec?.requiresPlayer !== false;
  const blocked = !cap.allowed || (needsPlayer && !uid) || !conn;

  const confirm = async () => {
    if (!spec || !conn || blocked) return;
    setBusy(true);
    const outcome = await runOperation({
      action: spec.action,
      uid,
      summary: spec.summary,
      run: () => spec.run(conn, uid ?? 0),
      judge: spec.judge,
      labels: { success: spec.successLabel ?? t('op.success'), failed: t('op.failed'), partial: t('op.partial') },
    });
    setBusy(false);
    if (outcome.ok && outcome.result !== undefined) onDone?.(outcome.result);
    if (outcome.ok) onClose();
  };

  return (
    <Modal
      open={!!spec}
      onClose={() => !busy && onClose()}
      eyebrow={t('op.previewTitle')}
      title={spec?.title ?? ''}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" onClick={confirm} disabled={blocked || busy} data-autofocus>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {busy ? t('op.applying') : cap.reason === 'preview' ? t('status.connectToApply') : t('op.confirm')}
          </button>
        </>
      }
    >
      {spec && (
        <div className="space-y-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-sm">
            <dt className="text-mist">{t('op.target')}</dt>
            <dd className="font-mono text-ivory">{needsPlayer ? (uid ? `UID ${uid}` : '—') : 'server'}</dd>
            {spec.lines.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-mist">{line.label}</dt>
                <dd className="text-ivory">{line.value}</dd>
              </div>
            ))}
          </dl>
          <div>
            <div className="label">{t('op.request')}</div>
            <p className="mb-2 text-xs text-dim">{t('op.willSend')}</p>
            <pre className="max-h-56 overflow-auto rounded-xl border border-pale/10 bg-abyss/80 p-3 font-mono text-[12px] leading-relaxed text-pale">
              {`${spec.request.method} ${API_PREFIX}${spec.request.path.replace('{uid}', String(uid ?? '{uid}'))}\n${JSON.stringify(spec.request.body, null, 2)}`}
            </pre>
          </div>
          {!cap.allowed && <DenialNotice reason={cap.reason} role={cap.role} />}
          {cap.allowed && needsPlayer && !uid && (
            <div className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-warn">{t('states.needPlayer')}</div>
          )}
          <p className="text-xs text-dim">{t('op.verifiedNote')}</p>
        </div>
      )}
    </Modal>
  );
}
