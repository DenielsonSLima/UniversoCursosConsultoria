import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import { EnvironmentBanner } from '../../../configuracoes/integracao-bancaria/integracao-bancaria.ui';
import {
  cnabFileStatusClass,
  cnabFileStatusLabel,
  formatCnabFileSize,
  formatConciliacaoDate,
} from '../conciliacao-bancaria.formatters';
import type { BaneseCnabReturnController } from '../hooks/useBaneseCnabReturn';
import {
  BANESE_CNAB_RETURN_ACCEPT,
  describeCnabAvailabilityError,
  requiresBaneseCnabProductionAcknowledgement,
} from '../conciliacao-bancaria.utils';
import { CnabOutcomeList, CnabSummaryGrid } from './CnabReturnResults';

interface BaneseCnabReturnPanelProps {
  controller: BaneseCnabReturnController;
  cnabReady: boolean;
  overviewError?: string | null;
}

const BaneseCnabReturnPanel: React.FC<BaneseCnabReturnPanelProps> = ({
  controller,
  cnabReady,
  overviewError,
}) => {
  const unavailableNotice = describeCnabAvailabilityError(overviewError);
  const {
    activationPendingCount,
    canConfirm,
    confirmation,
    confirmationHasIssues,
    confirmationNeedsRevalidation,
    confirmationSummary,
    confirm,
    confirming,
    environment,
    inputRef,
    matchedToRetryCount,
    openFile,
    openingFileId,
    operationInProgress,
    preview,
    previewDuplicate,
    previewFile,
    previewIsProcessing,
    previewNeedsRevalidation,
    previewOnlySkipped,
    previewSummary,
    previewing,
    productionAcknowledged,
    recentReturnFiles,
    reset,
    retryablePendingCount,
    retryPending,
    retryingPendingRecords,
    revalidate,
    revalidating,
    selectedFile,
    selectFile,
    setProductionAcknowledged,
  } = controller;

  return (
    <section className="space-y-4 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-slate-500" />
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">Retorno CNAB 240</h3>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Banese · contingência com prévia antes da baixa</p>
          </div>
        </div>
        {(selectedFile || preview || confirmation) ? (
          <button
            type="button"
            onClick={reset}
            disabled={operationInProgress}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw size={12} /> Novo arquivo
          </button>
        ) : null}
      </div>

      {environment ? (
        <EnvironmentBanner environment={environment} title="Conciliação CNAB240" />
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
          Consultando o ambiente bancário ativo. O servidor confirmará o ambiente antes de qualquer processamento.
        </div>
      )}

      {unavailableNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900">
          <p className="font-black uppercase tracking-wide">{unavailableNotice.title}</p>
          <p className="mt-1">{unavailableNotice.message}</p>
          <p className="mt-2 text-[10px] text-amber-700">Retorno técnico: {unavailableNotice.detail}</p>
        </div>
      ) : null}

      {recentReturnFiles.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Retornos recentes · recuperação histórica</p>
          <div className="mt-2 max-h-52 space-y-2 overflow-y-auto">
            {recentReturnFiles.map((file) => (
              <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[10px] font-black text-slate-700">{file.fileName}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase ${cnabFileStatusClass(file.status)}`}>
                      {cnabFileStatusLabel(file.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] font-semibold text-slate-500">
                    {formatConciliacaoDate(file.importedAt || file.createdAt)} · {file.titleCount} evento(s)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openFile(file)}
                  disabled={operationInProgress}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                >
                  {openingFileId === file.id ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                  Abrir
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <div className={`p-3 ${preview || confirmation ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest">Etapa 1</p>
          <p className="mt-1 text-xs font-black">Prévia sem baixa</p>
        </div>
        <div className={`border-l border-slate-200 p-3 ${confirmation ? 'bg-emerald-50 text-emerald-700' : preview ? 'bg-blue-50 text-blue-700' : 'text-slate-400'}`}>
          <p className="text-[9px] font-black uppercase tracking-widest">Etapa 2</p>
          <p className="mt-1 text-xs font-black">Confirmação explícita</p>
        </div>
      </div>

      {!preview && !confirmation ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold leading-relaxed text-slate-500">
            Selecione o retorno fornecido pelo banco. Arquivos <strong>.ret</strong>, <strong>.txt</strong> e <strong>.cnab</strong> são aceitos até 5 MB. Arquivos <strong>.rem</strong> são remessas e ficam bloqueados neste fluxo.
          </p>
          <input ref={inputRef} type="file" accept={BANESE_CNAB_RETURN_ACCEPT} onChange={selectFile} className="hidden" />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={operationInProgress || !cnabReady}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm"><UploadCloud size={20} /></span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-black text-slate-700">{selectedFile?.name || 'Selecionar arquivo de retorno'}</span>
              <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                {selectedFile ? formatCnabFileSize(selectedFile.size) : '.ret, .txt ou .cnab · máximo 5 MB'}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={previewFile}
            disabled={!selectedFile || operationInProgress || !cnabReady}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {previewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            {previewing ? 'Gerando prévia segura...' : 'Gerar prévia sem aplicar baixas'}
          </button>
        </div>
      ) : null}

      {preview && !confirmation ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${previewIsProcessing ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest ${previewIsProcessing ? 'text-amber-700' : 'text-blue-700'}`}>
              {previewIsProcessing ? 'Processamento interrompido' : 'Prévia pronta'}
            </p>
            <p className={`mt-1 break-all text-xs font-bold ${previewIsProcessing ? 'text-amber-900' : 'text-blue-900'}`}>{preview.file.fileName}</p>
            <p className={`mt-1 text-[10px] font-semibold ${previewIsProcessing ? 'text-amber-800' : 'text-blue-700'}`}>
              Identificador {preview.file.id}
              {previewIsProcessing ? ' · use Retomar processamento; o servidor validará a janela segura de 10 minutos' : ' · nenhuma baixa aplicada nesta etapa'}
              {previewDuplicate ? ' · arquivo existente aberto' : ''}
            </p>
          </div>
          <CnabSummaryGrid summary={previewSummary} />
          <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="sticky top-0 bg-slate-50 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Eventos da prévia</p>
            <CnabOutcomeList outcomes={preview.records || []} />
          </div>
          {previewNeedsRevalidation ? (
            <button
              type="button"
              onClick={revalidate}
              disabled={operationInProgress || (requiresBaneseCnabProductionAcknowledgement(preview.file.environment) && !productionAcknowledged)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revalidating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {revalidating ? 'Revalidando retorno...' : 'Revalidar retorno'}
            </button>
          ) : null}
          {preview.file.environment === 'production' ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <input type="checkbox" checked={productionAcknowledged} onChange={(event) => setProductionAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
              <span className="text-xs font-bold leading-relaxed text-rose-800">
                Confirmo que revisei os registros e autorizo {previewIsProcessing ? 'a retomada do processamento' : previewNeedsRevalidation ? 'a revalidação e o processamento das linhas elegíveis' : 'a aplicação das correspondências válidas'} no ambiente de produção. Há <strong>{previewSummary.matched} registro(s) MATCHED</strong> atualmente pronto(s) para aplicação.
              </span>
            </label>
          ) : (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Sandbox: a confirmação processará somente os registros do ambiente de testes identificado pela API.</p>
          )}
          {!canConfirm ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
              {previewNeedsRevalidation
                ? 'Este retorno possui itens em revisão manual. Revalide-o para recomputar e processar com segurança as linhas ainda não aplicadas.'
                : previewOnlySkipped
                  ? 'Todos os eventos já foram registrados em outro retorno. Não há nenhuma baixa nova para confirmar.'
                  : 'Não há correspondências válidas disponíveis, ou ainda existem erros que impedem a aplicação segura.'}
            </p>
          ) : null}
          <button
            type="button"
            onClick={confirm}
            disabled={!canConfirm || operationInProgress || (requiresBaneseCnabProductionAcknowledgement(preview.file.environment) && !productionAcknowledged)}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${preview.file.environment === 'production' ? 'bg-rose-600 shadow-rose-600/15 hover:bg-rose-700' : 'bg-emerald-600 shadow-emerald-600/15 hover:bg-emerald-700'}`}
          >
            {confirming ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />}
            {confirming ? previewIsProcessing ? 'Retomando processamento...' : 'Aplicando baixas...' : previewIsProcessing ? 'Retomar processamento' : 'Confirmar e aplicar baixas'}
          </button>
        </div>
      ) : null}

      {confirmation ? (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${confirmationHasIssues ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
            <div className="flex items-start gap-3">
              {confirmationHasIssues ? <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={20} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={20} />}
              <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${confirmationHasIssues ? 'text-amber-700' : 'text-emerald-700'}`}>{confirmationHasIssues ? 'Processamento parcial' : 'Retorno confirmado'}</p>
                <p className={`mt-1 text-xs font-black ${confirmationHasIssues ? 'text-amber-900' : 'text-emerald-900'}`}>{confirmation.file.fileName}</p>
                <p className={`mt-1 text-xs font-semibold leading-relaxed ${confirmationHasIssues ? 'text-amber-800' : 'text-emerald-700'}`}>
                  {confirmationHasIssues
                    ? `${confirmationSummary.applied} baixa(s) financeira(s) registrada(s), ${confirmationSummary.matched} correspondência(s) pendente(s), ${activationPendingCount} ativação(ões) pendente(s) e ${confirmationSummary.errors} erro(s). Revise os eventos abaixo.`
                    : confirmation.alreadyProcessed
                      ? 'Este arquivo já estava processado. A solicitação foi tratada sem duplicar baixas.'
                      : `${confirmationSummary.applied} baixa(s) aplicada(s) e registradas para auditoria.`}
                </p>
              </div>
            </div>
          </div>
          <CnabSummaryGrid summary={confirmationSummary} />
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3"><CnabOutcomeList outcomes={confirmation.records || []} /></div>
          {retryablePendingCount > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-relaxed text-amber-900">
              <p className="font-black uppercase tracking-wide">Próxima tentativa</p>
              <p className="mt-1"><strong>{matchedToRetryCount} registro(s) MATCHED a aplicar</strong> entre {retryablePendingCount} pendência(s) reprocessável(is). Itens em revisão manual não entram no retry e devem ser revalidados.</p>
            </div>
          ) : null}
          {(confirmationNeedsRevalidation || retryablePendingCount > 0) && requiresBaneseCnabProductionAcknowledgement(confirmation.file.environment) ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4">
              <input type="checkbox" checked={productionAcknowledged} onChange={(event) => setProductionAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
              <span className="text-xs font-bold leading-relaxed text-rose-800">Confirmo que revisei as pendências e autorizo uma nova ação neste retorno de produção. Há <strong>{matchedToRetryCount} registro(s) MATCHED</strong> atualmente pronto(s) para aplicação; a revalidação também pode tornar linhas revisadas elegíveis.</span>
            </label>
          ) : null}
          {confirmationNeedsRevalidation ? (
            <button type="button" onClick={revalidate} disabled={operationInProgress || (requiresBaneseCnabProductionAcknowledgement(confirmation.file.environment) && !productionAcknowledged)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">
              {revalidating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {revalidating ? 'Revalidando retorno parcial...' : 'Revalidar itens em revisão'}
            </button>
          ) : null}
          {retryablePendingCount > 0 ? (
            <button type="button" onClick={retryPending} disabled={operationInProgress || (requiresBaneseCnabProductionAcknowledgement(confirmation.file.environment) && !productionAcknowledged)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-amber-600/15 hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              {retryingPendingRecords ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {retryingPendingRecords ? 'Reprocessando pendências...' : `Reprocessar ${retryablePendingCount} pendência(s) · ${matchedToRetryCount} MATCHED`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default BaneseCnabReturnPanel;
