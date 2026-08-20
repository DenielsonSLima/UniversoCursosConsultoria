import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ExternalLink,
  Eye,
  FileSignature,
  FileText,
  Loader2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  ElectronicSignatureArtifactDownload,
  ElectronicSignatureInboxItem,
  ElectronicSignatureProfile,
} from './assinatura-eletronica.contract';
import { electronicSignatureQueryKeys } from './assinatura-eletronica.contract';
import {
  ElectronicSignatureRequestError,
  electronicSignatureService,
} from './assinatura-eletronica.service';
import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from './electronic-signature-request-id';

interface ElectronicSignatureActionModalProps {
  isOpen: boolean;
  item: ElectronicSignatureInboxItem | null;
  profile: ElectronicSignatureProfile;
  contextId: string;
  poloId?: string | null;
  onClose: () => void;
}

const newRequestId = () => {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Este navegador não oferece a chave segura exigida para assinar.');
  }
  return globalThis.crypto.randomUUID();
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Informado pelo serviço';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(parsed);
};

const errorMessage = (error: unknown) => {
  if (!(error instanceof ElectronicSignatureRequestError)) {
    return error instanceof Error
      ? error.message
      : 'Não foi possível concluir a assinatura.';
  }
  if (error.code === 'PASSWORD_REAUTH_UNAVAILABLE') {
    return 'Esta conta ainda não possui senha. Configure uma senha pela recuperação de acesso antes de assinar.';
  }
  if (error.code === 'INVALID_PASSWORD') return 'A senha informada não confere.';
  if (error.code === 'SIGNATURE_ORDER_BLOCKED') {
    return 'A assinatura anterior ainda não foi concluída. Atualize o documento e tente novamente depois.';
  }
  if (error.code === 'SIGNATURE_POLICY_DISABLED') {
    return 'A política deste documento ainda não foi habilitada pelo serviço autorizado.';
  }
  if (error.code === 'RATE_LIMITED') {
    return error.retryAfterSeconds
      ? `Muitas tentativas. Aguarde ${error.retryAfterSeconds} segundos e tente novamente.`
      : 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  return error.message;
};

const ElectronicSignatureActionModal: React.FC<ElectronicSignatureActionModalProps> = ({
  isOpen,
  item,
  profile,
  contextId,
  poloId = null,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const requestIdRef = useRef<string | null>(null);
  const ticketRef = useRef<{ value: string; expiresAt: number } | null>(null);
  const mountedRef = useRef(true);
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const submittingRef = useRef(false);
  const actionIdentity = `${profile}:${contextId}:${item?.envelopeId || 'sem-envelope'}:${item?.participantId || 'sem-participante'}`;
  const activeActionIdentityRef = useRef(actionIdentity);
  activeActionIdentityRef.current = actionIdentity;
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [finalizationFailure, setFinalizationFailure] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [isOpeningOriginal, setIsOpeningOriginal] = useState(false);
  const [originalFailure, setOriginalFailure] = useState<string | null>(null);
  const [originalNotice, setOriginalNotice] = useState<string | null>(null);
  const [originalDownload, setOriginalDownload] = useState<ElectronicSignatureArtifactDownload | null>(null);

  closeRef.current = onClose;
  submittingRef.current = isSubmitting || isFinalizing;

  const detailQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.envelope(
      profile,
      contextId,
      item?.envelopeId || 'sem-envelope',
    ),
    queryFn: () => {
      if (!item) throw new Error('O envelope não foi selecionado.');
      return electronicSignatureService.getEnvelope({
        envelopeId: item.envelopeId,
        profile,
        contextId,
      });
    },
    enabled: isOpen && Boolean(item && contextId),
    staleTime: 0,
    retry: false,
  });
  const canonicalParticipant = detailQuery.data?.participant;
  const isSignatureCandidate = Boolean(
    item?.canAct
    && item.primaryAction === 'SIGN'
    && item.participantId
    && canonicalParticipant?.canAct
    && canonicalParticipant.participantId === item.participantId,
  );
  const consentTermQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.consentTerm(
      profile,
      contextId,
      item?.envelopeId || 'sem-envelope',
      item?.participantId || 'sem-participante',
    ),
    queryFn: () => {
      if (!item?.participantId) throw new Error('O participante não foi selecionado.');
      return electronicSignatureService.getConsentTerm({
        envelopeId: item.envelopeId,
        participantId: item.participantId,
        profile,
        contextId,
      });
    },
    enabled: isOpen && Boolean(contextId) && isSignatureCandidate,
    staleTime: 0,
    retry: false,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ticketRef.current = null;
      requestIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    setPassword('');
    setFailure(null);
    setSuccessMessage(null);
    setIsSubmitting(false);
    setIsFinalizing(false);
    setFinalizationFailure(null);
    setConsentAccepted(false);
    setIsOpeningOriginal(false);
    setOriginalFailure(null);
    setOriginalNotice(null);
    setOriginalDownload(null);
    ticketRef.current = null;
    requestIdRef.current = null;
  }, [contextId, isOpen, item?.envelopeId, item?.participantId, profile]);

  useEffect(() => {
    setConsentAccepted(false);
    ticketRef.current = null;
    requestIdRef.current = null;
  }, [consentTermQuery.data?.sha256, consentTermQuery.data?.termId]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!submittingRef.current) closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable: HTMLElement[] = [];
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ).forEach((element) => {
        if (!element.hasAttribute('hidden')) focusable.push(element);
      });
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen || !item || typeof document === 'undefined') return null;

  const detail = detailQuery.data;
  const isSignatureAction = item.canAct && item.primaryAction === 'SIGN';
  const canSign = isSignatureCandidate;
  const consentTerm = consentTermQuery.data;
  const canRequestOriginal = Boolean(
    (profile === 'PROFESSOR' || profile === 'COORDENADOR')
    && detail?.envelope.original.ready,
  );
  const hasValidTicket = Boolean(
    ticketRef.current && ticketRef.current.expiresAt > Date.now(),
  );
  const canonicalParticipants = detail?.participants ?? [];
  const canRecoverFinalization = Boolean(
    item.participantId
    && canonicalParticipant?.participantId === item.participantId
    && canonicalParticipant.status === 'ASSINADO'
    && canonicalParticipant.order === canonicalParticipants.length
    && canonicalParticipants.length > 0
    && canonicalParticipants.every((participant) => participant.status === 'ASSINADO')
    && detail?.envelope.status === 'FINALIZANDO'
    && !detail.envelope.final.ready,
  );

  const closeSafely = () => {
    if (isSubmitting || isFinalizing) return;
    onClose();
  };

  const invalidateCanonicalState = async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: ['assinatura-eletronica', 'inbox', profile, contextId, poloId],
      }),
      queryClient.invalidateQueries({
        queryKey: electronicSignatureQueryKeys.envelope(profile, contextId, item.envelopeId),
      }),
      queryClient.invalidateQueries({
        queryKey: electronicSignatureQueryKeys.diaryEnvelopes(),
      }),
    ]);
  };

  const finalizeOfficialDiary = async () => {
    const scope = [profile, contextId, item.envelopeId] as const;
    const requestId = getOrCreateElectronicSignatureRequestId('FINALIZE_DIARY', scope);
    const result = await electronicSignatureService.processDiaryArtifact({
      action: 'FINALIZE',
      envelopeId: item.envelopeId,
      requestId,
    });
    clearElectronicSignatureRequestId('FINALIZE_DIARY', scope);
    await invalidateCanonicalState();
    return result;
  };

  const retryFinalization = async () => {
    if (!canRecoverFinalization && !finalizationFailure) return;
    setFinalizationFailure(null);
    setFailure(null);
    setIsFinalizing(true);
    try {
      await finalizeOfficialDiary();
      if (!mountedRef.current) return;
      setSuccessMessage('Sua assinatura foi registrada e o documento final oficial foi preparado.');
    } catch (error) {
      if (mountedRef.current) setFinalizationFailure(errorMessage(error));
    } finally {
      if (mountedRef.current) setIsFinalizing(false);
    }
  };

  const openAuthorizedUrl = (download: ElectronicSignatureArtifactDownload) => {
    if (typeof window === 'undefined') return;
    const previewWindow = window.open(download.url, '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      setOriginalNotice(null);
    } else {
      setOriginalNotice('O navegador bloqueou a nova aba. Use o link temporário exibido abaixo.');
    }
  };

  const openOriginalDocument = async () => {
    if (typeof window === 'undefined') return;
    if (!canRequestOriginal || !consentTerm) return;
    if (originalDownload && Date.parse(originalDownload.expiresAt) > Date.now()) {
      openAuthorizedUrl(originalDownload);
      return;
    }
    const operationIdentity = actionIdentity;
    // A janela nasce no gesto do usuário; depois do await apenas navegamos a mesma janela.
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = 'Autorizando documento…';
      previewWindow.document.body.textContent = 'Autorizando acesso temporário ao PDF…';
    }
    const scope = [profile, contextId, item.envelopeId, 'DOCUMENTO_ORIGINAL'] as const;
    setIsOpeningOriginal(true);
    setOriginalFailure(null);
    setOriginalNotice(null);
    try {
      const requestId = getOrCreateElectronicSignatureRequestId(
        'CREATE_ARTIFACT_DOWNLOAD_URL',
        scope,
      );
      if (profile !== 'PROFESSOR' && profile !== 'COORDENADOR') {
        throw new Error('Este perfil não possui uma classe de leitura autorizada para o original.');
      }
      const download = await electronicSignatureService.createArtifactDownloadUrl({
        envelopeId: item.envelopeId,
        artifactClass: 'DOCUMENTO_ORIGINAL',
        profile,
        contextId,
        requestId,
      });
      clearElectronicSignatureRequestId('CREATE_ARTIFACT_DOWNLOAD_URL', scope);
      if (
        !mountedRef.current
        || activeActionIdentityRef.current !== operationIdentity
      ) {
        previewWindow?.close();
        return;
      }
      setOriginalDownload(download);
      if (previewWindow && !previewWindow.closed) {
        previewWindow.location.replace(download.url);
      } else {
        setOriginalNotice('O navegador bloqueou a nova aba. Use o link temporário exibido abaixo.');
      }
    } catch (error) {
      previewWindow?.close();
      if (mountedRef.current && activeActionIdentityRef.current === operationIdentity) {
        setOriginalFailure(errorMessage(error));
      }
    } finally {
      if (mountedRef.current && activeActionIdentityRef.current === operationIdentity) {
        setIsOpeningOriginal(false);
      }
    }
  };

  const confirm = async () => {
    if (!canSign || !item.participantId) return;
    if (!consentTerm || !consentAccepted) {
      setFailure('Leia o termo e marque o aceite antes de confirmar a assinatura.');
      return;
    }
    if (!canRequestOriginal) {
      setFailure('O PDF original ainda não está disponível para conferência neste perfil.');
      return;
    }
    let currentTicket = ticketRef.current;
    if (currentTicket && currentTicket.expiresAt <= Date.now()) {
      ticketRef.current = null;
      requestIdRef.current = null;
      currentTicket = null;
    }
    if (!currentTicket && !password) {
      setFailure('O prazo da confirmação expirou. Digite sua senha novamente.');
      return;
    }
    setFailure(null);
    setFinalizationFailure(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    try {
      const requestId = requestIdRef.current || newRequestId();
      requestIdRef.current = requestId;
      if (!currentTicket) {
        const reauthentication = await electronicSignatureService.reauthenticateForSignature({
          envelopeId: item.envelopeId,
          participantId: item.participantId,
          profile,
          contextId,
          requestId,
          password,
          consent: {
            accepted: true,
            termId: consentTerm.termId,
            sha256: consentTerm.sha256,
          },
        });
        setPassword('');
        ticketRef.current = {
          value: reauthentication.ticket,
          expiresAt: Date.parse(reauthentication.expiresAt),
        };
      }

      const activeTicket = ticketRef.current;
      if (!activeTicket) throw new Error('O serviço não emitiu a confirmação de identidade.');
      const result = await electronicSignatureService.confirmSignature({
        requestId,
        ticket: activeTicket.value,
      });
      ticketRef.current = null;
      requestIdRef.current = null;
      if (!mountedRef.current) return;
      if (result.requiresFinalization) {
        try {
          await finalizeOfficialDiary();
          if (mountedRef.current) {
            setSuccessMessage('Sua assinatura foi registrada e o documento final oficial foi preparado.');
          }
        } catch (error) {
          if (!mountedRef.current) return;
          setFinalizationFailure(errorMessage(error));
          await invalidateCanonicalState();
        }
      } else {
        setSuccessMessage(
          result.nextParticipantRole
            ? 'Sua assinatura foi registrada. O documento seguiu para o próximo participante.'
            : 'Sua assinatura foi registrada com sucesso.',
        );
        await invalidateCanonicalState();
      }
    } catch (error) {
      if (!mountedRef.current) return;
      if (
        error instanceof ElectronicSignatureRequestError
        && ['REAUTH_TICKET_INVALID', 'REAUTH_TICKET_EXPIRED', 'REAUTH_TICKET_CONSUMED'].includes(error.code)
      ) {
        ticketRef.current = null;
        requestIdRef.current = null;
      }
      setFailure(errorMessage(error));
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar confirmação de assinatura"
        className="absolute inset-0 cursor-default bg-[#001a33]/70 backdrop-blur-sm"
        onClick={closeSafely}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="electronic-signature-action-title"
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <FileSignature size={21} />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">
                  {isSignatureAction ? 'Confirmação protegida' : 'Detalhes do documento'}
                </p>
                <h2 id="electronic-signature-action-title" className="mt-1 truncate text-xl font-black tracking-tight text-[#001a33]">
                  {item.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={closeSafely}
              disabled={isSubmitting || isFinalizing}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {detailQuery.isPending ? (
            <div className="flex min-h-44 items-center justify-center gap-3 text-sm font-bold text-slate-500" role="status">
              <Loader2 size={20} className="animate-spin text-blue-600" /> Conferindo envelope e ordem…
            </div>
          ) : detailQuery.isError ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5">
              <p className="text-sm font-black text-rose-800">Não foi possível conferir este envelope.</p>
              <button type="button" onClick={() => void detailQuery.refetch()} className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-xs font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100">
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          ) : detail ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Papel neste documento</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{canonicalParticipant?.roleLabel || 'Consulta'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Revisão</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{detail.envelope.revisionLabel}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Prazo</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{formatDateTime(detail.envelope.deadlineAt)}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={20} className="mt-0.5 shrink-0 text-blue-700" />
                  <div>
                    <p className="text-sm font-black text-[#001a33]">Você confirmará o PDF original congelado</p>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                      A senha apenas confirma sua identidade neste ato. Ela não é armazenada pelo sistema e não substitui sua sessão atual.
                    </p>
                    {detail.envelope.original.sha256 ? (
                      <p className="mt-3 break-all font-mono text-[9px] font-bold text-slate-500">SHA-256 {detail.envelope.original.sha256}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {successMessage ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                  <CheckCircle2 className="mx-auto text-emerald-600" size={27} />
                  <p className="mt-3 text-sm font-black text-emerald-900">{successMessage}</p>
                  <button type="button" onClick={onClose} className="mt-5 h-11 rounded-xl bg-emerald-700 px-6 text-xs font-black uppercase tracking-wide text-white hover:bg-emerald-800">Concluir</button>
                </div>
              ) : finalizationFailure || canRecoverFinalization ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <p className="text-sm font-black text-amber-900">A assinatura já foi registrada.</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-amber-800">
                    {finalizationFailure || 'O documento final oficial ainda precisa ser concluído pelo serviço.'}
                  </p>
                  <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={closeSafely} disabled={isFinalizing} className="h-11 rounded-xl border border-amber-200 bg-white px-5 text-xs font-black uppercase tracking-wide text-amber-800 disabled:opacity-50">Fechar</button>
                    <button type="button" onClick={() => void retryFinalization()} disabled={isFinalizing} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-xs font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                      {isFinalizing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                      {isFinalizing ? 'Finalizando…' : 'Tentar finalizar documento'}
                    </button>
                  </div>
                </div>
              ) : !canSign ? (
                <div className={`rounded-2xl border p-5 ${item.primaryAction === 'VIEW' ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className={`text-sm font-black ${item.primaryAction === 'VIEW' ? 'text-[#001a33]' : 'text-amber-900'}`}>
                    {item.primaryAction === 'VIEW'
                      ? 'Documento disponível para consulta.'
                      : 'A assinatura não está disponível neste momento.'}
                  </p>
                  <p className={`mt-1 text-xs font-medium leading-relaxed ${item.primaryAction === 'VIEW' ? 'text-slate-600' : 'text-amber-800'}`}>{item.message || canonicalParticipant?.statusLabel || detail.envelope.statusLabel}</p>
                </div>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void confirm();
                  }}
                  className="space-y-5 rounded-2xl border border-slate-200 p-5"
                  aria-busy={isSubmitting || consentTermQuery.isPending || isOpeningOriginal}
                >
                  <section aria-label="Termo de aceite da assinatura">
                    {consentTermQuery.isPending ? (
                      <div className="flex min-h-24 items-center justify-center gap-3 rounded-xl bg-slate-50 text-xs font-bold text-slate-500" role="status">
                        <Loader2 size={17} className="animate-spin text-blue-600" /> Carregando termo canônico…
                      </div>
                    ) : consentTermQuery.isError ? (
                      <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                        <p role="alert" className="text-xs font-bold leading-relaxed text-rose-700">
                          O termo de aceite não pôde ser carregado. A assinatura permanece bloqueada.
                        </p>
                        <button
                          type="button"
                          onClick={() => void consentTermQuery.refetch()}
                          className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100"
                        >
                          <RefreshCw size={14} /> Tentar novamente
                        </button>
                      </div>
                    ) : consentTerm ? (
                      <div className="space-y-4">
                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 id="electronic-signature-consent-title" className="text-base font-black text-[#001a33]">
                              {consentTerm.title}
                            </h3>
                            <span className="rounded-full bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700">
                              {consentTerm.versionLabel}
                            </span>
                          </div>
                          <p className="mt-2 text-xs font-medium leading-relaxed text-slate-600">
                            Leia todos os blocos e confira o PDF original antes de aceitar.
                          </p>
                        </div>
                        <div className="max-h-64 space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4" tabIndex={0} aria-label="Conteúdo integral do termo de aceite">
                          {consentTerm.sections.map((section) => (
                            <article key={section.id} aria-labelledby={`consent-section-${section.id}`}>
                              <h4 id={`consent-section-${section.id}`} className="text-xs font-black text-[#001a33]">
                                {section.title}
                              </h4>
                              <p className="mt-1 whitespace-pre-line text-xs font-medium leading-relaxed text-slate-600">
                                {section.body}
                              </p>
                            </article>
                          ))}
                        </div>
                        <p className="break-all font-mono text-[9px] font-bold text-slate-400">
                          Termo SHA-256 {consentTerm.sha256}
                        </p>
                      </div>
                    ) : null}
                  </section>

                  <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <FileText size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
                        <div>
                          <p className="text-xs font-black text-[#001a33]">Documento que será assinado</p>
                          <p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-600">
                            Acesso temporário autorizado pelo serviço, sem expor o endereço interno do arquivo.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void openOriginalDocument()}
                        disabled={!consentTerm || !canRequestOriginal || isOpeningOriginal || isSubmitting}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-blue-700 shadow-sm ring-1 ring-blue-100 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isOpeningOriginal ? <Loader2 size={15} className="animate-spin" /> : <ExternalLink size={15} />}
                        {isOpeningOriginal ? 'Autorizando…' : 'Visualizar PDF original'}
                      </button>
                    </div>
                    {!canRequestOriginal ? (
                      <p role="alert" className="mt-3 text-[11px] font-bold leading-relaxed text-amber-800">
                        O original não está pronto ou este perfil não possui leitura autorizada. O aceite permanece indisponível.
                      </p>
                    ) : null}
                    {originalFailure ? (
                      <p role="alert" className="mt-3 text-[11px] font-bold leading-relaxed text-rose-700">{originalFailure}</p>
                    ) : null}
                    {originalNotice ? (
                      <p role="status" className="mt-3 text-[11px] font-bold leading-relaxed text-blue-800">{originalNotice}</p>
                    ) : null}
                    {originalDownload ? (
                      <a
                        href={originalDownload.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
                      >
                        <ExternalLink size={13} /> Abrir novamente enquanto o link estiver válido
                      </a>
                    ) : null}
                  </div>

                  <label
                    htmlFor="electronic-signature-consent"
                    className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                      consentAccepted
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 bg-white'
                    } ${!consentTerm || !canRequestOriginal ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                  >
                    <input
                      id="electronic-signature-consent"
                      type="checkbox"
                      checked={consentAccepted}
                      onChange={(event) => {
                        setConsentAccepted(event.target.checked);
                        setFailure(null);
                      }}
                      disabled={!consentTerm || !canRequestOriginal || isSubmitting}
                      aria-describedby="electronic-signature-consent-message"
                      className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-blue-700 focus:ring-4 focus:ring-blue-100"
                    />
                    <span id="electronic-signature-consent-message" className="text-xs font-bold leading-relaxed text-[#001a33]">
                      {consentTerm?.confirmationMessage || 'Aguarde o carregamento do termo canônico para registrar seu aceite.'}
                    </span>
                  </label>

                  <div>
                    <label htmlFor="electronic-signature-password" className="text-xs font-black uppercase tracking-wide text-[#001a33]">
                      Repita sua senha de acesso
                    </label>
                    <p id="electronic-signature-password-help" className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">
                      A nova autenticação registra o instante oficial no servidor. Sua senha não integra o comprovante.
                    </p>
                    <div className="relative mt-2">
                      <LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="electronic-signature-password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        disabled={isSubmitting}
                        aria-describedby="electronic-signature-password-help"
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-bold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  </div>
                  {failure ? <p role="alert" className="text-xs font-bold leading-relaxed text-rose-700">{failure}</p> : null}
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={closeSafely} disabled={isSubmitting} className="h-11 rounded-xl border border-slate-200 px-5 text-xs font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
                    <button
                      type="submit"
                      disabled={
                        isSubmitting
                        || !consentTerm
                        || !consentAccepted
                        || !canRequestOriginal
                        || (!password && !hasValidTicket)
                      }
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-6 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-blue-950/15 hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                    >
                      {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
                      {isSubmitting
                        ? 'Confirmando…'
                        : hasValidTicket
                          ? 'Tentar confirmar novamente'
                          : 'Confirmar e assinar'}
                    </button>
                  </div>
                </form>
              )}

              <div className="flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-500">
                <Eye size={14} /> O horário oficial e a ordem dos participantes são registrados pelo serviço.
              </div>
            </>
          ) : null}
        </div>
      </section>
    </div>,
    document.body,
  );
};

export default ElectronicSignatureActionModal;
