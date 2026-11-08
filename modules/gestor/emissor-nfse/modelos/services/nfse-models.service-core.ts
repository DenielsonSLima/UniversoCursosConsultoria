import type { NfseModelInput, NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { mapNfseMutation, mapNfsePage } from '../../services/nfse.mappers';
import { assertScope, integer, string, unwrapNfseEnvelope } from '../../services/nfse.validation';
import { NfseContractError } from '../../services/nfse.errors';
import { nfseModelDefinition, parseNfseModelDescriptionPreview, parseNfseStoredModel } from './nfse-models.contract';

const uuid = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new NfseContractError();
  return value;
};

/** Model metadata is independent of the still-disabled fiscal provider. */
export function createNfseModelsService(transport: NfseRpcTransport) {
  const call = async (name: string, scope: NfseScope, args: Record<string, unknown>, signal?: AbortSignal) => {
    assertScope(scope);
    uuid(scope.contextKey);
    return unwrapNfseEnvelope(await transport(name, {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, ...args,
    }, signal), scope);
  };
  return {
    async list(scope: NfseScope, signal?: AbortSignal) {
      return mapNfsePage(await call('get_nfse_models_secure', scope, {}, signal), parseNfseStoredModel, 1);
    },
    async previewDescription(scope: NfseScope, description: string, signal?: AbortSignal) {
      return parseNfseModelDescriptionPreview(await call('preview_nfse_model_description_secure', scope, {
        p_description: string(description),
      }, signal));
    },
    async save(scope: NfseScope, input: NfseModelInput) {
      if ((input.id === undefined) !== (input.expectedVersion === undefined)) throw new NfseContractError();
      return mapNfseMutation(await call('save_nfse_model_secure', scope, {
        p_request_id: uuid(input.requestId), p_id: input.id === undefined ? null : uuid(input.id),
        p_expected_version: input.expectedVersion === undefined ? null : integer(input.expectedVersion, 1),
        p_definition: nfseModelDefinition(input),
      }));
    },
  };
}
