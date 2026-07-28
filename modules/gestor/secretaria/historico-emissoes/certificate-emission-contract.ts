import type { CertificadoAcademico } from '../certificados/certificados.types';
import type { EmissionLog } from './historico-emissoes.types';

export const normalizeDocumentValidationCode = (code: unknown): string =>
  String(code || '').trim().toUpperCase();

export const isCertificateAlignedWithEmission = (
  certificate: Pick<CertificadoAcademico, 'codigo_validacao'>,
  emission: Pick<EmissionLog, 'codigo'>,
): boolean => (
  Boolean(normalizeDocumentValidationCode(emission.codigo))
  && normalizeDocumentValidationCode(certificate.codigo_validacao)
    === normalizeDocumentValidationCode(emission.codigo)
);

export const assertCertificateAlignedWithEmission = (
  certificate: Pick<CertificadoAcademico, 'codigo_validacao'>,
  emission: Pick<EmissionLog, 'codigo'>,
) => {
  if (!isCertificateAlignedWithEmission(certificate, emission)) {
    throw new Error(
      'O certificado localizado possui código de validação diferente da emissão canônica. Nenhum documento foi gerado.',
    );
  }
};
