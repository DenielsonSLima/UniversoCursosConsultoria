import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CaixaReportReceipt } from '../report/caixa-report.types.ts';
import { compositionReviewPage, compositionReviewReason, isIncompleteReceipt, selectCompositionReviewRows } from './caixa-composition-review.model.ts';

const receipt = (index: number, overrides: Partial<CaixaReportReceipt> = {}): CaixaReportReceipt => ({
  id: `synthetic-${index}`, dataPagamento: '2026-10-15', dataVencimento: '2026-10-10',
  descricao: 'Parcela sintética', polo: 'Polo teste', curso: 'Curso teste', turma: 'Turma teste',
  parcelaNumero: 1, totalParcelas: 2, formaPagamento: 'Não informada', conta: 'Não informada',
  valorBase: 100, juros: null, multa: null, acrescimo: null, desconto: null,
  diferencaNaoDiscriminada: -10, composicaoStatus: 'NAO_DISCRIMINADA',
  pagador: 'Pessoa fictícia', modalidade: 'TECNICO', tipoLancamento: 'MENSALIDADE', valorRecebido: 90,
  ...overrides,
});

test('todos os 41 divergentes ficam acessíveis em três páginas sem perdas ou duplicação', () => {
  const rows = Array.from({ length: 41 }, (_, index) => receipt(index));
  const pages = [1, 2, 3].map(page => compositionReviewPage(rows, page));
  assert.deepEqual(pages.map(page => page.length), [20, 20, 1]);
  assert.deepEqual(pages.flat().map(row => row.id), rows.map(row => row.id));
  assert.throws(() => compositionReviewPage(rows, 0));
});

test('classificação não confunde diferença líquida zero com componentes comprovados', () => {
  const rows = [receipt(1), receipt(2, { diferencaNaoDiscriminada: 0 }), receipt(3, {
    juros: 0, multa: 0, acrescimo: 0, desconto: 0, diferencaNaoDiscriminada: 0,
    composicaoStatus: 'COMPOSICAO_EXPLICITA',
  })];
  assert.deepEqual(selectCompositionReviewRows(rows, 'DIFFERENCE').map(row => row.id), ['synthetic-1']);
  assert.deepEqual(selectCompositionReviewRows(rows, 'MISSING_DETAIL').map(row => row.id), ['synthetic-2']);
  assert.equal(isIncompleteReceipt(rows[2]), false);
});

test('mantém nulos e todos valores canônicos sem recomputar desconto ou saldo', () => {
  const row = receipt(1);
  const snapshot = JSON.stringify(row);
  assert.equal(selectCompositionReviewRows([row], 'DIFFERENCE')[0], row);
  assert.equal(JSON.stringify(row), snapshot);
  assert.equal(row.desconto, null);
  assert.match(compositionReviewReason(row), /não comprova desconto nem dívida/);
});

test('API parcial e regra informada respeitam mesma classificação do backend', () => {
  for (const status of ['PARCIAL_POR_API_PROESC', 'CALCULADO_REGRA_INFORMADA_PROESC', 'API_E_REGRA_INFORMADA_PROESC'] as const) {
    assert.equal(isIncompleteReceipt(receipt(1, { juros: 0, multa: 0, acrescimo: 0, desconto: 0, composicaoStatus: status })), true);
  }
});

test('consulta completa somente leitura usa fila interativa sem retry automático', () => {
  const service = readFileSync(resolve('modules/gestor/caixa/composition-review/caixa-composition-review.service.ts'), 'utf8');
  assert.match(service, /queueCaixaRead\(signal/);
  assert.match(service, /getDetailedMonthlyReport\(poloId, competencia, signal\), 'interactive'/);
  assert.match(service, /retry: false/);
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
});

test('modal preserva desconhecido, paginação, foco, fechamento e não exibe parcial', () => {
  const modal = readFileSync(resolve('modules/gestor/caixa/composition-review/CaixaCompositionReviewModal.tsx'), 'utf8');
  assert.match(modal, /value === null \|\| !Number.isFinite\(value\) \? 'Não informado'/);
  assert.match(modal, /useReviewDialogFocus\(dialogRef, closeRef, onClose\)/);
  assert.match(modal, /Nenhuma lista parcial será apresentada/);
  assert.match(modal, /compositionReviewPage\(rows, activePage\)/);
  assert.match(modal, /setFilter\(next\); setPage\(1\)/);
  const cards = readFileSync(resolve('modules/gestor/caixa/components/CaixaCompositionCards.tsx'), 'utf8');
  assert.match(cards, /reviewScope !== null && reviewScope === currentScope/);
  assert.match(cards, /key=\{currentScope\}/);
});
