import React, { useMemo } from 'react';

import CanonicalDocumentPreviewModal from '../../gestor/secretaria/shared/CanonicalDocumentPreviewModal';
import type { CanonicalDocumentPreviewItem } from '../../gestor/secretaria/shared/canonical-document-render.types';
import { createPlanoCursoPdf } from './plano-curso.pdf';
import type { PlanoCursoDocumentoResponse } from './plano-curso.types';

interface PlanoCursoPdfPreviewProps {
  payload: PlanoCursoDocumentoResponse;
  onClose: () => void;
}

interface PlanoCursoPreviewItem extends CanonicalDocumentPreviewItem {
  payload: PlanoCursoDocumentoResponse;
}

const PlanoCursoPdfPreview: React.FC<PlanoCursoPdfPreviewProps> = ({ payload, onClose }) => {
  const item = useMemo<PlanoCursoPreviewItem>(() => ({
    emissionId: [
      payload.planoId,
      payload.revisao,
      payload.templateRevision,
      payload.documentoFingerprint,
    ].join('-'),
    title: payload.documento.cabecalho.titulo,
    targetName: payload.documento.componente.disciplinaNome,
    validationCode: null,
    validationUrl: null,
    validUntil: null,
    renderPayload: null,
    payload,
  }), [payload]);

  return (
    <CanonicalDocumentPreviewModal
      items={[item]}
      title="Plano de Curso"
      accentClassName="bg-emerald-600 hover:bg-emerald-700"
      fileNamePrefix="plano-curso"
      onClose={onClose}
      isRenderable={(candidate) => candidate.payload.documento.paginas.length > 0}
      createPdf={async ([candidate]) => {
        if (!candidate) throw new Error('O servidor não retornou o Plano de Curso selecionado.');
        return createPlanoCursoPdf(candidate.payload.documento);
      }}
    />
  );
};

export default PlanoCursoPdfPreview;
