import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260727194721_standardize_technical_financial_cycle_without_gateway.sql',
  import.meta.url,
);
const cycleMigrationPath = new URL(
  '../supabase/migrations/20260727045711_use_configured_installments_in_financial_cycles.sql',
  import.meta.url,
);
const percentageFineMigrationPath = new URL(
  '../supabase/migrations/20260727201226_use_percentage_fine_for_technical_monthly_installments.sql',
  import.meta.url,
);
const interestCorrectionMigrationPath = new URL(
  '../supabase/migrations/20260727202149_correct_technical_interest_to_one_percent_daily.sql',
  import.meta.url,
);
const discountCorrectionMigrationPath = new URL(
  '../supabase/migrations/20260727203609_standardize_technical_discount_to_nineteen_ninety.sql',
  import.meta.url,
);
const technicalFormPath = new URL(
  '../modules/gestor/gestao/components/forms/TurmaTecnicoForm.tsx',
  import.meta.url,
);
const financialConfigPath = new URL(
  '../modules/gestor/gestao/tecnicos/detalhes/components/financeiro/financeiro-config.service.ts',
  import.meta.url,
);
const gestaoServicePath = new URL(
  '../modules/gestor/gestao/gestao.service.ts',
  import.meta.url,
);
const financialEditorPath = new URL(
  '../modules/gestor/gestao/tecnicos/detalhes/components/financeiro/FinanceiroConfigEditor.tsx',
  import.meta.url,
);
const enrollmentModalPath = new URL(
  '../modules/gestor/gestao/tecnicos/detalhes/components/alunos/ConfirmarMatriculaModal.tsx',
  import.meta.url,
);
const inPersonFormPath = new URL(
  '../modules/gestor/gestao/components/forms/TurmaPresencialForm.tsx',
  import.meta.url,
);

const [
  migration,
  cycleMigration,
  percentageFineMigration,
  interestCorrectionMigration,
  discountCorrectionMigration,
  technicalForm,
  financialConfig,
  gestaoService,
  financialEditor,
  enrollmentModal,
  inPersonForm,
] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(cycleMigrationPath, 'utf8'),
  readFile(percentageFineMigrationPath, 'utf8'),
  readFile(interestCorrectionMigrationPath, 'utf8'),
  readFile(discountCorrectionMigrationPath, 'utf8'),
  readFile(technicalFormPath, 'utf8'),
  readFile(financialConfigPath, 'utf8'),
  readFile(gestaoServicePath, 'utf8'),
  readFile(financialEditorPath, 'utf8'),
  readFile(enrollmentModalPath, 'utf8'),
  readFile(inPersonFormPath, 'utf8'),
]);

test('padroniza todas as turmas e matrículas técnicas sem alterar recebíveis', () => {
  assert.match(migration, /valor_matricula = 150\.00/);
  assert.match(migration, /valor_rematricula = 150\.00/);
  assert.match(migration, /qtd_parcelas = 12/);
  assert.match(migration, /valor_parcela = 279\.90/);
  assert.match(migration, /gerar_cobrancas_futuras = TRUE/);
  assert.match(migration, /gerar_cobranca_inicial = TRUE/);
  assert.match(migration, /gerar_cobranca_futura = TRUE/);
  assert.match(migration, /sincronizar_asaas_futuro = FALSE/);
  assert.match(migration, /sincronizar_asaas = FALSE/);
  assert.match(migration, /IN \('TECNICO', 'TÉCNICO'\)/);
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE)\s+public\.contas_receber/i);
  assert.match(migration, /AS technical_class_count/i);
  assert.match(
    migration,
    /v_turmas_tecnicas <> v_guard\.technical_class_count/i,
  );
  assert.doesNotMatch(migration, /v_turmas_tecnicas <> 9/);
  assert.match(migration, /v_turmas_invalidas <> 0/);
  assert.match(migration, /v_matriculas_invalidas <> 0/);
  assert.match(migration, /JSONB_ARRAY_LENGTH\([\s\S]+?\) <> 14/);
  assert.match(migration, /v_receivables_fingerprint <> v_guard\.receivables_fingerprint/);
  assert.match(migration, /gateway_identity_count/);
});

