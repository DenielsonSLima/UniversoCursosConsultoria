import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const db = new PGlite();
const source = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const sqlFunction = (text, name) => {
  const start = text.search(new RegExp(`create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const tail = text.slice(start);
  const delimiter = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1];
  return tail.slice(0, tail.indexOf(`${delimiter};`) + delimiter.length + 1);
};
const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0].value;
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const polo = id(1000), other = id(1001), turma = id(2000), aluno = id(3000), matricula = id(4000);
const fixedClock = (sql) => sql.replaceAll("(now() at time zone 'America/Maceio')::date", "date '2026-10-02'");
const page = (context = 'MONTHLY', number = 1, size = 20, scope = polo, month = '2026-09-01') =>
  scalar('select public.get_caixa_review_pending_page_secure($1,$2,$3,$4,$5) value', [scope, month, context, number, size]);
const summary = (scope = polo, month = '2026-09-01') =>
  scalar('select public.get_caixa_receivables_position_secure($1,$2) value', [scope, month]);
const fingerprint = () => scalar(`select md5(jsonb_build_object(
  'receipts',(select jsonb_agg(to_jsonb(c) order by id) from public.contas_receber c),
  'snapshots',(select jsonb_agg(to_jsonb(s) order by id) from internal_proesc.financial_snapshots s),
  'links',(select jsonb_agg(to_jsonb(l) order by id) from internal_proesc.obligation_links l))::text) value`);

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    set test.role='service_role'; set test.uid='present'; set test.gestor='true';
    set test.global='false'; set test.module='caixa'; set test.tab='receber';
    create schema auth; create schema internal_contas; create schema internal_proesc;
    create function auth.jwt() returns jsonb language sql as $$
      select jsonb_build_object('role',coalesce(current_setting('test.role',true),'service_role')) $$;
    create function auth.uid() returns uuid language sql as $$
      select case when current_setting('test.uid',true)='none' then null else '${id(9000)}'::uuid end $$;
    create function public.is_gestor() returns boolean language sql as $$
      select coalesce(current_setting('test.gestor',true),'true')='true' $$;
    create function public.gestor_has_any_global_module(text[]) returns boolean language sql as $$
      select coalesce(current_setting('test.global',true),'false')='true'
        and coalesce(current_setting('test.module',true),'caixa')=any($1) $$;
    create function public.gestor_has_any_module_for_polo(text[],uuid) returns boolean language sql as $$
      select $2='${polo}'::uuid and coalesce(current_setting('test.module',true),'caixa')=any($1) $$;
    create function public.gestor_has_effective_financeiro_tab(text) returns boolean language sql as $$
      select coalesce(current_setting('test.tab',true),'receber')=$1 $$;
    create table public.contas_receber(id uuid primary key,polo_id uuid,matricula_id uuid,turma_id uuid,cliente_id uuid,
      status text,valor numeric,valor_pago numeric,data_vencimento date not null,data_pagamento date,
      origem_cronograma_id text,origem_pagamento text,updated_at timestamptz default '2026-09-01',
      regra_financeira_tecnica_snapshot jsonb,gateway_payment_id text,gateway_boleto_nosso_numero text,
      gateway_provider text,gateway_creation_token text,asaas_payment_id text,gateway_submission_status text,
      gateway_submission_channel text,nosso_numero_asaas text,manual_settlement_id uuid,
      gateway_boleto_linha_digitavel text,gateway_boleto_codigo_barras text,gateway_pix_payload text,gateway_pix_encoded_image text);
    create table public.matriculas(id uuid primary key,aluno_id uuid,turma_id uuid);
    create table public.parceiros(id uuid primary key,nome text,matricula_acesso text,cpf_cnpj text);
    create table public.turmas(id uuid primary key,polo_id uuid,codigo text,nome text);
    create table public.emprestimos_financeiros(conta_receber_id uuid);
    create table public.payment_gateway_cnab_records(receivable_id uuid,provider_code text,status text);
    create table internal_proesc.obligation_links(id uuid primary key,receivable_id uuid unique,
      matricula_id uuid,turma_id uuid,source_unit_id text,source_class_id text,source_key text,
      parent_link_id uuid,confirmed_at timestamptz default '2026-08-01');
    create table internal_proesc.class_scopes(turma_id uuid,source_unit_id text,source_class_id text,phase text,polo_id uuid);
    create table internal_proesc.financial_snapshots(id uuid primary key,link_id uuid,observed_at timestamptz,
      recorded_at timestamptz,verification text,source_status text,principal_cents bigint,received_cents bigint,
      payment_date date,evidence_kind text,review_reasons jsonb,collector_review_reasons jsonb,
      open_evidence jsonb,components jsonb,accounting_lines jsonb);
    create table internal_proesc.v2_invoice_observations(id uuid default gen_random_uuid(),snapshot_id uuid,
      invoice_id text,source_status text,observed_at timestamptz,recorded_at timestamptz);
    insert into public.parceiros values('${aluno}','Aluno de teste','MAT-TESTE','DO_NOT_EXPOSE');
    insert into public.turmas values('${turma}','${polo}','T-TESTE','Turma de teste');
    insert into public.matriculas values('${matricula}','${aluno}','${turma}');
    insert into internal_proesc.class_scopes values('${turma}','3145','123','CONFIRMED','${polo}');
  `);
  const historicalMonthly = source('20260913010000_caixa_monthly_delinquency.sql');
  await db.exec(sqlFunction(historicalMonthly, 'internal_contas.caixa_monthly_receivable_state'));
  await db.exec(sqlFunction(source('20260913132033_caixa_open_receivables_evidence.sql'),
    'internal_contas.caixa_proesc_open_receivable_verified'));
  await db.exec(sqlFunction(source('20260913000000_reconciliation_source_projection.sql'),
    'internal_proesc.reconciliation_source_system'));
  const retained = source('20260926121636_preserve_explicit_caixa_proesc_evidence.sql');
  await db.exec(sqlFunction(retained, 'internal_contas.caixa_proesc_uninformative_observation'));
  await db.exec(sqlFunction(retained, 'internal_contas.caixa_proesc_effective_snapshot'));
  await db.exec(sqlFunction(historicalMonthly, 'internal_contas.caixa_monthly_delinquency').replace(
    `from internal_proesc.financial_snapshots s where s.link_id=l.id
      order by s.observed_at desc,s.recorded_at desc,s.id desc limit 1`,
    'from internal_contas.caixa_proesc_effective_snapshot(c,l.id) s'));

  const add = async (n, options = {}) => {
    const o = { status: 'PENDENTE', due: '2026-09-10', source: 'PROESC', verification: 'VERIFIED',
      sourceStatus: 'OPEN', paid: 0, payment: null, scope: polo, ...options };
    await db.query(`insert into public.contas_receber(id,polo_id,matricula_id,turma_id,cliente_id,status,valor,
      valor_pago,data_vencimento,data_pagamento,origem_pagamento,gateway_provider,origem_cronograma_id)
      values($1,$2,$3,$4,$5,$6,100,$7,$8,$9,$10,$11,$12)`,
    [id(n),o.scope,matricula,turma,aluno,o.status,o.paid,o.due,o.payment,
      o.source === 'PROESC' ? 'SISTEMA_ANTERIOR' : o.source,
      o.source === 'BANESE' ? 'banese' : null,o.unlinked ? `PROESC-V1:${n}` : null]);
    if (o.source !== 'PROESC' || o.unlinked) return;
    await db.query(`insert into internal_proesc.obligation_links(id,receivable_id,matricula_id,turma_id,
      source_unit_id,source_class_id,source_key) values($1,$1,$2,$3,'3145','123',$4)`, [id(n),matricula,turma,String(n)]);
    await db.query(`insert into internal_proesc.financial_snapshots(id,link_id,observed_at,recorded_at,
      verification,source_status,principal_cents,received_cents,payment_date,evidence_kind,review_reasons,
      collector_review_reasons,components,accounting_lines)
      values($1,$1,'2026-10-01','2026-10-01',$2,$3,$4,$5,$6,'API_V2_INVOICE_PAID','[]','[]','{}','[]')`,
    [id(n),o.verification,o.sourceStatus,o.principalCents ?? 10000,o.status === 'PAGO' ? o.paid * 100 : null,o.payment]);
  };
  await add(1);
  await add(2,{status:'PAGO',sourceStatus:'PAID',payment:'2026-09-10',paid:80});
  await add(3,{status:'PAGO',sourceStatus:'PAID',payment:'2026-10-01',paid:80});
  await add(4,{verification:'REVIEW',sourceStatus:'UNKNOWN'});
  await add(5,{status:'CANCELADO',sourceStatus:'CANCELED'});
  await add(6,{due:'2027-01-10'});
  await add(7,{due:'2026-08-10'});
  await add(8);
  await add(9,{source:'LOCAL'});
  await add(10,{source:'LOCAL'});
  await add(11,{source:'BANESE'});
  await add(12,{source:'LOCAL',scope:other});
  await add(13,{source:'LOCAL',scope:null});
  await add(14,{unlinked:true});
  await add(15,{principalCents:9000});
  await add(16,{source:'LOCAL',paid:10});
  await add(17,{source:'LOCAL',status:'PAGO',paid:80});
  await add(18,{status:'PAGO',sourceStatus:'PAID',paid:110,payment:'2026-09-20'});
  await add(19,{due:'2026-10-02'});
  await add(20,{due:'2026-09-30'});
  await add(21,{due:'2027-02-10',verification:'REVIEW',sourceStatus:'CANCELED'});
  await add(22,{source:'LOCAL'});
  await add(23);
  await db.exec(`insert into public.emprestimos_financeiros values('${id(8)}');
    update public.contas_receber set regra_financeira_tecnica_snapshot='{"cicloManual":{}}' where id in('${id(9)}','${id(22)}');
    insert into public.payment_gateway_cnab_records values('${id(22)}','banese','ACTIVATED');
    update public.contas_receber set gateway_provider='banese' where id='${id(23)}';`);
  await db.exec(`update internal_proesc.financial_snapshots
    set evidence_kind='API_V2_INVOICE_REVIEW',collector_review_reasons='["PROVIDER_PAYMENT_STATUS_REQUIRES_REVIEW"]'
    where id='${id(4)}';
    insert into internal_proesc.v2_invoice_observations(snapshot_id,invoice_id,source_status,observed_at,recorded_at)
      values('${id(4)}','4','PAGAMENTO PARCIAL','2026-10-01','2026-10-01');
    update public.contas_receber set matricula_id=null,turma_id=null where id='${id(16)}';`);
  const before = await fingerprint();
  await db.exec(fixedClock(source('20261002011400_caixa_review_drilldown.sql')));
  await db.exec(fixedClock(source('20261002011500_caixa_receivables_position.sql')));
  assert.equal(await fingerprint(),before,'DDL must not change evidence or financial facts');
  const s = (await summary()).data;
  assert.equal(s.dataCorte,'2026-09-30');
  assert.equal(s.monthly.openConfirmed,'800.00');
  assert.equal(s.monthly.overdue,'800.00');
  assert.equal(s.monthly.toDue,'0.00');
  assert.equal(s.monthly.reviewCount,4);
  assert.equal(s.portfolio.openConfirmed,'900.00');
  assert.equal(s.portfolio.overdue,'700.00');
  assert.equal(s.portfolio.toDue,'200.00');
  assert.equal(s.portfolio.reviewCount,7);
  const canonical = await scalar(`select internal_contas.caixa_monthly_delinquency($1,'2026-09-01','2026-10-02') value`,[polo]);
  assert.equal(s.monthly.overdue,Number(canonical.receber_vencido).toFixed(2));
  assert.equal(s.monthly.reviewCount,canonical.inadimplencia_mensal.quantidade_em_conferencia);
  assert.equal(s.monthly.reviewNominal,Number(canonical.inadimplencia_mensal.valor_nominal_em_conferencia).toFixed(2));
  for (const context of ['MONTHLY','FUTURE']) {
    const expected = context === 'MONTHLY' ? s.monthly : s.portfolio;
    const all = (await page(context,1,100)).data;
    assert.equal(all.totalCount,expected.reviewCount);
    assert.equal(all.totalNominal,expected.reviewNominal);
    assert.equal(all.items.length,all.totalCount);
    assert.equal(all.items.reduce((sum,item) => sum+Number(item.valorNominal),0).toFixed(2),all.totalNominal);
    const pages = [];
    for (let n=1;n<=Math.ceil(all.totalCount/2);n++) pages.push(...(await page(context,n,2)).data.items);
    assert.deepEqual(pages,all.items,'stable server pagination includes every pending row once');
    assert.deepEqual((await page(context,99,2)).data.items,[]);
    assert.ok(!JSON.stringify(all).includes('DO_NOT_EXPOSE'));
    assert.ok(all.items.every(item => item.motivos.length>0 && item.matriculaCodigo==='MAT-TESTE'));
  }
  const general = (await page('FUTURE')).data.items;
  assert.ok(general.some(item=>item.proescRef==='21' && item.motivos[0].codigo==='SOURCE_STATE_REVIEW'));
  assert.ok(general.some(item=>item.proescRef==='4' && item.motivos[0].codigo==='V2_PARTIAL_PAYMENT_REVIEW'));
  assert.ok(general.some(item=>item.id===id(16) && item.alunoNome==='Aluno de teste' && item.turmaNome===null));
  assert.ok(!general.some(item=>['2','3','18'].includes(item.proescRef)),'known paid proof is not incomplete composition');
  const october = (await summary(polo,'2026-10-01')).data;
  assert.equal(october.monthly.openConfirmed,'100.00');
  assert.equal(october.monthly.overdue,'0.00','due today is not overdue');
  assert.equal(october.monthly.toDue,'100.00');
  assert.equal(october.portfolio.openConfirmed,'800.00','discounted paid-after-cut settles entire nominal');
  assert.equal((await page('MONTHLY',1,20,polo,'2026-10-01')).data.totalPages,1);
  assert.equal((await summary(null)).data.portfolio.openConfirmed,'1100.00','authorized global includes unassigned and other polo');
  assert.equal((await summary(other)).data.portfolio.openConfirmed,'100.00');
  await db.exec("set test.role='authenticated'; set test.module='caixa';");
  assert.equal((await summary()).success,true);
  for (const read of [()=>summary(other),()=>page('MONTHLY',1,20,other),()=>summary(null),()=>page('FUTURE',1,20,null)]) {
    await assert.rejects(read,e=>e.code==='42501');
  }
  for (const setting of ["set test.uid='none'","set test.gestor='false'","set test.module='outro'",
    "set test.module='financeiro';set test.tab='despesas'"]) {
    await db.exec('begin;'+setting);
    await assert.rejects(()=>summary(),e=>e.code==='42501');
    await db.exec('rollback;');
  }
  await db.exec("set test.module='financeiro';set test.tab='receber';");
  assert.equal((await summary()).success,true);
  await db.exec("set test.global='true';");
  assert.equal((await summary(null)).success,true);
  for (const args of [['INVALID',1,20],['MONTHLY',0,20],['MONTHLY',1,101],['MONTHLY',1000001,20],['MONTHLY',null,20]]) {
    await assert.rejects(()=>page(...args),e=>e.code==='22023');
  }
  await assert.rejects(()=>summary(polo,null),e=>e.code==='22023');
  await assert.rejects(()=>summary(polo,'2026-11-01'),e=>e.code==='22023');
  await assert.rejects(()=>page('MONTHLY',1,20,polo,'2026-11-01'),e=>e.code==='22023');
  const privileges = await scalar(`select jsonb_build_object(
    'anon',has_function_privilege('anon','public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)','execute'),
    'auth',has_function_privilege('authenticated','public.get_caixa_review_pending_page_secure(uuid,date,text,integer,integer)','execute'),
    'private',has_function_privilege('authenticated','internal_contas.caixa_receivables_position_rows(uuid,date,date)','execute'),
    'summaryAnon',has_function_privilege('anon','public.get_caixa_receivables_position_secure(uuid,date)','execute')) value`);
  assert.deepEqual(privileges,{anon:false,auth:true,private:false,summaryAnon:false});
  assert.equal(await fingerprint(),before,'all read paths leave receipts, identities and evidence unchanged');
  console.log('PASS Caixa review drilldown + monthly/portfolio position: canonical parity, pagination, cutoffs, sources, ACL, immutability');
} finally {
  await db.close();
}
