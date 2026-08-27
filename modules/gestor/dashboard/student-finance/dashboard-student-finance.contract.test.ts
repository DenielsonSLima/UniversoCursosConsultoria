import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const modalSource = read('modules/gestor/dashboard/components/DashboardQuickActionsModal.tsx');
const resultsSource = read('modules/gestor/dashboard/student-finance/DashboardStudentFinanceResults.tsx');
const modelSource = read(
  'modules/gestor/dashboard/student-finance/dashboard-student-finance.model.ts',
);
const accessSource = read(
  'modules/gestor/dashboard/student-finance/dashboard-student-finance.access.ts',
);
const searchServiceSource = read(
  'modules/gestor/dashboard/student-finance/dashboard-student-finance.service.ts',
);
const settlementSource = read('modules/gestor/dashboard/student-finance/useDashboardStudentSettlement.ts');
const financeiroServiceSource = read('modules/gestor/financeiro/financeiro.service.ts');
const asaasServiceSource = read('modules/asaas/asaas.service.ts');
const migrationSql = read(
  'supabase/migrations/20260826232000_expand_dashboard_student_finance_search.sql',
);

test('modal reutiliza a confirmação canônica e mantém matrícula fora da baixa rápida', () => {
  assert.match(modalSource, /ManualSettlementModal/);
  assert.match(modalSource, /canSettleStudentFinance/);
  assert.match(resultsSource, /settlementBlock === null/);
  assert.match(
    resultsSource,
    /Baixa de matrícula deve ser realizada|dashboardSettlementGuidance/,
  );
});

test('busca da ação rápida não reutiliza cache com contrato legado do Resumo', () => {
  assert.match(modalSource, /dashboardStudentFinanceSearchKey/);
  assert.match(searchServiceSource, /\.\.\.financeiroQueryKeys\.alunoReceivables/);
  assert.match(searchServiceSource, /dashboard-existing-title-v1/);
  assert.doesNotMatch(modalSource, /alunoReceivablesSearch/);
});

test('visibilidade deriva das abas Financeiro Resumo e Receber sem permissão paralela', () => {
  assert.match(accessSource, /canAccessGestorModule\(permissions, 'financeiro'\)/);
  assert.match(accessSource, /canAccessFinanceiroTab\(permissions, 'resumo'\)/);
  assert.match(accessSource, /canAccessFinanceiroTab\(permissions, 'receber'\)/);
  assert.doesNotMatch(accessSource, /secretaria|carnes-alunos/);
});

test('ação de confirmação chama somente a baixa financeira canônica', () => {
  assert.equal(
    settlementSource.match(/financeiroService\.markReceivablePaid/g)?.length,
    2,
    'uma referência executável e uma referência apenas de tipo são esperadas',
  );
  assert.doesNotMatch(
    settlementSource,
    /syncReceivable|refreshReceivableStatus|generateOfficialCarnet|gestorBanesePaymentService|reverseManualSettlement/,
  );
  assert.doesNotMatch(settlementSource, /gatewayPaymentId|asaasPaymentId/);
  assert.match(
    modelSource,
    /DASHBOARD_EXISTING_TITLE_ONLY/,
  );
  assert.match(
    settlementSource,
    /settlementContext: DASHBOARD_EXISTING_TITLE_SETTLEMENT_CONTEXT/,
  );
  assert.match(
    financeiroServiceSource,
    /markReceivablePaid\([\s\S]*?return asaasIntegrationService\.settleInPerson\(id, params\);/,
  );
  assert.match(
    asaasServiceSource,
    /'manual-settlement', \{ receivableId, \.\.\.params \}/,
  );
  assert.match(settlementSource, /futureSyncSuppressed/);
  assert.match(settlementSource, /financeiroQueryKeys\.alunoReceivables/);
  assert.match(
    settlementSource,
    /onError: async \(error, \{ receivable \}\)[\s\S]*?invalidateSettlementCaches\(receivable\)/,
  );
  assert.match(settlementSource, /if \(mutation\.isPending\) return/);
});

test('migration local preserva busca normalizada, escopo e mínimo privilégio', () => {
  assert.match(migrationSql, /SECURITY DEFINER[\s\S]*?SET search_path = ''/);
  assert.match(migrationSql, /\(SELECT auth\.uid\(\)\)/);
  assert.match(migrationSql, /\(SELECT auth\.jwt\(\) ->> 'role'\)/);
  assert.doesNotMatch(migrationSql, /auth\.role\(\)/);
  assert.match(migrationSql, /public\.is_gestor_global\(\)/);
  assert.match(migrationSql, /public\.is_gestor_for_polo\(p_polo_id\)/);
  assert.match(
    migrationSql,
    /gestor_has_effective_financeiro_tab\('resumo'\)[\s\S]*?OR public\.gestor_has_effective_financeiro_tab\('receber'\)/,
  );
  assert.doesNotMatch(migrationSql, /public\.gestor_has_financeiro_tab\(/);
  assert.match(migrationSql, /public\.financeiro_normalize_search_text/);
  assert.match(migrationSql, /receivable\.matricula_id/);
  assert.match(migrationSql, /receivable\.turma_id/);
  assert.match(migrationSql, /receivable\.tipo_lancamento/);
  assert.match(migrationSql, /receivable\.gateway_provider/);
  assert.doesNotMatch(
    migrationSql,
    /^\s+receivable\.(?:gateway_payment_id|gateway_payment_link_id|asaas_payment_id|asaas_payment_link_id)\s*,\s*$/m,
  );
  assert.match(migrationSql, /LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 50\), 1\), 50\)/);
  assert.match(migrationSql, /REVOKE ALL[\s\S]*?FROM PUBLIC, anon/);
  assert.match(migrationSql, /GRANT EXECUTE[\s\S]*?TO authenticated, service_role/);
  assert.doesNotMatch(migrationSql, /CREATE (?:UNIQUE )?INDEX/i);
});
