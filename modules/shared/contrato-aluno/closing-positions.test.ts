import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clampContractClosingPosition, getActiveContractClosingElementIds,
  getContractClosingElementHeight, normalizeContractClosingPositions,
  validateContractClosingPositions,
} from './closing-positions.ts';

const footer = 'Cidade de teste, 08/10/2026.\nCONTRATANTE:\nCONTRATADA:\nTESTEMUNHAS:\n1: ____\n2: ____';

test('modelos anteriores conservam as linhas e a imagem QR nas coordenadas do PDF', () => {
  const { elements } = normalizeContractClosingPositions(undefined, footer);
  assert.deepEqual(elements.qr, { x: 172, y: 210.5, width: 20 });
  assert.equal(elements.qr.x + 1.5, 173.5);
  assert.equal(elements.qr.width - 3, 17);
  assert.deepEqual(elements.contratante, { x: 18, y: 221, width: 62 });
  assert.deepEqual(elements.contratada, { x: 88, y: 221, width: 62 });
  assert.equal(elements.testemunha1.y + 5, 238);
  assert.equal(elements.testemunha2.y + 5, 238);
  assert.deepEqual(validateContractClosingPositions(undefined, footer), []);
});

test('snapshot congelado conserva cada posição sem clamp ou mutação', () => {
  const model = normalizeContractClosingPositions(undefined, footer);
  model.elements.qr = { x: 160, y: 248, width: 25 };
  model.elements.contratante = { x: 20, y: 254, width: 55 };
  const frozenJson = JSON.stringify(model);
  const frozen = JSON.parse(frozenJson);
  assert.deepEqual(normalizeContractClosingPositions(frozen, footer), model);
  assert.deepEqual(validateContractClosingPositions(frozen, footer), []);
  assert.equal(JSON.stringify(frozen), frozenJson);
});

test('caixas fora da reserva do encerramento ou abaixo da página são rejeitadas', () => {
  for (const position of [
    { x: 17, y: 221, width: 62 }, { x: 150, y: 221, width: 62 },
    { x: 18, y: 190, width: 62 }, { x: 18, y: 275, width: 62 },
  ]) {
    const model = normalizeContractClosingPositions(undefined, footer);
    model.elements.contratante = position;
    assert.ok(validateContractClosingPositions(model, footer).some((error) => /área de assinaturas/.test(error)));
    assert.deepEqual(normalizeContractClosingPositions(model, footer).elements.contratante, position);
  }
});

test('sobreposição com outra assinatura, QR ou local não pode ser salva', () => {
  for (const position of [
    { x: 88, y: 221, width: 62 }, { x: 160, y: 220, width: 25 },
    { x: 18, y: 213, width: 62 },
  ]) {
    const model = normalizeContractClosingPositions(undefined, footer);
    model.elements.contratante = position;
    assert.ok(validateContractClosingPositions(model, footer).some((error) => /está sobre/.test(error)));
  }
});

test('texto de encerramento livre e complementar continua protegido', () => {
  const model = normalizeContractClosingPositions(undefined, footer);
  model.elements.qr = { x: 20, y: 240, width: 20 };
  assert.ok(validateContractClosingPositions(model, 'Encerramento livre.').some((error) => /Texto de encerramento/.test(error)));
  const customFooter = footer.replace('TESTEMUNHAS:', 'Observação adicional\nTESTEMUNHAS:');
  assert.ok(validateContractClosingPositions(model, customFooter).some((error) => /Texto complementar/.test(error)));
});

test('edição respeita limites A4 e o tamanho completo do QR', () => {
  const qr = clampContractClosingPosition('qr', { x: 220, y: 290, width: 45 });
  assert.deepEqual(qr, { x: 152, y: 234, width: 40 });
  assert.equal(qr.y + getContractClosingElementHeight('qr', qr), 281);
  assert.deepEqual(clampContractClosingPosition('contratante', { x: -10, y: 10, width: 10 }), { x: 18, y: 210.5, width: 25 });
});

test('versão desconhecida e coordenadas não numéricas falham explicitamente', () => {
  for (const value of [
    { version: 2, elements: {} }, { version: 1, elements: { qr: { x: '172', y: 211, width: 20 } } },
    { version: 1, elements: { qr: { x: NaN, y: 211, width: 20 } } },
    { version: 1, elements: { extra: { x: 18, y: 221, width: 20 } } },
  ]) assert.ok(validateContractClosingPositions(value, footer).length);
});

test('uma assinatura conserva a largura original e modelos sem QR usam a área toda', () => {
  const oneParty = 'CONTRATADA: Instituição';
  assert.deepEqual(getActiveContractClosingElementIds(oneParty, false), ['contratada']);
  assert.deepEqual(normalizeContractClosingPositions(undefined, oneParty, false).elements.contratada,
    { x: 18, y: 214, width: 174 });
  assert.deepEqual(validateContractClosingPositions(undefined, oneParty, false), []);
});
