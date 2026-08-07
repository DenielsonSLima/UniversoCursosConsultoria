import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAvailableAcademicModuleStatus,
  selectDefaultAcademicModule,
  type SecretariaAcademicModule,
} from './academic-results.modules.ts';

const moduleOption = (
  periodId: string,
  order: number,
  status: SecretariaAcademicModule['status'],
): SecretariaAcademicModule => ({
  periodId,
  moduleId: `module-${periodId}`,
  name: `Módulo ${order}`,
  order,
  status,
  disciplines: [{ id: `discipline-${periodId}`, name: 'Disciplina' }],
});

test('mantém um módulo iniciado que já foi selecionado', () => {
  const modules = [
    moduleOption('period-1', 1, 'FECHADO'),
    moduleOption('period-2', 2, 'ABERTO'),
  ];

  assert.equal(
    selectDefaultAcademicModule(modules, 'period-1')?.periodId,
    'period-1',
  );
});

test('prioriza o módulo operacional quando ainda não há seleção', () => {
  const modules = [
    moduleOption('period-1', 1, 'FECHADO'),
    moduleOption('period-2', 2, 'EM_FECHAMENTO'),
  ];

  assert.equal(selectDefaultAcademicModule(modules)?.periodId, 'period-2');
});

test('usa o último módulo fechado quando não existe módulo operacional', () => {
  const modules = [
    moduleOption('period-1', 1, 'FECHADO'),
    moduleOption('period-2', 2, 'FECHADO'),
  ];

  assert.equal(selectDefaultAcademicModule(modules)?.periodId, 'period-2');
});

test('não seleciona módulo quando nenhum período foi iniciado', () => {
  assert.equal(selectDefaultAcademicModule([]), null);
});

test('aceita somente os estados acadêmicos liberados para boletim', () => {
  assert.equal(isAvailableAcademicModuleStatus('ABERTO'), true);
  assert.equal(isAvailableAcademicModuleStatus('EM_FECHAMENTO'), true);
  assert.equal(isAvailableAcademicModuleStatus('FECHADO'), true);
  assert.equal(isAvailableAcademicModuleStatus('PLANEJADO'), false);
  assert.equal(isAvailableAcademicModuleStatus('STATUS_FUTURO'), false);
});

test('ordena módulos fechados antes de selecionar o mais recente', () => {
  const modules = [
    moduleOption('period-3', 3, 'FECHADO'),
    moduleOption('period-1', 1, 'FECHADO'),
    moduleOption('period-2', 2, 'FECHADO'),
  ];

  assert.equal(selectDefaultAcademicModule(modules)?.periodId, 'period-3');
});
