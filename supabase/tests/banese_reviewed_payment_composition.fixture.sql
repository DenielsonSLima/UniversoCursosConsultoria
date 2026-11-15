create role anon;
create role authenticated;
create role service_role;
create schema internal_contas;
create table public.contas_receber(
  id uuid primary key, polo_id uuid, status text, valor numeric, valor_pago numeric,
  data_vencimento date, data_pagamento date, updated_at timestamptz,
  origem_pagamento text, forma_pagamento text, manual_settlement_id uuid,
  gateway_provider text, gateway_environment text, gateway_payment_method text,
  gateway_status text, gateway_last_error text, gateway_payment_id text,
  gateway_boleto_nosso_numero text, gateway_creation_token uuid,
  gateway_financial_terms jsonb, gateway_financial_terms_confirmed_at timestamptz,
  gateway_submission_channel text, gateway_submission_status text,
  gateway_cnab_file_id uuid, gateway_boleto_agencia text, gateway_boleto_convenio text,
  gateway_boleto_linha_digitavel text, gateway_boleto_codigo_barras text,
  gateway_pix_payload text, gateway_pix_encoded_image text,
  gateway_issuer_polo_id uuid, gateway_installments integer,
  gateway_invoice_url text, gateway_bank_slip_url text, gateway_synced_at timestamptz,
  gateway_settlement_channel text, gateway_settlement_source text,
  gateway_settlement_evidence jsonb, gateway_settlement_recorded_at timestamptz,
  conta_bancaria_id uuid, gateway_fee_value numeric, gateway_net_value numeric
);
create table public.payment_gateway_transactions(
  id uuid primary key default gen_random_uuid(), receivable_id uuid,
  provider_code text, environment text, payment_method text,
  origin_polo_id uuid, issuer_polo_id uuid, installments integer,
  remote_payment_id text, amount numeric, invoice_url text, bank_slip_url text,
  bank_slip_digitable_line text, bank_slip_barcode text, bank_slip_our_number text,
  pix_payload text, pix_encoded_image text, remote_status text, last_error text,
  synced_at timestamptz, updated_at timestamptz, raw_payload jsonb
);

-- The production integrated resolver's original Proesc body is unchanged by
-- this migration. This isolated baseline delegates straight to the real
-- canonical Banese/manual resolver to exercise the inserted branch/fallback.
create function public.resolve_integrated_receivable_financial_composition(
  p_receivable_id uuid, p_valor_base numeric, p_valor_pago numeric,
  p_data_vencimento date, p_data_pagamento date, p_financial_terms jsonb,
  p_manual_id uuid, p_manual_reversed_at timestamptz,
  p_manual_principal_cents bigint, p_manual_interest_cents bigint,
  p_manual_penalty_cents bigint, p_manual_addition_cents bigint,
  p_manual_discount_cents bigint, p_manual_received_cents bigint
) returns table(valor_base numeric,juros numeric,multa numeric,acrescimo numeric,
  desconto numeric,diferenca_nao_discriminada numeric,composicao_status text,valor_recebido numeric)
language plpgsql stable security definer set search_path='' as $$
declare
  v_addition numeric;
begin
  if p_manual_id is null and p_receivable_id is not null then
    null;
  end if;
  return query select * from public.resolve_receivable_financial_composition(
    p_valor_base,p_valor_pago,p_data_vencimento,p_data_pagamento,p_financial_terms,
    p_manual_id,p_manual_reversed_at,p_manual_principal_cents,p_manual_interest_cents,
    p_manual_penalty_cents,p_manual_addition_cents,p_manual_discount_cents,p_manual_received_cents
  );
end;
$$;
