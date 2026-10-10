-- Keep optional entry obligations effective in the downstream manual workflow.
begin;

create or replace function internal_academic.transfer_entry_rule(
  p_snapshot jsonb,p_count integer,p_due date,p_fingerprint text
)
returns jsonb language plpgsql immutable security definer set search_path='' as $function$
declare v_conditions jsonb:=internal_academic.transfer_entry_conditions(p_snapshot);
  v_monthly boolean:=coalesce((p_snapshot#>>'{cobranca,mensalidade,habilitada}')::boolean,true);
  v_value numeric:=(v_conditions->>'valorMensalidade')::numeric; v_rule jsonb;
begin
  v_rule:=internal_academic.render_technical_financial_rule(v_conditions||jsonb_build_object(
    'valorMensalidade',case when not v_monthly and v_value=0 then 1 else v_value end,
    'qtdMensalidades',p_count,'diaVencimento',extract(day from p_due)::integer,
    'instrucaoBoleto',p_snapshot#>>'{boleto,instrucao}'),p_due,
    (p_snapshot->'identidade')||jsonb_build_object('efetivaFingerprint',p_fingerprint),'INDIVIDUAL');
  v_rule:=jsonb_set(v_rule,'{cobranca,mensalidade,habilitada}',to_jsonb(v_monthly));
  v_rule:=jsonb_set(v_rule,'{cobranca,mensalidade,valor}',v_conditions->'valorMensalidade');
  return v_rule||jsonb_build_object('revisao',p_snapshot->'revisao',
    'fingerprint',p_snapshot->>'fingerprint','primeiroVencimentoSugerido',p_due,
    'valorMensalidade',v_conditions->'valorMensalidade',
    'entradaTransferencia',coalesce((p_snapshot->>'entradaTransferencia')::boolean,false),
    'continuidade',p_snapshot->'continuidade',
    'cronogramaCiclo',case when v_monthly then v_rule->'cronogramaCiclo' else '[]'::jsonb end);
end;
$function$;

create or replace function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state jsonb; v_plan internal_academic.technical_transfer_entry_plans%rowtype;
  v_max integer; v_next integer; v_monthly boolean; v_fee boolean;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  select * into v_plan from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found then return v_state; end if;
  v_monthly:=coalesce((v_plan.financial_plan->>'cobrarMensalidades')::boolean,true);
  v_max:=greatest(v_plan.initial_cycle,
    coalesce((v_plan.rule_snapshot#>>'{continuidade,maxCiclos}')::integer,2));
  v_state:=v_state||jsonb_build_object('cicloMaximo',v_max,'planoEntrada',jsonb_build_object(
    'cicloInicial',v_plan.initial_cycle,'quantidadeParcelas',v_plan.installment_count,
    'primeiroVencimento',v_plan.first_due_date,'justificativaCiclo2',v_plan.cycle_two_reason,
    'requestId',v_plan.request_id,'cobrarMensalidades',v_monthly,
    'condicoes',coalesce(v_plan.financial_plan->'condicoes',
      internal_academic.transfer_entry_conditions(v_plan.rule_snapshot))));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_plan.initial_cycle,
      'primeiroVencimentoSugerido',v_plan.first_due_date,'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
  end if;
  v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
    jsonb_build_object('base',v_state#>>'{politica,fingerprint}','entry',v_plan.financial_plan,
      'requestId',v_plan.request_id,'maximum',v_max)::text,'sha256'),'hex')));
  v_next:=(v_state->>'proximoCicloNumero')::integer;
  if v_next>v_max then
    v_state:=v_state||jsonb_build_object('estado','JA_GERADO','podeGerar',false,
      'proximoCicloNumero',null,'bloqueio',null);
  elsif v_next is not null and not v_monthly then
    v_fee:=coalesce((v_plan.rule_snapshot#>>(case when v_next=1
      then '{cobranca,matricula,habilitada}'::text[]
      else '{cobranca,rematricula,habilitada}'::text[] end))::boolean,false);
    if not v_fee and v_state->>'estado'='ELEGIVEL' then
      v_state:=v_state||jsonb_build_object('estado','BLOQUEADO','podeGerar',false,
        'bloqueio',jsonb_build_object('codigo','SEM_COBRANCAS_PLANEJADAS',
          'mensagem','Este plano individual não possui cobranças selecionadas para o ciclo.'));
    end if;
  end if;
  return v_state;
end;
$function$;

create or replace function internal_academic.technical_manual_cycle_reviewed_preview(
  p_matricula_id uuid,p_cycle_number integer,p_first_due_date date,p_review jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_due date:=p_first_due_date; v_review jsonb:=p_review; v_result jsonb;
  v_plan internal_academic.technical_transfer_entry_plans%rowtype;
begin
  select * into v_plan from internal_academic.technical_transfer_entry_plans
    where matricula_id=p_matricula_id;
  if found then
    if v_due is null and v_plan.initial_cycle=p_cycle_number then v_due:=v_plan.first_due_date; end if;
    if p_cycle_number=1 and v_plan.rule_snapshot->>'entradaTransferencia'='true'
      and v_plan.rule_snapshot#>>'{cobranca,matricula,habilitada}'='false' then
      if p_review is not null and internal_academic.manual_cycle_enrollment_mode(p_review)<>'OMITIR' then
        raise exception 'O plano recebido não selecionou cobrança de matrícula.' using errcode='22023';
      end if;
      v_review:=(coalesce(p_review,'{"itens":[]}'::jsonb)-'modoMatricula')
        ||jsonb_build_object('emitirMatricula',false);
    end if;
  end if;
  v_result:=internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(
    p_matricula_id,p_cycle_number,v_due,v_review);
  return jsonb_set(v_result,'{preview}',(v_result->'preview')||jsonb_build_object(
    'mensalidadesHabilitadas',coalesce((v_plan.financial_plan->>'cobrarMensalidades')::boolean,true)));
end;
$function$;

-- The shared preview uses a rendered rule. Respect an explicit disabled
-- monthly obligation while preserving every existing validation and fingerprint.
do $monthly_preview$
declare v_definition text;
  v_boundary text:=$old$  v_count :=
    (v_rule -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer;$old$;
begin
  v_definition:=pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)'::regprocedure);
  if length(v_definition)-length(replace(v_definition,v_boundary,''))<>length(v_boundary) then
    raise exception 'The canonical monthly preview boundary changed.';
  end if;
  execute replace(v_definition,v_boundary,$new$  v_count := case
    when v_rule #>> '{cobranca,mensalidade,habilitada}' = 'false' then 0
    else (v_rule -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer end;$new$);
end;
$monthly_preview$;

-- A fee-only external plan may have zero monthly items. Other admissions keep
-- their prior requirement: this row guard does not allow an empty/fake cycle.
alter table internal_academic.technical_manual_cycle_runs
  drop constraint technical_manual_cycle_runs_expected_installment_count_check;
alter table internal_academic.technical_manual_cycle_runs
  add constraint technical_manual_cycle_runs_expected_installment_count_check
  check(expected_installment_count between 0 and 60);

create function internal_academic.guard_fee_only_transfer_cycle()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.expected_installment_count=0 and (
    new.item_count<>1 or jsonb_typeof(new.reviewed_items) is distinct from 'array'
    or jsonb_array_length(new.reviewed_items)<>1
    or new.reviewed_items#>>'{0,tipo}' is distinct from (case new.cycle_number
      when 1 then 'MATRICULA' when 2 then 'REMATRICULA' end)
    or not exists(select 1 from internal_academic.technical_transfer_entry_plans p
      where p.matricula_id=new.matricula_id
        and p.financial_plan->>'cobrarMensalidades'='false'
        and p.rule_snapshot#>>(case when new.cycle_number=1
          then '{cobranca,matricula,habilitada}'::text[]
          else '{cobranca,rematricula,habilitada}'::text[] end)='true')) then
    raise exception 'Ciclo sem mensalidades exige plano externo e uma taxa selecionada.' using errcode='23514';
  end if;
  return new;
end;
$function$;
create trigger guard_fee_only_transfer_cycle before insert or update
  on internal_academic.technical_manual_cycle_runs for each row
  execute function internal_academic.guard_fee_only_transfer_cycle();

revoke all on function internal_academic.transfer_entry_rule(jsonb,integer,date,text),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_reviewed_preview(uuid,integer,date,jsonb),
  internal_academic.guard_fee_only_transfer_cycle()
  from public,anon,authenticated,service_role;
commit;
