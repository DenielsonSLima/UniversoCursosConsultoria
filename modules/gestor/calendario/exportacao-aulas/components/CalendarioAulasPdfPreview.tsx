import React, { useMemo } from 'react';

import CanonicalDocumentPreviewModal from '../../../secretaria/shared/CanonicalDocumentPreviewModal';
import type { CanonicalDocumentPreviewItem } from '../../../secretaria/shared/canonical-document-render.types';

import type { CalendarioAulasPdfDocument } from '../types';

interface CalendarioAulasPdfPreviewProps {
  document: CalendarioAulasPdfDocument;
  onClose: () => void;
}

/**
 * O calendário é preparado pela RPC e composto uma vez. Esta ponte entrega o
 * próprio Blob vetorial ao visualizador compartilhado, portanto prévia,
 * download e impressão jamais recriam ou rasterizam o documento.
 */
const CalendarioAulasPdfPreview: React.FC<CalendarioAulasPdfPreviewProps> = ({
  document,
  onClose,
}) => {
  const previewItem = useMemo<CanonicalDocumentPreviewItem>(() => ({
    emissionId: `calendario:${document.fileName}`,
    title: 'Calendário de aulas',
    targetName: document.fileName,
    validationCode: null,
    validationUrl: null,
    validUntil: null,
    renderPayload: null,
  }), [document.fileName]);

  return (
    <CanonicalDocumentPreviewModal
      items={[previewItem]}
      title="Calendário de aulas"
      accentClassName="bg-blue-600 hover:bg-blue-700"
      fileNamePrefix="calendario-aulas"
      onClose={onClose}
      isRenderable={() => true}
      createPdf={async () => document}
    />
  );
};

export default CalendarioAulasPdfPreview;
