import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationPath = new URL(
  '../supabase/migrations/20260727044535_banese_reconciliation_control_center.sql',
  import.meta.url,
);
const profileExpansionMigrationPath = new URL(
  '../supabase/migrations/20260727051725_expand_banese_reconciliation_profiles_and_runs_history.sql',
  import.meta.url,
);
const historyHardeningMigrationPath = new URL(
  '../supabase/migrations/20260727052716_harden_banese_reconciliation_history_windows.sql',
  import.meta.url,
);
const healthGuardMigrationPath = new URL(
  '../supabase/migrations/20260727053253_finalize_banese_reconciliation_health_guards.sql',
  import.meta.url,
);
const priorityProfilesMigrationPath = new URL(
  '../supabase/migrations/20260727055539_expand_banese_profiles_priority_and_safe_fallback.sql',
  import.meta.url,
);
const profilePolicyMigrationPath = new URL(
  '../supabase/migrations/20260727061428_harden_banese_autopilot_p10_and_worker_fencing.sql',
  import.meta.url,
);
const baneseConsolePath = new URL(
  '../modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx',
  import.meta.url,
);
const rootHtmlPath = new URL('../index.html', import.meta.url);
const financialCycleMigrationPath = new URL(
  '../supabase/migrations/20260727045711_use_configured_installments_in_financial_cycles.sql',
  import.meta.url,
);
const workerPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/index.ts',
  import.meta.url,
);
const boletoAdapterPath = new URL(
  '../supabase/functions/banese/core/adapter/boleto.ts',
  import.meta.url,
);
const authAdapterPath = new URL(
  '../supabase/functions/banese/core/adapter/auth.ts',
  import.meta.url,
);
const eadModalPath = new URL(
  '../modules/ead/components/EadPaymentModal.tsx',
  import.meta.url,
);

const [migration, profileExpansionMigration, historyHardeningMigration, healthGuardMigration, priorityProfilesMigration, profilePolicyMigration, financialCycleMigration, worker, boletoAdapter, authAdapter, eadModal, baneseConsole, rootHtml] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(profileExpansionMigrationPath, 'utf8'),
  readFile(historyHardeningMigrationPath, 'utf8'),
  readFile(healthGuardMigrationPath, 'utf8'),
  readFile(priorityProfilesMigrationPath, 'utf8'),
  readFile(profilePolicyMigrationPath, 'utf8'),
  readFile(financialCycleMigrationPath, 'utf8'),
  readFile(workerPath, 'utf8'),
  readFile(boletoAdapterPath, 'utf8'),
  readFile(authAdapterPath, 'utf8'),
  readFile(eadModalPath, 'utf8'),
  readFile(baneseConsolePath, 'utf8'),
  readFile(rootHtmlPath, 'utf8'),
]);

test('preserva a escada conservadora e o histórico paginado da versão anterior', () => {
  for (const [id, rate] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 8], [8, 10]]) {
    assert.match(profileExpansionMigration, new RegExp(`\\(${id}, '[^']+', ${rate}, ${rate * 2}, 'CONSERVATIVE', null, true`));
  }
  assert.match(profileExpansionMigration, /get_banese_reconciliation_runs_page/);
  assert.match(historyHardeningMigration, /generate_series\(/);
  assert.match(historyHardeningMigration, /interval '10 minutes'/);
  assert.match(historyHardeningMigration, /'minutesPerPage', 60/);
  assert.match(historyHardeningMigration, /get_banese_reconciliation_error_summary/);
  assert.match(historyHardeningMigration, /set sicredi_reference_percent = null/);
  assert.match(historyHardeningMigration, /Falha isolada: perfil mantido e contagem de estabilidade reiniciada/);
  assert.match(healthGuardMigration, /v_status = 'SUCCESS'/);
  assert.match(healthGuardMigration, /v_checked > 0/);
  assert.match(healthGuardMigration, /Execução sem resultado válido/);
  assert.match(healthGuardMigration, /created_at >= now\(\) - interval '1 hour'/);
});

