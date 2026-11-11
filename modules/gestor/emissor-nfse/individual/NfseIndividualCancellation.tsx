import type { IndividualCancelPreview, IndividualCancelResult } from './nfse-individual.types';
import { individualReason } from './nfse-individual.contract';
import { individualCancellationDetail, individualJustification } from './nfse-individual.contract';
import type { NfseScope } from '../types/nfse.types';
import { cancellationReasons, type NfseCancellationModel } from '../cancelamento/nfse-cancellation-models.contract';
import NfseCancellationTemplatePicker from '../cancelamento/NfseCancellationTemplatePicker';
interface Props { preview?: IndividualCancelPreview; result?: IndividualCancelResult; busy: boolean; sent: boolean; expired: boolean; existing?: boolean;
  justification: string; confirmed: boolean; onJustification: (value: string) => void; onConfirm: (value: boolean) => void; onPrepare: () => void; onCancel: () => void;
  scope?: NfseScope; model?: NfseCancellationModel | null; detail?: string | null; onModel?: (model: NfseCancellationModel) => void; onDetail?: (value: string) => void }
export default function NfseIndividualCancellation(props: Props) {
  const { preview, result, busy, sent, expired, justification, confirmed, onJustification, onConfirm, onPrepare, onCancel } = props;
  if (result?.state === 'CANCELLED') return <section className="nfse-individual-review" aria-label="Evento de cancelamento confirmado">
    <h3>Cancelada · cancelamento confirmado</h3><dl className="nfse-individual-grid">
      <div><dt>NFS-e</dt><dd>{result.payload.number}</dd></div><div><dt>Motivo do evento</dt><dd>{cancellationReasons.find(item => item.value === result.payload.reasonCode)?.label}</dd></div>
      <div><dt>Justificativa registrada</dt><dd>{result.payload.justification}</dd></div></dl><p>{result.message}</p>
  </section>;
  const selectedDraft = Boolean(props.model && !props.existing);
  let ready = false;
  const draftText = props.model?.textTemplate.replaceAll('{{detalhe}}', props.detail || '') || '';
  try {
    if (selectedDraft) {
      const detail = individualCancellationDetail(props.detail ?? null);
      ready = props.model!.requiresDetail === (detail !== null) && Boolean(individualJustification(draftText));
    } else ready = Boolean(individualJustification(justification));
  } catch { /* Keep incomplete facts editable; no request may contain unresolved tokens. */ }
  const reasonCode = preview?.payload.reasonCode || result?.payload.reasonCode || props.model?.reasonCode || '1';
  return <section className="nfse-individual-review" aria-label="Cancelamento da nota autorizada"><h3>Cancelar a nota desta operação</h3>
    <p>Motivo {cancellationReasons.find(item => item.value === reasonCode)?.label}</p>
    {props.scope && props.onModel && !props.existing && <NfseCancellationTemplatePicker scope={props.scope} disabled={busy || sent} onApply={props.onModel} />}
    {props.model && <p>Modelo: {props.model.name} · versão {props.model.version}</p>}
    {selectedDraft ? <>
      <p className="nfse-inline-help">{props.model!.textTemplate}</p>
      {props.model!.requiresDetail && <label className="nfse-field"><span>Detalhe factual do cancelamento</span><input aria-label="Detalhe factual do cancelamento" value={props.detail || ''} maxLength={255} disabled={busy || sent}
        onChange={event => props.onDetail?.(event.target.value)} /></label>}
      <p className="nfse-inline-help">Prévia para conferência: {draftText} O texto final será resolvido e validado pelo servidor.</p>
    </> : <label className="nfse-field"><span>Justificativa do cancelamento</span><textarea aria-label="Justificativa do cancelamento" minLength={15} maxLength={255}
      value={justification} disabled={busy || sent || props.existing} onChange={event => onJustification(event.target.value)} /></label>}
    <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || sent || !ready} onClick={onPrepare}>{props.existing ? 'Revalidar este cancelamento' : 'Revisar cancelamento'}</button>
    {preview && <><dl className="nfse-individual-grid"><div><dt>NFS-e</dt><dd>{preview.payload.number}</dd></div><div><dt>Chave de acesso</dt><dd>{preview.payload.accessKey}</dd></div>
      <div><dt>Motivo</dt><dd>{cancellationReasons.find(item => item.value === preview.payload.reasonCode)?.label}</dd></div><div><dt>Justificativa conferida</dt><dd>{preview.payload.justification}</dd></div></dl>
      {!preview.capability.available && <p role="status">{individualReason(preview.capability.reason)}</p>}
      {expired && !sent && <p role="status">A revisão do cancelamento expirou. Confira novamente.</p>}
      {!sent && <label className="nfse-individual-confirm"><input type="checkbox" checked={confirmed} disabled={busy || expired || !preview.capability.available}
        onChange={event => onConfirm(event.target.checked)} />Conferi a nota, o motivo e a justificativa e autorizo este cancelamento em produção.</label>}
      <button type="button" className="nfse-button nfse-button-danger" disabled={!confirmed || busy || sent || expired || !preview.capability.available} onClick={onCancel}>Cancelar esta NFS-e em produção</button></>}
    {result && <div role="status"><strong>{{ PREVIEWED: 'Cancelamento ainda não enviado', CANCELLED: 'Cancelamento confirmado', CANCELLATION_PENDING: 'Cancelamento aguardando confirmação',
      CANCELLATION_REJECTED: 'Cancelamento rejeitado', AWAITING_ANALYSIS: 'Solicitação aguardando análise fiscal', BLOCKED: 'Cancelamento bloqueado' }[result.state]}</strong><p>{result.message}</p>
      {Boolean(result.codes?.length) && <p>Código(s) retornado(s): {result.codes!.join(', ')}</p>}
      {result.capability?.available === false && <p>{individualReason(result.capability.reason)}</p>}
      {result.state === 'AWAITING_ANALYSIS' && <p>A solicitação de análise não confirma que a nota foi cancelada.</p>}</div>}
  </section>;
}
