import { parseNfseModelValuesOptions } from './nfse-model-values-options';
import type { NfseAmountRule, NfseDocumentRule, NfseModelValuesOptions, NfseValuesCatalogs,
  NfseValuesClassification, NfseValuesContext, NfseValuesCredit } from './nfse-model-values.types';

export function nfseDecimalUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
const dateOnly = (value: string) => value.slice(0, 10);
const validDate = (value: string) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
  && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
function inValidity(date: string, from: string | null, until: string | null): boolean {
  return (from === null || dateOnly(from) <= date) && (until === null || date <= dateOnly(until));
}
export function isNfseClassificationEligible(row: NfseValuesClassification, date: string): boolean {
  return validDate(date) && row.classificationFlags.IndNfse === true
    && inValidity(date, row.cstValidFrom, row.cstValidUntil) && inValidity(date, row.validFrom, row.validUntil);
}
export function isNfseCreditEligible(row: NfseValuesCredit, date: string): boolean {
  return validDate(date) && row.nfse && row.appropriationByDfe
    && ((row.ibs && row.ibsValidFrom !== null && inValidity(date, row.ibsValidFrom, row.ibsValidUntil))
      || (row.cbs && row.cbsValidFrom !== null && inValidity(date, row.cbsValidFrom, row.cbsValidUntil)));
}

export function nfseDocumentCategories(profile: NfseValuesContext['profile'], purpose: 'deduction' | 'reimbursement'): readonly string[] {
  if (profile === 'HOMOLOGATION_20261020') return purpose === 'deduction'
    ? ['2', '5', '6', '7', '8', '9', '99'] : ['101', '102', '103', '104', '105', '199'];
  return purpose === 'deduction' ? ['01', '02', '03', '04', '05', '06', '07', '08', '99'] : ['01', '02', '03', '04', '99'];
}
function documentsIssues(documents: readonly NfseDocumentRule[], context: NfseValuesContext,
  purpose: 'deduction' | 'reimbursement'): string[] {
  const issues: string[] = [];
  const categories = nfseDocumentCategories(context.profile, purpose);
  const municipalAllowed = context.profile === 'PRODUCTION_20260209' && purpose === 'deduction';
  for (const document of documents) {
    if (document.supplierSource === 'FIXED_PARTNER') issues.push('Atualize a regra para usar o fornecedor do documento ao emitir ou não informá-lo, quando permitido.');
    if (!categories.includes(document.categoryCode)) issues.push('Escolha uma categoria documental disponível neste ambiente e finalidade.');
    if (['99', '199'].includes(document.categoryCode) && document.categoryDescription === null) issues.push('Descreva a categoria de outros documentos.');
    if (['OTHER_NATIONAL_DFE', 'OTHER_FISCAL', 'NON_FISCAL'].includes(document.documentType) && document.documentDescription === null) issues.push('Descreva o tipo de documento utilizado.');
    if ((!municipalAllowed && ['MUNICIPAL_NFSE', 'NF_NFS'].includes(document.documentType))
      || (municipalAllowed && ['CTE', 'OTHER_NATIONAL_DFE'].includes(document.documentType))) issues.push('O tipo de documento não está disponível para esta finalidade neste ambiente.');
    if (document.allocationValue !== null && nfseDecimalUnits(document.allocationValue) === 0n) issues.push('Informe uma parcela documental maior que zero.');
  }
  return issues;
}
function rulePositive(rule: NfseAmountRule): boolean {
  return rule.source === 'NONE' || (rule.value !== null && nfseDecimalUnits(rule.value) > 0n);
}
function ibsIssues(options: NfseModelValuesOptions, context: NfseValuesContext, catalogs: NfseValuesCatalogs): string[] {
  const issues: string[] = [];
  const ibs = options.ibscbs;
  if (context.includeIbsCbs !== true) return ibs === null ? [] : ['Remova as regras de IBS/CBS ao desativar essas informações na Configuração.'];
  if (ibs === null) return ['Complete a classificação de IBS/CBS.'];
  const classification = catalogs.classifications.find(row => row.cst === ibs.cst && row.classificationCode === ibs.classificationCode
    && isNfseClassificationEligible(row, context.competenceDate));
  if (!classification) return ['Escolha CST e classificação de IBS/CBS vigentes para NFS-e na competência.'];
  if ((classification.flags.IndDiferimento === true) !== (ibs.deferral !== null)) issues.push('Complete o diferimento exigido pela classificação ou remova o grupo quando não permitido.');
  if ((classification.classificationFlags.IndTribRegular === true) !== (ibs.regularTaxation !== null)) issues.push('Complete a tributação regular exigida pela classificação ou remova o grupo quando não permitido.');
  if (ibs.regularTaxation && !catalogs.classifications.some(row => row.cst === ibs.regularTaxation?.cst
    && row.classificationCode === ibs.regularTaxation.classificationCode && isNfseClassificationEligible(row, context.competenceDate))) issues.push('Escolha uma classificação regular vigente para NFS-e.');
  if (ibs.presumedCreditCode !== null && (classification.classificationFlags.IndPermiteCredPres !== true
    || !catalogs.credits.some(row => row.code === ibs.presumedCreditCode && isNfseCreditEligible(row, context.competenceDate)))) issues.push('O crédito presumido precisa ser permitido pela classificação e vigente para NFS-e na competência.');
  issues.push(...documentsIssues(ibs.reimbursementDocuments, context, 'reimbursement'));
  return issues;
}

