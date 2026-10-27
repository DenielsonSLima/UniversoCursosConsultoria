import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createManagerDatabase, seedManagerEnrollment, previewManager, prepareManager, id } from './manager-cycle-integration-setup.mjs';
const migration = () => readFile(new URL('../migrations/20261027175524_scoped_manual_cycle_progress.sql',import.meta.url),'utf8');
const progress = async (db,enrollment,cycle=2) => (await db.query(
  'select public.obter_progresso_ciclo_financeiro_tecnico_manual_secure($1,$2) as value',[enrollment,cycle])).rows[0].value;

test('progresso individual lê o run real sem workspace/estado pesado e não confunde ausência com zero emitidos',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment}=await seedManagerEnrollment(db,710);
    await db.exec(await migration());
    const absent=await progress(db,enrollment);
    assert.equal(absent.encontrado,false);assert.equal(absent.ciclo,null);assert.equal(absent.requestId,null);
    const preview=await previewManager(db,enrollment,2);
    await prepareManager(db,preview,id(8710));
    const prior=(await db.query('select internal_academic.manual_cycle_issuance_progress($1,2) as value',[enrollment])).rows[0].value;
    await db.exec(`create or replace function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
      returns jsonb language plpgsql as $$begin raise exception 'WORKSPACE_UNAVAILABLE' using errcode='57014'; end$$;`);
    const result=await progress(db,enrollment);
    assert.equal(result.encontrado,true);assert.equal(result.requestId,id(8710));
    assert.deepEqual(result.ciclo,prior.ciclo);assert.equal(result.ciclo.quantidadeItens,13);
    assert.equal(result.ciclo.emitidosBanese,0);assert.equal(result.ciclo.pendentesEmissao,13);
  } finally {await db.close();}
});

test('consulta de progresso reaplica autenticação/polo/financeiro e mantém helpers privados',async()=>{
  const db=await createManagerDatabase();
  try {
    const {enrollment}=await seedManagerEnrollment(db,711);
    await db.exec(await migration());
    await db.exec(`set test.actor='';`);
    await assert.rejects(progress(db,enrollment),e=>e.code==='42501');
    const rows=(await db.query(`select role,has_function_privilege(role,
      'internal_academic.manual_cycle_issuance_snapshot(uuid,integer)','EXECUTE') allowed
      from unnest(array['anon','authenticated','service_role']) role`)).rows;
    assert.ok(rows.every(r=>r.allowed===false));
    assert.equal((await db.query(`select has_function_privilege('anon',
      'public.obter_progresso_ciclo_financeiro_tecnico_manual_secure(uuid,integer)','EXECUTE') allowed`)).rows[0].allowed,false);
  } finally {await db.close();}
});

test('13/13 exige persistência canônica; taxa em revisão permanece 12/13 sem nova emissão',async()=>{
  const db=await createManagerDatabase();
  try {
    await db.exec(await migration());
    for(const [scenario,review] of [true,false].entries()) {
    const {enrollment}=await seedManagerEnrollment(db,712+scenario);
    await prepareManager(db,await previewManager(db,enrollment,2),id(8712+scenario));
    const rows=(await db.query('select * from public.contas_receber where matricula_id=$1 order by parcela_numero desc',[enrollment])).rows;
    for(let n=0;n<rows.length;n++) {
      const r=rows[n],request=id(90000+scenario*100+n),number=String(910000000+scenario*100+n);
      await db.exec("set test.jwt.role='authenticated'");
      await db.query('select public.authorize_technical_manual_receivable_issuance_secure($1,$2)',[r.id,request]);
      await db.query(`update public.contas_receber set gateway_creation_token=$2,gateway_status='CREATING',
        gateway_provider='banese_card',gateway_environment='production',gateway_payment_method='BOLETO',
        gateway_issuer_polo_id=polo_id,gateway_boleto_nosso_numero=$3,
        gateway_boleto_convenio='123',gateway_boleto_agencia='033',
        gateway_submission_channel='API',gateway_submission_status='API_AMBIGUOUS' where id=$1`,[r.id,request,number]);
      if(n===12 && review) {
        await db.query("update public.contas_receber set gateway_submission_status='API_REVIEW' where id=$1",[r.id]);
        const partial=await progress(db,enrollment);
        assert.equal(partial.ciclo.emitidosBanese,12);assert.equal(partial.ciclo.emRevisao,1);
        assert.equal(partial.ciclo.status,'EMISSAO_EM_REVISAO');
        break;
      }
      const terms=(await db.query('select internal_academic.technical_manual_banese_expected_terms(r) value from public.contas_receber r where id=$1',[r.id])).rows[0].value;
      await db.query('update public.contas_receber set gateway_financial_terms=$2::jsonb where id=$1',[r.id,JSON.stringify(terms)]);
      const barcode='0479'+'0'.repeat(26)+number+'0'.repeat(5);
      const line=barcode.slice(0,4)+barcode.slice(19,24)+'0'+barcode.slice(24,34)+'0'+barcode.slice(34,44)+'0'+barcode.slice(4,5)+barcode.slice(5,19);
      const result={providerCode:'banese_card',remotePaymentId:number,remoteStatus:'PENDING',issuerPoloId:r.polo_id,
        bankSlipOurNumber:number,bankSlipBarcode:barcode,bankSlipDigitableLine:line,
        pixPayload:`000201BR.GOV.BCB.PIX${number}53039865802BR6304ABCD`,
        pixEncodedImage:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(40),financialTerms:terms,
        rawPayload:{request:{synthetic:true},response:{synthetic:true}}};
      await db.exec("set test.jwt.role='service_role'");
      await db.query('select public.persist_technical_manual_cycle_banese_issuance($1,$2,$2,$3::jsonb)',[r.id,request,JSON.stringify(result)]);
    }
    assert.equal((await db.query('select count(*)::int n from public.contas_receber where matricula_id=$1',[enrollment])).rows[0].n,13);
    const final=await progress(db,enrollment);
    assert.equal(final.ciclo.emitidosBanese,review?12:13);
    assert.equal(final.ciclo.status,review?'EMISSAO_EM_REVISAO':'EMITIDO_BANESE');
    }
  } finally {await db.close();}
});
