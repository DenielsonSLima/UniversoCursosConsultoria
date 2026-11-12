import { useEffect, useId, useRef, useState, type ComponentRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { NfseScope } from '../types/nfse.types';
import { useNfseStudentsDialog } from '../preparar/useNfseStudentsDialog';
import { nfseIndividualService } from '../individual/nfse-individual.service';
import { individualReason, individualRejectionExplanation, individualJustification } from '../individual/nfse-individual.contract';
import { individualStorageKey, readIndividualAttempt } from '../individual/nfse-individual.attempt';
import type { IndividualAttempt, IndividualPreview, IndividualIssueResult, IndividualCancelPreview,
  IndividualCancelResult, NfseIndividualService } from '../individual/nfse-individual.types';
import NfseIndividualSnapshot from '../individual/NfseIndividualSnapshot';
import NfseIndividualCancellation from '../individual/NfseIndividualCancellation';
import { formatNfseFiscalDocument } from '../fila/fiscal-review/nfse-fiscal-document.presentation';
import { formatNfseMoney, formatNfseDate } from '../components/nfse.presentation';
import { operationLabel, type NfseEmissionSource, type NfseOperationReference } from './nfse-operation.contract';
import '../individual/nfse-individual.css';
import '../fila/fiscal-review/nfse-fiscal-review.css';
import { individualCancelNotice, individualIssueNotice, type NfseFiscalNotice } from './nfse-fiscal-notice';
import NfseCancellationReadOnlyResult from './NfseCancellationReadOnlyResult';
import NfseCancellationRetry from './NfseCancellationRetry';
import type { NfseCancellationModel } from '../cancelamento/nfse-cancellation-models.contract';
interface Props { scope: NfseScope; source: NfseEmissionSource; label: string; amount: string;
  operation?: NfseOperationReference; intent?: 'ISSUE' | 'CONSULT' | 'CANCEL'; onClose: () => void; onChanged: () => void; service?: NfseIndividualService; onNotice?: (notice: NfseFiscalNotice) => void }
export default function NfseSourceEmissionModal({ scope, source, label, amount, operation, intent = 'ISSUE', onClose, onChanged, onNotice, service = nfseIndividualService }: Props) {
  const title = useId(), storageKey = `${individualStorageKey(scope)}:${source.kind}:${source.id}`;
  const [attempt, setAttempt] = useState<IndividualAttempt | null>(() => {
    let stored: IndividualAttempt | null = null;
    try { stored = readIndividualAttempt(window.sessionStorage, storageKey); } catch { /* Server reference remains authoritative. */ }
    if (operation?.operationId && operation.requestId) return { requestId: operation.requestId, previewId: operation.operationId,
      ...(operation.cancelPreviewId ? { cancelPreviewId: operation.cancelPreviewId }
        : stored?.previewId === operation.operationId && stored.requestId === operation.requestId && stored.cancelPreviewId ? { cancelPreviewId: stored.cancelPreviewId } : {}),
      ...(stored?.previewId === operation.operationId && stored.requestId === operation.requestId && stored.cancelPreviewId === operation.cancelPreviewId && stored.retryRequestId ? { retryRequestId: stored.retryRequestId } : {}) };
    return stored;
  });
  const [preview, setPreview] = useState<IndividualPreview>();
  const [issued, setIssued] = useState<IndividualIssueResult>(), [cancellation, setCancellation] = useState<IndividualCancelResult>();
  const [cancelPreview, setCancelPreview] = useState<IndividualCancelPreview>();
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [cancellationOpen, setCancellationOpen] = useState(intent === 'CANCEL');
  const [justification, setJustification] = useState('');
  const [cancellationModel, setCancellationModel] = useState<NfseCancellationModel | null>(null), [detail, setDetail] = useState<string | null>(null);
  const [error, setError] = useState<string>(), [busy, setBusy] = useState(false), [clock, setClock] = useState(Date.now);
  const request = useRef<{ key: string; id: string } | null>(null), active = useRef(false), mounted = useRef(true), opened = useRef(false);
  const cancellationReadActive = useRef(false), issueReadActive = useRef(false);
  const close = () => {
    if (active.current) return;
    if (cancellationOpen) { setCancellationOpen(false); setCancelConfirmed(false); }
    else onClose();
  };
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog<ComponentRef<'button'>>(close);
  const supported = scope.environment === 'PRODUCAO';
  const run = async (action: () => Promise<void>) => {
    if (active.current || !supported) return;
    active.current = true; setBusy(true); setError(undefined);
    try { await action(); } catch (failure) { if (mounted.current) {
      const message = failure instanceof Error ? failure.message : 'Etapa não confirmada. Consulte esta operação.';
      setError(message); onNotice?.({ type: 'error', title: 'Etapa não confirmada', message });
    } }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  };
  const remember = (value: IndividualAttempt) => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(value)); setAttempt(value); return true; }
    catch { setError('Não foi possível preservar os identificadores desta operação. O envio não foi iniciado.'); return false; }
  };
  const consult = (saved: IndividualAttempt) => void run(async () => {
    const response = await service.reconcile(scope, saved.requestId, saved.previewId);
    if (!mounted.current) return;
    setIssued(response); onChanged();
    if (issued?.state === 'AWAITING_CONFIRMATION' && ['AUTHORIZED', 'REJECTED', 'BLOCKED'].includes(response.state)) onNotice?.(individualIssueNotice(response));
    setPreview(response.state === 'PREVIEWED' && response.expiresAt && response.capability ? {
      previewId: response.previewId, expiresAt: response.expiresAt, state: 'PREVIEWED', payload: response.payload, capability: response.capability } : undefined);
    if (saved.cancelPreviewId) {
      const result = await service.reconcileCancellation(scope, saved.requestId, saved.previewId, saved.cancelPreviewId);
      if (mounted.current) { setCancellation(result); setJustification(result.payload.justification); setCancellationModel(result.payload.cancellationModel || null); setDetail(result.payload.detail ?? null); setCancelConfirmed(false); onChanged();
        setCancelPreview(result.state === 'PREVIEWED' && result.expiresAt && result.capability ? { previewId: result.previewId,
          cancelPreviewId: result.cancelPreviewId, expiresAt: result.expiresAt, state: 'PREVIEWED', payload: result.payload, capability: result.capability } : undefined); }
    }
  });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (opened.current) return;
    if (attempt) { opened.current = true; consult(attempt); }
    else if (intent === 'ISSUE' && supported) { opened.current = true; prepare(); }
  }, [attempt, intent, supported]);
  useEffect(() => {
    const times = [preview?.expiresAt, cancelPreview?.expiresAt].flatMap(value => value && Date.parse(value) > Date.now() ? [Date.parse(value)] : []);
    if (!times.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(Math.max(1, Math.min(...times) - Date.now() + 1), 2_147_483_647)); return () => clearTimeout(timer);
  }, [preview?.expiresAt, cancelPreview?.expiresAt, clock]);
  const prepare = () => {
    if (intent !== 'ISSUE' || attempt) return;
    const key = JSON.stringify([scope, source]);
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    const requestId = request.current.id;
    void run(async () => { const response = await service.previewSource(scope, requestId, source);
      if (mounted.current) {
        if (!remember({ requestId, previewId: response.previewId })) return;
        setPreview(response); setIssued({ ...response, message: 'Preparação disponível. A emissão ainda não foi enviada.' }); onChanged();
      } });
  };
  const expired = Boolean(preview && Date.parse(preview.expiresAt) <= Date.now()), cancelExpired = Boolean(cancelPreview && Date.parse(cancelPreview.expiresAt) <= Date.now());
  const renew = () => {
    if (intent !== 'ISSUE' || !attempt || issued?.state !== 'PREVIEWED' || (!expired && preview?.capability.available) || !preview?.payload) return;
    void run(async () => {
      const response = await service.previewSource(scope, attempt.requestId, source,
        source.kind === 'PARTNER_SERVICE' ? preview.payload!.competenceDate : undefined);
      if (response.previewId !== attempt.previewId) throw new Error('A revisão retornou outra operação. Consulte a preparação novamente.');
      if (mounted.current) { setPreview(response); onChanged(); }
    });
  };
  const issue = () => {
    if (intent !== 'ISSUE' || busy || attempt && issued?.state !== 'PREVIEWED' || !preview?.capability.available || !preview.payload || expired) return;
    const requestId = attempt?.requestId || request.current?.id;
    if (!requestId) return;
    const saved = { requestId, previewId: preview.previewId };
    if (!remember(saved)) return;
    // The effect will not consult the same request while its first dispatch is being started.
    opened.current = true;
    setPreview(undefined); setIssued(undefined);
    void run(async () => { const response = await service.issue(scope, saved.requestId, saved.previewId); if (mounted.current) { setIssued(response); onChanged(); onNotice?.(individualIssueNotice(response)); } });
  };
  const prepareCancel = (submit = false) => {
    if (!cancellationOpen || intent === 'CONSULT' || !attempt || issued?.state !== 'AUTHORIZED' || attempt.cancelPreviewId && cancellation?.state !== 'PREVIEWED') return;
    if (submit && !cancelConfirmed) return;
    void run(async () => {
      const selected = attempt.cancelPreviewId ? cancellation?.payload.cancellationModel : cancellationModel;
      const factualDetail = attempt.cancelPreviewId ? cancellation?.payload.detail ?? null : detail;
      const approvedText = individualJustification(attempt.cancelPreviewId ? cancellation!.payload.justification
        : selected ? selected.textTemplate.replaceAll('{{detalhe}}', factualDetail || '') : justification);
      const approvedReason = attempt.cancelPreviewId ? cancellation!.payload.reasonCode : selected?.reasonCode || '1';
      const response = selected ? await service.previewCancellationModel(scope, attempt.requestId, attempt.previewId, { id: selected.id, version: selected.version }, factualDetail)
        : await service.previewCancellation(scope, attempt.requestId, attempt.previewId, attempt.cancelPreviewId ? cancellation!.payload.justification : justification);
      if (attempt.cancelPreviewId && response.cancelPreviewId !== attempt.cancelPreviewId) throw new Error('A revalidação retornou outro evento. Consulte o cancelamento existente.');
      if (mounted.current) {
        onChanged(); if (!remember({ ...attempt, cancelPreviewId: response.cancelPreviewId })) return;
        setCancelPreview(response); setJustification(response.payload.justification); setCancellationModel(response.payload.cancellationModel || null); setDetail(response.payload.detail ?? null); setCancelConfirmed(false);
        setCancellation({ ...response, message: attempt.cancelPreviewId ? 'Prévia do mesmo cancelamento revalidada. Ainda não enviada.' : 'Prévia do cancelamento conferida. Ainda não enviada.' });
        if (submit) {
          if (!response.capability.available || Date.parse(response.expiresAt) <= Date.now())
            throw new Error(individualReason(response.capability.reason) || 'Cancelamento indisponível. Nenhum pedido foi enviado.');
          if (individualJustification(response.payload.justification) !== approvedText || response.payload.reasonCode !== approvedReason
            || response.payload.accessKey !== issued.accessKey || response.payload.number !== issued.number)
            throw new Error('Os dados validados diferem dos confirmados. Nenhum cancelamento foi enviado. Confira o resumo antes de tentar novamente.');
          setCancelPreview(undefined); setCancellation(undefined);
          const result = await service.cancel(scope, attempt.requestId, attempt.previewId, response.cancelPreviewId);
          if (mounted.current) { setCancellation(result); onChanged(); onNotice?.(individualCancelNotice(result)); }
        }
      }
    });
  };
  const cancel = () => {
    if (!cancellationOpen || intent === 'CONSULT' || !attempt || attempt.cancelPreviewId && cancellation?.state !== 'PREVIEWED' || !cancelPreview?.capability.available || !cancelConfirmed || cancelExpired || busy) return;
    const saved = { ...attempt, cancelPreviewId: cancelPreview.cancelPreviewId };
    if (!remember(saved)) return;
    setCancelPreview(undefined); setCancellation(undefined); setCancelConfirmed(false);
    void run(async () => { const response = await service.cancel(scope, saved.requestId, saved.previewId, saved.cancelPreviewId); if (mounted.current) { setCancellation(response); onChanged(); onNotice?.(individualCancelNotice(response)); } });
  };
  const retryCancel = () => {
    if (!cancellationOpen || intent === 'CONSULT' || active.current || busy || !attempt?.cancelPreviewId || cancellation?.state !== 'CANCELLATION_PENDING'
      || !cancellation.retry?.availableAt || cancellation.retry.used || Date.parse(cancellation.retry.availableAt) > Date.now()) return;
    const saved = { ...attempt, retryRequestId: attempt.retryRequestId || crypto.randomUUID() };
    if (!remember(saved)) return;
    void run(async () => {
      const response = await service.retryCancellation(scope, saved.requestId, saved.previewId, saved.cancelPreviewId, saved.retryRequestId);
      if (mounted.current) { setCancellation(response); onChanged(); onNotice?.(individualCancelNotice(response)); }
    });
  };
  useEffect(() => { if (cancellation?.state === 'CANCELLED') setCancellationOpen(false); }, [cancellation?.state]);
  useEffect(() => {
    const resume = () => { if (!document.hidden) setClock(Date.now()); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);
  useEffect(() => {
    if (document.hidden || busy || !attempt || !supported || operation?.state === 'CANCELLED'
      || issued && issued.state !== 'AWAITING_CONFIRMATION') return;
    let disposed = false;
    const timer = window.setTimeout(async () => {
      if (document.hidden) return;
      if (active.current || issueReadActive.current) { setClock(Date.now()); return; }
      issueReadActive.current = true;
      try {
        const result = await service.reconcile(scope, attempt.requestId, attempt.previewId);
        if (disposed || !mounted.current) return;
        setIssued(result); setError(undefined); onChanged();
        setPreview(result.state === 'PREVIEWED' && result.expiresAt && result.capability ? {
          previewId: result.previewId, expiresAt: result.expiresAt, state: 'PREVIEWED', payload: result.payload, capability: result.capability } : undefined);
        if (['AUTHORIZED', 'REJECTED', 'BLOCKED'].includes(result.state)) onNotice?.(individualIssueNotice(result));
      } catch { if (!disposed && mounted.current) setClock(Date.now()); }
      finally { issueReadActive.current = false; }
    }, 3000);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [attempt?.requestId, attempt?.previewId, issued, busy, supported, clock, scope, service, operation?.state]);
  useEffect(() => {
    if (document.hidden || busy || !attempt?.cancelPreviewId || !supported || issued?.state !== 'AUTHORIZED'
      || cancellation && !['CANCELLATION_PENDING', 'AWAITING_ANALYSIS'].includes(cancellation.state)) return;
    let disposed = false;
    const timer = window.setTimeout(async () => {
      if (document.hidden) return;
      if (active.current || cancellationReadActive.current) { setClock(Date.now()); return; }
      cancellationReadActive.current = true;
      try {
        const result = await service.reconcileCancellation(scope, attempt.requestId, attempt.previewId, attempt.cancelPreviewId!);
        if (disposed || !mounted.current) return;
        setCancellation(result); setError(undefined); onChanged();
        if (!['PREVIEWED', 'CANCELLATION_PENDING', 'AWAITING_ANALYSIS'].includes(result.state)) onNotice?.(individualCancelNotice(result));
      } catch { if (!disposed && mounted.current) setClock(Date.now()); }
      finally { cancellationReadActive.current = false; }
    }, cancellation?.state === 'AWAITING_ANALYSIS' ? 15000 : 3000);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [attempt?.requestId, attempt?.previewId, attempt?.cancelPreviewId, cancellation, issued?.state, busy, supported, clock, scope, service]);
  const payload = issued?.payload || preview?.payload;
  const canOpenCancellation = intent !== 'CONSULT' && issued?.state === 'AUTHORIZED'
    && operation?.state !== 'CANCELLED' && cancellation?.state !== 'CANCELLED';
  useEffect(() => { initialFocusRef.current?.focus(); }, [cancellationOpen]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-fiscal-review-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div ref={dialogRef} className="nfse-fiscal-review-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} aria-busy={busy}>
      <header className="nfse-section-heading"><div><h2 id={title}>{cancellationOpen ? 'Cancelar NFS-e' : intent === 'CONSULT' || issued && issued.state !== 'PREVIEWED' ? 'Consultar NFS-e' : 'Emitir NFS-e'}</h2><p>{label} · {formatNfseMoney(payload?.amount || amount)} · {scope.environment === 'PRODUCAO' ? 'Produção' : 'Homologação'}</p>
        {payload && <p>{payload.modelName} · versão {payload.modelVersion}</p>}</div>
        <button ref={initialFocusRef} type="button" className="nfse-button nfse-button-secondary" aria-label={cancellationOpen ? "Voltar ao resumo da nota" : "Fechar emissão"} disabled={busy} onClick={close}><X size={17} /></button></header>
      <div className="nfse-fiscal-review-body nfse-individual-content">
        {!supported && <p role="status">O executor de emissão deste ambiente ainda não está disponível. Os dados preparados foram preservados.</p>}
        {error && <p className="nfse-individual-state" role="alert">{error}</p>}
        {!cancellationOpen && intent === 'ISSUE' && !attempt && supported && <>
          <p>{source.kind === 'PARTNER_SERVICE' ? 'A competência seguirá a regra salva no pré-modelo. Confira as datas e a descrição final na prévia antes de emitir.'
            : 'O tomador, o modelo e as datas serão conferidos no servidor a partir desta preparação.'}</p>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={prepare}>Atualizar dados para emissão</button>
        </>}
        {!cancellationOpen && payload && (intent === 'CONSULT' || issued?.state === 'AUTHORIZED' ? <>
          <section className="nfse-individual-state" aria-label="Resumo da NFS-e"><strong>NFS-e {issued?.number || 'sem número autorizado'}</strong>
            <dl className="nfse-individual-grid">
              <div><dt>Tomador</dt><dd>{payload.recipientName} · {formatNfseFiscalDocument(payload.recipientDocument)}</dd></div>
              <div><dt>Valor</dt><dd>{formatNfseMoney(payload.amount)}</dd></div>
              <div><dt>Prestação</dt><dd>{formatNfseDate(payload.serviceDate)}</dd></div>
              <div><dt>Competência</dt><dd>{formatNfseDate(payload.competenceDate)}</dd></div>
            </dl><p>{payload.serviceDescription}</p>
          </section>
          <details><summary>Ver detalhes fiscais da nota</summary><NfseIndividualSnapshot payload={payload} /></details></>
          : <details><summary>{intent === 'CANCEL' ? 'Dados da NFS-e autorizada' : 'Ver dados da nota'}</summary><NfseIndividualSnapshot payload={payload} /></details>)}
        {!cancellationOpen && preview && !preview.capability.available && <p role="status">{individualReason(preview.capability.reason)}</p>}
        {!cancellationOpen && intent === 'ISSUE' && preview && (!attempt || issued?.state === 'PREVIEWED') && <>
          {expired && <p role="status">A prévia expirou. Atualize os dados para continuar.</p>}
          {(expired || !preview.capability.available) && attempt && <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={renew}>Atualizar dados desta operação</button>}
        </>}
        {attempt && !busy && (!issued || issued.state === 'AWAITING_CONFIRMATION') && operation?.state !== 'CANCELLED'
          && <p role="status" aria-live="polite">Consultando o resultado automaticamente. Nenhum novo envio será feito.</p>}
        {attempt?.cancelPreviewId && (!cancellation || ['CANCELLATION_PENDING', 'AWAITING_ANALYSIS'].includes(cancellation.state))
          && <p role="status" aria-live="polite">Acompanhando o cancelamento automaticamente, sem reenviar o pedido.</p>}
        {operation?.state === 'CANCELLED' && !cancellation && <p role="status"><strong>Cancelada</strong> · {operation.message || 'O cancelamento desta nota está registrado.'}</p>}
        {!cancellationOpen && issued && <div className="nfse-individual-state" role="status"><strong>{operationLabel(issued.state)}</strong><p>{issued.message}</p>
          {cancellation?.state === 'CANCELLED' && <p>Autorização histórica preservada. O cancelamento confirmado está registrado no evento abaixo.</p>}
          {Boolean(issued.codes?.length) && <p>Código(s) retornado(s): {issued.codes!.join(', ')}</p>}
          {issued.state === 'REJECTED' && individualRejectionExplanation(issued.codes) && <p>Orientação para o código: {individualRejectionExplanation(issued.codes)}</p>}
          {issued.capability?.available === false && <p>{individualReason(issued.capability.reason)}</p>}
          {issued.number && <p>NFS-e {issued.number} · Chave de acesso {issued.accessKey}</p>}</div>}
        {!cancellationOpen && cancellation && <NfseCancellationReadOnlyResult result={cancellation} />}
        {cancellationOpen && payload && <section className="nfse-individual-state" aria-label="Nota selecionada para cancelamento">
          <strong>NFS-e {issued?.number}</strong><p>{payload.recipientName} · {formatNfseFiscalDocument(payload.recipientDocument)}</p>
          <p>Valor: {formatNfseMoney(payload.amount)}</p>
          <details><summary>Ver chave de acesso</summary><p>{issued?.accessKey}</p></details>
        </section>}
        {cancellationOpen && canOpenCancellation && <NfseIndividualCancellation preview={cancelPreview} result={cancellation} busy={busy} existing={Boolean(attempt?.cancelPreviewId)} sent={Boolean(attempt?.cancelPreviewId) && cancellation?.state !== 'PREVIEWED'} expired={cancelExpired}
          scope={scope} model={cancellationModel} detail={detail} onModel={model => { setCancellationModel(model); setDetail(model.requiresDetail ? '' : null); setCancelPreview(undefined); setCancelConfirmed(false); }}
          onDetail={value => { setDetail(value); setCancelPreview(undefined); setCancelConfirmed(false); }}
          justification={justification} confirmed={cancelConfirmed} onJustification={value => { setJustification(value); setCancelPreview(undefined); setCancelConfirmed(false); }} onConfirm={setCancelConfirmed} onPrepare={() => prepareCancel()} onCancel={cancel} onSubmit={() => prepareCancel(true)} />}
        {cancellationOpen && canOpenCancellation && cancellation && <NfseCancellationRetry result={cancellation} busy={busy} onRetry={retryCancel} />}
      </div>
      <footer className="nfse-footer"><span>{busy ? 'Consultando o serviço fiscal…' : cancellationOpen ? 'Cancelar exige motivo e confirmação explícita.' : 'Resumo dos dados fiscais desta nota.'}</span><div className="nfse-queue-actions">
        <button type="button" className="nfse-button nfse-button-secondary" disabled={busy} onClick={close}>{cancellationOpen ? 'Voltar ao resumo' : 'Fechar'}</button>
        {!cancellationOpen && canOpenCancellation && <button type="button" className="nfse-button nfse-button-danger" disabled={busy} onClick={() => { setCancelConfirmed(false); setCancellationOpen(true); }}>Cancelar NFS-e</button>}
        {!cancellationOpen && intent === 'ISSUE' && (!attempt || issued?.state === 'PREVIEWED') && <button type="button" className="nfse-button nfse-button-primary" disabled={!supported || busy || !preview?.capability.available || expired} onClick={issue}>Emitir NFS-e</button>}
      </div></footer>
    </div>
  </div>, document.body);
}
