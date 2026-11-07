import type {
  NfseCandidateFilters, NfseConfigurationInput, NfseDocumentFilters,
  NfseModelInput, NfsePrepareInput, NfseScope,
} from '../types/nfse.types';
import { NfseAccessError, NfseContractError, NfseUnavailableError } from './nfse.errors';
import {
  mapNfseCandidate, mapNfseConfiguration, mapNfseDocument, mapNfseModel,
  mapNfseMutation, mapNfsePage, mapNfseWorkspace,
} from './nfse.mappers';
import { assertScope, integer, oneOf, string, unwrapNfseEnvelope } from './nfse.validation';

export type NfseRpcTransport = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;

export const NFSE_RPC = {
  workspace: 'get_nfse_workspace_secure',
  candidates: 'get_nfse_candidates_secure',
  documents: 'get_nfse_documents_secure',
  models: 'get_nfse_models_secure',
  configuration: 'get_nfse_configuration_secure',
  prepare: 'prepare_nfse_batch_secure',
  saveModel: 'save_nfse_model_secure',
  saveConfiguration: 'save_nfse_configuration_secure',
} as const;

const requestId = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new NfseContractError();
  }
  return value;
};
const optionalText = (value?: string) => value === undefined || value === '' ? null : string(value);
const pageNumber = (value?: number) => integer(value ?? 1, 1);

export function createNfseService(
  transport: NfseRpcTransport,
  availability: { reads: boolean; writes: boolean } = { reads: false, writes: false },
) {
  const call = async (
    name: string, scope: NfseScope, args: Record<string, unknown> = {}, signal?: AbortSignal,
  ) => {
    assertScope(scope);
    if (!availability.reads) throw new NfseUnavailableError();
    const value = await transport(name, {
      p_polo_id: scope.poloId, p_context_key: scope.contextKey,
      p_environment: scope.environment, p_month: scope.month, ...args,
    }, signal);
    return unwrapNfseEnvelope(value, scope);
  };
  const assertWrite = (allowed: boolean) => {
    if (!availability.reads || !availability.writes) throw new NfseUnavailableError();
    if (!allowed) throw new NfseAccessError();
  };

  return {
    async workspace(scope: NfseScope, signal?: AbortSignal) {
      return mapNfseWorkspace(await call(NFSE_RPC.workspace, scope, {}, signal));
    },
    async candidates(scope: NfseScope, filters: NfseCandidateFilters, signal?: AbortSignal) {
      const page = pageNumber(filters.page);
      return mapNfsePage(await call(NFSE_RPC.candidates, scope, {
        p_class_id: optionalText(filters.classId), p_model_id: optionalText(filters.modelId),
        p_search: optionalText(filters.search?.trim()), p_page: page, p_page_size: 25,
      }, signal), mapNfseCandidate, page);
    },
    async documents(scope: NfseScope, filters: NfseDocumentFilters, signal?: AbortSignal) {
      const page = pageNumber(filters.page);
      return mapNfsePage(await call(NFSE_RPC.documents, scope, {
        p_status: oneOf(filters.status, ['PENDENTE', 'EMITIDA', 'ERRO']),
        p_search: optionalText(filters.search?.trim()), p_page: page, p_page_size: 25,
      }, signal), mapNfseDocument, page);
    },
    async models(scope: NfseScope, signal?: AbortSignal) {
      return mapNfsePage(await call(NFSE_RPC.models, scope, { p_page: 1, p_page_size: 100 }, signal), mapNfseModel, 1);
    },
    async configuration(scope: NfseScope, signal?: AbortSignal) {
      const config = mapNfseConfiguration(await call(NFSE_RPC.configuration, scope, {}, signal));
      if (config.poloId !== scope.poloId || config.environment !== scope.environment) throw new NfseContractError();
      return config;
    },
    async prepare(scope: NfseScope, input: NfsePrepareInput, allowed = false) {
      assertWrite(allowed);
      if (!Array.isArray(input.candidateIds) || input.candidateIds.length < 1 || input.candidateIds.length > 1000
        || new Set(input.candidateIds).size !== input.candidateIds.length) throw new NfseContractError();
      return mapNfseMutation(await call(NFSE_RPC.prepare, scope, {
        p_request_id: requestId(input.requestId), p_candidate_ids: input.candidateIds.map((id) => string(id)),
        p_model_id: string(input.modelId),
      }));
    },
    async saveModel(scope: NfseScope, input: NfseModelInput, allowed = false) {
      assertWrite(allowed);
      if (typeof input.active !== 'boolean') throw new NfseContractError();
      return mapNfseMutation(await call(NFSE_RPC.saveModel, scope, {
        p_request_id: requestId(input.requestId), p_id: optionalText(input.id), p_name: string(input.name),
        p_service_description: string(input.serviceDescription), p_national_service_code: string(input.nationalServiceCode),
        p_active: input.active, p_expected_version: input.expectedVersion === undefined ? null : integer(input.expectedVersion, 1),
      }));
    },
    async saveConfiguration(scope: NfseScope, input: NfseConfigurationInput, allowed = false) {
      assertWrite(allowed);
      if (!/^\d{7}$/.test(input.municipalityCode) || input.environment !== scope.environment) throw new NfseContractError();
      return mapNfseMutation(await call(NFSE_RPC.saveConfiguration, scope, {
        p_request_id: requestId(input.requestId), p_municipality_code: input.municipalityCode,
        p_municipal_registration: string(input.municipalRegistration, true),
        p_portal_access: oneOf(input.portalAccess, ['PASSWORD', 'CERTIFICATE', 'GOVBR']),
        p_credential_source: oneOf(input.credentialSource, ['MATRIZ', 'PROPRIO']),
      }));
    },
  };
}
