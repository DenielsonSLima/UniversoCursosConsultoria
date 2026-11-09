import type { NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../nfse.service-core';
import { NfseContractError, NfseUnavailableError } from '../nfse.errors';
import { mapNfseConfiguration, mapNfseMutation } from '../nfse.mappers';
import { assertScope, boolean, integer, oneOf, record, string, unwrapNfseEnvelope } from '../nfse.validation';
import type { NfseConfigurationDefinition, NfseConfigurationMetadata, SaveNfseConfigurationMetadata } from './configuration.types';

const uuid = (value: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new NfseContractError();
  return value;
};
const optionalCode = <T extends string>(value: unknown, codes: readonly T[]) => value === null ? null : oneOf(value,codes);

export function configurationDefinition(input: NfseConfigurationDefinition): NfseConfigurationDefinition {
  const definition = {
    municipalityCode: string(input.municipalityCode).trim(),
    municipalRegistration: string(input.municipalRegistration,true).trim(),
    portalAccess: oneOf(input.portalAccess,['CERTIFICATE','PASSWORD','GOVBR']),
    credentialSource: oneOf(input.credentialSource,['MATRIZ','PROPRIO']),
    opSimpNac: oneOf(input.opSimpNac,['1','2','3']),
    regEspTrib: oneOf(input.regEspTrib,['0','1','2','3','4','5','6','9']),
    regApTribSN: optionalCode(input.regApTribSN,['1','2','3']),
  };
  if (!/^(11|12|13|14|15|16|17|21|22|23|24|25|26|27|28|29|31|32|33|35|41|42|43|50|51|52|53)\d{5}$/.test(definition.municipalityCode)
    || definition.municipalRegistration.length>15
    || [...definition.municipalRegistration].some(character=>character.charCodeAt(0)<32 || character.charCodeAt(0)===127)
    || (definition.opSimpNac!=='3' && definition.regApTribSN!==null)) throw new NfseContractError();
  return definition;
}

export function createNfseConfigurationService(transport: NfseRpcTransport, enabled = false) {
  const call = async (name: string,scope: NfseScope,args: Record<string,unknown>,signal?: AbortSignal) => {
    assertScope(scope); uuid(scope.contextKey);
    if (!enabled) throw new NfseUnavailableError();
    return unwrapNfseEnvelope(await transport(name,{
      p_context_key:scope.contextKey,p_polo_id:scope.poloId,p_environment:scope.environment,p_month:scope.month,...args,
    },signal),scope);
  };
  return {
    async get(scope: NfseScope,signal?: AbortSignal): Promise<NfseConfigurationMetadata> {
      const data=record(await call('get_nfse_configuration_secure',scope,{},signal));
      const metadata={...mapNfseConfiguration(data),version:data.version===null?null:integer(data.version,1),
        configured:boolean(data.configured),opSimpNac:optionalCode(data.opSimpNac,['1','2','3']),
        regEspTrib:optionalCode(data.regEspTrib,['0','1','2','3','4','5','6','9']),
        regApTribSN:optionalCode(data.regApTribSN,['1','2','3'])};
      if (metadata.poloId!==scope.poloId || metadata.environment!==scope.environment
        || metadata.configured!==(metadata.version!==null) || metadata.readiness.status!=='BLOCKED'
        || metadata.portalLoginConfigured
        || (metadata.certificate.configured && (!metadata.certificate.expiresAt
          || !Number.isFinite(Date.parse(metadata.certificate.expiresAt))))) throw new NfseContractError();
      return metadata;
    },
    async save(scope: NfseScope,input: SaveNfseConfigurationMetadata) {
      return mapNfseMutation(await call('save_nfse_configuration_secure',scope,{
        p_request_id:uuid(input.requestId),p_expected_version:integer(input.expectedVersion),
        p_definition:configurationDefinition(input.definition),
      }));
    },
  };
}
