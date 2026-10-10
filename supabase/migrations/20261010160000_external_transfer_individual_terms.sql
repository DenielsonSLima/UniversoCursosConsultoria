-- Individual entry terms inherit the class and never alter its global rule.
begin;

create function internal_academic.transfer_entry_conditions(p_rule jsonb)
returns jsonb language sql immutable set search_path='' as $function$
  select jsonb_build_object(
    'cobrarMatricula',p_rule#>'{cobranca,matricula,habilitada}',
    'valorMatricula',p_rule#>'{cobranca,matricula,valor}',
    'valorMensalidade',p_rule#>'{cobranca,mensalidade,valor}',
    'cobrarRematricula',p_rule#>'{cobranca,rematricula,habilitada}',
    'valorRematricula',p_rule#>'{cobranca,rematricula,valor}',
    'descontoPontualidade',p_rule#>'{encargos,descontoPontualidade}',
    'jurosAtrasoPercentual',p_rule#>'{encargos,jurosAtrasoPercentual}',
    'multaAtrasoPercentual',p_rule#>'{encargos,multaAtrasoPercentual}',
    'aplicarDescontoMatricula',p_rule#>'{aplicacao,matricula,desconto}',
    'aplicarMultaJurosMatricula',p_rule#>'{aplicacao,matricula,multaJuros}',
    'aplicarDescontoMensalidade',p_rule#>'{aplicacao,mensalidade,desconto}',
    'aplicarMultaJurosMensalidade',p_rule#>'{aplicacao,mensalidade,multaJuros}',
    'aplicarDescontoRematricula',p_rule#>'{aplicacao,rematricula,desconto}',
    'aplicarMultaJurosRematricula',p_rule#>'{aplicacao,rematricula,multaJuros}');
$function$;

create function internal_academic.normalize_transfer_entry_conditions(
  p_rule jsonb,p_conditions jsonb,p_monthly boolean
)
returns jsonb language plpgsql immutable set search_path='' as $function$
declare v_default jsonb:=internal_academic.transfer_entry_conditions(p_rule);
  v_input jsonb; v_validated jsonb; v_result jsonb; v_entry record;
  v_discount numeric; v_monthly numeric; v_kind text;
begin
  if p_monthly is null or (p_conditions is not null and (
    jsonb_typeof(p_conditions) is distinct from 'object'
    or exists(select 1 from jsonb_object_keys(p_conditions) k where not v_default ? k))) then
    raise exception 'Condições individuais da transferência inválidas.' using errcode='22023';
  end if;
  v_input:=v_default||coalesce(p_conditions,'{}'::jsonb);
  for v_entry in select * from jsonb_each(v_input) loop
    if v_entry.key like 'cobrar%' or v_entry.key like 'aplicar%' then
      if jsonb_typeof(v_entry.value) is distinct from 'boolean' then
        raise exception 'As opções de cobrança e encargos devem ser booleanas.' using errcode='22023';
      end if;
    elsif jsonb_typeof(v_entry.value) not in ('string','number')
      or (v_entry.value#>>'{}') !~ (case
        when v_entry.key in ('jurosAtrasoPercentual','multaAtrasoPercentual')
          then '^[0-9]{1,3}([.][0-9]{1,6})?$'
        else '^[0-9]{1,8}([.][0-9]{1,2})?$' end) then
      raise exception 'Valor individual inválido: %.',v_entry.key using errcode='22023';
    end if;
  end loop;
  v_monthly:=(v_input->>'valorMensalidade')::numeric;
  -- The shared class validator requires a positive monthly value. A disabled
  -- obligation may have zero; the placeholder is private and never returned.
  v_validated:=internal_academic.validate_technical_financial_rule_input(v_input||jsonb_build_object(
    'valorMensalidade',case when not p_monthly and v_monthly=0 then 1 else v_monthly end,
    'qtdMensalidades',(p_rule#>>'{cobranca,mensalidade,quantidade}')::integer,
    'diaVencimento',(p_rule#>>'{vencimento,diaBase}')::integer,
    'instrucaoBoleto',p_rule#>>'{boleto,instrucao}'));
  if (v_validated->>'jurosAtrasoPercentual')::numeric>=100
    or (v_validated->>'multaAtrasoPercentual')::numeric>=100 then
    raise exception 'Juros e multa devem ser menores que 100%%.' using errcode='22023';
  end if;
  v_discount:=(v_validated->>'descontoPontualidade')::numeric;
  foreach v_kind in array array['Matricula','Mensalidade','Rematricula'] loop
    if (v_validated->>('aplicarDesconto'||v_kind))::boolean and v_discount>0
      and (case v_kind
        when 'Mensalidade' then p_monthly
        else (v_validated->>('cobrar'||v_kind))::boolean end)
      and v_discount>=(case v_kind
        when 'Mensalidade' then v_monthly
        else (v_validated->>('valor'||v_kind))::numeric end) then
      raise exception 'O desconto deve ser menor que cada cobrança habilitada.' using errcode='22023';
    end if;
  end loop;
  v_result:=v_validated-'qtdMensalidades'-'diaVencimento'-'instrucaoBoleto';
  for v_entry in select * from jsonb_each(v_result) loop
    if jsonb_typeof(v_entry.value)='number' then
      v_result:=jsonb_set(v_result,array[v_entry.key],to_jsonb(to_char(
        case when v_entry.key='valorMensalidade' then v_monthly else (v_entry.value#>>'{}')::numeric end,
        case when v_entry.key in ('jurosAtrasoPercentual','multaAtrasoPercentual')
          then 'FM999999990.000000' else 'FM999999990.00' end)));
    end if;
  end loop;
  return v_result;
end;
$function$;

create or replace function internal_academic.normalize_transfer_entry_plan(p_rule jsonb,p_plan jsonb)
returns jsonb language plpgsql stable set search_path='' as $function$
declare v_cycle integer:=1; v_count integer; v_due date; v_reason text;
  v_max integer:=(p_rule#>>'{cobranca,mensalidade,quantidade}')::integer;
  v_max_cycles integer:=(p_rule#>>'{continuidade,maxCiclos}')::integer;
  v_today date:=timezone('America/Maceio',now())::date;
  v_monthly boolean:=true; v_conditions jsonb;
begin
  if v_max_cycles is null or v_max_cycles not in (1,2) then
    raise exception 'Limite de ciclos da turma inválido.' using errcode='22023';
  end if;
  if p_plan is null then
    v_count:=v_max;
    v_due:=(p_rule->>'primeiroVencimentoSugerido')::date;
  else
    if jsonb_typeof(p_plan) is distinct from 'object'
      or exists(select 1 from jsonb_object_keys(p_plan) k where k not in (
        'cicloNumero','quantidadeParcelas','primeiroVencimento','justificativaCiclo2',
        'condicoes','cobrarMensalidades'))
      or jsonb_typeof(p_plan->'cicloNumero') is distinct from 'number'
      or jsonb_typeof(p_plan->'quantidadeParcelas') is distinct from 'number'
      or (p_plan->>'cicloNumero') !~ '^[12]$'
      or (p_plan->>'quantidadeParcelas') !~ '^[1-9][0-9]?$'
      or jsonb_typeof(p_plan->'primeiroVencimento') is distinct from 'string'
      or (p_plan->>'primeiroVencimento') !~ '^\d{4}-\d{2}-\d{2}$'
      or (p_plan ? 'justificativaCiclo2' and jsonb_typeof(p_plan->'justificativaCiclo2') not in ('string','null'))
      or (p_plan ? 'cobrarMensalidades' and jsonb_typeof(p_plan->'cobrarMensalidades') is distinct from 'boolean')
      or (p_plan ? 'condicoes' and jsonb_typeof(p_plan->'condicoes') is distinct from 'object') then
      raise exception 'Plano financeiro da entrada inválido.' using errcode='22023';
    end if;
    v_cycle:=(p_plan->>'cicloNumero')::integer;
    v_count:=(p_plan->>'quantidadeParcelas')::integer;
    begin v_due:=(p_plan->>'primeiroVencimento')::date;
    exception when datetime_field_overflow then
      raise exception 'Vencimento individual inválido.' using errcode='22023'; end;
    v_reason:=nullif(btrim(p_plan->>'justificativaCiclo2'),'');
    v_monthly:=coalesce((p_plan->>'cobrarMensalidades')::boolean,true);
    if v_cycle>v_max_cycles or v_count>v_max or v_count>60 or v_due<v_today or v_due>v_today+1825
      or (v_cycle=2 and coalesce(length(v_reason),0)<10)
      or coalesce(length(v_reason),0)>1000 then
      raise exception 'Revise ciclo, parcelas restantes, vencimento e justificativa de entrada.' using errcode='22023';
    end if;
  end if;
  v_conditions:=internal_academic.normalize_transfer_entry_conditions(p_rule,p_plan->'condicoes',v_monthly);
  return jsonb_build_object('cicloNumero',v_cycle,'quantidadeParcelas',v_count,
    'primeiroVencimento',v_due,'justificativaCiclo2',case when v_cycle=2 then v_reason end,
    'cobrarMensalidades',v_monthly,'condicoes',v_conditions);
end;
$function$;

create function internal_academic.transfer_entry_individual_rule(p_rule jsonb,p_plan jsonb)
returns jsonb language plpgsql immutable set search_path='' as $function$
declare v_conditions jsonb:=p_plan->'condicoes'; v_rule jsonb; v_identity jsonb;
  v_monthly boolean:=(p_plan->>'cobrarMensalidades')::boolean;
  v_monthly_value numeric:=(v_conditions->>'valorMensalidade')::numeric;
begin
  v_identity:=(p_rule->'identidade')||jsonb_build_object('efetivaFingerprint',encode(extensions.digest(
    jsonb_build_object('turmaFingerprint',p_rule->>'fingerprint','plano',p_plan)::text,'sha256'),'hex'));
  v_rule:=internal_academic.render_technical_financial_rule(v_conditions||jsonb_build_object(
    'valorMensalidade',case when not v_monthly and v_monthly_value=0 then 1 else v_monthly_value end,
    'qtdMensalidades',(p_rule#>>'{cobranca,mensalidade,quantidade}')::integer,
    'diaVencimento',extract(day from (p_plan->>'primeiroVencimento')::date)::integer,
    'instrucaoBoleto',p_rule#>>'{boleto,instrucao}'),
    (p_plan->>'primeiroVencimento')::date,v_identity,'INDIVIDUAL');
  v_rule:=jsonb_set(v_rule,'{cobranca,mensalidade,habilitada}',to_jsonb(v_monthly));
  v_rule:=jsonb_set(v_rule,'{cobranca,mensalidade,valor}',v_conditions->'valorMensalidade');
  return v_rule||jsonb_build_object('revisao',p_rule->'revisao','fingerprint',p_rule->>'fingerprint',
    'valorMensalidade',v_conditions->'valorMensalidade','entradaTransferencia',true,
    -- Turning off a fee does not shorten the school's financial cycle policy.
    'continuidade',p_rule->'continuidade',
    'cronogramaCiclo','[]'::jsonb);
end;
$function$;

revoke all on function internal_academic.transfer_entry_conditions(jsonb),
  internal_academic.normalize_transfer_entry_conditions(jsonb,jsonb,boolean),
  internal_academic.normalize_transfer_entry_plan(jsonb,jsonb),
  internal_academic.transfer_entry_individual_rule(jsonb,jsonb)
  from public,anon,authenticated,service_role;
commit;
