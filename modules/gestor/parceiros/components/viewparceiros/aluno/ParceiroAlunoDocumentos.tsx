import React, { useState } from 'react';
import { FileStack, Loader2, ShieldCheck } from 'lucide-react';
import type {
  DocumentoAlunoChecklistItem,
  DocumentoAlunoDecisaoRevisao,
  DocumentoAlunoLotePdf,
  DocumentoAlunoPdfMapeamento,
} from '../../../../../shared/documentos-aluno/documentos-aluno.types';
import { documentosAlunoV2Service } from '../../../../../shared/documentos-aluno/documentos-aluno.service';
import AlunoDocumentosSummary from './documentos/AlunoDocumentosSummary';
import DocumentoArchiveDialog from './documentos/DocumentoArchiveDialog';
import DocumentoDeleteDialog from './documentos/DocumentoDeleteDialog';
import DocumentoPreviewHistoryModal from './documentos/DocumentoPreviewHistoryModal';
import DocumentoReviewModal from './documentos/DocumentoReviewModal';
import DocumentosChecklist from './documentos/DocumentosChecklist';
import PdfUnicoMappingModal from './documentos/PdfUnicoMappingModal';
import { useParceiroAlunoDocumentosWorkflow } from './useParceiroAlunoDocumentosWorkflow';

