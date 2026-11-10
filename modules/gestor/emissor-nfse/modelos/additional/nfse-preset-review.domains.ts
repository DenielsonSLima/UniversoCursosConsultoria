import type { NfseFiscalCodeOption } from '../NfseFiscalCodeField';
import { nfsePisCofinsCsts } from '../services/nfse-model-values-tax-groups';
import type { NfseValuesCatalogs, NfseValuesContext } from '../services/nfse-model-values.types';
import { nfseCurrencyOptions, nfseProviderSupportOptions, nfseRecipientSupportOptions,
  nfseProvisionModeOptions, nfseRelationshipOptions } from '../services/nfse-model-additional.domains';

export interface NfsePresetReviewCatalogs {
  nationalServices: readonly NfseFiscalCodeOption[];
  nbs: readonly NfseFiscalCodeOption[];
  operationIndicators: readonly NfseFiscalCodeOption[];
}
const cstNames = ['Nenhum', 'Tributável com alíquota básica', 'Tributável com alíquota diferenciada', 'Tributável por unidade de medida',
  'Monofásica · revenda a alíquota zero', 'Substituição tributária', 'Alíquota zero', 'Isenta', 'Sem incidência', 'Suspensão', 'Outras saídas',
  'Crédito · receita tributada interna', 'Crédito · receita não tributada interna', 'Crédito · exportação', 'Crédito · tributadas e não tributadas internas',
  'Crédito · tributadas internas e exportação', 'Crédito · não tributadas internas e exportação', 'Crédito · tributadas e não tributadas internas e exportação',
  'Presumido · receita tributada interna', 'Presumido · receita não tributada interna', 'Presumido · exportação',
  'Presumido · tributadas e não tributadas internas', 'Presumido · tributadas internas e exportação', 'Presumido · não tributadas internas e exportação',
  'Presumido · tributadas e não tributadas internas e exportação', 'Outros créditos presumidos', 'Aquisição sem crédito', 'Aquisição com isenção',
  'Aquisição com suspensão', 'Aquisição a alíquota zero', 'Aquisição sem incidência', 'Aquisição por substituição tributária', 'Outras entradas', 'Outras operações'];
const deductionLabels: Record<string, string> = { '01': 'Alimentação, bebidas e frigobar', '02': 'Materiais',
  '03': 'Produção externa', '04': 'Reembolso de despesas', '05': 'Repasse consorciado',
  '06': 'Repasse de plano de saúde', '07': 'Serviços', '08': 'Subempreitada de mão de obra', '99': 'Outras deduções' };
const reimbursementLabels: Record<string, string> = { '01': 'Intermediação imobiliária', '02': 'Turismo',
  '03': 'Produção publicitária', '04': 'Mídia', '99': 'Outros reembolsos e ressarcimentos' };
const adjustmentLabels: Record<string, string> = { '2': 'Materiais', '5': 'Repasse consorciado', '6': 'Repasse de plano de saúde',
  '7': 'Serviços', '8': 'Subempreitada', '9': 'Profissional parceiro', '99': 'Outras deduções ISS',
  '101': 'Intermediação imobiliária', '102': 'Turismo', '103': 'Produção publicitária', '104': 'Mídia',
  '105': 'Glosa de saúde', '199': 'Outros reembolsos e ressarcimentos' };
