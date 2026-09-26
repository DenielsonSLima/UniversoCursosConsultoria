// Produces a read-only SQL regression for MCP execute_sql. Never invokes cron,
// net.http_post, the worker, Firebase or a mutation. Tests the migration's gate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL(
  '../migrations/20260926002500_skip_idle_push_dispatcher_invocations.sql',
  import.meta.url,
), 'utf8');
const rawGate = migration.split('$gate$')[1];
assert.ok(rawGate && !/http_post|alter_job/i.test(rawGate));
assert.match(migration, /returns boolean language sql stable security invoker set search_path = ''/);
assert.match(migration, /from public, anon, authenticated, service_role/);
assert.match(migration, /where comunicacao_private\.push_dispatch_required\(\);/);

// Optional post-application check: SELECT only, and never calls the gate/worker.
if (process.argv.includes('--postflight')) {
  const original = readFileSync(new URL(
    '../migrations/20260803203000_schedule_push_notification_dispatcher.sql',
    import.meta.url,
  ), 'utf8').split('$cron$')[1];
  assert.equal(createHash('md5').update(original).digest('hex'), 'b6cc37fd81046d6ae09d5590f3763d0e');
  const expectedCommand = original.replace(/;\s*$/, '')
    + '\nwhere comunicacao_private.push_dispatch_required();';
  console.log(`select
    exists (
      select 1 from pg_proc p join pg_language l on l.oid = p.prolang
      where p.oid = to_regprocedure('comunicacao_private.push_dispatch_required()')
        and p.proowner = 'postgres'::regrole and not p.prosecdef
        and p.provolatile = 's' and l.lanname = 'sql'
        and p.proconfig = array['search_path=""']::text[]
        and p.prosrc = $body$select (${rawGate});$body$
        and not exists (
          select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
          where a.grantee <> 'postgres'::regrole or a.privilege_type <> 'EXECUTE'
        )
    ) as gate_definition_and_acl_preserved,
    not has_schema_privilege('anon','comunicacao_private','usage')
      and not has_schema_privilege('authenticated','comunicacao_private','usage')
      and not has_schema_privilege('service_role','comunicacao_private','usage')
      as private_schema_preserved,
    exists (
      select 1 from cron.job where jobname = 'dispatch-push-notifications'
        and schedule = '* * * * *' and active and username = 'postgres'
        and command = $command$${expectedCommand}$command$
    ) as cron_command_and_schedule_preserved,
    md5(pg_get_functiondef('public.claim_push_notification_deliveries(text,integer)'::regprocedure))
      = '75d33909a1d8c5a9ed543b756c350299'
      and md5(pg_get_functiondef('public.claim_public_support_push_deliveries(text,integer)'::regprocedure))
      = 'aa37d41cbd58eee5e0a91bcc158a61b5'
      and md5(pg_get_functiondef('public.claim_push_notification_asset_cleanup(text,integer)'::regprocedure))
      = '0164ce8782c82c24384c97038df3ee38'
      as all_claim_contracts_preserved;`);
  process.exit(0);
}
const tables = [
  'push_notification_jobs', 'push_notification_deliveries',
  'public_support_push_jobs', 'public_support_push_deliveries',
  'push_notification_asset_cleanup_queue', 'push_notification_assets',
  'comunicacao_push_campanhas', 'push_notification_policies',
];
let gate = rawGate
  .replaceAll('public.push_notification_quiet_hours_active()', 's.quiet_hours')
  .replaceAll('public.push_notification_asset_is_referenced(q.asset_id)', 's.asset_referenced');
for (const table of tables) gate = gate.replaceAll(`public.${table}`, table);

