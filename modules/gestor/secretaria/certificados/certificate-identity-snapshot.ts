import type { CertificadoAcademico } from './certificados.types';

const IDENTITY_FIELDS = [
  'studentDocumentType', 'studentCpf', 'studentRg',
  'studentRgIssuer', 'studentRgState', 'studentRgIssueDate',
] as const;

/** A segunda via EAD usa a identidade da emissão, sem misturar outro snapshot. */
export const withCertificateEmissionIdentity = (
  certificate: CertificadoAcademico,
  emissionSnapshot: Record<string, unknown> | null | undefined,
): CertificadoAcademico => {
  if (certificate.modalidade !== 'EAD') return certificate;
  const metadata = { ...certificate.metadados };
  for (const key of IDENTITY_FIELDS) {
    delete metadata[key];
    if (emissionSnapshot && Object.prototype.hasOwnProperty.call(emissionSnapshot, key)) {
      metadata[key] = emissionSnapshot[key];
    }
  }
  return { ...certificate, metadados: metadata };
};
