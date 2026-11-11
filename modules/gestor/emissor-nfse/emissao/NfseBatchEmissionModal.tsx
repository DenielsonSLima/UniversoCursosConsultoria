import { useEffect, useId, useState, useSyncExternalStore, type ComponentRef } from 'react';
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
import { batchCanIssue, createNfseBatchController, type NfseBatchInput } from './nfse-batch.core';
import type { NfseFiscalNotice } from './nfse-fiscal-notice';
import '../individual/nfse-individual.css';
import '../fila/fiscal-review/nfse-fiscal-review.css';
interface Props { scope: NfseScope; items: readonly NfseBatchInput[]; onClose: () => void; onChanged: () => void;
  onNotice?: (notice: NfseFiscalNotice) => void; service?: NfseIndividualService }
export default function NfseBatchEmissionModal({ scope, items, onClose, onChanged, onNotice, service = nfseIndividualService }: Props) {
  const id = useId();
  const [controller] = useState(() => createNfseBatchController(scope, items, service, {
    getItem: key => window.sessionStorage.getItem(key), setItem: (key, value) => window.sessionStorage.setItem(key, value),
  }, { onChanged, onNotice }));
  const view = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const expiries = view.items.flatMap(item => item.preview && Date.parse(item.preview.expiresAt) > Date.now() ? [Date.parse(item.preview.expiresAt)] : []);
    if (!expiries.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(2_147_483_647, Math.max(1, Math.min(...expiries) - Date.now() + 1)));
    return () => clearTimeout(timer);
  }, [view.items, clock]);
  const close = () => { if (!view.busy) onClose(); };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  const available = view.items.filter(item => batchCanIssue(item)).length;
  const uncertain = view.items.some(item => item.uncertain);
  const authorized = view.items.filter(item => item.result?.state === 'AUTHORIZED').length;
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-fiscal-review-overlay" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target) close(); }}>
    <div ref={dialogRef} className="nfse-fiscal-review-dialog" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} aria-busy={view.busy}>
      <header className="nfse-section-heading"><div><h2 id={id}>Revisão e emissão do lote</h2><p>{items.length} preparação(ões) · {scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</p></div>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" disabled={view.busy} aria-label="Fechar lote" onClick={close}><X size={17} /></button></header>
      <div className="nfse-fiscal-review-body nfse-individual-content">
        {scope.environment !== 'PRODUCAO' && <p role="status">O executor deste ambiente ainda não está disponível. As preparações foram preservadas.</p>}
        <p>A competência de cada serviço seguirá a regra do seu pré-modelo. Nas preparações acadêmicas, serão usadas as datas da revisão fiscal salva.</p>
        <button type="button" className="nfse-button nfse-button-secondary" disabled={view.busy || scope.environment !== 'PRODUCAO'}
          onClick={() => void controller.review()}>Conferir cada preparação no servidor</button>
        <p role="status">{authorized} de {items.length} nota(s) autorizada(s). {view.busy ? view.phase === 'ISSUE' ? 'Enviando uma nota por vez…' : 'Consultando revisões…' : view.paused ? 'Lote pausado; confira o resultado de cada nota.' : 'Confira e confirme individualmente os dados antes de emitir.'}</p>
        {uncertain && <p role="status">Há resultado não confirmado. Consulte a mesma operação antes de continuar o lote.</p>}
        {view.items.map((item, index) => {
          const payload = item.result?.payload || item.preview?.payload;
          const expired = item.preview && Date.parse(item.preview.expiresAt) <= Date.now();
          const state = item.operation?.state === 'CANCELLED' ? 'CANCELLED' : item.result?.state;
          return <section key={`${item.source.kind}:${item.source.id}`} className="nfse-individual-review" aria-label={`Preparação ${index + 1}: ${item.label}`}>
            <h3>{index + 1}. {payload?.recipientName || item.label} · {formatNfseMoney(payload?.amount || item.amount)}</h3>
            <p>{item.uncertain ? 'Aguardando confirmação' : item.dispatched && !item.result ? 'Envio iniciado; aguarde o resultado' : state ? operationLabel(state) : item.preview ? 'Revisão disponível' : 'Aguardando conferência'}</p>
            {item.result?.number && <p>NFS-e nº {item.result.number}</p>}
            {item.result?.message && <p>{item.result.message}</p>}
            {Boolean(item.result?.codes?.length) && <p>Código(s): {item.result!.codes!.join(', ')}</p>}
            {item.error && <p className="nfse-download-error" role="alert">{item.error}</p>}
            {item.preview && !item.preview.capability.available && <p>{individualReason(item.preview.capability.reason)}</p>}
            {payload && <details><summary>Dados canônicos desta nota</summary><NfseIndividualSnapshot payload={payload} /></details>}
            {item.preview && !item.dispatched && <label className="nfse-individual-confirm"><input type="checkbox" checked={item.confirmed}
              disabled={view.busy || Boolean(expired) || !item.preview.capability.available || !payload} onChange={event => controller.confirm(index, event.target.checked)} />Conferi os dados desta nota e autorizo sua emissão em produção.</label>}
            {expired && <p>Revisão expirada. Abra a preparação individual para renovar a mesma operação.</p>}
            {item.previewId && <button type="button" className="nfse-button nfse-button-secondary" disabled={view.busy} onClick={() => void controller.consult(index)}>Consultar esta operação</button>}
          </section>;
        })}
      </div>
      <footer className="nfse-footer"><span>{available} nota(s) conferida(s) e disponível(is) para envio.</span><div className="nfse-queue-actions">
        {view.busy && <button type="button" className="nfse-button nfse-button-secondary" onClick={() => controller.stop()}>Pausar após a nota atual</button>}
        <button type="button" className="nfse-button nfse-button-secondary" disabled={view.busy} onClick={close}>Fechar</button>
        <button type="button" className="nfse-button nfse-button-primary" disabled={view.busy || !available || uncertain || scope.environment !== 'PRODUCAO'} onClick={() => void controller.issue()}>Emitir notas conferidas ({available})</button>
      </div></footer>
    </div>
  </div>, document.body);
}
