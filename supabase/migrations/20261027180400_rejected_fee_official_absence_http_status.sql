begin;
set local lock_timeout='5s';
-- Banese API v1.6 section 2.3 documents a singleton Erros code for exact GET absence.
-- HTTP 400 is admitted only with worker normalization metadata; legacy 404 is preserved.
-- No changes to authorization, identity, source CAS, lease, TTL or response hashing.
do $migration$
declare
 signature regprocedure := 'public.confirm_rejected_fee_absence_service(uuid,text,uuid,jsonb)'::regprocedure;
 definition text;
 original_hash text;
 old_fragment text := $old$  or p_evidence->'httpStatus' is distinct from '404'::jsonb$old$;
 new_fragment text := $new$  or not coalesce((p_evidence->'httpStatus' = '404'::jsonb or (
   p_evidence->'httpStatus' = '400'::jsonb
   and p_evidence->>'normalizer' = 'BANESE_GET_SINGLE_ERROR_V1'
   and p_evidence->>'responseShape' = 'Erros[1].CodigoErroProcessamento'
   and p_evidence->'errorCount' = '1'::jsonb)),false)$new$;
begin
 select md5(prosrc), pg_get_functiondef(oid) into strict original_hash, definition
 from pg_proc where oid=signature;
 if original_hash <> '72f48bd8c942613cc4ca3aca7267a76e' then
  raise exception 'REJECTED_FEE_ABSENCE_FUNCTION_DRIFT';
 end if;
 if (length(definition)-length(replace(definition,old_fragment,'')))/length(old_fragment) <> 1 then
  raise exception 'REJECTED_FEE_ABSENCE_PATCH_TARGET_DRIFT';
 end if;
 execute replace(definition,old_fragment,new_fragment);
end $migration$;
commit;
