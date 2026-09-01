begin;

alter function public.criar_turma_tecnica_com_codigo_condicao_secure(
  uuid, jsonb, text
) rename to create_technical_class_legacy_manual_policy;
alter function public.create_technical_class_legacy_manual_policy(
  uuid, jsonb, text
) set schema internal_academic;

revoke all on function
  internal_academic.create_technical_class_legacy_manual_policy(
    uuid, jsonb, text
  ) from public, anon, authenticated, service_role;

create or replace function public.criar_turma_tecnica_com_codigo_condicao_secure(
  p_request_id uuid,
  p_turma jsonb,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
    or v_eligibility not in ('QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO')
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

alter function public.obter_pre_vinculo_aluno_tecnico_contexto_secure(
  uuid, uuid
) rename to get_technical_prelink_context_legacy_manual_policy;
alter function public.get_technical_prelink_context_legacy_manual_policy(
  uuid, uuid
) set schema internal_academic;

revoke all on function
  internal_academic.get_technical_prelink_context_legacy_manual_policy(
    uuid, uuid
  ) from public, anon, authenticated, service_role;

create or replace function public.obter_pre_vinculo_aluno_tecnico_contexto_secure(
  p_turma_id uuid,
  p_aluno_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_context jsonb;
begin
  v_context :=
    internal_academic.get_technical_prelink_context_legacy_manual_policy(
      p_turma_id, p_aluno_id
    );
  return jsonb_set(
    v_context,
    '{turma,cicloFinanceiroTecnico}',
    internal_academic.technical_manual_cycle_policy_projection(p_turma_id),
    true
  );
end;
$function$;

revoke all on function
  public.obter_pre_vinculo_aluno_tecnico_contexto_secure(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function
  public.obter_pre_vinculo_aluno_tecnico_contexto_secure(uuid, uuid)
  to authenticated, service_role;

create or replace function public.obter_financeiro_matricula_tecnica_workspace_secure(
  p_turma_id uuid,
  p_aluno_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_turma record;
  v_aluno jsonb := null;
  v_rows jsonb;
  v_total numeric;
  v_received numeric;
  v_overdue numeric;
  v_received_percent numeric;
  v_overdue_percent numeric;
begin
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.can_operate_turma_academics(p_turma_id)
    and public.gestor_has_tab('gestao', 'financeiro')
  ) then
    raise exception 'Sem permissão para consultar esta turma.' using errcode = '42501';
  end if;

  select class.id, class.codigo, class.nome, class.polo_id, class.status,
    upper(coalesce(course.modalidade, '')) as modalidade
  into v_turma
  from public.turmas class
  join public.cursos course on course.id = class.curso_id
  where class.id = p_turma_id;
  if not found or v_turma.modalidade not in ('TECNICO', 'TÉCNICO') then
    raise exception 'Turma técnica não encontrada.' using errcode = '22023';
  end if;

  if p_aluno_id is not null then
    select jsonb_build_object('alunoId', student.id, 'nome', student.nome)
    into v_aluno
    from public.parceiros student
    where student.id = p_aluno_id and student.tipo = 'Aluno';
    if v_aluno is null then
      raise exception 'Aluno não encontrado.' using errcode = '22023';
    end if;
  end if;

  select
    coalesce(sum(receivable.valor), 0),
    coalesce(sum(coalesce(receivable.valor_pago, receivable.valor)) filter (
      where receivable.status = 'PAGO'
    ), 0),
    coalesce(sum(receivable.valor) filter (
      where receivable.status = 'VENCIDO'
        or (
          receivable.status = 'PENDENTE'
          and receivable.data_vencimento
            < (pg_catalog.timezone('America/Maceio', now()))::date
        )
    ), 0)
  into v_total, v_received, v_overdue
  from public.contas_receber receivable
  where receivable.turma_id = p_turma_id;

  v_received_percent := case when v_total > 0
    then round(v_received * 100.0 / v_total, 2) else 0 end;
  v_overdue_percent := case when v_total > 0
    then round(v_overdue * 100.0 / v_total, 2) else 0 end;

  select coalesce(jsonb_agg(
    internal_academic.technical_financial_row(enrollment.id)
      || jsonb_build_object(
        'cicloManual',
        internal_academic.technical_manual_cycle_state(enrollment.id)
      )
    order by student.nome, enrollment.id
  ), '[]'::jsonb)
  into v_rows
  from public.matriculas enrollment
  join public.parceiros student on student.id = enrollment.aluno_id
  where enrollment.turma_id = p_turma_id
    and (p_aluno_id is null or enrollment.aluno_id = p_aluno_id);

  return jsonb_build_object(
    'turma', jsonb_build_object(
      'turmaId', v_turma.id,
      'codigo', v_turma.codigo,
      'nome', v_turma.nome,
      'poloId', v_turma.polo_id,
      'status', v_turma.status,
      'cicloFinanceiroTecnico',
        internal_academic.technical_manual_cycle_policy_projection(v_turma.id)
    ),
    'regra', internal_academic.technical_financial_rule(p_turma_id),
    'resumo', jsonb_build_object(
      'total', pg_catalog.to_char(v_total, 'FM999999990.00'),
      'recebido', pg_catalog.to_char(v_received, 'FM999999990.00'),
      'inadimplencia', pg_catalog.to_char(v_overdue, 'FM999999990.00'),
      'recebidoPercentual', pg_catalog.to_char(
        v_received_percent, 'FM999999990.00'
      ),
      'inadimplenciaPercentual', pg_catalog.to_char(
        v_overdue_percent, 'FM999999990.00'
      )
    ),
    'aluno', v_aluno,
    'matriculas', v_rows
  );
end;
$function$;

revoke all on function public.obter_financeiro_matricula_tecnica_workspace_secure(
  uuid, uuid
) from public, anon, authenticated, service_role;
grant execute on function public.obter_financeiro_matricula_tecnica_workspace_secure(
  uuid, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
