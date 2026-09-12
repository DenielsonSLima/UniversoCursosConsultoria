begin;
-- Extend the already-reviewed scoped worker. Preserve credential/lease guards,
-- source identity, T42 seed scope, and all banking/settlement behavior.
do $sync_completed_prefix$
declare
  v_definition text;
  v_before text;
  v_after text;
  v_signature text:='public.proesc_sync_runtime_service(text,uuid,jsonb)';
begin
  v_definition:=pg_get_functiondef(v_signature::regprocedure);
  if position('internal_proesc.sync_link_allowed' in v_definition)=0 then
    raise exception 'Scoped sync contract must be applied before the batch extension.';
  end if;
  v_before:='order by l.id limit 6';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Sync batch bound changed; rebase required.'; end if;
  v_definition:=replace(v_definition,v_before,'order by l.id limit 60');
  v_before:='  v_request bigint;';
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Sync declarations changed; rebase required.'; end if;
  v_definition:=replace(v_definition,v_before,v_before||E'\n  v_completed integer;');
  v_before:=$old$    raise exception 'Resultado de consulta inválido.' using errcode='22023'; end if;$old$;
  v_after:=v_before||$new$
  -- A report can advance only an observed contiguous prefix of this exact lease.
  -- The original lastId still identifies the complete claimed batch above.
  if p_payload ? 'completedCount' then
    if jsonb_typeof(p_payload->'completedCount') is distinct from 'number'
      or not coalesce(p_payload->>'completedCount' ~ '^[0-9]{1,2}$',false)
      or not (p_payload ? 'completedLastId') then
      raise exception 'Progresso de consulta inválido.' using errcode='22023'; end if;
    v_completed:=(p_payload->>'completedCount')::integer;
    if v_completed>coalesce(cardinality(v_state.lease_links),0)
      or v_completed>60
      or (p_payload->>'completedLastId')::uuid is distinct from
        (case when v_completed>0 then v_state.lease_links[v_completed] else null end) then
      raise exception 'Progresso fora do prefixo da concessão.' using errcode='22023'; end if;
    if (p_payload->>'success')::boolean and v_completed<>cardinality(v_state.lease_links) then
      raise exception 'Conclusão exige o lote inteiro.' using errcode='22023'; end if;
  else
    -- Compatibility with the preceding deployed worker during the atomic update.
    v_completed:=case when (p_payload->>'success')::boolean
      then cardinality(v_state.lease_links) else 0 end;
  end if;
$new$;
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Sync finish validation changed; rebase required.'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  v_before:=$old$cursor_id=case when (p_payload->>'success')::boolean then (p_payload->>'lastId')::uuid else cursor_id end,$old$;
  v_after:=$new$cursor_id=case when v_completed>0 then v_state.lease_links[v_completed] else cursor_id end,$new$;
  if (length(v_definition)-length(replace(v_definition,v_before,'')))/length(v_before)<>1 then
    raise exception 'Sync cursor update changed; rebase required.'; end if;
  v_definition:=replace(v_definition,v_before,v_after);
  execute v_definition;
end;
$sync_completed_prefix$;
notify pgrst,'reload schema';
commit;
