import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertAlunosStatusAccess,
  normalizeAlunosStatusKpis,
} from './alunos-status.model.ts';

const [service, filters, partnersPage, dashboard, dashboardService, dashboardQueries, finance] = await Promise.all([
  readFile(new URL('./alunos-status.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../parceiros/hooks/useParceirosFilters.ts', import.meta.url), 'utf8'),
  readFile(new URL('../parceiros/ParceirosPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard/DashboardPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard/dashboard.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../dashboard/dashboard.queries.ts', import.meta.url), 'utf8'),
  readFile(new URL('../financeiro/resumo/ResumoTab.tsx', import.meta.url), 'utf8'),
]);

test('serviço usa somente a RPC canônica e falha quando o contrato vem ausente', () => {
  assert.match(service, /get_student_status_kpis_secure/);
  assert.match(service, /p_consumer: input\.consumer/);
  assert.match(service, /assertAlunosStatusAccess/);
  assert.match(service, /O backend não retornou os indicadores de alunos/);
  assert.doesNotMatch(service, /\.from\(['"](?:parceiros|matriculas|contas_receber)['"]\)/);
});

test('Parceiros não calcula KPIs a partir da lista filtrada', () => {
  assert.doesNotMatch(filters, /const kpis = useMemo/);
  assert.doesNotMatch(filters, /totalAlunosAtivos|totalProfessoresAtivos|totalParceirosAtivos/);
  assert.match(partnersPage, /statusKpis\.cadastrosAlunosAtivos/);
  assert.match(partnersPage, /statusKpisError/);
});

test('Dashboard e Financeiro apresentam conceitos diferentes', () => {
  assert.match(dashboard, /label="Cadastros de alunos ativos"/);
  assert.match(dashboard, /cadastrosAlunosAtivos/);
  assert.match(dashboardService, /get_dashboard_kpis/);
  assert.match(dashboardService, /result\.alunos_ativos/);
  assert.doesNotMatch(dashboardService, /alunosStatusService/);
  assert.match(dashboardService, /Indicador autorizado ausente no painel/);
  assert.match(dashboardQueries, /widgets\.includes\('alunos-ativos'\)/);
  assert.match(dashboardQueries, /widgets\.includes\('matriculas-mes'\)/);
  assert.match(finance, /resumoFinanceiroService\.getValues/);
  assert.match(finance, /Saldo atual/);
  assert.match(finance, /A receber/);
  assert.match(finance, /A pagar/);
  assert.match(finance, /BaneseApiHealthCard/);
  assert.doesNotMatch(finance, /alunosStatusService|get_student_status_kpis_secure/);
  assert.doesNotMatch(finance, /Matrículas Ativas|Buscar Mensalidades/);
});

test('normalizador aceita contagens inteiras e rejeita payload financeiro corrompido', () => {
  const metrics = normalizeAlunosStatusKpis({
    total_parceiros: '33',
    total_parceiros_ativos: 33,
    cadastros_alunos_total: 28,
    cadastros_alunos_ativos: 28,
    cadastros_alunos_inativos: 0,
    total_professores: 0,
    total_professores_ativos: 0,
    total_professores_inativos: 0,
    matriculas_ativas: null,
    alunos_com_matricula_ativa: null,
    parcelas_em_atraso: null,
  });
  assert.equal(metrics.cadastrosAlunosAtivos, 28);
  assert.doesNotThrow(() => assertAlunosStatusAccess(metrics, 'PARCEIROS'));
  assert.throws(() => assertAlunosStatusAccess(metrics, 'FINANCEIRO'), /não autorizados/);
  assert.throws(() => normalizeAlunosStatusKpis({ parcelas_em_atraso: -1 }), /Indicador inválido/);
  assert.throws(() => normalizeAlunosStatusKpis({ matriculas_ativas: 1.5 }), /Indicador inválido/);
  assert.throws(() => normalizeAlunosStatusKpis({ matriculas_ativas: '' }), /Indicador inválido/);
  assert.throws(() => normalizeAlunosStatusKpis({ matriculas_ativas: true }), /Indicador inválido/);
});
