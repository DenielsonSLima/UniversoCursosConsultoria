import { useEffect, useId, useRef, useState, useSyncExternalStore, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { NfseScope } from '../types/nfse.types';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import { nfseIndividualService } from '../individual/nfse-individual.service';
import type { NfseIndividualService } from '../individual/nfse-individual.types';
import { individualReason } from '../individual/nfse-individual.contract';
import NfseIndividualSnapshot from '../individual/NfseIndividualSnapshot';
import { formatNfseMoney } from '../components/nfse.presentation';
import { operationLabel } from './nfse-operation.contract';
import { batchCanIssue, createNfseBatchController, type NfseBatchInput, type NfseBatchItem } from './nfse-batch.core';
import type { NfseFiscalNotice } from './nfse-fiscal-notice';
import { useNfseBatchRealtime } from './useNfseBatchRealtime';
import '../individual/nfse-individual.css';
import '../fila/fiscal-review/nfse-fiscal-review.css';
import './nfse-batch.css';
interface Props { scope: NfseScope; items: readonly NfseBatchInput[]; onClose: () => void; onChanged: () => void;
  onNotice?: (notice: NfseFiscalNotice) => void; service?: NfseIndividualService; issueRequested?: boolean; onCancelOperation?: (item: NfseBatchItem) => void }
export default function NfseBatchEmissionModal({ scope, items, onClose, onChanged, onNotice, service = nfseIndividualService, issueRequested = false, onCancelOperation }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [controller] = useState(() => createNfseBatchController(scope, items, service, {
    getItem: key => window.sessionStorage.getItem(key), setItem: (key, value) => window.sessionStorage.setItem(key, value),
  }, { onChanged, onNotice }));
  useNfseBatchRealtime(scope, controller.signalChange, service === nfseIndividualService);
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => {
    controller.activate();
    let current = true;
    globalThis.queueMicrotask(() => { if (current) void (async () => {
      await controller.review();
      // Only the explicit Emitir action in the caller authorizes this chain.
      // StrictMode cleanup/unmount and uncertain reconciliation must never dispatch.
      if (current && issueRequested && !controller.getSnapshot().paused) await controller.issue();
    })(); });
    return () => { current = false; controller.dispose(); };
  }, [controller, issueRequested]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const expiries = view.items.flatMap(item => item.preview && Date.parse(item.preview.expiresAt) > Date.now() ? [Date.parse(item.preview.expiresAt)] : []);
    if (!expiries.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2_147_483_647, Math.max(1, Math.min(...expiries) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [view.items, clock, controller]);
  const refreshedExpiries = useRef(new Set<string>());
  useEffect(() => {
    if (view.busy || view.paused) return;
    const expired = view.items.filter(item => !item.dispatched && !item.uncertain && item.preview && Date.parse(item.preview.expiresAt) <= Date.now());
    const keys = expired.map(item => `${item.previewId}:${item.preview!.expiresAt}`);
    if (!keys.some(key => !refreshedExpiries.current.has(key))) return;
    keys.forEach(key => refreshedExpiries.current.add(key));
    void controller.review();
  }, [view.items, view.busy, view.paused, clock, controller]);
  const close = () => { if (!view.busy) onClose(); };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  const available = view.items.filter(item => batchCanIssue(item)).length;
  const uncertain = view.items.some(item => item.uncertain);
  const authorized = view.items.filter(item => item.result?.state === 'AUTHORIZED').length;
  const progressMessage = view.busy
    ? view.phase === 'CONFIRM' ? 'Acompanhando o retorno da mesma DPS…'
      : view.phase === 'ISSUE' ? 'Enviando uma nota por vez…' : 'Validando dados…'
    : view.retryAt ? 'Envio aguardando o limite do serviço. O lote será retomado automaticamente.'
      : view.monitoringPaused ? 'Acompanhamento desta janela pausado. O retorno continua sendo registrado pelo sistema.'
      : uncertain ? 'Acompanhando automaticamente o retorno das notas enviadas.'
        : authorized === items.length ? 'Todas as notas foram autorizadas.'
          : view.paused ? 'Envio interrompido. Confira os impedimentos das notas restantes.'
            : 'Os dados são conferidos no servidor. Clique em Emitir para enviar as notas disponíveis.';
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-fiscal-review-overlay" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
    <div ref={dialogRef} className="nfse-fiscal-review-dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} aria-busy={view.busy}>
      <header className="nfse-section-heading"><div><h2 id={id}>Emitir notas</h2><p>{items.length} nota(s) selecionada(s) · {scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</p></div>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" disabled={view.busy} aria-label="Fechar lote" onClick={close}><X size={17} /></button></header>
      <div className="nfse-fiscal-review-body nfse-individual-content">
        {scope.environment !== 'PRODUCAO' && <p role="status">O executor deste ambiente ainda não está disponível. As preparações foram preservadas.</p>}
        <p role="status">{authorized} de {items.length} nota(s) autorizada(s). {progressMessage}</p>
        <div aria-label="Andamento da emissão" role="status">
          <progress aria-label="Notas com resultado definitivo" max={items.length} value={view.items.filter(item => ['AUTHORIZED', 'REJECTED', 'BLOCKED'].includes(item.result?.state || '')).length} style={{ width: '100%', height: 12 }} />
          <small>{authorized} autorizada(s) · {view.items.filter(item => item.result?.state === 'REJECTED' || item.result?.state === 'BLOCKED').length} com impedimento · {view.items.filter(item => item.uncertain).length} aguardando retorno</small>
        </div>
        {uncertain && <p role="status">Aguardando retorno fiscal da mesma DPS. Nenhuma nota será reenviada automaticamente.</p>}
        {view.items.map((item, index) => {
          const payload = item.result?.payload || item.preview?.payload;
          const expired = item.preview && Date.parse(item.preview.expiresAt) <= Date.now();
          const state = item.operation?.state === 'CANCELLED' ? 'CANCELLED' : item.result?.state;
          const status = item.uncertain ? 'Aguardando retorno' : item.dispatched && !item.result ? 'Enviando…' : state ? operationLabel(state) : item.preview ? (item.preview.capability.available ? 'Pronta para emissão' : 'Dados pendentes') : 'Validando…';
          const detailsId = `${id}-note-${index}`;
          return <section key={`${item.source.kind}:${item.source.id}`} className="nfse-batch-row" aria-label={`Preparação ${index + 1}: ${item.label}`}>
            <div className="nfse-batch-line">
              <h3>{index + 1}. {payload?.recipientName || item.label}</h3>
              <strong className="nfse-batch-amount">{formatNfseMoney(payload?.amount || item.amount)}</strong>
              <span className="nfse-batch-status" data-state={item.uncertain ? 'PENDING' : state || 'PREVIEWED'}>{item.result?.number ? `NFS-e nº ${item.result.number} · ` : ''}{status}</span>
              <button type="button" className="nfse-button nfse-button-secondary" aria-expanded={expanded.has(index)} aria-controls={detailsId}
                onClick={() => setExpanded(previous => { const next = new Set(previous); if (next.has(index)) next.delete(index); else next.add(index); return next; })}>Ver dados da nota</button>
            </div>
            {state === 'AUTHORIZED' && onCancelOperation && <button type="button" className="nfse-button nfse-button-danger" disabled={view.busy}
              onClick={() => onCancelOperation(item)}>Cancelar NFS-e</button>}
            {(state === 'REJECTED' || state === 'BLOCKED') && item.result?.message && <p className="nfse-download-error" role="alert">{item.result.codes?.length ? `${item.result.codes.join(', ')}: ` : ''}{item.result.message}</p>}
            {item.error && <p className="nfse-download-error" role="alert">{item.error}</p>}
            {item.preview && !item.preview.capability.available && <p role="alert">{individualReason(item.preview.capability.reason)}</p>}
            {expired && <p>Atualizando os dados da mesma operação…</p>}
            <div id={detailsId} hidden={!expanded.has(index)} className="nfse-batch-details">
              {item.result?.message && state !== 'PREVIEWED' && <p>{item.result.message}</p>}
              {Boolean(item.result?.codes?.length) && <p>Código(s): {item.result!.codes!.join(', ')}</p>}
              {payload ? <NfseIndividualSnapshot payload={payload} /> : <p>Dados ainda não disponíveis.</p>}
            </div>
          </section>;
        })}
      </div>
      <footer className="nfse-footer"><span>{available} nota(s) conferida(s) e disponível(is) para envio.</span><div className="nfse-queue-actions">
        {view.busy && <button type="button" className="nfse-button nfse-button-secondary" onClick={() => controller.stop()}>Pausar acompanhamento</button>}
        <button type="button" className="nfse-button nfse-button-secondary" disabled={view.busy} onClick={close}>Fechar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={view.busy || Boolean(view.retryAt) || !available || uncertain || scope.environment !== 'PRODUCAO'} onClick={() => void controller.issue()}>Emitir notas ({available})</button>
      </div></footer>
    </div>
  </div>, document.body);
}
