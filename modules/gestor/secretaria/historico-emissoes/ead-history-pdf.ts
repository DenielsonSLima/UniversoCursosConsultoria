import { buildEadCertificatePdf } from '../certificados/ead-certificate-pdf';
import { withCertificateEmissionIdentity } from '../certificados/certificate-identity-snapshot';
import { isPublicDocumentValidationEnabled } from './document-validation-rendering';
import { getEmissionRenderKey, waitForCanonicalEmissionRender } from './reissue-flow';
import type { EmissionLog, PreviewResources } from './historico-emissoes.types';
import type { VectorPreviewPdf } from './contract-history-pdf';

export const isEadCertificateEmission = (emission: EmissionLog | null) =>
  emission?.documento === 'certificado_ead';

/** Only content rendered on the certificate belongs to the PDF cache key. */
export const getEadHistoryPdfKey = (emission: EmissionLog, preview: PreviewResources): string => {
  if (!preview.certificate || !preview.template) {
    throw new Error('O certificado EAD e seu modelo oficial não foram carregados.');
  }
  return JSON.stringify({
    code: emission.codigo,
    template: preview.template,
    certificate: withCertificateEmissionIdentity(preview.certificate, emission.dados_emissao),
    curriculum: emission.dados_emissao?.eadCurriculum ?? null,
    curriculumTable: emission.dados_emissao?.eadCurriculumTable ?? null,
    validationPublic: isPublicDocumentValidationEnabled(emission),
  });
};

export const prepareEadHistoryPdf = async (
  emission: EmissionLog,
  preview: PreviewResources,
  getContainer: () => HTMLDivElement | null,
  cached: VectorPreviewPdf | null,
): Promise<{ blob: Blob; emissionKey: string }> => {
  const emissionKey = getEadHistoryPdfKey(emission, preview);
  if (cached?.emissionKey === emissionKey) return { blob: cached.blob, emissionKey };
  const container = await waitForCanonicalEmissionRender(getContainer, getEmissionRenderKey(emission));
  // The EAD compositor waits for fonts, QR and original assets and keeps native A4 pages.
  return { blob: await buildEadCertificatePdf(container), emissionKey };
};