test('separa testes gerais, prioridade de vencimento e perfis aguardando Banese', () => {
  for (const [id, rate] of [[9, 30], [10, 60], [11, 90], [12, 150]]) {
    assert.match(priorityProfilesMigration, new RegExp(`\\(${id}, '[^']+', ${rate}, ${rate * 2}, 'REAL_TEST'`));
  }
  for (const [id, rate] of [[13, 10], [14, 30], [15, 60], [16, 100]]) {
    assert.match(priorityProfilesMigration, new RegExp(`\\(${id}, '[^']+', ${rate}, ${rate * 2}, 'PRIORITY_WINDOW'`));
  }
  for (const [id, requests] of [[17, 300], [18, 450], [19, 600], [20, 750]]) {
    assert.match(priorityProfilesMigration, new RegExp(`\\(${id}, '[^']+', [0-9]+, ${requests}, 'AWAITING_BANESE'`));
  }
  assert.match(priorityProfilesMigration, /queue\.modality = 'EAD'/);
  assert.match(profilePolicyMigration, /v_today date := \(now\(\) at time zone 'America\/Maceio'\)::date/);
  assert.match(profilePolicyMigration, /when v_from_profile >= 9 then 8/);
  assert.match(profilePolicyMigration, /v_status <> 'SUCCESS'/);
  assert.match(profilePolicyMigration, /v_config\.version = v_run\.config_version/);
  assert.match(profilePolicyMigration, /v_from_profile < 10/);
  assert.match(profilePolicyMigration, /v_required := greatest\(20, v_profile\.titles_per_minute \* 10\)/);
  assert.match(profilePolicyMigration, /id between 9 and 10[\s\S]+automatic_selectable/);
  assert.match(profilePolicyMigration, /id between 17 and 20[\s\S]+not selectable[\s\S]+not automatic_selectable/);
  assert.match(profilePolicyMigration, /group_name = 'AWAITING_BANESE'/);
});

test('console Banese mantém tipografia nítida e amostra dinâmica', () => {
  assert.match(baneseConsole, /O avanço do P\$\{autopilot\.currentProfileId\}/);
  assert.doesNotMatch(baneseConsole, /No P2, portanto/);
  assert.match(rootHtml, /#root \.banese-console/);
  assert.match(rootHtml, /font-size: 0\.75rem !important/);
  assert.match(rootHtml, /-webkit-font-smoothing: auto/);
  assert.match(rootHtml, /#root \.banese-console \.font-black/);
  assert.match(rootHtml, /font-weight: 700 !important/);
});

test('agenda um único ciclo por minuto e desativa a reserva legada', () => {
  assert.match(migration, /'banese-reconciliation-every-minute',\s+'\* \* \* \* \*'/);
  assert.match(migration, /select null::uuid\s+where false/);
  assert.match(migration, /claim_banese_reconciliation_batch_v2/);
});

test('worker consulta títulos existentes sem importar ou sincronizar parcelas futuras', () => {
  assert.doesNotMatch(worker, /syncRouteAwareFutureInstallments/);
  assert.doesNotMatch(worker, /futureSyncQueue|futureRecovered|projectionRetried/);
  assert.match(worker, /queryBaneseBoleto/);
  assert.match(worker, /record_banese_reconciliation_attempt/);
  assert.match(worker, /halted = true/);
  assert.match(worker, /queryDeadline = startedAt \+ 40_000/);
  assert.match(worker, /hardDeadline = startedAt \+ 50_000/);
  assert.match(worker, /batchController = new globalThis\.AbortController/);
  assert.match(worker, /cancelledByPeer/);
  assert.match(worker, /SUPABASE_AUDIT_WRITE/);
  assert.match(worker, /Math\.min\(8, Number\(runConfig\.maxConcurrency/);
  assert.match(boletoAdapter, /signal: input\.signal/);
  assert.match(authAdapter, /options: \{ signal\?: AbortSignal \}/);
});

test('ciclo técnico usa a quantidade configurada e não fixa doze parcelas', () => {
  assert.match(financialCycleMigration, /v_parcelas_por_ciclo := v_turma\.qtd_parcelas/);
  assert.match(financialCycleMigration, /FOR v_numero IN 1\.\.v_parcelas_por_ciclo/);
  assert.doesNotMatch(
    financialCycleMigration,
    /v_parcelas_por_ciclo\s+CONSTANT\s+INTEGER\s*:=\s*12/,
  );
  assert.match(financialCycleMigration, /v_pagas_ciclo <> v_total_ciclo/);
  assert.match(financialCycleMigration, /v_numeros_distintos <> v_total_ciclo/);
  assert.match(financialCycleMigration, /v_primeiro_numero <> 1/);
  assert.match(financialCycleMigration, /v_ultimo_numero <> v_total_ciclo/);
});

test('OAuth é compartilhado por ambiente e não é persistido em logs operacionais', () => {
  assert.match(worker, /tokenCache = new Map<Environment, CachedToken>/);
  assert.match(worker, /tokenRequests = new Map<Environment, Promise<BaneseAccessToken>>/);
  assert.match(worker, /oauthReused/);
  assert.doesNotMatch(worker, /console\.(?:log|error)\([^)]*accessToken/);
  assert.doesNotMatch(worker, /gateway_last_error:\s*(?:message|safeError)/);
});

test('aviso EAD orienta Pix e boleto sem botão Já paguei', () => {
  assert.match(eadModal, /Aguardando confirmação do Banese/);
  assert.match(eadModal, /até 20 minutos/);
  assert.match(eadModal, /48 horas úteis/);
  assert.doesNotMatch(eadModal, /Já paguei/i);
});
