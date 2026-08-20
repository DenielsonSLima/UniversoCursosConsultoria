import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Archive,
  CalendarDays,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  FilterX,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  X,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import type {
  ElectronicSignatureArchiveCursor,
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureArchiveItem,
  ElectronicSignatureArtifactClass,
  ElectronicSignatureArtifactDownload,
} from '../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import { electronicSignatureQueryKeys } from '../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import {
  ElectronicSignatureRequestError,
  electronicSignatureService,
} from '../../../shared/assinatura-eletronica/assinatura-eletronica.service';
import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from '../../../shared/assinatura-eletronica/electronic-signature-request-id';
import { secretariaAssinaturasAcervoService } from './secretaria-assinaturas-acervo.service';

interface SecretariaAssinaturasAcervoProps {
  contextId: string;
  poloId?: string | null;
}

const INITIAL_FILTERS: ElectronicSignatureArchiveFilters = {
  search: '',
  status: 'TODOS',
  documentType: null,
  turmaId: null,
  finalizedFrom: null,
  finalizedTo: null,
};

const fieldClassName = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#001a33] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data informada pelo serviço';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(date);
};

const roleLabel = (role: string) => ({
  PROFESSOR: 'Professor(a)',
  COORDENADOR: 'Coordenador(a)',
}[role] || role);

const artifactLabel = (artifactClass: ElectronicSignatureArtifactClass) => (
  artifactClass === 'DOCUMENTO_FINAL' ? 'documento final' : 'comprovante de evidências'
);

const archiveErrorMessage = (error: unknown) => {
  if (error instanceof ElectronicSignatureRequestError) return error.message;
  return error instanceof Error ? error.message : 'Tente novamente.';
};

interface ArchiveDetailDialogProps {
  item: ElectronicSignatureArchiveItem | null;
  busyArtifactClass: ElectronicSignatureArtifactClass | null;
  authorizedDownload: ElectronicSignatureArtifactDownload | null;
  onClose: () => void;
  onOpenArtifact: (
    item: ElectronicSignatureArchiveItem,
    artifactClass: 'DOCUMENTO_FINAL' | 'COMPROVANTE_EVIDENCIA',
  ) => void;
}

