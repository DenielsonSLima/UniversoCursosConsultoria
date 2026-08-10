import assert from 'node:assert/strict';
import test from 'node:test';
import { getPatrimonioActionAvailability, getPatrimonioDisplayStatus } from './patrimonio.actions';
import type { PatrimonioItem } from './patrimonio.types';

const createItem = (overrides: Partial<PatrimonioItem> = {}): PatrimonioItem => ({
  id: 'patrimonio-1',
  poloId: 'polo-1',
  dataAquisicao: '2026-08-10',
  tipoProdutoId: 'tipo-1',
  tipoProduto: 'Eletrônico',
  descricao: 'Notebook',
  status: 'ativo',
  quantidadeOriginal: 4,
  quantidadeBaixada: 0,
  quantidadeDisponivel: 4,
  valorUnitario: '500.00',
  valorTotalOriginal: '2000.00',
  valorDisponivel: '2000.00',
  canEdit: true,
  canEditEconomicFields: true,
  canWriteOff: true,
  canDelete: true,
  updatedAt: '2026-08-10T10:00:00Z',
  ...overrides,
});

test('deriva baixa parcial sem criar um quarto status persistido', () => {
  const item = createItem({ quantidadeBaixada: 1, quantidadeDisponivel: 3 });
  assert.equal(getPatrimonioDisplayStatus(item), 'parcial');
});

test('bloqueia exclusão fora do escopo global e depois de qualquer baixa', () => {
  const active = createItem();
  assert.equal(getPatrimonioActionAvailability(active, false).remove.enabled, false);
  assert.equal(getPatrimonioActionAvailability(active, true).remove.enabled, true);

  const partiallyWrittenOff = createItem({ quantidadeBaixada: 1, quantidadeDisponivel: 3 });
  const availability = getPatrimonioActionAvailability(partiallyWrittenOff, true);
  assert.equal(availability.remove.enabled, false);
  assert.match(availability.remove.reason || '', /baixa registrada/i);
});

test('patrimônio baixado ou excluído não recebe nova baixa', () => {
  const writtenOff = createItem({
    status: 'baixado',
    quantidadeBaixada: 4,
    quantidadeDisponivel: 0,
    canDelete: false,
  });
  assert.equal(getPatrimonioDisplayStatus(writtenOff), 'baixado');
  assert.equal(getPatrimonioActionAvailability(writtenOff, true).writeOff.enabled, false);

  const excluded = createItem({ status: 'excluido', canWriteOff: false, canDelete: false });
  assert.equal(getPatrimonioDisplayStatus(excluded), 'excluido');
  assert.equal(getPatrimonioActionAvailability(excluded, true).edit.enabled, false);
});
