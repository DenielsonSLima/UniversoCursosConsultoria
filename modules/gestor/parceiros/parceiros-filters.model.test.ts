import assert from 'node:assert/strict';
import test from 'node:test';
import { filterParceiros, sortParceiros } from './parceiros-filters.model.ts';

const partners = [
  { id: '1', tipo: 'Aluno', nome: 'Matheus Ativo', status: 'ATIVO', turmaId: 'turma-a', modalidadesAluno: ['TECNICO'] },
  { id: '2', tipo: 'Aluno', nome: 'Adriana Inativa', status: 'INATIVO', turmaId: 'turma-b', modalidadesAluno: ['EAD'] },
  { id: '3', tipo: 'Aluno', nome: 'Bruno Inativo', status: 'INATIVO', turmaId: 'turma-c', modalidadesAluno: ['LIVRE'] },
  { id: '4', tipo: 'PJ', nome: 'Empresa Universo', status: 'ATIVO' },
];

const baseFilters = {
  activeTab: 'todos' as const,
  statusFilter: 'todos',
  alunoModalidadeFilter: [],
  turmaFilter: 'todas',
};

test('limpar o texto preserva status e restaura todos os resultados compatíveis', () => {
  const searched = filterParceiros(partners, { ...baseFilters, searchTerm: 'math' });
  assert.deepEqual(searched.map((item) => item.id), ['1']);

  const searchedInactive = filterParceiros(partners, {
    ...baseFilters,
    searchTerm: 'math',
    statusFilter: 'inativo',
  });
  assert.deepEqual(searchedInactive, []);

  const cleared = filterParceiros(partners, {
    ...baseFilters,
    searchTerm: '',
    statusFilter: 'inativo',
  });
  assert.deepEqual(cleared.map((item) => item.id), ['2', '3']);
});

test('filtros acadêmicos invisíveis não prendem abas incompatíveis', () => {
  const result = filterParceiros(partners, {
    activeTab: 'pj',
    searchTerm: '',
    statusFilter: 'todos',
    alunoModalidadeFilter: ['TECNICO'],
    turmaFilter: 'turma-a',
  });
  assert.deepEqual(result.map((item) => item.id), ['4']);
});

test('ordenação não altera o array de origem', () => {
  const original = partners.slice(0, 3);
  const sorted = sortParceiros(original, 'za');
  assert.deepEqual(sorted.map((item) => item.nome), ['Matheus Ativo', 'Bruno Inativo', 'Adriana Inativa']);
  assert.deepEqual(original.map((item) => item.id), ['1', '2', '3']);
});
