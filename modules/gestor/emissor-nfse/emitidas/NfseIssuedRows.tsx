import type { ReactNode } from 'react';
import type { NfseDocument } from '../types/nfse.types';
import { formatNfseMoney } from '../components/nfse.presentation';
import { operationLabel } from '../emissao/nfse-operation.contract';
import { recipientDocumentLabel, recipientLocationLabel } from './nfse-recipient.presentation';
import NfseDocumentOperationAction from '../emissao/NfseDocumentOperationAction';
interface Props { rows: NfseDocument[]; available: boolean; disabled: boolean; selected?: ReadonlySet<string>;
  onToggle?: (document: NfseDocument, checked: boolean) => void; actions?: (document: NfseDocument, available: boolean) => ReactNode }
const date = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Maceio',
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : 'Data fiscal não disponível';
export default function NfseIssuedRows({ rows, available, disabled, selected, onToggle, actions }: Props) {
  return <div className="nfse-issued-list">{rows.map(item => <article key={item.id} className="nfse-issued-note" aria-label={`NFS-e ${item.number || 'sem número'}`}>
    <div className="nfse-issued-identity">
      <div className="nfse-issued-note-title">{onToggle && <input type="checkbox" aria-label={`Selecionar nota ${item.number ?? ''} de ${item.studentName}`}
        checked={Boolean(selected?.has(item.id))} disabled={!available || disabled || !/^\d{50}$/.test(item.accessKey || '')}
        onChange={event => onToggle(item, event.target.checked)} />}
        <strong>NFS-e nº {item.number}</strong><span>{date(item.emittedAt)}</span></div>
      <strong className="nfse-issued-recipient-name" title={item.studentName}>{item.studentName}</strong>
      <div className="nfse-issued-recipient-meta"><span>{recipientDocumentLabel(item.recipientDocument)}</span>
        <span>{recipientLocationLabel(item.recipientCity, item.recipientState)}</span></div>
    </div>
    <div className="nfse-issued-note-context">
        <span title={[item.classLabel, item.courseTypeLabel].filter(Boolean).join(" · ")}>{item.origin === 'ALUNO' ? 'Aluno' : item.origin === 'SERVICO' ? 'Serviço' : 'Origem não informada'}
          {item.classLabel && item.classLabel !== 'Serviço' && <> · {item.classLabel}</>}{item.courseTypeLabel && <> · {item.courseTypeLabel}</>}</span>
        {item.modelLabel && <span className="nfse-issued-model" title={item.modelLabel}>{item.modelLabel}</span>}
        {(item.state === 'CANCELLED' || item.message) && <details className="nfse-issued-note-detail"><summary>Detalhes da nota</summary>
          <p>{item.state === 'CANCELLED' ? 'Autorização histórica preservada; cancelamento confirmado.' : item.message}</p></details>}
    </div>
    <div className="nfse-issued-controls">
      <div className="nfse-issued-note-summary"><span className="nfse-status" data-tone={item.state === 'AUTHORIZED' ? 'success' : item.state === 'CANCELLATION_REJECTED' ? 'error' : 'warning'}>{item.state ? operationLabel(item.state) : 'Emitida'}</span>
        <strong className="nfse-amount">{formatNfseMoney(item.amount)}</strong></div>
      <div className="nfse-issued-note-actions">{actions?.(item, available)}<NfseDocumentOperationAction document={item} disabled={!available || disabled} /></div>
    </div>
  </article>)}</div>;
}
