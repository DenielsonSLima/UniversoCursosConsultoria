import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = 'a'.repeat(64);
const signature = 'public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)';
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const candidate = () => scalar(`select internal_proesc.v2_net_discount_candidate('${id(1)}','${id(5)}') value`);
const composition = async (base = null) => (await db.query(`select r.* from public.contas_receber c
  cross join lateral public.resolve_integrated_receivable_financial_composition(c.id,coalesce($1,c.valor),
    c.valor_pago,c.data_vencimento,c.data_pagamento,null,null,null,null,null,null,null,null,null) r`, [base])).rows[0];
const immutable = () => scalar(`select jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(r)) from public.contas_receber r),
  'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from internal_proesc.financial_snapshots s),
  'observations',(select jsonb_agg(to_jsonb(o) order by id) from internal_proesc.v2_invoice_observations o),
  'approvals',(select jsonb_agg(to_jsonb(a)) from internal_proesc.v2_composition_approvals a)) value`);
let cases = 0;
try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_academic;
    CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,cliente_id uuid,
      polo_id uuid,valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,status text,
      origem_pagamento text,tipo_lancamento text,gateway_provider text,gateway_payment_id text,
      manual_settlement_id uuid,gateway_financial_terms jsonb,regra_financeira_tecnica_snapshot jsonb,
      gateway_creation_token uuid,gateway_submission_channel text,gateway_submission_status text,
      gateway_boleto_nosso_numero text,asaas_payment_id text,nosso_numero_asaas text);
    CREATE TABLE public.turmas(id uuid PRIMARY KEY,codigo text,polo_id uuid,
      origem_financeira text,financeiro_herdado boolean,regra_financeira_revisao integer,
      regra_financeira_fingerprint text,valor_parcela numeric,desconto_pontualidade numeric,
      aplicar_desconto_mensalidade boolean,aplicar_multa_juros_mensalidade boolean,
      juros_atraso numeric,multa_atraso_percentual numeric);
    CREATE TABLE public.matriculas(id uuid PRIMARY KEY,aluno_id uuid,turma_id uuid);
    CREATE TABLE public.matriculas_tecnicas_financeiro_config(matricula_id uuid,override_ativo boolean);
    CREATE TABLE public.payment_gateway_transactions(receivable_id uuid);
    CREATE TABLE internal_academic.technical_manual_cycle_runs(receivable_ids uuid[]);
    CREATE TABLE internal_proesc.class_scopes(turma_id uuid,class_code text,polo_id uuid,
      source_unit_id text,source_class_id text,phase text);
    CREATE TABLE internal_proesc.obligation_links(id uuid PRIMARY KEY,receivable_id uuid,matricula_id uuid,
      turma_id uuid,source_unit_id text,source_class_id text,source_key text,auto_enabled boolean,
      parent_link_id uuid,archived_receivable_id uuid);
    CREATE TABLE internal_proesc.financial_snapshots(id uuid PRIMARY KEY,link_id uuid,observed_at timestamptz,
      recorded_at timestamptz,principal_cents bigint,received_cents bigint,payment_date date,
      source_status text,verification text,evidence_kind text,components jsonb,accounting_lines jsonb,review_reasons jsonb);
    CREATE TABLE internal_proesc.v2_invoice_observations(id uuid PRIMARY KEY,link_id uuid,snapshot_id uuid,
      unit_id text,invoice_id text,source_status text,normalized jsonb,result text,observed_at timestamptz,recorded_at timestamptz);
    CREATE TABLE internal_proesc.v2_enrollment_links(matricula_id uuid,unit_id text,source_enrollment_id text,
      source_person_id text,source_class_id text,person_hash text);
    CREATE TABLE internal_proesc.v2_runs(id uuid PRIMARY KEY,mode text,status text,finished_at timestamptz);
    CREATE TABLE internal_proesc.v2_people_observations(run_id uuid,unit_id text,person_id text,person_hash text,enrollments jsonb);
    CREATE FUNCTION internal_proesc.person_document_hash(uuid) RETURNS text LANGUAGE sql AS $$ SELECT '${hash}'::text $$;
    CREATE FUNCTION internal_academic.technical_financial_effective_rule(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    CREATE FUNCTION public.resolve_receivable_financial_composition(numeric,numeric,date,date,jsonb,uuid,
      timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
    LANGUAGE sql AS $$ SELECT $1,null::numeric,null::numeric,null::numeric,null::numeric,$2-$1,'FALLBACK'::text,$2 $$;
  `);
  // Reconstruct the real deployed resolver, including its exact md5. Skip only
  // historic data-approval seed blocks, which belong to unrelated real people.
  const baseline = migration('20260913184000_proesc_explicit_payment_components.sql');
  await db.exec(baseline.slice(baseline.indexOf('create function internal_proesc.explicit_payment_component'), baseline.lastIndexOf('commit;')));
  await db.exec(migration('20261002010800_proesc_v2_calculated_composition.sql')
    .replace(/DO \$approval\$[\s\S]*?\$approval\$;/, ''));
  await db.exec(migration('20261002011200_proesc_v2_automatic_early_composition.sql')
    .replace(/DO \$policies\$[\s\S]*?\$policies\$;/, ''));
  assert.equal(await scalar('select md5(pg_get_functiondef($1::regprocedure)) value', [signature]), '27b2b91d10a2969fbf698fe498dbb28d');
  const metadata = await scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid=$1::regprocedure", [signature]);
  const blank = { interestCents: null, penaltyCents: null, additionCents: null, discountCents: null };
  await db.exec(`
    INSERT INTO public.turmas(id,codigo,polo_id,origem_financeira) VALUES('${id(3)}','ENF-T42-INT-MAT','${id(7)}','NORMAL');
    INSERT INTO public.matriculas VALUES('${id(2)}','${id(8)}','${id(3)}');
    INSERT INTO public.contas_receber(id,matricula_id,turma_id,cliente_id,polo_id,valor,valor_pago,
      data_vencimento,data_pagamento,status,origem_pagamento,tipo_lancamento)
      VALUES('${id(1)}','${id(2)}','${id(3)}','${id(8)}','${id(7)}',279.90,260,'2026-09-15','2026-10-01','PAGO','SISTEMA_ANTERIOR','PARCELA');
    INSERT INTO internal_proesc.obligation_links VALUES('${id(4)}','${id(1)}','${id(2)}','${id(3)}','3145','123','456',true,null,null);
    INSERT INTO internal_proesc.class_scopes VALUES('${id(3)}','ENF-T42-INT-MAT','${id(7)}','3145','123','CONFIRMED');
    INSERT INTO internal_proesc.v2_enrollment_links VALUES('${id(2)}','3145','789','321','123','${hash}');
    INSERT INTO public.matriculas_tecnicas_financeiro_config VALUES('${id(2)}',false);
    INSERT INTO internal_proesc.v2_runs VALUES('${id(9)}','FULL','COMPLETE','2026-10-02');
    INSERT INTO internal_proesc.v2_people_observations VALUES('${id(9)}','3145','321','${hash}',
      '[{"sourceEnrollmentId":"789","sourceClassId":"123"}]');
  `);
  await db.query(`insert into internal_proesc.financial_snapshots values($1,$2,'2026-10-02','2026-10-02',
    27990,26000,'2026-10-01','PAID','VERIFIED','API_V2_INVOICE_PAID',$3,'[]','[]')`, [id(5), id(4), JSON.stringify(blank)]);
  const normalized = { invoiceId: '456', unitId: '3145', personId: '321', sourceEnrollmentId: '789',
    sourceClassId: '123', personHash: hash, principalCents: 27990, paidCents: 26000,
    dueDate: '2026-09-15', paymentDate: '2026-10-01', sourceStatus: 'PAGA', reviewReasons: [],
    financialConfiguration: { fixedDiscountCents: 1990, earlyDiscountCents: 1990, fineRate: '2', interestRate: '0.033' } };
  await db.query(`insert into internal_proesc.v2_invoice_observations values($1,$2,$3,'3145','456','PAGA',$4,
    'PRESERVED','2026-10-02','2026-10-02')`, [id(6), id(4), id(5), JSON.stringify(normalized)]);
  const before = await immutable();
  assert.equal((await composition()).composicao_status, 'NAO_DISCRIMINADA');
  await db.exec(migration('20261003050000_proesc_paid_net_discount_rule.sql'));
  // The performance migration must preserve all documentary/financial guards.
  // PGlite is single-process: validate index definitions and financial parity,
  // not the production CONCURRENTLY build protocol (which needs real backends).
  for (const name of ['caixa-composition-invoice-index.concurrent.sql',
    'caixa-composition-full-run-index.concurrent.sql']) {
    const source = readFileSync(new URL(`../../docs/operations/sql/${name}`, import.meta.url), 'utf8');
    await db.exec(source.replace('CREATE INDEX CONCURRENTLY', 'CREATE INDEX'));
  }
  assert.deepEqual(await scalar("select to_jsonb(p)-'prosrc' value from pg_proc p where oid=$1::regprocedure", [signature]), metadata);
  assert.equal(await candidate(), true);
  const calculated = await composition();
  assert.equal(calculated.composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  for (const k of ['juros', 'multa', 'acrescimo', 'diferenca_nao_discriminada']) assert.equal(Number(calculated[k]), 0);
  assert.equal(Number(calculated.desconto), 19.9);
  assert.equal(Number(calculated.valor_recebido), 260);
  assert.deepEqual(await immutable(), before, 'Read-side rule cannot mutate receipts, API evidence or approvals');
  assert.equal((await composition(280)).composicao_status, 'FALLBACK', 'Resolver must match caller facts');
  const failures = [
    ['unpaid', "update public.contas_receber set status='PENDENTE'"],
    ['zero paid', 'update public.contas_receber set valor_pago=0'],
    ['equal nominal', 'update public.contas_receber set valor_pago=valor'],
    ['above nominal', 'update public.contas_receber set valor_pago=300'],
    ['fractional cent', 'update public.contas_receber set valor_pago=260.001'],
    ['September', "update public.contas_receber set data_pagamento='2026-09-30'"],
    ['future', 'update public.contas_receber set data_pagamento=current_date+1'],
    ['Banese', "update public.contas_receber set gateway_provider='BANESE'"],
    ['local origin', "update public.contas_receber set origem_pagamento='MANUAL'"],
    ['manual settlement', `update public.contas_receber set manual_settlement_id='${id(99)}'`],
    ['gateway terms', "update public.contas_receber set gateway_financial_terms='{}'"],
    ['gateway transaction', `insert into public.payment_gateway_transactions values('${id(1)}')`],
    ['native cycle', `insert into internal_academic.technical_manual_cycle_runs values(ARRAY['${id(1)}'::uuid])`],
    ['override', 'update public.matriculas_tecnicas_financeiro_config set override_ativo=true'],
    ['individual snapshot', `update public.contas_receber set regra_financeira_tecnica_snapshot='{"origem":"INDIVIDUAL"}'`],
    ['scope', "update internal_proesc.class_scopes set phase='REVIEW'"],
    ['unit', "update internal_proesc.obligation_links set source_unit_id='999'"],
    ['archived', `update internal_proesc.obligation_links set archived_receivable_id='${id(1)}'`],
    ['automation disabled', 'update internal_proesc.obligation_links set auto_enabled=false'],
    ['parent residual link', `update internal_proesc.obligation_links set parent_link_id='${id(99)}'`],
    ['child replacement link', `insert into internal_proesc.obligation_links(id,parent_link_id) values('${id(99)}','${id(4)}')`],
    ['academic identity', `update public.matriculas set aluno_id='${id(99)}'`],
    ['pin person', "update internal_proesc.v2_enrollment_links set source_person_id='999'"],
    ['pin enrollment', "update internal_proesc.v2_enrollment_links set source_enrollment_id='999'"],
    ['pin document hash', "update internal_proesc.v2_enrollment_links set person_hash=repeat('b',64)"],
    ['local document hash', `create or replace function internal_proesc.person_document_hash(uuid)
      returns text language sql as $$ select repeat('b',64) $$`],
    ['missing full', 'delete from internal_proesc.v2_runs'],
    ['full unique different identity', "update internal_proesc.v2_people_observations set person_id='999'"],
    ['full ambiguous', `insert into internal_proesc.v2_people_observations select run_id,unit_id,'999',person_hash,enrollments from internal_proesc.v2_people_observations`],
    ['source partial', "update internal_proesc.v2_invoice_observations set source_status='PAGAMENTO PARCIAL'"],
    ['source superior', "update internal_proesc.v2_invoice_observations set source_status='PAGAMENTO SUPERIOR'"],
    ['source renegotiation', "update internal_proesc.v2_invoice_observations set source_status='NEGOCIADA'"],
    ['source canceled', "update internal_proesc.v2_invoice_observations set source_status='CANCELADA'"],
    ['source review', "update internal_proesc.v2_invoice_observations set result='REVIEW'"],
    ['future observation', "update internal_proesc.v2_invoice_observations set observed_at=now()+interval '6 minutes'"],
    ['source absent', 'delete from internal_proesc.v2_invoice_observations'],
    ['raw mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{paidCents}','25999')`],
    ['raw due mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{dueDate}','"2026-09-16"')`],
    ['raw document missing', `update internal_proesc.v2_invoice_observations set normalized=normalized-'personHash'`],
    ['snapshot review', "update internal_proesc.financial_snapshots set verification='REVIEW'"],
    ['snapshot conflict', 'update internal_proesc.financial_snapshots set received_cents=25999'],
    ['explicit components', `update internal_proesc.financial_snapshots set components=jsonb_set(components,'{interestCents}','1')`],
    ['cancellation line', `update internal_proesc.financial_snapshots set accounting_lines='[{"cancelled":true}]'`],
    ['portal incomplete', "update internal_proesc.financial_snapshots set evidence_kind='PORTAL_CONFIRMED'"],
  ];
  for (const [name, sql] of failures) {
    await db.exec('BEGIN');
    await db.exec(sql);
    assert.equal(await candidate(), false, name);
    assert.notEqual((await composition()).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC', name);
    await db.exec('ROLLBACK');
    cases++;
  }
  // A newer conflicting observation without a link cannot be skipped.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.v2_invoice_observations select '${id(10)}',null,null,
    unit_id,invoice_id,'NEGOCIADA',normalized,'UNLINKED',observed_at+interval '1 second',recorded_at
    from internal_proesc.v2_invoice_observations`);
  assert.equal(await candidate(), false);
  await db.exec('ROLLBACK');
  // Boundary guards must reject even when every source date agrees locally.
  for (const payment of ["'2026-09-30'::date", 'current_date+1']) {
    await db.exec('BEGIN');
    await db.exec(`update public.contas_receber set data_pagamento=${payment};
      update internal_proesc.financial_snapshots set payment_date=${payment};
      update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,
        '{paymentDate}',to_jsonb((${payment})::text))`);
    assert.equal(await candidate(), false, 'Payment effective range with coherent dates');
    await db.exec('ROLLBACK');
  }
  // Repeated equivalent collection retains the same source proof and result.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.v2_invoice_observations select '${id(10)}',link_id,snapshot_id,
    unit_id,invoice_id,source_status,normalized,'PRESERVED',observed_at+interval '1 second',recorded_at
    from internal_proesc.v2_invoice_observations`);
  assert.equal(await candidate(), true);
  assert.deepEqual(await composition(), calculated);
  await db.exec('ROLLBACK');
  // Earlier portal OPEN does not override a subsequent exact full settlement;
  // cancellation/renegotiation history must nevertheless stop this new rule.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.financial_snapshots select '${id(11)}',link_id,
    observed_at-interval '1 hour',recorded_at,principal_cents,null,null,'OPEN',verification,
    'PORTAL_CONFIRMED',components,accounting_lines,review_reasons from internal_proesc.financial_snapshots`);
  assert.equal(await candidate(), true);
  await db.exec(`update internal_proesc.financial_snapshots set source_status='CANCELED' where id='${id(11)}'`);
  assert.equal(await candidate(), false);
  await db.exec(`update internal_proesc.financial_snapshots set source_status='UNKNOWN',
    accounting_lines='[{"renegotiation":true}]' where id='${id(11)}'`);
  assert.equal(await candidate(), false);
  await db.exec('ROLLBACK');
  // Historical explicit fees win; do not replace gross adjustments with net.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.financial_snapshots select '${id(11)}',link_id,
    observed_at-interval '1 hour',recorded_at,principal_cents,received_cents,payment_date,source_status,
    verification,'PORTAL_CONFIRMED','{"interestCents":1000,"penaltyCents":0,"additionCents":0,"discountCents":2990}',
    accounting_lines,review_reasons from internal_proesc.financial_snapshots`);
  assert.equal(await candidate(), false);
  const explicit = await composition();
  assert.equal(explicit.composicao_status, 'CONCILIADO_POR_CONFERENCIA_PROESC');
  assert.equal(Number(explicit.juros), 10);
  assert.equal(Number(explicit.desconto), 29.9);
  await db.exec('ROLLBACK');
  // The rule is not tied to 279.90 nor to configured discount/fee arithmetic.
  await db.exec('BEGIN');
  await db.exec(`update public.contas_receber set valor=100,valor_pago=75;
    update internal_proesc.financial_snapshots set principal_cents=10000,received_cents=7500;
    update internal_proesc.v2_invoice_observations set normalized=(normalized-'financialConfiguration')
      ||'{"principalCents":10000,"paidCents":7500}'`);
  assert.equal(await candidate(), true);
  assert.equal(Number((await composition()).desconto), 25);
  await db.exec('ROLLBACK');
  const acl = await scalar(`select jsonb_build_object('definer',p.prosecdef,'config',p.proconfig,
    'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),
    'service',has_function_privilege('service_role',p.oid,'EXECUTE')) value from pg_proc p
    where p.oid='internal_proesc.v2_net_discount_candidate(uuid,uuid)'::regprocedure`);
  assert.deepEqual(acl, { definer: false, config: ['search_path=""'], anon: false, authenticated: false, service: false });
  assert.deepEqual(await immutable(), before);
  console.log(`PASS net-discount policy: ${cases} negative guards, exact resolver hash/ACL, documentary priority, NULL evidence, no financial mutation`);
} finally { await db.close(); }
