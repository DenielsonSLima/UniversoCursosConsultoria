import type { CertificadoAcademico } from './certificados.types';

const EAD_EMISSION_FIELDS = [
  'studentDocumentType', 'studentCpf', 'studentRg',
  'studentRgIssuer', 'studentRgState', 'studentRgIssueDate', 'eadStudyPeriod',
] as const;

/** A segunda via EAD usa os dados congelados na emissão correspondente ao código. */
export const withCertificateEmissionSnapshot = (
  certificate: CertificadoAcademico,
  emissionSnapshot: Record<string, unknown> | null | undefined,
): CertificadoAcademico => {
  if (certificate.modalidade !== 'EAD') return certificate;
  const metadata = { ...certificate.metadados };
  for (const key of EAD_EMISSION_FIELDS) {
    delete metadata[key];
    if (emissionSnapshot && Object.prototype.hasOwnProperty.call(emissionSnapshot, key)) {
      metadata[key] = emissionSnapshot[key];
    }
  }
  return { ...certificate, metadados: metadata };
};
