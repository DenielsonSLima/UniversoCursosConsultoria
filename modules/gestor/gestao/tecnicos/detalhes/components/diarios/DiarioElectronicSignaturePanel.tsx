import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  FileCheck2,
  FileSignature,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

import {
  electronicSignatureQueryKeys,
  type ElectronicSignatureEnvelopeDetail,
} from '../../../../../../shared/assinatura-eletronica/assinatura-eletronica.contract';
import {
  ElectronicSignatureRequestError,
  electronicSignatureService,
} from '../../../../../../shared/assinatura-eletronica/assinatura-eletronica.service';
import {
  clearElectronicSignatureRequestId,
  getOrCreateElectronicSignatureRequestId,
} from '../../../../../../shared/assinatura-eletronica/electronic-signature-request-id';

interface DiarioElectronicSignaturePanelProps {
  contextId: string;
  poloId: string;
  turmaId: string;
  disciplinaId: string;
}

const TERMINAL_STATUSES = new Set([
  'ASSINADO',
  'RECUSADO',
  'CANCELADO',
  'EXPIRADO',
  'SUBSTITUIDO',
]);

const artifactLabel = (ready: boolean, sha256: string | null) => (
  ready && sha256 ? `SHA-256 ${sha256}` : 'Ainda não gerado pelo serviço autorizado.'
);

const requestFailureMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('ASSINATURA_POLITICA_NAO_HABILITADA')) {
    return 'A política de assinatura do diário continua bloqueada. Nenhum documento foi criado.';
  }
  if (message.includes('ASSINATURA_PROFESSOR_SEM_IDENTIDADE_ATIVA')) {
    return 'O professor da disciplina ainda não possui uma identidade ativa para assinar.';
  }
  if (message.includes('ASSINATURA_COORDENADOR_SEM_VINCULO_ATIVO')) {
    return 'A turma ainda não possui um coordenador de curso ativo para esta assinatura.';
  }
  if (error instanceof ElectronicSignatureRequestError) return error.message;
  return message || 'Não foi possível solicitar o envelope do diário.';
};

