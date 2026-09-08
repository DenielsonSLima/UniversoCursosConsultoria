begin;

alter table internal_academic.technical_manual_cycle_policies
  drop constraint technical_manual_cycle_policies_eligibility_rule_check,
  add constraint technical_manual_cycle_policies_eligibility_rule_check
    check (eligibility_rule in (
      'QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO', 'HISTORICO_EXTERNO'
    )),
  add constraint technical_manual_cycle_external_history_check
    check (eligibility_rule <> 'HISTORICO_EXTERNO' or (
      initial_state = 'IMPORTADA_CICLO_1' and baseline_cycle = 1
    ));

CREATE OR REPLACE FUNCTION public.criar_turma_tecnica_com_codigo_condicao_secure(p_request_id uuid, p_turma jsonb, p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contract jsonb;
  v_initial_state text;
  v_baseline smallint;
  v_maximum smallint;
  v_eligibility text;
  v_payload jsonb;
  v_result jsonb;
  v_turma_id uuid;
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
  v_projection jsonb;
  v_start_date date;
  v_first_due_date date;
begin
  if p_turma is null or jsonb_typeof(p_turma) <> 'object' then
    raise exception 'Dados da turma técnica inválidos.' using errcode = '22023';
  end if;
  v_contract := p_turma -> 'ciclo_financeiro_tecnico';
  if jsonb_typeof(v_contract) is distinct from 'object'
    or upper(coalesce(v_contract ->> 'modo', '')) <> 'MANUAL'
  then
    raise exception 'A turma técnica exige contrato de ciclos MANUAL.'
      using errcode = '22023';
  end if;

  begin
    v_initial_state := upper(coalesce(v_contract ->> 'estadoInicial', ''));
    v_baseline := (v_contract ->> 'baselineCycle')::smallint;
    v_maximum := (v_contract ->> 'maxCycle')::smallint;
    v_eligibility := upper(coalesce(
      v_contract ->> 'eligibilityRule', ''
    ));
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Contrato de ciclos técnicos inválido.' using errcode = '22023';
  end;

  if v_initial_state not in (
      'NOVA', 'IMPORTADA_CICLO_1', 'IMPORTADA_CONCLUIDA'
    )
    or v_baseline is null
    or v_maximum is null
    or v_maximum <> 2
    or v_eligibility not in ('QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO', 'HISTORICO_EXTERNO')
    or (v_eligibility = 'HISTORICO_EXTERNO' and v_initial_state <> 'IMPORTADA_CICLO_1')
    or (v_initial_state = 'NOVA' and v_baseline <> 0)
    or (v_initial_state = 'IMPORTADA_CICLO_1' and v_baseline <> 1)
    or (v_initial_state = 'IMPORTADA_CONCLUIDA' and v_baseline <> 2)
  then
    raise exception 'Estado inicial e baseline do ciclo técnico são incompatíveis.'
      using errcode = '22023';
  end if;

  begin
    v_start_date := nullif(p_turma ->> 'data_inicio', '')::date;
    v_first_due_date :=
      nullif(p_turma ->> 'primeiro_vencimento_padrao', '')::date;
  exception when invalid_datetime_format then
    raise exception 'Datas da turma técnica são inválidas.' using errcode = '22023';
  end;
  if v_initial_state = 'IMPORTADA_CONCLUIDA' then
    if v_start_date is null
      or v_start_date > (pg_catalog.timezone('America/Maceio', now()))::date
      or (
        v_first_due_date is not null
        and v_first_due_date
          > (pg_catalog.timezone('America/Maceio', now()))::date
      )
    then
      raise exception 'Turma importada concluída exige datas históricas, nunca futuras.'
        using errcode = '22023';
    end if;
  elsif v_first_due_date is null then
    raise exception 'O primeiro vencimento da turma técnica é obrigatório.'
      using errcode = '22023';
  end if;

  -- Imported classes are an explicit academic continuation, never a paid history.
  if v_initial_state <> 'NOVA' then
    if v_start_date is null
      or v_start_date > (pg_catalog.timezone('America/Maceio', now()))::date
      or upper(coalesce(p_turma ->> 'status', '')) <> 'EM_ANDAMENTO'
      or upper(coalesce(p_turma ->> 'origem_financeira', '')) <> 'LEGADO'
      or coalesce((p_turma ->> 'financeiro_herdado')::boolean, false) <> true
      or coalesce((p_turma ->> 'cobrar_matricula')::boolean, true)
      or coalesce((p_turma ->> 'valor_matricula')::numeric, -1) <> 0
      or coalesce((p_turma ->> 'aplicar_desconto_matricula')::boolean, false)
      or coalesce((p_turma ->> 'aplicar_multa_juros_matricula')::boolean, false)
      or coalesce((p_turma ->> 'publicar_no_site')::boolean, false)
      or coalesce((p_turma ->> 'permitir_inscricoes_online')::boolean, false)
    then
      raise exception 'Turma em andamento exige início histórico, origem legada, sem cobrança de matrícula e sem inscrições públicas.'
        using errcode = '22023';
    end if;
  end if;

  v_payload := jsonb_set(
    jsonb_set(p_turma, '{gerar_cobrancas_futuras}', 'false'::jsonb, true),
    '{sincronizar_asaas_futuro}', 'false'::jsonb, true
  );
  if v_initial_state = 'IMPORTADA_CONCLUIDA'
    and v_first_due_date is null
  then
    v_payload := jsonb_set(
      v_payload,
      '{primeiro_vencimento_padrao}',
      to_jsonb(v_start_date::text),
      true
    );
  end if;
  if v_initial_state <> 'NOVA' then
    v_payload := jsonb_set(v_payload, '{status}', '"PLANEJADA"'::jsonb, true);
  end if;
  v_result := internal_academic.create_technical_class_legacy_manual_policy(
    p_request_id, v_payload, p_codigo
  );
  v_turma_id := (v_result -> 'turma' ->> 'id')::uuid;

  insert into internal_academic.technical_manual_cycle_policies(
    turma_id, generation_mode, initial_state, baseline_cycle, max_cycle,
    eligibility_rule, active, revision, created_by
  ) values (
    v_turma_id, 'MANUAL', v_initial_state, v_baseline, 2,
    v_eligibility, true, 1, auth.uid()
  ) on conflict (turma_id) do nothing;

  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  where policy.turma_id = v_turma_id;
  if v_policy.turma_id is null
    or v_policy.generation_mode <> 'MANUAL'
    or v_policy.initial_state <> v_initial_state
    or v_policy.baseline_cycle <> v_baseline
    or v_policy.max_cycle <> 2
    or v_policy.eligibility_rule <> v_eligibility
    or not v_policy.active
  then
    raise exception 'A policy da turma diverge da requisição idempotente.'
      using errcode = '40001';
  end if;

  if v_initial_state <> 'NOVA' then
    if not coalesce((v_result ->> 'replayed')::boolean, false) then
      perform internal_academic.authorize_transition(
        'TURMA_STATUS', v_turma_id, 'EM_ANDAMENTO'
      );
      update public.turmas set status = 'EM_ANDAMENTO' where id = v_turma_id;
    end if;
    v_result := jsonb_set(v_result, '{turma}', (
      select to_jsonb(class) from public.turmas class where class.id = v_turma_id
    ), true);
  end if;

  v_projection :=
    internal_academic.technical_manual_cycle_policy_projection(v_turma_id);
  v_result := jsonb_set(
    v_result,
    '{turma}',
    (v_result -> 'turma') || jsonb_build_object(
      'ciclo_financeiro_tecnico', v_projection
    ),
    true
  );
  return v_result || jsonb_build_object(
    'cicloFinanceiroTecnico', v_projection
  );
end;
$function$;

revoke all on function public.criar_turma_tecnica_com_codigo_condicao_secure(
  uuid, jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.criar_turma_tecnica_com_codigo_condicao_secure(
  uuid, jsonb, text
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
