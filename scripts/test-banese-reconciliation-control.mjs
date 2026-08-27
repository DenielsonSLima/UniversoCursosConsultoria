import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
const activeProfilePolicyMigrationPath = new URL(
  '../supabase/migrations/20260827005500_define_banese_automatic_p3_p9_policy.sql',
  import.meta.url,
);
const atomicReservationMigrationPath = new URL(
  '../supabase/migrations/20260813034453_prepare_banese_reconciliation_batch_atomically.sql',
  import.meta.url,
);
const entrypointHardeningMigrationPath = new URL(
  '../supabase/migrations/20260813041928_harden_banese_reconciliation_entrypoints.sql',
  import.meta.url,
);
const baneseConsolePath = new URL(
  '../modules/gestor/configuracoes/consulta-api-banese/ConsultaApiBaneseConfig.tsx',
  import.meta.url,
);
const baneseAutopilotProgressPath = new URL(
  '../modules/gestor/configuracoes/consulta-api-banese/BaneseAutopilotProgress.tsx',
  import.meta.url,
);
const rootStylesPath = new URL('../styles.css', import.meta.url);
const financialCycleMigrationPath = new URL(
  '../supabase/migrations/20260727045711_use_configured_installments_in_financial_cycles.sql',
  import.meta.url,
);
const workerPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/index.ts',
  import.meta.url,
);
const workerPacingPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/pacing.ts',
  import.meta.url,
);
const workerPacingTestPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/pacing.test.ts',
  import.meta.url,
);
const workerRequestGuardsTestPath = new URL(
  '../supabase/functions/banese-reconciliation-worker/request-guards.test.ts',
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

const [migration, profileExpansionMigration, historyHardeningMigration, healthGuardMigration, priorityProfilesMigration, profilePolicyMigration, activeProfilePolicyMigration, atomicReservationMigration, entrypointHardeningMigration, financialCycleMigration, worker, workerPacing, boletoAdapter, authAdapter, eadModal, baneseConsole, baneseAutopilotProgress, rootStyles] = await Promise.all([
  readFile(migrationPath, 'utf8'),
  readFile(profileExpansionMigrationPath, 'utf8'),
  readFile(historyHardeningMigrationPath, 'utf8'),
  readFile(healthGuardMigrationPath, 'utf8'),
  readFile(priorityProfilesMigrationPath, 'utf8'),
  readFile(profilePolicyMigrationPath, 'utf8'),
  readFile(activeProfilePolicyMigrationPath, 'utf8'),
  readFile(atomicReservationMigrationPath, 'utf8'),
  readFile(entrypointHardeningMigrationPath, 'utf8'),
  readFile(financialCycleMigrationPath, 'utf8'),
  readFile(workerPath, 'utf8'),
  readFile(workerPacingPath, 'utf8'),
  readFile(boletoAdapterPath, 'utf8'),
  readFile(authAdapterPath, 'utf8'),
  readFile(eadModalPath, 'utf8'),
  readFile(baneseConsolePath, 'utf8'),
  readFile(baneseAutopilotProgressPath, 'utf8'),
  readFile(rootStylesPath, 'utf8'),
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

test('preserva como histórico a política P10 que antecedeu a faixa ativa', () => {
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

test('política ativa limita o automático a P3-P9 e mantém rollback gradual', () => {
  assert.match(activeProfilePolicyMigration, /set automatic_selectable = id between 3 and 9/i);
  assert.match(
    activeProfilePolicyMigration,
    /banese_reconciliation_config_automatic_range_check check[\s\S]+selected_profile_id = 9[\s\S]+effective_profile_id between 3 and 9[\s\S]+last_stable_profile_id between 3 and 9/i,
  );
  assert.match(
    activeProfilePolicyMigration,
    /v_new_target constant text :=[\s\S]+v_target_profile := case when v_mode = 'AUTOMATIC' then 9 else p_profile_id end/i,
  );
  assert.match(
    activeProfilePolicyMigration,
    /when v_mode = 'AUTOMATIC' then 3[\s\S]+v_new_rollback constant text :=[\s\S]+when v_config\.mode = 'AUTOMATIC' then greatest\([\s\S]+3,[\s\S]+least\([\s\S]+9,/i,
  );
  assert.match(
    activeProfilePolicyMigration,
    /v_to_profile := least\(9, v_config\.selected_profile_id, v_from_profile \+ 1\)/i,
  );
  assert.match(
    activeProfilePolicyMigration,
    /Teste temporário expirado; reinício no P3 com teto automático P9/i,
  );
});

test('console Banese mantém tipografia nítida e amostra dinâmica', () => {
  assert.match(baneseAutopilotProgress, /O avanço do P\$\{autopilot\.currentProfileId\}/);
  assert.doesNotMatch(baneseAutopilotProgress, /No P2, portanto/);
  assert.match(rootStyles, /#root \.banese-console/);
  assert.match(rootStyles, /font-size: 0\.75rem !important/);
  assert.match(rootStyles, /-webkit-font-smoothing: auto/);
  assert.match(rootStyles, /#root \.banese-console \.font-black/);
  assert.match(rootStyles, /font-weight: 700 !important/);
});

test('agenda um único ciclo por minuto e desativa a reserva legada', () => {
  assert.match(migration, /'banese-reconciliation-every-minute',\s+'\* \* \* \* \*'/);
  assert.match(migration, /select null::uuid\s+where false/);
  assert.match(migration, /claim_banese_reconciliation_batch_v2/);
});

test('reserva títulos antes de criar execução e ignora fila vazia sem histórico', () => {
  assert.match(atomicReservationMigration, /prepare_banese_reconciliation_batch_v3/);
  assert.match(atomicReservationMigration, /pg_advisory_xact_lock/);
  assert.match(atomicReservationMigration, /FOR UPDATE OF locked_queue SKIP LOCKED/);
  assert.match(atomicReservationMigration, /WHERE EXISTS \(SELECT 1 FROM candidates\)/);
  assert.match(atomicReservationMigration, /'NO_CLAIMABLE_TITLES'/);
  assert.match(atomicReservationMigration, /'Reserva Banese inconsistente; a transação foi revertida\.'/);
  assert.match(atomicReservationMigration, /SET search_path = ''/);
  assert.match(atomicReservationMigration, /REVOKE ALL ON FUNCTION public\.prepare_banese_reconciliation_batch_v3\(\)[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(atomicReservationMigration, /GRANT EXECUTE ON FUNCTION public\.prepare_banese_reconciliation_batch_v3\(\)[\s\S]+TO service_role/);
  assert.match(worker, /prepare_banese_reconciliation_batch_v3/);
  assert.doesNotMatch(worker, /begin_banese_reconciliation_run/);
  assert.doesNotMatch(worker, /claim_banese_reconciliation_batch_v2/);
  assert.match(worker, /PREPARE_CONTRACT_ERROR/);
  assert.match(worker, /typeof runConfig\.enabled !== "boolean"/);
  assert.match(worker, /runConfig\.enabled === false/);
  assert.match(worker, /Array\.isArray\(runConfig\.items\)/);
  assert.match(entrypointHardeningMigration, /prepare_banese_reconciliation_batch_v3\(\)[\s\S]+SECURITY INVOKER/);
  assert.match(entrypointHardeningMigration, /prune_banese_reconciliation_no_work_runs\(\)[\s\S]+SECURITY INVOKER/);
  assert.match(entrypointHardeningMigration, /begin_banese_reconciliation_run\(\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(entrypointHardeningMigration, /claim_banese_reconciliation_batch_v2\(uuid\)[\s\S]+FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(entrypointHardeningMigration, /banese_reconciliation_runs_no_work_retention_idx/);
});

test('worker consulta títulos existentes sem importar ou sincronizar parcelas futuras', () => {
  assert.doesNotMatch(worker, /syncRouteAwareFutureInstallments/);
  assert.doesNotMatch(worker, /futureSyncQueue|futureRecovered|projectionRetried/);
  assert.match(worker, /queryBaneseBoleto/);
  assert.match(worker, /record_banese_reconciliation_attempt/);
  assert.match(worker, /halted = true/);
  assert.match(worker, /createLaunchPacing\(startedAt, Date\.now\(\), targetTitles\)/);
  assert.match(worker, /scheduledLaunchAt\(pacing, index\)/);
  assert.match(worker, /canLaunchAt\(pacing, Date\.now\(\)\)/);
  assert.match(workerPacing, /QUERY_DEADLINE_MS = 40_000/);
  assert.match(workerPacing, /HARD_DEADLINE_MS = 50_000/);
  assert.match(workerPacing, /LAUNCH_DRIFT_MARGIN_MS = 2_000/);
  assert.match(workerPacing, /pacedWindowMs \/ boundedTarget/);
  assert.match(worker, /batchController = new globalThis\.AbortController/);
  assert.match(worker, /cancelledByPeer/);
  assert.match(worker, /SUPABASE_AUDIT_WRITE/);
  assert.match(worker, /Math\.min\(8, Number\(runConfig\.maxConcurrency/);
  assert.match(boletoAdapter, /signal: input\.signal/);
  assert.match(authAdapter, /options: \{ signal\?: AbortSignal \}/);
});

test('pacing e autenticação customizada executam no gate do domínio', () => {
  const result = spawnSync(
    'deno',
    [
      'test',
      fileURLToPath(workerPacingTestPath),
      fileURLToPath(workerRequestGuardsTestPath),
    ],
    { encoding: 'utf8' },
  );
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n');

  assert.ifError(result.error);
  assert.equal(result.status, 0, output);
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
