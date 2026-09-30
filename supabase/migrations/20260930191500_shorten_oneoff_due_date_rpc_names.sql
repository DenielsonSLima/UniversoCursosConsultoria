begin;
set local lock_timeout = '5s';

-- PostgreSQL limita identificadores a 63 bytes. Os nomes originais foram
-- truncados silenciosamente no catálogo e, por isso, o PostgREST não conseguia
-- resolver os nomes completos enviados pelo worker. Renomeamos somente as duas
-- RPCs one-off para nomes explícitos dentro do limite, preservando corpo e ACL.
do $guard$
declare
  v_mark regprocedure :=
    'public.mark_known_technical_manual_banese_due_date_cancel_intent_servi(uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid)'::regprocedure;
  v_prepare regprocedure :=
    'public.prepare_known_technical_manual_banese_due_date_correction_servi(uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid,text,integer,timestamp with time zone,text,boolean,boolean)'::regprocedure;
begin
  if to_regprocedure(
      'public.mark_technical_due_date_cancel_intent_service(uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid)'
    ) is not null
    or to_regprocedure(
      'public.prepare_technical_due_date_correction_service(uuid,uuid,uuid,uuid,uuid,integer,uuid,integer,text,date,date,uuid,text,integer,timestamp with time zone,text,boolean,boolean)'
    ) is not null
    or md5(pg_get_functiondef(v_mark)) <> 'b2398e3bad6d97a641375796346a2629'
    or md5(pg_get_functiondef(v_prepare)) <> 'aa9ff0d4715ed0cd2bdcf173fed4d2d4'
  then
    raise exception 'RPC one-off de vencimento divergiu; rename abortado.';
  end if;
end;
$guard$;

alter function public.mark_known_technical_manual_banese_due_date_cancel_intent_servi(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date, uuid
) rename to mark_technical_due_date_cancel_intent_service;

alter function public.prepare_known_technical_manual_banese_due_date_correction_servi(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date,
  uuid, text, integer, timestamptz, text, boolean, boolean
) rename to prepare_technical_due_date_correction_service;

revoke all on function public.mark_technical_due_date_cancel_intent_service(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date, uuid
) from public, anon, authenticated;
grant execute on function public.mark_technical_due_date_cancel_intent_service(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date, uuid
) to postgres, service_role, supabase_admin;

revoke all on function public.prepare_technical_due_date_correction_service(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date,
  uuid, text, integer, timestamptz, text, boolean, boolean
) from public, anon, authenticated;
grant execute on function public.prepare_technical_due_date_correction_service(
  uuid, uuid, uuid, uuid, uuid, integer, uuid, integer, text, date, date,
  uuid, text, integer, timestamptz, text, boolean, boolean
) to postgres, service_role, supabase_admin;

notify pgrst, 'reload schema';
commit;
