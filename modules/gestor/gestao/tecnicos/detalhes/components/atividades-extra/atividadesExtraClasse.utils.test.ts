import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  AtividadeAlunoRoster,
  AtividadeExtraClasseResposta,
} from './atividadesExtraClasse.types';
import {
  buildAtividadeStudents,
  filterAtividadeStudents,
  getAtividadeStudentCounts,
  isAtividadeRespostaAtrasada,
} from './atividadesExtraClasse.utils';

const roster: AtividadeAlunoRoster[] = [
  { id: 'aluno-1', nome: 'Ana Lima', matricula: 'MAT-001', status: 'ATIVO' },
  { id: 'aluno-2', nome: 'Bruno Souza', matricula: 'MAT-002', status: 'ATIVO' },
];

const resposta = (
  alunoId: string,
  status: AtividadeExtraClasseResposta['status'],
  nome: string,
): AtividadeExtraClasseResposta => ({
  id: `resposta-${alunoId}`,
  atividade_id: 'atividade-1',
  aluno_id: alunoId,
  status,
  aluno: { id: alunoId, nome },
});

test('mescla roster com respostas e preserva aluno histórico', () => {
  const students = buildAtividadeStudents(roster, [
    resposta('aluno-2', 'CORRIGIDA', 'Bruno Souza'),
    resposta('aluno-3', 'ENTREGUE', 'Carla Nunes'),
  ]);

  assert.deepEqual(students.map((student) => student.nome), [
    'Ana Lima',
    'Bruno Souza',
    'Carla Nunes',
  ]);
  assert.equal(students[0].resposta, null);
  assert.equal(students[1].resposta?.status, 'CORRIGIDA');
  assert.equal(students[2].matriculaStatus, 'VÍNCULO HISTÓRICO');
});

test('conta pendente como aguardando e separa entregues de corrigidos', () => {
  const students = buildAtividadeStudents(roster, [
    resposta('aluno-1', 'PENDENTE', 'Ana Lima'),
    resposta('aluno-2', 'ENTREGUE', 'Bruno Souza'),
    resposta('aluno-3', 'CORRIGIDA', 'Carla Nunes'),
  ]);

  assert.deepEqual(getAtividadeStudentCounts(students), {
    total: 3,
    aguardando: 1,
    revisar: 1,
    corrigidos: 1,
  });
});

test('filtra por status, nome e matrícula', () => {
  const students = buildAtividadeStudents(roster, [
    resposta('aluno-2', 'ENTREGUE', 'Bruno Souza'),
  ]);

  assert.deepEqual(
    filterAtividadeStudents(students, 'AGUARDANDO', '').map((student) => student.id),
    ['aluno-1'],
  );
  assert.deepEqual(
    filterAtividadeStudents(students, 'TODOS', 'mat-002').map((student) => student.id),
    ['aluno-2'],
  );
  assert.deepEqual(
    filterAtividadeStudents(students, 'REVISAR', 'bruno').map((student) => student.id),
    ['aluno-2'],
  );
});

test('usa a data real de entrega para identificar atraso', () => {
  const lateResponse: AtividadeExtraClasseResposta = {
    ...resposta('aluno-1', 'ENTREGUE', 'Ana Lima'),
    created_at: '2026-07-20T12:00:00-03:00',
    entregue_em: '2026-07-27T09:00:00-03:00',
  };

  assert.equal(isAtividadeRespostaAtrasada(lateResponse, '2026-07-26'), true);
});
