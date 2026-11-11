import { useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, X } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import { useNfseModels } from '../../modelos/hooks/useNfseModels';
import { useNfseStudentsDialog } from '../../preparar/useNfseStudentsDialog';
import type { NfseScope } from '../../types/nfse.types';
import NfseFiscalReviewDetails from './NfseFiscalReviewDetails';
import { fiscalReviewDate } from './nfse-fiscal-review.contract';
import { useNfseFiscalReview } from './useNfseFiscalReview';
import type { NfseFiscalReviewService, SaveNfseFiscalReview } from './nfse-fiscal-review.types';
import './nfse-fiscal-review.css';

interface Props { scope: NfseScope; documentId: string; onClose: () => void; onSaved: (message: string) => void;
  service?: NfseFiscalReviewService }
const datesValid = (competence: string, service: string) => {
  try { fiscalReviewDate(competence); fiscalReviewDate(service); return true; } catch { return false; }
};

export default function NfseFiscalReviewModal({ scope, documentId, onClose, onSaved, service }: Props) {
  const titleId = useId();
  const [modelId, setModelId] = useState('');
  const [competenceDate, setCompetenceDate] = useState('');
  const [serviceDate, setServiceDate] = useState('');
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [classificationConfirmed, setClassificationConfirmed] = useState(false);
  const [receiptsConfirmed, setReceiptsConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const request = useRef<{ key: string; input: SaveNfseFiscalReview } | null>(null);
  const submitting = useRef(false);
  const { query, save } = useNfseFiscalReview(scope, documentId, modelId, service);
  const modelsQuery = useNfseModels(scope);
  const models = modelsQuery.error ? [] : modelsQuery.data?.rows.filter(model => model.active && model.nationalServiceCode === '080201') || [];
  const data = query.error ? undefined : query.data;
  const selectedModel = models.find(model => model.id === modelId);
  const busy = save.isPending;
  const close = () => { if (!submitting.current) onClose(); };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  useEffect(() => {
    if (!data) return;
    const reviewed = data.reviewComplete && data.reviewStatus === 'CONFIRMED';
    if (!modelId && data.service.nationalServiceCode === '080201' && data.service.modelId) setModelId(data.service.modelId);
    setCompetenceDate(data.service.competenceDate || ''); setServiceDate(data.service.serviceDate || '');
    setRecipientConfirmed(reviewed && data.recipient.confirmed); setClassificationConfirmed(reviewed); setReceiptsConfirmed(reviewed);
    setDirty(false);
  }, [data, modelId]);
  const change = (action: () => void) => { action(); setDirty(true); setSavedMessage(null); };
  const canSave = Boolean(data && selectedModel && modelId === data.service.modelId
    && selectedModel.version === data.service.modelVersion && data.recipient.name && data.recipient.document
    && recipientConfirmed && classificationConfirmed && receiptsConfirmed && dirty
    && datesValid(competenceDate, serviceDate) && !busy && !query.isFetching && !modelsQuery.isFetching && !modelsQuery.error);
  const submit = async () => {
    if (!canSave || !data || !selectedModel || submitting.current) return;
    const definition = { modelId: selectedModel.id, modelVersion: selectedModel.version,
      recipient: { mode: 'STUDENT' as const, confirmed: true as const }, competenceDate, serviceDate,
      classificationConfirmed: true as const, receiptsConfirmed: true as const };
    const key = JSON.stringify([scope, documentId, data.revision, data.basisToken, definition]);
    if (request.current?.key !== key) request.current = { key, input: { requestId: crypto.randomUUID(), expectedRevision: data.revision,
      basisToken: data.basisToken, definition } };
    submitting.current = true; setError(null); setSavedMessage(null);
    try {
      const response = await save.mutateAsync(request.current.input);
      request.current = null; setDirty(false); setSavedMessage(response.message); onSaved(response.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível confirmar a revisão. Atualize a consulta.'); }
    finally { submitting.current = false; }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-fiscal-review-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="nfse-fiscal-review-dialog">
      <header className="nfse-section-heading"><h2 id={titleId}>Revisar dados fiscais</h2>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" aria-label="Fechar revisão fiscal"
          disabled={busy} onClick={close}><X size={17} /></button></header>
      <div className="nfse-fiscal-review-body" aria-busy={query.isFetching || busy}>
        {(error || query.error) && <div className="nfse-fiscal-review-state" role="alert"><p>{error || (query.error instanceof Error ? query.error.message : 'Não foi possível consultar a revisão.')}</p>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || query.isFetching}
            onClick={() => { setError(null); void query.refetch(); }}>Atualizar revisão</button></div>}
        {savedMessage && <p className="nfse-fiscal-review-state" role="status">{savedMessage}</p>}
        {query.isPending ? <p className="nfse-fiscal-review-state" role="status"><Loader2 size={18} />Consultando dados fiscais…</p>
          : data && <>
            <NfseFiscalReviewDetails review={data} />
            <section className="nfse-fiscal-review-section" aria-label="Modelo e datas fiscais">
              <h3>Modelo para a revisão fiscal</h3>
              <div className="nfse-field"><label htmlFor={`${titleId}-model`}>Modelo de ensino técnico</label>
                <InstitutionalSelect id={`${titleId}-model`} ariaLabel="Modelo de ensino técnico" value={modelId}
                  onValueChange={value => change(() => { setModelId(value); setRecipientConfirmed(false); setClassificationConfirmed(false); setReceiptsConfirmed(false); })}
                  options={models.map(model => ({ value: model.id, label: `${model.name} · ${model.nationalServiceCode}` }))}
                  placeholder="Selecionar modelo 080201" loading={modelsQuery.isPending} disabled={busy}
                  error={modelsQuery.error ? 'Não foi possível consultar os modelos.' : undefined} />
              </div>
              {modelsQuery.error && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={() => void modelsQuery.refetch()}>Consultar modelos novamente</button>}
              {!modelsQuery.isPending && !modelsQuery.error && !models.length && <p className="nfse-inline-help">Cadastre um modelo ativo com tributação 080201 para continuar esta revisão.</p>}
              {query.isFetching && <p className="nfse-inline-help" role="status">Atualizando os dados do modelo…</p>}
              {data.service.modelId && <dl className="nfse-fiscal-review-grid">
                <div><dt>Tributação Nacional</dt><dd>{data.service.nationalServiceCode || 'Não informada'}</dd></div>
                <div><dt>NBS</dt><dd>{data.service.nbsCode || 'Não informada'}</dd></div>
                <div className="nfse-fiscal-review-wide"><dt>Descrição do serviço</dt><dd className="nfse-fiscal-review-description">{data.service.description || 'Não informada'}</dd></div>
              </dl>}
              <fieldset disabled={busy || query.isFetching} className="nfse-fiscal-review-fields">
                <label className="nfse-field"><span>Competência fiscal</span><input type="date" aria-label="Competência fiscal" required value={competenceDate}
                  onChange={event => change(() => setCompetenceDate(event.target.value))} /></label>
                <label className="nfse-field"><span>Data da prestação do serviço</span><input type="date" aria-label="Data da prestação do serviço" required value={serviceDate}
                  onChange={event => change(() => setServiceDate(event.target.value))} /></label>
              </fieldset>
              <p className="nfse-inline-help">Informe as datas fiscais conferidas. O mês dos recebimentos não preenche a competência nem a data da prestação.</p>
            </section>
            <fieldset disabled={busy || query.isFetching} className="nfse-fiscal-review-section nfse-fiscal-review-confirmations">
              <legend>Confirmações da revisão</legend>
              <label><input type="checkbox" checked={recipientConfirmed} disabled={!data.recipient.name || !data.recipient.document}
                onChange={event => change(() => setRecipientConfirmed(event.target.checked))} /><span>Confirmo que o aluno identificado é o tomador deste serviço.</span></label>
              <label><input type="checkbox" checked={classificationConfirmed}
                onChange={event => change(() => setClassificationConfirmed(event.target.checked))} /><span>Conferi o modelo, a descrição e a classificação fiscal do serviço.</span></label>
              <label><input type="checkbox" checked={receiptsConfirmed}
                onChange={event => change(() => setReceiptsConfirmed(event.target.checked))} /><span>Conferi a origem e os recebimentos apresentados nesta preparação.</span></label>
            </fieldset>
          </>}
      </div>
      <footer className="nfse-footer"><p>Salvar a revisão não emite nota e não altera os recebimentos.</p>
        <div className="nfse-queue-actions"><button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={close}>Fechar</button>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!canSave} onClick={() => void submit()}>
            <Save size={15} />{busy ? 'Salvando revisão…' : 'Salvar revisão fiscal'}</button></div></footer>
    </div>
  </div>, document.body);
}
