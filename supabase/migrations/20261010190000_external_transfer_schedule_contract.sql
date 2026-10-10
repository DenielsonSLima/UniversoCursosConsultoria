begin;

create function internal_academic.transfer_schedule_item_id(p_identity text)
returns uuid language sql immutable set search_path='' as $function$
  select (substr(md5(p_identity),1,8)||'-'||substr(md5(p_identity),9,4)||'-5'
    ||substr(md5(p_identity),14,3)||'-8'||substr(md5(p_identity),18,3)||'-'
    ||substr(md5(p_identity),21,12))::uuid;
$function$;

create function internal_academic.normalize_transfer_schedule(p_rule jsonb,p_plan jsonb,p_validate_due boolean default true)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_item jsonb; v_result jsonb:='[]'; v_cycle integer; v_order integer;
  v_previous_cycle integer:=0; v_due date; v_key text; v_value numeric;
  v_today date:=timezone('America/Maceio',now())::date;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' or p_plan->'versao' is distinct from '3'::jsonb
    or jsonb_typeof(p_plan->'itens') is distinct from 'array'
    or jsonb_array_length(p_plan->'itens')>122
    or exists(select 1 from jsonb_object_keys(p_plan) k where k not in ('versao','itens')) then
    raise exception 'Cronograma individual inválido.' using errcode='22023';
  end if;
  for v_item in select i from jsonb_array_elements(p_plan->'itens') i loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(v_item) k where k not in (
        'itemId','cicloNumero','tipo','ordem','vencimento','valor','descontoPontualidade',
        'jurosAtrasoPercentual','multaAtrasoPercentual'))
      or jsonb_typeof(v_item->'itemId') is distinct from 'string'
      or coalesce(v_item->>'itemId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_item->'cicloNumero') is distinct from 'number'
      or coalesce(v_item->>'cicloNumero','') !~ '^[12]$'
      or jsonb_typeof(v_item->'ordem') is distinct from 'number'
      or coalesce(v_item->>'ordem','') !~ '^[1-9][0-9]?$'
      or (v_item->>'ordem')::integer>61
      or jsonb_typeof(v_item->'tipo') is distinct from 'string'
      or v_item->>'tipo' not in ('MATRICULA','PARCELA','REMATRICULA')
      or jsonb_typeof(v_item->'vencimento') is distinct from 'string'
      or coalesce(v_item->>'vencimento','') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Identidade, ciclo, ordem ou vencimento do item inválido.' using errcode='22023';
    end if;
    v_cycle:=(v_item->>'cicloNumero')::integer;
    if v_cycle>(p_rule#>>'{continuidade,maxCiclos}')::integer
      or (v_item->>'tipo'='MATRICULA' and v_cycle<>1)
      or (v_item->>'tipo'='REMATRICULA' and v_cycle<>2) then
      raise exception 'Tipo de cobrança ou ciclo não permitido nesta turma.' using errcode='22023';
    end if;
    foreach v_key in array array['valor','descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual'] loop
      if jsonb_typeof(v_item->v_key) is distinct from 'string'
        or coalesce(v_item->>v_key,'') !~ (case when v_key in ('valor','descontoPontualidade')
          then '^[0-9]{1,8}([.][0-9]{1,2})?$' else '^[0-9]{1,3}([.][0-9]{1,6})?$' end) then
        raise exception 'Valor ou encargo inválido no item.' using errcode='22023';
      end if;
      v_value:=(v_item->>v_key)::numeric;
      if (v_key in ('valor','descontoPontualidade') and v_value>9999999.99)
        or (v_key='valor' and v_value<=0)
        or (v_key='descontoPontualidade' and v_value>0 and v_value>=(v_item->>'valor')::numeric)
        or (v_key in ('jurosAtrasoPercentual','multaAtrasoPercentual') and v_value>=100) then
        raise exception 'Cobrança positiva, desconto menor que o valor e percentuais menores que 100%% são obrigatórios.' using errcode='22023';
      end if;
      v_item:=jsonb_set(v_item,array[v_key],to_jsonb(to_char(v_value,
        case when v_key in ('valor','descontoPontualidade') then 'FM999999990.00' else 'FM999999990.000000' end)));
    end loop;
    begin v_due:=(v_item->>'vencimento')::date;
    exception when datetime_field_overflow then
      raise exception 'Vencimento inválido no item.' using errcode='22023'; end;
    if p_validate_due and (v_due<v_today or v_due>v_today+1825) then
      raise exception 'Os vencimentos devem estar entre hoje e cinco anos.' using errcode='22023';
    end if;
    v_result:=v_result||jsonb_build_array(v_item||jsonb_build_object('itemId',(v_item->>'itemId')::uuid));
  end loop;
  if exists(select 1 from jsonb_array_elements(v_result) i group by i->>'itemId' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_result) i group by i->>'cicloNumero',i->>'ordem' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(v_result) i group by i->>'cicloNumero'
      having count(*) filter(where i->>'tipo'='PARCELA')>60
        or count(*) filter(where i->>'tipo'<>'PARCELA')>1) then
    raise exception 'Itens repetidos, ordem repetida ou quantidade de cobranças excedida.' using errcode='22023';
  end if;
  v_result:='[]';
  for v_item in select i from jsonb_array_elements(p_plan->'itens') i
    order by (i->>'cicloNumero')::integer,(i->>'tipo'='PARCELA'),(i->>'ordem')::integer loop
    v_cycle:=(v_item->>'cicloNumero')::integer;
    v_order:=case when v_cycle=v_previous_cycle then v_order+1 else 1 end;
    v_previous_cycle:=v_cycle;
    foreach v_key in array array['valor','descontoPontualidade','jurosAtrasoPercentual','multaAtrasoPercentual'] loop
      v_item:=jsonb_set(v_item,array[v_key],to_jsonb(to_char((v_item->>v_key)::numeric,
        case when v_key in ('valor','descontoPontualidade') then 'FM999999990.00' else 'FM999999990.000000' end)));
    end loop;
    v_result:=v_result||jsonb_build_array(v_item||jsonb_build_object('ordem',v_order,'itemId',(v_item->>'itemId')::uuid));
  end loop;
  return jsonb_build_object('versao',3,'itens',v_result);
end;
$function$;

create function internal_academic.transfer_schedule_default_item(
  p_rule jsonb,p_cycle integer,p_kind text,p_order integer,p_due date,p_identity text
)
returns jsonb language sql immutable set search_path='' as $function$
  select jsonb_build_object('itemId',internal_academic.transfer_schedule_item_id(p_identity),
    'cicloNumero',p_cycle,'tipo',p_kind,'ordem',p_order,'vencimento',p_due,
    'valor',p_rule#>>array['cobranca',k.kind,'valor'],
    'descontoPontualidade',case when (p_rule#>>array['aplicacao',k.kind,'desconto'])::boolean
      then p_rule#>>'{encargos,descontoPontualidade}' else '0.00' end,
    'jurosAtrasoPercentual',case when (p_rule#>>array['aplicacao',k.kind,'multaJuros'])::boolean
      then p_rule#>>'{encargos,jurosAtrasoPercentual}' else '0.000000' end,
    'multaAtrasoPercentual',case when (p_rule#>>array['aplicacao',k.kind,'multaJuros'])::boolean
      then p_rule#>>'{encargos,multaAtrasoPercentual}' else '0.000000' end)
  from (select case p_kind when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'rematricula' else 'mensalidade' end as kind) k;
$function$;

create function internal_academic.default_transfer_schedule(p_rule jsonb)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_items jsonb:='[]'; v_cycle integer; v_number integer; v_order integer;
  v_due date:=(p_rule->>'primeiroVencimentoSugerido')::date; v_last date;
  v_today date:=timezone('America/Maceio',now())::date;
  v_day integer:=(p_rule#>>'{vencimento,diaBase}')::integer;
  v_fee boolean; v_kind text; v_identity text:=p_rule->>'fingerprint';
begin
  if v_due<v_today then
    v_due:=public.data_vencimento_mensal(v_today,v_day,0);
    if v_due<v_today then v_due:=public.data_vencimento_mensal(v_today,v_day,1); end if;
  end if;
  for v_cycle in 1..(p_rule#>>'{continuidade,maxCiclos}')::integer loop
    v_kind:=case v_cycle when 1 then 'MATRICULA' else 'REMATRICULA' end;
    v_fee:=(p_rule#>>array['cobranca',case v_cycle when 1 then 'matricula' else 'rematricula' end,'habilitada'])::boolean;
    v_order:=0;
    if v_fee then
      v_order:=1;
      v_items:=v_items||jsonb_build_array(internal_academic.transfer_schedule_default_item(
        p_rule,v_cycle,v_kind,v_order,v_due,v_identity||':'||v_cycle||':fee'));
    end if;
    for v_number in 1..(p_rule#>>'{cobranca,mensalidade,quantidade}')::integer loop
      v_last:=case when not v_fee and v_number=1 then v_due else
        public.data_vencimento_mensal(v_due,v_day,v_number-case when v_fee then 0 else 1 end) end;
      v_items:=v_items||jsonb_build_array(internal_academic.transfer_schedule_default_item(
        p_rule,v_cycle,'PARCELA',v_order+v_number,v_last,v_identity||':'||v_cycle||':parc:'||v_number));
    end loop;
    v_due:=public.data_vencimento_mensal(coalesce(v_last,v_due),v_day,1);
  end loop;
  return internal_academic.normalize_transfer_schedule(p_rule,jsonb_build_object('versao',3,'itens',v_items));
end;
$function$;

create function internal_academic.transfer_schedule_fingerprint(p_plan jsonb)
returns text language sql immutable set search_path='' as $function$
  select encode(extensions.digest(p_plan::text,'sha256'),'hex');
$function$;

revoke all on function internal_academic.transfer_schedule_item_id(text),
  internal_academic.normalize_transfer_schedule(jsonb,jsonb,boolean),
  internal_academic.transfer_schedule_default_item(jsonb,integer,text,integer,date,text),
  internal_academic.default_transfer_schedule(jsonb),internal_academic.transfer_schedule_fingerprint(jsonb)
  from public,anon,authenticated,service_role;
commit;
