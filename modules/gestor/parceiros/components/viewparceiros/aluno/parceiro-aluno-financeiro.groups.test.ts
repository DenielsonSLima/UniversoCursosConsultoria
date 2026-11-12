import assert from 'node:assert/strict';
import test from 'node:test';
import { groupStudentFinance } from './parceiro-aluno-financeiro.groups.ts';
import type { StudentReceivable } from './parceiro-aluno-financeiro.service.ts';
const item = (id: string, type: string | null, courseId: string, enrollment = 'm1') => ({
  id, matricula_id: enrollment, valor: 123, status: 'PENDENTE', can_open_boleto: true,
  turmas: { cursos: { id: courseId, modalidade: type, nome: 'Mesmo nome' } },
} as StudentReceivable);
test('ordena tipos e reúne curso sem misturar matrículas ou cursos homônimos', () => {
  const source = [item('e1','EAD','c1'),item('t1','TECNICO','c2'),item('e2','EAD','c1','m2'),item('e3','EAD','c3')];
  const groups = groupStudentFinance(source);
  assert.deepEqual(groups.map(x=>x.id), ['TECNICO','EAD']);
  assert.equal(groups[1].courses.length,2);
  assert.equal(groups[1].courses[0].enrollments.length,2);
  assert.equal(groups[1].courses[0].enrollments[0].items[0], source[0]);
  assert.equal(source.length,4);
});
test('preserva ordem e identidade dos títulos sem inferir modalidade por nome', () => {
  const source = [item('a',null,'c1'),item('b','INEXISTENTE','c2')];
  const groups=groupStudentFinance(source);
  assert.equal(groups[0].id,'OUTROS');
  assert.equal(groups[0].courses.length,2);
  assert.deepEqual(groupStudentFinance([]),[]);
});
test('livres, especialização e superior permanecem separados', () => {
  assert.deepEqual(groupStudentFinance([item('s','SUPERIOR','s'),item('l','LIVRE','l'),item('e','ESPECIALIZACAO','e')]).map(x=>x.id),['LIVRE','ESPECIALIZACAO','SUPERIOR']);
});
