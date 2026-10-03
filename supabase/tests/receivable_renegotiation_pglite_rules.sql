create function internal_finance.build_receivable_renegotiation_snapshot(
  p_receivable_ids uuid[],
  p_terms jsonb default '{}'::jsonb,
  p_policy_overrides jsonb default '{}'::jsonb,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_ids uuid[];
  v_as_of date := coalesce(p_as_of, current_date);
  v_terms jsonb;
  v_overrides jsonb := coalesce(p_policy_overrides, '{}'::jsonb);
  v_identity jsonb;
  v_items jsonb;
  v_source_principal bigint;
  v_source_open bigint;
  v_discount bigint;
  v_down_payment bigint;
  v_installment_count integer;
  v_first_due_date date;
  v_negotiated bigint;
  v_policy jsonb;
  v_calculation jsonb;
  v_selection_fingerprint text;
  v_policy_fingerprint text;
  v_calculation_fingerprint text;
  v_proposal_fingerprint text;
  v_snapshot jsonb;
begin
  select array_agg(id order by id) into v_ids
  from (select distinct id from unnest(p_receivable_ids) id where id is not null) normalized;
  if coalesce(cardinality(v_ids), 0) = 0
    or jsonb_typeof(coalesce(p_terms, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(v_overrides) <> 'object' then
    raise exception 'INVALID_RENEGOTIATION_INPUT' using errcode = '22023';
  end if;
  if (select count(*) from public.contas_receber where id = any(v_ids))
      <> cardinality(v_ids)
    or exists (select 1 from public.contas_receber
      where id = any(v_ids) and status not in ('PENDENTE', 'VENCIDO')) then
    raise exception 'INELIGIBLE_RECEIVABLE' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.receivable_renegotiation_source_items source
    join public.receivable_renegotiation_agreements agreement
      on agreement.id = source.agreement_id
    where source.receivable_id = any(v_ids) and source.released_at is null
      and agreement.lifecycle_status in ('DRAFT', 'PROPOSED')
  ) then
    raise exception 'CONFLICTING_RENEGOTIATION' using errcode = '23514';
  end if;

  select jsonb_build_object(
    'poloId', min(receivable.polo_id::text),
    'alunoId', min(matricula.aluno_id::text),
    'matriculaId', min(matricula.id::text),
    'turmaId', min(matricula.turma_id::text)
  ) into v_identity
  from public.contas_receber receivable
  join public.matriculas matricula on matricula.id = receivable.matricula_id
  where receivable.id = any(v_ids)
  having count(distinct receivable.polo_id) = 1
    and count(distinct matricula.aluno_id) = 1
    and count(distinct matricula.id) = 1
    and count(distinct matricula.turma_id) = 1;
  if v_identity is null then
    raise exception 'MIXED_RENEGOTIATION_SELECTION' using errcode = '23514';
  end if;

  with positioned as (
    select receivable.*,
      row_number() over (order by receivable.data_vencimento, receivable.id) position
    from public.contas_receber receivable where receivable.id = any(v_ids)
  ), shaped as (
    select position, valor,
      jsonb_build_object(
        'position', position,
        'receivableId', id,
        'status', status,
        'dueDate', data_vencimento,
        'principalCents', round(valor * 100)::bigint,
        'openAmountCents', round(valor * 100)::bigint
      ) item
    from positioned
  )
  select jsonb_agg(item || jsonb_build_object(
      'sourceFingerprint', encode(extensions.digest(
        convert_to(item::text, 'UTF8'), 'sha256'), 'hex')
    ) order by position),
    sum(round(valor * 100))::bigint,
    sum(round(valor * 100))::bigint
  into v_items, v_source_principal, v_source_open
  from shaped;

  v_discount := coalesce((p_terms ->> 'commercialDiscountCents')::bigint, 0);
  v_down_payment := coalesce((p_terms ->> 'downPaymentCents')::bigint, 0);
  v_installment_count := coalesce((p_terms ->> 'installmentCount')::integer, 1);
  v_first_due_date := coalesce((p_terms ->> 'firstDueDate')::date, v_as_of + 30);
  if v_discount < 0 or v_down_payment < 0 or v_installment_count < 0
    or v_discount > v_source_open then
    raise exception 'INVALID_RENEGOTIATION_TERMS' using errcode = '22023';
  end if;
  v_negotiated := v_source_open - v_discount;
  v_terms := jsonb_build_object(
    'commercialDiscountCents', v_discount,
    'downPaymentCents', v_down_payment,
    'installmentCount', v_installment_count,
    'firstDueDate', v_first_due_date
  );
  v_policy := jsonb_build_object(
    'source', 'SYNTHETIC_TEST_POLICY',
    'punctualDiscountCents', 0,
    'monthlyInterestBasisPoints', 0,
    'penalty', jsonb_build_object('kind', 'PERCENTAGE', 'basisPoints', 0),
    'appliedOverrides', v_overrides
  );
  v_calculation := jsonb_build_object(
    'sourceOpenCents', v_source_open,
    'commercialDiscountCents', v_discount,
    'interestCents', 0,
    'penaltyCents', 0,
    'negotiatedCents', v_negotiated
  );
  v_selection_fingerprint := encode(extensions.digest(
    convert_to(to_jsonb(v_ids)::text, 'UTF8'), 'sha256'), 'hex');
  v_policy_fingerprint := encode(extensions.digest(
    convert_to(v_policy::text, 'UTF8'), 'sha256'), 'hex');
  v_calculation_fingerprint := encode(extensions.digest(
    convert_to(v_calculation::text, 'UTF8'), 'sha256'), 'hex');
  v_proposal_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'selectionFingerprint', v_selection_fingerprint,
    'policyFingerprint', v_policy_fingerprint,
    'calculationFingerprint', v_calculation_fingerprint,
    'terms', v_terms,
    'policyOverrides', v_overrides,
    'asOf', v_as_of
  )::text, 'UTF8'), 'sha256'), 'hex');

  v_snapshot := jsonb_build_object(
    'version', 1,
    'asOf', v_as_of,
    'identity', v_identity,
    'sourceItems', v_items,
    'terms', v_terms,
    'policyOverrides', v_overrides,
    'policySnapshot', v_policy,
    'calculationSnapshot', v_calculation,
    'totals', jsonb_build_object(
      'sourcePrincipalCents', v_source_principal,
      'sourceOpenCents', v_source_open,
      'negotiatedCents', v_negotiated
    ),
    'schedule', jsonb_build_object(
      'installmentCount', v_installment_count,
      'firstDueDate', v_first_due_date,
      'entries', '[]'::jsonb
    ),
    'requiresApproval', v_overrides <> '{}'::jsonb or v_discount > 0,
    'approvalReasons', jsonb_build_array('SYNTHETIC_TEST_CONDITION'),
    'selectionFingerprint', v_selection_fingerprint,
    'policyFingerprint', v_policy_fingerprint,
    'calculationFingerprint', v_calculation_fingerprint,
    'proposalFingerprint', v_proposal_fingerprint
  );
  return v_snapshot;
end;
$function$;
