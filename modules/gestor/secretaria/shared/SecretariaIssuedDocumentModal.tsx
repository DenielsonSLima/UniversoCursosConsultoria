import React, { useEffect, useRef, useState } from 'react';
import ReprintModal from '../historico-emissoes/components/ReprintModal';
import { historicoEmissoesService } from '../historico-emissoes/historico-emissoes.service';
import { downloadEmissionPdf } from '../historico-emissoes/preview-utils';
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

const SecretariaIssuedDocumentModal: React.FC<SecretariaIssuedDocumentModalProps> = ({
  emissions,
  poloId,
  definition,
  onClose,
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preview, setPreview] = useState<PreviewResources>(EMPTY_PREVIEW);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const currentEmission = emissions[currentIndex] || null;
  const totalEmissions = emissions.length;

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(0, emissions.length - 1)));
  }, [emissions.length]);

  useEffect(() => {
    if (!currentEmission) return undefined;

    let active = true;
    setIsLoading(true);
    setError(null);
    setPreview(EMPTY_PREVIEW);

    historicoEmissoesService
      .loadPreview(currentEmission, poloId)
      .then((resources) => {
        if (active) setPreview(resources);
      })
      .catch((loadError) => {
        if (!active) return;
        console.error('[SecretariaIssuedDocumentModal] Erro ao carregar documento emitido:', loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Não foi possível carregar o documento emitido.'
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentEmission, poloId]);

  if (!currentEmission) return null;

  const handleDownload = async () => {
    if (!printContentRef.current || error) return;
    setIsDownloading(true);
    try {
      await downloadEmissionPdf(printContentRef.current, currentEmission, 'emissao');
    } catch (downloadError) {
      console.error('[SecretariaIssuedDocumentModal] Erro ao gerar PDF:', downloadError);
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Não foi possível gerar o PDF do documento.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    if (error || isLoading) return;
    window.print();
  };

  return (
    <ReprintModal
      emission={currentEmission}
      templateConfig={preview.template}
      certificatePreview={preview.certificate}
      watermark={preview.watermark}
      poloInfo={preview.polo}
      academicPreviewData={preview.academicData}
      error={error}
      isLoading={isLoading}
      isDownloading={isDownloading}
      isReissuing={false}
      printContentRef={printContentRef}
      onClose={onClose}
      onDownload={() => {
        void handleDownload();
      }}
      onPrint={handlePrint}
      heading={`${definition.singularLabel} emitido`}
      subtitle={`Código de validação: ${currentEmission.codigo}`}
      printLabel="Imprimir documento"
      navigationLabel={totalEmissions > 1 ? `${currentIndex + 1} de ${totalEmissions}` : undefined}
      onPrevious={totalEmissions > 1 ? () => setCurrentIndex((index) => Math.max(0, index - 1)) : undefined}
      onNext={totalEmissions > 1 ? () => setCurrentIndex((index) => Math.min(totalEmissions - 1, index + 1)) : undefined}
      previousDisabled={currentIndex === 0}
      nextDisabled={currentIndex === totalEmissions - 1}
      unavailableHeading="Documento emitido indisponível"
      unavailableNote="A impressão e o PDF foram bloqueados para evitar a entrega de um documento incompleto."
    />
  );
};

export default SecretariaIssuedDocumentModal;
