begin;

create or replace function internal_finance.receivable_renegotiation_hash(
  p_value jsonb
) returns text language sql immutable security invoker set search_path = '' as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(coalesce(p_value, 'null'::jsonb)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function internal_finance.normalize_receivable_renegotiation_ids(
  p_receivable_ids uuid[]
) returns uuid[] language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_ids uuid[];
begin
  if p_receivable_ids is null or cardinality(p_receivable_ids) = 0 then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_EMPTY_SELECTION',
      detail = 'Selecione ao menos uma parcela.';
  end if;
  if array_position(p_receivable_ids, null) is not null then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_INVALID_SELECTION',
      detail = 'A seleção contém identificador nulo.';
  end if;

  select array_agg(candidate.id order by candidate.id)
  into v_ids
  from (select distinct id from unnest(p_receivable_ids) selected(id)) candidate;
  if cardinality(v_ids) > 120 then
    raise exception using errcode = '22023',
      message = 'RENEGOTIATION_INVALID_SELECTION',
      detail = 'A prévia aceita no máximo 120 parcelas por proposta.';
  end if;
  return v_ids;
end;
$function$;

create or replace function internal_finance.resolve_receivable_renegotiation_policy(
  p_matricula_id uuid,
  p_policy_kind text
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_kind text := upper(btrim(coalesce(p_policy_kind, '')));
  v_rule jsonb;
  v_origin text;
  v_source_fingerprint text;
  v_discount numeric;
  v_interest numeric;
  v_penalty numeric;
  v_apply_discount boolean := true;
  v_apply_late boolean := true;
  v_discount_cents bigint;
  v_interest_bps integer;
  v_penalty_bps integer;
  v_penalty_cents bigint;
  v_discount_text text;
  v_interest_text text;
  v_penalty_text text;
begin
  if p_matricula_id is null or v_kind not in ('TECNICO', 'PLANO_UNICO') then
    raise exception using errcode = '23514',
      message = 'RENEGOTIATION_UNKNOWN_POLICY',
      detail = 'Matrícula ou tipo de política inválido.';
  end if;

  if v_kind = 'TECNICO' then
    begin
      v_rule := internal_academic.technical_financial_effective_rule(p_matricula_id);
      if jsonb_typeof(v_rule) <> 'object'
        or jsonb_typeof(v_rule -> 'encargos') <> 'object'
        or jsonb_typeof(v_rule -> 'aplicacao' -> 'mensalidade') <> 'object'
      then
        raise exception 'invalid technical policy shape' using errcode = '22000';
      end if;
      v_discount_text := v_rule -> 'encargos' ->> 'descontoPontualidade';
      v_interest_text := v_rule -> 'encargos' ->> 'jurosAtrasoPercentual';
      v_penalty_text := v_rule -> 'encargos' ->> 'multaAtrasoPercentual';
      if v_discount_text is null or v_discount_text !~ '^[0-9]+([.][0-9]+)?$'
        or v_interest_text is null or v_interest_text !~ '^[0-9]+([.][0-9]+)?$'
        or v_penalty_text is null or v_penalty_text !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_rule -> 'aplicacao' -> 'mensalidade' ->> 'desconto', '')
          not in ('true', 'false')
        or coalesce(v_rule -> 'aplicacao' -> 'mensalidade' ->> 'multaJuros', '')
          not in ('true', 'false')
      then
        raise exception 'incomplete technical policy' using errcode = '22000';
      end if;
      v_discount := v_discount_text::numeric;
      v_interest := v_interest_text::numeric;
      v_penalty := v_penalty_text::numeric;
      v_apply_discount := coalesce(
        (v_rule -> 'aplicacao' -> 'mensalidade' ->> 'desconto')::boolean,
        false
      );
      v_apply_late := coalesce(
        (v_rule -> 'aplicacao' -> 'mensalidade' ->> 'multaJuros')::boolean,
        false
      );
    exception when others then
      raise exception using errcode = '23514',
        message = 'RENEGOTIATION_UNKNOWN_POLICY',
        detail = 'A regra financeira técnica atual não pôde ser resolvida.';
    end;

    if v_discount is null or v_interest is null or v_penalty is null
      or v_discount < 0 or v_discount > 90000000000000
      or v_interest not between 0 and 100
      or v_penalty not between 0 and 100 then
      raise exception using errcode = '23514',
        message = 'RENEGOTIATION_UNKNOWN_POLICY',
        detail = 'A regra técnica contém encargos fora do domínio suportado.';
    end if;
    v_origin := case when v_rule ->> 'origem' = 'INDIVIDUAL'
      then 'MATRICULA' else 'TURMA' end;
    v_source_fingerprint := coalesce(
      nullif(v_rule -> 'identidade' ->> 'efetivaFingerprint', ''),
      nullif(v_rule ->> 'fingerprint', ''),
      internal_finance.receivable_renegotiation_hash(v_rule)
    );
    v_discount_cents := case when v_apply_discount
      then round(v_discount * 100)::bigint else 0 end;
    v_interest_bps := case when v_apply_late
      then round(v_interest * 100)::integer else 0 end;
    v_penalty_bps := case when v_apply_late
      then round(v_penalty * 100)::integer else 0 end;

    return jsonb_build_object(
      'version', 1,
      'kind', 'TECNICO',
      'origin', v_origin,
      'sourceFingerprint', v_source_fingerprint,
      'punctualDiscount', jsonb_build_object(
        'kind', 'FIXED_CENTS', 'amountCents', v_discount_cents,
        'scope', 'EACH_INSTALLMENT'
      ),
      'monthlyInterest', jsonb_build_object(
        'kind', 'MONTHLY_PERCENTAGE',
        'percent', case when v_apply_late then v_interest else 0 end,
        'basisPoints', v_interest_bps,
        'unit', 'BASIS_POINTS_PER_30_DAY_MONTH'
      ),
      'penalty', jsonb_build_object(
        'kind', 'PERCENTAGE',
        'percent', case when v_apply_late then v_penalty else 0 end,
        'basisPoints', v_penalty_bps,
        'unit', 'BASIS_POINTS_ON_PRINCIPAL'
      )
    );
  end if;

  select enrollment_plan.regra_snapshot
  into v_rule
  from public.matriculas_plano_financeiro_unico enrollment_plan
  where enrollment_plan.matricula_id = p_matricula_id;
  if found then
    v_origin := 'MATRICULA';
  else
    select jsonb_build_object(
      'descontoPontualidade', class_plan.desconto_pontualidade,
      'jurosAtrasoPercentual', class_plan.juros_atraso_percentual,
      'multaAtraso', class_plan.multa_atraso,
      'fingerprint', class_plan.fingerprint
    )
    into v_rule
    from public.matriculas enrollment
    join public.turmas_plano_financeiro_unico class_plan
      on class_plan.turma_id = enrollment.turma_id
    where enrollment.id = p_matricula_id;
    v_origin := 'TURMA';
  end if;

  begin
    if jsonb_typeof(v_rule) <> 'object' then
      raise exception 'invalid single-plan policy shape' using errcode = '22000';
    end if;
    v_discount_text := v_rule ->> 'descontoPontualidade';
    v_interest_text := v_rule ->> 'jurosAtrasoPercentual';
    v_penalty_text := v_rule ->> 'multaAtraso';
    if v_discount_text is null or v_discount_text !~ '^[0-9]+([.][0-9]+)?$'
      or v_interest_text is null or v_interest_text !~ '^[0-9]+([.][0-9]+)?$'
      or v_penalty_text is null or v_penalty_text !~ '^[0-9]+([.][0-9]+)?$'
    then
      raise exception 'incomplete single-plan policy' using errcode = '22000';
    end if;
    v_discount := v_discount_text::numeric;
    v_interest := v_interest_text::numeric;
    v_penalty := v_penalty_text::numeric;
  exception when others then
    raise exception using errcode = '23514',
      message = 'RENEGOTIATION_UNKNOWN_POLICY',
      detail = 'O plano único atual não pôde ser resolvido.';
  end;
  if v_discount is null or v_interest is null or v_penalty is null
    or v_discount < 0 or v_discount > 90000000000000
    or v_interest not between 0 and 100
    or v_penalty < 0 or v_penalty > 90000000000000 then
    raise exception using errcode = '23514',
      message = 'RENEGOTIATION_UNKNOWN_POLICY',
      detail = 'O plano único contém encargos fora do domínio suportado.';
  end if;

  v_source_fingerprint := coalesce(
    nullif(v_rule ->> 'fingerprint', ''),
    internal_finance.receivable_renegotiation_hash(v_rule)
  );
  v_discount_cents := round(v_discount * 100)::bigint;
  v_interest_bps := round(v_interest * 100)::integer;
  v_penalty_cents := round(v_penalty * 100)::bigint;
  return jsonb_build_object(
    'version', 1,
    'kind', 'PLANO_UNICO',
    'origin', v_origin,
    'sourceFingerprint', v_source_fingerprint,
    'punctualDiscount', jsonb_build_object(
      'kind', 'FIXED_CENTS', 'amountCents', v_discount_cents,
      'scope', 'EACH_INSTALLMENT'
    ),
    'monthlyInterest', jsonb_build_object(
      'kind', 'MONTHLY_PERCENTAGE', 'percent', v_interest,
      'basisPoints', v_interest_bps,
      'unit', 'BASIS_POINTS_PER_30_DAY_MONTH'
    ),
    'penalty', jsonb_build_object(
      'kind', 'FIXED_CENTS', 'amountCents', v_penalty_cents,
      'unit', 'CENTS_PER_LATE_INSTALLMENT'
    )
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_hash(jsonb),
  internal_finance.normalize_receivable_renegotiation_ids(uuid[]),
  internal_finance.resolve_receivable_renegotiation_policy(uuid, text)
  from public, anon, authenticated, service_role;

commit;
