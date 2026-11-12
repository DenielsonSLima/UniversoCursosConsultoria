import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import NfseIndividualSnapshot from './NfseIndividualSnapshot';
import type { IndividualPayload } from './nfse-individual.types';
import { individualPayload } from './nfse-individual.contract';
import { NfseContractError } from '../services/nfse.errors';

const payload: IndividualPayload = {
  issuerName: 'EMITENTE SINTÉTICO', issuerCnpj: '00000000000100', recipientName: 'PESSOA SINTÉTICA', recipientDocument: '00000000191',
  modelId: '00000000-0000-0000-0000-000000000001', modelVersion: 5, modelName: 'MODELO SINTÉTICO', amount: '1.00',
  competenceDate: '2026-11-11', serviceDate: '2026-11-11', series: '49998', nationalServiceCode: '080201', nbsCode: '122020000',
  serviceDescription: 'DESCRIÇÃO SINTÉTICA', opSimpNac: '3', regApTribSN: '1', municipalityCode: '2803401', municipalRegistration: null,
};
const render = (value: IndividualPayload) => renderToStaticMarkup(createElement(NfseIndividualSnapshot, { payload: value }));

test('snapshot shows canonical prepared SN12 and zero percentages; legacy or null never implies a value', () => {
  for (const [value, expected] of [['12.00', '12,00%'], ['0.00', '0,00%']]) {
    const html = render(individualPayload({ ...payload, simpleNationalTransparencyPercent: value }));
    assert(html.includes('<dt>Tributos aproximados do Simples</dt>'));
    assert(html.includes(`<dd>${expected}</dd>`));
  }
  for (const value of [payload, { ...payload, simpleNationalTransparencyPercent: null }]) {
    assert.equal(render(individualPayload(value)).includes('Tributos aproximados do Simples'), false);
  }
  for (const value of ['100.01', '-1.00', '12', '01.00', '12,00', 12]) {
    assert.throws(() => individualPayload({ ...payload, simpleNationalTransparencyPercent: value }), NfseContractError);
  }
  assert.equal(individualPayload({ ...payload, simpleNationalTransparencyPercent: '100.00' }).simpleNationalTransparencyPercent, '100.00');
});

test('canonical service location shows issuer resolution without changing the shared model identity or version', () => {
  const original = { ...payload, modelVersion: 7, municipalityCode: '2802908', serviceLocation: {
    source: 'ISSUER_ESTABLISHMENT', countryCode: 'BRA', municipalityCode: '2802908',
    modelMunicipalityCode: '2803401', operationIndicatorCode: '030101' } };
  const before = JSON.stringify(original);
  const parsed = individualPayload(original), html = render(parsed);
  assert.equal(parsed.modelId, payload.modelId); assert.equal(parsed.modelVersion, 7);
  assert.equal(parsed.serviceLocation?.modelMunicipalityCode, '2803401');
  assert.equal(JSON.stringify(original), before);
  assert(html.includes('<dt>Local da prestação</dt><dd>Brasil · Município IBGE 2802908</dd>'));
  assert(html.includes('Cadastro do estabelecimento emitente')); assert(html.includes('versão 7'));
});

test('historical location comes only from its public frozen snapshot; missing legacy location stays unknown', () => {
  const historical = { ...payload, municipalityCode: '2803401', serviceLocation: {
    source: 'ISSUED_SNAPSHOT', countryCode: 'BRA', municipalityCode: '2802908',
    modelMunicipalityCode: '2803401', operationIndicatorCode: '030101' } };
  assert(render(individualPayload(historical)).includes('Local da prestação</dt><dd>Brasil · Município IBGE 2802908'));
  assert(render(individualPayload(historical)).includes('histórico preservado'));
  const missing = { ...historical, serviceLocation: { ...historical.serviceLocation, municipalityCode: null } };
  assert(render(individualPayload(missing)).includes('Local da prestação</dt><dd>Brasil · Município não informado'));
  assert(!render(individualPayload(missing)).includes('Local da prestação</dt><dd>Brasil · Município IBGE 2803401'));
  for (const old of [payload, { ...payload, serviceLocation: null }]) {
    assert.equal(render(individualPayload(old)).includes('<dt>Local da prestação</dt>'), false);
  }
  for (const patch of [{ source: 'UNKNOWN' }, { countryCode: 'br' }, { municipalityCode: 'bad' },
    { modelMunicipalityCode: 2803401 }, { operationIndicatorCode: '0301' }]) {
    assert.throws(() => individualPayload({ ...historical, serviceLocation: { ...historical.serviceLocation, ...patch } }), NfseContractError);
  }
});
