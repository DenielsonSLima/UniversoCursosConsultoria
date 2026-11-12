import type { NfseModel, NfseModelDescriptionPreview, NfseModelInput, NfseModelServiceFields } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';
import { boolean, integer, oneOf, record, string } from '../../services/nfse.validation';
import { parseNfseModelServiceOptions, serializeNfseModelServiceOptions } from './nfse-model-service-options';
import { parseNfseModelPeopleOptions, serializeNfseModelPeopleOptions } from './nfse-model-people-options';
import { parseNfseModelValuesOptions, serializeNfseModelValuesOptions } from './nfse-model-values-options';
import { parseNfseModelAdditionalOptions, serializeNfseModelAdditionalOptions } from './nfse-model-additional-options';

const text = (value: unknown, max: number, optional = false) => {
  const result = string(value, optional).trim();
  if (result.length > max) throw new NfseContractError();
  return result;
};
const code = (value: unknown, digits: number, optional = false) => {
  const result = text(value, digits, optional);
  if ((!optional || result) && !new RegExp(`^\\d{${digits}}$`).test(result)) throw new NfseContractError();
  return result;
};

export function parseNfseModelFields(value: unknown): NfseModelServiceFields {
  const row = record(value);
  const issTreatment = oneOf(row.issTreatment, ['TRIBUTAVEL', 'IMUNIDADE', 'EXPORTACAO', 'NAO_INCIDENCIA']);
  const immunityType = row.immunityType === null ? null : oneOf(row.immunityType, ['1', '2', '3', '4', '5']);
  if ((issTreatment === 'IMUNIDADE') !== (immunityType !== null)) throw new NfseContractError();
  const serviceOptions = row.serviceOptions === undefined ? undefined : parseNfseModelServiceOptions(row.serviceOptions);
  const peopleOptions = row.peopleOptions === undefined ? undefined
    : parseNfseModelPeopleOptions(row.peopleOptions, serviceOptions?.includeIbsCbs ?? null);
  if (serviceOptions?.governmentPurchase === true && peopleOptions?.version === 1 && peopleOptions.recipientLocation !== 'BRASIL') {
    throw new NfseContractError();
  }
  return {
    ...(row.modelType === undefined ? {} : { modelType: row.modelType === null ? null : oneOf(row.modelType, ['ALUNO', 'SERVICO', 'AMBOS']) }),
    nationalServiceCode: code(row.nationalServiceCode, 6),
    nbsCode: code(row.nbsCode, 9),
    operationIndicatorCode: code(row.operationIndicatorCode, 6, true),
    serviceDescription: text(row.serviceDescription, 2000),
    issTreatment, immunityType,
    technicalResponsibilityDocument: text(row.technicalResponsibilityDocument, 40, true),
    referenceDocument: text(row.referenceDocument, 255, true),
    complementaryInfo: text(row.complementaryInfo, 2000, true),
    orderReference: text(row.orderReference, 60, true),
    ...(serviceOptions !== undefined ? { serviceOptions } : {}),
    ...(peopleOptions !== undefined ? { peopleOptions } : {}),
    ...(row.valuesOptions === undefined ? {} : { valuesOptions: parseNfseModelValuesOptions(row.valuesOptions) }),
    ...(row.additionalOptions === undefined ? {} : { additionalOptions: parseNfseModelAdditionalOptions(row.additionalOptions) }),
  };
}

export function parseNfseStoredModel(value: unknown): NfseModel {
  const row = record(value);
  const origin = ['sourcePoloId', 'sourcePoloName', 'inherited', 'canManage'];
  const hasOrigin = origin.some(key => row[key] !== undefined);
  if (hasOrigin && origin.some(key => row[key] === undefined)) throw new NfseContractError();
  const inherited = hasOrigin ? boolean(row.inherited) : undefined;
  const canManage = hasOrigin ? boolean(row.canManage) : undefined;
  if (inherited && canManage) throw new NfseContractError();
  return { ...parseNfseModelFields(row),
    ...(hasOrigin ? { sourcePoloId: string(row.sourcePoloId), sourcePoloName: text(row.sourcePoloName, 500), inherited, canManage } : {}), id: string(row.id), name: text(row.name, 120),
    active: boolean(row.active), version: integer(row.version, 1) };
}

export function nfseModelDefinition(input: NfseModelInput) {
  const fields = parseNfseModelFields(input);
  return { ...fields, modelType: oneOf(input.modelType, ['ALUNO', 'SERVICO', 'AMBOS']), name: text(input.name, 120), active: boolean(input.active),
    ...(fields.serviceOptions !== undefined ? { serviceOptions: serializeNfseModelServiceOptions(fields.serviceOptions,
      fields.issTreatment, fields.nationalServiceCode, fields.operationIndicatorCode) } : {}),
    ...(fields.peopleOptions !== undefined ? { peopleOptions: serializeNfseModelPeopleOptions(fields.peopleOptions,
      fields.serviceOptions?.includeIbsCbs ?? null) } : {}),
    ...(fields.valuesOptions === undefined ? {} : { valuesOptions: serializeNfseModelValuesOptions(fields.valuesOptions) }),
    ...(fields.additionalOptions === undefined ? {} : { additionalOptions: serializeNfseModelAdditionalOptions(fields.additionalOptions) }),
  };
}

export function parseNfseModelDescriptionPreview(value: unknown): NfseModelDescriptionPreview {
  const row = record(value);
  return {
    description: text(row.description, 2000),
    monthLabel: text(row.monthLabel, 30),
    usesReferenceMonth: boolean(row.usesReferenceMonth),
    ...(row.requiresAcademicContext === undefined ? {} : { requiresAcademicContext: boolean(row.requiresAcademicContext) }),
  };
}

