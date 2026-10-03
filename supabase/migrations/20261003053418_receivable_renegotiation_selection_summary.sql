begin;

-- Leitura demonstrativa; não concede desconto, não altera termos da proposta
-- nem substitui a composição de um pagamento bancário efetivamente realizado.
create function internal_finance.receivable_renegotiation_punctual_discount(
  p_receivable public.contas_receber,
  p_source_item jsonb,
  p_as_of date
) returns jsonb language plpgsql stable security invoker set search_path = '' as $function$
declare
  v_source text := p_source_item ->> 'sourceSystem';
  v_snapshot jsonb := p_source_item #> '{sourcePolicySnapshot,sourceSnapshot}';
  v_terms jsonb := p_receivable.gateway_financial_terms;
  v_discount jsonb;
  v_amount numeric;
  v_cents bigint := 0;
  v_valid_until date := p_receivable.data_vencimento;
  v_effective_date date := p_as_of;
  v_banking_due date;
  v_calendar_unknown boolean := false;
  v_grace boolean := false;
  v_compatible boolean := true;
begin
  if v_source = 'LOCAL' then
    if v_snapshot ->> 'descontoPontualidade' is null
      or v_snapshot ->> 'descontoPontualidade' !~ '^[0-9]+([.][0-9]+)?$'
    then
      raise exception 'Unproved frozen discount' using errcode = '22000';
    end if;
    v_amount := (v_snapshot ->> 'descontoPontualidade')::numeric;
    if p_source_item ->> 'policyKind' = 'TECNICO' and v_amount > 0 then
      if coalesce(v_snapshot ->> 'aplicarDesconto', '') not in ('true', 'false') then
        raise exception 'Unproved frozen discount switch' using errcode = '22000';
      end if;
      if not (v_snapshot ->> 'aplicarDesconto')::boolean then v_amount := 0; end if;
    end if;
  elsif v_source = 'BANESE' then
    -- Mesma identidade de termos confirmados usada na leitura financeira.
    -- O helper de elegibilidade já comprovou a transação bancária da seleção.
    if p_receivable.gateway_financial_terms_confirmed_at is null
      or upper(btrim(coalesce(p_receivable.gateway_payment_method, ''))) <> 'BOLETO'
      or btrim(coalesce(p_receivable.gateway_boleto_nosso_numero, '')) !~ '^[0-9]{9}$'
      or btrim(coalesce(p_receivable.gateway_last_error, '')) like 'BANESE_IDENTITY_QUARANTINED:%'
      or jsonb_typeof(v_terms) is distinct from 'object'
      or jsonb_typeof(v_terms -> 'nominalAmount') is distinct from 'number'
      or coalesce(v_terms ->> 'nominalAmount', '') !~ '^[0-9]+([.][0-9]+)?$'
      or (v_terms ->> 'nominalAmount')::numeric <> p_receivable.valor
      or v_terms ->> 'dueDate' is distinct from p_receivable.data_vencimento::text
      or not (v_terms ? 'discount')
    then
      raise exception 'Unproved bank discount terms' using errcode = '22000';
    end if;
    if p_as_of > p_receivable.data_vencimento then
      v_banking_due := public.banese_next_national_banking_day(p_receivable.data_vencimento);
      v_calendar_unknown := v_banking_due is null;
      v_grace := v_banking_due is not null and p_as_of <= v_banking_due;
      if v_grace then v_effective_date := p_receivable.data_vencimento; end if;
    end if;
    v_discount := v_terms -> 'discount';
    if v_discount = 'null'::jsonb then
      -- Ausência confirmada/tombstone não ressuscita desconto de snapshot antigo.
      v_amount := 0;
    else
      if jsonb_typeof(v_discount) is distinct from 'object'
        or coalesce(v_discount ->> 'type', '') not in ('fixed', 'percentage')
        or jsonb_typeof(v_discount -> 'value') is distinct from 'number'
        or coalesce(v_discount ->> 'value', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_discount ->> 'validUntil', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then
        raise exception 'Invalid bank discount' using errcode = '22000';
      end if;
      v_amount := (v_discount ->> 'value')::numeric;
      v_valid_until := (v_discount ->> 'validUntil')::date;
      if v_amount <= 0 or v_valid_until > p_receivable.data_vencimento
        or (v_discount ->> 'type' = 'percentage' and v_amount >= 100)
      then
        raise exception 'Invalid bank discount bounds' using errcode = '22000';
      end if;
      if v_discount ->> 'type' = 'percentage' then
        v_amount := p_receivable.valor * v_amount / 100;
      end if;
      if v_calendar_unknown and v_valid_until = p_receivable.data_vencimento then
        return jsonb_build_object('status', 'UNAVAILABLE', 'amountCents', null,
          'payableCompatible', false, 'message',
          'O calendário bancário não comprova a prorrogação do desconto nesta data.');
      end if;
    end if;
    v_compatible := not v_calendar_unknown and not (v_grace and (
      (p_source_item ->> 'interestCents')::bigint > 0
      or (p_source_item ->> 'penaltyCents')::bigint > 0
    ));
  else
    raise exception 'Unsupported discount source' using errcode = '22000';
  end if;
  if v_amount is null or v_amount < 0 or v_amount >= p_receivable.valor then
    raise exception 'Invalid discount amount' using errcode = '22000';
  end if;
  if v_amount > 0 and (round(v_amount * 100) < 1
    or round(v_amount * 100) >= (p_source_item ->> 'principalCents')::bigint)
  then
    raise exception 'Invalid rounded discount amount' using errcode = '22000';
  end if;
  if v_effective_date <= v_valid_until then
    v_cents := round(v_amount * 100)::bigint;
  end if;
  return jsonb_build_object('status', 'KNOWN', 'amountCents', v_cents,
    'payableCompatible', v_compatible, 'message', case when v_grace then
      'Desconto demonstrativo considera a prorrogação bancária já comprovada.'
      else 'Desconto de pontualidade demonstrativo dos títulos originais na data-base.' end);
exception when data_exception then
  return jsonb_build_object('status', 'UNAVAILABLE', 'amountCents', null,
    'payableCompatible', false, 'message',
    'Os termos congelados ou bancários não comprovam o desconto nesta seleção.');
end;
$function$;

create function public.summarize_receivable_renegotiation_selection_secure(
  p_receivable_ids uuid[],
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_ids uuid[];
  v_as_of date;
  v_count bigint;
  v_polo_id uuid;
  v_aluno_id uuid;
  v_matricula_id uuid;
  v_turma_id uuid;
  v_row public.contas_receber%rowtype;
  v_item jsonb;
  v_discount jsonb;
  v_principal bigint := 0;
  v_interest bigint := 0;
  v_penalty bigint := 0;
  v_gross bigint := 0;
  v_discount_cents bigint := 0;
  v_discount_known boolean := true;
  v_payable_compatible boolean := true;
  v_discount_message text := 'Desconto de pontualidade demonstrativo dos títulos originais na data-base.';
begin
  -- Identidade antes de ler títulos, inclusive nos caminhos de erro.
  perform internal_finance.assert_receivable_renegotiation_identity();
  if cardinality(p_receivable_ids) > 120 or array_ndims(p_receivable_ids) > 1 then
    raise exception using errcode = '22023', message = 'RENEGOTIATION_INVALID_SELECTION';
  end if;
  v_ids := internal_finance.normalize_receivable_renegotiation_ids(p_receivable_ids);
  v_as_of := internal_finance.receivable_renegotiation_public_as_of(p_as_of);
  select count(*), (array_agg(polo_id order by id))[1],
    (array_agg(cliente_id order by id))[1], (array_agg(matricula_id order by id))[1],
    (array_agg(turma_id order by id))[1]
  into v_count, v_polo_id, v_aluno_id, v_matricula_id, v_turma_id
  from public.contas_receber where id = any(v_ids)
  having count(distinct polo_id) = 1 and count(distinct cliente_id) = 1
    and count(distinct matricula_id) = 1 and count(distinct turma_id) = 1;
  if v_count is distinct from cardinality(v_ids)::bigint
    or v_polo_id is null or v_aluno_id is null or v_matricula_id is null or v_turma_id is null
  then
    raise exception using errcode = '23514', message = 'RENEGOTIATION_INVALID_SELECTION',
      detail = 'Selecione parcelas da mesma matrícula, aluno, turma e polo.';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_polo_id);

  for v_row in select * from public.contas_receber where id = any(v_ids) order by id loop
    -- Reutiliza integralmente elegibilidade, encargos e guardas da prévia.
    v_item := internal_finance.receivable_renegotiation_source_item(v_row.id, v_as_of);
    v_discount := internal_finance.receivable_renegotiation_punctual_discount(v_row, v_item, v_as_of);
    v_principal := v_principal + (v_item ->> 'principalCents')::bigint;
    v_interest := v_interest + (v_item ->> 'interestCents')::bigint;
    v_penalty := v_penalty + (v_item ->> 'penaltyCents')::bigint;
    v_gross := v_gross + (v_item ->> 'debtCents')::bigint;
    if v_discount ->> 'status' = 'KNOWN' then
      v_discount_cents := v_discount_cents + (v_discount ->> 'amountCents')::bigint;
    else
      v_discount_known := false;
      v_discount_message := v_discount ->> 'message';
    end if;
    v_payable_compatible := v_payable_compatible
      and coalesce((v_discount ->> 'payableCompatible')::boolean, false);
    if greatest(v_principal, v_interest, v_penalty, v_gross, v_discount_cents) > 9000000000000000 then
      raise exception using errcode = '22023', message = 'RENEGOTIATION_AMOUNT_OUT_OF_RANGE';
    end if;
  end loop;
  return jsonb_build_object(
    'version', 1, 'asOf', v_as_of, 'count', cardinality(v_ids), 'receivableIds', to_jsonb(v_ids),
    'identity', jsonb_build_object('poloId', v_polo_id, 'alunoId', v_aluno_id,
      'matriculaId', v_matricula_id, 'turmaId', v_turma_id),
    'totals', jsonb_build_object('principalCents', v_principal,
      'punctualDiscountCents', case when v_discount_known then v_discount_cents else null end,
      'discountedPrincipalCents', case when v_discount_known then v_principal - v_discount_cents else null end,
      'interestCents', v_interest, 'penaltyCents', v_penalty, 'grossDebtCents', v_gross,
      'payableCents', case when v_discount_known and v_payable_compatible
        then v_gross - v_discount_cents else null end),
    'discount', jsonb_build_object('status', case when v_discount_known then 'KNOWN' else 'UNAVAILABLE' end,
      'message', v_discount_message, 'appliedToProposal', false),
    'payableStatus', case when v_discount_known and v_payable_compatible then 'KNOWN' else 'UNAVAILABLE' end,
    'payableMessage', case when v_discount_known and v_payable_compatible then
      'Comparação demonstrativa; não confirma quitação bancária nem concede desconto à proposta.'
      else 'Não é seguro combinar o desconto com os encargos da prévia nesta data; consulte os cenários separadamente.' end
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_punctual_discount(public.contas_receber, jsonb, date)
  from public, anon, authenticated, service_role;
revoke all on function public.summarize_receivable_renegotiation_selection_secure(uuid[], date)
  from public, anon, authenticated, service_role;
grant execute on function public.summarize_receivable_renegotiation_selection_secure(uuid[], date)
  to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
