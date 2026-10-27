import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createManagerDatabase,seedManagerEnrollment,previewManager,prepareManager,id,polo} from './manager-cycle-integration-setup.mjs';
const patch=()=>readFile(new URL('../migrations/20261027163600_financial_projection_read_efficiency.sql',import.meta.url),'utf8');

test('35 matrículas/590 títulos mistos: projeções e decisões idênticas; leitura dentro de 8s',async(t)=>{
  const db=await createManagerDatabase();
  try {
    const enrollments=[];
    for(let n=0;n<35;n++) {
      const entry=await seedManagerEnrollment(db,20000+n,{imported:false,implantation:false});
      if(n>0) {
        await db.query('update public.matriculas set turma_id=$2 where id=$1',[entry.enrollment,enrollments[0].turma]);
        entry.turma=enrollments[0].turma;
      }
      enrollments.push(entry);
      if(n<10) await prepareManager(db,await previewManager(db,entry.enrollment,2),id(30000+n));
    }
    // Fixture importada é carregada antes da observação: não testa nem autoriza INSERT de produção.
    await db.exec('alter table public.contas_receber disable trigger user');
    for(let n=0;n<460;n++) {
      const e=enrollments[n%35], receipt=id(40000+n),link=id(50000+n);
      await db.query(`insert into public.contas_receber(id,matricula_id,turma_id,polo_id,cliente_id,
        tipo_lancamento,parcela_numero,descricao,valor,data_vencimento,status,origem_pagamento)
        values($1,$2,$3,$4,$5,'PARCELA',$6,'Histórico sintético',250,'2026-09-01',$7,'SISTEMA_ANTERIOR')`,
        [receipt,e.enrollment,e.turma,polo,e.person,Math.floor(n/35)+1,n%3?'PENDENTE':'PAGO']);
      await db.query(`insert into internal_proesc.obligation_links(id,receivable_id,matricula_id,source_key,confirmed_at,kind)
        values($1,$2,$3,$4,now(),$5)`,[link,receipt,e.enrollment,`synthetic-${n}`,n===459?'RESIDUAL':'ORIGINAL']);
      await db.query(`insert into internal_proesc.obligation_imports(link_id,source_cycle,source_fingerprint)
        values($1,'UNRESOLVED','synthetic-proof')`,[link]);
    }
    await db.exec('alter table public.contas_receber enable trigger user');
    const ids=enrollments.map(e=>e.enrollment);
    assert.equal((await db.query('select count(*)::int n from public.contas_receber where matricula_id=any($1::uuid[])',[ids])).rows[0].n,590);
    const observe=()=>db.query(`select m.id,internal_academic.enrollment_financial_context(m.id) context,
      internal_academic.technical_manual_monthly_count(m.id) count,
      internal_academic.technical_manual_cycle_state(m.id) state
      from public.matriculas m where m.id=any($1::uuid[]) order by m.id`,[ids]);
    const before=(await observe()).rows;
    const untouched=(await db.query('select md5(jsonb_agg(to_jsonb(r) order by id)::text) hash from public.contas_receber r')).rows;
    await db.exec(await patch());
    const started=performance.now(), after=(await observe()).rows, elapsed=performance.now()-started;
    assert.deepEqual(after,before);
    assert.ok(after.every(r=>r.count===r.context.mensalidades.emitidas));
    assert.deepEqual((await db.query('select md5(jsonb_agg(to_jsonb(r) order by id)::text) hash from public.contas_receber r')).rows,untouched);
    t.diagnostic(`35 matrículas, 590 títulos, source/count/state: ${Math.round(elapsed)}ms (PGlite isolado, não medição da rede/produção).`);
    assert.ok(elapsed<8000,`Leitura excedeu orçamento 8s: ${elapsed}ms`);
  } finally {await db.close();}
});
