-- Capture the exact payment identity when opening reversal, including stale lists.
begin;
do $projection$
declare v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef('public.get_receivables_modality_page_v4_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)'::regprocedure);
  if md5(v_definition)<>'e68d1da60d1a612df5eadd727c79b64c' then
    raise exception 'Receivables reversal projection changed.';
  end if;
  v_from:=$old$      'manual_settlement_actor_name', NULLIF(pg_catalog.btrim(actor.nome), ''),$old$;
  v_definition:=replace(v_definition,v_from,$new$      'manual_settlement_id', target.manual_settlement_id,
      'destino_cobranca', case when target.regra_financeira_tecnica_snapshot->>'destinoCobranca' in ('LOCAL','BANESE')
        then target.regra_financeira_tecnica_snapshot->>'destinoCobranca' end,
      'manual_settlement_actor_name', NULLIF(pg_catalog.btrim(actor.nome), ''),$new$);
  -- Use a separate unrestricted-by-status join so corrupt LOCAL rows stay LOCAL.
  v_from:=$old$  LEFT JOIN public.contas_receber receivable$old$;
  execute replace(v_definition,v_from,$new$  LEFT JOIN public.contas_receber target ON target.id = (entry.value ->> 'id')::uuid
  LEFT JOIN public.contas_receber receivable$new$);
end;
$projection$;
commit;
