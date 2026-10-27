begin;
-- A released/unclaimed NULL lease must fail closed, just like an expired lease.
-- Existing applied migrations remain unchanged.
do $patch$
declare sig text;body text;
begin
 foreach sig in array array[
  'internal_academic.capture_service_fee_replacement_number(public.contas_receber,public.contas_receber)',
  'internal_academic.service_fee_replacement_number_valid(public.contas_receber,public.contas_receber)',
  'public.confirm_service_fee_canceled_service(uuid,text,uuid,jsonb)',
  'public.mark_service_fee_cancel_intent_service(uuid,text,uuid)',
  'public.stage_service_fee_replacement_result_service(uuid,text,uuid,jsonb)'
 ] loop
  body:=pg_get_functiondef(sig::regprocedure);
  if strpos(body,'j.lease_until<=clock_timestamp()')=0 or strpos(body,'j.lease_until is null')<>0 then
   raise exception 'FEE_REPLACEMENT_NULL_LEASE_GUARD_DRIFT'; end if;
  body:=replace(body,'j.lease_until<=clock_timestamp()',
   '(j.lease_until is null or j.lease_until<=clock_timestamp())');
  body:=replace(body,'c.lease_until<=clock_timestamp()',
   '(c.lease_until is null or c.lease_until<=clock_timestamp())');
  execute body;
 end loop;
end $patch$;
commit;
