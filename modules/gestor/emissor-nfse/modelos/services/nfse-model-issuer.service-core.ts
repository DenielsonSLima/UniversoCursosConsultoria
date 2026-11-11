import type { NfseScope } from '../../types/nfse.types';
import type { NfseRpcTransport } from '../../services/nfse.service-core';
import { NfseContractError } from '../../services/nfse.errors';
import { assertScope, integer, nullableString, oneOf, record, string, unwrapNfseEnvelope } from '../../services/nfse.validation';

export interface NfseModelIssuerMetadata {
  poloId: string;
  name: string | null;
  legalName: string | null;
  cnpj: string | null;
  address: { street: string | null; number: string | null; complement: string | null;
    district: string | null; city: string | null; state: string | null; postalCode: string | null };
  phone: string | null;
  email: string | null;
  municipalityCode: string | null;
  municipalRegistration: string | null;
  opSimpNac: '1' | '2' | '3' | null;
  regApTribSN: '1' | '2' | '3' | null;
  regEspTrib: '0' | '1' | '2' | '3' | '4' | '5' | '6' | '9' | null;
  configurationVersion: number | null;
}

const optionalChoice = <T extends string>(value: unknown, choices: readonly T[]) => value === null ? null : oneOf(value, choices);

export function parseNfseModelIssuerMetadata(value: unknown, scope: NfseScope): NfseModelIssuerMetadata {
  const row = record(unwrapNfseEnvelope(value, scope));
  const address = record(row.address);
  const poloId = string(row.poloId);
  const cnpj = nullableString(row.cnpj), municipalityCode = nullableString(row.municipalityCode);
  if (poloId !== scope.poloId || (cnpj !== null && !/^[0-9]+$/.test(cnpj))
    || (municipalityCode !== null && !/^[0-9]{7}$/.test(municipalityCode))) throw new NfseContractError();
  return { poloId, name: nullableString(row.name), legalName: nullableString(row.legalName), cnpj,
    address: { street: nullableString(address.street), number: nullableString(address.number),
      complement: nullableString(address.complement), district: nullableString(address.district),
      city: nullableString(address.city), state: nullableString(address.state), postalCode: nullableString(address.postalCode) },
    phone: nullableString(row.phone), email: nullableString(row.email), municipalityCode,
    municipalRegistration: nullableString(row.municipalRegistration),
    opSimpNac: optionalChoice(row.opSimpNac, ['1', '2', '3']),
    regApTribSN: optionalChoice(row.regApTribSN, ['1', '2', '3']),
    regEspTrib: optionalChoice(row.regEspTrib, ['0', '1', '2', '3', '4', '5', '6', '9']),
    configurationVersion: row.configurationVersion === null ? null : integer(row.configurationVersion, 1) };
}

export function createNfseModelIssuerService(transport: NfseRpcTransport) {
  return { async get(scope: NfseScope, signal?: AbortSignal) {
    assertScope(scope);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope.contextKey)) throw new NfseContractError();
    const response = await transport('get_nfse_model_issuer_metadata_secure', {
      p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month,
    }, signal);
    return parseNfseModelIssuerMetadata(response, scope);
  } };
}
