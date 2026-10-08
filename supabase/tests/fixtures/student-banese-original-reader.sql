-- Read-only dependency captured from the deployed schema on 2026-10-08.
-- Fixture only: protects existing class, enrollment and single-plan behavior.
CREATE OR REPLACE FUNCTION public.p2_get_aluno_financeiro_portal_secure_20260812(p_aluno_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_rows jsonb;
begin
  if p_aluno_id is null then
    raise exception 'Aluno obrigatorio para consultar o extrato financeiro.'
      using errcode = '22004';
  end if;

  if coalesce((select auth.role()), '') <> 'service_role'
    and (
      public.current_aluno_id() is null
      or p_aluno_id is distinct from public.current_aluno_id()
    )
  then
    raise exception 'Extrato financeiro do aluno nao autorizado.'
      using errcode = '42501';
  end if;

  with source_rows as (
    select
      receivable.*,
      enrollment.desconto_pontualidade_individual,
      enrollment.juros_atraso_individual,
      enrollment.multa_atraso_individual,
      class.id as class_id,
      class.curso_id as class_course_id,
      class.nome as class_name,
      class.valor_parcela as class_installment_value,
      class.qtd_parcelas as class_installment_count,
      class.desconto_pontualidade,
      class.juros_atraso,
      class.multa_atraso,
      class.aplicar_desconto_matricula,
      class.aplicar_multa_juros_matricula,
      class.aplicar_desconto_mensalidade,
      class.aplicar_multa_juros_mensalidade,
      class.aplicar_desconto_rematricula,
      class.aplicar_multa_juros_rematricula,
      course.id as course_id,
      course.nome as course_name,
      upper(coalesce(course.modalidade, '')) as course_modality,
      student.nome as student_name,
      student.cpf_cnpj as student_document
    from public.contas_receber receivable
    left join public.matriculas enrollment on enrollment.id = receivable.matricula_id
    left join public.turmas class on class.id = receivable.turma_id
    left join public.cursos course on course.id = class.curso_id
    left join public.parceiros student on student.id = receivable.cliente_id
    where receivable.cliente_id = p_aluno_id
  ),
  classified as (
    select
      source_rows.*,
      (
        upper(coalesce(tipo_lancamento, '')) = 'MATRICULA'
        or lower(coalesce(descricao, '')) like '%matricula%'
        or lower(coalesce(descricao, '')) like '%matrícula%'
      ) as is_enrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'REMATRICULA'
        or lower(coalesce(descricao, '')) like '%rematricula%'
        or lower(coalesce(descricao, '')) like '%rematrícula%'
      ) as is_reenrollment,
      (
        upper(coalesce(tipo_lancamento, '')) = 'PARCELA'
        or lower(coalesce(descricao, '')) like '%mensalidade%'
      ) as is_installment,
      (
        status = 'VENCIDO'
        or (status = 'PENDENTE' and data_vencimento < current_date)
      ) as is_overdue,
      (
        lower(coalesce(gateway_provider, '')) = 'banese_card'
        and upper(coalesce(gateway_payment_method, '')) = 'BOLETO'
        and length(regexp_replace(coalesce(gateway_boleto_linha_digitavel, ''), '\D', '', 'g')) = 47
        and length(regexp_replace(coalesce(gateway_boleto_codigo_barras, ''), '\D', '', 'g')) = 44
      ) as has_registered_banese_boleto
    from source_rows
  ),
  policies as (
    select
      classified.*,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO' then true
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarDesconto')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_desconto_matricula is true)
          or (is_installment and aplicar_desconto_mensalidade is not false)
          or (is_reenrollment and aplicar_desconto_rematricula is not false)
        )
      end as can_discount,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO' then true
        when regra_financeira_tecnica_snapshot is not null
          then coalesce((regra_financeira_tecnica_snapshot ->> 'aplicarMultaJuros')::boolean, false)
        else course_modality <> 'EAD' and (
          (is_enrollment and aplicar_multa_juros_matricula is not false)
          or (is_installment and aplicar_multa_juros_mensalidade is not false)
          or (is_reenrollment and aplicar_multa_juros_rematricula is not false)
        )
      end as can_late_charge,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'descontoPontualidade')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'descontoPontualidade')::numeric, 0))
        else greatest(0, coalesce(desconto_pontualidade_individual, desconto_pontualidade, 0))
      end as discount_policy_value,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'jurosAtrasoPercentual')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'jurosAtrasoPercentual')::numeric, 0))
        else greatest(0, coalesce(juros_atraso_individual, juros_atraso, 0))
      end as interest_policy_percent,
      case
        when regra_financeira_plano_unico_snapshot ->> 'origem' = 'PLANO_UNICO'
          then greatest(0, coalesce((regra_financeira_plano_unico_snapshot ->> 'multaAtraso')::numeric, 0))
        when regra_financeira_tecnica_snapshot is not null
          then greatest(0, coalesce((regra_financeira_tecnica_snapshot ->> 'multaAtrasoValor')::numeric, 0))
        else greatest(0, coalesce(multa_atraso_individual, multa_atraso, 0))
      end as late_fee_policy_value
    from classified
  ),
  amounts as (
    select
      policies.*,
      case
        when has_registered_banese_boleto or status = 'PAGO' or not can_discount then 0::numeric
        else least(coalesce(valor, 0), discount_policy_value)
      end as punctual_discount,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else round(
          coalesce(valor, 0)
          * interest_policy_percent
          / 30.0
          / 100.0
          * greatest(current_date - data_vencimento, 0),
          2
        )
      end as interest_value,
      case
        when has_registered_banese_boleto or not is_overdue or not can_late_charge then 0::numeric
        else late_fee_policy_value
      end as late_fee_value
    from policies
  ),
  presented as (
    select
      amounts.*,
      round(greatest(0, coalesce(valor, 0) - punctual_discount), 2) as total_until_due,
      round(coalesce(valor, 0) + interest_value + late_fee_value, 2) as total_with_late
    from amounts
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'cliente_id', cliente_id,
        'matricula_id', matricula_id,
        'turma_id', turma_id,
        'descricao', descricao,
        'categoria', categoria,
        'tipo_lancamento', tipo_lancamento,
        'parcela_numero', parcela_numero,
        'valor', valor,
        'valor_pago', valor_pago,
        'data_vencimento', data_vencimento,
        'data_pagamento', data_pagamento,
        'status', status,
        'forma_pagamento', forma_pagamento,
        'origem_pagamento', origem_pagamento,
        'asaas_invoice_url', asaas_invoice_url,
        'asaas_status', asaas_status,
        'asaas_transaction_receipt_url', asaas_transaction_receipt_url,
        'gateway_provider', gateway_provider,
        'gateway_environment', gateway_environment,
        'gateway_payment_method', gateway_payment_method,
        'gateway_payment_id', gateway_payment_id,
        'gateway_status', gateway_status,
        'gateway_bank_slip_url', gateway_bank_slip_url,
        'gateway_invoice_url', gateway_invoice_url,
        'gateway_boleto_linha_digitavel', gateway_boleto_linha_digitavel,
        'gateway_boleto_codigo_barras', gateway_boleto_codigo_barras,
        'gateway_boleto_nosso_numero', gateway_boleto_nosso_numero,
        'turmas', case
          when class_id is null then null
          else jsonb_build_object(
            'id', class_id,
            'curso_id', class_course_id,
            'nome', class_name,
            'valor_parcela', class_installment_value,
            'qtd_parcelas', class_installment_count,
            'cursos', case
              when course_id is null then null
              else jsonb_build_object(
                'id', course_id,
                'modalidade', course_modality,
                'nome', course_name
              )
            end
          )
        end,
        'parceiros', jsonb_build_object(
          'nome', student_name,
          'cpf_cnpj', student_document
        ),
        'financial_summary', jsonb_build_object(
          'baseValue', coalesce(valor, 0),
          'paidValue', coalesce(valor_pago, valor, 0),
          'punctualDiscount', punctual_discount,
          'totalUntilDue', case when has_registered_banese_boleto then coalesce(valor, 0) else total_until_due end,
          'interestPercent', case
            when has_registered_banese_boleto or not can_late_charge then 0
            else interest_policy_percent
          end,
          'interestValue', interest_value,
          'lateFeeValue', late_fee_value,
          'totalWithLate', case when has_registered_banese_boleto then coalesce(valor, 0) else total_with_late end,
          'highlightValue', case
            when status = 'PAGO' then coalesce(valor_pago, valor, 0)
            when has_registered_banese_boleto then coalesce(valor, 0)
            when is_overdue then total_with_late
            else total_until_due
          end,
          'highlightLabel', case
            when status = 'PAGO' then 'Valor pago'
            when has_registered_banese_boleto then 'Valor do boleto'
            when is_overdue then 'Total em atraso'
            else 'Total até o vencimento'
          end,
          'hasDiscount', punctual_discount > 0,
          'hasLateCharge', interest_value > 0 or late_fee_value > 0,
          'canLateCharge', can_late_charge and not has_registered_banese_boleto
        )
      )
      order by data_vencimento, id
    ),
    '[]'::jsonb
  ) into v_rows
  from presented;

  return jsonb_build_object(
    'rows', v_rows,
    'summary', (
      with elements as (
        select value as row_data
        from jsonb_array_elements(v_rows)
      ),
      open_by_modality as (
        select
          coalesce(nullif(row_data #>> '{turmas,cursos,modalidade}', ''), 'OUTROS') as modality,
          count(*)::integer as item_count,
          coalesce(sum((row_data #>> '{financial_summary,highlightValue}')::numeric), 0) as total_value
        from elements
        where row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
        group by 1
      )
      select jsonb_build_object(
        'totalPaid', coalesce(sum(
          case
            when row_data ->> 'status' = 'PAGO'
              then (row_data #>> '{financial_summary,paidValue}')::numeric
            else 0
          end
        ), 0),
        'totalPending', coalesce(sum(
          case
            when row_data ->> 'status' in ('PENDENTE', 'VENCIDO')
              then (row_data #>> '{financial_summary,highlightValue}')::numeric
            else 0
          end
        ), 0),
        'openByModality', coalesce((
          select jsonb_agg(jsonb_build_object(
            'modality', modality,
            'count', item_count,
            'total', total_value
          ) order by modality)
          from open_by_modality
        ), '[]'::jsonb)
      )
      from elements
    )
  );
end;
$function$;
