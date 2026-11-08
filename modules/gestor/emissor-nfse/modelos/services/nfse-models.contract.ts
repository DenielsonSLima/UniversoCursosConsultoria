import type { NfseModel, NfseModelInput, NfseModelServiceFields } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';
import { boolean, integer, oneOf, record, string } from '../../services/nfse.validation';

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
  return {
    nationalServiceCode: code(row.nationalServiceCode, 6),
    nbsCode: code(row.nbsCode, 9),
    operationIndicatorCode: code(row.operationIndicatorCode, 6, true),
    serviceDescription: text(row.serviceDescription, 1000),
    issTreatment, immunityType,
    technicalResponsibilityDocument: text(row.technicalResponsibilityDocument, 40, true),
    referenceDocument: text(row.referenceDocument, 255, true),
    complementaryInfo: text(row.complementaryInfo, 2000, true),
    orderReference: text(row.orderReference, 60, true),
  };
}

export function parseNfseStoredModel(value: unknown): NfseModel {
  const row = record(value);
  return { ...parseNfseModelFields(row), id: string(row.id), name: text(row.name, 120),
    active: boolean(row.active), version: integer(row.version, 1) };
}

export function nfseModelDefinition(input: NfseModelInput) {
  return { ...parseNfseModelFields(input), name: text(input.name, 120), active: boolean(input.active) };
}
