import assert from 'node:assert/strict';
import test from 'node:test';
import { transferenciaCursoOptions, transferenciaTurmaOptions, transferenciaTurmasDoCurso } from './transferencia-destinos.ts';
import type { SecretariaTurmaResumo } from '../shared/secretaria-documentos.types';

const turma = (id: string, courseId: string, patch: Partial<SecretariaTurmaResumo> = {}): SecretariaTurmaResumo => ({
  id, cursoId: courseId, cursoNome: courseId === 'enfermagem' ? 'Técnico em Enfermagem' : 'Técnico em Administração',
  nome: `Turma ${id}`, codigo: `TEC-${id}`, turno: 'Noite', modalidade: 'TECNICO', status: 'EM_ANDAMENTO', totalAlunos: 0,
  ...patch,
});
const turmas = [
  turma('a', 'enfermagem'), turma('b', 'enfermagem'), turma('c', 'administracao'),
  turma('d', 'enfermagem', { status: 'CONCLUIDO' }), turma('e', 'administracao', { modalidade: 'LIVRE' }),
];

test('seleção de nosso curso deduplica apenas cursos técnicos com turma em andamento', () => {
  const courses = transferenciaCursoOptions(turmas);
  assert.deepEqual(courses.map((course) => course.id), ['administracao', 'enfermagem']);
  assert.equal(courses.find((course) => course.id === 'enfermagem')?.descricao, '2 turmas em andamento');
  assert.deepEqual(transferenciaCursoOptions([]), []);
});

test('turma depende de curso explícito e nunca reaproveita turma de outro curso', () => {
  assert.deepEqual(transferenciaTurmasDoCurso(turmas, ''), []);
  const nursing = transferenciaTurmasDoCurso(turmas, 'enfermagem');
  assert.deepEqual(nursing.map((item) => item.id), ['a', 'b']);
  const administration = transferenciaTurmasDoCurso(turmas, 'administracao');
  assert.deepEqual(administration.map((item) => item.id), ['c']);
  assert.equal(administration.some((item) => item.id === nursing[0].id), false);
  assert.deepEqual(transferenciaTurmasDoCurso(turmas, 'desconhecido'), []);
});

test('busca de turma conserva código, turno e nome do curso sem criar vínculos', () => {
  const selected = transferenciaTurmasDoCurso(turmas, 'enfermagem');
  const options = transferenciaTurmaOptions(selected);
  assert.equal(options[0].id, selected[0].id);
  assert.equal(options[0].descricao, 'TEC-a · Noite');
  assert.deepEqual(options[0].termos, ['Turma a', 'TEC-a', 'Noite', 'Técnico em Enfermagem']);
  assert.equal(turmas.length, 5);
});
