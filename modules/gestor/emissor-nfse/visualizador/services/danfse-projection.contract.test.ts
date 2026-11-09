import assert from 'node:assert/strict';
import test from 'node:test';
import { createDanfseProjectionService } from './danfse-projection.service-core';
import { danfseComponents, needsDanfseProjection, requireDanfseProjection } from '../danfse.projection';
import type { DanfseDocument } from '../danfse.types';
import type { NfseScope } from '../../types/nfse.types';
import { NfseContractError } from '../../services/nfse.errors';

const scope: NfseScope = {
  contextKey: '00000000-0000-0000-0000-000000000001', poloId: '00000000-0000-0000-0000-000000000002',
  environment: 'HOMOLOGACAO', month: '2026-11',
};
const document: DanfseDocument = {
  accessKey: '1'.repeat(50), number: '25', environment: '2', fields: {
    'emit/CNPJ': ['00000000000000'], 'emit/xNome': ['DADOS QUE NÃO PODEM SER TRANSMITIDOS'],
    'DPS/infDPS/valores/trib/tribFed/piscofins/vPis': ['1.20'],
    'DPS/infDPS/valores/trib/tribFed/piscofins/vCofins': ['2.30'],
    'DPS/infDPS/valores/trib/tribFed/vRetCSLL': ['3.40'],
    'DPS/infDPS/valores/trib/tribFed/piscofins/tpRetPisCofins': ['1'],
    'IBSCBS/totCIBS/gIBS/vIBSTot': ['4.50'], 'IBSCBS/totCIBS/gCBS/vCBS': ['5.60'],
  },
};
const projection = { exclusions: '3.50', totalIBSCBS: '10.10', socialRetentions: '6.90', pisOwn: '0.00', cofinsOwn: '0.00' };

test('projection transport contains only explicit fiscal components and scope, never XML or identity data', async () => {
  let sent: Record<string, unknown> = {};
  const signal = new AbortController().signal;
  const service = createDanfseProjectionService(async (name, args, requestSignal) => {
    assert.equal(name, 'get_nfse_danfse_projection_secure');
    assert.equal(requestSignal, signal);
    sent = args;
    return { version: 1, scope, data: projection };
  });
  const components = danfseComponents(document);
  const result = await service(scope, { ...components, accessKey: document.accessKey, xml: '<secret />' } as typeof components, signal);
  assert.deepEqual(sent.p_components, {
    vDescIncond: null, vCalcReeRepRes: null, vISSQN: null, vPis: '1.20', vCofins: '2.30',
    vIBSTot: '4.50', vCBS: '5.60', vRetCSLL: '3.40', tpRetPisCofins: '1', hasIbsCbs: true,
  });
  assert.equal(Object.keys(sent).length, 5);
  assert.deepEqual(result, projection);
  assert.deepEqual(requireDanfseProjection(document, result), projection, 'The renderer uses the server values unchanged');
});

test('missing or incomplete server projections never hide monetary components present in XML', () => {
  assert.equal(needsDanfseProjection(danfseComponents(document)), true);
  assert.throws(() => requireDanfseProjection(document), /projeção fiscal/);
  for (const key of Object.keys(projection)) {
    assert.throws(() => requireDanfseProjection(document, { ...projection, [key]: null }), /todos os valores/);
  }
  const absent = { ...document, fields: {} };
  assert.equal(needsDanfseProjection(danfseComponents(absent)), false);
  assert.deepEqual(requireDanfseProjection(absent), {
    exclusions: null, totalIBSCBS: null, socialRetentions: null, pisOwn: null, cofinsOwn: null,
  });
});

test('projection rejects foreign scope, imprecise amounts, invalid modes and malformed returned money', async () => {
  const components = danfseComponents(document);
  const untouched = createDanfseProjectionService(async () => { throw new Error('Transport must not run'); });
  for (const value of ['1.2345', '1.2', '-1.00', '1e2', 1.2]) {
    await assert.rejects(untouched(scope, { ...components, vPis: value as string }), NfseContractError);
  }
  await assert.rejects(untouched(scope, { ...components, tpRetPisCofins: '10' }), NfseContractError);
  await assert.rejects(untouched(scope, { ...components, hasIbsCbs: undefined as unknown as boolean }), NfseContractError);
  const foreign = createDanfseProjectionService(async () => ({ version: 1, scope: { ...scope, month: '2026-10' }, data: projection }));
  await assert.rejects(foreign(scope, components), NfseContractError);
  const invalid = createDanfseProjectionService(async () => ({ version: 1, scope, data: { ...projection, totalIBSCBS: 10.1 } }));
  await assert.rejects(invalid(scope, components), NfseContractError);
});
