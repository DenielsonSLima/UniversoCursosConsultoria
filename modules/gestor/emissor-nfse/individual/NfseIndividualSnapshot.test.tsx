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
