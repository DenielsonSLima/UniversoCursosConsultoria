begin;
alter function internal_academic.technical_financial_effective_rule(uuid)
  rename to technical_financial_effective_rule_before_transfer_schedule;
create function internal_academic.technical_financial_effective_rule(p_matricula_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_entry internal_academic.technical_transfer_entry_plans%rowtype; v_fingerprint text;
begin
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found or v_entry.financial_plan->'versao' is distinct from '3'::jsonb then
    return internal_academic.technical_financial_effective_rule_before_transfer_schedule(p_matricula_id);
  end if;
  v_fingerprint:=encode(extensions.digest(jsonb_build_object('requestId',v_entry.request_id,
    'regra',v_entry.rule_snapshot,'cronograma',v_entry.financial_plan)::text,'sha256'),'hex');
  return jsonb_set(v_entry.rule_snapshot,'{identidade,efetivaFingerprint}',to_jsonb(v_fingerprint))
    ||jsonb_build_object('entradaTransferencia',true,'cronogramaEntradaVersao',3,
      'primeiroVencimentoSugerido',v_entry.first_due_date,'fonte','INDIVIDUAL');
end;
$function$;

alter function internal_academic.technical_manual_cycle_state(uuid)
  rename to technical_manual_cycle_state_before_transfer_schedule;
create function internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_entry internal_academic.technical_transfer_entry_plans%rowtype; v_state jsonb;
  v_max integer; v_next integer; v_first date; v_has_items boolean; v_fingerprint text;
begin
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found or v_entry.financial_plan->'versao' is distinct from '3'::jsonb then
    return internal_academic.technical_manual_cycle_state_before_transfer_schedule(p_matricula_id);
  end if;
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  v_max:=(v_entry.rule_snapshot#>>'{continuidade,maxCiclos}')::integer;
  v_fingerprint:=internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan);
  v_state:=v_state||jsonb_build_object('cicloMaximo',v_max,'planoEntrada',jsonb_build_object(
    'versao',3,'requestId',v_entry.request_id,'cicloInicial',v_entry.initial_cycle,'maxCiclos',v_max,
    'itens',v_entry.financial_plan->'itens','cronogramaFingerprint',v_fingerprint));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_entry.initial_cycle,
      'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
  end if;
  v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
    jsonb_build_object('base',v_state#>>'{politica,fingerprint}','requestId',v_entry.request_id,
      'cronogramaFingerprint',v_fingerprint,'maxCiclos',v_max)::text,'sha256'),'hex')));
  v_next:=(v_state->>'proximoCicloNumero')::integer;
  if v_next>v_max then
    return v_state||jsonb_build_object('estado','JA_GERADO','podeGerar',false,
      'proximoCicloNumero',null,'primeiroVencimentoSugerido',null,'bloqueio',null);
  elsif v_next is not null then
    select (i->>'vencimento')::date into v_first from jsonb_array_elements(v_entry.financial_plan->'itens') i
      where (i->>'cicloNumero')::integer=v_next order by (i->>'ordem')::integer limit 1;
    v_has_items:=found;
    v_state:=v_state||jsonb_build_object('primeiroVencimentoSugerido',coalesce(v_first,
      timezone('America/Maceio',now())::date));
    if not v_has_items and v_state->>'estado' in ('ELEGIVEL','BLOQUEADO') then
      v_state:=v_state||jsonb_build_object('estado','BLOQUEADO','podeGerar',false,
        'bloqueio',jsonb_build_object('codigo','SEM_COBRANCAS_PLANEJADAS',
          'mensagem','Este cronograma individual não possui cobranças para o ciclo.'));
    end if;
  end if;
  return v_state;
end;
$function$;

create or replace function internal_academic.guard_fee_only_transfer_cycle()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.expected_installment_count=0 and (
    new.item_count<>1 or jsonb_typeof(new.reviewed_items) is distinct from 'array'
    or jsonb_array_length(new.reviewed_items)<>1
    or new.reviewed_items#>>'{0,tipo}' is distinct from (case new.cycle_number
      when 1 then 'MATRICULA' when 2 then 'REMATRICULA' end)
    or not exists(select 1 from internal_academic.technical_transfer_entry_plans p
      where p.matricula_id=new.matricula_id and (
        (p.financial_plan->>'cobrarMensalidades'='false'
          and p.rule_snapshot#>>(case when new.cycle_number=1
            then '{cobranca,matricula,habilitada}'::text[] else '{cobranca,rematricula,habilitada}'::text[] end)='true')
        or (p.financial_plan->'versao'='3'::jsonb
          and (select count(*) from jsonb_array_elements(p.financial_plan->'itens') i
            where (i->>'cicloNumero')::integer=new.cycle_number)=1
          and exists(select 1 from jsonb_array_elements(p.financial_plan->'itens') i
            where (i->>'cicloNumero')::integer=new.cycle_number
              and i->>'tipo'=new.reviewed_items#>>'{0,tipo}'
              and i->>'itemId'=new.reviewed_items#>>'{0,itemId}'))))) then
    raise exception 'Ciclo sem mensalidades exige plano externo e uma taxa selecionada.' using errcode='23514';
  end if;
  return new;
end;
$function$;

alter function internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb)
  rename to manual_cycle_reviewed_snapshot_before_transfer_schedule;
create function internal_academic.manual_cycle_reviewed_snapshot(p_matricula_id uuid,p_item jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare v_snapshot jsonb; v_entry internal_academic.technical_transfer_entry_plans%rowtype;
begin
  v_snapshot:=internal_academic.manual_cycle_reviewed_snapshot_before_transfer_schedule(p_matricula_id,p_item);
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if found and v_entry.financial_plan->'versao'='3'::jsonb then
    if not exists(select 1 from jsonb_array_elements(v_entry.financial_plan->'itens') i
      where i->>'itemId'=p_item->>'itemId' and i->>'tipo'=p_item->>'tipo') then
      raise exception 'A cobrança não pertence ao cronograma recebido.' using errcode='23514'; end if;
    return v_snapshot||jsonb_build_object('cronogramaEntradaVersao',3,'itemId',p_item->>'itemId',
      'cronogramaEntradaFingerprint',internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan),
      'recebimentoRequestId',v_entry.request_id);
  end if;
  return v_snapshot;
end;
$function$;
revoke all on function internal_academic.technical_financial_effective_rule(uuid),
  internal_academic.technical_financial_effective_rule_before_transfer_schedule(uuid),
  internal_academic.technical_manual_cycle_state(uuid),
  internal_academic.technical_manual_cycle_state_before_transfer_schedule(uuid),
  internal_academic.guard_fee_only_transfer_cycle(),internal_academic.manual_cycle_reviewed_snapshot(uuid,jsonb),
  internal_academic.manual_cycle_reviewed_snapshot_before_transfer_schedule(uuid,jsonb)
  from public,anon,authenticated,service_role;
commit;
