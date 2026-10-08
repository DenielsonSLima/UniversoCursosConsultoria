interface EadCertificateCourse {
  ead_config?: { certificacao?: { modeloDocumento?: unknown } } | null;
}

interface CertificateModel {
  id?: string;
  tipoCurso?: string;
  modalidade?: string;
}

export const getConfiguredEadCertificateModelId = (course?: EadCertificateCourse | null) => {
  const id = course?.ead_config?.certificacao?.modeloDocumento;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
};

export const selectEadCertificateModel = <T extends CertificateModel>(
  models: T[],
  course?: EadCertificateCourse | null,
): T | undefined => {
  const configuredId = getConfiguredEadCertificateModelId(course);
  if (configuredId) return models.find(model => model.id === configuredId);
  return models.find(model =>
    String(model.tipoCurso || '').toLocaleLowerCase('pt-BR').includes('ead')
    || String(model.modalidade || '').toUpperCase() === 'EAD');
};

export const MISSING_EAD_CERTIFICATE_MODEL =
  'O modelo de certificado configurado para este curso não está disponível. Revise a configuração do curso antes de emitir a segunda via.';