/** Save eligibility only. Runtime resolves amounts/documents and validates the official profile again. */
export function validateNfseModelValuesOptions(value: unknown, context: NfseValuesContext,
  catalogs: NfseValuesCatalogs = { classifications: [], credits: [] }): string[] {
  let options: NfseModelValuesOptions | null;
  try { options = parseNfseModelValuesOptions(value); }
  catch { return ['Conclua as escolhas obrigatórias e confira valores, percentuais e regras dos grupos preenchidos.']; }
  if (options === null) return ['Configure as regras de Valores deste pré-modelo.'];
  const issues: string[] = [];
  if (!validDate(context.competenceDate)) issues.push('Confirme a competência usada para conferir as regras do modelo.');
  if (context.includeIbsCbs === null) issues.push('Escolha se o modelo inclui informações de IBS/CBS na Configuração.');
  if (context.simpleNationalOption === null) issues.push('Confirme o enquadramento no Simples Nacional para conferir as regras de Valores.');
  if (context.simpleNationalOption === '3' && context.simpleNationalAssessment === null) issues.push('Confirme o regime de apuração do Simples Nacional para conferir as regras de Valores.');
  const service = options.serviceAmount;
  if (service.source === 'FIXED' && nfseDecimalUnits(service.fixedAmount!) === 0n) issues.push('O valor fixo do serviço deve ser maior que zero.');
  if (context.issuerRole === 'INTERMEDIARY' && options.intermediaryAmount.source === 'NONE') issues.push('Defina a origem do valor recebido pelo intermediário.');
  for (const rule of [options.unconditionalDiscount, options.conditionalDiscount, options.iss.benefitReduction,
    options.federal.withheldCp, options.federal.withheldIrrf, options.federal.withheldSocialContributions]) {
    if (!rulePositive(rule)) issues.push('Use um valor maior que zero ou escolha não aplicar a regra.');
  }
  if ([options.unconditionalDiscount, options.conditionalDiscount].some(rule => rule.source === 'PERCENTAGE'
    && nfseDecimalUnits(rule.value!) >= 10000n)) issues.push('Cada desconto deve ser menor que o valor do serviço.');
  if (service.source === 'FIXED') {
    const principal = nfseDecimalUnits(service.fixedAmount!);
    for (const rule of [options.unconditionalDiscount, options.conditionalDiscount,
      options.federal.withheldCp, options.federal.withheldIrrf, options.federal.withheldSocialContributions]) {
      if (rule.source === 'FIXED' && nfseDecimalUnits(rule.value!) >= principal) issues.push('Descontos e retenções fixos devem ser menores que o valor do serviço.');
    }
    const lowerBound = [options.unconditionalDiscount, options.conditionalDiscount,
      options.federal.withheldCp, options.federal.withheldIrrf, options.federal.withheldSocialContributions]
      .reduce((sum, rule) => sum + (rule.source === 'FIXED' ? nfseDecimalUnits(rule.value!) : 0n), 0n);
    if (lowerBound > principal) issues.push('A soma dos descontos e retenções não pode superar o valor do serviço.');
  }
  const iss = options.iss;
  if (iss.benefitId !== null) issues.push('Remova o benefício para salvar enquanto a lista oficial do município estiver indisponível.');
  if (iss.retention === 'RECIPIENT' && !context.recipientAvailable) issues.push('A retenção pelo tomador exige a estratégia de tomador na Configuração.');
  if (iss.retention === 'INTERMEDIARY' && !context.intermediaryAvailable) issues.push('A retenção pelo intermediário exige definir intermediação na Configuração.');
  if (iss.retention !== 'NONE' && (context.issTreatment !== 'TRIBUTAVEL' || context.simpleNationalOption === '2'
    || iss.suspensionType !== 'NONE')) issues.push('A retenção de ISS é incompatível com a tributação, suspensão ou enquadramento informado.');
  const snFull = context.simpleNationalOption === '3' && context.simpleNationalAssessment === '1';
  if (iss.rateSource === 'FIXED' && (context.issTreatment !== 'TRIBUTAVEL' || context.simpleNationalOption === '2')) issues.push('Este enquadramento e tributação não permitem informar alíquota fixa de ISSQN.');
  if (snFull && iss.retention === 'NONE' && iss.rateSource !== 'FROM_RULES') issues.push('No Simples com apuração integral e sem retenção, a alíquota ISS é resolvida pelo sistema.');
  if (iss.ratePercent !== null && (nfseDecimalUnits(iss.ratePercent) === 0n || nfseDecimalUnits(iss.ratePercent) > 500n)) issues.push('Confira a alíquota ISS permitida para o município e enquadramento.');
  const federalInSn = context.simpleNationalOption === '3' && ['1', '2'].includes(context.simpleNationalAssessment || '');
  if ((federalInSn || context.simpleNationalOption === '2') && options.federal.mode === 'EXPLICIT') issues.push('Os tributos federais deste enquadramento devem vir da configuração confirmada da unidade.');
  if (options.federal.mode === 'EXPLICIT') {
    const federal = options.federal;
    if (federal.retentionType === '0' && federal.withheldSocialContributions.source !== 'NONE') issues.push('Sem retenção de PIS/COFINS/CSLL, remova a regra de contribuições sociais retidas.');
    if (federal.retentionType !== null && !['0', '2'].includes(federal.retentionType)
      && federal.withheldSocialContributions.source === 'NONE') issues.push('Defina a regra das contribuições sociais para o tipo de retenção selecionado.');
    if (federal.pisCofinsCst === null && federal.withheldSocialContributions.source !== 'NONE') issues.push('Defina a situação e o tipo de retenção para configurar as contribuições sociais retidas.');
    if ((federal.pisRatePercent !== null || federal.cofinsRatePercent !== null) && federal.base.source === 'NONE') issues.push('Defina a base de PIS/COFINS para as alíquotas informadas.');
    if ([federal.pisRatePercent, federal.cofinsRatePercent].some(v => v !== null && nfseDecimalUnits(v) >= 10000n)) issues.push('O formato vigente de PIS/COFINS não representa alíquotas de 100%; confira o contrato aplicável.');
  }
  const transparency = options.transparency;
  if (transparency.mode === 'NOT_INFORMED' && context.simpleNationalOption !== '2') issues.push('Este enquadramento exige informar a estimativa dos tributos.');
  if (transparency.mode === 'SIMPLE_NATIONAL_PERCENTAGE' && context.simpleNationalOption !== '3') issues.push('A alíquota nominal do Simples só se aplica a ME/EPP optante.');
  if ([transparency.federalPercent, transparency.statePercent, transparency.municipalPercent,
    transparency.simpleNationalPercent].some(v => v !== null && nfseDecimalUnits(v) >= 10000n)) issues.push('O formato vigente da estimativa tributária não representa 100%; confira os percentuais da fonte.');
  if (options.deduction.value !== null && nfseDecimalUnits(options.deduction.value) === 0n) issues.push('Informe dedução maior que zero ou escolha não aplicar.');
  issues.push(...documentsIssues(options.deduction.documents, context, 'deduction'), ...ibsIssues(options, context, catalogs));
  if (options.rental) {
    issues.push('As regras de locação exclusivas da API ainda não estão disponíveis neste fluxo de pré-modelos.');
    if (context.profile !== 'HOMOLOGATION_20261020') issues.push('As regras monetárias de locação exigem um perfil que ofereça esse grupo.');
    if (nfseDecimalUnits(options.rental.ownershipPercent) === 0n) issues.push('Informe percentual de copropriedade maior que zero.');
    if (!context.propertyUnits) issues.push('Configure as unidades imobiliárias em Serviço antes das regras de locação.');
    if (options.rental.unitAdjustments.some(a => context.propertyUnits?.source !== 'FIXED'
      || !context.propertyUnits.unitKeys.includes(a.unitReference))) issues.push('Vincule cada ajuste a uma unidade fixa cadastrada no modelo; unidades definidas na emissão não possuem referência fixa.');
    const keys = options.rental.unitAdjustments.map(a => `${a.unitReference}:${a.type}`);
    if (new Set(keys).size !== keys.length) issues.push('Há tipo de ajuste repetido para a mesma unidade imobiliária.');
    if (options.rental.unitAdjustments.some(a => a.amount.source === 'NONE' || !rulePositive(a.amount)
      || (a.type === '99' && a.description === null))) issues.push('Complete o valor e a descrição aplicável aos ajustes de locação.');
  }
  return [...new Set(issues)];
}
export function isNfseModelValuesOptionsComplete(value: unknown, context: NfseValuesContext, catalogs?: NfseValuesCatalogs): boolean {
  return validateNfseModelValuesOptions(value, context, catalogs).length === 0;
}
