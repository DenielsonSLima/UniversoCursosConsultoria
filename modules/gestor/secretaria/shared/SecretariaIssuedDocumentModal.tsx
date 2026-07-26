import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

interface SecretariaIssuedDocumentModalProps {
  emissions: EmissionLog[];
  poloId: string;
  definition: SecretariaDocumentoDefinition;
  onClose: () => void;
}

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

const SecretariaIssuedDocumentModal: React.FC<SecretariaIssuedDocumentModalProps> = ({
  emissions,
  poloId,
  definition,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const printContentRef = useRef<HTMLDivElement>(null);
  const batchPrintContentRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [dataLoadProgress, setDataLoadProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<{
    url: string;
    filename: string;
  } | null>(null);
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
  const previewError = currentPreviewQuery.error instanceof Error
    ? currentPreviewQuery.error.message
    : currentPreviewQuery.isError
      ? 'Não foi possível carregar o documento emitido.'
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

  const handleDownload = async () => {
    if (previewError) return;
    if (preparedPdf) {
      const link = document.createElement('a');
      link.href = preparedPdf.url;
      link.download = preparedPdf.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
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

      const previews = await historicoEmissoesService.loadPreviews(
        emissions,
        poloId,
        (completed, total) => setDataLoadProgress({ completed, total }),
      );
      setBatchPreviews(previews);
      const filename = `${definition.id}-lote-${totalEmissions}-documentos.pdf`;
      const pdfBlob = await createEmissionBatchPdf(
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
      setPreparedPdf({
        url: URL.createObjectURL(pdfBlob),
        filename,
      });
      setBatchPreviews(null);
      setBatchRenderIndex(null);
    } catch (downloadFailure) {
      console.error('[SecretariaIssuedDocumentModal] Erro ao gerar PDF:', downloadFailure);
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : 'Não foi possível gerar o PDF único do lote.'
      );
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
      setDataLoadProgress(null);
      setBatchPreviews(null);
      setBatchRenderIndex(null);
    }
  };

  const handlePrint = () => {
    if (error || currentPreviewQuery.isLoading) return;
    window.print();
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
        isReissuing={false}
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
            : preparedPdf
              ? 'PDF único pronto. Clique em “Baixar PDF pronto” para salvar.'
            : `Emissão: ${definition.singularLabel} (${totalEmissions} ${totalEmissions === 1 ? 'pág.' : 'documentos'})`)
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

export default SecretariaIssuedDocumentModal;
