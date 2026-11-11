import type { NfseModelPresetContext } from './nfse-model-preset-context';
import type { NfseModelAdditionalDraft, ServiceAddress } from './nfse-model-additional.types';
import { parseNfseModelAdditionalOptions } from './nfse-model-additional-options';
import { applyNfseOperationStrategies, validateNfseOperationStrategies } from './nfse-model-additional-operation-strategies';
import { nfseCurrencyOptions } from './nfse-model-additional.domains';

export const NFSE_CONSTRUCTION_CODES = ['070201', '070202', '070401', '070501', '070502', '070601', '070602', '070701', '070801', '071701', '071901', '141403', '141404'] as const;
export function nfseAdditionalScenario(context: NfseModelPresetContext, additional?: NfseModelAdditionalDraft | null) {
  const people = context.peopleOptions, service = context.serviceOptions;
  const legacy = people?.version === 1 ? people : null;
  const operationParties = people?.version === 2;
  const construction = NFSE_CONSTRUCTION_CODES.some(code => code === context.nationalServiceCode);
  const provider = !people || people.issuerRole === 'PROVIDER';
  return { provider, operationParties, conditionalForeignTrade: operationParties || additional?.people.providerLocation === 'FROM_PARTNER', ibs: service?.includeIbsCbs === true,
    destination: service?.includeIbsCbs === true && people?.recipientIsDestination === false,
    construction, constructionAllowed: construction || context.nationalServiceCode === '990101',
    event: context.nationalServiceCode.startsWith('12'),
    property: service?.includeIbsCbs === true && ['020101', '020201', '020301'].includes(context.operationIndicatorCode) && !construction,
    foreignTrade: context.issTreatment === 'EXPORTACAO' || (!operationParties && (provider ? legacy?.recipientLocation === 'EXTERIOR' || legacy?.intermediaryLocation === 'EXTERIOR'
      : additional?.people.providerLocation === 'EXTERIOR')) || Boolean(service?.countryCode && service.countryCode !== 'BRA'),
    references: service?.includeIbsCbs === true && ['2', '3'].includes(service.operationType || ''),
    brazil: service?.countryCode === 'BRA' };
}

export function normalizeNfseModelAdditionalOptions(value: NfseModelAdditionalDraft | null,
  context: NfseModelPresetContext): NfseModelAdditionalDraft | null {
  if (!value) return null;
  let next = globalThis.structuredClone(value);
  const scenario = nfseAdditionalScenario(context, value);
  if (!scenario.ibs) next.people.personalUse = null;
  if (!scenario.destination) { next.people.destinationLocation = null; next.people.nif.destination = null; }
  if (context.peopleOptions?.version !== 2) {
  if (context.peopleOptions?.version !== 1 || context.peopleOptions.recipientLocation !== 'EXTERIOR') next.people.nif.recipient = null;
  if (context.peopleOptions?.version !== 1 || context.peopleOptions.intermediaryLocation !== 'EXTERIOR') next.people.nif.intermediary = null;
  if (next.people.destinationLocation === 'BRASIL') next.people.nif.destination = null;
  if (scenario.provider) {
    next.people.providerPartner = null; next.people.providerPartnerLabel = null; next.people.providerLocation = null; next.people.emissionReason = null;
    next.people.rejectedInvoiceReference = null; next.people.nif.provider = null;
  } else if (next.people.emissionReason !== '4') next.people.rejectedInvoiceReference = null;
  if (next.people.providerLocation === 'BRASIL') next.people.nif.provider = null;
  } else next = applyNfseOperationStrategies(next, context.peopleOptions, scenario.destination, scenario.references);
  if (!scenario.constructionAllowed) next.service.construction = null;
  if (!scenario.event) next.service.event = null;
  if (!scenario.property) next.service.property = null;
  if (!scenario.foreignTrade && !scenario.conditionalForeignTrade) next.service.foreignTrade = null;
  if (!scenario.references) next.service.operationReferences = null;
  const simple = context.peopleOptions?.simpleNationalOption === 'FROM_ESTABLISHMENT'
    ? context.issuerSimpleNationalOption : context.peopleOptions?.simpleNationalOption;
  if (simple === '2') next.service.municipalServiceCode = null;
  if (next.service.foreignTrade?.temporaryGoods === '1') {
    next.service.foreignTrade.importDeclaration = null; next.service.foreignTrade.exportRegistration = null;
  } else if (next.service.foreignTrade?.temporaryGoods === '2') next.service.foreignTrade.exportRegistration = null;
  else if (next.service.foreignTrade?.temporaryGoods === '3') next.service.foreignTrade.importDeclaration = null;
  return next;
}

