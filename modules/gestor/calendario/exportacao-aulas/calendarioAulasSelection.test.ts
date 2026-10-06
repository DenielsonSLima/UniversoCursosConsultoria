import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyCalendarioAulasSelection,
  createCalendarioAulasSelection,
  getCalendarioAulasScope,
  getCalendarioAulasSelectionError,
} from './calendarioAulasSelection.ts';

const modulos = [
  { moduloId: 'modulo-i', moduloNome: 'Módulo I - Ambientação', moduloOrdem: 1 },
  { moduloId: 'modulo-ii', moduloNome: 'Módulo II - Especialidades', moduloOrdem: 2 },
];
const input = { poloId: 'matriz', modalidade: 'TECNICO' as const, turmaId: 't46', mesReferencia: '2026-10-01' };

test('preserva módulo completo e limpa a seleção ao iniciar outra turma', () => {
  const selection = createCalendarioAulasSelection();
  assert.equal(selection.modoExportacao, 'MODULO_COMPLETO');
  assert.match(getCalendarioAulasSelectionError(selection, modulos) || '', /Selecione um módulo/);
  selection.moduloId = 'modulo-i';
  assert.equal(getCalendarioAulasSelectionError(selection, modulos), null);
  assert.deepEqual(applyCalendarioAulasSelection(input, selection), {
    ...input, modoExportacao: 'MODULO_COMPLETO', moduloId: 'modulo-i',
  });
  assert.equal(getCalendarioAulasScope(selection, modulos), 'Módulo I - Ambientação');
  assert.deepEqual(createCalendarioAulasSelection().moduloIds, []);
  assert.equal(createCalendarioAulasSelection().moduloId, '');
});

test('cronológico padrão abrange todos os módulos e toda a grade sem recorte do mês ativo', () => {
  const selection = { ...createCalendarioAulasSelection(), modoExportacao: 'CRONOLOGICO' as const,
    moduloIds: ['modulo-i'], dataInicio: '2026-10-01', dataFim: '2026-10-31' };
  assert.equal(getCalendarioAulasSelectionError(selection, modulos), null);
  assert.deepEqual(applyCalendarioAulasSelection(input, selection), {
    ...input, modoExportacao: 'CRONOLOGICO', moduloId: null,
    moduloIds: null, dataInicio: null, dataFim: null,
  });
  assert.equal(getCalendarioAulasScope(selection, modulos), 'Todos os módulos disponíveis · Todas as aulas programadas');
});

test('permite subconjunto com período inclusivo e impede módulos de outra turma', () => {
  const selection = { ...createCalendarioAulasSelection(), modoExportacao: 'CRONOLOGICO' as const,
    todosModulos: false, moduloIds: ['modulo-ii'], definirPeriodo: true,
    dataInicio: '2026-10-10', dataFim: '2026-10-10' };
  assert.equal(getCalendarioAulasSelectionError(selection, modulos), null);
  const request = applyCalendarioAulasSelection(input, selection);
  assert.deepEqual(request.moduloIds, ['modulo-ii']);
  assert.equal(request.dataInicio, '2026-10-10');
  assert.equal(request.dataFim, '2026-10-10');
  assert.match(getCalendarioAulasScope(selection, modulos), /10\/10\/2026 a 10\/10\/2026/);
  assert.match(getCalendarioAulasSelectionError({ ...selection, moduloIds: [] }, modulos) || '', /pelo menos um/);
  assert.match(getCalendarioAulasSelectionError({ ...selection, moduloIds: ['modulo-outra-turma'] }, modulos) || '', /disponível/);
});

test('período exige duas datas reais em ordem, aceitando virada de ano', () => {
  const selection = { ...createCalendarioAulasSelection(), modoExportacao: 'CRONOLOGICO' as const,
    definirPeriodo: true, dataInicio: '2026-12-01', dataFim: '2027-01-31' };
  assert.equal(getCalendarioAulasSelectionError(selection, modulos), null);
  assert.match(getCalendarioAulasSelectionError({ ...selection, dataFim: '' }, modulos) || '', /datas inicial e final/);
  assert.match(getCalendarioAulasSelectionError({ ...selection, dataInicio: '2026-02-30' }, modulos) || '', /datas inicial e final/);
  assert.match(getCalendarioAulasSelectionError({ ...selection, dataFim: '2026-11-30' }, modulos) || '', /igual ou posterior/);
});

test('cursos livres mantêm mês ativo e não recebem estado técnico residual', () => {
  const request = applyCalendarioAulasSelection({ ...input, modalidade: 'LIVRE', modoExportacao: 'CRONOLOGICO' }, {
    ...createCalendarioAulasSelection(), modoExportacao: 'CRONOLOGICO',
  });
  assert.deepEqual(request, { ...input, modalidade: 'LIVRE', moduloId: null });
});
