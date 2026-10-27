import assert from 'node:assert/strict';
import test from 'node:test';
import {createManagerDatabase,seedManagerEnrollment,previewManager,prepareManager,id} from './manager-cycle-integration-setup.mjs';

test('gestor cria C2 em matrícula importada sem confirmação Proesc; COMMIT não perde intenção',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment}=await seedManagerEnrollment(db,100);
    const preview=await previewManager(db,enrollment,2);
    assert.equal(preview.preview.itens.length,13);
    await db.exec('begin');
    const created=await prepareManager(db,preview);
    await db.exec('commit');
    const rows=(await db.query('SELECT * FROM public.contas_receber WHERE matricula_id=$1 ORDER BY parcela_numero',[enrollment])).rows;
    assert.equal(rows.length,13);
    assert.equal(created.ciclo.quantidadeItens,13);
    assert.ok(rows.every(r=>r.regra_financeira_tecnica_snapshot.cicloManual.cicloNumero===2));
    const receivable=rows[0].id;
    await db.exec('begin');
    const authorized=(await db.query('SELECT public.authorize_technical_manual_receivable_issuance_secure($1,$2) AS value',[receivable,id(9000)])).rows[0].value;
    assert.equal(authorized.authorized,true);
    await db.query(`UPDATE public.contas_receber SET gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' WHERE id=$1`,[receivable,id(9000)]);
    await db.exec('commit');
    assert.equal((await db.query('SELECT claim_count FROM internal_academic.technical_manual_receivable_issuance_authorizations WHERE receivable_id=$1',[receivable])).rows[0].claim_count,1);
    assert.equal((await db.query('SELECT count(*)::int n FROM public.contas_receber WHERE matricula_id=$1',[enrollment])).rows[0].n,13);
  } finally {await db.close();}
});

test('baseline reproduz veto após COMMIT mesmo quando a criação local foi permitida',async()=>{
  const db=await createManagerDatabase({patch:false});
  try {
    const {enrollment}=await seedManagerEnrollment(db,101,{implantation:false});
    const preview=await previewManager(db,enrollment,2);
    await db.exec('begin');
    const created=await prepareManager(db,preview,id(8001));
    await db.exec('commit');
    const receivable=created.ciclo.recebiveis[0].id;
    await assert.rejects(db.query('SELECT public.authorize_technical_manual_receivable_issuance_secure($1,$2)',
      [receivable,id(9002)]),e=>e.code==='42501'&&/protegida/.test(e.message));
  } finally {await db.close();}
});

test('aluno novo em turma importada pode escolher C1 sem fabricar confirmação ou alterar turma',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment,turma}=await seedManagerEnrollment(db,102);
    const before=(await db.query('SELECT to_jsonb(p) AS value FROM internal_academic.technical_manual_cycle_policies p WHERE turma_id=$1',[turma])).rows;
    const preview=await previewManager(db,enrollment,1);
    assert.equal(preview.preview.itens.filter(i=>i.tipo==='PARCELA').length,12);
    await prepareManager(db,preview,id(8002));
    assert.deepEqual((await db.query('SELECT to_jsonb(p) AS value FROM internal_academic.technical_manual_cycle_policies p WHERE turma_id=$1',[turma])).rows,before);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.technical_imported_cycle_facts WHERE matricula_id=$1',[enrollment])).rows[0].n,0);
  } finally {await db.close();}
});

test('requisições concorrentes simuladas e replay mantêm um único conjunto aprovado',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment}=await seedManagerEnrollment(db,103);
    const preview=await previewManager(db,enrollment,2);
    const results=await Promise.allSettled([prepareManager(db,preview,id(8003)),prepareManager(db,preview,id(8004))]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    await prepareManager(db,preview,id(8003));
    assert.equal((await db.query('SELECT count(*)::int n FROM public.contas_receber WHERE matricula_id=$1',[enrollment])).rows[0].n,13);
    assert.equal((await db.query('SELECT count(*)::int n FROM internal_academic.technical_manual_cycle_runs WHERE matricula_id=$1',[enrollment])).rows[0].n,1);
  } finally {await db.close();}
});

test('sem policy da turma, matrícula técnica configurada recebe opções individuais e baseline estrutural',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment}=await seedManagerEnrollment(db,104,{policy:false});
    for(const cycle of [1,2]) {
      const result=await previewManager(db,enrollment,cycle);
      assert.equal(result.cicloManual.cicloBaseHistorico,0);
      assert.equal(result.cicloManual.proximoCicloNumero,cycle);
      assert.equal(result.cicloManual.podeGerar,true);
    }
  } finally {await db.close();}
});
