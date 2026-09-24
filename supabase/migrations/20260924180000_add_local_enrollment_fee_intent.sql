-- Three explicit enrollment-fee intentions; legacy boolean requests retain their meaning.
begin;

create function internal_academic.manual_cycle_enrollment_mode(p_review jsonb)
returns text language plpgsql immutable set search_path='' as $function$
declare v_mode text;
begin
  if p_review is null then return 'BOLETO'; end if;
  if jsonb_typeof(p_review) is distinct from 'object' then
    raise exception 'Revisão do ciclo inválida.' using errcode='22023';
  end if;
  v_mode:=p_review->>'modoMatricula';
  if p_review ? 'modoMatricula' and jsonb_typeof(p_review->'modoMatricula') is distinct from 'string' then
    raise exception 'Tratamento da matrícula inválido.' using errcode='22023';
  end if;
  if v_mode is null then
    if jsonb_typeof(p_review->'emitirMatricula') is distinct from 'boolean' then
      raise exception 'Informe o tratamento da matrícula.' using errcode='22023';
    end if;
    return case when (p_review->>'emitirMatricula')::boolean then 'BOLETO' else 'OMITIR' end;
  end if;
  if v_mode not in ('BOLETO','REGISTRO_SEM_BOLETO','OMITIR') then
    raise exception 'Tratamento da matrícula inválido.' using errcode='22023';
  end if;
  if p_review ? 'emitirMatricula' and (
    jsonb_typeof(p_review->'emitirMatricula') is distinct from 'boolean'
    or (p_review->>'emitirMatricula')::boolean is distinct from (v_mode='BOLETO')
  ) then
    raise exception 'A opção de boleto conflita com o tratamento da matrícula.' using errcode='22023';
  end if;
  return v_mode;
end;
$function$;

alter function internal_academic.review_manual_cycle_items(jsonb,jsonb,jsonb,text,text)
  rename to review_manual_cycle_items_before_local_enrollment;
create function internal_academic.review_manual_cycle_items(
  p_items jsonb,p_review jsonb,p_rule jsonb,p_class_code text,p_class_name text
)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_mode text; v_review jsonb; v_result jsonb; v_items jsonb;
begin
  v_mode:=internal_academic.manual_cycle_enrollment_mode(p_review);
  if p_review ? 'modoMatricula' and v_mode<>'BOLETO' and not exists(
    select 1 from jsonb_array_elements(p_items) i where i->>'tipo'='MATRICULA'
  ) then
    raise exception 'A opção de matrícula é exclusiva do primeiro ciclo.' using errcode='22023';
  end if;
  v_review:=case when p_review is null then null else
    (p_review-'modoMatricula')||jsonb_build_object('emitirMatricula',v_mode<>'OMITIR') end;
  v_result:=internal_academic.review_manual_cycle_items_before_local_enrollment(
    p_items,v_review,p_rule,p_class_code,p_class_name);
  select coalesce(jsonb_agg(i||jsonb_build_object('destinoCobranca',
    case when v_mode='REGISTRO_SEM_BOLETO' and i->>'tipo'='MATRICULA'
      then 'LOCAL' else 'BANESE' end) order by n),'[]'::jsonb)
    into v_items from jsonb_array_elements(v_result->'itens') with ordinality a(i,n);
  return v_result||jsonb_build_object('itens',v_items,'modoMatricula',v_mode,
    'quantidadeBancaria',(select count(*) from jsonb_array_elements(v_items) i where i->>'destinoCobranca'='BANESE'),
    'quantidadeLocal',(select count(*) from jsonb_array_elements(v_items) i where i->>'destinoCobranca'='LOCAL'));
end;
$function$;
revoke all on function internal_academic.manual_cycle_enrollment_mode(jsonb),
  internal_academic.review_manual_cycle_items(jsonb,jsonb,jsonb,text,text),
  internal_academic.review_manual_cycle_items_before_local_enrollment(jsonb,jsonb,jsonb,text,text)
  from public,anon,authenticated,service_role;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb)'::regprocedure);
  if md5(v_definition)<>'c47a3df06c990d794e84d75a56486a43' then raise exception 'Canonical function changed: internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb)'; end if;
  v_from:=$old$    'versao', 2,$old$;
  v_to:=$new$    'versao', 2,
    'destinoCobranca', coalesce(p_item->>'destinoCobranca','BANESE'),$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)'::regprocedure);
  if md5(v_definition)<>'ad6a21d87fcc713d93569f29ce09d85a' then raise exception 'Canonical function changed: internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)'; end if;
  v_from:=$old$      'quantidadeItens', jsonb_array_length(v_items),$old$;
  v_to:=$new$      'quantidadeItens', jsonb_array_length(v_items),
      'modoMatricula', v_reviewed->>'modoMatricula',
      'quantidadeBancaria', v_reviewed->'quantidadeBancaria',
      'quantidadeLocal', v_reviewed->'quantidadeLocal',$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

do $patch$
declare v_definition text; v_from text; v_to text;
begin
  v_definition:=pg_get_functiondef('public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)'::regprocedure);
  if md5(v_definition)<>'7db9b54c96fb2eca70ec3a8694d662d0' then raise exception 'Canonical function changed: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)'; end if;
  v_from:=$old$      'emissaoBanese', 'NAO_EMITIDO'$old$;
  v_to:=$new$      'destinoCobranca', coalesce(v_item->>'destinoCobranca','BANESE'),
      'localSemBoletoComprovado', v_item->>'destinoCobranca'='LOCAL',
      'emissaoBanese', case when v_item->>'destinoCobranca'='LOCAL' then 'NAO_APLICAVEL' else 'NAO_EMITIDO' end$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  v_from:=$old$      'status', 'CRIADO_LOCAL',
      'quantidadeItens', v_inserted,$old$;
  v_to:=$new$      'status', 'CRIADO_LOCAL',
      'quantidadeItens', v_inserted,
      'modoMatricula', v_preview->>'modoMatricula',
      'quantidadeBancaria', v_preview->'quantidadeBancaria',
      'quantidadeLocal', v_preview->'quantidadeLocal',$new$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Canonical function boundary changed: public.gerar_ciclo_financeiro_tecnico_manual_secure(uuid,integer,date,uuid,text,text,text,jsonb)';
  end if;
  v_definition:=replace(v_definition,v_from,v_to);
  execute v_definition;
end;
$patch$;

commit;
