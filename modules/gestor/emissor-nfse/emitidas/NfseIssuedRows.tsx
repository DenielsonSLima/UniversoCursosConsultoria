import type { ReactNode } from 'react';
import type { NfseDocument } from '../types/nfse.types';
import { formatNfseMoney } from '../components/nfse.presentation';
import { operationLabel } from '../emissao/nfse-operation.contract';
import NfseDocumentOperationAction from '../emissao/NfseDocumentOperationAction';
interface Props { rows: NfseDocument[]; available: boolean; disabled: boolean; selected?: ReadonlySet<string>;
  onToggle?: (document: NfseDocument, checked: boolean) => void; actions?: (document: NfseDocument, available: boolean) => ReactNode }
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Data fiscal não disponível';
export default function NfseIssuedRows({ rows, available, disabled, selected, onToggle, actions }: Props) {
  return <div className="nfse-issued-list">{rows.map(item => <article key={item.id} className="nfse-issued-note" aria-label={`NFS-e ${item.number || 'sem número'}`}>
    <div className="nfse-issued-line">
      <div className="nfse-issued-note-title">{onToggle && <input type="checkbox" aria-label={`Selecionar nota ${item.number ?? ''} de ${item.studentName}`}
        checked={Boolean(selected?.has(item.id))} disabled={!available || disabled || !/^\d{50}$/.test(item.accessKey || '')}
        onChange={event => onToggle(item, event.target.checked)} />}
        <strong>NFS-e nº {item.number}</strong><span>{date(item.emittedAt)}</span></div>
      <span className="nfse-status" data-tone={item.state === 'AUTHORIZED' ? 'success' : item.state === 'CANCELLATION_REJECTED' ? 'error' : 'warning'}>{item.state ? operationLabel(item.state) : 'Emitida'}</span>
    </div>
    <div className="nfse-issued-line nfse-issued-note-context">
      <span><strong>{item.studentName}</strong>{item.classLabel && <small> · {item.classLabel}</small>}</span>
      <span>{item.modelLabel}{item.courseTypeLabel && <small> · {item.courseTypeLabel}</small>}</span>
      <span>{item.origin === 'ALUNO' ? 'Origem: aluno' : item.origin === 'SERVICO' ? 'Origem: serviço' : 'Origem não informada'}</span>
    </div>
    <div className="nfse-issued-line">
      <div className="nfse-issued-note-result"><strong className="nfse-amount">{formatNfseMoney(item.amount)}</strong>
        {(item.state === 'CANCELLED' || item.message) && <span className="nfse-issued-message" title={item.state === 'CANCELLED' ? 'Autorização histórica preservada; cancelamento confirmado.' : item.message || undefined}>
          {item.state === 'CANCELLED' ? 'Autorização histórica preservada; cancelamento confirmado.' : item.message}</span>}</div>
      <div className="nfse-issued-note-actions">{actions?.(item, available)}<NfseDocumentOperationAction document={item} disabled={!available || disabled} /></div>
    </div>
  </article>)}</div>;
}
