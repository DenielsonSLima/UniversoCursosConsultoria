import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Search, Send, ShieldCheck } from 'lucide-react';
import type { NfseScope } from '../types/nfse.types';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { nfseHomologationService } from './nfse-homologation.service';
import { nfseHomologationReason, nfseHomologationResultExplanation } from './nfse-homologation.contract';
import NfseHomologationPreview from './NfseHomologationPreview';
import { nfsePilotStorageKey, readPendingNfsePilot, type PendingNfsePilot } from './nfse-homologation.attempt';
import type { NfseHomologationPreflight, NfseHomologationPreview as Preview,
  NfseHomologationResult, NfseHomologationService } from './nfse-homologation.types';
import './nfse-homologation.css';

interface Props { scope: NfseScope; service?: NfseHomologationService }
const checkLabels = { PASSED: 'Verificado', BLOCKED: 'Pendente', UNKNOWN: 'Não confirmado' };
const resultLabels = { AUTHORIZED: 'Nota de teste autorizada', REJECTED: 'Teste rejeitado',
  AWAITING_CONFIRMATION: 'Resultado aguardando confirmação', BLOCKED: 'Teste bloqueado' };

export default function NfseHomologationPanel({ scope, service = nfseHomologationService }: Props) {
  const [preflight, setPreflight] = useState<NfseHomologationPreflight>();
  const [preview, setPreview] = useState<Preview>();
  const [result, setResult] = useState<NfseHomologationResult>();
  const [operationError, setOperationError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'check' | 'preview' | 'issue' | 'reconcile' | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [awaiting, setAwaiting] = useState(false);
  const [expired, setExpired] = useState(false);
  const previewRequest = useRef<string | null>(null), issueRequest = useRef<string | null>(null);
  const pendingAttempt = useRef<PendingNfsePilot | null>(null);
  const storageKey = nfsePilotStorageKey(scope);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  const { toasts, removeToast, toast } = useToast();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    try { pendingAttempt.current = readPendingNfsePilot(window.sessionStorage, storageKey); }
    catch { pendingAttempt.current = null; }
    if (pendingAttempt.current) setAwaiting(true);
  }, [storageKey]);
  useEffect(() => {
    if (!preview) return;
    const delay = Date.parse(preview.expiresAt) - Date.now();
    setExpired(delay <= 0);
    if (delay <= 0) return;
    const timer = setTimeout(() => setExpired(true), Math.min(delay, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [preview]);
  const supported = scope.environment === 'HOMOLOGACAO';
  const canPreview = supported && preflight?.pilot.available && !busy && !awaiting;
  const canIssue = Boolean(supported && preflight?.pilot.available && preview?.capability.available
    && preview.payload && confirmed && !expired && !busy && !awaiting && !result);
  const resultExplanation = result ? nfseHomologationResultExplanation(result) : null;
  const run = async (operation: NonNullable<typeof busy>, action: () => Promise<void>) => {
    if (busyRef.current || !supported) return;
    busyRef.current = true;
    setOperationError(null);
    setBusy(operation);
    try { await action(); }
    catch (error) {
      if (mounted.current) {
        const message = error instanceof Error ? error.message : 'Atualize a consulta antes de continuar.';
        setOperationError(message);
        toast.error('Etapa não confirmada', message);
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(null); }
  };
  const check = () => void run('check', async () => {
    setPreflight(undefined);
    const response = await service.preflight(scope);
    if (mounted.current) setPreflight(response);
  });
  const prepare = () => {
    if (!canPreview) return;
    void run('preview', async () => {
      previewRequest.current ??= crypto.randomUUID();
      const requestId = previewRequest.current;
      const response = await service.preview(scope, requestId);
      if (!mounted.current) return;
      setPreview(response); setConfirmed(false); setResult(undefined); setAwaiting(false);
      issueRequest.current = requestId; previewRequest.current = null;
    });
  };
  const acceptResult = (response: NfseHomologationResult) => {
    if (!mounted.current) return;
    setResult(response); setAwaiting(response.state === 'AWAITING_CONFIRMATION');
    if (response.state !== 'AWAITING_CONFIRMATION') {
      pendingAttempt.current = null;
      try { window.sessionStorage.removeItem(storageKey); } catch { /* A later read can still recover the terminal result. */ }
    }
  };
  const issue = () => {
    if (!canIssue || !preview || !issueRequest.current || Date.parse(preview.expiresAt) <= Date.now()) return;
    const requestId = issueRequest.current, previewId = preview.previewId;
    const pending = { requestId, previewId };
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(pending)); }
    catch {
      const message = 'Não foi possível preservar a tentativa nesta sessão. Verifique o armazenamento do navegador antes de enviar.';
      setOperationError(message);
      toast.error('Teste não iniciado', message);
      return;
    }
    pendingAttempt.current = pending;
    setAwaiting(true);
    void run('issue', async () => acceptResult(await service.issue(scope, requestId, previewId)));
  };
  const reconcile = () => {
    const pending = pendingAttempt.current;
    if (!awaiting || !pending || busy) return;
    void run('reconcile', async () => acceptResult(await service.reconcile(scope, pending.requestId, pending.previewId)));
  };
  return <section className="nfse-panel nfse-homologation" aria-label="Teste individual de homologação">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="nfse-section-heading">
      <div><h2><FlaskConical size={17} />Homologação da matriz</h2>
        <p>Verifique o acesso e emita uma nota técnica de teste, sem valor fiscal.</p></div>
      <span className="nfse-environment"><ShieldCheck size={14} />Homologação · testes</span>
    </header>
    <div className="nfse-homologation-content">
      <p className="nfse-inline-help">O teste utiliza dados sintéticos e não utiliza os alunos, os recebimentos ou as notas da fila de pendentes.</p>
      {operationError && <div className="nfse-homologation-state" data-tone="error" role="alert">
        <strong>Etapa não confirmada</strong><p>{operationError}</p></div>}
      {!supported ? <p role="alert">Este teste está disponível somente em homologação.</p> : <>
        <div className="nfse-homologation-step"><h3>1. Conferir acesso fiscal</h3>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={Boolean(busy) || awaiting} onClick={check}>
            <Search size={15} />{busy === 'check' ? 'Verificando…' : 'Verificar conexão e habilitação'}</button></div>
        {preflight && <div aria-live="polite">
          <ul className="nfse-homologation-checks">{preflight.checks.map(item => <li key={item.code}>
            <span className="nfse-status" data-tone={item.status === 'PASSED' ? 'success' : 'warning'}>{checkLabels[item.status]}</span>
            <span>{item.message}</span></li>)}</ul>
          <p className="nfse-inline-help">Consulta em {new Date(preflight.checkedAt).toLocaleString('pt-BR', { timeZone: 'America/Maceio' })}.
            {' '}Data de referência da consulta: {preflight.referenceDate.split('-').reverse().join('/')}.</p>
          {!preflight.pilot.available && <p className="nfse-homologation-state" role="status">{nfseHomologationReason(preflight.pilot.reason)}</p>}
        </div>}
        <div className="nfse-homologation-step"><h3>2. Revisar teste individual</h3>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={!canPreview} onClick={prepare}>
            {busy === 'preview' ? 'Preparando revisão…' : preview ? 'Preparar novo teste' : 'Preparar nota de teste'}</button></div>
        {preview && <>
          {!preview.capability.available && <p className="nfse-homologation-state" role="status">{nfseHomologationReason(preview.capability.reason)}</p>}
          {preview.payload && <NfseHomologationPreview payload={preview.payload} />}
          {preview.payload && !result && !awaiting && <label className="nfse-homologation-confirm">
            <input type="checkbox" checked={confirmed} disabled={Boolean(busy) || expired || !preview.capability.available}
              onChange={event => setConfirmed(event.target.checked)} />
            <span>Revisei os dados e autorizo o envio desta única nota de teste em homologação, sem valor fiscal.</span></label>}
          {expired && !awaiting && !result && <p className="nfse-homologation-state" role="status">A revisão expirou. Prepare uma nova nota de teste.</p>}
        </>}
        <div className="nfse-homologation-step"><h3>3. Transmitir e conferir resultado</h3>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!canIssue} onClick={issue}>
            <Send size={15} />{busy === 'issue' ? 'Transmitindo teste…' : 'Emitir uma nota de teste'}</button></div>
        {awaiting && <div className="nfse-homologation-state" role="status">
          <p>O envio ainda não tem resultado confirmado. Consulte a mesma tentativa antes de preparar outro teste.</p>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={Boolean(busy)} onClick={reconcile}>
            {busy === 'reconcile' ? 'Consultando…' : 'Consultar resultado do teste'}</button></div>}
        {result && <div className="nfse-homologation-state" role="status" data-state={result.state}>
          <strong>{resultLabels[result.state]}</strong><p>{result.message}</p>
          {resultExplanation && <p>{resultExplanation}</p>}
          {result.state === 'AUTHORIZED' && <p>Número: {result.number}<br />Chave de acesso: <span className="nfse-homologation-key">{result.accessKey}</span></p>}
        </div>}
      </>}
    </div>
  </section>;
}
