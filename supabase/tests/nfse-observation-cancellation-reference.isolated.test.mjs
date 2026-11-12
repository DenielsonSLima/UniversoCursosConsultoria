import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {testModule,uid} from './nfse-reconciliation-fixture.mjs';

const {PGlite}=await import(testModule(process.argv[2]));
const db=new PGlite();
const creator=uid(1),colleague=uid(2),outside=uid(3),context=uid(11),colleagueContext=uid(12),outsideContext=uid(13);
const polo=uid(21),otherPolo=uid(22),operation=uid(31),otherOperation=uid(32),request=uid(41),otherRequest=uid(42);
const cancelId=uid(51),otherCancel=uid(52),accessKey='1'.repeat(50),otherKey='2'.repeat(50);
const signature='uuid,uuid,uuid,text,text,uuid,uuid';
const observation='public.get_nfse_individual_observation_internal';
const cancellation='public.get_nfse_individual_cancellation_observation_internal';
const args=[colleague,colleagueContext,polo,'PRODUCAO','2026-11',request,operation];
const read=(patch={})=>db.query(`SELECT ${observation}($1,$2,$3,$4,$5,$6,$7) value`,Object.values({
  actor:args[0],context:args[1],polo:args[2],environment:args[3],month:args[4],request:args[5],operation:args[6],...patch}));
const readCancel=(patch={})=>db.query(`SELECT ${cancellation}($1,$2,$3,$4,$5,$6,$7,$8) value`,Object.values({
  actor:args[0],context:args[1],polo:args[2],environment:args[3],month:args[4],request:args[5],operation:args[6],cancel:cancelId,...patch}));
