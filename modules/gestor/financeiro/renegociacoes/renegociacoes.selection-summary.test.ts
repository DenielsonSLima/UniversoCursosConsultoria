import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSelectionSummary, selectionIdsKey } from './renegociacoes.selection-summary.ts';

const identity = { poloId: 'polo-a', alunoId: 'aluno-a', matriculaId: 'mat-a', turmaId: 'turma-a' };
const fixture = () => ({
  version: 1, asOf: '2026-10-03', identity, receivableIds: ['r1', 'r2'], count: 2,
  totals: { principalCents: 50000, punctualDiscountCents: 5000, discountedPrincipalCents: 45000,
    interestCents: 1200, penaltyCents: 500, grossDebtCents: 51700, payableCents: 46700 },
  discount: { status: 'KNOWN', message: 'Desconto comprovado.', appliedToProposal: false },
  payableStatus: 'KNOWN', payableMessage: 'Referência dos títulos originais.',
});

test('resumo mantém valores canônicos sem calcular nem aplicar desconto à proposta', () => {
  const parsed = parseSelectionSummary(fixture(), identity, ['r2', 'r1'], '2026-10-03');
  assert.deepEqual(parsed.totals, fixture().totals);
  assert.equal(parsed.discount.appliedToProposal, false);
  assert.deepEqual(parsed.receivableIds, ['r1', 'r2']);
  assert.equal(selectionIdsKey(['r2', 'r1', 'r1']), selectionIdsKey(['r1', 'r2']));
});

test('desconto ou total sem comprovação permanecem null, não zero', () => {
  const value = fixture();
  const unknown = { ...value, totals: { ...value.totals, punctualDiscountCents: null,
    discountedPrincipalCents: null, payableCents: null }, discount: { ...value.discount, status: 'UNAVAILABLE' },
    payableStatus: 'UNAVAILABLE' };
  assert.equal(parseSelectionSummary(unknown, identity, ['r1', 'r2']).totals.punctualDiscountCents, null);
  const grace = { ...value, payableStatus: 'UNAVAILABLE', totals: { ...value.totals, payableCents: null } };
  assert.equal(parseSelectionSummary(grace, identity, ['r1', 'r2']).totals.discountedPrincipalCents, 45000);
  assert.throws(() => parseSelectionSummary({ ...unknown, totals: { ...unknown.totals, punctualDiscountCents: 0 } }, identity, ['r1', 'r2']));
});

test('rejeita resposta de outro aluno, matrícula, turma, polo, data ou seleção', () => {
  for (const field of Object.keys(identity)) {
    assert.throws(() => parseSelectionSummary({ ...fixture(), identity: { ...identity, [field]: 'outra' } }, identity, ['r1', 'r2']));
  }
  assert.throws(() => parseSelectionSummary(fixture(), identity, ['r1']));
  assert.throws(() => parseSelectionSummary(fixture(), identity, ['r1', 'r2'], '2026-10-04'));
  assert.throws(() => parseSelectionSummary({ ...fixture(), receivableIds: ['r1', 'r1'] }, identity, ['r1', 'r2']));
});

test('rejeita campos financeiros ausentes, negativos, fracionários ou não seguros', () => {
  for (const invalid of [null, undefined, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '50000']) {
    assert.throws(() => parseSelectionSummary({ ...fixture(), totals: { ...fixture().totals, principalCents: invalid } }, identity, ['r1', 'r2']));
  }
  assert.throws(() => parseSelectionSummary({ ...fixture(), discount: { ...fixture().discount, appliedToProposal: true } }, identity, ['r1', 'r2']));
  assert.throws(() => parseSelectionSummary({ ...fixture(), version: 2 }, identity, ['r1', 'r2']));
});
