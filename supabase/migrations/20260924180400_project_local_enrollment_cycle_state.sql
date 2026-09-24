-- A local enrollment fee is a valid cycle record, never a pending bank title.
begin;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_cycle_state_before_external_history(uuid)'::regprocedure);
  if md5(v_definition)<>'3f95e94b622902ca22305eedc50d8aae' then raise exception 'Canonical function changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)'; end if;
  v_from:=$old$  v_review integer := 0;$old$;
  v_to:=$new$  v_review integer := 0;
  v_local integer := 0;$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$    v_cycle := jsonb_build_object(
      'numero', v_last_run.cycle_number,$old$;
  v_to:=$new$    select count(*) into v_local from jsonb_array_elements(v_last_run.reviewed_items) item
      where item->>'destinoCobranca'='LOCAL';
    v_cycle := jsonb_build_object(
      'numero', v_last_run.cycle_number,$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$      'quantidadeItens', v_last_run.item_count,$old$;
  v_to:=$new$      'quantidadeItens', v_last_run.item_count,
      'quantidadeBancaria', v_last_run.item_count-v_local,
      'quantidadeLocal', v_local,$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$        v_last_run.item_count - v_emitted - v_review, 0$old$;
  v_to:=$new$        v_last_run.item_count - v_local - v_emitted - v_review, 0$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$            and r.gateway_submission_status='API_REGISTERED')=v_last_run.item_count$old$;
  v_to:=$new$            and ((r.gateway_submission_status='API_REGISTERED'
                and coalesce(r.regra_financeira_tecnica_snapshot->>'destinoCobranca','BANESE')='BANESE')
              or internal_academic.manual_cycle_local_receivable_complete(r)))=v_last_run.item_count$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_state_before_external_history(uuid)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

create function internal_academic.manual_cycle_local_fee_summary(p_matricula_id uuid)
returns jsonb language sql stable security definer set search_path='' as $function$
  select jsonb_build_object('id',r.id,'chave',r.origem_cronograma_id,'tipo',r.tipo_lancamento,
    'numero',r.parcela_numero,'descricao',r.descricao,'valor',to_char(r.valor,'FM999999990.00'),
    'vencimento',to_char(r.data_vencimento,'YYYY-MM-DD'),'status',r.status,
    'destinoCobranca','LOCAL','emissaoBanese','NAO_APLICAVEL','localSemBoletoComprovado',true,
    'emissaoHistoricaComprovada',false)
  from internal_academic.technical_manual_cycle_runs run
  join public.contas_receber r on r.id=any(run.receivable_ids)
  where run.matricula_id=p_matricula_id and run.cycle_number=1 and run.state='LOCAL_CREATED'
    and internal_academic.manual_cycle_local_receivable_complete(r)
  limit 1;
$function$;
revoke all on function internal_academic.manual_cycle_local_fee_summary(uuid) from public,anon,authenticated,service_role;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_local_fee;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare v_state jsonb; v_cycle jsonb;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_local_fee(p_matricula_id);
  v_cycle:=v_state->'cicloGerado';
  if jsonb_typeof(v_cycle)='object' and not (v_cycle ? 'quantidadeBancaria') then
    v_state:=jsonb_set(v_state,'{cicloGerado}',v_cycle||jsonb_build_object(
      'quantidadeBancaria',v_cycle->'quantidadeItens','quantidadeLocal',0));
  end if;
  return v_state||jsonb_build_object('matriculaLocal',
    internal_academic.manual_cycle_local_fee_summary(p_matricula_id));
end;
$function$;
revoke all on function internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_local_fee(uuid)
  from public,anon,authenticated,service_role;

commit;