const id = '00000000-0000-4000-8000-000000000001';
const pending = {
  id, status: 'pending', category: 'institutional', attempts: 0,
  available_at: '2000-01-01T00:00:00Z', expires_at: '2100-01-01T00:00:00Z',
};
const policies = [{ id: true, enabled: true, categories: {
  chat: true, financial: true, academic: true, calendar: true,
  marketing: true, institutional: true,
} }];
const cases = [];
const add = (name, expected, data = {}, options = {}) => cases.push({
  name, expected, quiet_hours: false, asset_referenced: false,
  data: { push_notification_policies: policies, ...data }, ...options,
});
add('empty', false);
add('terminal_history', false, { push_notification_jobs: [{ ...pending, status: 'skipped' }] });
add('student_due', true, { push_notification_jobs: [pending] });
add('student_future', false, { push_notification_jobs: [{ ...pending, available_at: '2099-01-01' }] });
add('student_quiet_hours', false, { push_notification_jobs: [pending] }, { quiet_hours: true });
add('chat_during_quiet_hours', true, { push_notification_jobs: [{ ...pending, category: 'chat' }] }, { quiet_hours: true });
add('student_expired', true, { push_notification_jobs: [{ ...pending, expires_at: '2000-01-02' }] });
add('student_disabled_policy', true, {
  push_notification_jobs: [{ ...pending, available_at: '2099-01-01' }],
  push_notification_policies: [{ ...policies[0], enabled: false }],
});
add('student_expired_lease', true, { push_notification_jobs: [{ ...pending, status: 'processing', locked_at: '2000-01-01' }] });
add('student_live_lease', false, { push_notification_jobs: [{ ...pending, status: 'processing', locked_at: '2099-01-01' }] });
add('retryable_delivery', true, {
  push_notification_jobs: [{ ...pending, status: 'failed' }],
  push_notification_deliveries: [{ job_id: id, status: 'failed', retryable: true }],
});
add('terminal_failed_delivery', false, { push_notification_jobs: [{ ...pending, status: 'failed' }] });
add('support_due', true, { public_support_push_jobs: [pending] });
add('support_future', false, { public_support_push_jobs: [{ ...pending, available_at: '2099-01-01' }] });
add('support_expired_lease', true, { public_support_push_jobs: [{ ...pending, status: 'processing', locked_at: '2000-01-01' }] });
add('support_exhausted', true, { public_support_push_jobs: [{ ...pending, attempts: 5, available_at: '2099-01-01' }] });
add('cleanup_due', true, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id }],
  push_notification_assets: [{ id, status: 'cleanup_pending' }],
});
add('cleanup_exhausted', false, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, attempts: 5 }],
  push_notification_assets: [{ id, status: 'cleanup_pending' }],
});
add('cleanup_reference_cancel', true, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, attempts: 5 }],
}, { asset_referenced: true });
add('cleanup_expired_lease', true, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, status: 'processing', locked_at: '2000-01-01' }],
});
add('campaign_due', true, { comunicacao_push_campanhas: [{ id, status: 'scheduled', scheduled_at: '2000-01-01' }] });
add('campaign_future', false, { comunicacao_push_campanhas: [{ id, status: 'scheduled', scheduled_at: '2099-01-01' }] });
add('campaign_terminal_jobs', true, {
  comunicacao_push_campanhas: [{ id, status: 'processing' }],
  push_notification_jobs: [{ ...pending, campaign_id: id, status: 'skipped' }],
});
add('student_null_expiry', false, { push_notification_jobs: [{ ...pending, expires_at: null }] });
add('support_null_expiry', false, { public_support_push_jobs: [{ ...pending, expires_at: null }] });
add('student_attempts_exhausted_until_expiry', false, {
  push_notification_jobs: [{ ...pending, attempts: 5 }],
});
add('expired_during_quiet_hours', true, {
  push_notification_jobs: [{ ...pending, expires_at: '2000-01-02' }],
}, { quiet_hours: true });
add('disabled_during_quiet_hours', true, {
  push_notification_jobs: [pending], push_notification_policies: [],
}, { quiet_hours: true });
add('failed_expired_without_retry', false, {
  push_notification_jobs: [{ ...pending, status: 'failed', expires_at: '2000-01-02' }],
});
add('cancelled_expired_pending_deliveries', true, {
  push_notification_jobs: [{ ...pending, status: 'cancelled', last_error: 'PUSH_EXPIRED' }],
  push_notification_deliveries: [{ job_id: id, status: 'processing' }],
});
add('support_repair_delivery_before_available', true, {
  public_support_push_jobs: [{ ...pending, available_at: '2099-01-01' }],
  public_support_push_deliveries: [{ job_id: id, status: 'processing' }],
});
add('support_expired_pending', true, {
  public_support_push_jobs: [{ ...pending, available_at: '2099-01-01', expires_at: '2000-01-02' }],
});
add('cleanup_future_referenced', true, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, available_at: '2099-01-01' }],
}, { asset_referenced: true });
add('cleanup_live_lease_referenced', true, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, status: 'processing', locked_at: '2099-01-01' }],
}, { asset_referenced: true });
add('cleanup_terminal_referenced', false, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id, status: 'cancelled' }],
}, { asset_referenced: true });
add('cleanup_asset_not_pending', false, {
  push_notification_asset_cleanup_queue: [{ ...pending, asset_id: id }],
  push_notification_assets: [{ id, status: 'ready' }],
});
add('campaign_queued_without_jobs', false, {
  comunicacao_push_campanhas: [{ id, status: 'queued' }],
});
add('campaign_null_schedule_without_jobs', false, {
  comunicacao_push_campanhas: [{ id, status: 'scheduled', scheduled_at: null }],
});
add('future_campaign_with_terminal_jobs', true, {
  comunicacao_push_campanhas: [{ id, status: 'scheduled', scheduled_at: '2099-01-01' }],
  push_notification_jobs: [{ ...pending, campaign_id: id, status: 'skipped' }],
});

const fixtures = tables.map(table => `${table} as (
  select * from jsonb_populate_recordset(null::public.${table},
    coalesce(s.data -> '${table}', '[]'::jsonb))
)`).join(',\n');
console.log(`with scenarios as (
  select * from jsonb_to_recordset($cases$${JSON.stringify(cases)}$cases$::jsonb)
    as x(name text, expected boolean, quiet_hours boolean, asset_referenced boolean, data jsonb)
), evaluated as (
  select s.name, s.expected, (with ${fixtures} select (${gate})) as actual
  from scenarios s
)
select count(*) as cases, count(*) filter(where actual is not distinct from expected) as passed,
  coalesce(jsonb_agg(jsonb_build_object('case', name, 'expected', expected, 'actual', actual))
    filter(where actual is distinct from expected), '[]'::jsonb) as failures
from evaluated;`);
