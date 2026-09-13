begin;

-- O relatório passa a aproveitar componentes explícitos já preservados pela API.
-- Não atualiza snapshots, recebíveis, baixa ou termos comerciais históricos.
do $base$
begin
  if md5(pg_get_functiondef('public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)'::regprocedure))
    <> '0526d09d2a3719809a7d1eaf630742c9' then
    raise exception 'Composition resolver changed; rebase before applying.';
  end if;
end;
$base$;

create function internal_proesc.explicit_payment_component(p_lines jsonb, p_block text, p_payment_date date)
returns numeric language sql immutable set search_path = '' as $component$
  select case when p_block in ('3','4') and count(*)=1
    and bool_and(jsonb_typeof(line->'amountCents')='number'
      and line->>'amountCents' ~ '^[0-9]{1,16}$'
      and line->>'paymentDate'=p_payment_date::text
      and line->'cancelled'='false'::jsonb and line->'renegotiation'='false'::jsonb)
    then max(case when line->>'amountCents' ~ '^[0-9]{1,16}$'
      then (line->>'amountCents')::numeric end) end
  from jsonb_array_elements(case when jsonb_typeof(p_lines)='array' then p_lines else '[]'::jsonb end) line
  where line->>'blockCode'=p_block;
$component$;
revoke all on function internal_proesc.explicit_payment_component(jsonb,text,date)
  from public,anon,authenticated,service_role;

-- Custom block 10482 is proven as a discount by the existing PORTAL_CONFIRMED
-- ledger for unit 3145. The identifier is not a universal Proesc category.
create function internal_proesc.explicit_discount_component(p_lines jsonb, p_source_unit text, p_payment_date date)
returns numeric language sql immutable set search_path = '' as $discount$
  select case when p_source_unit='3145' and count(*)=1
    and bool_and(jsonb_typeof(line->'amountCents')='number'
      and line->>'amountCents' ~ '^[0-9]{1,16}$'
      and line->>'paymentDate'=p_payment_date::text
      and line->'cancelled'='false'::jsonb and line->'renegotiation'='false'::jsonb)
    then max(case when line->>'amountCents' ~ '^[0-9]{1,16}$'
      then (line->>'amountCents')::numeric end) end
  from jsonb_array_elements(case when jsonb_typeof(p_lines)='array' then p_lines else '[]'::jsonb end) line
  where line->>'blockCode'='10482';
$discount$;
revoke all on function internal_proesc.explicit_discount_component(jsonb,text,date)
  from public,anon,authenticated,service_role;

-- Requested explicitly on 2026-09-13 for historical reporting when Proesc
-- omits the split. This is a calculated rule, not evidence of source terms.
-- The monthly-percentage arithmetic matches the canonical Banese formula.
create function internal_proesc.calculate_confirmed_payment_rule(p_base numeric, p_due date, p_payment date)
returns table(juros numeric,multa numeric,acrescimo numeric,desconto numeric)
language sql immutable set search_path = '' as $rule$
  select case when p_payment>p_due then round(p_base*2/100*(p_payment-p_due)/30,2) else 0 end,
    case when p_payment>p_due then round(p_base*2/100,2) else 0 end,
    0::numeric,
    case when p_base=279.90 and p_payment<=p_due then 19.90 else 0 end
  where p_base in (100,200,279.90) and p_due is not null and p_payment is not null
    and isfinite(p_due) and isfinite(p_payment);
$rule$;
revoke all on function internal_proesc.calculate_confirmed_payment_rule(numeric,date,date)
  from public,anon,authenticated,service_role;

