import assert from 'node:assert/strict';
import test from 'node:test';
import type { NfseScope } from '../types/nfse.types';
import { createIndividualPreparationService } from './nfse-individual-preparation.service';
import { NfseContractError } from '../services/nfse.errors';
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const scope: NfseScope = { contextKey: id(1), poloId: id(2), environment: 'PRODUCAO', month: '2026-11' };
const review = { sourceEnvironment: 'HOMOLOGACAO', modelId: id(3), modelVersion: 2, modelName: 'MODELO SINTÉTICO', configurationVersion: 3,
  configuration: { municipalityCode: '2803401', municipalRegistration: 'IM-SINTÉTICA', opSimpNac: '3', regApTribSN: '1', regEspTrib: '0' },
  certificate: { fingerprint: 'a'.repeat(64), cnpj: '00000000000100', notBefore: '2026-01-01T00:00:00Z', expiresAt: '2027-01-01T00:00:00Z' }, readiness: 'NOT_VERIFIED' };
test('authenticated preparation binds reviewed versions/fingerprint without certificate secrets or implicit readiness', async () => {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const service = createIndividualPreparationService(async (name, args) => { calls.push({ name, args }); return { version: 1, scope,
    data: name.startsWith('review') ? { ...review, privateKey: 'FORBIDDEN' } : { modelId: id(4), modelVersion: 1, configurationVersion: 1, certificateRegistered: true, sourceEnvironment: 'HOMOLOGACAO', readiness: 'NOT_VERIFIED' } }; });
  const reviewed = await service.review(scope, id(3)); assert.equal('privateKey' in reviewed, false);
  const prepared = await service.prepare(scope, id(10), reviewed); assert.equal(prepared.readiness, 'NOT_VERIFIED'); assert.equal(prepared.modelId, id(4));
  assert.equal(calls[1].args.p_expected_source_version, 2); assert.equal(calls[1].args.p_expected_configuration_version, 3);
  assert.equal(calls[1].args.p_expected_certificate_fingerprint, 'a'.repeat(64)); assert(!JSON.stringify(calls).includes('FORBIDDEN'));
  await assert.rejects(service.review({ ...scope, environment: 'HOMOLOGACAO' }, id(3)), NfseContractError); assert.equal(calls.length, 2);
});
