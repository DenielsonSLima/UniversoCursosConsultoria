import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CanonicalDocumentPreviewModal from './CanonicalDocumentPreviewModal';
import ReprintModal from '../historico-emissoes/components/ReprintModal';
import EmissionDocumentPages from '../historico-emissoes/components/EmissionDocumentPages';
import { historicoEmissoesService } from '../historico-emissoes/historico-emissoes.service';
import {
  createEmissionBatchPdf,
  downloadEmissionPdf,
} from '../historico-emissoes/preview-utils';
import type {
  EmissionLog,
  PreviewResources,
} from '../historico-emissoes/historico-emissoes.types';
import type { SecretariaDocumentoDefinition } from './secretaria-documentos.types';
import type { CanonicalDocumentPreviewItem } from './canonical-document-render.types';
import {
  createEmissionDocumentsPdf,
  type EmissionPdfSource,
} from '../historico-emissoes/emission-document.pdf';
import { isOfficialVectorDocument } from '../historico-emissoes/historico-emissoes.constants';
import { getSecretariaErrorMessage } from './secretaria-error';
import { waitForDocumentAssets } from '../../../shared/qrcode/document-assets';
import {
  assertPdfBlobReady,
  printPdfBlob,
  shouldPrintAggregatedPdf,
} from './pdf-blob-print';

interface SecretariaIssuedDocumentModalProps {
  emissions: EmissionLog[];
  poloId: string;
  definition: SecretariaDocumentoDefinition;
  onClose: () => void;
}

interface PreparedPdf {
  blob: Blob;
  url: string;
  filename: string;
}

interface VectorDocumentPreviewItem extends CanonicalDocumentPreviewItem {
  emission: EmissionLog;
}

const toVectorPreviewItem = (emission: EmissionLog): VectorDocumentPreviewItem => ({
  emission,
  emissionId: emission.id,
  title: emission.documento,
  targetName: emission.dados_emissao?.studentName || emission.aluno?.nome || 'Aluno',
  validationCode: emission.codigo || null,
  validationUrl: null,
  validUntil: emission.validade_ate,
  renderPayload: null,
});

const VectorIssuedDocumentModal: React.FC<SecretariaIssuedDocumentModalProps> = ({
  emissions,
  poloId,
  definition,
  onClose,
}) => {
  const items = emissions.map(toVectorPreviewItem);
  const createPdf = async (
    selectedItems: readonly VectorDocumentPreviewItem[],
    options: Parameters<typeof createEmissionDocumentsPdf>[1] = {},
  ) => {
    const selectedEmissions = selectedItems.map((item) => item.emission);
    const totalSteps = selectedEmissions.length * 2;
    const previews = await historicoEmissoesService.loadPreviews(
      selectedEmissions,
      poloId,
      (completed) => options.onProgress?.({ current: completed, total: totalSteps }),
    );
    const sources: EmissionPdfSource[] = selectedEmissions.map((emission, index) => ({
      emission,
      preview: previews[index],
    }));
    return createEmissionDocumentsPdf(sources, {
      ...options,
      onProgress: ({ current }) => options.onProgress?.({
        current: selectedEmissions.length + current,
        total: totalSteps,
      }),
    });
  };

  return (
    <CanonicalDocumentPreviewModal
      items={items}
      title={`Visualizador de ${definition.singularLabel}`}
      accentClassName="bg-blue-600 hover:bg-blue-700"
      fileNamePrefix={definition.id}
      onClose={onClose}
      isRenderable={() => true}
      createPdf={createPdf}
    />
  );
};

const EMPTY_PREVIEW: PreviewResources = {
  template: null,
  watermark: null,
  polo: null,
  academicData: null,
  certificate: null,
};

const previewQueryKey = (poloId: string, emission?: EmissionLog | null) => [
  'secretaria',
  'issued-document-preview',
  poloId,
  emission?.codigo || 'nenhum',
] as const;