const domains: Record<string, Readonly<Record<string, string>>> = {
  simpleNationalOption: { '1': 'Não optante', '2': 'Optante · MEI', '3': 'Optante · ME/EPP' },
  simpleNationalAssessment: { '1': 'Tributos federais e ISSQN no Simples Nacional', '2': 'Federais no Simples; ISSQN conforme legislação municipal', '3': 'Federais e ISSQN fora do Simples Nacional' },
  governmentEntityType: { '1': 'União', '2': 'Estado', '3': 'Distrito Federal', '4': 'Município' },
  operationType: { '1': 'Fornecimento com pagamento posterior', '2': 'Recebimento do pagamento com fornecimento já realizado',
    '3': 'Fornecimento com pagamento já realizado', '4': 'Recebimento do pagamento com fornecimento posterior', '5': 'Fornecimento e recebimento do pagamento concomitantes' },
  emissionReason: { '1': 'Importação de serviço', '2': 'Obrigação por legislação municipal', '3': 'Recusa de emissão pelo prestador', '4': 'Rejeição da nota emitida pelo prestador' },
  absenceReason: { '1': 'Dispensado do NIF', '2': 'Não exigência do NIF' },
  temporaryGoods: { '1': 'Não', '2': 'Vinculada à declaração de importação', '3': 'Vinculada ao registro de exportação' },
  specialTaxRegime: { '0': 'Nenhum', '1': 'Ato cooperado', '2': 'Estimativa', '3': 'Microempresa municipal', '4': 'Notário ou registrador', '5': 'Profissional autônomo', '6': 'Sociedade de profissionais', '9': 'Outros' },
  retentionType: { '0': 'PIS, COFINS e CSLL não retidos', '1': 'PIS/COFINS retidos · domínio legado', '2': 'PIS/COFINS não retidos · domínio legado',
    '3': 'PIS, COFINS e CSLL retidos', '4': 'PIS/COFINS retidos; CSLL não', '5': 'PIS retido; COFINS e CSLL não',
    '6': 'COFINS retida; PIS e CSLL não', '7': 'PIS não; COFINS e CSLL retidas', '8': 'PIS/COFINS não; CSLL retida', '9': 'COFINS não; PIS e CSLL retidos' },
  immunityType: { '1': 'Patrimônio, renda ou serviços entre entes federativos', '2': 'Entidades religiosas e templos, inclusive organizações assistenciais e beneficentes',
    '3': 'Partidos e fundações, sindicatos de trabalhadores e instituições de educação ou assistência social sem fins lucrativos, atendidos os requisitos legais',
    '4': 'Livros, jornais, periódicos e papel destinado à sua impressão', '5': 'Fonogramas e videofonogramas musicais brasileiros, nas condições constitucionais' },
};
const optionDomains = { currencyCode: nfseCurrencyOptions, providerSupport: nfseProviderSupportOptions,
  recipientSupport: nfseRecipientSupportOptions, provisionMode: nfseProvisionModeOptions, relationship: nfseRelationshipOptions };
export function describeNfsePresetCode(key: string, code: string, path: readonly string[] = [], catalogs?: NfsePresetReviewCatalogs,
  valuesCatalogs?: NfseValuesCatalogs, profile?: NfseValuesContext['profile']): string | undefined {
  const fiscal = key === 'nationalServiceCode' ? catalogs?.nationalServices : key === 'nbsCode' ? catalogs?.nbs
    : key === 'operationIndicatorCode' ? catalogs?.operationIndicators : undefined;
  if (fiscal) return `${code} · ${fiscal.find(item => item.code === code)?.description || 'Descrição não disponível neste catálogo'}`;
  if (key === 'cst') {
    const row = valuesCatalogs?.classifications.find(item => item.cst === code);
    return `${code} · ${row?.cstName || 'Descrição não disponível neste catálogo'}`;
  }
  if (key === 'classificationCode') {
    const row = valuesCatalogs?.classifications.find(item => item.classificationCode === code);
    return `${code} · ${row?.name || 'Descrição não disponível neste catálogo'}`;
  }
  if (key === 'presumedCreditCode') return `${code} · ${valuesCatalogs?.credits.find(item => item.code === code)?.name || 'Descrição não disponível neste catálogo'}`;
  if (key === 'pisCofinsCst') {
    const index = (nfsePisCofinsCsts as readonly string[]).indexOf(code);
    return `${code} · ${cstNames[index] || 'Descrição indisponível'}`;
  }
  if (key === 'categoryCode') {
    const label = profile === 'HOMOLOGATION_20261020' ? adjustmentLabels[code]
      : profile === 'PRODUCTION_20260209' ? (path.includes('deduction') ? deductionLabels : reimbursementLabels)[code] : undefined;
    return `${code} · ${label || 'Descrição depende do perfil de emissão'}`;
  }
  if (key === 'retention') return { NONE: 'Não retido', RECIPIENT: 'Retido pelo tomador', INTERMEDIARY: 'Retido pelo intermediário' }[code];
  if (key === 'mode' && path.includes('deduction') && code === 'DOCUMENTS') return 'Documentos vinculados à dedução';
  if (key in optionDomains) return optionDomains[key as keyof typeof optionDomains].find(item => item.value === code)?.label;
  const description = domains[key]?.[code];
  return description ? `${code} · ${description}` : undefined;
}
