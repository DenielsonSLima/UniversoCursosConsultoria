import { normalizeCanonicalDocumentRenderPayload } from '../shared/canonical-document-render.utils';
import { isContratoAlunoRenderPayloadReady } from '../contratos-aluno/components/ContratoAlunoDocumentRenderer';
import type { ContratoAlunoPreparedDocument } from '../contratos-aluno/types/contratos-aluno.types';
import type { EmissionLog } from './historico-emissoes.types';

const toContractPreparedDocument = (emission: EmissionLog): ContratoAlunoPreparedDocument => {
  const frozen = emission.dados_emissao || {};
  const renderPayload = normalizeCanonicalDocumentRenderPayload({
    template: frozen.templateSnapshot ?? frozen.template_snapshot,
    template_revision: frozen.templateRevision ?? frozen.template_revision,
    snapshot: frozen.contractSnapshot ?? frozen.contract_snapshot,
    rendered: frozen.renderedDocument ?? frozen.rendered_document,
  });

  const document: ContratoAlunoPreparedDocument = {
    emissionId: emission.codigo || emission.id,
    documentId: emission.id,
    title: String(
      frozen.templateSnapshot?.tituloDocumento
      || frozen.template_snapshot?.tituloDocumento
      || 'Contrato do Aluno'
    ),
    targetName: String(
      frozen.contractSnapshot?.aluno?.nome
      || frozen.contract_snapshot?.aluno?.nome
      || emission.aluno?.nome
      || 'Aluno'
    ),
    validationCode: emission.codigo || null,
    validationUrl: emission.codigo ? `/validador?code=${emission.codigo}` : null,
    validUntil: emission.validade_ate,
    fileUrl: null,
    statusLabel: emission.status,
    renderPayload,
  };

  if (!isContratoAlunoRenderPayloadReady(document)) {
    throw new Error(
      'O contrato histórico não possui template, snapshot e páginas canônicas congeladas para reimpressão.'
    );
  }
  return document;
};

export const createContractHistoryPdf = async (emission: EmissionLog) => {
  const { createContratosAlunoPdf } = await import('../contratos-aluno/contratos-aluno.pdf');
  return createContratosAlunoPdf([toContractPreparedDocument(emission)]);
};


export interface VectorPreviewPdf {
  blob: Blob;
  url: string;
  emissionKey: string;
}

