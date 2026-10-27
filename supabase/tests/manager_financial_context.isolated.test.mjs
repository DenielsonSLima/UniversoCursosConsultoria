import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE_PATH
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE_PATH)).href : '@electric-sql/pglite');
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
const database = async () => {
  const db = new PGlite();
  await db.exec(await read('./fixtures/manager-financial-context/schema.sql'));
  await db.exec(await read('./fixtures/manager-financial-context/monthly-count-before.sql'));
  const patch = new URL('../migrations/20261027151005_enrollment_financial_source_projection.sql', import.meta.url);
  if (await access(patch).then(() => true, () => false)) await db.exec(await readFile(patch, 'utf8'));
  const activation=await read('../migrations/20261027151020_manual_cycle_manager_choice.sql');
  await db.exec(activation.match(/create or replace function internal_academic\.technical_manual_monthly_count[\s\S]*?\$function\$;/)[0]);
  return db;
};

const bankTitle = async (db, n, { kind = 'PARCELA', imported = false, issued = true, status = 'PENDENTE' } = {}) => {
  await db.query(`INSERT INTO public.contas_receber
    (id,matricula_id,tipo_lancamento,status,valor,gateway_provider,gateway_environment,
      gateway_payment_id,gateway_boleto_nosso_numero,gateway_creation_token,
      gateway_boleto_issued_at,gateway_submission_channel,gateway_submission_status)
    VALUES ($1,$2,$3,$4,100,'banese_card','production',$5,$6,$7,$8,'API',$9)`,
  [id(n),id(100),kind,status,issued ? `remote-${n}` : null,issued ? `our-${n}` : null,
    imported ? null : id(1000+n),issued ? '2026-10-01T00:00:00Z' : null,issued ? 'API_REGISTERED' : 'API_REVIEW']);
  if (issued) await db.query(`INSERT INTO public.payment_gateway_transactions VALUES
    ($1,$2,'banese_card','production','BOLETO',$3,$4,100,$5::jsonb)`,
  [id(2000+n),id(n),`remote-${n}`,`our-${n}`,JSON.stringify(imported ? {importSource:'BANESE_API_LEGACY_DISCOVERY'} : {})]);
};
const context = async (db) => (await db.query(
  'SELECT internal_academic.enrollment_financial_context($1) AS value',[id(100)],
)).rows[0].value;

test('24 mensalidades apenas lançadas não equivalem a 24 mensalidades emitidas', async () => {
  const db = await database();
  try {
    for (let n = 1; n <= 24; n++) {
      await db.query(`INSERT INTO public.contas_receber
        (id, matricula_id, tipo_lancamento, status) VALUES ($1,$2,'PARCELA','PENDENTE')`, [id(n), id(100)]);
    }
    const result = await db.query(`SELECT internal_academic.technical_manual_monthly_count($1) AS count`, [id(100)]);
    assert.equal(result.rows[0].count, 0, 'O contador de emissão não pode contar simples lançamentos.');
  } finally { await db.close(); }
});

test('12 mensalidades emitidas e taxa rejeitada permanecem 12 emitidas com taxa separada', async () => {
  const db = await database();
  try {
    for (let n=1;n<=12;n++) await bankTitle(db,n);
    await bankTitle(db,13,{kind:'REMATRICULA',issued:false});
    const result=await context(db);
    assert.equal(result.mensalidades.emitidas,12);
    assert.equal(result.mensalidades.lancadas,12);
    assert.equal(result.taxas,1);
    assert.equal(result.operacoes.length,0);
  } finally { await db.close(); }
});

test('matrícula mista mantém origem histórica distinta do provedor e do canal', async () => {
  const db=await database();
  try {
    await bankTitle(db,1);
    await bankTitle(db,2,{imported:true});
    await db.query(`INSERT INTO public.contas_receber (id,matricula_id,tipo_lancamento,status)
      VALUES ($1,$2,'PARCELA','PAGO')`,[id(3),id(100)]);
    await db.query(`INSERT INTO internal_proesc.obligation_links (id,receivable_id,matricula_id,source_key,confirmed_at) VALUES ($1,$2,$3,'source-3',now())`,[id(300),id(3),id(100)]);
    await db.query(`INSERT INTO internal_proesc.obligation_imports VALUES ($1,'UNRESOLVED','source-proof')`,[id(300)]);
    const result=await context(db);
    assert.deepEqual(result.fontes.map(x=>x.origem),['BANESE_LEGACY_IMPORTED','PROESC_HISTORY','UNIVERSO_NATIVE']);
    assert.equal(result.mensalidades.bancariasEmitidas,2);
    assert.equal(result.mensalidades.externasConhecidas,1);
    assert.equal(result.ciclosComprovados.length,0,'Quantidade não fabrica confirmação de ciclo.');
    assert.ok(result.fontes.filter(x=>x.provedor==='banese_card').every(x=>x.canal==='API'));
  } finally { await db.close(); }
});