-- Composição comprovada no Proesc é independente dos termos e da baixa Banese.
-- Só reutilizar a evidência enquanto principal, recebido e data continuarem iguais.
create or replace function public.resolve_integrated_receivable_financial_composition(
  p_receivable_id uuid,
  p_valor_base numeric,
  p_valor_pago numeric,
  p_data_vencimento date,
  p_data_pagamento date,
  p_financial_terms jsonb,
  p_manual_id uuid,
  p_manual_reversed_at timestamptz,
  p_manual_principal_cents bigint,
  p_manual_interest_cents bigint,
  p_manual_penalty_cents bigint,
  p_manual_addition_cents bigint,
  p_manual_discount_cents bigint,
  p_manual_received_cents bigint
) returns table (
  valor_base numeric, juros numeric, multa numeric, acrescimo numeric,
  desconto numeric, diferenca_nao_discriminada numeric,
  composicao_status text, valor_recebido numeric
) language plpgsql stable security definer set search_path = '' as $$
declare
  v_snapshot internal_proesc.financial_snapshots%rowtype;
  v_interest numeric;
  v_penalty numeric;
  v_discount numeric;
  v_source_unit text;
  v_calculated record;
  v_used_calculation boolean := false;
  v_has_explicit boolean := false;
  v_addition numeric;
