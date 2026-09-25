-- Preserve the admission plan without fabricating a previous financial cycle.
begin;
create function internal_academic.transfer_entry_rule(p_snapshot jsonb,p_count integer,p_due date,p_fingerprint text)
returns jsonb language sql immutable security definer set search_path='' as $function$
  select internal_academic.render_technical_financial_rule(jsonb_build_object(
    'cobrarMatricula',(p_snapshot#>>'{cobranca,matricula,habilitada}')::boolean,
    'valorMatricula',p_snapshot#>>'{cobranca,matricula,valor}',
    'qtdMensalidades',p_count,'valorMensalidade',p_snapshot#>>'{cobranca,mensalidade,valor}',
    'cobrarRematricula',(p_snapshot#>>'{cobranca,rematricula,habilitada}')::boolean,
    'valorRematricula',p_snapshot#>>'{cobranca,rematricula,valor}',
    'diaVencimento',extract(day from p_due)::integer,
    'descontoPontualidade',p_snapshot#>>'{encargos,descontoPontualidade}',
    'jurosAtrasoPercentual',p_snapshot#>>'{encargos,jurosAtrasoPercentual}',
    'multaAtrasoPercentual',p_snapshot#>>'{encargos,multaAtrasoPercentual}',
    'aplicarDescontoMatricula',(p_snapshot#>>'{aplicacao,matricula,desconto}')::boolean,
    'aplicarMultaJurosMatricula',(p_snapshot#>>'{aplicacao,matricula,multaJuros}')::boolean,
    'aplicarDescontoMensalidade',(p_snapshot#>>'{aplicacao,mensalidade,desconto}')::boolean,
    'aplicarMultaJurosMensalidade',(p_snapshot#>>'{aplicacao,mensalidade,multaJuros}')::boolean,
    'aplicarDescontoRematricula',(p_snapshot#>>'{aplicacao,rematricula,desconto}')::boolean,
    'aplicarMultaJurosRematricula',(p_snapshot#>>'{aplicacao,rematricula,multaJuros}')::boolean,
    'instrucaoBoleto',p_snapshot#>>'{boleto,instrucao}'),p_due,
    (p_snapshot->'identidade')||jsonb_build_object('efetivaFingerprint',p_fingerprint),'INDIVIDUAL')
    ||jsonb_build_object('revisao',p_snapshot->'revisao','fingerprint',p_snapshot->>'fingerprint',
      'primeiroVencimentoSugerido',p_due);
$function$;

alter function internal_academic.technical_financial_effective_rule(uuid)
  rename to technical_financial_effective_rule_before_transfer_entry;
create function internal_academic.technical_financial_effective_rule(p_matricula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_plan internal_academic.technical_transfer_entry_plans%rowtype;
  v_count integer; v_fingerprint text;
begin
  select * into v_plan from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found then return internal_academic.technical_financial_effective_rule_before_transfer_entry(p_matricula_id); end if;
  v_count:=(v_plan.rule_snapshot#>>'{cobranca,mensalidade,quantidade}')::integer;
  if not exists(select 1 from internal_academic.technical_manual_cycle_runs
    where matricula_id=p_matricula_id and cycle_number=v_plan.initial_cycle and state='LOCAL_CREATED') then
    v_count:=v_plan.installment_count;
  end if;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('admissionRequest',v_plan.request_id,
    'rule',v_plan.rule_snapshot,'installments',v_count,'due',v_plan.first_due_date)::text,'sha256'),'hex');
  return internal_academic.transfer_entry_rule(v_plan.rule_snapshot,v_count,v_plan.first_due_date,v_fingerprint);
end;
$function$;

-- A genuine external entry may start at C2, but only the recorded intent removes
-- the requirement for a local C1 run. Every other person-history check remains.
do $eligibility$
declare v_definition text; v_from text;
begin
  v_definition:=pg_get_functiondef('internal_academic.technical_local_cycle_eligible(uuid)'::regprocedure);
  v_from:=$old$or (r.cycle_number=2 and not exists($old$;
  if length(v_definition)-length(replace(v_definition,v_from,''))<>length(v_from) then
    raise exception 'Individual cycle eligibility boundary changed.';
  end if;
  execute replace(v_definition,v_from,$new$or (r.cycle_number=2 and not exists(
          select 1 from internal_academic.technical_transfer_entry_plans entry
          where entry.matricula_id=r.matricula_id and entry.initial_cycle=2)
        and not exists($new$);
end;
$eligibility$;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_transfer_entry;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state jsonb; v_plan internal_academic.technical_transfer_entry_plans%rowtype;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  select * into v_plan from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found then return v_state; end if;
  v_state:=v_state||jsonb_build_object('planoEntrada',jsonb_build_object(
    'cicloInicial',v_plan.initial_cycle,'quantidadeParcelas',v_plan.installment_count,
    'primeiroVencimento',v_plan.first_due_date,'justificativaCiclo2',v_plan.cycle_two_reason,'requestId',v_plan.request_id));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_plan.initial_cycle,
      'primeiroVencimentoSugerido',v_plan.first_due_date,'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
    v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
      jsonb_build_object('base',v_state#>>'{politica,fingerprint}','entry',v_plan.financial_plan,
        'requestId',v_plan.request_id)::text,'sha256'),'hex')));
  end if;
  return v_state;
end;
$function$;

alter function internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb)
  rename to technical_manual_cycle_reviewed_preview_before_transfer_entry;
create function internal_academic.technical_manual_cycle_reviewed_preview(
  p_matricula_id uuid,p_cycle_number integer,p_first_due_date date,p_review jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_due date:=p_first_due_date;
begin
  if v_due is null then
    select first_due_date into v_due from internal_academic.technical_transfer_entry_plans entry
      where entry.matricula_id=p_matricula_id and entry.initial_cycle=p_cycle_number;
  end if;
  return internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(
    p_matricula_id,p_cycle_number,v_due,p_review);
end;
$function$;
revoke all on function internal_academic.transfer_entry_rule(jsonb,integer,date,text),
  internal_academic.technical_financial_effective_rule(uuid),
  internal_academic.technical_financial_effective_rule_before_transfer_entry(uuid),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_transfer_entry(uuid),
  internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb),
  internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)
  from public,anon,authenticated,service_role;
commit;
