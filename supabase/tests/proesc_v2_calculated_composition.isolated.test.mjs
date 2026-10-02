import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PGLITE_MODULE_PATH;
const { PGlite } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : '@electric-sql/pglite');
const migration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
if (process.argv.includes('--preview-sql')) {
  // Emit a SELECT-only preview from the exact eligibility implementation so the
  // remote MCP rehearsal cannot accidentally diverge from the migration's guards.
  const predicate = migration('20261002010800_proesc_v2_calculated_composition.sql')
    .split('AS $candidate$')[1].split('$candidate$;')[0].trim().replace(/;\s*$/, '')
    .replaceAll('p_receivable_id', 'x.receivable_id').replaceAll('p_snapshot_id', 'x.snapshot_id');
  console.log(`WITH scoped AS (
    SELECT c.id receivable_id,c.polo_id,c.data_pagamento,c.data_vencimento,s.id snapshot_id
    FROM public.contas_receber c JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
    JOIN LATERAL (SELECT id FROM internal_proesc.financial_snapshots s WHERE s.link_id=l.id
      ORDER BY observed_at DESC,recorded_at DESC,id DESC LIMIT 1) s ON true WHERE c.status='PAGO'
  ), eligible AS (SELECT * FROM scoped x WHERE (${predicate}))
  SELECT polo_id,data_pagamento,data_vencimento,count(*) candidate_count,
    count(*) FILTER (WHERE polo_id='44444444-4444-4444-4444-444444444444'
      AND data_pagamento='2026-10-01' AND data_vencimento='2026-10-05') approved_count
  FROM eligible GROUP BY 1,2,3 ORDER BY 1,2,3;`);
  process.exit(0);
}
const db = new PGlite();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = '44444444-4444-4444-4444-444444444444';
const personHash = 'a'.repeat(64);
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const composition = async (n = 1, paid = 260) => (await db.query(`
  select * from public.resolve_integrated_receivable_financial_composition(
    $1,279.90,$2,(select data_vencimento from public.contas_receber where id=$1),
    '2026-10-01',null,null,null,null,null,null,null,null,null)`, [id(n), paid])).rows[0];