const denied=promise=>assert.rejects(promise,error=>error.code==='42501');
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA private; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claim.role',true)$$;
    CREATE TABLE private.test_context(id uuid PRIMARY KEY,actor_id uuid,polo_id uuid,allowed boolean);
    CREATE TABLE private.nfse_individual_operations(id uuid PRIMARY KEY,actor_id uuid,context_id uuid,polo_id uuid,
      environment text,month text,request_id uuid,state text,result jsonb,authorized_xml text);
    CREATE TABLE private.nfse_individual_cancellations(id uuid PRIMARY KEY,operation_id uuid UNIQUE REFERENCES private.nfse_individual_operations,
      state text,access_key text,reason_code text,justification text,cancellation_model_snapshot jsonb,cancellation_model_detail text,
      expires_at timestamptz DEFAULT now()+interval '15 minutes',updated_at timestamptz DEFAULT now(),
      signed_event_xml text,event_input jsonb,result jsonb);
    CREATE TABLE private.nfse_cancellation_retry_leases(cancellation_id uuid PRIMARY KEY REFERENCES private.nfse_individual_cancellations);
    CREATE TABLE private.test_writes(id bigint GENERATED ALWAYS AS IDENTITY,kind text);
    CREATE FUNCTION private.test_track_write() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      INSERT INTO private.test_writes(kind) VALUES(TG_TABLE_NAME||':'||TG_OP);RETURN NEW;END$$;
    CREATE TRIGGER writes_operation AFTER INSERT OR UPDATE OR DELETE ON private.nfse_individual_operations FOR EACH ROW EXECUTE FUNCTION private.test_track_write();
    CREATE TRIGGER writes_cancellation AFTER INSERT OR UPDATE OR DELETE ON private.nfse_individual_cancellations FOR EACH ROW EXECUTE FUNCTION private.test_track_write();
    CREATE TRIGGER writes_retry AFTER INSERT OR UPDATE OR DELETE ON private.nfse_cancellation_retry_leases FOR EACH ROW EXECUTE FUNCTION private.test_track_write();
    -- Focused guard adapter: only current authorized contexts may READ the exact
    -- request/operation/polo/environment/month. A colleague may read the creator's
    -- row; no PREPARE/CLAIM/FINISH or input can pass through this test boundary.
    CREATE FUNCTION public.nfse_individual_operation_internal(p_actor_id uuid,p_context_key uuid,p_polo_id uuid,p_environment text,p_month text,
      p_request_id uuid,p_action text,p_preview_id uuid,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE op private.nfse_individual_operations%ROWTYPE;
    BEGIN
      IF p_action IS DISTINCT FROM 'READ' OR p_input IS NOT NULL THEN RAISE EXCEPTION 'Mutation forbidden' USING ERRCODE='42501';END IF;
      IF NOT EXISTS(SELECT 1 FROM private.test_context WHERE id=p_context_key AND actor_id=p_actor_id AND polo_id=p_polo_id AND allowed) THEN
        RAISE EXCEPTION 'Scope denied' USING ERRCODE='42501';END IF;
      SELECT * INTO op FROM private.nfse_individual_operations WHERE id=p_preview_id AND request_id=p_request_id
        AND polo_id=p_polo_id AND environment=p_environment AND month=p_month FOR UPDATE;
      IF op.id IS NULL THEN RAISE EXCEPTION 'Reference denied' USING ERRCODE='42501';END IF;
      RETURN jsonb_build_object('previewId',op.id,'state',op.state,'dispatch',false,'authorizedXml',op.authorized_xml,
        'result',op.result,'snapshot',jsonb_build_object('creator',op.actor_id));
    END$$;
    SELECT set_config('request.jwt.claim.role','service_role',false);`);
  await db.query(`INSERT INTO private.test_context VALUES($1,$2,$3,true),($4,$5,$3,true),($6,$7,$8,true)`,
    [context,creator,polo,colleagueContext,colleague,outsideContext,outside,otherPolo]);
  for(const [id,actor,ctx,unit,req,key] of [[operation,creator,context,polo,request,accessKey],[otherOperation,outside,outsideContext,otherPolo,otherRequest,otherKey]]) {
    await db.query(`INSERT INTO private.nfse_individual_operations VALUES($1,$2,$3,$4,'PRODUCAO','2026-11',$5,'AUTHORIZED',$6,'synthetic-authorized-proof')`,
      [id,actor,ctx,unit,req,{accessKey:key,number:'1'}]);
  }
  await db.exec(await readFile(new URL('../migrations/20261112220500_nfse_observation_cancellation_reference.sql',import.meta.url),'utf8'));
  const beforeReference=(await read()).rows[0].value;
  assert.equal(beforeReference.previewId,operation);assert.equal(beforeReference.cancelPreviewId,null);
  assert.equal(beforeReference.snapshot.creator,creator,'second actor keeps the original creator');
  for(const [id,op,key] of [[cancelId,operation,accessKey],[otherCancel,otherOperation,otherKey]]) {
    await db.query(`INSERT INTO private.nfse_individual_cancellations(id,operation_id,state,access_key,reason_code,justification,signed_event_xml,event_input,result)
      VALUES($1,$2,'CANCELLATION_PENDING',$3,'1','Justificativa exclusivamente sintética.','PRIVATE_SIGNED_EVENT','{"private":"PRIVATE_EVENT_INPUT"}',$4)`,
      [id,op,key,{message:'Aguardando evento.',codes:['SYNTHETIC_PENDING'],eventXml:'PRIVATE_EVENT_XML',credential:'PRIVATE_SECRET'}]);
  }
  assert.equal((await read()).rows[0].value.cancelPreviewId,cancelId,'already open observer discovers another actor cancellation');
  const pending=(await readCancel()).rows[0].value;
  assert.equal(pending.state,'CANCELLATION_PENDING');assert.equal(pending.dispatch,false);assert.equal(pending.cancelPreviewId,cancelId);
  assert(!JSON.stringify(pending).includes('PRIVATE_'),'cancel observation exposes no XML/input/credential/raw response');
  assert.deepEqual(pending.result,{message:'Aguardando evento.',codes:['SYNTHETIC_PENDING']});
  assert.equal(pending.retryUsed,false);
  assert.equal(pending.retryAvailableAt,null,'authorized colleague cannot initiate the creator-only manual retry');
  const owner=(await readCancel({actor:creator,context})).rows[0].value;
  assert(owner.retryAvailableAt,'original creator/context retains its existing retry deadline');
  await db.query(`INSERT INTO private.test_context VALUES($1,$2,$3,true)`,[uid(14),creator,polo]);
  assert.equal((await readCancel({actor:creator,context:uid(14)})).rows[0].value.retryAvailableAt,null,'another creator session context is observation-only for legacy retry');
  await db.query(`INSERT INTO private.nfse_cancellation_retry_leases VALUES($1)`,[cancelId]);
  await db.query(`UPDATE private.nfse_individual_cancellations SET state='CANCELLED',result='{"message":"Cancelamento confirmado.","codes":[]}' WHERE id=$1`,[cancelId]);
  assert.equal((await read()).rows[0].value.cancelPreviewId,cancelId,'confirmed cancellation keeps its canonical reference');
  const confirmed=(await readCancel()).rows[0].value;assert.equal(confirmed.state,'CANCELLED');assert.equal(confirmed.retryUsed,true);
  const writes=Number((await db.query('SELECT count(*) n FROM private.test_writes')).rows[0].n);
  for(let n=0;n<8;n++){await read();await readCancel();}
  assert.equal(Number((await db.query('SELECT count(*) n FROM private.test_writes')).rows[0].n),writes,'observation never writes fiscal or retry records');
  for(const patch of [{actor:outside},{context:context},{polo:otherPolo},{environment:'HOMOLOGACAO'},{month:'2026-10'},
    {request:otherRequest},{operation:otherOperation},{actor:null},{request:null},{operation:null}]) {
    await denied(read(patch));await denied(readCancel(patch));
  }
  await denied(readCancel({cancel:otherCancel}));await denied(readCancel({cancel:null}));
  await db.query(`UPDATE private.nfse_individual_operations SET state='PREVIEWED' WHERE id=$1`,[operation]);
  await denied(readCancel());
  await db.query(`UPDATE private.nfse_individual_operations SET state='AUTHORIZED' WHERE id=$1`,[operation]);
  await db.query(`UPDATE private.test_context SET allowed=false WHERE id=$1`,[colleagueContext]);
  await denied(read());await denied(readCancel());
  for(const role of ['anon','authenticated']) {
    await db.query(`SELECT set_config('request.jwt.claim.role',$1,false)`,[role]);
    await denied(read());await denied(readCancel());
    for(const fn of [`${observation}(${signature})`,`${cancellation}(${signature},uuid)`]) {
      assert.equal((await db.query(`SELECT has_function_privilege($1,$2,'EXECUTE') allowed`,[role,fn])).rows[0].allowed,false);
      assert.equal((await db.query(`SELECT has_function_privilege('service_role',$1,'EXECUTE') allowed`,[fn])).rows[0].allowed,true);
    }
  }
  console.log('PASS observation references: null/new/confirmed cancellation, authorized colleague, exact scope/IDs/role denial, zero fiscal writes, safe cancellation projection, legacy mutation boundary.');
} finally {await db.close();}