test('PROTECTED_EXISTING não exige ou fabrica snapshot nativo', async () => {
  const db=await database();
  try {
    await bankTitle(db,1,{imported:true});
    await db.query(`INSERT INTO internal_academic.technical_manual_cycle_runs
      VALUES ($1,1,'PROTECTED_EXISTING',now(),$2,ARRAY[$3::uuid],1)`,[id(100),id(400),id(1)]);
    const before=(await db.query('SELECT to_jsonb(r) AS value FROM public.contas_receber r')).rows;
    assert.equal((await context(db)).fontes[0].origem,'BANESE_LEGACY_IMPORTED');
    assert.deepEqual((await db.query('SELECT to_jsonb(r) AS value FROM public.contas_receber r')).rows,before);
    assert.equal(before[0].value.regra_financeira_tecnica_snapshot,null);
  } finally { await db.close(); }
});

test('canceladas ficam no histórico; conflito de origem e API_REVIEW não contam como emissão', async () => {
  const db=await database();
  try {
    await bankTitle(db,1,{status:'CANCELADO'});
    await bankTitle(db,2,{issued:false});
    await bankTitle(db,3);
    await db.query('INSERT INTO internal_proesc.obligation_links (id,receivable_id) VALUES ($1,$2)',[id(300),id(3)]);
    const result=await context(db);
    assert.equal(result.mensalidades.lancadas,3);
    assert.equal(result.mensalidades.emitidas,0);
    assert.equal(result.mensalidades.canceladas,1);
    assert.equal(result.mensalidades.emRevisao,2);
  } finally { await db.close(); }
});


test('taxa LOCAL pendente, paga ou cancelada preserva origem nativa sem exigir banco', async () => {
  const db=await database();
  try {
    for (const [index,status] of ['PENDENTE','PAGO','CANCELADO'].entries()) {
      await db.query(`INSERT INTO public.contas_receber
        (id,matricula_id,tipo_lancamento,status,regra_financeira_tecnica_snapshot)
        VALUES ($1,$2,'MATRICULA',$3,'{"destinoCobranca":"LOCAL","localSemBoletoComprovado":true}')`,[id(index+1),id(100),status]);
    }
    await db.query(`INSERT INTO internal_academic.technical_manual_cycle_runs
      VALUES ($1,1,'LOCAL_CREATED',now(),$2,ARRAY[$3::uuid,$4::uuid,$5::uuid],3)`,
      [id(100),id(400),id(1),id(2),id(3)]);
    const sources=(await db.query('SELECT internal_academic.enrollment_receivable_source(r) AS value FROM public.contas_receber r')).rows;
    assert.ok(sources.every(({value})=>value.origem==='UNIVERSO_NATIVE' && value.destino==='LOCAL'
      && value.emRevisao===false && value.emitidaBanco===false));
    assert.equal((await context(db)).mensalidades.emitidas,0);
  } finally { await db.close(); }
});

test('nativo recém-criado não está em revisão e vínculo Proesc sem prova não é emissão', async () => {
  const db=await database();
  try {
    await db.query(`INSERT INTO public.contas_receber (id,matricula_id,tipo_lancamento,status)
      VALUES ($1,$3,'PARCELA','PENDENTE'),($2,$3,'PARCELA','PENDENTE')`,[id(1),id(2),id(100)]);
    await db.query(`INSERT INTO internal_academic.technical_manual_cycle_runs
      VALUES ($1,1,'LOCAL_CREATED',now(),$2,ARRAY[$3::uuid],1)`,[id(100),id(400),id(1)]);
    await db.query(`INSERT INTO internal_proesc.obligation_links (id,receivable_id,matricula_id,source_key,confirmed_at) VALUES ($1,$2,$3,'source-2',now())`,[id(300),id(2),id(100)]);
    const rows=(await db.query('SELECT internal_academic.enrollment_receivable_source(r) AS value FROM public.contas_receber r ORDER BY id')).rows;
    assert.equal(rows[0].value.emRevisao,false);
    assert.equal(rows[1].value.emRevisao,true);
    assert.equal(rows[1].value.externaConhecida,false);
    assert.equal((await context(db)).mensalidades.emitidas,0);
  } finally { await db.close(); }
});

test('residual Proesc é preservado sem contar novamente a mensalidade original', async () => {
  const db=await database();
  try {
    for (const [n,kind] of [[1,'ORIGINAL'],[2,'RESIDUAL']]) {
      await db.query(`INSERT INTO public.contas_receber (id,matricula_id,tipo_lancamento,status)
        VALUES ($1,$2,'PARCELA','PAGO')`,[id(n),id(100)]);
      await db.query(`INSERT INTO internal_proesc.obligation_links(id,receivable_id,matricula_id,source_key,confirmed_at,kind)
        VALUES ($1,$2,$3,$4,now(),$5)`,[id(300+n),id(n),id(100),`source-${n}`,kind]);
      await db.query(`INSERT INTO internal_proesc.obligation_imports VALUES ($1,'UNRESOLVED','proof')`,[id(300+n)]);
    }
    const result=await context(db);
    assert.equal(result.mensalidades.lancadas,1);
    assert.equal(result.mensalidades.externasConhecidas,1);
    assert.equal(result.mensalidades.pagas,1);
    assert.equal(result.ajustesResiduais,1);
    assert.equal(result.fontes[0].quantidade,2);
    assert.equal(result.ciclosComprovados.length,0);
  } finally {await db.close();}
});
