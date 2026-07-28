import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCaixaReportPages } from './caixa-report.pagination';

const item = (id: string) => ({ id } as any);
const recurringItem = (turmaId: string) => ({ turmaId } as any);

test('mantém resumo e as duas tabelas mesmo sem movimentos', () => {
  const pages = buildCaixaReportPages([], [], []);
  assert.deepEqual(pages.map((page) => page.section), [
    'RESUMO',
    'RECEBIMENTOS',
    'DESPESAS',
    'CARTEIRA_RECORRENTE',
  ]);
});

test('não perde nem duplica movimentos nos limites de página', () => {
  const receipts = Array.from({ length: 21 }, (_, index) => item(`r-${index}`));
  const expenses = Array.from({ length: 11 }, (_, index) => item(`d-${index}`));
  const recurringClasses = Array.from(
    { length: 9 },
    (_, index) => recurringItem(`t-${index}`),
  );
  const pages = buildCaixaReportPages(receipts, expenses, recurringClasses);

  const receiptIds = pages
    .filter((page) => page.section === 'RECEBIMENTOS')
    .flatMap((page) => page.rows.map((row) => row.id));
  const expenseIds = pages
    .filter((page) => page.section === 'DESPESAS')
    .flatMap((page) => page.rows.map((row) => row.id));
  const recurringIds = pages
    .filter((page) => page.section === 'CARTEIRA_RECORRENTE')
    .flatMap((page) => page.rows.map((row) => row.turmaId));

  assert.deepEqual(receiptIds, receipts.map((row) => row.id));
  assert.deepEqual(expenseIds, expenses.map((row) => row.id));
  assert.deepEqual(recurringIds, recurringClasses.map((row) => row.turmaId));
  assert.equal(new Set(receiptIds).size, receipts.length);
  assert.equal(new Set(expenseIds).size, expenses.length);
  assert.equal(new Set(recurringIds).size, recurringClasses.length);
  assert.equal(
    pages.filter((page) => page.section === 'CARTEIRA_RECORRENTE').length,
    3,
  );
});
