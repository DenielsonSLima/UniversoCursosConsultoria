import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allEligibleCandidatesSelected,
  candidateIdentityMatchesGroup,
  candidateSelectionOwnedBy,
  emptyCandidateSelection,
  eligibleCandidateIds,
  reconcileCandidateSelection,
  toggleAllEligibleCandidates,
  toggleCandidateSelection,
  updateCandidateSelection,
} from './candidateSelection.model.ts';

const items = [
  { receivableId: 'parcela-2', eligibility: { eligible: true, code: 'ELIGIBLE', reason: '' } },
  { receivableId: 'bloqueada', eligibility: { eligible: false, code: 'PAID', reason: 'Parcela paga.' } },
  { receivableId: 'parcela-1', eligibility: { eligible: true, code: 'ELIGIBLE', reason: '' } },
  { receivableId: 'parcela-2', eligibility: { eligible: true, code: 'ELIGIBLE', reason: '' } },
];

test('seleção aceita somente elegíveis, remove duplicadas e conserva a ordem canônica dos itens', () => {
  assert.deepEqual(eligibleCandidateIds(items), ['parcela-2', 'parcela-1']);
  assert.deepEqual(
    reconcileCandidateSelection(['desconhecida', 'bloqueada', 'parcela-1', 'parcela-2'], items),
    ['parcela-2', 'parcela-1'],
  );
  assert.deepEqual(toggleCandidateSelection([], 'bloqueada', items), []);
  assert.deepEqual(toggleCandidateSelection([], 'parcela-1', items), ['parcela-1']);
  assert.deepEqual(toggleCandidateSelection(['parcela-1'], 'parcela-2', items), ['parcela-2', 'parcela-1']);
  assert.deepEqual(toggleCandidateSelection(['parcela-2', 'parcela-1'], 'parcela-2', items), ['parcela-1']);
});

test('marcar/desmarcar todas opera apenas sobre as elegíveis', () => {
  const selected = toggleAllEligibleCandidates([], items);
  assert.deepEqual(selected, ['parcela-2', 'parcela-1']);
  assert.equal(allEligibleCandidatesSelected(selected, items), true);
  assert.deepEqual(toggleAllEligibleCandidates(selected, items), []);
  assert.equal(allEligibleCandidatesSelected([], items), false);
});

test('identidade exige o mesmo aluno, matrícula, turma e polo', () => {
  const group = { poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: 'mat-1', turmaId: 'turma-1' };
  assert.equal(candidateIdentityMatchesGroup(group, { ...group }), true);
  assert.equal(candidateIdentityMatchesGroup(group, { ...group, alunoId: 'aluno-2' }), false);
  assert.equal(candidateIdentityMatchesGroup(group, { ...group, matriculaId: 'mat-2' }), false);
  assert.equal(candidateIdentityMatchesGroup(group, { ...group, turmaId: 'turma-2' }), false);
  assert.equal(candidateIdentityMatchesGroup(group, { ...group, poloId: 'polo-2' }), false);
});

test('uma seleção ativa pertence a uma única identidade até ser limpa explicitamente', () => {
  const first = { poloId: 'polo-1', alunoId: 'aluno-1', matriculaId: 'mat-1', turmaId: 'turma-1' };
  const second = { poloId: 'polo-1', alunoId: 'aluno-2', matriculaId: 'mat-2', turmaId: 'turma-2' };
  const selectedFirst = updateCandidateSelection(emptyCandidateSelection(), first, ['parcela-1', 'parcela-1']);
  assert.deepEqual(selectedFirst.selectedIds, ['parcela-1']);
  assert.equal(candidateSelectionOwnedBy(selectedFirst, first), true);
  assert.equal(candidateSelectionOwnedBy(selectedFirst, second), false);

  const rejectedSecond = updateCandidateSelection(selectedFirst, second, ['parcela-2']);
  assert.equal(rejectedSecond, selectedFirst, 'outra identidade não substitui a seleção ativa');

  const cleared = updateCandidateSelection(selectedFirst, first, []);
  assert.deepEqual(cleared, emptyCandidateSelection());
  assert.deepEqual(updateCandidateSelection(cleared, second, ['parcela-2']), {
    ownerIdentity: second,
    selectedIds: ['parcela-2'],
  });
});
