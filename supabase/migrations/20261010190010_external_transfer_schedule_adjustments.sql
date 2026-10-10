begin;
create function internal_academic.adjust_transfer_schedule(p_rule jsonb,p_plan jsonb,p_adjustment jsonb)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_plan jsonb:=internal_academic.normalize_transfer_schedule(p_rule,p_plan);
  v_action text; v_cycle integer; v_quantity integer; v_count integer; v_number integer;
  v_order integer; v_item jsonb; v_items jsonb:='[]'; v_cycle_items jsonb:='[]';
  v_fee boolean; v_kind text; v_due date; v_last date; v_day integer; v_key text;
  v_identity text:=internal_academic.transfer_schedule_fingerprint(p_plan);
begin
  if p_adjustment is null then return v_plan; end if;
  if jsonb_typeof(p_adjustment) is distinct from 'object'
    or jsonb_typeof(p_adjustment->'acao') is distinct from 'string'
    or jsonb_typeof(p_adjustment->'cicloNumero') is distinct from 'number'
    or coalesce(p_adjustment->>'cicloNumero','') !~ '^[12]$' then
    raise exception 'Ajuste de cronograma inválido.' using errcode='22023';
  end if;
  v_action:=p_adjustment->>'acao'; v_cycle:=(p_adjustment->>'cicloNumero')::integer;
  if v_cycle>(p_rule#>>'{continuidade,maxCiclos}')::integer then
    raise exception 'A turma não possui este ciclo.' using errcode='22023'; end if;
  if v_action='ADICIONAR_ITEM' then
    if exists(select 1 from jsonb_object_keys(p_adjustment) k where k not in (
      'acao','cicloNumero','tipo','itemId','valor'))
      or jsonb_typeof(p_adjustment->'tipo') is distinct from 'string'
      or p_adjustment->>'tipo' not in ('MATRICULA','PARCELA','REMATRICULA')
      or jsonb_typeof(p_adjustment->'itemId') is distinct from 'string'
      or coalesce(p_adjustment->>'itemId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Novo item de cronograma inválido.' using errcode='22023'; end if;
    v_kind:=p_adjustment->>'tipo';
    select max((i->>'ordem')::integer),max((i->>'vencimento')::date) into v_order,v_last
      from jsonb_array_elements(v_plan->'itens') i where (i->>'cicloNumero')::integer=v_cycle;
    v_due:=case when v_kind='PARCELA' and v_last is not null
      then public.data_vencimento_mensal(v_last,(p_rule#>>'{vencimento,diaBase}')::integer,1)
      else coalesce((select (i->>'vencimento')::date from jsonb_array_elements(v_plan->'itens') i
        where (i->>'cicloNumero')::integer=v_cycle order by (i->>'ordem')::integer limit 1),
        (select (i->>'vencimento')::date from jsonb_array_elements(
          internal_academic.default_transfer_schedule(p_rule)->'itens') i
          where (i->>'cicloNumero')::integer=v_cycle order by (i->>'ordem')::integer limit 1)) end;
    v_item:=internal_academic.transfer_schedule_default_item(p_rule,v_cycle,v_kind,coalesce(v_order,0)+1,
      v_due,v_identity||':add:'||(p_adjustment->>'itemId'))||jsonb_build_object('itemId',p_adjustment->>'itemId');
    if p_adjustment ? 'valor' then v_item:=jsonb_set(v_item,'{valor}',p_adjustment->'valor'); end if;
    return internal_academic.normalize_transfer_schedule(p_rule,
      jsonb_build_object('versao',3,'itens',(v_plan->'itens')||jsonb_build_array(v_item)));
  elsif v_action<>'CONFIGURAR_CICLO' then
    raise exception 'Ação de cronograma não suportada.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_adjustment) k where k not in (
    'acao','cicloNumero','quantidadeParcelas','primeiroVencimento','valorMensalidade','cobrarTaxa',
    'valorTaxa','descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual'))
    or (p_adjustment ? 'quantidadeParcelas' and (
      jsonb_typeof(p_adjustment->'quantidadeParcelas') is distinct from 'number'
      or coalesce(p_adjustment->>'quantidadeParcelas','') !~ '^(0|[1-9][0-9]?)$'
      or (p_adjustment->>'quantidadeParcelas')::integer>60))
    or (p_adjustment ? 'cobrarTaxa' and jsonb_typeof(p_adjustment->'cobrarTaxa') is distinct from 'boolean')
    or (p_adjustment ? 'primeiroVencimento' and (
      jsonb_typeof(p_adjustment->'primeiroVencimento') is distinct from 'string'
      or coalesce(p_adjustment->>'primeiroVencimento','') !~ '^\d{4}-\d{2}-\d{2}$')) then
    raise exception 'Campos do ajuste de ciclo inválidos.' using errcode='22023';
  end if;
  foreach v_key in array array['valorMensalidade','valorTaxa','descontoPontualidade',
    'jurosAtrasoPercentual','multaAtrasoPercentual'] loop
    if not p_adjustment ? v_key then continue; end if;
    if jsonb_typeof(p_adjustment->v_key) is distinct from 'string'
      or coalesce(p_adjustment->>v_key,'') !~ (case when v_key in ('valorMensalidade','valorTaxa','descontoPontualidade')
        then '^[0-9]{1,8}([.][0-9]{1,2})?$' else '^[0-9]{1,3}([.][0-9]{1,6})?$' end)
      or (v_key in ('valorMensalidade','valorTaxa','descontoPontualidade')
        and (p_adjustment->>v_key)::numeric>9999999.99)
      or (v_key in ('jurosAtrasoPercentual','multaAtrasoPercentual') and (p_adjustment->>v_key)::numeric>=100) then
      raise exception 'Valor ou encargo do ajuste inválido.' using errcode='22023'; end if;
  end loop;
  select count(*) filter(where i->>'tipo'='PARCELA'),bool_or(i->>'tipo'<>'PARCELA'),
    max((i->>'vencimento')::date) into v_count,v_fee,v_last
    from jsonb_array_elements(v_plan->'itens') i where (i->>'cicloNumero')::integer=v_cycle;
  v_quantity:=coalesce((p_adjustment->>'quantidadeParcelas')::integer,v_count);
  v_fee:=coalesce((p_adjustment->>'cobrarTaxa')::boolean,v_fee,false);
  begin
    v_due:=coalesce((p_adjustment->>'primeiroVencimento')::date,
      (select (i->>'vencimento')::date from jsonb_array_elements(v_plan->'itens') i
        where (i->>'cicloNumero')::integer=v_cycle order by (i->>'ordem')::integer limit 1),
      (select (i->>'vencimento')::date from jsonb_array_elements(
        internal_academic.default_transfer_schedule(p_rule)->'itens') i
        where (i->>'cicloNumero')::integer=v_cycle order by (i->>'ordem')::integer limit 1));
  exception when datetime_field_overflow then
    raise exception 'Primeiro vencimento inválido.' using errcode='22023'; end;
  v_day:=case when p_adjustment ? 'primeiroVencimento' then extract(day from v_due)::integer
    else (p_rule#>>'{vencimento,diaBase}')::integer end;
  v_number:=0;
  for v_item in select i from jsonb_array_elements(v_plan->'itens') i loop
    if (v_item->>'cicloNumero')::integer<>v_cycle then v_items:=v_items||jsonb_build_array(v_item); continue; end if;
    if v_item->>'tipo'='PARCELA' then
      v_number:=v_number+1;
      if v_number>v_quantity then continue; end if;
    elsif not v_fee then continue; end if;
    v_cycle_items:=v_cycle_items||jsonb_build_array(v_item);
  end loop;
  if v_fee and not exists(select 1 from jsonb_array_elements(v_cycle_items) i where i->>'tipo'<>'PARCELA') then
    v_cycle_items:=jsonb_build_array(internal_academic.transfer_schedule_default_item(p_rule,v_cycle,
      case v_cycle when 1 then 'MATRICULA' else 'REMATRICULA' end,1,v_due,v_identity||':'||v_cycle||':fee'))||v_cycle_items;
  end if;
  for v_number in v_count+1..v_quantity loop
    v_cycle_items:=v_cycle_items||jsonb_build_array(internal_academic.transfer_schedule_default_item(
      p_rule,v_cycle,'PARCELA',1,
      case when p_adjustment ? 'primeiroVencimento' then v_due
        else public.data_vencimento_mensal(coalesce(v_last,v_due),v_day,
          v_number-v_count-case when v_last is null and not v_fee then 1 else 0 end) end,
      v_identity||':'||v_cycle||':new:'||v_number));
  end loop;
  v_order:=0; v_number:=0;
  for v_item in select i from jsonb_array_elements(v_cycle_items) i loop
    v_order:=v_order+1;
    v_item:=v_item||jsonb_build_object('ordem',v_order);
    if v_item->>'tipo'='PARCELA' then
      v_number:=v_number+1;
      if p_adjustment ? 'valorMensalidade' then v_item:=jsonb_set(v_item,'{valor}',p_adjustment->'valorMensalidade'); end if;
    elsif p_adjustment ? 'valorTaxa' then v_item:=jsonb_set(v_item,'{valor}',p_adjustment->'valorTaxa'); end if;
    if p_adjustment ? 'primeiroVencimento' and v_item->>'tipo'='PARCELA' then
      v_item:=jsonb_set(v_item,'{vencimento}',to_jsonb(public.data_vencimento_mensal(v_due,v_day,v_number-1)));
    end if;
    foreach v_key in array array['descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual'] loop
      if p_adjustment ? v_key then v_item:=jsonb_set(v_item,array[v_key],p_adjustment->v_key); end if;
    end loop;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  return internal_academic.normalize_transfer_schedule(p_rule,jsonb_build_object('versao',3,'itens',v_items));
end;
$function$;
revoke all on function internal_academic.adjust_transfer_schedule(jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;
commit;
