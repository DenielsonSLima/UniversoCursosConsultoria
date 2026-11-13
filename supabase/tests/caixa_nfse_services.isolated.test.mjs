import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath=process.env.CAIXA_TEST_PGLITE_MODULE;
const { PGlite }=await import(modulePath?pathToFileURL(resolve(modulePath)).href:'@electric-sql/pglite');
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const definition=(text,name)=>{
  const start=text.search(new RegExp(`CREATE(?: OR REPLACE)? FUNCTION ${name.replaceAll('.','\\.')}\\(`,'i'));
  assert(start>=0,name);const body=text.slice(start),delimiter=/\bAS\s+(\$[a-z_]*\$)/i.exec(body);
  const end=body.indexOf(delimiter[1]+';',delimiter.index+delimiter[0].length);
  assert(end>=0);return body.slice(0,end+delimiter[1].length+1);
};

test('Caixa classifies direct and partial service receipts once, without changing canonical cash amounts',async t=>{
  const db=new PGlite();
  const value=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  const set=async(key,v)=>db.query('SELECT set_config($1,$2,false)',['test.'+key,String(v)]);
  const monthly=(polo=id(1))=>value('SELECT public.get_caixa_prestacao_mensal_secure($1,$2,3) value',[polo,'2026-11-01']);
  const report=(polo=id(1))=>db.query("SELECT * FROM public.get_caixa_relatorio_recebimentos_core($1,'2026-11-01','2026-12-01')",[polo]);
  const category=(p,code)=>p.receitas_por_modalidade.find(x=>x.codigo===code);
  const title=async(n,amount,status='PAGO',polo=id(1))=>db.query(`INSERT INTO public.contas_receber
    (id,polo_id,cliente_id,descricao,categoria,status,valor,valor_pago,data_pagamento,data_vencimento,parcela_numero)
    VALUES($1,$2,$3,'Original synthetic title','OUTROS_CREDITOS',$4,$5,$6,$7,'2026-11-30',1)`,
    [id(n),polo,id(50),status,amount,status==='PAGO'?amount:null,status==='PAGO'?'2026-11-12':null]);
  const link=n=>db.query('INSERT INTO private.nfse_service_receivables VALUES($1,$2,$3,3)',[id(n),'999','Descrição fiscal integral, com período autorizado.']);
  try{
    await db.exec(await read('caixa_nfse_services.fixture.sql'));
    await db.exec(definition(await read('../migrations/20261014183532_financial_payment_cash_sources.sql'),'internal_financial_payments.cash_receivables'));
    await db.exec(definition(await read('../migrations/20260912220081_proesc_composition_caixa_receipts.sql'),'public.get_caixa_relatorio_recebimentos_core'));
    await db.exec(`REVOKE ALL ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION public.get_caixa_relatorio_recebimentos_core(uuid,date,date) TO service_role`);
    await set('polo',id(1));await set('role','authenticated');await set('global',false);
    for(const name of ['20261112223000_caixa_nfse_service_classification.sql','20261112223100_caixa_nfse_service_monthly.sql','20261112223200_caixa_nfse_service_report.sql']){
      await db.exec(await read('../migrations/'+name));
    }
    await title(10,25);
    await t.test('ordinary credit stays in its original group and the empty service group is explicit',async()=>{
      const p=await monthly();assert.equal(category(p,'SERVICOS_NFSE').valor,0);
      assert.equal(category(p,'OUTROS_CREDITOS').valor,25);assert.equal(p.opaque_snapshot,'preserved');
    });
    await title(11,100);await link(11);
    await t.test('paid service moves between groups with original realized total and metadata preserved',async()=>{
      const p=await monthly();assert.equal(p.resumo_competencia.entradas_recebidas_brutas,125);
      assert.equal(category(p,'SERVICOS_NFSE').valor,100);assert.equal(category(p,'OUTROS_CREDITOS').valor,25);
      assert.equal(category(p,'SERVICOS_NFSE').percentual,80);
      const row=(await report()).rows.find(x=>x.id===id(11));assert.equal(row.modalidade,'SERVICOS_NFSE');
      assert.equal(row.total_parcelas,3);assert.match(row.descricao,/NFS-e nº 999.*Descrição fiscal integral/);
      assert.equal(row.valor_base,'100');assert.equal(row.valor_recebido,'100');
    });
    await title(12,100,'PENDENTE');await link(12);
    for(const [n,amount] of [[20,30],[21,20]]){
      await db.query("INSERT INTO public.financial_payment_events VALUES($1,'RECEIVABLE',$2,NULL)",[id(n),id(12)]);
      await db.query(`INSERT INTO test_caixa.components VALUES($1,$2,'RECEIVABLE',$3,$4,0,0,0,0,$4,'2026-11-12',NULL,'PIX')`,[id(n+100),id(n),id(12),amount*100]);
    }
    await t.test('virtual cash IDs resolve their original service for each partial payment exactly once',async()=>{
      const p=await monthly();assert.equal(category(p,'SERVICOS_NFSE').valor,150);
      assert.equal(category(p,'SERVICOS_NFSE').quantidade,3);assert.equal(category(p,'OUTROS_CREDITOS').valor,25);
      const rows=(await report()).rows;assert.equal(rows.filter(x=>x.modalidade==='SERVICOS_NFSE').length,3);
      assert.match(rows.find(x=>x.id===id(120)).valor_recebido,/^30(?:\.0+)?$/);
      assert.match(rows.find(x=>x.id===id(121)).valor_recebido,/^20(?:\.0+)?$/);
      assert(!rows.some(x=>x.id===id(12)),'The unpaid balance is not realized cash');
    });
    await title(13,200,'PAGO',id(2));await link(13);
    await t.test('polo scope stays isolated and global grouping includes the same canonical events',async()=>{
      assert.equal(category(await monthly(),'SERVICOS_NFSE').valor,150);
      await assert.rejects(monthly(id(2)),e=>e.code==='42501');await set('global',true);
      assert.equal(category(await monthly(null),'SERVICOS_NFSE').valor,350);await set('global',false);
    });
    await t.test('reversed partial event stops contributing without erasing another confirmed receipt',async()=>{
      await db.query('UPDATE public.financial_payment_events SET reversed_at=now() WHERE id=$1',[id(20)]);
      const p=await monthly();assert.equal(category(p,'SERVICOS_NFSE').valor,120);
      assert.equal(category(p,'SERVICOS_NFSE').quantidade,2);
    });
    await t.test('authorization precedes classification; contradictory cash cannot silently become zero',async()=>{
      await set('denied',true);await set('drift',true);
      await assert.rejects(monthly(),e=>e.code==='42501');await set('denied',false);
      await assert.rejects(monthly(),e=>e.code==='55000');await set('drift',false);
    });
    await t.test('loan funding is still excluded from operational cash and unrelated metadata is preserved',async()=>{
      await title(14,70);await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1,$2)',[id(14),id(1)]);
      const p=await monthly();assert.equal(p.resumo_competencia.entradas_recebidas_brutas,145);
      assert.equal(category(p,'OUTROS_CREDITOS').valor,25);assert.equal(p.opaque_snapshot,'preserved');
      assert(!(await report()).rows.some(x=>x.id===id(14)));
    });
    await t.test('partial loan funding resolves its source ID before operational exclusion',async()=>{
      await title(15,100,'PENDENTE');
      await db.query('INSERT INTO public.emprestimos_financeiros VALUES($1,$2)',[id(15),id(1)]);
      await db.query("INSERT INTO public.financial_payment_events VALUES($1,'RECEIVABLE',$2,NULL)",[id(22),id(15)]);
      await db.query(`INSERT INTO test_caixa.components VALUES($1,$2,'RECEIVABLE',$3,4000,0,0,0,0,4000,'2026-11-12',NULL,'PIX')`,[id(122),id(22),id(15)]);
      const p=await monthly();assert.equal(p.resumo_competencia.entradas_recebidas_brutas,145);
      assert.equal(p.resumo_competencia.quantidade_recebimentos,3);
      assert.equal(category(p,'OUTROS_CREDITOS').valor,25);
      assert.equal(p.serie_mensal[0].entradas,145);
      assert(!(await report()).rows.some(x=>x.id===id(122)));
    });
    await t.test('internal fiscal lookup does not become callable by clients and the report core keeps its ACL',async()=>{
      const p=await value(`SELECT jsonb_build_object('helper',has_function_privilege('authenticated',
        'internal_contas.caixa_nfse_service_context(uuid,uuid)','EXECUTE'),'core',has_function_privilege('authenticated',
        'public.get_caixa_relatorio_recebimentos_core(uuid,date,date)','EXECUTE'),'monthly',has_function_privilege('authenticated',
        'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)','EXECUTE'),'anon',has_function_privilege('anon',
        'public.get_caixa_prestacao_mensal_secure(uuid,date,integer)','EXECUTE')) value`);
      assert.deepEqual(p,{helper:false,core:false,monthly:true,anon:false});
    });
  }finally{await db.close();}
});
