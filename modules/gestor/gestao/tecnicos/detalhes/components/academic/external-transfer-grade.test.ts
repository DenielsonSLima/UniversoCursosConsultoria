import assert from 'node:assert/strict';
import test from 'node:test';
import { loadExternalTransferGrade, requireExternalTransferGrade } from './external-transfer-grade.ts';

const uuid = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const grade = {
  versao: 1, turmaId: uuid(1), cursoId: uuid(2), cursoNome: 'Curso de teste',
  modulos: [
    { id: uuid(3), nome: 'Módulo inicial', ordem: 1, disciplinas: [
      { id: uuid(4), nome: 'Z na ordem curricular', ordem: 1, cargaHoraria: 40 },
      { id: uuid(5), nome: 'A na ordem curricular', ordem: 2, cargaHoraria: 0 },
    ] },
    { id: uuid(6), nome: 'Módulo vazio preservado', ordem: 2, disciplinas: [] },
  ],
};
test('leitura usa a matriz canônica da turma e preserva módulos/ordem sem configurar disciplinas', async () => {
  const calls: unknown[] = [];
  const received = await loadExternalTransferGrade(async (name, args) => {
    calls.push({ name, args });
    return { data: grade, error: null };
  }, grade.turmaId);
  assert.deepEqual(calls, [{ name: 'get_grade_recebimento_transferencia_tecnica_secure', args: { p_turma_id: uuid(1) } }]);
  assert.deepEqual(received, grade);
  assert.equal(received.modulos[0].disciplinas[0].nome, 'Z na ordem curricular');
  assert.deepEqual(received.modulos[1].disciplinas, []);
  assert.deepEqual(requireExternalTransferGrade({ ...grade, modulos: [] }, grade.turmaId).modulos, []);
});
test('consulta recusada permanece erro; retorno incompleto, outra turma e IDs duplicados são rejeitados', async () => {
  await assert.rejects(loadExternalTransferGrade(async () => ({ data: null, error: new Error('Sem permissão') }), grade.turmaId), /Sem permissão/);
  for (const invalid of [
    { ...grade, turmaId: uuid(9) },
    { ...grade, modulos: [{ ...grade.modulos[0], disciplinas: [{ ...grade.modulos[0].disciplinas[0], cargaHoraria: null }] }] },
    { ...grade, modulos: [{ ...grade.modulos[0], disciplinas: [grade.modulos[0].disciplinas[0], grade.modulos[0].disciplinas[0]] }] },
  ]) assert.throws(() => requireExternalTransferGrade(invalid, grade.turmaId), /grade completa/);
});
