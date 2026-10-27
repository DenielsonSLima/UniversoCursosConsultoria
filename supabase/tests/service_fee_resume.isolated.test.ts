import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';

const fee = '00000000-0000-4000-8000-000000000001';
const cycle = '00000000-0000-4000-8000-000000000002';
const operation = '00000000-0000-4000-8000-000000000003';
const attempt = '00000000-0000-4000-8000-000000000004';
const enrollment = '00000000-0000-4000-8000-000000000005';
const actor = '00000000-0000-4000-8000-000000000006';
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };

// Only dependencies of the new RPC are stubbed. The migration itself runs in
// PostgreSQL; net.http_post records a queue item locally and never uses a bank.
const fixture = `
create role anon; create role authenticated; create role service_role;
create schema auth; create schema internal_academic; create schema net;
create function auth.uid() returns uuid language sql as $$
 select nullif(current_setting('test.actor',true),'')::uuid $$;
create function public.gestor_has_financeiro_tab(text) returns boolean language sql as $$
 select current_setting('test.allowed',true)='true' $$;
create function public.is_gestor_for_polo(uuid) returns boolean language sql as $$
 select current_setting('test.polo_allowed',true)='true' $$;
create table public.contas_receber(id uuid,matricula_id uuid,polo_id uuid,gateway_creation_token uuid);
create table internal_academic.technical_rejected_fee_corrections(
 id uuid,receivable_id uuid,matricula_id uuid,cycle_request_id uuid,cycle_number integer,
 state text,consent_actor_id uuid,manifest_hash text);
create table internal_academic.rejected_fee_service_capabilities(
 operation_id uuid,request_id uuid,actor_kind text,first_claimed_at timestamptz,
 completed_at timestamptz,lease_until timestamptz);
create table public.historico_turma_financeira(
 matricula_id uuid,evento text,regra jsonb,created_at timestamptz default clock_timestamp());
create table public.synthetic_queue(body jsonb);
create function internal_academic.assert_rejected_fee_service_scope(uuid,text)
returns internal_academic.rejected_fee_service_capabilities language plpgsql as $$
declare c internal_academic.rejected_fee_service_capabilities;
begin
 if current_setting('test.scope_allowed',true)<>'true' then raise exception 'SCOPE_CHANGED'; end if;
 select * into strict c from internal_academic.rejected_fee_service_capabilities where operation_id=$1 for update;
 return c;
end $$;
create function public.get_banese_reconciliation_worker_secret() returns text language sql as $$
 select repeat('x',32) $$;
create function net.http_post(url text,body jsonb,params jsonb,headers jsonb,timeout_milliseconds integer)
returns bigint language plpgsql as $$ begin
 insert into public.synthetic_queue values(body); return 1;
end $$;
create function public.registrar_turma_financeiro_auditoria(uuid,text,jsonb,text)
returns void language sql as $$ insert into public.historico_turma_financeira(matricula_id,evento,regra) values($1,$2,$3) $$;
insert into public.contas_receber values('${fee}','${enrollment}','${actor}','${attempt}');
insert into internal_academic.technical_rejected_fee_corrections values(
 '${operation}','${fee}','${enrollment}','${cycle}',2,'CONSENTED',null,repeat('a',64));
insert into internal_academic.rejected_fee_service_capabilities values(
 '${operation}','${attempt}','SYSTEM',clock_timestamp()-interval '1 hour',null,null);
`;

