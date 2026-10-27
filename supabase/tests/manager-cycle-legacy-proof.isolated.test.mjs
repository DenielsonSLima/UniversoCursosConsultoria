import assert from 'node:assert/strict';
import test from 'node:test';
import {createManagerDatabase,seedManagerEnrollment,previewManager,prepareManager,applyManagerPatch,id,actor,polo} from './manager-cycle-integration-setup.mjs';
const proof=async(db,enrollment)=>(await db.query(`SELECT internal_academic.manual_cycle_legacy_creation_proven(r) AS valid
  FROM internal_academic.technical_manual_cycle_runs r WHERE matricula_id=$1`,[enrollment])).rows[0].valid;

test('legado comprovado retoma após COMMIT sem backfill; outro gestor mantém autorização e token',async()=>{
  const db=await createManagerDatabase({patch:false});
  try {
    const {enrollment}=await seedManagerEnrollment(db,201,{implantation:false});
    const preview=await previewManager(db,enrollment,2);
    await db.exec('begin');
    const created=await prepareManager(db,preview,id(8201));
    await db.exec('commit');
    const before=(await db.query('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE matricula_id=$1 ORDER BY id',[enrollment])).rows;
    await applyManagerPatch(db);
    assert.equal(await proof(db,enrollment),true);
    assert.equal((await db.query('SELECT manager_decision FROM internal_academic.technical_manual_cycle_runs WHERE matricula_id=$1',[enrollment])).rows[0].manager_decision,null);
    assert.deepEqual((await db.query('SELECT to_jsonb(c) value FROM public.contas_receber c WHERE matricula_id=$1 ORDER BY id',[enrollment])).rows,before);
    const receivable=created.ciclo.recebiveis[0].id,request=id(9201);
    await db.exec('begin');
    await db.query('SELECT public.authorize_technical_manual_receivable_issuance_secure($1,$2)',[receivable,request]);
    await db.query(`UPDATE public.contas_receber SET gateway_creation_token=$2,gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' WHERE id=$1`,[receivable,request]);
    await db.query(`UPDATE public.contas_receber SET gateway_submission_status='API_REVIEW' WHERE id=$1`,[receivable]);
    await db.exec('commit');
    await db.query('INSERT INTO auth.users VALUES ($1)',[id(9202)]);
    await db.query(`INSERT INTO public.usuarios_sistema(id,auth_user_id,perfil,status,personalizar_permissoes,permissoes,polo_ids)
      VALUES ($1,$2,'gestor','ATIVO',true,'{"modules":["financeiro"],"tabs":{"financeiro":["receber"]}}',ARRAY[$3::uuid])`,[id(9203),id(9202),polo]);
    await db.query("SELECT set_config('test.actor',$1,false)",[id(9202)]);
    const replay=(await db.query('SELECT public.authorize_technical_manual_receivable_issuance_secure($1,$2) AS value',[receivable,request])).rows[0].value;
    assert.equal(replay.authorized,true);
    const kept=(await db.query(`SELECT c.gateway_creation_token,c.gateway_submission_status,a.authorized_by,a.claim_count
      FROM public.contas_receber c JOIN internal_academic.technical_manual_receivable_issuance_authorizations a ON a.receivable_id=c.id WHERE c.id=$1`,[receivable])).rows[0];
    assert.deepEqual(kept,{gateway_creation_token:request,gateway_submission_status:'API_REVIEW',authorized_by:actor,claim_count:1});
  } finally {await db.close();}
});

test('prova legada rejeita ledger, auditoria, composição, ator ou hash divergentes sem corrigir registros',async()=>{
  const db=await createManagerDatabase({patch:false});
  try {
    const {enrollment}=await seedManagerEnrollment(db,202,{implantation:false});
    await prepareManager(db,await previewManager(db,enrollment,2),id(8202));
    await applyManagerPatch(db);
    assert.equal(await proof(db,enrollment),true);
    const mutations=[
      `UPDATE internal_academic.technical_financial_requests SET payload_hash=repeat('0',64) WHERE request_id='${id(8202)}'`,
      `UPDATE internal_academic.technical_financial_requests SET actor_id='${id(9999)}' WHERE request_id='${id(8202)}'`,
      `UPDATE internal_academic.technical_financial_requests SET operation='OTHER' WHERE request_id='${id(8202)}'`,
      `UPDATE internal_academic.technical_financial_requests SET response=jsonb_set(response,'{ciclo,recebiveis,1}',response#>'{ciclo,recebiveis,0}') WHERE request_id='${id(8202)}'`,
      `UPDATE public.historico_turma_financeira SET regra=jsonb_set(regra,'{cronogramaFingerprint}','"wrong"') WHERE matricula_id='${enrollment}' AND evento='CICLO_TECNICO_MANUAL_CRIADO_LOCAL'`,
      `INSERT INTO public.historico_turma_financeira SELECT * FROM public.historico_turma_financeira WHERE matricula_id='${enrollment}' AND evento='CICLO_TECNICO_MANUAL_CRIADO_LOCAL'`,
      `UPDATE internal_academic.technical_manual_cycle_runs SET reviewed_items=NULL WHERE matricula_id='${enrollment}'`,
      `UPDATE internal_academic.technical_manual_cycle_runs SET state='PROTECTED_EXISTING' WHERE matricula_id='${enrollment}'`,
    ];
    for(const mutation of mutations) {
      await db.exec('begin');
      await db.exec(mutation);
      assert.equal(await proof(db,enrollment),false,mutation);
      await db.exec('rollback');
    }
    assert.equal(await proof(db,enrollment),true);
  } finally {await db.close();}
});
