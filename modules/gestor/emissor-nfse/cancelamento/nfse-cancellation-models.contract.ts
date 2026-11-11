import type { NfseScope } from '../types/nfse.types';
import type { NfseRpcTransport } from '../services/nfse.service-core';
import { NfseContractError } from '../services/nfse.errors';
import { assertScope, assertUniqueIds, boolean, integer, list, oneOf, record, string, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
export const cancellationCategories = [
  { value: 'VALOR', label: 'Valor' }, { value: 'SERVICO', label: 'Serviço' }, { value: 'TRIBUTACAO', label: 'Tributação' },
  { value: 'TOMADOR', label: 'Tomador' }, { value: 'DUPLICIDADE', label: 'Duplicidade' }, { value: 'OUTROS', label: 'Outros' },
] as const;
export const cancellationReasons = [{ value: '1', label: '1 · Erro na emissão' }, { value: '2', label: '2 · Serviço não prestado' }, { value: '9', label: '9 · Outros' }] as const;
export type CancellationCategory = typeof cancellationCategories[number]['value'];
export type CancellationReason = typeof cancellationReasons[number]['value'];
export interface NfseCancellationModelDefinition { category: CancellationCategory; name: string; active: boolean; eventCode: '101101'; reasonCode: CancellationReason; textTemplate: string }
export interface NfseCancellationModel extends NfseCancellationModelDefinition { id: string; version: number; source: 'SYSTEM' | 'CUSTOM'; requiresDetail: boolean }
export interface NfseCancellationModelInput { requestId: string; modelId: string | null; expectedVersion: number | null; definition: NfseCancellationModelDefinition }
export interface NfseCancellationModelsService {
  list(scope: NfseScope, signal?: AbortSignal): Promise<NfseCancellationModel[]>;
  save(scope: NfseScope, input: NfseCancellationModelInput): Promise<NfseCancellationModel>;
}
export function cancellationModelDefinition(value: NfseCancellationModelDefinition): NfseCancellationModelDefinition {
  const name = string(value.name).trim(), textTemplate = string(value.textTemplate).trim();
  if (!name || name.length > 120 || textTemplate.length < 15 || textTemplate.length > 255
    || /\{\{|\}\}/.test(textTemplate.replaceAll('{{detalhe}}', ''))) throw new NfseContractError();
  return { name, textTemplate, active: boolean(value.active), eventCode: oneOf(value.eventCode, ['101101']),
    category: oneOf(value.category, ['VALOR', 'SERVICO', 'TRIBUTACAO', 'TOMADOR', 'DUPLICIDADE', 'OUTROS']), reasonCode: oneOf(value.reasonCode, ['1', '2', '9']) };
}
export function parseCancellationModel(value: unknown): NfseCancellationModel {
  const row = record(value), source = oneOf(row.source, ['SYSTEM', 'CUSTOM']), id = string(row.id);
  if (source === 'SYSTEM' ? !/^SYSTEM:[A-Z0-9_]{1,80}$/.test(id) : queueUuid(id) !== id) throw new NfseContractError();
  return { ...cancellationModelDefinition(row as unknown as NfseCancellationModelDefinition), id, source, version: integer(row.version, 1), requiresDetail: boolean(row.requiresDetail) };
}
export function createNfseCancellationModelsService(transport: NfseRpcTransport): NfseCancellationModelsService {
  const call = async (name: string, scope: NfseScope, args: Record<string, unknown>, signal?: AbortSignal) => {
    assertScope(scope); queueUuid(scope.contextKey); const captured = { ...scope };
    return record(unwrapNfseEnvelope(await transport(name, { p_context_key: captured.contextKey, p_polo_id: captured.poloId,
      p_environment: captured.environment, p_month: captured.month, ...args }, signal), captured));
  };
  return {
    async list(scope, signal) {
      const page = await call('get_nfse_cancellation_models_secure', scope, {}, signal), rows = list(page.rows, parseCancellationModel);
      if (integer(page.page, 1) !== 1 || integer(page.pageSize, 1) !== 500 || integer(page.totalItems) !== rows.length || rows.length > 500) throw new NfseContractError();
      assertUniqueIds(rows); return rows;
    },
    async save(scope, input) {
      const definition = cancellationModelDefinition(input.definition), modelId = input.modelId === null ? null : queueUuid(input.modelId);
      const expectedVersion = input.expectedVersion === null ? null : integer(input.expectedVersion, 1);
      if ((modelId === null) !== (expectedVersion === null)) throw new NfseContractError();
      const data = await call('save_nfse_cancellation_model_secure', scope, { p_request_id: queueUuid(input.requestId), p_model_id: modelId,
        p_expected_version: expectedVersion, p_definition: definition });
      const model = parseCancellationModel(data.model);
      if (model.source !== 'CUSTOM' || modelId !== null && model.id !== modelId) throw new NfseContractError();
      return model;
    },
  };
}
