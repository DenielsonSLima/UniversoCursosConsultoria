import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { MatriculaTecnicaPendenteDocumento } from '../../../documentos-aluno.service';
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
import DocumentoLegacyReceiptModal from './documentos/DocumentoLegacyReceiptModal';
import DocumentoPreviewHistoryModal from './documentos/DocumentoPreviewHistoryModal';
import DocumentoReviewModal from './documentos/DocumentoReviewModal';
import DocumentosChecklist from './documentos/DocumentosChecklist';
import DocumentosPendingLots from './documentos/DocumentosPendingLots';
import MatriculaImplantacaoDialog from './documentos/MatriculaImplantacaoDialog';
import MatriculaTecnicaAccessSection from './documentos/MatriculaTecnicaAccessSection';
import PdfUnicoMappingModal from './documentos/PdfUnicoMappingModal';
import { useParceiroAlunoDocumentosWorkflow } from './useParceiroAlunoDocumentosWorkflow';

interface ParceiroAlunoDocumentosProps {
  alunoId: string;
  toast: {
    success: (title: string, message?: string) => void;
  };
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.';

const ParceiroAlunoDocumentos: React.FC<ParceiroAlunoDocumentosProps> = ({
  alunoId,
  toast,
}) => {
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
  const [legacyReceiptItem, setLegacyReceiptItem] =
    useState<DocumentoAlunoChecklistItem | null>(null);
  const [legacyReceiptReason, setLegacyReceiptReason] = useState('');
  const [implantationEnrollment, setImplantationEnrollment] =
    useState<MatriculaTecnicaPendenteDocumento | null>(null);
  const [implantationReason, setImplantationReason] = useState('');

  if (workflow.painelQuery.isError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-white p-5 text-center shadow-sm">
        <p className="text-sm font-semibold text-red-700">Não foi possível carregar os documentos.</p>
        <p className="mt-2 text-sm font-medium text-slate-500">
          {errorMessage(workflow.painelQuery.error)}
        </p>
        <button
          type="button"
          onClick={() => void workflow.painelQuery.refetch()}
          className="mt-5 min-h-11 rounded-xl bg-[#001a33] px-5 text-xs font-semibold text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (workflow.painelQuery.isLoading || !painel) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm font-medium text-slate-500">
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
      : legacyReceiptItem?.id && workflow.legacyReceiptMutation.isPending
        ? legacyReceiptItem.id
      : workflow.legacyReceiptRevokeMutation.isPending
        ? workflow.legacyReceiptRevokeMutation.variables?.documentoId || null
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
    <div className="space-y-5">
      <AlunoDocumentosSummary itens={painel.itens} />
      {operationError ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          {operationError}
        </p>
      ) : null}

      <DocumentosPendingLots
        preparingLots={preparingLots}
        awaitingMappings={awaitingMappings}
        cancelledCleanupLots={cancelledCleanupLots}
        cancelPending={workflow.cancelPdfMutation.isPending}
        pagesPending={workflow.pagesMutation.isPending}
        deletePending={workflow.deleteMutation.isPending}
        onOpenMapping={(lot) => {
          void openMapping(lot).catch((error) => setOperationError(errorMessage(error)));
        }}
        onCancelPdf={(lot, reason) => {
          setOperationError(null);
          void workflow.cancelPdfMutation.mutateAsync({
            loteId: lot.id,
            arquivoIds: lot.arquivos.map((file) => file.id),
            motivo: reason,
          }).catch((error) => setOperationError(errorMessage(error)));
        }}
        onRetryCleanup={(fileIds) => {
          setOperationError(null);
          void workflow.deleteMutation.mutateAsync({
            arquivoIds: fileIds,
            motivo: 'Nova tentativa de limpeza de PDF cancelado.',
          }).catch((error) => setOperationError(errorMessage(error)));
        }}
      />

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
        onMarkReceived={painel.podeRegistrarRecebimentoSemAnexo
          ? (item) => {
            setOperationError(null);
            setLegacyReceiptReason('');
            setLegacyReceiptItem(item);
          }
          : undefined}
        onRevokeReceived={(item) => {
          const motivo = window.prompt(
            'Informe o motivo da correção deste registro (mínimo de 10 caracteres):',
          )?.trim();
          if (!motivo) return;
          if (motivo.length < 10) {
            setOperationError('O motivo da correção deve ter pelo menos 10 caracteres.');
            return;
          }
          setOperationError(null);
          void workflow.legacyReceiptRevokeMutation.mutateAsync({
            documentoId: item.id,
            motivo,
          }).catch((error) => setOperationError(errorMessage(error)));
        }}
      />

      {workflow.matriculasQuery.isError ? (
        <section className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-800">
            Não foi possível carregar o fluxo das matrículas técnicas.
          </p>
          <p className="mt-1 text-sm font-semibold text-red-700">
            {errorMessage(workflow.matriculasQuery.error)}
          </p>
          <button
            type="button"
            onClick={() => void workflow.matriculasQuery.refetch()}
            className="mt-3 min-h-10 rounded-xl bg-red-700 px-4 text-xs font-semibold text-white"
          >
            Tentar novamente
          </button>
        </section>
      ) : null}

      <MatriculaTecnicaAccessSection
        enrollments={matriculas}
        activatePending={workflow.activateMutation.isPending}
        implantationReleasePending={workflow.implantationReleaseMutation.isPending}
        implantationRevokePending={workflow.implantationRevokeMutation.isPending}
        onActivate={(enrollment) => {
          setOperationError(null);
          void workflow.activateMutation
            .mutateAsync(enrollment.matriculaId)
            .then(() => toast.success(
              'Matrícula técnica ativada',
              `${enrollment.cursoNome} teve o acesso regular liberado com sucesso.`,
            ))
            .catch((error) => setOperationError(errorMessage(error)));
        }}
        onOpenImplantation={(enrollment) => {
          setOperationError(null);
          setImplantationReason('');
          setImplantationEnrollment(enrollment);
        }}
        onRevokeImplantation={(enrollment, reason) => {
          setOperationError(null);
          void workflow.implantationRevokeMutation.mutateAsync({
            matriculaId: enrollment.matriculaId,
            motivo: reason,
          }).catch((error) => setOperationError(errorMessage(error)));
        }}
        onValidationError={setOperationError}
      />

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

      <DocumentoLegacyReceiptModal
        open={Boolean(legacyReceiptItem)}
        documentName={legacyReceiptItem?.nome || ''}
        reason={legacyReceiptReason}
        submitting={workflow.legacyReceiptMutation.isPending}
        error={operationError}
        onReasonChange={setLegacyReceiptReason}
        onSubmit={() => {
          const documentoId = legacyReceiptItem?.id;
          if (!documentoId) return;
          void workflow.legacyReceiptMutation.mutateAsync({
            documentoId,
            motivo: legacyReceiptReason,
          }).then(() => setLegacyReceiptItem(null)).catch((error) =>
            setOperationError(errorMessage(error)));
        }}
        onClose={() => setLegacyReceiptItem(null)}
      />

      <MatriculaImplantacaoDialog
        open={Boolean(implantationEnrollment)}
        courseName={implantationEnrollment?.cursoNome || ''}
        className={implantationEnrollment?.turmaNome || ''}
        reason={implantationReason}
        submitting={workflow.implantationReleaseMutation.isPending}
        error={operationError}
        onReasonChange={setImplantationReason}
        onConfirm={() => {
          const matriculaId = implantationEnrollment?.matriculaId;
          if (!matriculaId) return;
          setOperationError(null);
          void workflow.implantationReleaseMutation.mutateAsync({
            matriculaId,
            motivo: implantationReason,
          }).then(() => {
            setImplantationEnrollment(null);
            toast.success(
              'Acesso acadêmico liberado',
              'O aluno foi liberado sem gerar financeiro.',
            );
          }).catch((error) => setOperationError(errorMessage(error)));
        }}
        onClose={() => setImplantationEnrollment(null)}
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
