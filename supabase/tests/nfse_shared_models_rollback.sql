-- STAGING ONLY, after the four shared-model migrations. Execute the entire file
-- in one transaction/session. Uses synthetic organizations, units and actor.
-- An isolated authorization stub exercises mutation mechanics; it does NOT prove
-- portal authorization. No actual user, model, fiscal operation or provider call.
BEGIN;
SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE nfse_shared_fixture(ids uuid[]) ON COMMIT DROP;
INSERT INTO nfse_shared_fixture SELECT ARRAY(SELECT gen_random_uuid() FROM generate_series(1,10));
DO $test$
DECLARE x uuid[]; result boolean;
BEGIN
 SELECT ids INTO x FROM nfse_shared_fixture;
 INSERT INTO public.empresas(id,nome_fantasia,razao_social,cnpj)
 VALUES(x[1],'NFSE TEST A','NFSE TEST A',x[1]::text),(x[2],'NFSE TEST B','NFSE TEST B',x[2]::text);
 INSERT INTO public.polos(id,company_id,nome,cnpj,cidade,estado,is_matriz,status) VALUES
 (x[3],x[1],'NFSE TEST MATRIX',x[3]::text,'Teste','SE',true,'ativo'),
 (x[4],x[1],'NFSE TEST BRANCH',x[4]::text,'Teste','SE',false,'ativo'),
 (x[5],x[1],'NFSE TEST SIBLING',x[5]::text,'Teste','SE',false,'ativo'),
 (x[6],x[2],'NFSE TEST OTHER',x[6]::text,'Teste','SE',false,'ativo'),
 (x[7],x[1],'NFSE TEST INACTIVE',x[7]::text,'Teste','SE',false,'inativo');
 IF NOT private.nfse_model_visible_to_polo(x[3],x[4],'{}') THEN RAISE EXCEPTION 'Matrix inheritance missing'; END IF;
 IF private.nfse_model_visible_to_polo(x[3],x[6],'{}')
 OR private.nfse_model_visible_to_polo(x[4],x[5],'{}')
 OR private.nfse_model_visible_to_polo(x[4],x[3],'{}')
 OR private.nfse_model_visible_to_polo(x[3],x[7],'{}') THEN RAISE EXCEPTION 'Scope isolation failed'; END IF;
 UPDATE public.polos SET status='inativo' WHERE id=x[3];
 IF private.nfse_model_visible_to_polo(x[3],x[4],'{}') THEN
  RAISE EXCEPTION 'Inactive origin leaked'; END IF;
 UPDATE public.polos SET status='ativo' WHERE id=x[3];
 IF private.nfse_model_visible_to_polo(x[3],x[4],jsonb_build_object('peopleOptions',
   jsonb_build_object('destinationPartnerId',x[10]))) THEN RAISE EXCEPTION 'Fixed participant escaped'; END IF;
 INSERT INTO private.nfse_models(id,polo_id,environment,definition,created_by,updated_by)
 VALUES(x[8],x[3],'HOMOLOGACAO','{"name":"Synthetic service","active":true,"serviceOptions":{"countryCode":"BRA"},
 "peopleOptions":{"version":2,"destinationSource":"OPERATION"},
 "additionalOptions":{"nested":{"preserved":[1,2,3]}},"valuesOptions":{"amount":"123.45"}}',x[9],x[9]);
 IF NOT EXISTS(SELECT 1 FROM public.nfse_change_events WHERE polo_id=x[4] AND resource='models') THEN
   RAISE EXCEPTION 'Missing dependent invalidation'; END IF;
 IF EXISTS(SELECT 1 FROM public.nfse_change_events WHERE polo_id=x[6] AND resource='models') THEN
   RAISE EXCEPTION 'Cross-company invalidation'; END IF;
END;
$test$;
-- The anonymous request must fail before any request lookup.
SELECT set_config('request.jwt.claim.sub','',true);
DO $test$
DECLARE x uuid[];
BEGIN
 SELECT ids INTO x FROM nfse_shared_fixture;
 BEGIN
  PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',gen_random_uuid(),'CLONE',x[8],1);
  RAISE EXCEPTION 'Anonymous mutation succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
