import { describeNfsePresetCode, type NfsePresetReviewCatalogs } from './nfse-preset-review.domains';
import type { NfseValuesCatalogs, NfseValuesContext } from '../services/nfse-model-values.types';

const labels: Record<string, string> = {
  recipientSource: 'Tomador definido na emissão', recipientAddressSource: 'Origem do endereço do tomador', destinationSource: 'Origem do destinatário', intermediarySource: 'Origem do intermediário', competenceMode: 'Origem da competência', competenceDate: 'Competência fixa', dpsSeriesMode: 'Origem da série DPS', dpsSeries: 'Série personalizada',
  issuerRole: 'Papel do emitente', simpleNationalOption: 'Opção pelo Simples', simpleNationalAssessment: 'Apuração do Simples',
  recipientLocation: 'Localização do tomador', recipientIncludeAddress: 'Incluir endereço do tomador', recipientIsDestination: 'Tomador é destinatário',
  destinationPartnerLabel: 'Destinatário cadastrado', intermediaryLocation: 'Localização do intermediário', intermediaryPartnerLabel: 'Intermediário cadastrado',
  countryCode: 'País da prestação', countryLabel: 'País da prestação', municipalityCode: 'Município da prestação', municipalityLabel: 'Município da prestação',
  exportResultCountryCode: 'País do resultado', exportResultCountryLabel: 'País do resultado', includeIbsCbs: 'Informar IBS/CBS', governmentPurchase: 'Compra governamental',
  governmentEntityType: 'Tipo de ente governamental', operationType: 'Tipo de operação', destinationLocation: 'Localização do destinatário', personalUse: 'Uso ou consumo pessoal',
  providerPartnerLabel: 'Prestador cadastrado', providerPartner: 'Origem do prestador', providerLocation: 'Localização do prestador', emissionReason: 'Motivo da emissão', rejectedInvoiceReference: 'NFS-e rejeitada',
  nif: 'Identificação fiscal exterior', provider: 'Prestador', recipient: 'Tomador', destination: 'Destinatário', intermediary: 'Intermediário',
  policy: 'Estratégia de identificação', absenceReason: 'Motivo de ausência do NIF', people: 'Pessoas', service: 'Serviço',
  municipalServiceCode: 'Código complementar municipal', internalContributorCode: 'Código interno do contribuinte', construction: 'Obra', property: 'Imóvel', event: 'Evento',
  foreignTrade: 'Comércio exterior', operationReferences: 'Referências de NFS-e', orderItems: 'Itens do pedido', rentedMovableAssets: 'Bens móveis',
  source: 'Origem', value: 'Valor', propertyTaxRegistration: 'Inscrição imobiliária fiscal', identification: 'Identificação', kind: 'Forma de identificação',
  workCode: 'Código da obra', cib: 'CIB', address: 'Endereço', postalCode: 'Código postal', street: 'Logradouro', number: 'Número', complement: 'Complemento', district: 'Bairro',
  city: 'Cidade', stateProvince: 'Estado/província/região', municipality: 'Município do imóvel', units: 'Identificação do imóvel', originalDueDate: 'Vencimento original',
  description: 'Descrição', startDate: 'Data inicial', endDate: 'Data final', municipalId: 'Identificador municipal', provisionMode: 'Modo de prestação', relationship: 'Vínculo entre as partes',
  currencyCode: 'Moeda', serviceAmount: 'Valor do serviço', providerSupport: 'Apoio/fomento do prestador', recipientSupport: 'Apoio/fomento do tomador', temporaryGoods: 'Movimentação temporária de bens',
  importDeclaration: 'Declaração de importação', exportRegistration: 'Registro de exportação', shareWithMdic: 'Compartilhar com MDIC',
  fixedAmount: 'Valor fixo', intermediaryAmount: 'Valor do intermediário', unconditionalDiscount: 'Desconto incondicionado', conditionalDiscount: 'Desconto condicionado',
  iss: 'ISSQN', specialTaxRegime: 'Regime especial', suspensionType: 'Suspensão da exigibilidade', suspensionProcessNumber: 'Processo de suspensão', retention: 'Retenção',
  rateSource: 'Origem da alíquota', ratePercent: 'Alíquota (%)', benefitId: 'Benefício municipal', benefitReduction: 'Redução por benefício', deduction: 'Dedução/redução',
  mode: 'Regra', documents: 'Documentos vinculados', documentType: 'Tipo de documento', categoryCode: 'Categoria', categoryDescription: 'Descrição da categoria',
  documentDescription: 'Descrição do documento', allocationMode: 'Forma de rateio', allocationValue: 'Valor/percentual do rateio', supplierSource: 'Origem do fornecedor',
  supplierPartnerLabel: 'Fornecedor cadastrado', federal: 'Tributos federais', pisCofinsCst: 'CST PIS/COFINS', base: 'Base', pisRatePercent: 'Alíquota PIS (%)',
  cofinsRatePercent: 'Alíquota COFINS (%)', retentionType: 'Tipo de retenção PIS/COFINS', withheldCp: 'Retenção previdenciária', withheldIrrf: 'IRRF',
  withheldSocialContributions: 'CSLL', ibscbs: 'IBS/CBS', cst: 'CST', classificationCode: 'Classificação tributária', presumedCreditCode: 'Crédito presumido',
  regularTaxation: 'Tributação regular', deferral: 'Diferimento', statePercent: 'IBS estadual (%)', municipalPercent: 'IBS municipal (%)', cbsPercent: 'CBS (%)',
  reimbursementDocuments: 'Documentos de reembolso/ressarcimento', transparency: 'Tributos aproximados', state: 'Estadual', municipal: 'Municipal',
  federalPercent: 'Tributos federais aproximados (%)', simpleNationalPercent: 'Percentual do Simples', rental: 'Locação', amounts: 'Valores', percentages: 'Percentuais',
};
const values: Record<string, string> = {
  FIXED: 'Definido neste pré-modelo', AT_ISSUANCE: 'Definir na emissão', FROM_PARTNER: 'Cadastro do parceiro', FROM_ESTABLISHMENT: 'Configuração da unidade',
  REQUIRE_NIF: 'Exigir NIF no cadastro', WITHOUT_NIF: 'Sem NIF, com justificativa', ISSUE_DATE: 'Data da emissão', FIXED_DATE: 'Competência fixa',
  AUTOMATIC: 'Gerar automaticamente', CUSTOM: 'Série personalizada', PROVIDER: 'Prestador', RECIPIENT: 'Tomador', INTERMEDIARY: 'Intermediário',
  BRASIL: 'Brasil', EXTERIOR: 'Exterior', NOT_INFORMED: 'Não informado', CIB: 'CIB', ADDRESS: 'Endereço', WORK_CODE: 'CNO/CEI', MUNICIPAL_ID: 'Identificador municipal',
  RECEIPTS: 'Valor da preparação: recebimentos ou serviço', NONE: 'Não aplicar', PERCENTAGE: 'Percentual', FROM_RULES: 'Regras municipais', EXPLICIT: 'Informado explicitamente',
  JUDICIAL: 'Decisão judicial', ADMINISTRATIVE: 'Processo administrativo', AMOUNTS: 'Valores monetários', PERCENTAGES: 'Percentuais', SIMPLE_NATIONAL_PERCENTAGE: 'Percentual do Simples',
  SERVICE: 'Valor do serviço', SERVICE_AFTER_UNCONDITIONAL: 'Serviço menos desconto incondicionado',
  SERVICE_AFTER_UNCONDITIONAL_AND_DEDUCTION: 'Serviço menos desconto incondicionado e dedução', TOTAL_OPERATION: 'Total da operação',
  LINKED_OPERATION_DOCUMENTS: 'Documentos vinculados à operação', DOCUMENT: 'Cadastro do documento', FIXED_PARTNER: 'Parceiro definido no modelo', OMIT: 'Não informar',
  NATIONAL_NFSE: 'NFS-e nacional', NFE: 'NF-e', CTE: 'CT-e', OTHER_NATIONAL_DFE: 'Outro documento fiscal nacional', MUNICIPAL_NFSE: 'NFS-e municipal',
  NF_NFS: 'Nota fiscal de serviços', OTHER_FISCAL: 'Outro documento fiscal', NON_FISCAL: 'Documento não fiscal', ELIGIBLE_AMOUNT: 'Valor elegível',
};
const skipped = new Set(['version', 'unitKey', 'destinationPartnerId', 'intermediaryPartnerId', 'supplierPartnerId', 'providerPartnerLabel', 'destinationPartnerLabel', 'intermediaryPartnerLabel', 'supplierPartnerLabel']);
export function nfsePresetReviewRows(value: unknown, prefix = '', path: readonly string[] = [], catalogs?: NfsePresetReviewCatalogs, valuesCatalogs?: NfseValuesCatalogs, profile?: NfseValuesContext['profile']): { label: string; value: string }[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => nfsePresetReviewRows(entry, `${prefix} ${index + 1}`, path, catalogs, valuesCatalogs, profile));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.entries(record).flatMap(([key, entry]) => {
      if (skipped.has(key) || (key === 'countryCode' && record.countryLabel) || (key === 'municipalityCode' && record.municipalityLabel)
        || (key === 'exportResultCountryCode' && record.exportResultCountryLabel)) return [];
      const contextualLabel = path.includes('transparency') && key === 'statePercent' ? 'Tributos estaduais aproximados (%)' : path.includes('transparency') && key === 'municipalPercent' ? 'Tributos municipais aproximados (%)' : null;
      const label = contextualLabel || labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2');
      return nfsePresetReviewRows(entry, prefix ? `${prefix} · ${label}` : label, [...path, key], catalogs, valuesCatalogs, profile);
    });
  }
  const text = typeof value === 'boolean' ? value ? 'Sim' : 'Não' : String(value);
  return [{ label: prefix, value: describeNfsePresetCode(path.at(-1) || '', text, path, catalogs, valuesCatalogs, profile) || values[text] || (/^[0-9a-f-]{36}$/i.test(text) ? 'Cadastro autorizado do parceiro' : text) }];
}
