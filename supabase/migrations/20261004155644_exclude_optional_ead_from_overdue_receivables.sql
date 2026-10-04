begin;

-- Purchase attempts remain visible in Pending/All at their nominal amount.
-- They never appear in overdue lists or overdue totals, even if an old worker
-- persisted VENCIDO. All financial classification stays on the backend.
do $overdue$
declare
  signature text;
  definition text;
  old_text constant text := $old$(p_status_scope = 'overdue' AND cr.status = 'VENCIDO')$old$;
  new_text constant text := $new$(p_status_scope = 'overdue' AND cr.status = 'VENCIDO'
          AND NOT internal_contas.ead_checkout_is_optional(cr.id))$new$;
begin
  foreach signature in array array[
    'public.get_receivables_modality_page_v3_secure(text,uuid,uuid,text,date,date,text,text,text,integer,integer)',
    'public.get_receivables_modality_groups_page_v3_secure(text,uuid,uuid,text,date,date,text,text,integer,integer)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if length(definition)-length(replace(definition,old_text,''))<>length(old_text)
      or position('ead_checkout_is_optional' in definition)>0 then
      raise exception 'Optional EAD overdue target drifted: %. Review and rebase.',signature;
    end if;
    execute replace(definition,old_text,new_text);
  end loop;
end;
$overdue$;

do $summary$
declare
  definition text;
  old_select constant text := 'SELECT cr.status, cr.valor, cr.valor_pago,';
  new_select constant text := $select$SELECT cr.status, cr.valor, cr.valor_pago,
      internal_contas.ead_checkout_is_optional(cr.id) AS optional_checkout,$select$;
  old_overdue constant text := 'WHERE due_in_period AND status = ''VENCIDO''';
  new_overdue constant text := 'WHERE due_in_period AND status = ''VENCIDO'' AND NOT optional_checkout';
  old_total constant text := $old$'all_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period), 0)$old$;
  new_total constant text := $new$'all_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period), 0),
    'optional_checkout_count', COUNT(*) FILTER (WHERE due_in_period AND optional_checkout),
    'optional_checkout_value', COALESCE(SUM(valor) FILTER (WHERE due_in_period AND optional_checkout), 0)$new$;
begin
  select pg_get_functiondef(
    'public.get_receivables_modality_summary_v3_secure(text,uuid,uuid,text,date,date)'::regprocedure)
    into definition;
  if length(definition)-length(replace(definition,old_select,''))<>length(old_select)
    or length(definition)-length(replace(definition,old_overdue,''))<>2*length(old_overdue)
    or length(definition)-length(replace(definition,old_total,''))<>length(old_total)
    or position('optional_checkout' in definition)>0 then
    raise exception 'Optional EAD summary target drifted. Review and rebase.';
  end if;
  definition:=replace(definition,old_select,new_select);
  definition:=replace(definition,old_overdue,new_overdue);
  execute replace(definition,old_total,new_total);
end;
$summary$;

notify pgrst,'reload schema';
commit;