const DiarioElectronicSignaturePanel: React.FC<DiarioElectronicSignaturePanelProps> = ({
  contextId,
  poloId,
  turmaId,
  disciplinaId,
}) => {
  const queryClient = useQueryClient();
  const queryKey = electronicSignatureQueryKeys.diaryEnvelope(
    'GESTOR',
    contextId,
    poloId,
    turmaId,
    disciplinaId,
  );
  const requestScope = ['GESTOR', contextId, poloId, turmaId, disciplinaId] as const;

  const envelopeQuery = useQuery({
    queryKey,
    queryFn: () => electronicSignatureService.getCurrentDiaryEnvelope({
      turmaId,
      disciplinaId,
      profile: 'GESTOR',
      contextId,
    }),
    enabled: Boolean(contextId && poloId && turmaId && disciplinaId),
    staleTime: 10_000,
    retry: false,
  });

  const prepareMutation = useMutation({
    mutationFn: async (current: ElectronicSignatureEnvelopeDetail | null) => {
      let envelopeId = current?.envelope.envelopeId ?? null;
      let created = false;
      if (!envelopeId || TERMINAL_STATUSES.has(current?.envelope.status ?? '')) {
        const requestId = getOrCreateElectronicSignatureRequestId(
          'REQUEST_DIARY_ENVELOPE',
          requestScope,
        );
        const requested = await electronicSignatureService.requestDiaryEnvelope({
          turmaId,
          disciplinaId,
          profile: 'GESTOR',
          contextId,
          requestId,
        });
        envelopeId = requested.envelopeId;
        created = true;
      }

      if (current?.envelope.original.ready && !created) {
        clearElectronicSignatureRequestId('REQUEST_DIARY_ENVELOPE', requestScope);
        clearElectronicSignatureRequestId(
          'PREPARE_DIARY_ORIGINAL',
          ['GESTOR', contextId, envelopeId],
        );
        return { envelopeId, status: current.envelope.status };
      }
      const prepareScope = ['GESTOR', contextId, envelopeId] as const;
      const prepareRequestId = getOrCreateElectronicSignatureRequestId(
        'PREPARE_DIARY_ORIGINAL',
        prepareScope,
      );
      const result = await electronicSignatureService.processDiaryArtifact({
        action: 'PREPARE_ORIGINAL',
        envelopeId,
        requestId: prepareRequestId,
      });
      clearElectronicSignatureRequestId('PREPARE_DIARY_ORIGINAL', prepareScope);
      clearElectronicSignatureRequestId('REQUEST_DIARY_ENVELOPE', requestScope);
      return result;
    },
    onSuccess: async () => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: ['assinatura-eletronica', 'inbox', 'GESTOR', contextId, poloId],
        }),
      ]);
    },
  });

  if (!contextId || !poloId) {
    return (
      <section className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-sm font-black text-amber-900">Assinatura eletrônica indisponível neste contexto.</p>
        <p className="mt-1 text-xs font-medium text-amber-800">O serviço não recebeu o contexto e o polo necessários para autorizar o diário.</p>
      </section>
    );
  }

  const detail = envelopeQuery.data;
  const isTerminal = Boolean(detail && TERMINAL_STATUSES.has(detail.envelope.status));
  const mayPrepare = !detail || detail.envelope.status === 'RASCUNHO' || isTerminal;
  const actionLabel = isTerminal
    ? 'Solicitar nova versão'
    : detail
      ? 'Tentar preparar documento'
      : 'Solicitar e preparar documento';

  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <FileSignature size={21} />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-600">Assinatura eletrônica do diário</p>
            <h3 className="mt-1 text-base font-black text-[#001a33]">
              {detail?.envelope.statusLabel || 'Nenhum envelope solicitado'}
            </h3>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
              O PDF oficial é composto e congelado no serviço. A prévia e o download deste diário não substituem esse artefato.
            </p>
          </div>
        </div>

        {envelopeQuery.isPending ? (
          <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500" role="status">
            <Loader2 size={15} className="animate-spin" /> Conferindo
          </span>
        ) : envelopeQuery.isError ? (
          <button
            type="button"
            onClick={() => void envelopeQuery.refetch()}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-[10px] font-black uppercase tracking-wide text-rose-700"
          >
            <RefreshCw size={14} /> Tentar consultar novamente
          </button>
        ) : mayPrepare ? (
          <button
            type="button"
            disabled={prepareMutation.isPending}
            onClick={() => prepareMutation.mutate(detail ?? null)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-blue-950/15 transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {prepareMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />}
            {prepareMutation.isPending ? 'Processando…' : actionLabel}
          </button>
        ) : null}
      </div>

      {envelopeQuery.isError ? (
        <div className="border-t border-rose-100 bg-rose-50 px-5 py-4 text-xs font-bold text-rose-700" role="alert">
          A consulta canônica falhou. As ações permaneceram bloqueadas para evitar criar um envelope duplicado.
        </div>
      ) : prepareMutation.isError ? (
        <div className="flex items-start gap-2 border-t border-rose-100 bg-rose-50 px-5 py-4 text-xs font-bold leading-relaxed text-rose-700" role="alert">
          <ShieldAlert size={16} className="mt-0.5 shrink-0" /> {requestFailureMessage(prepareMutation.error)}
        </div>
      ) : detail ? (
        <div className="grid gap-px border-t border-slate-100 bg-slate-100 sm:grid-cols-2">
          <div className="bg-white px-5 py-4">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              {detail.envelope.original.ready ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Loader2 size={14} className="text-slate-400" />}
              Documento original
            </p>
            <p className="mt-2 break-all font-mono text-[9px] font-bold text-slate-500">
              {artifactLabel(detail.envelope.original.ready, detail.envelope.original.sha256)}
            </p>
          </div>
          <div className="bg-white px-5 py-4">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
              {detail.envelope.final.ready ? <CheckCircle2 size={14} className="text-emerald-600" /> : <Loader2 size={14} className="text-slate-400" />}
              Documento final
            </p>
            <p className="mt-2 break-all font-mono text-[9px] font-bold text-slate-500">
              {artifactLabel(detail.envelope.final.ready, detail.envelope.final.sha256)}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default DiarioElectronicSignaturePanel;