const immutable = () => scalar(`select jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c),
  'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from internal_proesc.financial_snapshots s),
  'observations',(select jsonb_agg(to_jsonb(o) order by id) from internal_proesc.v2_invoice_observations o)) value`);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA internal_proesc;
    CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,matricula_id uuid,turma_id uuid,cliente_id uuid,
      polo_id uuid,valor numeric,valor_pago numeric,data_vencimento date,data_pagamento date,status text,
      origem_pagamento text,tipo_lancamento text,gateway_provider text,gateway_payment_id text,
      manual_settlement_id uuid,gateway_financial_terms jsonb,regra_financeira_tecnica_snapshot jsonb);
    CREATE TABLE public.turmas(id uuid PRIMARY KEY,codigo text,polo_id uuid);
    CREATE TABLE public.matriculas_tecnicas_financeiro_config(matricula_id uuid,override_ativo boolean);
    CREATE TABLE internal_proesc.class_scopes(turma_id uuid,class_code text,polo_id uuid,
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
  // Load the actual canonical helpers/resolver, skipping only its previous-version
  // installation hash precondition. The new migration's hash guard is unmodified.
  const baseline = migration('20260913184000_proesc_explicit_payment_components.sql');
  await db.exec(baseline.slice(baseline.indexOf('create function internal_proesc.explicit_payment_component'), baseline.lastIndexOf('commit;')));
  for (let n = 1; n <= 6; n++) {
    const p = n === 6 ? id(999) : polo;
    const due = n === 5 ? '2026-09-16' : '2026-10-05';
    await db.query(`insert into public.turmas values($1,'ENF-T38-INT-MAT',$2)`, [id(100 + n), p]);
    await db.query(`insert into public.contas_receber values(
      $1,$2,$3,$4,$5,279.90,260,$6,'2026-10-01','PAGO','SISTEMA_ANTERIOR','PARCELA',null,null,null,null,null)`,
    [id(n), id(200 + n), id(100 + n), id(300 + n), p, due]);
    await db.query(`insert into internal_proesc.obligation_links values($1,$2,$3,$4,'3145','123',$5,true,null)`,
      [id(400 + n), id(n), id(200 + n), id(100 + n), String(1000 + n)]);
    await db.query(`insert into internal_proesc.class_scopes values($1,'ENF-T38-INT-MAT',$2,'3145','123','CONFIRMED')`,
      [id(100 + n), p]);
    await db.query(`insert into internal_proesc.v2_enrollment_links values($1,'3145',$2,$3,'123',$4)`,
      [id(200 + n), String(2000 + n), String(3000 + n), personHash]);
    await db.query(`insert into internal_proesc.financial_snapshots values($1,$2,'2026-10-02','2026-10-02',
      27990,26000,'2026-10-01','PAID','VERIFIED','API_V2_INVOICE_PAID',
      '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}','[]','[]')`,
      [id(500 + n), id(400 + n)]);
    const normalized = {
      invoiceId: String(1000 + n), unitId: '3145', personId: String(3000 + n), sourceEnrollmentId: String(2000 + n),
      sourceClassId: '123', personHash, principalCents: 27990, paidCents: 26000,
      dueDate: due, paymentDate: '2026-10-01', sourceStatus: 'PAGA', reviewReasons: [],
      financialConfiguration: { fineRate: '2', interestRate: '0.033', earlyDiscountCents: 1990,
        fixedDiscountCents: n === 5 ? 1990 : 0, earlyDiscountPercentage: '7.1' },
    };
    await db.query(`insert into internal_proesc.v2_invoice_observations values($1,$2,$3,'3145',$4,'PAGA',$5,'APPLIED','2026-10-02','2026-10-02')`,
      [id(600 + n), id(400 + n), id(500 + n), String(1000 + n), JSON.stringify(normalized)]);
  }
  const before = await immutable();
  const old = await composition();
  assert.equal(old.composicao_status, 'NAO_DISCRIMINADA');
  assert.equal(Number(old.diferenca_nao_discriminada), -19.9);
  const patch = migration('20261002010800_proesc_v2_calculated_composition.sql');
  await db.exec(`BEGIN; update internal_proesc.v2_invoice_observations set result='REVIEW' where id='${id(601)}'`);
  await assert.rejects(db.exec(patch), /exactly four reviewed/);
  await db.exec('ROLLBACK');
  assert.equal(await scalar(`select to_regclass('internal_proesc.v2_composition_approvals') value`), null);
  const signature = 'public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)';
  const baselineDefinition = await scalar('select pg_get_functiondef($1::regprocedure) value', [signature]);
  await db.exec('BEGIN');
  await db.exec(baselineDefinition.replace('declare\n', 'declare\n-- simulated unreviewed drift\n'));
  await assert.rejects(db.exec(patch), /resolver drift/);
  await db.exec('ROLLBACK');
  assert.equal(await scalar(`select to_regclass('internal_proesc.v2_composition_approvals') value`), null);
  await db.exec(patch);
  assert.equal(await scalar('select count(*)::int value from internal_proesc.v2_composition_approvals'), 4);
  for (let n = 1; n <= 4; n++) {
    const result = await composition(n);
    assert.equal(result.composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
    for (const name of ['juros', 'multa', 'acrescimo', 'diferenca_nao_discriminada']) assert.equal(Number(result[name]), 0);
    assert.equal(Number(result.desconto), 19.9);
    assert.equal(Number(result.valor_recebido), 260);
  }
  for (const n of [5, 6]) {
    const result = await composition(n);
    assert.equal(result.composicao_status, 'NAO_DISCRIMINADA');
    assert.equal(result.desconto, null);
    assert.equal(Number(result.diferenca_nao_discriminada), -19.9);
  }
  assert.equal(await scalar(`select internal_proesc.v2_calculated_composition_candidate('${id(6)}','${id(506)}') value`), true,
    'A legitimate but unapproved other-polo candidate must remain untouched');
  // 0102 exact-paid branch reuses the same snapshot_id on subsequent polls.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.v2_invoice_observations
    select '${id(889)}',link_id,snapshot_id,unit_id,invoice_id,source_status,normalized,'PRESERVED','2026-10-03','2026-10-03'
    from internal_proesc.v2_invoice_observations where id='${id(601)}'`);
  assert.equal((await composition()).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  await db.exec('ROLLBACK');
  const mutations = [
    ['local paid mismatch', `update public.contas_receber set valor_pago=259 where id='${id(1)}'`],
    ['local date mismatch', `update public.contas_receber set data_pagamento='2026-09-30' where id='${id(1)}'`],
    ['gateway protected', `update public.contas_receber set gateway_provider='BANESE' where id='${id(1)}'`],
    ['manual protected', `update public.contas_receber set manual_settlement_id='${id(777)}' where id='${id(1)}'`],
    ['override', `insert into public.matriculas_tecnicas_financeiro_config values('${id(201)}',true)`],
    ['special terms', `update public.contas_receber set regra_financeira_tecnica_snapshot='{"origem":"INDIVIDUAL"}' where id='${id(1)}'`],
    ['scope not confirmed', `update internal_proesc.class_scopes set phase='REVIEW' where turma_id='${id(101)}'`],
    ['different class', `update public.turmas set codigo='OTHER' where id='${id(101)}'`],
    ['pin mismatch', `update internal_proesc.v2_enrollment_links set source_person_id='999' where matricula_id='${id(201)}'`],
    ['snapshot changed', `update internal_proesc.financial_snapshots set received_cents=25900 where id='${id(501)}'`],
    ['partial label', `update internal_proesc.v2_invoice_observations set source_status='PAGAMENTO PARCIAL' where id='${id(601)}'`],
    ['review state', `update internal_proesc.v2_invoice_observations set result='REVIEW' where id='${id(601)}'`],
    ['snapshot association lost', `update internal_proesc.v2_invoice_observations set snapshot_id=null where id='${id(601)}'`],
    ['fixed + early never summed', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{financialConfiguration,fixedDiscountCents}','1990') where id='${id(601)}'`],
    ['missing discount', `update internal_proesc.v2_invoice_observations set normalized=normalized-'financialConfiguration' where id='${id(601)}'`],
    ['source date mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{paymentDate}','"2026-09-30"') where id='${id(601)}'`],
    ['source identity mismatch', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{personHash}','"other"') where id='${id(601)}'`],
    ['disabled link', `update internal_proesc.obligation_links set auto_enabled=false where id='${id(401)}'`],
    ['approval revoked', `delete from internal_proesc.v2_composition_approvals where link_id='${id(401)}'`],
    ['portal history blocks calculation', `insert into internal_proesc.financial_snapshots
      select '${id(888)}',link_id,'2026-09-01','2026-09-01',27990,null,null,'OPEN','VERIFIED','PORTAL_CONFIRMED',components,'[]','[]'
      from internal_proesc.financial_snapshots where id='${id(501)}'`],
    ['old cancellation blocks calculation', `insert into internal_proesc.financial_snapshots
      select '${id(888)}',link_id,'2026-09-01','2026-09-01',27990,null,null,'CANCELED','REVIEW','UNRESOLVED',components,'[]','[]'
      from internal_proesc.financial_snapshots where id='${id(501)}'`],
    ['newer observation conflict', `insert into internal_proesc.v2_invoice_observations
      select '${id(888)}',link_id,null,unit_id,invoice_id,'VENCIDO',normalized,'REVIEW','2026-10-03','2026-10-03'
      from internal_proesc.v2_invoice_observations where id='${id(601)}'`],
  ];
  for (const [label, mutation] of mutations) {
    await db.exec('BEGIN');
    try {
      await db.exec(mutation);
      const result = await composition();
      assert.notEqual(result.composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC', label);
      assert.equal(result.desconto, null, label);
    } finally { await db.exec('ROLLBACK'); }
  }
  // A complete stored portal proof still wins, with its existing provenance.
  await db.exec('BEGIN');
  await db.exec(`insert into internal_proesc.financial_snapshots
    select '${id(888)}',link_id,'2026-10-01','2026-10-01',27990,26000,'2026-10-01','PAID','VERIFIED',
      'PORTAL_CONFIRMED','{"interestCents":0,"penaltyCents":0,"additionCents":0,"discountCents":1990}','[]','[]'
    from internal_proesc.financial_snapshots where id='${id(501)}'`);
  assert.equal((await composition()).composicao_status, 'CONCILIADO_POR_CONFERENCIA_PROESC');
  await db.exec('ROLLBACK');
  // Historical V1 calculations remain local, with no external lookup involved.
  await db.exec('BEGIN');
  await db.exec(`update internal_proesc.financial_snapshots set evidence_kind='API_PAYMENT_TOTAL' where id='${id(501)}'`);
  assert.equal((await composition()).composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
  await db.exec('ROLLBACK');
  assert.deepEqual(await immutable(), before, 'Read-side adaptation must not change receipts or evidence');
  assert.equal(await scalar(`select has_table_privilege('authenticated','internal_proesc.v2_composition_approvals','select') value`), false);
  assert.equal(await scalar(`select has_function_privilege('service_role','internal_proesc.v2_calculated_composition_candidate(uuid,uuid)','execute') value`), false);
  assert.equal(await scalar(`select has_function_privilege('authenticated',$1,'execute') value`, [signature]), false);
  assert.equal(await scalar(`select has_function_privilege('service_role',$1,'execute') value`, [signature]), true);
  console.log(`PASS: actual canonical SQL, four approved calculations, late and unapproved excluded, ${mutations.length} adversarial guards, portal/V1 preservation, ACLs and immutable finances.`);
} finally { await db.close(); }
