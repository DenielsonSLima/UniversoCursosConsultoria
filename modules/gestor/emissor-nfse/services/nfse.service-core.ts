import type {
  NfseCandidateFilters, NfseConfigurationInput, NfseDocumentFilters,
  NfsePrepareInput, NfseScope,
} from '../types/nfse.types';
import { NfseAccessError, NfseContractError, NfseUnavailableError } from './nfse.errors';
import {
  mapNfseCandidate, mapNfseConfiguration, mapNfseDocument,
  mapNfseMutation, mapNfsePage, mapNfseWorkspace,
} from './nfse.mappers';
import { assertScope, assertUniqueIds, integer, list, oneOf, record, string, unwrapNfseEnvelope } from './nfse.validation';
import { nfseDocumentFilterArgs } from './nfse-document-filters';

export type NfseRpcTransport = (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>;

export const NFSE_RPC = {
  workspace: 'get_nfse_workspace_secure',
  candidates: 'get_nfse_candidates_secure',
  documents: 'get_nfse_documents_secure',
  configuration: 'get_nfse_configuration_secure',
  prepare: 'prepare_nfse_batch_secure',
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
      const filterArgs = nfseDocumentFilterArgs(filters);
      const value = record(await call(NFSE_RPC.documents, scope, {
        p_status: oneOf(filters.status, ['PENDENTE', 'EMITIDA', 'ERRO']),
        p_search: optionalText(filters.search?.trim()), p_page: page, p_page_size: 25,
        ...(filters.dateFrom || filters.dateTo || filters.courseType || filters.origin ? filterArgs : {}),
      }, signal));
      const courseTypes = value.courseTypes === undefined ? [] : list(value.courseTypes, item => {
        const row = record(item); return { id: string(row.value), value: string(row.value), label: string(row.label) };
      });
      assertUniqueIds(courseTypes);
      const result = mapNfsePage(value, mapNfseDocument, page);
      if (filters.status === 'EMITIDA' && new Set(result.rows.map(row => row.accessKey)).size !== result.rows.length) throw new NfseContractError();
      return { ...result, supportsFilters: value.courseTypes !== undefined, courseTypes: courseTypes.map(({ value, label }) => ({ value, label })) };
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