-- Transaction-local replacement restored by ROLLBACK. Only test fixture scope.
CREATE OR REPLACE FUNCTION private.authorize_nfse_model_scope(p_context_key uuid,p_polo_id uuid,p_environment text,p_month text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $stub$
DECLARE x uuid[];
BEGIN
 SELECT ids INTO x FROM pg_temp.nfse_shared_fixture;
 IF current_setting('nfse.test.revoked',true)='true'
 OR auth.uid() IS DISTINCT FROM x[9] OR $1 IS DISTINCT FROM x[10]
 OR $2 NOT IN(x[3],x[4]) OR $3<>'HOMOLOGACAO' OR $4<>'2026-11' THEN
  RAISE EXCEPTION 'Synthetic scope rejected' USING ERRCODE='42501'; END IF;
END;
$stub$;
DO $test$
DECLARE x uuid[]; r jsonb; replay jsonb; req uuid:=gen_random_uuid(); clone_id uuid; original jsonb; snapshot jsonb;
BEGIN
 SELECT ids INTO x FROM nfse_shared_fixture;
 PERFORM set_config('request.jwt.claim.sub',x[9]::text,true);
 r:=public.get_nfse_models_secure(x[10],x[4],'HOMOLOGACAO','2026-11');
 IF r#>>'{data,rows,0,id}' IS DISTINCT FROM x[8]::text
 OR r#>'{data,rows,0,inherited}' IS DISTINCT FROM 'true'::jsonb
 OR r#>'{data,rows,0,canManage}' IS DISTINCT FROM 'false'::jsonb
 OR r#>>'{data,rows,0,sourcePoloId}' IS DISTINCT FROM x[3]::text THEN
  RAISE EXCEPTION 'Inherited projection contract failed'; END IF;
 SELECT definition INTO original FROM private.nfse_models WHERE id=x[8];
 r:=public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',req,'CLONE',x[8],1);
 clone_id:=(r#>>'{data,id}')::uuid;
 replay:=public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',req,'CLONE',x[8],1);
 IF r IS DISTINCT FROM replay OR (SELECT count(*) FROM private.nfse_models WHERE polo_id=x[4])<>1 THEN
  RAISE EXCEPTION 'Replay created a duplicate'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.nfse_models WHERE id=clone_id AND polo_id=x[4] AND version=1
   AND definition->>'name'='Synthetic service (cópia)' AND definition->'active'='true') THEN
  RAISE EXCEPTION 'Clone contract failed'; END IF;
 IF (SELECT definition-'name'-'active' FROM private.nfse_models WHERE id=clone_id)
 IS DISTINCT FROM original-'name'-'active' THEN RAISE EXCEPTION 'Complex presets lost'; END IF;
 SELECT payload->'audit' INTO snapshot FROM private.nfse_model_requests WHERE actor_id=x[9] AND request_id=req;
 IF snapshot->'beforeDefinition' IS DISTINCT FROM original
 OR snapshot->>'sourceModelId' IS DISTINCT FROM x[8]::text
 OR snapshot->>'sourcePoloId' IS DISTINCT FROM x[3]::text
 OR snapshot->'sourceVersion' IS DISTINCT FROM '1'::jsonb
 OR snapshot->'resultDefinition' IS DISTINCT FROM (SELECT definition FROM private.nfse_models WHERE id=clone_id)
 OR snapshot->>'resultModelId' IS DISTINCT FROM clone_id::text THEN
  RAISE EXCEPTION 'Audit snapshots missing'; END IF;
 BEGIN
  PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',req,'DEACTIVATE',clone_id,1);
  RAISE EXCEPTION 'Request reuse accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',gen_random_uuid(),'DEACTIVATE',x[8],1);
  RAISE EXCEPTION 'Inherited deactivation accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',gen_random_uuid(),'DEACTIVATE',clone_id,1);
 BEGIN
  PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',gen_random_uuid(),'DEACTIVATE',clone_id,1);
  RAISE EXCEPTION 'Stale version accepted';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM private.nfse_models WHERE id=x[8] AND version=1 AND definition->'active'='true') THEN
  RAISE EXCEPTION 'Original was changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.nfse_model_requests WHERE actor_id=x[9]
   AND payload->>'action'='DEACTIVATE' AND payload#>'{audit,beforeDefinition,active}'='true'
   AND payload#>'{audit,resultDefinition,active}'='false') THEN
  RAISE EXCEPTION 'Deactivation snapshots missing'; END IF;
 -- Editing the source later cannot rewrite history or invalidate exact replay.
 UPDATE private.nfse_models SET definition=jsonb_build_object('name','Edited later','active',false),version=2 WHERE id=x[8];
 replay:=public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',req,'CLONE',x[8],1);
 IF r IS DISTINCT FROM replay OR snapshot IS DISTINCT FROM
   (SELECT payload->'audit' FROM private.nfse_model_requests WHERE actor_id=x[9] AND request_id=req) THEN
  RAISE EXCEPTION 'Historical replay or snapshot changed'; END IF;
 -- The same actor loses scope access: even the saved response is unavailable.
 PERFORM set_config('nfse.test.revoked','true',true);
 BEGIN
  PERFORM public.mutate_nfse_model_secure(x[10],x[4],'HOMOLOGACAO','2026-11',req,'CLONE',x[8],1);
  RAISE EXCEPTION 'Replay bypassed current authorization';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('nfse.test.revoked','false',true);
 IF (SELECT count(*) FROM private.nfse_model_requests WHERE actor_id=x[9])<>2 THEN
  RAISE EXCEPTION 'Mutation audit missing'; END IF;
END;
$test$;
ROLLBACK;
