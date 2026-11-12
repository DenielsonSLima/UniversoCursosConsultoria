import type { NationalDpsInput, NationalParty } from './dps.types.ts';
import { date, decimal, digits, exactKeys, NFSE_NAMESPACE, requireContract, tag, timestamp,
  type UnsignedFiscalXml, xmlText } from './xml.ts';

function party(p: NationalParty, issuer = false): string {
  exactKeys(p, ['taxId', 'name', 'municipalRegistration', 'address', 'email', 'phone',
    ...(issuer ? ['simpleNationalOption', 'simpleNationalAssessment', 'specialTaxRegime'] : [])]);
  exactKeys(p.taxId, ['type', 'value']);
  requireContract(p.taxId.type === 'CPF' || p.taxId.type === 'CNPJ', 'UNSUPPORTED_TAX_ID');
  let result = tag(p.taxId.type, digits(p.taxId.value, p.taxId.type === 'CPF' ? 11 : 14));
  if (p.municipalRegistration) {
    xmlText(p.municipalRegistration, 1, 15);
    result += tag('IM', p.municipalRegistration);
  }
  if (p.name) result += tag('xNome', p.name);
  if (p.address) {
    const a = p.address;
    exactKeys(a, ['municipalityCode', 'postalCode', 'street', 'number', 'district', 'complement']);
    result += `<end><endNac>${tag('cMun', digits(a.municipalityCode, 7))}` +
      `${tag('CEP', digits(a.postalCode, 8))}</endNac>${tag('xLgr', a.street)}` +
      tag('nro', a.number) + (a.complement ? tag('xCpl', a.complement) : '') +
      `${tag('xBairro', a.district)}</end>`;
  }
  if (p.phone) {
    requireContract(/^\d{6,20}$/.test(p.phone), 'INVALID_PHONE');
    result += tag('fone', p.phone);
  }
  if (p.email) result += tag('email', p.email);
  return result;
}

function totalTaxes(value: NationalDpsInput['values']['totalTaxes']): string {
  if (value.mode === 'SIMPLE_NATIONAL_PERCENTAGE') {
    exactKeys(value, ['mode', 'percentage']);
    return tag('pTotTribSN', decimal(value.percentage, 2));
  }
  exactKeys(value, ['mode', 'federal', 'state', 'municipal']);
  requireContract(value.mode === 'AMOUNTS' || value.mode === 'PERCENTAGES', 'UNSUPPORTED_TAX_TOTAL');
  const monetary = value.mode === 'AMOUNTS';
  const prefix = monetary ? 'v' : 'p';
  return `<${prefix}TotTrib>${tag(`${prefix}TotTribFed`, decimal(value.federal, monetary ? 15 : 3))}` +
    tag(`${prefix}TotTribEst`, decimal(value.state, monetary ? 15 : 3)) +
    tag(`${prefix}TotTribMun`, decimal(value.municipal, monetary ? 15 : 3)) + `</${prefix}TotTrib>`;
}

/** Restricted municipal lecture profile; payment after supply or advance for future supply. */
function governmentPurchaseXml(input: NationalDpsInput, ibs: NonNullable<NationalDpsInput['ibscbs']>): string {
  const government = ibs.governmentPurchase;
  if (government === undefined) return '';
  requireContract(government !== null && typeof government === 'object' &&
    !Array.isArray(government), 'UNSUPPORTED_GOVERNMENT_OPERATION');
  exactKeys(government, ['operationType', 'entityType']);
  requireContract(input.environment === 'PRODUCAO' &&
    (government.operationType === '1' || government.operationType === '4') &&
    government.entityType === '4' && ibs.operationCode === '030102' && ibs.personalUse === '0' &&
    ibs.recipientIsAcquirer === true && ibs.cst === '000' && ibs.classificationCode === '000001' &&
    input.service.nationalTaxCode === '080201' && input.service.nbs === '122051900' &&
    input.recipient.taxId.type === 'CNPJ' && input.recipient.address !== undefined &&
    input.recipient.address.municipalityCode === input.service.municipalityCode,
  'UNSUPPORTED_GOVERNMENT_OPERATION');
  return tag('tpOper', government.operationType) + tag('tpEnteGov', government.entityType);
}

