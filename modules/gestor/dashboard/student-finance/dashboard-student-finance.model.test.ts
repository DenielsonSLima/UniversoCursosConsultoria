import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dashboardSettlementGuidance,
  getDashboardSettlementBlock,
  mapDashboardStudentReceivable,
  resolveDashboardStudentFinanceAccess,
} from './dashboard-student-finance.model.ts';

const mappedParcel = () => {
  const receivable = mapDashboardStudentReceivable({
    id: 'receivable-1',
    polo_id: 'polo-1',
    polo_nome: 'Japoatã',
    descricao: 'Parcela 2/10',
    valor: '125.50',
    data_vencimento: '2026-09-10',
    status: 'VENCIDO',
    cliente_id: 'student-1',
    cliente_nome: 'Aluno Teste',
    cliente_cpf: '000.000.000-00',
    matricula_id: 'enrollment-1',
    turma_id: 'class-1',
    tipo_lancamento: 'PARCELA',
    gateway_provider: 'banese_card',
    has_remote_charge: true,
  });
  assert.ok(receivable);
  return receivable;
};

test('ação rápida consulta com Resumo ou Receber, mas baixa somente com Receber', () => {
  assert.deepEqual(resolveDashboardStudentFinanceAccess(true, true, false), {
    canSearch: true,
    canSettle: false,
  });
  assert.deepEqual(resolveDashboardStudentFinanceAccess(true, false, true), {
    canSearch: true,
    canSettle: true,
  });
  assert.deepEqual(resolveDashboardStudentFinanceAccess(true, false, false), {
    canSearch: false,
    canSettle: false,
  });
  assert.deepEqual(resolveDashboardStudentFinanceAccess(false, true, true), {
    canSearch: false,
    canSettle: false,
  });
});

test('mapper preserva o contrato necessário para a baixa canônica e o alerta remoto', () => {
  const receivable = mappedParcel();

  assert.equal(receivable.poloId, 'polo-1');
  assert.equal(receivable.matriculaId, 'enrollment-1');
  assert.equal(receivable.turmaId, 'class-1');
  assert.equal(receivable.tipoLancamento, 'PARCELA');
  assert.equal(receivable.gatewayProvider, 'banese_card');
  assert.equal(receivable.hasRemoteCharge, true);
  assert.equal(receivable.clienteCpfCnpj, '000.000.000-00');
});

test('ação rápida bloqueia matrícula e valida o polo antes de abrir a confirmação', () => {
  const parcel = mappedParcel();
  const enrollment = { ...parcel, tipoLancamento: 'MATRICULA' as const };
  const legacyWithoutLaunchType = mapDashboardStudentReceivable({
    id: 'legacy-receivable',
    polo_id: 'polo-1',
    descricao: 'Lançamento legado',
    valor: 50,
    data_vencimento: '2026-09-10',
    status: 'PENDENTE',
    cliente_nome: 'Aluno Legado',
  });
  assert.ok(legacyWithoutLaunchType, 'linha legada deve continuar consultável');

  assert.equal(getDashboardSettlementBlock(enrollment, true, 'polo-1'), 'enrollment');
  assert.match(
    dashboardSettlementGuidance('enrollment'),
    /módulo Financeiro[\s\S]*parcelas futuras/i,
  );
  assert.equal(
    getDashboardSettlementBlock(legacyWithoutLaunchType, true, 'polo-1'),
    'launch-type',
  );
  assert.match(
    dashboardSettlementGuidance('launch-type'),
    /não identificado[\s\S]*módulo Financeiro/i,
  );
  assert.equal(getDashboardSettlementBlock(parcel, true, 'todos'), 'select-polo');
  assert.equal(getDashboardSettlementBlock(parcel, true, 'polo-2'), 'polo-scope');
  assert.equal(getDashboardSettlementBlock(parcel, false, 'polo-1'), 'permission');
  assert.equal(getDashboardSettlementBlock(parcel, true, 'polo-1'), null);
});

test('mapper descarta linhas essenciais inválidas sem ampliar status financeiro', () => {
  assert.equal(mapDashboardStudentReceivable({
    id: 'receivable-1',
    polo_id: 'polo-1',
    valor: 10,
    status: 'DESCONHECIDO',
  }), null);
  assert.equal(mapDashboardStudentReceivable({
    id: 'receivable-1',
    polo_id: '',
    valor: 10,
    status: 'PENDENTE',
  }), null);
  assert.equal(mapDashboardStudentReceivable({
    id: 'receivable-1',
    polo_id: 'polo-1',
    valor: 'NaN',
    status: 'PENDENTE',
  }), null);
});
