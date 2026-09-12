begin;

-- Composição comprovada no Proesc é independente dos termos e da baixa Banese.
-- Só reutilizar a evidência enquanto principal, recebido e data continuarem iguais.
create function public.resolve_integrated_receivable_financial_composition(
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