/** Verified subset of the downloaded national DPS v1.01 schema. Not a fiscal eligibility engine. */
export function buildNationalDps(input: NationalDpsInput): UnsignedFiscalXml {
  exactKeys(input, ['environment', 'purpose', 'issuedAt', 'applicationVersion', 'series', 'number',
    'competence', 'issuerMunicipalityCode', 'issuer', 'recipient', 'service', 'values', 'ibscbs', 'substitution', 'review']);
  requireContract(input.environment === 'HOMOLOGACAO' || input.environment === 'PRODUCAO', 'INVALID_ENVIRONMENT');
  requireContract(input.purpose === 'REGULAR', 'UNSUPPORTED_NFSE_PURPOSE');
  requireContract(input.review?.recipientConfirmed === true && input.review.competenceConfirmed === true &&
    input.review.classificationConfirmed === true &&
    input.review.federalRetentions === 'NONE_CONFIRMED' &&
    input.review.deductionsAndDiscounts === 'NONE_CONFIRMED', 'FISCAL_REVIEW_REQUIRED');
  exactKeys(input.review, ['recipientConfirmed', 'competenceConfirmed', 'classificationConfirmed',
    'ibscbs', 'federalRetentions', 'deductionsAndDiscounts']);
  const declaredIbs = input.review.ibscbs === 'DECLARED_CONFIRMED' && input.ibscbs !== undefined;
  const omittedIbs = input.ibscbs === undefined && (input.review.ibscbs === 'NOT_APPLICABLE_CONFIRMED' ||
    (input.environment === 'HOMOLOGACAO' && input.review.ibscbs === 'SYNTHETIC_PILOT_OMISSION'));
  requireContract(declaredIbs || omittedIbs, 'IBSCBS_REVIEW_REQUIRED');
  requireContract(/^\d{1,5}$/.test(input.series), 'INVALID_DPS_SERIES');
  requireContract(input.environment !== 'HOMOLOGACAO' || /^(?:\d{1,4}|[0-8]\d{4})$/.test(input.series),
    'INVALID_HOMOLOGATION_DPS_SERIES');
  requireContract(input.environment !== 'PRODUCAO' || /^(?:[1-9]\d{0,3}|[1-4]\d{4})$/.test(input.series),
    'PRODUCTION_API_SERIES_REQUIRED');
  requireContract(/^[1-9]\d{0,14}$/.test(input.number), 'INVALID_DPS_NUMBER');
  const issuer = input.issuer;
  const municipality = digits(input.issuerMunicipalityCode, 7);
  requireContract(['1', '2', '3'].includes(issuer.simpleNationalOption) &&
    ['0', '1', '2', '3', '4', '5', '6', '9'].includes(issuer.specialTaxRegime), 'INVALID_TAX_REGIME');
  requireContract(!issuer.simpleNationalAssessment || (issuer.simpleNationalOption === '3' &&
    ['1', '2', '3'].includes(issuer.simpleNationalAssessment)), 'INVALID_SIMPLE_NATIONAL_ASSESSMENT');
  const issuerXml = party(issuer, true);
  const referenceId = `DPS${municipality}${issuer.taxId.type === 'CPF' ? '1' : '2'}` +
    issuer.taxId.value.padStart(14, '0') + input.series.padStart(5, '0') + input.number.padStart(15, '0');
  requireContract(/^DPS\d{42}$/.test(referenceId), 'INVALID_DPS_ID');
  let xml = tag('tpAmb', input.environment === 'HOMOLOGACAO' ? '2' : '1') +
    tag('dhEmi', timestamp(input.issuedAt)) + tag('verAplic', input.applicationVersion) +
    tag('serie', input.series) + tag('nDPS', input.number) + tag('dCompet', date(input.competence)) +
    tag('tpEmit', '1') + (input.environment === 'HOMOLOGACAO' ? tag('finNFSe', '0') : '') +
    tag('cLocEmi', municipality);
  if (input.substitution) {
    const s = input.substitution;
    exactKeys(s, ['originalAccessKey', 'reasonCode', 'reason']);
    requireContract(['01', '02', '03', '04', '05', '99'].includes(s.reasonCode), 'INVALID_SUBSTITUTION_REASON');
    xmlText(s.reason, 15, 255);
    xml += `<subst>${tag('chSubstda', digits(s.originalAccessKey, 50))}${tag('cMotivo', s.reasonCode)}` +
      `${tag('xMotivo', s.reason)}</subst>`;
  }
  requireContract(Boolean(input.recipient.name), 'RECIPIENT_NAME_REQUIRED');
  xml += `<prest>${issuerXml}<regTrib>${tag('opSimpNac', issuer.simpleNationalOption)}` +
    (issuer.simpleNationalAssessment ? tag('regApTribSN', issuer.simpleNationalAssessment) : '') +
    `${tag('regEspTrib', issuer.specialTaxRegime)}</regTrib></prest><toma>${party(input.recipient)}</toma>`;
  const service = input.service;
  exactKeys(service, ['municipalityCode', 'nationalTaxCode', 'municipalTaxCode', 'nbs', 'description', 'complementaryInfo']);
  xmlText(service.description, 1, 2000);
  const nbsXml = service.nbs ? tag('cNBS', digits(service.nbs, 9)) : '';
  xml += `<serv><locPrest>${tag('cLocPrestacao', digits(service.municipalityCode, 7))}</locPrest>` +
    `<cServ>${tag('cTribNac', digits(service.nationalTaxCode, 6))}` +
    (service.municipalTaxCode ? tag('cTribMun', digits(service.municipalTaxCode, 3)) : '') +
    (input.environment === 'HOMOLOGACAO' ? nbsXml : '') + tag('xDescServ', service.description) +
    (input.environment === 'PRODUCAO' ? nbsXml : '') + '</cServ>';
  if (service.complementaryInfo !== undefined) {
    xmlText(service.complementaryInfo, 1, 2000);
    xml += `<infoCompl>${tag('xInfComp', service.complementaryInfo)}</infoCompl>`;
  }
  xml += '</serv>';
  const v = input.values;
  exactKeys(v, ['serviceAmount', 'receivedAmount', 'issTaxation', 'immunityType', 'issRetention', 'issRate', 'totalTaxes']);
  requireContract(['1', '2', '4'].includes(v.issTaxation) && ['1', '2'].includes(v.issRetention), 'UNSUPPORTED_ISS_SCENARIO');
  // Anexo I: E0592 requires immunity type only for ISS taxation 2. No course-name inference.
  if (v.issTaxation === '2') requireContract(['1', '2', '3', '4', '5'].includes(v.immunityType ?? ''), 'E0592');
  else requireContract(v.immunityType === undefined, 'E0592');
  if (v.issTaxation !== '1') {
    requireContract(v.issRetention === '1', 'E0580');
    requireContract(v.issRate === undefined, 'E0602');
    requireContract(issuer.specialTaxRegime === '0', 'E0172');
  }
  if (v.issRetention === '2') {
    requireContract(Boolean(input.recipient.address), 'E0237');
    requireContract(issuer.simpleNationalOption !== '2', 'E0583');
    requireContract(issuer.specialTaxRegime === '0', 'E0588');
  }
  if (v.issRate !== undefined) {
    const rate = decimal(v.issRate, 1);
    requireContract(BigInt(rate.replace('.', '')) <= 500n, 'E0595');
  }
  requireContract(v.serviceAmount !== '0.00', 'POSITIVE_SERVICE_AMOUNT_REQUIRED');
  xml += '<valores><vServPrest>' + (v.receivedAmount ? tag('vReceb', decimal(v.receivedAmount)) : '') +
    `${tag('vServ', decimal(v.serviceAmount))}</vServPrest><trib><tribMun>` + tag('tribISSQN', v.issTaxation) +
    (v.immunityType ? tag('tpImunidade', v.immunityType) : '') + tag('tpRetISSQN', v.issRetention) +
    (v.issRate !== undefined ? tag('pAliq', decimal(v.issRate, 1)) : '') +
    `</tribMun><totTrib>${totalTaxes(v.totalTaxes)}</totTrib></trib></valores>`;
  if (input.ibscbs) {
    const ibs = input.ibscbs;
    exactKeys(ibs, ['personalUse', 'operationCode', 'recipientIsAcquirer', 'cst', 'classificationCode', 'governmentPurchase']);
    requireContract(['0', '1'].includes(ibs.personalUse) && ibs.recipientIsAcquirer === true,
      'UNSUPPORTED_IBSCBS_SCENARIO');
    const production = input.environment === 'PRODUCAO';
    xml += '<IBSCBS>' + (production ? tag('finNFSe', '0') : '') + tag('indFinal', ibs.personalUse) +
      tag('cIndOp', digits(ibs.operationCode, 6)) + governmentPurchaseXml(input, ibs) +
      '<indDest>0</indDest><valores><trib>' +
      (production ? '<gIBSCBS>' : '') + tag('CST', digits(ibs.cst, 3)) +
      tag('cClassTrib', digits(ibs.classificationCode, 6)) +
      (production ? '</gIBSCBS>' : '') + '</trib></valores></IBSCBS>';
  }
  return { kind: 'DPS', environment: input.environment, schemaVersion: '1.01', referenceId,
    xml: `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="${NFSE_NAMESPACE}" versao="1.01">` +
      `<infDPS Id="${referenceId}">${xml}</infDPS></DPS>` };
}
