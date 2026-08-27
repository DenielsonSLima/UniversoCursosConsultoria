import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  p10Policy,
  latestFinish,
  latestFail,
  atomicPrepare,
  hardenedEntrypoints,
  p3P9Policy,
] = await Promise.all([
  readFile(
    new URL('../migrations/20260727061428_harden_banese_autopilot_p10_and_worker_fencing.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260727062857_rollback_banese_profile_on_auth_failure.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260727062448_fix_banese_claim_and_internal_failure_audit.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260813034453_prepare_banese_reconciliation_batch_atomically.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260813041928_harden_banese_reconciliation_entrypoints.sql', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../migrations/20260827005500_define_banese_automatic_p3_p9_policy.sql', import.meta.url),
    'utf8',
  ),
]);

const occurrences = (source: string, literal: string) => (
  source.split(literal).length - 1
);

const patchSection = (signature: string, nextSignature?: string) => {
  const marker = `'public.${signature}'::regprocedure`;
  const start = p3P9Policy.indexOf(marker);
  assert.notEqual(start, -1, `patch de ${signature} ausente`);
  const next = nextSignature
    ? p3P9Policy.indexOf(`'public.${nextSignature}'::regprocedure`, start + marker.length)
    : p3P9Policy.indexOf('\nalter function public.update_banese_reconciliation_config', start);
  return p3P9Policy.slice(start, next === -1 ? p3P9Policy.length : next);
};

const oldConstant = (section: string, name: string) => {
  const marker = `${name} constant text := $old$`;
  const start = section.indexOf(marker);
  assert.notEqual(start, -1, `${name} ausente`);
  const valueStart = start + marker.length;
  const end = section.indexOf('$old$;', valueStart);
  assert.notEqual(end, -1, `fim de ${name} ausente`);
  return section.slice(valueStart, end);
};

test('teste contratual parte das cinco rotas ativas ainda presas ao P10/P8', () => {
  assert.match(p10Policy, /v_target_profile := case when v_mode = 'AUTOMATIC' then 10/i);
  assert.match(p10Policy, /effective_profile_id < 10/i);
  assert.equal(
    occurrences(latestFinish, "selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end"),
    2,
  );
  assert.match(latestFinish, /v_from_profile < 10/i);
  assert.match(latestFail, /selected_profile_id = case when mode = 'MANUAL' then v_to_profile else 10 end/i);
  assert.match(atomicPrepare, /retorno ao P8 com teto automático P10/i);
  assert.match(atomicPrepare, /selected_profile_id = 10/i);
});

test('patch fail-closed corresponde exatamente às definições vigentes', () => {
  const update = patchSection(
    'update_banese_reconciliation_config(text,integer,bigint,text)',
    'finish_banese_reconciliation_run(uuid,integer,boolean,integer)',
  );
  const finish = patchSection(
    'finish_banese_reconciliation_run(uuid,integer,boolean,integer)',
    'fail_banese_reconciliation_run(uuid,text,text,integer)',
  );
  const fail = patchSection(
    'fail_banese_reconciliation_run(uuid,text,text,integer)',
    'get_banese_reconciliation_autopilot_progress()',
  );
  const progress = patchSection(
    'get_banese_reconciliation_autopilot_progress()',
    'prepare_banese_reconciliation_batch_v3()',
  );
  const prepare = patchSection('prepare_banese_reconciliation_batch_v3()');

  assert.equal(occurrences(p10Policy, oldConstant(update, 'v_old_target')), 1);
  assert.equal(occurrences(p10Policy, oldConstant(update, 'v_old_range')), 1);
  assert.equal(occurrences(latestFinish, oldConstant(finish, 'v_old_rollback')), 2);
  assert.equal(occurrences(latestFinish, oldConstant(finish, 'v_old_selected')), 2);
  assert.equal(occurrences(latestFinish, oldConstant(finish, 'v_old_ceiling')), 1);
  assert.equal(occurrences(latestFinish, oldConstant(finish, 'v_old_promotion')), 1);
  assert.equal(occurrences(latestFail, oldConstant(fail, 'v_old_rollback')), 1);
  assert.equal(occurrences(latestFail, oldConstant(fail, 'v_old_selected')), 1);
  assert.equal(occurrences(p10Policy, oldConstant(progress, 'v_old_next')), 1);
  assert.equal(occurrences(p10Policy, oldConstant(progress, 'v_old_eligible')), 1);
  assert.equal(occurrences(atomicPrepare, oldConstant(prepare, 'v_old_expiry')), 1);
});

test('perfis automáticos ficam exatamente em P3-P9 sem retirar seleção manual', () => {
  assert.match(p3P9Policy, /set automatic_selectable = id between 3 and 9/i);
  assert.match(
    p3P9Policy,
    /id between 1 and 2[\s\S]*?and selectable[\s\S]*?and not automatic_selectable/i,
  );
  assert.match(
    p3P9Policy,
    /id between 3 and 8[\s\S]*?and selectable[\s\S]*?and automatic_selectable/i,
  );
  assert.match(
    p3P9Policy,
    /id = 9[\s\S]*?and group_name = 'REAL_TEST'[\s\S]*?and automatic_selectable/i,
  );
  assert.match(
    p3P9Policy,
    /id between 10 and 12[\s\S]*?and selectable[\s\S]*?and not automatic_selectable/i,
  );
  assert.match(
    p3P9Policy,
    /id between 13 and 16[\s\S]*?and selectable[\s\S]*?and not automatic_selectable/i,
  );
  assert.doesNotMatch(p3P9Policy, /set\s+selectable\s*=/i);
});

test('configuração automática é auditada, versionada e protegida pela faixa', () => {
  assert.ok(
    p3P9Policy.indexOf('lock table public.banese_reconciliation_config in exclusive mode')
      < p3P9Policy.indexOf('alter table public.banese_reconciliation_profiles'),
    'configuração deve ser bloqueada antes dos perfis, na mesma ordem usada pelo worker',
  );
  assert.match(p3P9Policy, /'SYSTEM_POLICY'/i);
  assert.match(p3P9Policy, /from_profile_id,[\s\S]*?to_profile_id,[\s\S]*?from_mode,[\s\S]*?to_mode/i);
  assert.match(
    p3P9Policy,
    /set selected_profile_id = 9,[\s\S]*?effective_profile_id = greatest\(3, least\(9, before\.effective_profile_id\)\)/i,
  );
  assert.match(
    p3P9Policy,
    /last_stable_profile_id = greatest\(3, least\(9, before\.last_stable_profile_id\)\)/i,
  );
  assert.match(p3P9Policy, /with before as materialized[\s\S]*?order by config\.environment\s+for update[\s\S]*?normalized as \(\s*update/i);
  assert.match(p3P9Policy, /version = before\.version \+ 1/i);
  assert.match(
    p3P9Policy,
    /banese_reconciliation_config_automatic_range_check check[\s\S]*?mode <> 'AUTOMATIC'[\s\S]*?selected_profile_id = 9[\s\S]*?effective_profile_id between 3 and 9[\s\S]*?last_stable_profile_id between 3 and 9/i,
  );
});

test('RPC administrativo inicia no P3, preserva a faixa e mantém manual intacto', () => {
  assert.match(
    p3P9Policy,
    /v_new_target constant text :=[\s\S]*?v_target_profile := case when v_mode = 'AUTOMATIC' then 9 else p_profile_id end/i,
  );
  assert.match(
    p3P9Policy,
    /when v_mode = 'AUTOMATIC' and v_before\.mode = 'AUTOMATIC'[\s\S]*?greatest\(3, least\(9, effective_profile_id\)\)[\s\S]*?when v_mode = 'AUTOMATIC' then 3/i,
  );
  assert.match(
    p3P9Policy,
    /last_stable_profile_id = case[\s\S]*?when v_mode = 'MANUAL' then v_target_profile[\s\S]*?greatest\(3, least\(9, last_stable_profile_id\)\)/i,
  );
  assert.match(p3P9Policy, /Contrato inesperado em update_banese_reconciliation_config/i);
});

test('finish e fail preservam fallback manual, piso P3 e promoção unitária até P9', () => {
  assert.match(
    p3P9Policy,
    /when v_config\.mode = 'AUTOMATIC' then greatest\([\s\S]*?3,[\s\S]*?least\([\s\S]*?9,[\s\S]*?when v_from_profile >= 9 then 8[\s\S]*?when v_from_profile >= 9 then 8\s+else v_profile\.fallback_profile_id/i,
  );
  assert.match(
    p3P9Policy,
    /v_new_selected constant text :=[\s\S]*?mode = 'MANUAL' then v_to_profile else 9 end/i,
  );
  assert.match(
    p3P9Policy,
    /v_from_profile < least\(9, v_config\.selected_profile_id\)/i,
  );
  assert.match(
    p3P9Policy,
    /v_to_profile := least\(9, v_config\.selected_profile_id, v_from_profile \+ 1\)/i,
  );
  assert.match(
    p3P9Policy,
    /when v_config\.mode = 'AUTOMATIC' then greatest\([\s\S]*?when v_run\.profile_id >= 9 then 8[\s\S]*?when v_run\.profile_id >= 9 then 8\s+else v_profile\.fallback_profile_id/i,
  );
  assert.match(p3P9Policy, /Contrato inesperado em finish_banese_reconciliation_run/i);
  assert.match(p3P9Policy, /Contrato inesperado em fail_banese_reconciliation_run/i);
});

test('progresso não anuncia P10 e teste manual expirado retorna a P3/P9', () => {
  assert.match(
    p3P9Policy,
    /effective_profile_id < least\(9, v_config\.selected_profile_id\)[\s\S]*?then least\(9, v_config\.selected_profile_id, v_config\.effective_profile_id \+ 1\)/i,
  );
  assert.match(
    p3P9Policy,
    /'Teste temporário expirado; reinício no P3 com teto automático P9\.'/i,
  );
  assert.match(
    p3P9Policy,
    /SET mode = 'AUTOMATIC',[\s\S]*?selected_profile_id = 9,[\s\S]*?effective_profile_id = 3,[\s\S]*?last_stable_profile_id = 3/i,
  );
  assert.match(p3P9Policy, /Contrato inesperado em get_banese_reconciliation_autopilot_progress/i);
  assert.match(p3P9Policy, /Contrato inesperado em prepare_banese_reconciliation_batch_v3/i);
});

test('patch de prepare_v3 preserva reserva atômica, lock e menor privilégio', () => {
  assert.match(atomicPrepare, /pg_catalog\.pg_advisory_xact_lock/i);
  assert.match(atomicPrepare, /FOR UPDATE OF locked_queue SKIP LOCKED/i);
  assert.match(atomicPrepare, /created_run AS \([\s\S]*?leased AS \(/i);
  assert.match(p3P9Policy, /pg_get_functiondef\([\s\S]*?prepare_banese_reconciliation_batch_v3/i);
  assert.match(p3P9Policy, /position\('pg_catalog\.pg_advisory_xact_lock' in v_definition\)/i);
  assert.match(p3P9Policy, /position\('FOR UPDATE OF locked_queue SKIP LOCKED' in v_definition\)/i);
  assert.doesNotMatch(p3P9Policy, /create or replace function public\.prepare_banese_reconciliation_batch_v3/i);
  assert.match(hardenedEntrypoints, /ALTER FUNCTION public\.prepare_banese_reconciliation_batch_v3\(\)\s+SECURITY INVOKER/i);
  assert.match(
    p3P9Policy,
    /alter function public\.prepare_banese_reconciliation_batch_v3\(\)\s+security invoker;[\s\S]*?alter function public\.prepare_banese_reconciliation_batch_v3\(\)\s+set search_path = ''/i,
  );
});

test('atributos e grants continuam mínimos em cada entrypoint', () => {
  for (const signature of [
    'update_banese_reconciliation_config\\(text, integer, bigint, text\\)',
    'finish_banese_reconciliation_run\\(uuid, integer, boolean, integer\\)',
    'fail_banese_reconciliation_run\\(uuid, text, text, integer\\)',
    'get_banese_reconciliation_autopilot_progress\\(\\)',
  ]) {
    assert.match(
      p3P9Policy,
      new RegExp(`alter function public\\.${signature}\\s+security definer;[\\s\\S]*?alter function public\\.${signature}\\s+set search_path = ''`, 'i'),
    );
  }
  assert.match(
    p3P9Policy,
    /revoke all on function public\.update_banese_reconciliation_config[\s\S]*?from public, anon, service_role;[\s\S]*?grant execute[\s\S]*?to authenticated;/i,
  );
  for (const functionName of [
    'finish_banese_reconciliation_run',
    'fail_banese_reconciliation_run',
    'prepare_banese_reconciliation_batch_v3',
  ]) {
    assert.match(
      p3P9Policy,
      new RegExp(`revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated;[\\s\\S]*?grant execute[\\s\\S]*?to service_role;`, 'i'),
    );
  }
  assert.match(
    p3P9Policy,
    /revoke all on function public\.begin_banese_reconciliation_run\(\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
  assert.match(
    p3P9Policy,
    /revoke all on function public\.claim_banese_reconciliation_batch_v2\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/i,
  );
});
