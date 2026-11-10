import assert from 'node:assert/strict';
import test from 'node:test';
import { createNfseModelIssuerService, parseNfseModelIssuerMetadata } from './nfse-model-issuer.service-core';
import type { NfseScope } from '../../types/nfse.types';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'HOMOLOGACAO', month: '2026-11' };
const metadata = { poloId: id(2), name: 'UNIDADE SINTÉTICA', legalName: null, cnpj: '00000000000000',
  address: { street: 'RUA SINTÉTICA', number: 'S/N', complement: null, district: null,
    city: 'MUNICÍPIO SINTÉTICO', state: 'SE', postalCode: null }, phone: null, email: null,
  municipalityCode: '2803401', municipalRegistration: null, opSimpNac: '3', regApTribSN: '1', regEspTrib: '0', configurationVersion: 2 };
const envelope = (data: unknown = metadata, echo = scope) => ({ version: 1, scope: echo, data });

test('issuer metadata reads the exact authorized scope with cancellation and keeps absence distinct from a parent identity', async () => {
  const signal = new AbortController().signal;
  const service = createNfseModelIssuerService(async (name, args, actualSignal) => {
    assert.equal(name, 'get_nfse_model_issuer_metadata_secure');
    assert.deepEqual(args, { p_context_key: scope.contextKey, p_polo_id: scope.poloId, p_environment: scope.environment, p_month: scope.month });
    assert.equal(actualSignal, signal);
    return envelope();
  });
  assert.deepEqual(await service.get(scope, signal), metadata);
  assert.equal(parseNfseModelIssuerMetadata(envelope(), scope).legalName, null);
});

test('issuer metadata rejects cross-scope, malformed DTOs and strips fields outside the display contract', async () => {
  for (const changed of [{ poloId: id(9) }, { cnpj: 'not-digits' }, { municipalityCode: '123' },
    { address: {} }, { configurationVersion: 0 }, { opSimpNac: '9' }, { regApTribSN: undefined }]) {
    assert.throws(() => parseNfseModelIssuerMetadata(envelope({ ...metadata, ...changed }), scope));
  }
  assert.throws(() => parseNfseModelIssuerMetadata(envelope(metadata, { ...scope, environment: 'PRODUCAO' }), scope));
  const parsed = parseNfseModelIssuerMetadata(envelope({ ...metadata, certificateMaterial: 'SYNTHETIC_SENTINEL' }), scope);
  assert.equal('certificateMaterial' in parsed, false);
  assert.equal(JSON.stringify(parsed).includes('SYNTHETIC_SENTINEL'), false);
  const service = createNfseModelIssuerService(async () => { throw new Error('Transport must not run'); });
  await assert.rejects(service.get({ ...scope, contextKey: 'bad-context' }));
});