const ArchiveDetailDialog: React.FC<ArchiveDetailDialogProps> = ({
  item,
  busyArtifactClass,
  authorizedDownload,
  onClose,
  onOpenArtifact,
}) => {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busyArtifactClass);
  closeRef.current = onClose;
  busyRef.current = busyArtifactClass;

  useEffect(() => {
    if (!item || typeof document === 'undefined') return undefined;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) {
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable: HTMLElement[] = [];
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ).forEach((element) => {
        if (!element.hasAttribute('hidden')) focusable.push(element);
      });
      if (!focusable.length) {
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [item?.envelopeId]);

  if (!item || typeof document === 'undefined') return null;
  const statusClassName = item.status === 'ASSINADO'
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : 'bg-slate-100 text-slate-700 ring-slate-200';
  const downloadMatchesItem = authorizedDownload?.envelopeId === item.envelopeId;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-[100dvh] items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        aria-label="Fechar detalhes do documento"
        className="absolute inset-0 cursor-default bg-[#001a33]/70 backdrop-blur-sm"
        onClick={() => { if (!busyArtifactClass) onClose(); }}
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-detail-title"
        aria-busy={Boolean(busyArtifactClass)}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-white/70 bg-white shadow-2xl shadow-slate-950/30 sm:max-h-[calc(100dvh-3rem)]"
      >
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <FileCheck2 size={21} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Documento assinado</p>
                <h2 id="archive-detail-title" className="mt-1 text-xl font-black tracking-tight text-[#001a33]">
                  {item.title}
                </h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{item.revisionLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={Boolean(busyArtifactClass)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </div>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-[9px] font-black uppercase tracking-wide ring-1 ${statusClassName}`}>
              {item.status === 'ASSINADO' ? 'Assinado' : 'Substituído'}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-wide text-blue-700 ring-1 ring-blue-100">
              Diário de classe
            </span>
          </div>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Turma</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{item.turmaNome}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Disciplina</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{item.disciplinaNome}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Finalização oficial</dt>
              <dd className="mt-1 text-sm font-black text-[#001a33]">{formatDateTime(item.finalizedAt)}</dd>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Código de validação</dt>
              <dd className="mt-1 break-all text-sm font-black text-[#001a33]">
                {item.validationCode || 'Não informado'}
              </dd>
              {item.validationCode ? (
                <a
                  href={`/validador?code=${encodeURIComponent(item.validationCode)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
                >
                  <ExternalLink size={13} /> Conferir no validador público
                </a>
              ) : null}
            </div>
          </dl>

          <section aria-labelledby="archive-signers-title">
            <div className="mb-3 flex items-center gap-2">
              <UserRoundCheck size={17} className="text-blue-700" aria-hidden="true" />
              <h3 id="archive-signers-title" className="text-sm font-black text-[#001a33]">Registro dos signatários</h3>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {item.signers.map((signer, signerIndex) => (
                <div key={`${item.envelopeId}:signer:${signerIndex}`} className="rounded-2xl border border-slate-200 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wide text-blue-600">{roleLabel(signer.role)}</p>
                  <p className="mt-1 text-sm font-black text-[#001a33]">{signer.name}</p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">Assinado em {formatDateTime(signer.signedAt)}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Integridade do documento final</p>
            <p className="mt-2 break-all font-mono text-[9px] font-bold leading-relaxed text-slate-600">SHA-256 {item.sha256}</p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
              <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
                Cada ação solicita uma URL HTTPS temporária de 2 minutos. O endereço interno do Storage não é enviado para esta tela.
              </p>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => onOpenArtifact(item, 'DOCUMENTO_FINAL')}
                disabled={!item.artifacts.final || Boolean(busyArtifactClass)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busyArtifactClass === 'DOCUMENTO_FINAL' ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                {busyArtifactClass === 'DOCUMENTO_FINAL' ? 'Autorizando…' : 'Visualizar documento final'}
              </button>
              <button
                type="button"
                onClick={() => onOpenArtifact(item, 'COMPROVANTE_EVIDENCIA')}
                disabled={!item.artifacts.receipt || Boolean(busyArtifactClass)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyArtifactClass === 'COMPROVANTE_EVIDENCIA' ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {busyArtifactClass === 'COMPROVANTE_EVIDENCIA' ? 'Autorizando…' : 'Abrir comprovante'}
              </button>
            </div>
            {downloadMatchesItem ? (
              <a
                href={authorizedDownload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-blue-700 underline underline-offset-4"
              >
                <ExternalLink size={13} /> Reabrir {artifactLabel(authorizedDownload.artifactClass)} enquanto o link estiver válido
              </a>
            ) : null}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
};

const SecretariaAssinaturasAcervo: React.FC<SecretariaAssinaturasAcervoProps> = ({
  contextId,
  poloId = null,
}) => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const normalizedPoloId = poloId || null;
  const scopeIdentity = `${contextId}:${normalizedPoloId || 'todos-os-polos'}`;
  const activeScopeIdentityRef = useRef(scopeIdentity);
  activeScopeIdentityRef.current = scopeIdentity;
  const [draftFilters, setDraftFilters] = useState<ElectronicSignatureArchiveFilters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ElectronicSignatureArchiveFilters>(INITIAL_FILTERS);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ElectronicSignatureArchiveItem | null>(null);
  const [authorizedDownload, setAuthorizedDownload] = useState<ElectronicSignatureArtifactDownload | null>(null);
  const stableFilters = useMemo(() => ({ ...appliedFilters }), [appliedFilters]);

  useEffect(() => {
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setSelectedItem(null);
    setAuthorizedDownload(null);
    setFilterError(null);
  }, [contextId, normalizedPoloId]);

  useEffect(() => {
    setAuthorizedDownload(null);
  }, [selectedItem?.envelopeId]);

  const turmasQuery = useQuery({
    queryKey: electronicSignatureQueryKeys.archiveTurmas('GESTOR', contextId, normalizedPoloId),
    queryFn: () => {
      if (!normalizedPoloId) throw new Error('Selecione um polo para listar as turmas.');
      return secretariaAssinaturasAcervoService.listTurmas({
        contextId,
        poloId: normalizedPoloId,
      });
    },
    enabled: Boolean(contextId && normalizedPoloId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const archiveQuery = useInfiniteQuery({
    queryKey: electronicSignatureQueryKeys.archiveList(
      'GESTOR',
      contextId,
      normalizedPoloId,
      stableFilters,
    ),
    queryFn: ({ pageParam }) => electronicSignatureService.listGestorArchive({
      contextId,
      poloId: normalizedPoloId,
      filters: stableFilters,
      limit: 50,
      cursor: pageParam,
    }),
    initialPageParam: null as ElectronicSignatureArchiveCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    enabled: Boolean(contextId),
    staleTime: 30_000,
    retry: false,
  });

  const artifactMutation = useMutation({
    mutationFn: (attempt: {
      item: ElectronicSignatureArchiveItem;
      artifactClass: 'DOCUMENTO_FINAL' | 'COMPROVANTE_EVIDENCIA';
      requestId: string;
      scope: readonly string[];
      scopeIdentity: string;
      previewWindow: Window | null;
    }) => electronicSignatureService.createArtifactDownloadUrl({
      envelopeId: attempt.item.envelopeId,
      artifactClass: attempt.artifactClass,
      profile: 'GESTOR',
      contextId,
      requestId: attempt.requestId,
    }),
    onSuccess: (download, attempt) => {
      clearElectronicSignatureRequestId(
        'CREATE_ARTIFACT_DOWNLOAD_URL',
        attempt.scope,
      );
      if (attempt.scopeIdentity !== activeScopeIdentityRef.current) {
        attempt.previewWindow?.close();
        return;
      }
      setAuthorizedDownload(download);
      if (attempt.previewWindow && !attempt.previewWindow.closed) {
        attempt.previewWindow.location.replace(download.url);
      } else {
        toast.info(
          'Link temporário autorizado',
          'O navegador bloqueou a nova aba. Use o link exibido nos detalhes do documento.',
        );
      }
    },
    onError: (error, attempt) => {
      attempt.previewWindow?.close();
      if (attempt.scopeIdentity !== activeScopeIdentityRef.current) return;
      toast.error('Não foi possível abrir o documento', archiveErrorMessage(error));
    },
  });

  const items = archiveQuery.data?.pages.flatMap((page) => page.items) || [];
  const activeFilterCount = [
    Boolean(appliedFilters.search),
    appliedFilters.status !== 'TODOS',
    Boolean(appliedFilters.documentType),
    Boolean(appliedFilters.turmaId),
    Boolean(appliedFilters.finalizedFrom),
    Boolean(appliedFilters.finalizedTo),
  ].filter(Boolean).length;
  const hasDraftFilters = [
    Boolean(draftFilters.search.trim()),
    draftFilters.status !== 'TODOS',
    Boolean(draftFilters.documentType),
    Boolean(draftFilters.turmaId),
    Boolean(draftFilters.finalizedFrom),
    Boolean(draftFilters.finalizedTo),
  ].some(Boolean);

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    if (
      draftFilters.finalizedFrom
      && draftFilters.finalizedTo
      && draftFilters.finalizedFrom > draftFilters.finalizedTo
    ) {
      setFilterError('A data inicial não pode ser posterior à data final.');
      return;
    }
    setFilterError(null);
    setAppliedFilters({
      ...draftFilters,
      search: draftFilters.search.trim(),
    });
  };

  const clearFilters = () => {
    setDraftFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setFilterError(null);
  };

  const refreshArchive = () => queryClient.invalidateQueries({
    queryKey: electronicSignatureQueryKeys.archiveLists('GESTOR', contextId, normalizedPoloId),
  });

  const openArtifact = (
    item: ElectronicSignatureArchiveItem,
    artifactClass: 'DOCUMENTO_FINAL' | 'COMPROVANTE_EVIDENCIA',
  ) => {
    if (typeof window === 'undefined') return;
    const available = artifactClass === 'DOCUMENTO_FINAL'
      ? item.artifacts.final
      : item.artifacts.receipt;
    if (!available || artifactMutation.isPending) return;
    // Reserva a aba durante o clique para não depender de popup após a resposta assíncrona.
    const previewWindow = window.open('', '_blank');
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.document.title = 'Autorizando documento…';
      previewWindow.document.body.textContent = 'Autorizando acesso temporário ao PDF…';
    }
    const scope = ['GESTOR', contextId, item.envelopeId, artifactClass] as const;
    try {
      const requestId = getOrCreateElectronicSignatureRequestId(
        'CREATE_ARTIFACT_DOWNLOAD_URL',
        scope,
      );
      artifactMutation.mutate({
        item,
        artifactClass,
        scope,
        scopeIdentity,
        previewWindow,
        requestId,
      });
    } catch (error) {
      previewWindow?.close();
      toast.error('Não foi possível preparar o acesso', archiveErrorMessage(error));
    }
  };

  return (
    <>
      <section className="overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm shadow-slate-900/[0.03]">
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-r from-[#001a33] to-[#123a61] p-5 text-white sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-blue-200 ring-1 ring-white/15">
                <Archive size={20} aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Acervo institucional</p>
                <h3 className="mt-0.5 text-base font-black tracking-tight text-white">Documentos assinados</h3>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-300">
                  Consulta paginada de documentos finalizados, sem expor caminhos internos de arquivo.
                </p>
              </div>
            </div>
            <ShieldCheck size={19} className="mt-1 shrink-0 text-blue-200" aria-hidden="true" />
          </div>
        </div>

        <form onSubmit={applyFilters} className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="md:col-span-2 xl:col-span-1">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Buscar no acervo</span>
              <span className="relative mt-1 block">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={draftFilters.search}
                  maxLength={120}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Título, turma, disciplina, UUID ou signatário"
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Status</span>
              <select
                value={draftFilters.status}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as ElectronicSignatureArchiveFilters['status'],
                }))}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="TODOS">Todos</option>
                <option value="ASSINADO">Assinado</option>
                <option value="SUBSTITUIDO">Substituído</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Tipo de documento</span>
              <select
                value={draftFilters.documentType || ''}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  documentType: event.target.value === 'diario_classe' ? 'diario_classe' : null,
                }))}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="">Todos os tipos disponíveis</option>
                <option value="diario_classe">Diário de classe</option>
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Turma</span>
              <select
                value={draftFilters.turmaId || ''}
                onChange={(event) => setDraftFilters((current) => ({
                  ...current,
                  turmaId: event.target.value || null,
                }))}
                disabled={!normalizedPoloId || turmasQuery.isPending || turmasQuery.isError}
                className={`mt-1 ${fieldClassName}`}
              >
                <option value="">
                  {!normalizedPoloId
                    ? 'Selecione um polo na gestão'
                    : turmasQuery.isPending
                      ? 'Carregando turmas…'
                      : turmasQuery.isError
                        ? 'Turmas indisponíveis'
                        : 'Todas as turmas'}
                </option>
                {(turmasQuery.data || []).map((turma) => (
                  <option key={turma.id} value={turma.id}>{turma.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Finalizado a partir de</span>
              <span className="relative mt-1 block">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={draftFilters.finalizedFrom || ''}
                  max={draftFilters.finalizedTo || undefined}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, finalizedFrom: event.target.value || null }))}
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
            <label>
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Finalizado até</span>
              <span className="relative mt-1 block">
                <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={draftFilters.finalizedTo || ''}
                  min={draftFilters.finalizedFrom || undefined}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, finalizedTo: event.target.value || null }))}
                  className={`${fieldClassName} pl-10`}
                />
              </span>
            </label>
          </div>
          {filterError ? <p role="alert" className="mt-3 text-xs font-bold text-rose-700">{filterError}</p> : null}
          {turmasQuery.isError && normalizedPoloId ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-bold text-amber-800" role="status">
              O filtro de turma está temporariamente indisponível.
              <button type="button" onClick={() => void turmasQuery.refetch()} className="underline underline-offset-4">Tentar novamente</button>
            </div>
          ) : null}
          <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[10px] font-bold text-slate-500" aria-live="polite">
              {activeFilterCount ? `${activeFilterCount} filtro(s) aplicado(s)` : 'Exibindo todo o acervo autorizado neste escopo.'}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={clearFilters} disabled={!activeFilterCount && !hasDraftFilters} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                <FilterX size={14} /> Limpar
              </button>
              <button type="submit" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-blue-900">
                <Search size={14} /> Aplicar filtros
              </button>
            </div>
          </div>
        </form>

        <div className="p-5 sm:p-6">
          {!contextId ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4" role="alert">
              <p className="text-xs font-bold text-rose-700">O contexto autorizado do Gestor não foi informado. Nenhum documento foi consultado.</p>
            </div>
          ) : archiveQuery.isPending ? (
            <div className="flex min-h-44 items-center justify-center gap-3 text-xs font-bold text-slate-500" role="status">
              <Loader2 size={20} className="animate-spin text-blue-600" /> Carregando acervo assinado…
            </div>
          ) : archiveQuery.isError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-5">
              <p role="alert" className="text-xs font-bold text-rose-700">Não foi possível consultar o acervo neste escopo.</p>
              <button type="button" onClick={() => void archiveQuery.refetch()} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 text-[10px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100">
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <Archive size={30} className="mx-auto text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-black text-[#001a33]">Nenhum documento assinado encontrado</p>
              <p className="mt-1 text-xs font-medium text-slate-500">Ajuste os filtros ou aguarde a conclusão das assinaturas.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left">
                  <caption className="sr-only">Documentos assinados disponíveis no acervo</caption>
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                      <th scope="col" className="border-b border-slate-200 px-3 py-3">Documento</th>
                      <th scope="col" className="border-b border-slate-200 px-3 py-3">Turma e disciplina</th>
                      <th scope="col" className="border-b border-slate-200 px-3 py-3">Signatários</th>
                      <th scope="col" className="border-b border-slate-200 px-3 py-3">Finalização</th>
                      <th scope="col" className="border-b border-slate-200 px-3 py-3">Status</th>
                      <th scope="col" className="border-b border-slate-200 px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.envelopeId} className="group transition hover:bg-blue-50/40">
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <p className="max-w-xs text-xs font-black text-[#001a33]">{item.title}</p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">Diário de classe · {item.revisionLabel}</p>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <p className="text-xs font-bold text-[#001a33]">{item.turmaNome}</p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">{item.disciplinaNome}</p>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          {item.signers.map((signer, signerIndex) => (
                            <p key={`${item.envelopeId}:signer:${signerIndex}`} className="text-[10px] font-semibold leading-relaxed text-slate-600">
                              <span className="font-black text-slate-700">{roleLabel(signer.role)}:</span> {signer.name}
                            </p>
                          ))}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top text-[10px] font-semibold text-slate-600">
                          {formatDateTime(item.finalizedAt)}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 align-top">
                          <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${item.status === 'ASSINADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {item.status === 'ASSINADO' ? 'Assinado' : 'Substituído'}
                          </span>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-4 text-right align-top">
                          <button type="button" onClick={() => setSelectedItem(item)} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-blue-50 px-3 text-[9px] font-black uppercase tracking-wide text-blue-700 transition hover:bg-blue-100" aria-label={`Ver detalhes de ${item.title}`}>
                            <FileText size={13} /> Detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {items.map((item) => (
                  <article key={item.envelopeId} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-wide text-blue-600">Diário de classe · {item.revisionLabel}</p>
                        <h4 className="mt-1 text-sm font-black leading-tight text-[#001a33]">{item.title}</h4>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-wide ${item.status === 'ASSINADO' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                        {item.status === 'ASSINADO' ? 'Assinado' : 'Substituído'}
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-3 text-xs">
                      <div>
                        <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Turma</dt>
                        <dd className="mt-0.5 font-bold text-slate-700">{item.turmaNome}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Disciplina</dt>
                        <dd className="mt-0.5 font-bold text-slate-700">{item.disciplinaNome}</dd>
                      </div>
                      <div>
                        <dt className="text-[9px] font-black uppercase tracking-wide text-slate-400">Finalização</dt>
                        <dd className="mt-0.5 font-bold text-slate-700">{formatDateTime(item.finalizedAt)}</dd>
                      </div>
                    </dl>
                    <button type="button" onClick={() => setSelectedItem(item)} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-4 text-[10px] font-black uppercase tracking-wide text-blue-700" aria-label={`Ver detalhes de ${item.title}`}>
                      <FileText size={14} /> Ver detalhes e arquivos
                    </button>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[10px] font-bold text-slate-500" role="status" aria-live="polite">
                  {items.length} documento(s) carregado(s).
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button type="button" onClick={() => void refreshArchive()} disabled={archiveQuery.isFetching} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-600 disabled:opacity-50">
                    <RefreshCw size={14} className={archiveQuery.isFetching && !archiveQuery.isFetchingNextPage ? 'animate-spin' : ''} /> Atualizar
                  </button>
                  {archiveQuery.hasNextPage ? (
                    <button type="button" onClick={() => void archiveQuery.fetchNextPage()} disabled={archiveQuery.isFetchingNextPage} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                      {archiveQuery.isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {archiveQuery.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <ArchiveDetailDialog
        item={selectedItem}
        busyArtifactClass={artifactMutation.isPending ? artifactMutation.variables?.artifactClass || null : null}
        authorizedDownload={authorizedDownload}
        onClose={() => setSelectedItem(null)}
        onOpenArtifact={openArtifact}
      />
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </>
  );
};

export default SecretariaAssinaturasAcervo;