export function validateNfseModelAdditionalOptions(value: unknown, context: NfseModelPresetContext): string[] {
  const issues: string[] = [];
  let options;
  try { options = parseNfseModelAdditionalOptions(value); }
  catch { return ['Complete os campos adicionais: seleções, valores fixos, formatos e limites das listas.']; }
  const scenario = nfseAdditionalScenario(context, options);
  if (!options) return ['Configure os campos adicionais do pré-modelo.'];
  const people = options.people, service = options.service;
  if (scenario.destination && !people.destinationLocation) issues.push('Defina a localização do destinatário diferente do tomador.');
  if (!scenario.destination && (people.destinationLocation || people.nif.destination)) issues.push('Limpe o destinatário adicional inativo.');
  if (!scenario.ibs && people.personalUse !== null) issues.push('Uso ou consumo pessoal requer IBS/CBS ativo.');
  if (!scenario.provider && (!people.providerPartner || !people.providerLocation || !people.emissionReason)) issues.push('Defina o prestador cadastrado, sua localização e o motivo da emissão pelo tomador/intermediário.');
  if (context.peopleOptions?.version === 2) {
    issues.push(...validateNfseOperationStrategies(options, context.peopleOptions, scenario.destination, scenario.references));
    if (scenario.provider && (people.providerPartner || people.providerLocation || people.emissionReason || people.rejectedInvoiceReference)) issues.push('O prestador emitente utiliza a configuração da unidade.');
    if (people.emissionReason === '4' && !people.rejectedInvoiceReference) issues.push('Defina a referência da NFS-e rejeitada na emissão.');
    if (people.emissionReason !== '4' && people.rejectedInvoiceReference) issues.push('A referência rejeitada só se aplica ao motivo 4.');
  } else {
    const legacy = context.peopleOptions;
  if (legacy?.recipientLocation !== 'EXTERIOR' && people.nif.recipient) issues.push('Limpe a estratégia NIF do tomador nacional ou não informado.');
  if (legacy?.intermediaryLocation !== 'EXTERIOR' && people.nif.intermediary) issues.push('Limpe a estratégia NIF do intermediário nacional ou não informado.');
  if (people.providerLocation === 'BRASIL' && people.nif.provider) issues.push('Limpe a estratégia NIF do prestador nacional.');
  if (people.destinationLocation === 'BRASIL' && people.nif.destination) issues.push('Limpe a estratégia NIF do destinatário nacional.');
  if (people.providerLocation === 'EXTERIOR' && !people.nif.provider) issues.push('Defina a estratégia NIF do prestador no exterior.');
  if (scenario.provider && (people.providerPartner || people.providerLocation || people.emissionReason || people.rejectedInvoiceReference || people.nif.provider)) issues.push('O prestador emitente utiliza o cadastro da unidade.');
  if (people.emissionReason === '4' && !people.rejectedInvoiceReference) issues.push('Defina a referência da NFS-e rejeitada.');
  if (people.emissionReason !== '4' && people.rejectedInvoiceReference) issues.push('A referência rejeitada só se aplica ao motivo 4.');
  if (legacy?.recipientLocation === 'EXTERIOR' && !people.nif.recipient) issues.push('Defina a estratégia NIF do tomador no exterior.');
  if (legacy?.intermediaryLocation === 'EXTERIOR' && !people.nif.intermediary) issues.push('Defina a estratégia NIF do intermediário no exterior.');
  if (scenario.destination && people.destinationLocation !== 'BRASIL' && !people.nif.destination) issues.push('Defina a identificação fiscal do destinatário pelo cadastro ou NIF.');
  }
  if (scenario.construction && !service.construction) issues.push('Este serviço exige informações de obra.');
  if (!scenario.constructionAllowed && service.construction) issues.push('Obra não se aplica ao código nacional selecionado.');
  if (scenario.event && !service.event) issues.push('Este serviço exige informações de atividade de evento.');
  if (!scenario.event && service.event) issues.push('Evento não se aplica ao código nacional selecionado.');
  if (scenario.property && !service.property) issues.push('Este indicador exige informações de imóvel.');
  if (!scenario.property && service.property) issues.push('Imóvel não se aplica ao indicador selecionado.');
  if (scenario.foreignTrade && !service.foreignTrade) issues.push('Este cenário exige informações de comércio exterior.');
  if (!scenario.foreignTrade && !scenario.conditionalForeignTrade && service.foreignTrade) issues.push('Comércio exterior não se aplica a este cenário doméstico.');
  if (scenario.references && !service.operationReferences) issues.push('O tipo de operação exige referências a NFS-e anteriores.');
  if (!scenario.references && service.operationReferences) issues.push('Referências de operação só se aplicam aos tipos 2 ou 3.');
  const simple = context.peopleOptions?.simpleNationalOption === 'FROM_ESTABLISHMENT' ? context.issuerSimpleNationalOption : context.peopleOptions?.simpleNationalOption;
  if (service.municipalServiceCode?.source === 'FIXED') issues.push('O código complementar municipal fixo depende de catálogo municipal autorizado. Altere a origem para não informar ou definir na emissão.');
  if (simple === '2' && service.municipalServiceCode) issues.push('Código complementar municipal não é permitido para MEI.');
  if (service.rentedMovableAssets || service.property?.originalDueDate || (service.property?.units.source === 'FIXED' && service.property.units.value.length !== 1)) issues.push('A configuração contém um ramo exclusivo da API que não integra este formulário Web.');
  const checkAddress = (address: ServiceAddress | null) => {
    if (!address) return;
    if (!address.district || (scenario.brazil ? !/^\d{8}$/.test(address.postalCode) || address.city !== null || address.stateProvince !== null
      : !address.city || !address.stateProvince)) issues.push('Complete o endereço nacional ou exterior conforme o país da prestação.');
  };
  if (service.construction?.source === 'FIXED') {
    const id = service.construction.value.identification;
    if (!scenario.brazil && id.kind !== 'ADDRESS') issues.push('Obra no exterior utiliza endereço.');
    checkAddress(id.address);
  }
  if (service.event?.source === 'FIXED') {
    if (!scenario.brazil && service.event.value.identification.kind !== 'ADDRESS') issues.push('Evento no exterior utiliza endereço.');
    checkAddress(service.event.value.identification.address);
  }
  if (service.property?.units.source === 'FIXED') service.property.units.value.forEach(unit => {
    if (!scenario.brazil && unit.identification.kind !== 'ADDRESS') issues.push('Imóvel no exterior utiliza endereço.');
    checkAddress(unit.identification.address);
  });
  const comex = service.foreignTrade;
  if (comex) {
    if (!nfseCurrencyOptions.some(option => option.value === comex.currencyCode)) issues.push('Selecione uma moeda do catálogo oficial do Banco Central.');
    if ((comex.temporaryGoods === '2') !== (comex.importDeclaration !== null) || (comex.temporaryGoods === '3') !== (comex.exportRegistration !== null)) issues.push('Confirme a declaração correspondente à movimentação temporária de bens.');
  }
  return [...new Set(issues)];
}
export const isCompleteNfseModelAdditionalOptions = (value: unknown, context: NfseModelPresetContext) => validateNfseModelAdditionalOptions(value, context).length === 0;
