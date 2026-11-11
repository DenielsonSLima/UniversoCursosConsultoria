import { operationReference } from '../../emissao/nfse-operation.contract';
import { NfseContractError } from '../../services/nfse.errors';
import { assertUniqueIds, boolean, integer, list, money, oneOf, record, string } from '../../services/nfse.validation';
import type { NfsePartnerServiceInput, NfsePartnerServiceOptions, NfsePartnerServiceRow, NfsePartnerServicesPage, NfsePartnerServiceSaved } from '../types/nfse-partner-services.types';

export function partnerServiceUuid(value: unknown): string {
  const id = string(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NfseContractError();
  return id;
}
export function parseNfseServicePartner(value: unknown) {
  const partner = record(value);
  return { id: partnerServiceUuid(partner.id), name: string(partner.name), tradeName: optionalText(partner.tradeName),
    document: optionalText(partner.document), type: oneOf(string(partner.type).trim().toUpperCase(), ['PF', 'PJ', 'ALUNO']) };
}
const nullableUuid = (value: unknown) => value === null ? null : partnerServiceUuid(value);
const optionalText = (value: unknown) => value === null ? null : string(value, true).trim() || null;
const date = (value: unknown) => {
  const result = string(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new NfseContractError();
  return result;
};
const amount = (value: unknown) => {
  const result = money(value);
  if (result === null) throw new NfseContractError();
  return result;
};
const financialResult = (row: Record<string, unknown>) => {
  const receivableId = nullableUuid(row.receivableId);
  const receivableAction = oneOf(row.receivableAction, ['NONE', 'CREATED', 'LINKED']);
  if ((receivableAction === 'NONE') !== (receivableId === null)) throw new NfseContractError();
  return { receivableId, receivableAction };
};

export function parseNfsePartnerServiceOptions(value: unknown): NfsePartnerServiceOptions {
  const row = record(value);
  const partners = list(row.partners, parseNfseServicePartner);
  const categories = list(row.categories, (item) => {
    const category = record(item);
    return { id: partnerServiceUuid(category.id), name: string(category.name) };
  });
  const existingReceivables = list(row.existingReceivables, (item) => {
    const receivable = record(item);
    return { id: partnerServiceUuid(receivable.id), partnerId: partnerServiceUuid(receivable.partnerId),
      description: string(receivable.description), amount: amount(receivable.amount), dueDate: date(receivable.dueDate),
      categoryId: nullableUuid(receivable.categoryId), status: string(receivable.status) };
  });
  assertUniqueIds(partners); assertUniqueIds(categories); assertUniqueIds(existingReceivables);
  return { partners, categories, existingReceivables,
    capabilities: { canGenerateReceivable: boolean(record(row.capabilities).canGenerateReceivable) } };
}
export function parseNfseServicePartnerSearch(value: unknown) {
  const payload = record(value), rows = list(payload.rows, parseNfseServicePartner);
  if (integer(payload.page, 1) !== 1 || integer(payload.pageSize, 1) !== 20 || rows.length > 20 || rows.length > integer(payload.totalItems)) throw new NfseContractError();
  assertUniqueIds(rows); return rows;
}

export function parseNfsePartnerServicesPage(value: unknown, expectedPage: number): NfsePartnerServicesPage {
  const payload = record(value);
  const rows = list(payload.rows, (item): NfsePartnerServiceRow => {
    const row = record(item);
    return { id: partnerServiceUuid(row.id), partnerId: partnerServiceUuid(row.partnerId), partnerName: string(row.partnerName),
      partnerType: row.partnerType == null || row.partnerType === '' ? null : oneOf(row.partnerType, ['PJ', 'PF', 'ALUNO']),
      canRemove: boolean(row.canRemove),
      modelId: partnerServiceUuid(row.modelId), modelName: string(row.modelName), serviceDate: date(row.serviceDate),
      serviceDescription: string(row.serviceDescription), amount: amount(row.amount), ...financialResult(row),
      status: oneOf(row.status, ['PREPARADO']), createdAt: string(row.createdAt), ...operationReference(row) };
  });
  const page = integer(payload.page, 1);
  const pageSize = integer(payload.pageSize, 1);
  const totalItems = integer(payload.totalItems);
  if (page !== expectedPage || pageSize > 100 || rows.length > pageSize || rows.length > totalItems) throw new NfseContractError();
  assertUniqueIds(rows);
  return { rows, page, pageSize, totalItems, totalAmount: amount(payload.totalAmount) };
}

export function nfsePartnerServiceDefinition(input: NfsePartnerServiceInput) {
  const serviceDescription = string(input.serviceDescription).trim();
  if (serviceDescription.length > 2000 || /\{\{|\}\}/.test(serviceDescription) || amount(input.amount) === '0.00') throw new NfseContractError();
  const generateReceivable = boolean(input.generateReceivable);
  const existingReceivableId = nullableUuid(input.existingReceivableId);
  const dueDate = input.dueDate === null ? null : date(input.dueDate);
  const categoryId = nullableUuid(input.categoryId);
  if (!generateReceivable && (existingReceivableId || dueDate || categoryId)) throw new NfseContractError();
  if (generateReceivable && (existingReceivableId ? dueDate !== null || categoryId !== null : !dueDate || !categoryId)) throw new NfseContractError();
  return { partnerId: partnerServiceUuid(input.partnerId), modelId: partnerServiceUuid(input.modelId),
    modelVersion: integer(input.modelVersion, 1), serviceDate: date(input.serviceDate), serviceDescription,
    amount: input.amount, generateReceivable, existingReceivableId, dueDate, categoryId };
}

export function parseNfsePartnerServiceSaved(value: unknown): NfsePartnerServiceSaved {
  const row = record(value);
  return { id: partnerServiceUuid(row.id), ...financialResult(row), message: string(row.message) };
}

