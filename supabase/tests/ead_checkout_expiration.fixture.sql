-- LOCAL ONLY: extends optional_ead_checkout.fixture.sql in PostgreSQL/WASM.
alter table public.contas_receber
  add column gateway_boleto_convenio text,
  add column gateway_boleto_agencia text,add column gateway_boleto_linha_digitavel text,
  add column gateway_boleto_codigo_barras text,add column gateway_creation_token uuid,
  add column gateway_submission_channel text,add column gateway_submission_status text,
  add column gateway_cnab_file_id uuid,add column gateway_synced_at timestamptz,
  add column gateway_settlement_evidence jsonb,add column asaas_synced_at timestamptz;
alter table public.inscricoes_online
  add column updated_at timestamptz default now(),
  add column erro text,add column valor numeric,add column forma_pagamento text,
  add column asaas_payment_id text;
alter table public.payment_gateway_transactions
  add column payment_method text,add column bank_slip_our_number text,
  add column bank_slip_digitable_line text,add column bank_slip_barcode text,
  add column amount numeric,add column last_error text,
  add column updated_at timestamptz default now(),add column synced_at timestamptz,
  add column installments integer,add column origin_polo_id uuid,add column issuer_polo_id uuid;
create table public.banese_reconciliation_queue (
  receivable_id uuid primary key,state text,next_check_at timestamptz,
  lease_run_id uuid,lease_until timestamptz,last_result text,updated_at timestamptz,
  constraint banese_reconciliation_queue_state_check check (state in (
    'READY','LEASED','DONE','QUARANTINED','REPLACEMENT_FENCED'))
);
create table public.banese_cancellation_outbox (receivable_id uuid,state text);
create table public.banese_ead_title_replacement_jobs (receivable_id uuid,status text);
create function public.gerar_cobranca_matricula(uuid)
returns void language sql as $$ select $$;
