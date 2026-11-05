import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const root = process.env.OTHER_CREDIT_SOURCE_ROOT || process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');

test('RPC avulsa: autorização, prova da transição, replay, dinheiro e histórico preservados', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath));
  const db = new PGlite();
  const actor = '10000000-0000-4000-8000-000000000001';
  const polo = '20000000-0000-4000-8000-000000000001';
  const rid = '30000000-0000-4000-8000-000000000001';
  const request = '40000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA internal_finance; CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_receivable_payments;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES('${actor}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
      CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='ativo' $$;
      CREATE TABLE public.usuarios_sistema(id uuid,auth_user_id uuid,status text,perfil text);
      INSERT INTO public.usuarios_sistema VALUES('${actor}','${actor}','ativo','gestor');
      CREATE FUNCTION internal_finance.authorize_other_credit_plan(uuid) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN IF auth.uid() IS DISTINCT FROM '${actor}'::uuid OR $1 IS DISTINCT FROM '${polo}'::uuid THEN
        RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF; END $$;
      CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,polo_id uuid,categoria text,status text,tipo_lancamento text,
        matricula_id uuid,turma_id uuid,origem_cronograma_id uuid,outros_creditos_plano_id uuid,renegotiation_agreement_id uuid,ead_checkout_attempt_id uuid,
        regra_financeira_tecnica_snapshot jsonb,regra_financeira_plano_unico_snapshot jsonb,
        regra_financeira_dependencia_snapshot jsonb,regra_financeira_renegociacao_snapshot jsonb,
        regra_financeira_outros_creditos_snapshot jsonb,origem_pagamento text,conta_bancaria_id uuid,
        valor numeric,valor_pago numeric,data_pagamento date,manual_settlement_id uuid,manual_settlement_reversed_at timestamptz,
        gateway_provider text,asaas_payment_id text,nosso_numero_asaas text,updated_at timestamptz);
      CREATE TABLE public.receivable_manual_settlements(id uuid,receivable_id uuid,state text,reversed_at timestamptz,
        received_cents bigint,account_id uuid,payment_date date,provider_code text,remote_payment_id text,remote_payment_link_id text,updated_at timestamptz);
      CREATE TABLE public.receivable_manual_settlement_events(settlement_id uuid,actor_id uuid,event_type text,details jsonb);
      CREATE TABLE public.financial_payment_events(source_kind text,source_id uuid);
      CREATE TABLE internal_receivable_payments.attempts(receivable_id uuid,state text);
      CREATE TABLE public.payment_gateway_transactions(receivable_id uuid);
      CREATE TABLE internal_proesc.obligation_links(receivable_id uuid);
      CREATE TABLE public.inscricoes_online(receivable_id uuid);
      CREATE TABLE public.matricula_dependencia_cobrancas(conta_receber_id uuid);
      CREATE TABLE public.convenios_financeiros_creditos(conta_receber_id uuid);
      CREATE TABLE public.emprestimos_financeiros(conta_receber_id uuid);
      CREATE TABLE public.receivable_renegotiation_source_items(receivable_id uuid,released_at timestamptz);
      CREATE TABLE public.banese_cancellation_outbox(receivable_id uuid);
      SELECT set_config('request.jwt.claim.sub','${actor}',false),set_config('request.jwt.claim.role','authenticated',false);
    `);
    const source = await read('supabase/migrations/20261014183512_financial_payment_source_guards.sql');
    const guard = source.match(/CREATE OR REPLACE FUNCTION public\.protect_paid_financial_history\(\)[\s\S]*?\$\$;/)?.[0];
    assert.ok(guard, 'versioned paid-history guard must exist');
    await db.exec(guard);
    await db.exec('CREATE TRIGGER paid_guard BEFORE UPDATE OR DELETE ON public.contas_receber FOR EACH ROW EXECUTE FUNCTION public.protect_paid_financial_history()');
    const fences = await read('supabase/migrations/20261014183608_receivable_payment_fences.sql');
    const fence = fences.match(/CREATE FUNCTION internal_receivable_payments\.guard_active_attempt\(\)[\s\S]*?\$\$;/)?.[0];
    assert.ok(fence);
    await db.exec(fence);
    await db.exec(`CREATE TRIGGER receipt_attempt_source_fence BEFORE UPDATE ON public.contas_receber
      FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt();
      CREATE TRIGGER receipt_attempt_legacy_fence BEFORE UPDATE ON public.receivable_manual_settlements
      FOR EACH ROW EXECUTE FUNCTION internal_receivable_payments.guard_active_attempt()`);
    await db.exec(await read('supabase/migrations/20261105223000_reverse_local_other_credit.sql'));
    const seed = async (id, patch = '') => {
      await db.exec(`INSERT INTO public.contas_receber(id,polo_id,categoria,status,origem_pagamento,conta_bancaria_id,valor,valor_pago,data_pagamento)
        VALUES('${id}','${polo}','OUTROS_CREDITOS','PAGO','PRESENCIAL','${actor}',129.90,129.90,'2026-11-05')`);
      if (patch) await db.exec(`SELECT set_config('request.jwt.claim.role','service_role',false); UPDATE public.contas_receber SET ${patch} WHERE id='${id}'; SELECT set_config('request.jwt.claim.role','authenticated',false);`);
    };
    const call = (id = rid, req = request, reason = 'Lançamento duplicado', confirm = true) => db.query(
      'SELECT public.estornar_outro_credito_secure($1,$2,$3,$4) AS result', [id, req, reason, confirm]);
    await seed(rid);
    await assert.rejects(db.exec(`UPDATE public.contas_receber SET status='ESTORNADO' WHERE id='${rid}'`), /auditável/);
    await assert.rejects(call(rid, request, 'erro'), /5 a 500/);
    await assert.rejects(call(rid, request, 'Lançamento duplicado', false), /confirme/);
    await db.exec("SELECT set_config('request.jwt.claim.sub','',false)");
    await assert.rejects(call(), /Autenticação/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub','${actor}',false)`);
    assert.equal((await call()).rows[0].result.status, 'ESTORNADO');
    const row = (await db.query(`SELECT * FROM public.contas_receber WHERE id='${rid}'`)).rows[0];
    assert.equal(Number(row.valor_pago), 129.9); assert.equal(row.conta_bancaria_id, actor);
    assert.equal(row.data_pagamento.toISOString().slice(0, 10), '2026-11-05');
    assert.equal((await call()).rows[0].result.replayed, true);
    await assert.rejects(call(rid, request, 'Outro motivo'), /outra operação/);
    await assert.rejects(call(rid, '40000000-0000-4000-8000-000000000002'), /Somente/);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM internal_finance.other_credit_reversals')).rows[0].n, 1);
    await assert.rejects(db.exec(`UPDATE public.contas_receber SET status='PAGO' WHERE id='${rid}'`), /imutável/);
    await assert.rejects(db.exec(`DELETE FROM public.contas_receber WHERE id='${rid}'`), /imutável/);
    const bank = '30000000-0000-4000-8000-000000000002';
    await seed(bank, "gateway_provider='banese_card'");
    await assert.rejects(call(bank, '40000000-0000-4000-8000-000000000002'), /histórico bancário/);
    const academic = '30000000-0000-4000-8000-000000000003';
    await seed(academic, `matricula_id='${actor}'`);
    await assert.rejects(call(academic, '40000000-0000-4000-8000-000000000003'), /Somente/);
    const ledger = '30000000-0000-4000-8000-000000000004';
    await seed(ledger);
    await db.exec(`INSERT INTO public.financial_payment_events VALUES('RECEIVABLE','${ledger}')`);
    await assert.rejects(call(ledger, '40000000-0000-4000-8000-000000000004'), /histórico bancário/);
    const linked = '30000000-0000-4000-8000-000000000006';
    await seed(linked);
    for (const [table,column] of [
      ['internal_proesc.obligation_links','receivable_id'],['public.inscricoes_online','receivable_id'],
      ['public.matricula_dependencia_cobrancas','conta_receber_id'],['public.convenios_financeiros_creditos','conta_receber_id'],
      ['public.emprestimos_financeiros','conta_receber_id'],['public.receivable_renegotiation_source_items','receivable_id'],
      ['public.banese_cancellation_outbox','receivable_id'],
    ]) {
      await db.exec(`INSERT INTO ${table}(${column}) VALUES('${linked}')`);
      await assert.rejects(call(linked, '40000000-0000-4000-8000-000000000006'), /vínculo financeiro/);
      await db.exec(`DELETE FROM ${table}`);
    }
    for (const column of ['ead_checkout_attempt_id','renegotiation_agreement_id']) {
      await db.exec(`UPDATE public.contas_receber SET ${column}='${actor}' WHERE id='${linked}'`);
      await assert.rejects(call(linked, '40000000-0000-4000-8000-000000000006'), /Somente/);
      await db.exec(`UPDATE public.contas_receber SET ${column}=null WHERE id='${linked}'`);
    }
    const manual = '30000000-0000-4000-8000-000000000007';
    const settlement = '50000000-0000-4000-8000-000000000001';
    await seed(manual, `manual_settlement_id='${settlement}'`);
    await db.exec(`INSERT INTO public.receivable_manual_settlements(id,receivable_id,state,received_cents,account_id,payment_date)
      VALUES('${settlement}','${manual}','COMPLETED',12990,'${actor}','2026-11-05')`);
    assert.equal((await call(manual, '40000000-0000-4000-8000-000000000007')).rows[0].result.status, 'ESTORNADO');
    assert.equal((await db.query(`SELECT state FROM public.receivable_manual_settlements WHERE id='${settlement}'`)).rows[0].state, 'REVERSED');
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM public.receivable_manual_settlement_events WHERE settlement_id='${settlement}'`)).rows[0].n, 1);
    const fenced = '30000000-0000-4000-8000-000000000009';
    await seed(fenced);
    await db.exec(`INSERT INTO internal_receivable_payments.attempts VALUES('${fenced}','STARTED')`);
    await assert.rejects(call(fenced, '40000000-0000-4000-8000-000000000010'), /Recebimento em andamento/);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM internal_finance.other_credit_reversals WHERE receivable_id='${fenced}'`)).rows[0].n, 0);
    await db.exec('DELETE FROM internal_receivable_payments.attempts');
    const race = '30000000-0000-4000-8000-000000000008';
    await seed(race);
    const outcomes = await Promise.allSettled([
      call(race, '40000000-0000-4000-8000-000000000008'),
      call(race, '40000000-0000-4000-8000-000000000009'),
    ]);
    assert.equal(outcomes.filter(result => result.status==='fulfilled').length, 1);
    assert.equal((await db.query(`SELECT count(*)::int AS n FROM internal_finance.other_credit_reversals WHERE receivable_id='${race}'`)).rows[0].n, 1);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('SELECT * FROM internal_finance.other_credit_reversals'), /permission denied/);
    await db.exec('RESET ROLE');
    const foreign = '30000000-0000-4000-8000-000000000005';
    await seed(foreign, 'polo_id=null');
    await assert.rejects(call(foreign, '40000000-0000-4000-8000-000000000005'), /forbidden/);
  } finally { await db.close(); }
});
