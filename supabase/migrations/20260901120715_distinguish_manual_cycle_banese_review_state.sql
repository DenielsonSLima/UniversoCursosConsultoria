begin;

create or replace function internal_academic.technical_manual_cycle_state(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_policy internal_academic.technical_manual_cycle_policies%rowtype;
  v_policy_projection jsonb;
  v_last_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_next_cycle integer;
  v_previous_cycle integer;
  v_expected_paid integer := 0;
  v_rule_installments integer;
  v_paid integer := 0;
  v_total integer := 0;
  v_first_installment integer := 0;
  v_last_installment integer := 0;
  v_penultimate_paid boolean := false;
  v_structure_complete boolean := false;
  v_has_overdue boolean := false;
  v_has_existing boolean := false;
  v_state text := 'NAO_HABILITADO';
  v_block_code text;
  v_block_message text;
  v_emitted integer := 0;
  v_review integer := 0;
  v_existing_items integer := 0;
  v_existing_amount numeric := 0;
  v_cycle jsonb := null;
begin
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  if not found then
    raise exception 'Matrícula não encontrada.' using errcode = '22023';
  end if;

  select policy.* into v_policy
  from internal_academic.technical_manual_cycle_policies policy
  join public.turmas class on class.id = policy.turma_id
  join public.cursos course on course.id = class.curso_id
  where policy.turma_id = v_enrollment.turma_id
    and policy.active
    and policy.generation_mode = 'MANUAL'
    and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO');

  if v_policy.turma_id is null then
    return jsonb_build_object(
      'habilitado', false, 'modo', null, 'cicloBaseHistorico', null,
      'cicloMaximo', null, 'proximoCicloNumero', null,
      'criterioElegibilidade', null, 'estado', v_state,
      'podeGerar', false, 'bloqueio', null,
      'politica', null, 'cicloGerado', null
    );
  end if;

  v_policy_projection :=
    internal_academic.technical_manual_cycle_policy_projection(
      v_policy.turma_id
    );

  select run.* into v_last_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = p_matricula_id
    and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
  order by run.cycle_number desc
  limit 1;

  if v_last_run.matricula_id is not null then
    select
      count(*) filter (
        where receivable.gateway_submission_status = 'API_REGISTERED'
      )::integer,
      count(*) filter (
        where receivable.gateway_submission_status = 'API_REVIEW'
      )::integer
    into v_emitted, v_review
    from public.contas_receber receivable
    where receivable.id = any(v_last_run.receivable_ids);
    v_cycle := jsonb_build_object(
      'numero', v_last_run.cycle_number,
      'status', v_last_run.state,
      'quantidadeItens', v_last_run.item_count,
      'total', pg_catalog.to_char(v_last_run.total_amount, 'FM999999990.00'),
      'emitidosBanese', v_emitted,
      'pendentesEmissao', greatest(
        v_last_run.item_count - v_emitted - v_review, 0
      ),
      'emRevisao', v_review
    );
  end if;

  if v_last_run.state = 'PROTECTED_EXISTING' then
    v_state := 'PROTEGIDO_EXISTENTE';
    v_next_cycle := null;
  elsif v_last_run.matricula_id is not null
    and v_last_run.cycle_number >= v_policy.max_cycle
  then
    v_state := 'JA_GERADO';
    v_next_cycle := null;
  elsif v_last_run.matricula_id is null
    and v_policy.baseline_cycle >= v_policy.max_cycle
  then
    v_state := 'CICLOS_CONCLUIDOS';
    v_next_cycle := null;
  else
    v_next_cycle := coalesce(
      v_last_run.cycle_number,
      v_policy.baseline_cycle
    ) + 1;
    v_previous_cycle := v_next_cycle - 1;

    select exists (
      select 1
      from public.contas_receber receivable
      where receivable.matricula_id = p_matricula_id
        and (
          receivable.regra_financeira_tecnica_snapshot
            -> 'cicloManual' ->> 'cicloNumero' = v_next_cycle::text
          or (
            v_next_cycle = 1
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'MATRICULA'
          )
          or (
            v_next_cycle = 2
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'REMATRICULA'
          )
          or receivable.origem_cronograma_id =
            'ciclo-' || (v_next_cycle - 1) || '-rematricula'
          or receivable.origem_cronograma_id like
            'ciclo-' || v_next_cycle || '-parc-%'
        )
    ) into v_has_existing;

    if v_next_cycle > v_policy.max_cycle then
      v_state := 'CICLOS_CONCLUIDOS';
      v_next_cycle := null;
    elsif v_has_existing then
      select
        count(*)::integer,
        coalesce(sum(receivable.valor), 0),
        count(*) filter (
          where receivable.gateway_submission_status = 'API_REGISTERED'
        )::integer,
        count(*) filter (
          where receivable.gateway_submission_status = 'API_REVIEW'
        )::integer
      into v_existing_items, v_existing_amount, v_emitted, v_review
      from public.contas_receber receivable
      where receivable.matricula_id = p_matricula_id
        and (
          receivable.regra_financeira_tecnica_snapshot
            -> 'cicloManual' ->> 'cicloNumero' = v_next_cycle::text
          or (
            v_next_cycle = 1
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'MATRICULA'
          )
          or (
            v_next_cycle = 2
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'REMATRICULA'
          )
          or receivable.origem_cronograma_id =
            'ciclo-' || (v_next_cycle - 1) || '-rematricula'
          or receivable.origem_cronograma_id like
            'ciclo-' || v_next_cycle || '-parc-%'
        );
      v_state := 'PROTEGIDO_EXISTENTE';
      v_cycle := jsonb_build_object(
        'numero', v_next_cycle,
        'status', 'PROTECTED_EXISTING',
        'quantidadeItens', v_existing_items,
        'total', pg_catalog.to_char(v_existing_amount, 'FM999999990.00'),
        'emitidosBanese', v_emitted,
        'pendentesEmissao', greatest(
          v_existing_items - v_emitted - v_review, 0
        ),
        'emRevisao', v_review
      );
      v_next_cycle := null;
    elsif upper(coalesce(v_enrollment.status, '')) not in ('PENDENTE', 'ATIVO') then
      v_state := 'BLOQUEADO';
      v_block_code := 'STATUS_ACADEMICO';
      v_block_message := 'A situação acadêmica não permite gerar novo ciclo.';
    elsif not exists (
      select 1
      from public.matriculas_tecnicas_financeiro_config config
      where config.matricula_id = p_matricula_id
    ) then
      v_state := 'BLOQUEADO';
      v_block_code := 'SEM_CONFIGURACAO';
      v_block_message := 'O financeiro técnico da matrícula não está configurado.';
    elsif v_previous_cycle = 0 then
      v_state := 'ELEGIVEL';
    else
      if v_last_run.matricula_id is not null
        and v_last_run.cycle_number = v_previous_cycle
      then
        select exists (
          select 1
          from public.contas_receber receivable
          where receivable.id = any(v_last_run.receivable_ids)
            and (
              receivable.status = 'VENCIDO'
              or (
                receivable.status = 'PENDENTE'
                and receivable.data_vencimento
                  < (pg_catalog.timezone('America/Maceio', now()))::date
              )
            )
        ) into v_has_overdue;

        if v_policy.eligibility_rule = 'PENULTIMA_SEM_ATRASO' then
          v_rule_installments := v_last_run.expected_installment_count;
          select
            count(distinct receivable.parcela_numero)::integer,
            coalesce(min(receivable.parcela_numero), 0)::integer,
            coalesce(max(receivable.parcela_numero), 0)::integer
          into v_total, v_first_installment, v_last_installment
          from public.contas_receber receivable
          where receivable.id = any(v_last_run.receivable_ids)
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
            and receivable.parcela_numero >= 1;
          v_structure_complete := v_total = v_rule_installments
            and v_first_installment = 1
            and v_last_installment = v_rule_installments;
          select exists (
            select 1
            from public.contas_receber receivable
            where receivable.id = any(v_last_run.receivable_ids)
              and upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
              and receivable.parcela_numero >= 1
              and receivable.parcela_numero = greatest(
                v_rule_installments - 1, 1
              )
              and receivable.status = 'PAGO'
          ) into v_penultimate_paid;
        else
          select
            count(*) filter (where receivable.status = 'PAGO')::integer,
            count(*)::integer
          into v_paid, v_total
          from public.contas_receber receivable
          where receivable.id = any(v_last_run.receivable_ids);
          v_expected_paid := v_total;
          v_structure_complete := v_total > 0;
        end if;
      else
        v_rule_installments := (
          internal_academic.technical_financial_effective_rule(p_matricula_id)
            -> 'cobranca' -> 'mensalidade' ->> 'quantidade'
        )::integer;

        select exists (
          select 1
          from public.contas_receber receivable
          where receivable.matricula_id = p_matricula_id
            and upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
            and receivable.parcela_numero between 1 and v_rule_installments
            and (
              receivable.regra_financeira_tecnica_snapshot
                -> 'cicloManual' ->> 'cicloNumero' = v_previous_cycle::text
              or receivable.origem_cronograma_id like
                'ciclo-' || v_previous_cycle || '-parc-%'
              or (
                v_previous_cycle = 1
                and receivable.origem_pagamento = 'SISTEMA_ANTERIOR'
              )
            )
            and (
              receivable.status = 'VENCIDO'
              or (
                receivable.status = 'PENDENTE'
                and receivable.data_vencimento
                  < (pg_catalog.timezone('America/Maceio', now()))::date
              )
            )
        ) into v_has_overdue;

        select
          count(distinct receivable.parcela_numero) filter (
            where receivable.status = 'PAGO'
          )::integer,
          count(distinct receivable.parcela_numero)::integer,
          coalesce(bool_or(
            receivable.parcela_numero = greatest(v_rule_installments - 1, 1)
            and receivable.status = 'PAGO'
          ), false)
        into v_paid, v_total, v_penultimate_paid
        from public.contas_receber receivable
        where receivable.matricula_id = p_matricula_id
          and upper(coalesce(receivable.tipo_lancamento, '')) = 'PARCELA'
          and receivable.parcela_numero between 1 and v_rule_installments
          and (
            receivable.regra_financeira_tecnica_snapshot
              -> 'cicloManual' ->> 'cicloNumero' = v_previous_cycle::text
            or receivable.origem_cronograma_id like
              'ciclo-' || v_previous_cycle || '-parc-%'
            or (
              v_previous_cycle = 1
              and receivable.origem_pagamento = 'SISTEMA_ANTERIOR'
            )
          );
        v_structure_complete := v_total = v_rule_installments;
        v_expected_paid := v_rule_installments;
      end if;

      if v_has_overdue then
        v_state := 'BLOQUEADO';
        v_block_code := 'INADIMPLENCIA_CICLO_ANTERIOR';
        v_block_message := 'Existem cobranças vencidas no ciclo anterior.';
      elsif not v_structure_complete
        or (
          v_policy.eligibility_rule = 'PENULTIMA_SEM_ATRASO'
          and not v_penultimate_paid
        )
        or (
          v_policy.eligibility_rule = 'QUITACAO_TOTAL'
          and v_paid < v_expected_paid
        )
      then
        v_state := 'BLOQUEADO';
        v_block_code := 'CICLO_ANTERIOR_INCOMPLETO';
        v_block_message := 'O ciclo anterior ainda não atingiu a condição configurada.';
      else
        v_state := 'ELEGIVEL';
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'habilitado', true,
    'modo', 'MANUAL',
    'cicloBaseHistorico', v_policy.baseline_cycle,
    'cicloMaximo', v_policy.max_cycle,
    'proximoCicloNumero', v_next_cycle,
    'criterioElegibilidade', v_policy.eligibility_rule,
    'estado', v_state,
    'podeGerar', v_state = 'ELEGIVEL',
    'bloqueio', case when v_block_code is null then null else jsonb_build_object(
      'codigo', v_block_code, 'mensagem', v_block_message
    ) end,
    'politica', jsonb_build_object(
      'revisao', v_policy.revision,
      'fingerprint', v_policy_projection ->> 'fingerprint'
    ),
    'cicloGerado', v_cycle
  );
end;
$function$;

revoke all on function internal_academic.technical_manual_cycle_state(uuid)
  from public, anon, authenticated, service_role;

comment on function internal_academic.technical_manual_cycle_state(uuid)
is 'Projeta API_AMBIGUOUS como retomável e API_REVIEW como revisão manual terminal.';

commit;