test('aceita vencimento de 1 a 31 e ajusta apenas ao último dia do mês', () => {
  assert.match(migration, /p_dia_vencimento, 0\) NOT BETWEEN 1 AND 31/);
  assert.match(migration, /LEAST\(p_dia_vencimento, v_last_day\)/);
  assert.doesNotMatch(
    migration,
    /build_gestao_financial_schedule\([\s\S]*LEAST\([^,]*dia_vencimento[^,]*,\s*28\)/,
  );
  for (const source of [financialEditor, enrollmentModal, inPersonForm]) {
    assert.match(source, /Array\.from\(\{ length: 31 \}/);
  }
});

test('mantém o encadeamento idempotente do ciclo no backend', () => {
  assert.match(
    cycleMigration,
    /ON CONFLICT \(matricula_id, origem_cronograma_id\)[\s\S]+DO NOTHING/,
  );
  assert.match(cycleMigration, /v_parcelas_por_ciclo := v_turma\.qtd_parcelas/);
  assert.match(cycleMigration, /v_pagas_ciclo <> v_total_ciclo/);
  assert.match(cycleMigration, /tipo_lancamento = 'REMATRICULA'/);
});

test('novas turmas técnicas herdam o padrão e não sincronizam gateway', () => {
  assert.match(technicalForm, /gerarCobrancasFuturas: true/);
  assert.match(technicalForm, /sincronizarAsaasFuturo: false/);
  assert.match(financialConfig, /valorMatricula: 150\.00/);
  assert.match(financialConfig, /valorRematricula: 150\.00/);
  assert.match(financialConfig, /qtdParcelas: 12/);
  assert.match(financialConfig, /valorParcela: 279\.90/);
  assert.match(gestaoService, /isTechnical \? 150 : 100/);
  assert.match(gestaoService, /isTechnical \? 12 : 1/);
  assert.match(gestaoService, /isTechnical \? 279\.90 : 0/);
  assert.match(gestaoService, /isTechnical \? false : true/);
});

test('introduz a multa percentual somente nas mensalidades técnicas', () => {
  assert.match(percentageFineMigration, /multa_atraso_percentual = 2\.00/);
  assert.match(percentageFineMigration, /aplicar_desconto_matricula = FALSE/);
  assert.match(percentageFineMigration, /aplicar_multa_juros_matricula = FALSE/);
  assert.match(percentageFineMigration, /aplicar_desconto_mensalidade = TRUE/);
  assert.match(percentageFineMigration, /aplicar_multa_juros_mensalidade = TRUE/);
  assert.match(percentageFineMigration, /aplicar_desconto_rematricula = FALSE/);
  assert.match(percentageFineMigration, /aplicar_multa_juros_rematricula = FALSE/);
  assert.match(
    percentageFineMigration,
    /CREATE OR REPLACE FUNCTION public\.calculate_gestao_technical_financial_preview/,
  );
  assert.match(percentageFineMigration, /v_preview\.multa_aplicada <> 5\.60/);
  assert.doesNotMatch(
    percentageFineMigration,
    /(?:INSERT INTO|UPDATE)\s+public\.contas_receber/i,
  );
});

test('corrige para um único juros de 1% ao mês proporcional por dia', () => {
  assert.match(interestCorrectionMigration, /juros_atraso = 1\.00/);
  assert.match(interestCorrectionMigration, /v_preview\.juros_calculados <> 2\.80/);
  assert.match(interestCorrectionMigration, /v_preview\.juros_percentual_dia <> 0\.033333/);
  assert.match(interestCorrectionMigration, /v_preview\.juros_valor_dia <> 0\.09/);
  assert.match(interestCorrectionMigration, /v_preview\.multa_aplicada <> 5\.60/);
  assert.match(interestCorrectionMigration, /v_preview\.valor_com_atraso <> 288\.30/);
  assert.doesNotMatch(
    interestCorrectionMigration,
    /(?:INSERT INTO|UPDATE)\s+public\.contas_receber/i,
  );
});

test('padroniza o desconto técnico em R$ 19,90 sem criar recebíveis', () => {
  assert.match(discountCorrectionMigration, /desconto_pontualidade = 19\.90/);
  assert.match(discountCorrectionMigration, /NEW\.desconto_pontualidade := 19\.90/);
  assert.match(discountCorrectionMigration, /v_preview\.valor_com_desconto <> 260\.00/);
  assert.match(discountCorrectionMigration, /v_preview\.juros_valor_dia <> 0\.09/);
  assert.match(discountCorrectionMigration, /v_preview\.multa_aplicada <> 5\.60/);
  assert.match(discountCorrectionMigration, /receivables_fingerprint/);
});