Deno.test('actual recovery RPC enforces scope, GET-only capability, cooldown and immutable state', async (t) => {
  const db = new PGlite();
  const call = async (request = cycle) => (await db.query<{ value: Record<string, unknown> }>(
    'select public.resume_rejected_fee_service_recovery_secure($1,$2) as value', [fee,request],
  )).rows[0].value;
  const reset = async () => {
    await db.exec(`truncate public.synthetic_queue,public.historico_turma_financeira;
      update internal_academic.rejected_fee_service_capabilities set actor_kind='SYSTEM',
        first_claimed_at=clock_timestamp()-interval '1 hour',completed_at=null,lease_until=null;
      update internal_academic.technical_rejected_fee_corrections set state='CONSENTED',consent_actor_id=null;
      update public.contas_receber set gateway_creation_token='${attempt}';
      select set_config('test.actor','${actor}',false),set_config('test.allowed','true',false),
        set_config('test.polo_allowed','true',false),set_config('test.scope_allowed','true',false);`);
  };
  const rejected = async (change: string, request = cycle) => {
    await reset(); await db.exec(change);
    let failed = false;
    try { await call(request); } catch { failed = true; }
    assert(failed, 'Unsafe recovery must fail');
    assert((await db.query('select * from public.synthetic_queue')).rows.length === 0, 'No bank queue item');
  };
  try {
    await db.exec(fixture);
    await db.exec(await Deno.readTextFile(new URL('../migrations/20261027222313_resume_service_fee_exact_get.sql',import.meta.url)));
    await t.step('GET-only dispatch preserves receivable and capability; repeat is throttled', async () => {
      await reset();
      const before = JSON.stringify((await db.query(`select to_jsonb(r) r,to_jsonb(c) c from public.contas_receber r
        cross join internal_academic.rejected_fee_service_capabilities c`)).rows);
      assert((await call()).queued === true, 'First query queued');
      assert((await call()).queued === false, 'Repeated click throttled');
      const rows = (await db.query<{ body: Record<string,unknown> }>('select * from public.synthetic_queue')).rows;
      assert(rows.length === 1 && rows[0].body.action === 'issue_approved_rejected_fee_service', 'Only existing worker action');
      assert(Object.keys(rows[0].body).sort().join() === 'action,manifestHash,operationId', 'No caller bank data');
      const after = JSON.stringify((await db.query(`select to_jsonb(r) r,to_jsonb(c) c from public.contas_receber r
        cross join internal_academic.rejected_fee_service_capabilities c`)).rows);
      assert(before === after, 'Never rewrite the receivable or historical capability');
    });
    for (const [name,change] of [
      ['anonymous', "select set_config('test.actor','',false)"],
      ['without finance permission', "select set_config('test.allowed','false',false)"],
      ['another polo', "select set_config('test.polo_allowed','false',false)"],
      ['financial drift', "select set_config('test.scope_allowed','false',false)"],
      ['unclaimed capability', 'update internal_academic.rejected_fee_service_capabilities set first_claimed_at=null'],
      ['completed capability', 'update internal_academic.rejected_fee_service_capabilities set completed_at=clock_timestamp()'],
      ['expired window', "update internal_academic.rejected_fee_service_capabilities set first_claimed_at=clock_timestamp()-interval '8 days'"],
      ['wrong attempt', `update public.contas_receber set gateway_creation_token='${actor}'`],
      ['human consent path', `update internal_academic.technical_rejected_fee_corrections set consent_actor_id='${actor}'`],
    ]) await t.step(name, () => rejected(change));
    await t.step('wrong cycle request cannot resume', () => rejected('select 1',actor));
    await t.step('active lease does not queue concurrent work', async () => {
      await reset(); await db.exec("update internal_academic.rejected_fee_service_capabilities set lease_until=clock_timestamp()+interval '1 minute'");
      assert((await call()).queued === false,'Respect existing worker lease');
    });
    for (const [age,auditAge] of [['7 hours','2 minutes'],['2 days','30 minutes']]) {
      await t.step(`recovery backoff after ${age}`, async () => {
        await reset();
        await db.exec(`update internal_academic.rejected_fee_service_capabilities
          set first_claimed_at=clock_timestamp()-interval '${age}';
          insert into public.historico_turma_financeira values('${enrollment}',
            'TAXA_SERVICO_RETOMADA_GET_SOLICITADA',jsonb_build_object('operationId','${operation}'),
            clock_timestamp()-interval '${auditAge}');`);
        assert((await call()).queued === false,'Respect time-based recovery backoff');
      });
    }
    await t.step('ordinary fee without a service capability stays on its existing path', async () => {
      await reset();
      await db.exec('begin; delete from internal_academic.rejected_fee_service_capabilities');
      assert((await call()).handled === false,'No service override');
      await db.exec('rollback');
    });
    await t.step('anon and service roles cannot execute the authenticated RPC', async () => {
      const rows = (await db.query<{ role: string; allowed: boolean }>(`select role,
        has_function_privilege(role,'public.resume_rejected_fee_service_recovery_secure(uuid,uuid)','EXECUTE') allowed
        from (values ('anon'),('authenticated'),('service_role')) r(role)`)).rows;
      assert(rows.every(r => r.allowed === (r.role==='authenticated')),'Least privilege grants');
    });
  } finally { await db.close(); }
});
