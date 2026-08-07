import assert from 'node:assert/strict';
import test from 'node:test';
import { CensoReadinessRow } from './matricula-inicial.types.ts';
import { validateCensoReadiness } from './matricula-inicial.validation.ts';

const completeRow: CensoReadinessRow = {
  matriculaId: 'm1',
  alunoId: 'a1',
  alunoNome: 'Aluno Teste',
  alunoCpf: '12345678901',
  dataNascimento: '2000-01-01',
  sexo: 'F',
  nomeMae: 'Mãe Teste',
  racaCor: 'PARDA',
  naturalidade: 'Maceió',
  nacionalidade: 'Brasileira',
  cep: '57000000',
  endereco: 'Rua Teste',
  cidade: 'Maceió',
  uf: 'AL',
  status: 'ATIVO',
  turmaId: 't1',
  turmaNome: 'Turma Teste',
  turmaCodigo: 'T-01',
  turmaInicio: '2026-01-01',
  turmaFim: '2027-01-01',
  turno: 'NOTURNO',
  cursoNome: 'Técnico em Teste',
  modalidade: 'TECNICO',
  poloNome: 'Matriz',
};

test('não cria pendências quando os campos avaliados estão completos', () => {
  const result = validateCensoReadiness([completeRow]);
  assert.equal(result.erros, 0);
  assert.equal(result.avisos, 0);
  assert.equal(result.totalAlunos, 1);
  assert.equal(result.totalTurmas, 1);
});

test('classifica ausência de identificação como erro e raça/cor como aviso', () => {
  const result = validateCensoReadiness([{
    ...completeRow,
    alunoCpf: '',
    racaCor: '',
  }]);

  assert.equal(result.erros, 1);
  assert.equal(result.avisos, 1);
  assert.equal(result.issues.find((item) => item.field === 'cpf')?.severity, 'erro');
  assert.equal(result.issues.find((item) => item.field === 'raca_cor')?.severity, 'aviso');
});

test('não repete pendência da mesma turma para cada matrícula', () => {
  const result = validateCensoReadiness([
    { ...completeRow, turmaInicio: null },
    { ...completeRow, matriculaId: 'm2', alunoId: 'a2', alunoNome: 'Outro Aluno', turmaInicio: null },
  ]);

  assert.equal(result.issues.filter((item) => item.field === 'data_inicio').length, 1);
  assert.equal(result.totalAlunos, 2);
});
