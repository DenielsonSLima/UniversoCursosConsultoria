import type { NfseScope } from '../types/nfse.types';
import { NfseContractError } from '../services/nfse.errors';
import { assertScope, boolean, integer, oneOf, record, string, unwrapNfseEnvelope } from '../services/nfse.validation';
import { queueUuid } from '../fila/nfse-queue.contract';
export interface IndividualPreparationReview {
  sourceEnvironment: 'HOMOLOGACAO'; modelId: string; modelVersion: number; modelName: string; configurationVersion: number;
  configuration: { municipalityCode: string; municipalRegistration: string; opSimpNac: string; regApTribSN: string | null; regEspTrib: string };
  certificate: { fingerprint: string; cnpj: string; notBefore: string; expiresAt: string }; readiness: 'NOT_VERIFIED';
}
export function createIndividualPreparationService(transport: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const call = async (name: string, scope: NfseScope, args: Record<string, unknown>) => {
    assertScope(scope); queueUuid(scope.contextKey); if (scope.environment !== 'PRODUCAO') throw new NfseContractError();
    return record(unwrapNfseEnvelope(await transport(name, { p_context_key: scope.contextKey, p_polo_id: scope.poloId,
      p_environment: scope.environment, p_month: scope.month, ...args }), scope));
  };
  return {
    async review(scope: NfseScope, sourceModelId: string): Promise<IndividualPreparationReview> {
      const row = await call('review_nfse_production_preparation_secure', scope, { p_source_model_id: queueUuid(sourceModelId) });
      const config = record(row.configuration), cert = record(row.certificate);
      const fingerprint = string(cert.fingerprint);
      if (!/^[0-9a-f]{64}$/i.test(fingerprint) || row.modelId !== sourceModelId || !Number.isFinite(Date.parse(string(cert.expiresAt)))) throw new NfseContractError();
      return { sourceEnvironment: oneOf(row.sourceEnvironment, ['HOMOLOGACAO']), modelId: queueUuid(row.modelId), modelVersion: integer(row.modelVersion, 1),
        modelName: string(row.modelName), configurationVersion: integer(row.configurationVersion, 1),
        configuration: { municipalityCode: string(config.municipalityCode), municipalRegistration: string(config.municipalRegistration, true),
          opSimpNac: string(config.opSimpNac), regApTribSN: config.regApTribSN === null ? null : string(config.regApTribSN), regEspTrib: string(config.regEspTrib) },
        certificate: { fingerprint, cnpj: string(cert.cnpj), notBefore: string(cert.notBefore), expiresAt: string(cert.expiresAt) }, readiness: oneOf(row.readiness, ['NOT_VERIFIED']) };
    },
    async prepare(scope: NfseScope, requestId: string, reviewed: IndividualPreparationReview) {
      const row = await call('prepare_nfse_production_individual_secure', scope, { p_request_id: queueUuid(requestId), p_source_model_id: queueUuid(reviewed.modelId),
        p_expected_source_version: integer(reviewed.modelVersion, 1), p_expected_configuration_version: integer(reviewed.configurationVersion, 1),
        p_expected_certificate_fingerprint: reviewed.certificate.fingerprint });
      if (!boolean(row.certificateRegistered)) throw new NfseContractError();
      return { modelId: queueUuid(row.modelId), modelVersion: integer(row.modelVersion, 1), configurationVersion: integer(row.configurationVersion, 1),
        readiness: oneOf(row.readiness, ['NOT_VERIFIED']), sourceEnvironment: oneOf(row.sourceEnvironment, ['HOMOLOGACAO']) };
    },
  };
}
export const individualPreparationService = createIndividualPreparationService(async (name, args) => {
  const { supabase } = await import('../../../../lib/supabase');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error('Não foi possível confirmar a preparação de produção. Atualize a revisão antes de continuar.');
  return data;
});
