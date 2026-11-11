import type { NfseModelAdditionalDraft, NfseModelAdditionalOptions } from './nfse-model-additional.types';
import type { NfseModelPeopleOptionsV2 } from './nfse-model-people-options';

const atIssuance = () => ({ source: 'AT_ISSUANCE', value: null } as const);
const fromPartner = () => ({ policy: 'FROM_PARTNER', absenceReason: null } as const);
export function applyNfseOperationStrategies(value: NfseModelAdditionalDraft, people: NfseModelPeopleOptionsV2,
  destination: boolean, references: boolean): NfseModelAdditionalDraft {
  const thirdParty = people.issuerRole !== 'PROVIDER';
  const { providerPartnerLabel, ...rules } = value.people;
  return { ...value, people: { ...rules,
    providerPartner: thirdParty ? atIssuance() : null,
    providerLocation: thirdParty ? 'FROM_PARTNER' : null,
    destinationLocation: destination ? 'FROM_PARTNER' : null,
    emissionReason: thirdParty ? value.people.emissionReason : null,
    rejectedInvoiceReference: thirdParty && value.people.emissionReason === '4' ? atIssuance() : null,
    nif: { provider: thirdParty ? fromPartner() : null, recipient: fromPartner(),
      destination: destination ? fromPartner() : null,
      intermediary: people.intermediarySource === 'AT_ISSUANCE' || people.issuerRole === 'INTERMEDIARY' ? fromPartner() : null } },
  service: { ...value.service, operationReferences: references ? atIssuance() : null,
    foreignTrade: value.service.foreignTrade ? { ...value.service.foreignTrade,
      importDeclaration: value.service.foreignTrade.temporaryGoods === '2' ? atIssuance() : null,
      exportRegistration: value.service.foreignTrade.temporaryGoods === '3' ? atIssuance() : null } : null } };
}

export function validateNfseOperationStrategies(value: NfseModelAdditionalOptions, people: NfseModelPeopleOptionsV2,
  destination: boolean, references: boolean): string[] {
  const issues: string[] = [], rules = value.people;
  const thirdParty = people.issuerRole !== 'PROVIDER';
  if (thirdParty && (rules.providerPartner?.source !== 'AT_ISSUANCE' || rules.providerLocation !== 'FROM_PARTNER')) {
    issues.push('O prestador de terceiros será escolhido na emissão, com localização obtida do cadastro.');
  }
  if (destination && rules.destinationLocation !== 'FROM_PARTNER') issues.push('O destinatário será escolhido na emissão, com dados do cadastro.');
  if (thirdParty && rules.emissionReason === '4' && rules.rejectedInvoiceReference?.source !== 'AT_ISSUANCE') {
    issues.push('A NFS-e rejeitada deve ser definida individualmente na emissão.');
  }
  if (references && value.service.operationReferences?.source !== 'AT_ISSUANCE') issues.push('As NFS-e referenciadas devem ser escolhidas na emissão.');
  const trade = value.service.foreignTrade;
  if (trade?.temporaryGoods === '2' && trade.importDeclaration?.source !== 'AT_ISSUANCE'
    || trade?.temporaryGoods === '3' && trade.exportRegistration?.source !== 'AT_ISSUANCE') {
    issues.push('Os números de importação e exportação devem ser informados individualmente na emissão.');
  }
  const inherited = (rule: typeof rules.nif.provider) => rule?.policy === 'FROM_PARTNER' && rule.absenceReason === null;
  if (!inherited(rules.nif.recipient)
    || (thirdParty ? !inherited(rules.nif.provider) : rules.nif.provider !== null)
    || (destination ? !inherited(rules.nif.destination) : rules.nif.destination !== null)
    || (people.intermediarySource === 'AT_ISSUANCE' || people.issuerRole === 'INTERMEDIARY'
      ? !inherited(rules.nif.intermediary) : rules.nif.intermediary !== null)) {
    issues.push('A identificação fiscal dos participantes deve vir dos cadastros selecionados na operação.');
  }
  if (rules.providerPartnerLabel !== undefined && rules.providerPartnerLabel !== null) issues.push('Remova o participante fixo histórico ao revisar o pré-modelo.');
  return issues;
}