begin
  if p_manual_id is null and p_receivable_id is not null then
    select snapshot.* into v_snapshot
    from internal_proesc.financial_snapshots snapshot
    join internal_proesc.obligation_links link on link.id = snapshot.link_id
    join public.contas_receber receipt on receipt.id = link.receivable_id
    where receipt.id = p_receivable_id
      and receipt.status = 'PAGO'
      and receipt.origem_pagamento = 'SISTEMA_ANTERIOR'
      and receipt.gateway_provider is null
      and receipt.gateway_payment_id is null
      and receipt.manual_settlement_id is null
      and receipt.valor = p_valor_base
      and receipt.valor_pago = p_valor_pago
      and receipt.data_pagamento = p_data_pagamento
      and receipt.data_vencimento = p_data_vencimento
      and snapshot.verification = 'VERIFIED'
      and snapshot.source_status = 'PAID'
      and snapshot.evidence_kind = 'PORTAL_CONFIRMED'
      and snapshot.principal_cents = round(receipt.valor * 100)::bigint
      and snapshot.received_cents = round(receipt.valor_pago * 100)::bigint
      and snapshot.payment_date = receipt.data_pagamento
      and snapshot.components ?& array['interestCents','penaltyCents','additionCents','discountCents']
      and not exists (select 1 from jsonb_each(snapshot.components) component
        where jsonb_typeof(component.value) <> 'number'
          or component.value::text !~ '^[0-9]+$')
      and snapshot.principal_cents
        + (snapshot.components->>'interestCents')::bigint
        + (snapshot.components->>'penaltyCents')::bigint
        + (snapshot.components->>'additionCents')::bigint
        - (snapshot.components->>'discountCents')::bigint = snapshot.received_cents
      and not exists (select 1 from jsonb_array_elements(snapshot.accounting_lines) line
        where line->>'cancelled' = 'true' or line->>'renegotiation' = 'true')
      -- A later API observation may omit detail, but an explicit conflicting
      -- observation or newer portal conference supersedes the previous proof.
      and not exists (
        select 1 from internal_proesc.financial_snapshots later
        where later.link_id = snapshot.link_id
          and (later.observed_at, later.recorded_at, later.id)
            > (snapshot.observed_at, snapshot.recorded_at, snapshot.id)
          and (
            later.evidence_kind = 'PORTAL_CONFIRMED'
            or later.source_status = 'CANCELED'
            or exists (select 1 from jsonb_array_elements(later.accounting_lines) line
              where line->>'cancelled' = 'true' or line->>'renegotiation' = 'true')
            or (later.verification = 'VERIFIED' and later.source_status = 'PAID'
              and (later.principal_cents is distinct from snapshot.principal_cents
                or later.received_cents is distinct from snapshot.received_cents
                or later.payment_date is distinct from snapshot.payment_date))
          )
      )
    order by snapshot.observed_at desc, snapshot.recorded_at desc, snapshot.id desc limit 1;
    if found then
      return query select v_snapshot.principal_cents::numeric / 100,
        (v_snapshot.components->>'interestCents')::numeric / 100,
        (v_snapshot.components->>'penaltyCents')::numeric / 100,
        (v_snapshot.components->>'additionCents')::numeric / 100,
        (v_snapshot.components->>'discountCents')::numeric / 100,
        0::numeric, 'CONCILIADO_POR_CONFERENCIA_PROESC'::text,
        v_snapshot.received_cents::numeric / 100;
      return;
    end if;
  end if;
  -- Equal paid and principal values prove a zero net difference, not that
  -- interest, penalties and discounts were individually zero in the source.
  if p_manual_id is null and exists (
    select 1 from public.contas_receber receipt
    join internal_proesc.obligation_links link on link.receivable_id=receipt.id
    where receipt.id=p_receivable_id and receipt.status='PAGO'
      and receipt.origem_pagamento='SISTEMA_ANTERIOR'
      and receipt.gateway_provider is null and receipt.gateway_payment_id is null
      and receipt.manual_settlement_id is null
      and receipt.valor=p_valor_base and receipt.valor_pago=p_valor_pago
      and receipt.data_vencimento=p_data_vencimento
      and receipt.data_pagamento=p_data_pagamento
  ) then
    -- Somente o snapshot mais recente pode informar componentes parciais.
    -- O principal e o pagamento local precisam continuar idênticos à origem.
    select snapshot.* into v_snapshot
    from internal_proesc.financial_snapshots snapshot
    join internal_proesc.obligation_links link on link.id=snapshot.link_id
    where link.receivable_id=p_receivable_id
    order by snapshot.observed_at desc,snapshot.recorded_at desc,snapshot.id desc limit 1;
    if found and v_snapshot.verification='VERIFIED' and v_snapshot.source_status='PAID'
      and v_snapshot.evidence_kind in ('API_SINGLE_PAYMENT','API_PAYMENT_TOTAL')
      and v_snapshot.principal_cents=round(p_valor_base*100)::bigint
      and v_snapshot.received_cents=round(p_valor_pago*100)::bigint
      and v_snapshot.payment_date=p_data_pagamento
      and not exists (select 1 from jsonb_array_elements(v_snapshot.accounting_lines) line
        where line->'cancelled' is distinct from 'false'::jsonb
          or line->'renegotiation' is distinct from 'false'::jsonb)
    then
      -- 3 e 4 já são o contrato validado por proesc_record_financial_snapshot_service.
      -- A tarifa 7 nunca é juros, acréscimo nem parte adicional do recebido.
      v_interest := internal_proesc.explicit_payment_component(v_snapshot.accounting_lines,'3',p_data_pagamento)/100;
      v_penalty := internal_proesc.explicit_payment_component(v_snapshot.accounting_lines,'4',p_data_pagamento)/100;
      select source_unit_id into v_source_unit from internal_proesc.obligation_links where id=v_snapshot.link_id;
      v_discount := internal_proesc.explicit_discount_component(v_snapshot.accounting_lines,v_source_unit,p_data_pagamento)/100;
      v_has_explicit := v_interest is not null or v_penalty is not null or v_discount is not null;
      -- Exact user-authorized classes and nominal values only. Current individual
      -- exceptions, title-specific snapshots and unrecognized source blocks stop
      -- the rule fallback; explicit API values remain usable independently.
      if v_source_unit='3145'
        -- If a recorded portal conference failed the complete-proof guards above,
        -- a later total-only observation cannot replace it with assumed terms.
        and not exists(select 1 from internal_proesc.financial_snapshots proof
          where proof.link_id=v_snapshot.link_id and proof.evidence_kind='PORTAL_CONFIRMED')
        and exists (
        select 1 from public.contas_receber receipt
        join public.turmas class on class.id=receipt.turma_id
        join internal_proesc.class_scopes scope on scope.turma_id=class.id
          and scope.class_code=class.codigo and scope.polo_id=class.polo_id
          and scope.source_unit_id=v_source_unit and scope.phase='CONFIRMED'
        where receipt.id=p_receivable_id and receipt.tipo_lancamento='PARCELA'
          and class.codigo in (
            'ENF-T35-INT-MAT','ENF-T37-SEM-PDF','ENF-T38-INT-MAT',
            'ENF-T39-SEM-PDF','ENF-T40-INT-MAT','ENF-T41-SEM-AQB',
            'ENF-T42-INT-MAT','ENF-T43-INT-MAT','ENF-T44-SEM-AQB','ENF-T45-SEM-PDF'
          ) and receipt.gateway_financial_terms is null
          and (receipt.regra_financeira_tecnica_snapshot is null or (
            -- Import projections captured neutral class conditions, not a
            -- negotiated Proesc contract. Do not treat their zeroes as proof.
            receipt.regra_financeira_tecnica_snapshot->>'origem'='TURMA'
            and receipt.regra_financeira_tecnica_snapshot->>'overrideAtivo' is null
            and receipt.regra_financeira_tecnica_snapshot#>>'{identidade,efetivaFingerprint}' is null
            and receipt.regra_financeira_tecnica_snapshot#>>'{identidade,overrideFingerprint}' is null
          ))
          and not exists(select 1 from public.matriculas_tecnicas_financeiro_config config
            where config.matricula_id=receipt.matricula_id and config.override_ativo)
      ) and not exists(select 1 from jsonb_array_elements(v_snapshot.accounting_lines) line
        where line->>'blockCode' not in ('1','2','3','4','7','10482'))
        and (v_interest is not null or not exists(select 1 from jsonb_array_elements(v_snapshot.accounting_lines) line where line->>'blockCode'='3'))
        and (v_penalty is not null or not exists(select 1 from jsonb_array_elements(v_snapshot.accounting_lines) line where line->>'blockCode'='4'))
        and (v_discount is not null or not exists(select 1 from jsonb_array_elements(v_snapshot.accounting_lines) line where line->>'blockCode'='10482'))
      then
        select * into v_calculated from internal_proesc.calculate_confirmed_payment_rule(
          p_valor_base,p_data_vencimento,p_data_pagamento);
        if found then
          v_interest := coalesce(v_interest,v_calculated.juros);
          v_penalty := coalesce(v_penalty,v_calculated.multa);
          v_discount := coalesce(v_discount,v_calculated.desconto);
          v_addition := v_calculated.acrescimo;
          v_used_calculation := true;
        end if;
      end if;
    end if;
    return query select p_valor_base,v_interest,v_penalty,v_addition,
      v_discount,p_valor_pago-p_valor_base-coalesce(v_interest,0)-coalesce(v_penalty,0)+coalesce(v_discount,0),
      case when v_used_calculation and v_has_explicit then 'API_E_REGRA_INFORMADA_PROESC'
        when v_used_calculation then 'CALCULADO_REGRA_INFORMADA_PROESC'
        when v_has_explicit
        then 'PARCIAL_POR_API_PROESC' else 'NAO_DISCRIMINADA' end,p_valor_pago;
    return;
  end if;
  return query select * from public.resolve_receivable_financial_composition(
    p_valor_base, p_valor_pago, p_data_vencimento, p_data_pagamento,
    p_financial_terms, p_manual_id, p_manual_reversed_at,
    p_manual_principal_cents, p_manual_interest_cents, p_manual_penalty_cents,
    p_manual_addition_cents, p_manual_discount_cents, p_manual_received_cents
  );
end;
$$;
revoke all on function public.resolve_integrated_receivable_financial_composition(
  uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint
) from public,anon,authenticated;
grant execute on function public.resolve_integrated_receivable_financial_composition(
  uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint
) to service_role;

commit;
