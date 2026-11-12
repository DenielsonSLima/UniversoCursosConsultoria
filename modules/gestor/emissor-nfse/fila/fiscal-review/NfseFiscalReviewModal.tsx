import { useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, X } from 'lucide-react';
import InstitutionalSelect from '../../../../shared/components/InstitutionalSelect';
import { useNfseModels } from '../../modelos/hooks/useNfseModels';
import { useNfseStudentsDialog } from '../../preparar/useNfseStudentsDialog';
import { formatNfseMonth } from '../../preparar/nfse-month.presentation';
import { formatNfseDate } from '../../components/nfse.presentation';
import type { NfseScope } from '../../types/nfse.types';
import NfseFiscalReviewDetails from './NfseFiscalReviewDetails';
import { fiscalReviewDate } from './nfse-fiscal-review.contract';
import { getNfseFiscalReviewDates } from './nfse-fiscal-review.dates';
import { useNfseFiscalReview } from './useNfseFiscalReview';
import type { NfseFiscalReviewService, ValidateNfseFiscalReview } from './nfse-fiscal-review.types';
import './nfse-fiscal-review.css';

interface Props { scope: NfseScope; documentId: string; onClose: () => void; onSaved: (message: string) => void;
  service?: NfseFiscalReviewService }
const datesValid = (competence: string, service: string) => {
  try { fiscalReviewDate(competence); fiscalReviewDate(service); return true; } catch { return false; }
};