interface ParceiroAlunoDocumentosProps {
  alunoId: string;
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

const ParceiroAlunoDocumentos: React.FC<ParceiroAlunoDocumentosProps> = ({ alunoId }) => {
  const workflow = useParceiroAlunoDocumentosWorkflow(alunoId);
  const painel = workflow.painelQuery.data;
  const matriculas = workflow.matriculasQuery.data || [];

  const [previewItem, setPreviewItem] = useState<DocumentoAlunoChecklistItem | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [reviewItem, setReviewItem] = useState<DocumentoAlunoChecklistItem | null>(null);
  const [decision, setDecision] = useState<DocumentoAlunoDecisaoRevisao>('aprovado');
  const [reviewReason, setReviewReason] = useState('');
  const [archiveItem, setArchiveItem] = useState<DocumentoAlunoChecklistItem | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [deleteItem, setDeleteItem] = useState<DocumentoAlunoChecklistItem | null>(null);
  const [deleteArquivoIds, setDeleteArquivoIds] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [mappingLot, setMappingLot] = useState<DocumentoAlunoLotePdf | null>(null);
  const [mappings, setMappings] = useState<DocumentoAlunoPdfMapeamento[]>([]);
  const [operationError, setOperationError] = useState<string | null>(null);

  if (workflow.painelQuery.isError) {
    return (
      <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-black text-red-700">Não foi possível carregar os documentos.</p>
        <p className="mt-2 text-xs font-medium text-slate-500">
          {errorMessage(workflow.painelQuery.error)}
        </p>
        <button
          type="button"
          onClick={() => void workflow.painelQuery.refetch()}
          className="mt-5 min-h-11 rounded-xl bg-[#001a33] px-5 text-[10px] font-black uppercase tracking-wider text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (workflow.painelQuery.isLoading || !painel) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-xs font-bold text-slate-400">
        <Loader2 className="animate-spin" size={16} /> Carregando documentos
      </div>
    );
  }

  const awaitingMappings = painel.lotesPdf.filter(
    (lote) => lote.status === 'aguardando_mapeamento',
  );
  const preparingLots = painel.lotesPdf.filter(
    (lote) => lote.status === 'preparando',
  );
  const cancelledCleanupLots = painel.lotesPdf.filter(
    (lote) =>
      lote.status === 'cancelado'
      && lote.arquivos.some((arquivo) => arquivo.status !== 'excluido'),
  );
  const busyItemId =
    workflow.uploadMutation.isPending
      ? workflow.uploadMutation.variables?.documentoId || null
      : reviewItem?.id && workflow.reviewMutation.isPending
      ? reviewItem.id
      : archiveItem?.id && workflow.archiveMutation.isPending
        ? archiveItem.id
        : deleteItem?.id && workflow.deleteMutation.isPending
          ? deleteItem.id
          : null;

  const signPreviewSource = async (
    item: DocumentoAlunoChecklistItem,
    versionId: string,
    sourceId?: string | null,
  ) => {
    const version = item.versoes.find((candidate) => candidate.id === versionId);
    const source = version?.fontes.find((candidate) => candidate.id === sourceId)
      || version?.fontes[0];
    if (!source) return item;
    const signedFile = await documentosAlunoV2Service.getArquivoUrl(source.arquivo);
    const versions = item.versoes.map((candidate) => candidate.id === versionId
      ? {
        ...candidate,
        fontes: candidate.fontes.map((candidateSource) =>
          candidateSource.id === source.id
            ? { ...candidateSource, arquivo: signedFile }
            : candidateSource),
      }
      : candidate);
    return {
      ...item,
      versoes: versions,
      versaoAtual: item.versaoAtual?.id === versionId
        ? versions.find((candidate) => candidate.id === versionId) || item.versaoAtual
        : item.versaoAtual,
    };
  };

  const openPreview = async (item: DocumentoAlunoChecklistItem) => {
    const versionId = item.versaoAtual?.id || item.versoes[0]?.id || null;
    const sourceId = item.versaoAtual?.fontes[0]?.id || item.versoes[0]?.fontes[0]?.id || null;
    const signedItem = versionId
      ? await signPreviewSource(item, versionId, sourceId)
      : item;
    setPreviewItem(signedItem);
    setSelectedVersionId(versionId);
    setSelectedSourceId(sourceId);
  };

  const openMapping = async (lote: DocumentoAlunoLotePdf) => {
    setOperationError(null);
    const arquivo = lote.arquivos[0];
    if (!arquivo) return;

    let totalPaginas = arquivo.totalPaginas || null;
    if (!totalPaginas) {
      const informed = Number(window.prompt('Quantas páginas possui este PDF?') || 0);
      if (!Number.isInteger(informed) || informed < 1) return;
      await workflow.pagesMutation.mutateAsync({
        arquivoId: arquivo.id,
        totalPaginas: informed,
      });
      totalPaginas = informed;
    }

    const signedFile = await documentosAlunoV2Service.getArquivoUrl(arquivo);
    setMappingLot({
      ...lote,
      arquivos: [{ ...signedFile, totalPaginas }, ...lote.arquivos.slice(1)],
    });
    setMappings([]);
  };

  return (
    <div className="space-y-6">
      <AlunoDocumentosSummary itens={painel.itens} />
      {operationError ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs font-bold text-red-700"
        >
          {operationError}
        </p>
      ) : null}

      {preparingLots.length > 0 ? (
        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-amber-950">
            Envios incompletos
          </h3>
          <p className="mt-1 text-xs font-semibold text-amber-800">
            Estes lotes ainda não foram finalizados. Cancele para liberar o checklist e limpar os arquivos reservados.
          </p>
          <div className="mt-4 space-y-2">
            {preparingLots.map((lote) => (
              <div
                key={lote.id}
                className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#001a33]">
                    {lote.arquivos[0]?.nome || 'Envio sem arquivo confirmado'}
                  </p>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {lote.modo === 'pdf_unico' ? 'PDF consolidado' : 'Documentos separados'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={workflow.cancelPdfMutation.isPending}
                  onClick={() => {
                    const motivo = window.prompt(
                      'Informe o motivo do cancelamento deste envio incompleto:',
                    )?.trim();
                    if (!motivo) return;
                    setOperationError(null);
                    void workflow.cancelPdfMutation.mutateAsync({
                      loteId: lote.id,
                      arquivoIds: lote.arquivos.map((arquivo) => arquivo.id),
                      motivo,
                    }).catch((error) => setOperationError(errorMessage(error)));
                  }}
                  className="min-h-10 rounded-xl bg-amber-700 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                >
                  Cancelar e limpar
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {awaitingMappings.length > 0 ? (
        <section className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <FileStack className="mt-0.5 shrink-0 text-blue-700" size={20} />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black uppercase tracking-wide text-blue-950">
                PDFs aguardando organização
              </h3>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-800">
                Informe o total de páginas e associe cada intervalo ao item correto do checklist.
              </p>
              <div className="mt-4 space-y-2">
                {awaitingMappings.map((lote) => (
                  <div
                    key={lote.id}
                    className="flex flex-col gap-3 rounded-2xl border border-blue-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black text-[#001a33]">
                        {lote.arquivos[0]?.nome || 'PDF consolidado'}
                      </p>
                      <p className="mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {lote.documentoIds.length} itens disponíveis para mapeamento
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={workflow.pagesMutation.isPending}
                        onClick={() => void openMapping(lote).catch((error) =>
                          setOperationError(errorMessage(error)))}
                        className="min-h-10 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-blue-700 disabled:opacity-50"
                      >
                        Mapear páginas
                      </button>
                      <button
                        type="button"
                        disabled={workflow.cancelPdfMutation.isPending}
                        onClick={() => {
                          const motivo = window.prompt(
                            'Informe por que este PDF deve ser recusado e removido:',
                          )?.trim();
                          if (!motivo) return;
                          setOperationError(null);
                          void workflow.cancelPdfMutation.mutateAsync({
                            loteId: lote.id,
                            arquivoIds: lote.arquivos.map((arquivo) => arquivo.id),
                            motivo,
                          }).catch((error) => setOperationError(errorMessage(error)));
                        }}
                        className="min-h-10 rounded-xl border border-red-100 bg-red-50 px-4 text-[10px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        Recusar PDF
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {cancelledCleanupLots.length > 0 ? (
        <section className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
          <h3 className="text-sm font-black uppercase tracking-wide text-amber-950">
            Limpezas administrativas pendentes
          </h3>
          <p className="mt-1 text-xs font-semibold text-amber-800">
            O lote já foi cancelado; tente novamente a exclusão física dos arquivos.
          </p>
          <div className="mt-4 space-y-2">
            {cancelledCleanupLots.map((lote) => {
              const pendingIds = lote.arquivos
                .filter((arquivo) => arquivo.status !== 'excluido')
                .map((arquivo) => arquivo.id);
              return (
                <div
                  key={lote.id}
                  className="flex flex-col gap-3 rounded-2xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="truncate text-xs font-black text-[#001a33]">
                    {lote.arquivos[0]?.nome || 'PDF cancelado'}
                  </p>
                  <button
                    type="button"
                    disabled={workflow.deleteMutation.isPending}
                    onClick={() => {
                      setOperationError(null);
                      void workflow.deleteMutation.mutateAsync({
                        arquivoIds: pendingIds,
                        motivo: 'Nova tentativa de limpeza de PDF cancelado.',
                      }).catch((error) => setOperationError(errorMessage(error)));
                    }}
                    className="min-h-10 rounded-xl bg-amber-700 px-4 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    Tentar limpeza novamente
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <DocumentosChecklist
        itens={painel.itens}
        busyItemId={busyItemId}
        onPreview={(item) => void openPreview(item)}
        onHistory={(item) => void openPreview(item)}
        onReview={(item) => {
          setOperationError(null);
          setDecision('aprovado');
          setReviewReason('');
          setReviewItem(item);
        }}
        onArchive={(item) => {
          setOperationError(null);
          setArchiveReason('');
          setArchiveItem(item);
        }}
        onUpload={(item, files) => {
          setOperationError(null);
          void workflow.uploadMutation.mutateAsync({ documentoId: item.id, files })
            .catch((error) => setOperationError(errorMessage(error)));
        }}
      />

      {matriculas.length > 0 ? (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={20} />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-black uppercase tracking-wide text-emerald-900">
                Concluir análise da matrícula
              </h4>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-800">
                A ativação só será aceita quando o pagamento e todos os documentos enviados estiverem aprovados.
              </p>
              <div className="mt-4 space-y-3">
                {matriculas.map((matricula) => (
                  <div
                    key={matricula.id}
                    className="flex flex-col gap-3 rounded-xl border border-emerald-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-xs font-black text-slate-800">{matricula.cursoNome}</p>
                      <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{matricula.turmaNome}</p>
                    </div>
                    <button
                      type="button"
                      disabled={workflow.activateMutation.isPending}
                      onClick={() => void workflow.activateMutation.mutateAsync(matricula.id)
                        .then(() => alert('Matrícula técnica ativada.'))
                        .catch((error) => alert(errorMessage(error)))}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <ShieldCheck size={14} /> Ativar matrícula
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <DocumentoPreviewHistoryModal
        open={Boolean(previewItem)}
        item={previewItem}
        selectedVersionId={selectedVersionId}
        selectedSourceId={selectedSourceId}
        onSelectVersion={(versionId) => {
          setSelectedVersionId(versionId);
          const version = previewItem?.versoes.find((item) => item.id === versionId);
          const sourceId = version?.fontes[0]?.id || null;
          setSelectedSourceId(sourceId);
          if (previewItem) {
            void signPreviewSource(previewItem, versionId, sourceId).then(setPreviewItem);
          }
        }}
        onSelectSource={(sourceId) => {
          setSelectedSourceId(sourceId);
          if (previewItem && selectedVersionId) {
            void signPreviewSource(previewItem, selectedVersionId, sourceId).then(setPreviewItem);
          }
        }}
        onDeleteSource={(sourceId) => {
          const source = previewItem?.versoes
            .flatMap((version) => version.fontes)
            .find((item) => item.id === sourceId);
          if (!previewItem || !source) return;
          setPreviewItem(null);
          setDeleteReason('');
          setDeleteConfirmation('');
          setDeleteArquivoIds([source.arquivo.id]);
          setDeleteItem(previewItem);
        }}
        onClose={() => setPreviewItem(null)}
      />

      <DocumentoReviewModal
        open={Boolean(reviewItem)}
        documentName={reviewItem?.nome || ''}
        decision={decision}
        reason={reviewReason}
        submitting={workflow.reviewMutation.isPending}
        error={operationError}
        onDecisionChange={setDecision}
        onReasonChange={setReviewReason}
        onSubmit={() => {
          const versaoId = reviewItem?.versaoAtual?.id;
          if (!versaoId) return;
          void workflow.reviewMutation.mutateAsync({
            versaoId,
            status: decision,
            observacao: reviewReason,
          }).then(() => setReviewItem(null)).catch((error) => setOperationError(errorMessage(error)));
        }}
        onClose={() => setReviewItem(null)}
      />

      <DocumentoArchiveDialog
        open={Boolean(archiveItem)}
        documentName={archiveItem?.nome || ''}
        reason={archiveReason}
        submitting={workflow.archiveMutation.isPending}
        error={operationError}
        onReasonChange={setArchiveReason}
        onConfirm={() => {
          const versaoId = archiveItem?.versaoAtual?.id;
          if (!versaoId) return;
          void workflow.archiveMutation.mutateAsync({ versaoId, motivo: archiveReason })
            .then(() => setArchiveItem(null))
            .catch((error) => setOperationError(errorMessage(error)));
        }}
        onClose={() => setArchiveItem(null)}
      />

      <DocumentoDeleteDialog
        open={Boolean(deleteItem)}
        documentName={deleteItem?.nome || ''}
        reason={deleteReason}
        confirmationText={deleteConfirmation}
        submitting={workflow.deleteMutation.isPending}
        error={operationError}
        onReasonChange={setDeleteReason}
        onConfirmationTextChange={setDeleteConfirmation}
        onConfirm={() => {
          const arquivos = deleteArquivoIds;
          if (!arquivos.length) return;
          void workflow.deleteMutation.mutateAsync({
            arquivoIds: arquivos,
            motivo: deleteReason,
          }).then(() => setDeleteItem(null)).catch((error) =>
            setOperationError(errorMessage(error)));
        }}
        onClose={() => setDeleteItem(null)}
      />

      <PdfUnicoMappingModal
        open={Boolean(mappingLot)}
        fileName={mappingLot?.arquivos[0]?.nome || ''}
        fileUrl={mappingLot?.arquivos[0]?.url || null}
        totalPaginas={mappingLot?.arquivos[0]?.totalPaginas || 0}
        checklist={painel.itens.filter((item) => mappingLot?.documentoIds.includes(item.id))}
        mapeamentos={mappings}
        submitting={workflow.mappingMutation.isPending}
        error={operationError}
        onAddMapping={() => setMappings((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            checklistItemId: '',
            paginaInicio: 1,
            paginaFim: 1,
          },
        ])}
        onRemoveMapping={(id) =>
          setMappings((current) => current.filter((item) => item.id !== id))}
        onChangeMapping={(mapping) =>
          setMappings((current) => current.map((item) => item.id === mapping.id ? mapping : item))}
        onSubmit={() => {
          if (!mappingLot) return;
          const totalPaginas = mappingLot.arquivos[0]?.totalPaginas || 0;
          void workflow.mappingMutation.mutateAsync({
            loteId: mappingLot.id,
            totalPaginas,
            mappings: mappings.map((mapping) => ({
              documentoId: mapping.checklistItemId,
              paginaInicial: mapping.paginaInicio,
              paginaFinal: mapping.paginaFim,
            })),
          }).then(() => setMappingLot(null)).catch((error) =>
            setOperationError(errorMessage(error)));
        }}
        onClose={() => setMappingLot(null)}
      />
    </div>
  );
};

export default ParceiroAlunoDocumentos;
