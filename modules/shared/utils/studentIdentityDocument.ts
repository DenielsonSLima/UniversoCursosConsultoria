import {
  formatTechnicalDocumentTypeLabel,
  isCinDocumentType,
  isCnhDocumentType,
  normalizeTechnicalDocumentType,
} from './technicalEnrollmentRequirements.ts';

export interface StudentIdentitySource {
  cpf?: string | null;
  cpf_cnpj?: string | null;
  rg?: string | null;
  tipoDocumento?: string | null;
  tipo_documento?: string | null;
  orgaoEmissor?: string | null;
  orgao_emissor?: string | null;
  rgUfEmissao?: string | null;
  rg_uf_emissao?: string | null;
  rgDataEmissao?: string | null;
  rg_data_emissao?: string | null;
}

const firstText = (...values: unknown[]) => {
  const value = values.find((item) => String(item || '').trim());
  return String(value || '').trim();
};

export const resolveStudentIdentityDocument = (source: StudentIdentitySource | null | undefined) => {
  const type = normalizeTechnicalDocumentType(
    source?.tipoDocumento || source?.tipo_documento,
  );
  const cin = isCinDocumentType(type);
  const cnh = isCnhDocumentType(type);
  const keepsLegacyMetadata = Boolean(type) && !cin && !cnh;

  return {
    type,
    label: type ? formatTechnicalDocumentTypeLabel(type) : '',
    number: cin
      ? firstText(source?.cpf, source?.cpf_cnpj)
      : type ? firstText(source?.rg) : '',
    issuer: keepsLegacyMetadata ? firstText(source?.orgaoEmissor, source?.orgao_emissor) : '',
    state: keepsLegacyMetadata ? firstText(source?.rgUfEmissao, source?.rg_uf_emissao) : '',
    issueDate: keepsLegacyMetadata ? firstText(source?.rgDataEmissao, source?.rg_data_emissao) : '',
    isCin: cin,
  };
};