const waitForBatchRenderer = async (
  getContainer: () => HTMLDivElement | null,
  expectedEmissionCode: string,
): Promise<HTMLDivElement> => {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const container = getContainer();
    const renderedDocument = container?.querySelector<HTMLElement>(
      '[data-emission-batch-code]'
    );
    if (
      container
      && renderedDocument?.dataset.emissionBatchCode === expectedEmissionCode
      && renderedDocument.querySelector('.print-page, [data-certificate-pdf-page="true"]')
    ) {
      return container;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error('O visualizador do lote não ficou pronto a tempo para gerar o PDF.');
};

const LegacyIssuedDocumentModal: React.FC<SecretariaIssuedDocumentModalProps> = ({
  emissions,
  poloId,
  definition,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const printContentRef = useRef<HTMLDivElement>(null);
  const batchPrintContentRef = useRef<HTMLDivElement>(null);
  const batchPdfPreparationRef = useRef<Promise<PreparedPdf> | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [dataLoadProgress, setDataLoadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<PreparedPdf | null>(null);
  const [batchPreviews, setBatchPreviews] = useState<PreviewResources[] | null>(null);
  const [batchRenderIndex, setBatchRenderIndex] = useState<number | null>(null);

  const currentEmission = emissions[currentIndex] || null;
  const totalEmissions = emissions.length;
  const currentPreviewQuery = useQuery({
    queryKey: previewQueryKey(poloId, currentEmission),
    queryFn: () => historicoEmissoesService.loadPreview(currentEmission!, poloId),
    enabled: Boolean(currentEmission),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
  const preview = currentPreviewQuery.data || EMPTY_PREVIEW;
  const previewError = currentPreviewQuery.isError
    ? getSecretariaErrorMessage(
        currentPreviewQuery.error,
        'Não foi possível carregar o documento emitido.',
      )
    : null;
  const error = previewError;

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, emissions.length - 1)));
  }, [emissions.length]);

  useEffect(() => () => {
    if (preparedPdf?.url) URL.revokeObjectURL(preparedPdf.url);
  }, [preparedPdf?.url]);

  useEffect(() => {
    const neighbors = [emissions[currentIndex - 1], emissions[currentIndex + 1]].filter(Boolean);
    neighbors.forEach((emission) => {
      void queryClient.prefetchQuery({
        queryKey: previewQueryKey(poloId, emission),
        queryFn: () => historicoEmissoesService.loadPreview(emission, poloId),
        staleTime: 5 * 60_000,
      });
    });
  }, [currentIndex, emissions, poloId, queryClient]);

  if (!currentEmission) return null;

  const downloadPreparedPdf = (pdf: PreparedPdf) => {
    assertPdfBlobReady(pdf.blob, 'O PDF agregado');
    const link = document.createElement('a');
    link.href = pdf.url;
    link.download = pdf.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const prepareAggregatedPdf = async (): Promise<PreparedPdf> => {
    if (preparedPdf) return preparedPdf;
    if (batchPdfPreparationRef.current) return batchPdfPreparationRef.current;

    const preparation = (async () => {
      setDownloadProgress(null);
      setDataLoadProgress(null);
      const previews = await historicoEmissoesService.loadPreviews(
        emissions,
        poloId,
        (completed, total) => setDataLoadProgress({ completed, total }),
      );
      setBatchPreviews(previews);
      const filename = `${definition.id}-lote-${totalEmissions}-documentos.pdf`;
      const blob = await createEmissionBatchPdf(
        totalEmissions,
        async (documentIndex) => {
          setBatchRenderIndex(documentIndex);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          return waitForBatchRenderer(
            () => batchPrintContentRef.current,
            emissions[documentIndex].codigo,
          );
        },
        (completed, total) => setDownloadProgress({ completed, total }),
      );
      assertPdfBlobReady(blob, 'O PDF agregado');
      const nextPdf = {
        blob,
        url: URL.createObjectURL(blob),
        filename,
      };
      setPreparedPdf(nextPdf);
      return nextPdf;
    })();

    batchPdfPreparationRef.current = preparation;
    try {
      return await preparation;
    } finally {
      batchPdfPreparationRef.current = null;
      setDownloadProgress(null);
      setDataLoadProgress(null);
      setBatchPreviews(null);
      setBatchRenderIndex(null);
    }
  };

  const handleDownload = async () => {
    if (previewError || isDownloading || isPrinting) return;
    if (preparedPdf) {
      downloadPreparedPdf(preparedPdf);
      return;
    }
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(null);
    setDataLoadProgress(null);
    try {
      if (totalEmissions === 1) {
        if (!printContentRef.current) return;
        await downloadEmissionPdf(printContentRef.current, currentEmission, 'emissao');
        return;
      }

      downloadPreparedPdf(await prepareAggregatedPdf());
    } catch (downloadFailure) {
      console.error('[SecretariaIssuedDocumentModal] Erro ao gerar PDF:', downloadFailure);
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : 'Não foi possível gerar o PDF único do lote.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (
      error
      || currentPreviewQuery.isLoading
      || !printContentRef.current
      || isPrinting
      || isDownloading
    ) return;
    setIsPrinting(true);
    setDownloadError(null);
    try {
      if (shouldPrintAggregatedPdf(totalEmissions)) {
        const pdf = await prepareAggregatedPdf();
        await printPdfBlob(pdf.blob, {
          title: `${definition.singularLabel} — ${totalEmissions} documentos`,
        });
      } else {
        await waitForDocumentAssets(printContentRef.current);
        window.print();
      }
    } catch (printFailure) {
      console.error('[SecretariaIssuedDocumentModal] Documento indisponível:', printFailure);
      setDownloadError(
        printFailure instanceof Error
          ? printFailure.message
          : 'Não foi possível preparar os elementos do documento para impressão.',
      );
    } finally {
      setIsPrinting(false);
    }
  };

  const batchRenderer = batchPreviews
    && batchPreviews.length === emissions.length
    && batchRenderIndex !== null
    ? (
        <div
          ref={batchPrintContentRef}
          className="pointer-events-none fixed left-[-12000px] top-0 w-[210mm] bg-white"
          aria-hidden="true"
        >
          <div
            key={emissions[batchRenderIndex].codigo}
            data-emission-batch-code={emissions[batchRenderIndex].codigo}
          >
            <EmissionDocumentPages
              emission={emissions[batchRenderIndex]}
              templateConfig={batchPreviews[batchRenderIndex].template}
              certificatePreview={batchPreviews[batchRenderIndex].certificate}
              watermark={batchPreviews[batchRenderIndex].watermark}
              poloInfo={batchPreviews[batchRenderIndex].polo}
              academicPreviewData={batchPreviews[batchRenderIndex].academicData}
            />
          </div>
        </div>
      )
    : null;

  return (
    <>
      <ReprintModal
        emission={currentEmission}
        templateConfig={preview.template}
        certificatePreview={preview.certificate}
        watermark={preview.watermark}
        poloInfo={preview.polo}
        academicPreviewData={preview.academicData}
        error={error}
        isLoading={currentPreviewQuery.isLoading}
        isDownloading={isDownloading}
        isReissuing={isPrinting}
        printContentRef={printContentRef}
        onClose={onClose}
        onDownload={() => {
          void handleDownload();
        }}
        onPrint={handlePrint}
        heading="Visualizador de documentos"
        subtitle={
          downloadError
          || (isDownloading
            ? downloadProgress
              ? `Gerando PDF único: ${downloadProgress.completed} de ${downloadProgress.total} documentos`
              : dataLoadProgress
                ? `Carregando dados do lote: ${dataLoadProgress.completed} de ${dataLoadProgress.total} documentos`
                : `Preparando ${totalEmissions} documentos para o PDF único...`
            : isPrinting && totalEmissions > 1
              ? downloadProgress
                ? `Preparando impressão do lote: ${downloadProgress.completed} de ${downloadProgress.total} documentos`
                : dataLoadProgress
                  ? `Carregando dados para impressão: ${dataLoadProgress.completed} de ${dataLoadProgress.total} documentos`
                  : `Preparando PDF agregado com ${totalEmissions} documentos...`
            : preparedPdf
              ? 'PDF único pronto. Clique em “Baixar PDF pronto” para salvar.'
            : totalEmissions === 1
              ? `Emissão: ${definition.singularLabel} (${Math.max(1, Number(preview.template?.pageCount || 1))} ${Math.max(1, Number(preview.template?.pageCount || 1)) === 1 ? 'pág.' : 'págs.'})`
              : `Emissão: ${definition.singularLabel} (${totalEmissions} documentos)`)
        }
        downloadLabel={preparedPdf ? 'Baixar PDF pronto' : undefined}
        printLabel="Imprimir"
        navigationLabel={totalEmissions > 1 ? `${currentIndex + 1} de ${totalEmissions}` : undefined}
        onPrevious={totalEmissions > 1 ? () => setCurrentIndex((index) => Math.max(0, index - 1)) : undefined}
        onNext={totalEmissions > 1 ? () => setCurrentIndex((index) => Math.min(totalEmissions - 1, index + 1)) : undefined}
        previousDisabled={currentIndex === 0}
        nextDisabled={currentIndex === totalEmissions - 1}
        unavailableHeading="Documento emitido indisponível"
        unavailableNote="A impressão e o PDF foram bloqueados para evitar a entrega de um documento incompleto."
        fullscreenViewer
      />
      {batchRenderer && createPortal(batchRenderer, document.body)}
    </>
  );
};

const SecretariaIssuedDocumentModal: React.FC<SecretariaIssuedDocumentModalProps> = (props) => (
  isOfficialVectorDocument(props.definition.id)
    ? <VectorIssuedDocumentModal {...props} />
    : <LegacyIssuedDocumentModal {...props} />
);

export default SecretariaIssuedDocumentModal;