export default function NfseFiscalReviewModal({ scope, documentId, onClose, onSaved, service }: Props) {
  const titleId = useId();
  const [modelId, setModelId] = useState('');
  const [editingModel, setEditingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const request = useRef<{ key: string; input: ValidateNfseFiscalReview } | null>(null);
  const submitting = useRef(false);
  const { query, validate } = useNfseFiscalReview(scope, documentId, modelId, service);
  const modelsQuery = useNfseModels(scope);
  const models = modelsQuery.error ? [] : modelsQuery.data?.rows.filter(model => model.active && (model.modelType === 'ALUNO' || model.modelType === 'AMBOS') && model.nationalServiceCode === '080201') || [];
  const data = query.error ? undefined : query.data;
  const fiscalDates = data ? getNfseFiscalReviewDates(data) : null;
  const competenceDate = fiscalDates?.competenceDate || '';
  const serviceDate = fiscalDates?.serviceDate || '';
  const selectedModel = models.find(model => model.id === modelId);
  const busy = validate.isPending;
  const close = () => { if (!submitting.current) onClose(); };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  useEffect(() => {
    if (!data) return;
    if (!modelId && data.service.nationalServiceCode === '080201' && data.service.modelId) setModelId(data.service.modelId);
  }, [data, modelId]);
  const canSave = Boolean(data && selectedModel && modelId === data.service.modelId
    && selectedModel.version === data.service.modelVersion && data.recipient.name && data.recipient.document
    && (!data.reviewComplete || fiscalDates?.source !== 'SAVED')
    && datesValid(competenceDate, serviceDate) && !busy && !query.isFetching && !modelsQuery.isFetching && !modelsQuery.error);
  const submit = async () => {
    if (!canSave || !data || !selectedModel || submitting.current) return;
    const selection = { modelId: selectedModel.id, modelVersion: selectedModel.version };
    const key = JSON.stringify([scope, documentId, data.revision, data.basisToken, selection]);
    if (request.current?.key !== key) request.current = { key, input: { requestId: crypto.randomUUID(), expectedRevision: data.revision,
      basisToken: data.basisToken, ...selection } };
    submitting.current = true; setError(null); setSavedMessage(null);
    try {
      const response = await validate.mutateAsync(request.current.input);
      request.current = null; setSavedMessage(response.message); onSaved(response.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível salvar os ajustes. Atualize a consulta.'); }
    finally { submitting.current = false; }
  };
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-fiscal-review-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="nfse-fiscal-review-dialog">
      <header className="nfse-section-heading"><h2 id={titleId}>Revisar ou editar dados fiscais</h2>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" aria-label="Fechar revisão fiscal"
          disabled={busy} onClick={close}><X size={17} /></button></header>
      <div className="nfse-fiscal-review-body" aria-busy={query.isFetching || busy}>
        {(error || query.error) && <div className="nfse-fiscal-review-state" role="alert"><p>{error || (query.error instanceof Error ? query.error.message : 'Não foi possível consultar a revisão.')}</p>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || query.isFetching}
            onClick={() => { setError(null); void query.refetch(); }}>Atualizar revisão</button></div>}
        {savedMessage && <p className="nfse-fiscal-review-state" role="status">{savedMessage}</p>}
        {query.isPending ? <p className="nfse-fiscal-review-state" role="status"><Loader2 size={18} />Consultando dados fiscais…</p>
          : data && <>
            <NfseFiscalReviewDetails review={data} requiresDateReview={data.reviewComplete && fiscalDates?.source !== 'SAVED'} />
            <section className="nfse-fiscal-review-section" aria-label="Modelo e competência fiscal">
              <div className="nfse-fiscal-review-model-heading"><h3>Modelo e competência fiscal</h3>
                {selectedModel && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy}
                  aria-expanded={editingModel} onClick={() => setEditingModel(value => !value)}>{editingModel ? 'Concluir seleção' : 'Alterar modelo'}</button>}
              </div>
              {selectedModel && !editingModel ? <p className="nfse-fiscal-review-model-name">{selectedModel.name}</p> :
              <div className="nfse-field"><label htmlFor={`${titleId}-model`}>Modelo de ensino técnico</label>
                <InstitutionalSelect id={`${titleId}-model`} ariaLabel="Modelo de ensino técnico" value={modelId}
                  onValueChange={value => { setModelId(value); setSavedMessage(null); }}
                  options={models.map(model => ({ value: model.id, label: `${model.name} · ${model.nationalServiceCode}` }))}
                  placeholder="Selecionar modelo para alunos" loading={modelsQuery.isPending} disabled={busy}
                  error={modelsQuery.error ? 'Não foi possível consultar os modelos.' : undefined} />
              </div>}
              {modelsQuery.error && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={() => void modelsQuery.refetch()}>Consultar modelos novamente</button>}
              {!modelsQuery.isPending && !modelsQuery.error && !models.length && <p className="nfse-inline-help">Cadastre um modelo ativo do tipo Alunos com tributação 080201 para continuar esta revisão.</p>}
              {query.isFetching && <p className="nfse-inline-help" role="status">Atualizando os dados do modelo…</p>}
              {data.service.modelId && <details className="nfse-fiscal-review-disclosure">
                <summary tabIndex={0}>Ver descrição e classificação do serviço</summary>
                <dl className="nfse-fiscal-review-grid nfse-fiscal-review-disclosure-content">
                  <div><dt>Tributação Nacional</dt><dd>{data.service.nationalServiceCode || 'Não informada'}</dd></div>
                  <div><dt>NBS</dt><dd>{data.service.nbsCode || 'Não informada'}</dd></div>
                  <div className="nfse-fiscal-review-wide"><dt>Descrição do serviço</dt><dd className="nfse-fiscal-review-description">{data.service.description || 'Não informada'}</dd></div>
                </dl>
              </details>}
              <dl className="nfse-fiscal-review-grid">
                <div className="nfse-fiscal-review-wide"><dt>Competência fiscal</dt>
                  <dd><output aria-label="Competência fiscal">{formatNfseMonth(data.preparation.paymentMonth) || 'Mês dos pagamentos não informado'}</output>
                    <small>Automática pelo mês dos pagamentos.{competenceDate && ` Último pagamento: ${formatNfseDate(competenceDate)}.`}</small></dd></div>
              </dl>
              {!datesValid(competenceDate, serviceDate) && <p className="nfse-inline-help" role="alert">
                Não foi possível determinar as datas fiscais desta preparação. Atualize a revisão antes de salvar.</p>}
            </section>
            <p className="nfse-inline-help">A emissão valida automaticamente o cadastro, o modelo e os recebimentos. Use esta revisão somente para consultar ou ajustar o modelo.</p>
          </>}
      </div>
      <footer className="nfse-footer"><p>Salvar ajustes não emite nota e não altera os recebimentos.</p>
        <div className="nfse-queue-actions"><button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={close}>Fechar</button>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!canSave} onClick={() => void submit()}>
            <Save size={15} />{busy ? 'Salvando ajustes…' : 'Salvar ajustes'}</button></div></footer>
    </div>
  </div>, document.body);
}

