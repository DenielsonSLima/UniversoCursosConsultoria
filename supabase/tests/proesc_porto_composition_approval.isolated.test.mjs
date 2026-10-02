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
  // Real historical resolver + real V2 guard; only unrelated catalog/auth are fixtures.
  const baseline = migration('20260913184000_proesc_explicit_payment_components.sql');
  await db.exec(baseline.slice(baseline.indexOf('create function internal_proesc.explicit_payment_component'), baseline.lastIndexOf('commit;')));
  for (let n = 1; n <= 15; n++) {
    const p = n >= 6 && n <= 9 ? porto : n >= 10 && n <= 13 ? aq : japo;
    const due = n === 5 ? '2026-09-16' : '2026-10-05';
    const payment = n <= 6 ? '2026-10-01' : '2026-09-29';
    await db.query(`insert into public.turmas values($1,'ENF-T38-INT-MAT',$2)`, [id(100 + n), p]);
    await db.query(`insert into public.contas_receber values(
      $1,$2,$3,$4,$5,279.90,260,$6,$7,'PAGO','SISTEMA_ANTERIOR','PARCELA',null,null,null,null,null)`,
    [id(n), id(200 + n), id(100 + n), id(300 + n), p, due, payment]);
    await db.query(`insert into internal_proesc.obligation_links values($1,$2,$3,$4,'3145','123',$5,true,null)`,
      [id(400 + n), id(n), id(200 + n), id(100 + n), String(1000 + n)]);
    await db.query(`insert into internal_proesc.class_scopes values($1,'ENF-T38-INT-MAT',$2,'3145','123','CONFIRMED')`,
      [id(100 + n), p]);
    await db.query(`insert into internal_proesc.v2_enrollment_links values($1,'3145',$2,$3,'123',$4)`,
      [id(200 + n), String(2000 + n), String(3000 + n), personHash]);
    await db.query(`insert into internal_proesc.financial_snapshots values($1,$2,'2026-10-02','2026-10-02',
      27990,26000,$3,'PAID','VERIFIED','API_V2_INVOICE_PAID',
      '{"interestCents":null,"penaltyCents":null,"additionCents":null,"discountCents":null}','[]','[]')`,
      [id(500 + n), id(400 + n), payment]);
    const normalized = {
      invoiceId: String(1000 + n), unitId: '3145', personId: String(3000 + n), sourceEnrollmentId: String(2000 + n),
      sourceClassId: '123', personHash, principalCents: 27990, paidCents: 26000,
      dueDate: due, paymentDate: payment, sourceStatus: 'PAGA', reviewReasons: [],
      financialConfiguration: { fineRate: '2', interestRate: '0.033', earlyDiscountCents: 1990,
        fixedDiscountCents: n === 5 ? 1990 : 0, earlyDiscountPercentage: '7.1' },
    };
    await db.query(`insert into internal_proesc.v2_invoice_observations values($1,$2,$3,'3145',$4,'PAGA',$5,'PRESERVED','2026-10-02','2026-10-02')`,
      [id(600 + n), id(400 + n), id(500 + n), String(1000 + n), JSON.stringify(normalized)]);
  }
  await db.exec(migration('20261002010800_proesc_v2_calculated_composition.sql'));
  const before = await immutable();
  const previousApprovals = await approvals();
  assert.equal(previousApprovals.length, 4);
  assert.equal((await composition(6)).composicao_status, 'NAO_DISCRIMINADA');
  const patch = migration('20261002011000_proesc_porto_composition_approval.sql');
  const failures = [
    ['no eligible payment', `update public.contas_receber set status='PENDENTE' where id='${id(6)}'`],
    ['received differs', `update public.contas_receber set valor_pago=259 where id='${id(6)}'`],
    ['different payment date', `update public.contas_receber set data_pagamento='2026-10-02' where id='${id(6)}'`],
    ['different due date', `update public.contas_receber set data_vencimento='2026-10-06' where id='${id(6)}'`],
    ['different source identity', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{invoiceId}','"999"') where id='${id(606)}'`],
    ['different source person', `update internal_proesc.v2_enrollment_links set source_person_id='999' where matricula_id='${id(206)}'`],
    ['configured fixed discount', `update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{financialConfiguration,fixedDiscountCents}','1990') where id='${id(606)}'`],
    ['override blocks', `insert into public.matriculas_tecnicas_financeiro_config values('${id(206)}',true)`],
    ['prior conflicting approval', `insert into internal_proesc.v2_composition_approvals values('${id(406)}','${id(507)}','USER_APPROVED_EARLY_PAYMENT_2026_10_01',now())`],
    ['ambiguous eligible scope', `
      update public.contas_receber set data_pagamento='2026-10-01' where id='${id(7)}';
      update internal_proesc.financial_snapshots set payment_date='2026-10-01' where id='${id(507)}';
      update internal_proesc.v2_invoice_observations set normalized=jsonb_set(normalized,'{paymentDate}','"2026-10-01"') where id='${id(607)}'`],
  ];
  for (const [label, sql] of failures) {
    await db.exec('BEGIN');
    await db.exec(sql);
    await assert.rejects(db.exec(patch), /exactly one reviewed|approval differs/, label);
    await db.exec('ROLLBACK');
    assert.deepEqual(await approvals(), previousApprovals, `${label}: no partial approval survives`);
  }
  await db.exec(patch);
  const afterApprovals = await approvals();
  assert.equal(afterApprovals.length, 5);
  assert.deepEqual(afterApprovals.filter((a) => a.link_id !== id(406)), previousApprovals);
  for (const n of [1, 2, 3, 4, 6]) {
    const result = await composition(n);
    assert.equal(result.composicao_status, 'CALCULADO_REGRA_INFORMADA_PROESC');
    assert.equal(Number(result.desconto), 19.9);
    assert.equal(Number(result.diferenca_nao_discriminada), 0);
    assert.equal(Number(result.valor_recebido), 260);
  }
  for (const n of [5, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const result = await composition(n);
    assert.equal(result.composicao_status, 'NAO_DISCRIMINADA');
    assert.equal(result.desconto, null);
    assert.equal(Number(result.diferenca_nao_discriminada), -19.9);
  }
  await db.exec(patch);
  assert.deepEqual(await approvals(), afterApprovals, 'Exact replay must preserve approval timestamp and identity');
  assert.deepEqual(await immutable(), before, 'Neither receipt nor immutable source evidence may change');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(await scalar(`select has_table_privilege($1,'internal_proesc.v2_composition_approvals','SELECT,INSERT,UPDATE,DELETE') value`, [role]), false);
  }
  console.log(`PASS: single Porto approval, real canonical composition + candidate, ${failures.length} fail-closed cases, exact replay, four Japo preserved, late + nine other candidates untouched, immutable evidence and private ACLs.`);
} finally { await db.close(); }
