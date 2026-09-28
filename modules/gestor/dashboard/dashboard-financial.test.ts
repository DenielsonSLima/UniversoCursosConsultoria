import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mapDashboardFinancialRadar } from './dashboard-financial.mapper.ts';
import {
  formatDashboardCanonicalCurrency,
  getDashboardCompetencia,
} from './dashboard.presentation.ts';

const canonicalPayload = () => ({
  versao: 1,
  competencia: '2026-09-01',
  periodo_inicio: '2026-09-01',
  periodo_fim_exclusivo: '2026-10-01',
  data_corte: '2026-09-27',
  escopo_tipo: 'POLO',
  polo_id: '44444444-4444-4444-4444-444444444444',
  criterio: 'POSICAO_REEXPRESSA_NO_CORTE',
  contas_competencia: { valor: '1250.50', quantidade: 8 },
  pagas_competencia: { valor: '500.00', quantidade: 3 },
  a_vencer_competencia: { valor: '550.50', quantidade: 4 },
  em_atraso: { valor: '200.00', quantidade: 1, data_mais_antiga: '2026-09-20' },
  agenda_financeira: {
    hoje: { data: '2026-09-27', valor: '100.00', quantidade: 1 },
    proximos_sete_dias: {
      periodo_inicio: '2026-09-28',
      periodo_fim_exclusivo: '2026-10-05',
      valor: '450.50',
      quantidade: 3,
    },
    dias: Array.from({ length: 8 }, (_, index) => ({
      data: `2026-${index < 4 ? '09' : '10'}-${String(index < 4 ? 27 + index : index - 3).padStart(2, '0')}`,
      valor: index === 0 ? '100.00' : '0.00',
      quantidade: index === 0 ? 1 : 0,
    })),
  },
});

test('mapeia o contrato canônico do Radar financeiro sem recalcular valores', () => {
  const radar = mapDashboardFinancialRadar(canonicalPayload());

  assert.equal(radar.competencia, '2026-09-01');
  assert.deepEqual(radar.contasCompetencia, { valor: '1250.50', quantidade: 8 });
  assert.deepEqual(radar.pagasCompetencia, { valor: '500.00', quantidade: 3 });
  assert.equal(radar.emAtraso.dataMaisAntiga, '2026-09-20');
  assert.equal(radar.agendaFinanceira.proximosSeteDias.periodoFimExclusivo, '2026-10-05');
  assert.equal(radar.agendaFinanceira.dias.length, 8);
});

test('rejeita valor monetário e contagem fora do contrato', () => {
  const invalidAmount = canonicalPayload();
  invalidAmount.em_atraso.valor = '-1.00';
  assert.throws(() => mapDashboardFinancialRadar(invalidAmount), /contas em atraso inválido/);

  const invalidCount = canonicalPayload();
  invalidCount.agenda_financeira.hoje.quantidade = -1;
  assert.throws(() => mapDashboardFinancialRadar(invalidCount), /vencimentos de hoje.quantidade inválido/);

  const invalidDays = canonicalPayload();
  invalidDays.agenda_financeira.dias = invalidDays.agenda_financeira.dias.slice(0, 7);
  assert.throws(() => mapDashboardFinancialRadar(invalidDays), /agenda diária incompleta/);
});

test('rejeita resposta de outro polo ou competência', () => {
  const request = {
    poloId: '44444444-4444-4444-4444-444444444444',
    competencia: '2026-09-01',
  };
  assert.doesNotThrow(() => mapDashboardFinancialRadar(canonicalPayload(), request));
  assert.throws(
    () => mapDashboardFinancialRadar(canonicalPayload(), { ...request, poloId: 'polo-b' }),
    /escopo diferente do solicitado/,
  );
  assert.throws(
    () => mapDashboardFinancialRadar(canonicalPayload(), { ...request, competencia: '2026-10-01' }),
    /escopo diferente do solicitado/,
  );
});

test('formata decimal textual sem perder centavos acima do limite seguro', () => {
  assert.equal(
    formatDashboardCanonicalCurrency('9007199254740993.07'),
    'R$ 9.007.199.254.740.993,07',
  );
  assert.equal(getDashboardCompetencia(new Date(2026, 8, 27, 23, 30)), '2026-09-01');
});

test('consulta canônica permanece disponível sem montar o Radar no Início', () => {
  const serviceSource = readFileSync(new URL('./dashboard-financial.service.ts', import.meta.url), 'utf8');
  const querySource = readFileSync(new URL('./dashboard.queries.ts', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('./DashboardPage.tsx', import.meta.url), 'utf8');

  assert.match(serviceSource, /rpc\('get_caixa_contas_pagar_resumo_secure'/);
  assert.match(serviceSource, /p_polo_id: poloId/);
  assert.match(serviceSource, /p_competencia: competencia/);
  assert.match(serviceSource, /mapDashboardFinancialRadar\(data, \{ poloId, competencia \}\)/);
  assert.match(querySource, /financialRadar: \(poloId: string, competencia: string\)/);
  assert.match(querySource, /staleTime: 15_000/);
  assert.doesNotMatch(pageSource, /dashboardFinancialRadarQueryOptions|useDashboardFinancialRealtime|DashboardFinancialRadar/);
  assert.match(pageSource, /payablesDestination = canAccessDashboardPayables\(permissions\)/);
  assert.match(pageSource, /financialShortcutDestination/);
  assert.match(pageSource, /onNavigate\?\.\(financialShortcutDestination\)/);
});

test('Radar financeiro não transforma contas em eventos do calendário', () => {
  const radarSource = readFileSync(new URL('./components/DashboardFinancialRadar.tsx', import.meta.url), 'utf8');
  const pageSource = readFileSync(new URL('./DashboardPage.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(radarSource, /calendarioService|CalendarEvent|addEvent/);
  assert.match(pageSource, /<DashboardOfficialCalendar/);
  assert.match(pageSource, /events=\{officialEvents\}/);
  assert.match(pageSource, /hasQuickActionsContent/);
});
