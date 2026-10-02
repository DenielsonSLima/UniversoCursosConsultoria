import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const db = new PGlite();
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const japo = '44444444-4444-4444-4444-444444444444';
const porto = '31497afd-e2dd-4444-aa3d-8087c0ae0753';
const aq = '335fdbe4-b3b4-4622-aa7d-04c585455091';
const personHash = 'a'.repeat(64);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const composition = async (n) => (await db.query(`
  select r.* from public.contas_receber c cross join lateral
    public.resolve_integrated_receivable_financial_composition(c.id,c.valor,c.valor_pago,
      c.data_vencimento,c.data_pagamento,null,null,null,null,null,null,null,null,null) r
    where c.id=$1`, [id(n)])).rows[0];
const immutable = () => scalar(`select jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c),
  'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from internal_proesc.financial_snapshots s),
  'observations',(select jsonb_agg(to_jsonb(o) order by id) from internal_proesc.v2_invoice_observations o)) value`);
const approvals = () => scalar(`select jsonb_agg(to_jsonb(a) order by link_id) value from internal_proesc.v2_composition_approvals a`);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc; CREATE SCHEMA internal_academic;
    CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,cliente_id uuid,
      polo_id uuid,valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,status text,
      origem_pagamento text,tipo_lancamento text,gateway_provider text,gateway_payment_id text,
      manual_settlement_id uuid,gateway_financial_terms jsonb,regra_financeira_tecnica_snapshot jsonb);
    CREATE TABLE public.turmas(id uuid PRIMARY KEY,codigo text,polo_id uuid);
    CREATE TABLE public.matriculas_tecnicas_financeiro_config(matricula_id uuid,override_ativo boolean);
    CREATE TABLE internal_proesc.class_scopes(turma_id uuid PRIMARY KEY,class_code text,polo_id uuid,
      source_unit_id text,source_class_id text,phase text);
    CREATE TABLE internal_proesc.obligation_links(id uuid PRIMARY KEY,receivable_id uuid,matricula_id uuid,
      turma_id uuid,source_unit_id text,source_class_id text,source_key text,auto_enabled boolean,parent_link_id uuid);
    CREATE TABLE internal_proesc.financial_snapshots(id uuid PRIMARY KEY,link_id uuid,observed_at timestamptz,
      recorded_at timestamptz,principal_cents bigint,received_cents bigint,payment_date date,
      source_status text,verification text,evidence_kind text,components jsonb,accounting_lines jsonb,review_reasons jsonb);
    CREATE TABLE internal_proesc.v2_invoice_observations(id uuid PRIMARY KEY,link_id uuid,snapshot_id uuid,
      unit_id text,invoice_id text,source_status text,normalized jsonb,result text,observed_at timestamptz,recorded_at timestamptz);
    CREATE TABLE internal_proesc.v2_enrollment_links(matricula_id uuid,unit_id text,source_enrollment_id text,
      source_person_id text,source_class_id text,person_hash text);
    CREATE FUNCTION internal_proesc.person_document_hash(uuid) RETURNS text LANGUAGE sql AS $$ SELECT '${personHash}'::text $$;
    CREATE FUNCTION public.resolve_receivable_financial_composition(numeric,numeric,date,date,jsonb,uuid,
      timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)
    RETURNS TABLE(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,desconto numeric,
      diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
    LANGUAGE sql AS $$ SELECT $1,null::numeric,null::numeric,null::numeric,null::numeric,$2-$1,'FALLBACK'::text,$2 $$;
  `);
  // Real historical resolver + real V2 guard; only unrelated catalog/auth are fixtures.
  const baseline = migration('20260913184000_proesc_explicit_payment_components.sql');
  await db.exec(baseline.slice(baseline.indexOf('create function internal_proesc.explicit_payment_component'), baseline.lastIndexOf('commit;')));
  for (let n = 1; n <= 15; n++) {
    const classNumber = n >= 6 && n <= 9 ? 2 : n >= 10 && n <= 13 ? 3 : 1;
    const classCode = ['ENF-T43-INT-MAT', 'ENF-T45-SEM-PDF', 'ENF-T44-SEM-AQB'][classNumber - 1];
    const sourceClass = String(120 + classNumber);
    const p = n >= 6 && n <= 9 ? porto : n >= 10 && n <= 13 ? aq : japo;
    const due = n === 5 ? '2026-09-16' : '2026-10-05';
    const payment = n <= 6 ? '2026-10-01' : '2026-09-29';
    await db.query(`insert into public.turmas values($1,'${classCode}',$2) ON CONFLICT DO NOTHING`, [id(100 + classNumber), p]);
    await db.query(`insert into public.contas_receber values(
      $1,$2,$3,$4,$5,279.90,260,$6,$7,'PAGO','SISTEMA_ANTERIOR','PARCELA',null,null,null,null,null)`,
    [id(n), id(200 + n), id(100 + classNumber), id(300 + n), p, due, payment]);
    await db.query(`insert into internal_proesc.obligation_links values($1,$2,$3,$4,'3145','${sourceClass}',$5,true,null)`,
      [id(400 + n), id(n), id(200 + n), id(100 + classNumber), String(1000 + n)]);
    await db.query(`insert into internal_proesc.class_scopes values($1,'${classCode}',$2,'3145','${sourceClass}','CONFIRMED') ON CONFLICT DO NOTHING`,
      [id(100 + classNumber), p]);
    await db.query(`insert into internal_proesc.v2_enrollment_links values($1,'3145',$2,$3,'${sourceClass}',$4)`,
      [id(200 + n), String(2000 + n), String(3000 + n), personHash]);
    await db.query(`insert into internal_proesc.financial_snapshots values($1,$2,'2026-10-02','2026-10-02',
      27990,26000,$3,'PAID','VERIFIED','API_V2_INVOICE_PAID',
      '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}','[]','[]')`,
      [id(500 + n), id(400 + n), payment]);
    await db.query('insert into public.matriculas_tecnicas_financeiro_config values($1,false)', [id(200 + n)]);
    const normalized = {
      invoiceId: String(1000 + n), unitId: '3145', personId: String(3000 + n), sourceEnrollmentId: String(2000 + n),
      sourceClassId: sourceClass, personHash, principalCents: 27990, paidCents: 26000,
      dueDate: due, paymentDate: payment, sourceStatus: 'PAGA', reviewReasons: [],
      financialConfiguration: { fineRate: '2', interestRate: '0.033', earlyDiscountCents: 1990,
        fixedDiscountCents: n === 5 ? 1990 : 0, earlyDiscountPercentage: '7.1' },
    };
    await db.query(`insert into internal_proesc.v2_invoice_observations values($1,$2,$3,'3145',$4,'PAGA',$5,'PRESERVED','2026-10-02','2026-10-02')`,
      [id(600 + n), id(400 + n), id(500 + n), String(1000 + n), JSON.stringify(normalized)]);
  }
  await db.exec(migration('20261002010800_proesc_v2_calculated_composition.sql'));
  await db.exec(migration('20261002011000_proesc_porto_composition_approval.sql'));

  await db.exec(`
    ALTER TABLE public.turmas
      ADD COLUMN origem_financeira text DEFAULT 'LEGADO',
      ADD COLUMN financeiro_herdado boolean DEFAULT true,
      ADD COLUMN valor_parcela numeric DEFAULT 279.90,
      ADD COLUMN desconto_pontualidade numeric DEFAULT 19.90,
      ADD COLUMN juros_atraso numeric DEFAULT 2,
      ADD COLUMN multa_atraso_percentual numeric DEFAULT 2,
      ADD COLUMN aplicar_desconto_mensalidade boolean DEFAULT true,
      ADD COLUMN aplicar_multa_juros_mensalidade boolean DEFAULT true,
      ADD COLUMN regra_financeira_revisao integer DEFAULT 1,
      ADD COLUMN regra_financeira_fingerprint text DEFAULT repeat('b',64);
    -- The effective-rule producer has its own isolated suite. Model its canonical
    -- fields here; the new policy/candidate/resolver SQL is executed unchanged.
    CREATE FUNCTION internal_academic.technical_financial_effective_rule(uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE r public.turmas;
    BEGIN
      IF current_setting('test.rule_error',true)='true' THEN RAISE EXCEPTION 'Missing rule' USING ERRCODE='22023'; END IF;
      SELECT t.* INTO r FROM public.contas_receber c JOIN public.turmas t ON t.id=c.turma_id WHERE c.matricula_id=$1 LIMIT 1;
      RETURN jsonb_build_object('origem',coalesce(nullif(current_setting('test.rule_origin',true),''),'TURMA'),
        'identidade',jsonb_build_object('turmaFingerprint',r.regra_financeira_fingerprint,'turmaRevisao',r.regra_financeira_revisao),
        'cobranca',jsonb_build_object('mensalidade',jsonb_build_object('valor',r.valor_parcela::text,'habilitada',true)),
        'encargos',jsonb_build_object('descontoPontualidade',r.desconto_pontualidade::text),
        'aplicacao',jsonb_build_object('mensalidade',jsonb_build_object('desconto',r.aplicar_desconto_mensalidade)));
    END $$;
  `);
  const before = await immutable();
  const approvalsBefore = await approvals();
  assert.equal(approvalsBefore.length, 5);
  const patch = migration('20261002011200_proesc_v2_automatic_early_composition.sql');
  await db.exec('BEGIN');
  await db.exec(`update public.turmas set desconto_pontualidade=20 where id='${id(103)}'`);
  await assert.rejects(db.exec(patch), /three reviewed/);
  await db.exec('ROLLBACK');
  assert.equal(await scalar(`select to_regclass('internal_proesc.v2_automatic_composition_policies') value`), null);
  await db.exec(patch);
  assert.equal(await scalar('select count(*)::int value from internal_proesc.v2_automatic_composition_policies'), 3);
  assert.deepEqual(await immutable(), before, 'Installing authorization cannot mutate financial evidence');
  assert.deepEqual(await approvals(), approvalsBefore, 'The five frozen approvals remain byte-identical');
  for (const n of [1, 2, 3, 4, 6]) {
    assert.equal((await composition(n)).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  }
  for (const n of [5, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const result = await composition(n);
    assert.equal(result.composicao_status, 'NAO_DISCRIMINADA', `Historical/late fixture ${n}`);
    assert.equal(result.desconto, null);
  }
  // A new payment arrives after policy activation. No per-receipt approval exists.
  await db.exec(`
    INSERT INTO public.contas_receber SELECT (jsonb_populate_record(null::public.contas_receber,
      to_jsonb(c)||jsonb_build_object('id','${id(16)}','data_pagamento','2026-10-01'))).*
      FROM public.contas_receber c WHERE id='${id(10)}';
    INSERT INTO internal_proesc.obligation_links SELECT (jsonb_populate_record(null::internal_proesc.obligation_links,
      to_jsonb(l)||jsonb_build_object('id','${id(416)}','receivable_id','${id(16)}','source_key','1016'))).*
      FROM internal_proesc.obligation_links l WHERE id='${id(410)}';
    INSERT INTO internal_proesc.financial_snapshots SELECT (jsonb_populate_record(null::internal_proesc.financial_snapshots,
      to_jsonb(s)||jsonb_build_object('id','${id(516)}','link_id','${id(416)}','payment_date','2026-10-01'))).*
      FROM internal_proesc.financial_snapshots s WHERE id='${id(510)}';
    INSERT INTO internal_proesc.v2_invoice_observations SELECT (jsonb_populate_record(null::internal_proesc.v2_invoice_observations,
      to_jsonb(o)||jsonb_build_object('id','${id(616)}','link_id','${id(416)}','snapshot_id','${id(516)}','invoice_id','1016',
        'normalized',o.normalized||'{"invoiceId":"1016","paymentDate":"2026-10-01"}'::jsonb))).*
      FROM internal_proesc.v2_invoice_observations o WHERE id='${id(610)}';
  `);
  const newResult = await composition(16);
  assert.equal(newResult.composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  assert.equal(Number(newResult.desconto), 19.90);
  assert.equal(Number(newResult.diferenca_nao_discriminada), 0);
  assert.equal(Number(newResult.valor_recebido), 260);
  assert.deepEqual(await approvals(), approvalsBefore, 'Automatic calculation must not manufacture frozen evidence');
  const afterArrival = await immutable();
  const failures = [
    ['rule revision changed', `update public.turmas set regra_financeira_revisao=2 where id='${id(103)}'`],
    ['rule fingerprint changed', `update public.turmas set regra_financeira_fingerprint=repeat('c',64) where id='${id(103)}'`],
    ['rule amount changed', `update public.turmas set desconto_pontualidade=20 where id='${id(103)}'`],
    ['rule disabled', `update public.turmas set aplicar_desconto_mensalidade=false where id='${id(103)}'`],
    ['policy scope absent', `delete from internal_proesc.v2_automatic_composition_policies where turma_id='${id(103)}'`],
    ['policy unit mismatch', `update internal_proesc.obligation_links set source_unit_id='999' where id='${id(416)}'`],
    ['override active', `update public.matriculas_tecnicas_financeiro_config set override_ativo=true where matricula_id='${id(210)}'`],
    ['config missing', `delete from public.matriculas_tecnicas_financeiro_config where matricula_id='${id(210)}'`],
    ['effective individual rule', `select set_config('test.rule_origin','INDIVIDUAL',true)`],
    ['effective invalid rule', `select set_config('test.rule_error','true',true)`],
    ['source identity mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{invoiceId}','"999"') where id='${id(616)}'`],
    ['source person mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{personHash}','"other"') where id='${id(616)}'`],
    ['fixed plus early not added', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{financialConfiguration,fixedDiscountCents}','1990') where id='${id(616)}'`],
    ['partial provider status', `update internal_proesc.v2_invoice_observations set source_status='PAGAMENTO PARCIAL' where id='${id(616)}'`],
    ['provider now overdue', `update internal_proesc.v2_invoice_observations set source_status='VENCIDO' where id='${id(616)}'`],
    ['source cancellation', `update internal_proesc.financial_snapshots set source_status='CANCELED' where id='${id(516)}'`],
    ['late payment', `
      update public.contas_receber set data_vencimento='2026-09-16' where id='${id(16)}';
      update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{dueDate}','"2026-09-16"') where id='${id(616)}'`],
    ['future payment', `
      update public.contas_receber set data_pagamento=(now() AT TIME ZONE 'America/Maceio')::date+1,
        data_vencimento=(now() AT TIME ZONE 'America/Maceio')::date+5 where id='${id(16)}';
      update internal_proesc.financial_snapshots set payment_date=(now() AT TIME ZONE 'America/Maceio')::date+1 where id='${id(516)}';
      update internal_proesc.v2_invoice_observations set normalized=normalized||jsonb_build_object(
        'paymentDate',((now() AT TIME ZONE 'America/Maceio')::date+1)::text,
        'dueDate',((now() AT TIME ZONE 'America/Maceio')::date+5)::text) where id='${id(616)}'`],
    ['paid amount changed', `update public.contas_receber set valor_pago=259 where id='${id(16)}'`],
    ['Banese remains separate', `update public.contas_receber set gateway_provider='BANESE' where id='${id(16)}'`],
    ['manual settlement remains separate', `update public.contas_receber set manual_settlement_id='${id(999)}' where id='${id(16)}'`],
    ['portal evidence blocks automatic inference', `insert into internal_proesc.financial_snapshots
      select '${id(888)}',link_id,'2026-09-01','2026-09-01',27990,null,null,'OPEN','VERIFIED','PORTAL_CONFIRMED',components,'[]','[]'
      from internal_proesc.financial_snapshots where id='${id(516)}'`],
  ];
  for (const [label, sql] of failures) {
    await db.exec('BEGIN');
    try {
      await db.exec(sql);
      assert.notEqual((await composition(16)).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC', label);
      assert.equal((await composition(1)).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC', `${label}: earlier explicit approval preserved`);
    } finally { await db.exec('ROLLBACK'); }
  }
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.v2_invoice_observations
    select '${id(889)}',link_id,snapshot_id,unit_id,invoice_id,source_status,normalized,'PRESERVED','2026-10-03','2026-10-03'
    from internal_proesc.v2_invoice_observations where id='${id(616)}'`);
  assert.equal((await composition(16)).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  await db.exec('ROLLBACK');
  assert.deepEqual(await immutable(), afterArrival, 'Reads preserve all receipts and source observations');
  assert.deepEqual(await approvals(), approvalsBefore);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar(`select has_table_privilege($1,'internal_proesc.v2_automatic_composition_policies','SELECT,INSERT,UPDATE,DELETE') value`, [role]), false);
    assert.equal(await scalar(`select has_function_privilege($1,'internal_proesc.v2_automatic_composition_allowed(uuid)','EXECUTE') value`, [role]), false);
  }
  console.log(`PASS: three pinned class policies, five existing approvals, nine September payments and late residual unchanged, new payment automatic, ${failures.length} rejection guards, preserved repeat, no financial writes, private ACLs.`);
} finally { await db.close(); }
