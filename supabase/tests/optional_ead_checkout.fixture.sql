-- LOCAL ONLY: extends the existing in-memory financial fixture. No real IDs.
truncate public.contas_receber,public.contas_pagar,public.despesas_lancamentos,
  public.matriculas,public.emprestimos_financeiros;
drop function internal_contas.caixa_monthly_delinquency(uuid,date,date);
drop function internal_contas.caixa_open_receivables(uuid);
create schema internal_proesc;
alter table public.polos add column cnpj text;
alter table public.cursos add column nome text;
alter table public.turmas add column nome text,add column codigo text,add column polo_id uuid;
alter table public.matriculas add column aluno_id uuid,add column status text;
alter table public.despesas_lancamentos add column rateio_modo text;
create table public.despesas_lancamentos_rateios (
  valor_total numeric,status text,despesa_lancamento_id uuid,polo_id uuid);
create table public.parceiros (
  id uuid primary key,nome text,cpf_cnpj text,telefone text,responsavel_telefone text);
create table public.inscricoes_online (
  id uuid primary key,curso_id uuid,turma_id uuid,aluno_id uuid,matricula_id uuid,
  receivable_id uuid,status text,pago_em timestamptz,confirmado_em timestamptz,
  gateway_provider text,gateway_environment text,gateway_payment_id text);
create table public.ead_aluno_progresso (
  id uuid primary key,aluno_id uuid,curso_id uuid,started_at timestamptz,progress jsonb);
create table public.matricula_movimentacoes (
  id uuid primary key,matricula_id uuid,status_anterior text,status_novo text,
  created_at timestamptz default now(),data_movimentacao date default current_date);
create table public.sistema_eventos (
  id uuid primary key,entidade text,entidade_id text,acao text,
  created_at timestamptz,detalhes jsonb);
create table public.payment_gateway_transactions (
  id uuid primary key,receivable_id uuid,remote_status text,
  inscricao_online_id uuid,provider_code text,environment text,remote_payment_id text);
create table public.payment_gateway_cnab_records (
  receivable_id uuid,provider_code text,status text);
create table public.receivable_manual_settlements (
  id uuid,payment_date date,principal_cents bigint);
alter table public.contas_receber
  add column cliente_id uuid,add column descricao text,add column tipo_lancamento text,
  add column origem_pagamento text,add column origem_cronograma_id text,
  add column regra_financeira_tecnica_snapshot jsonb,
  add column forma_pagamento text,add column nosso_numero_asaas text,
  add column created_at timestamptz default now(),add column parcela_numero integer,
  add column gateway_provider text,add column gateway_environment text,add column gateway_payment_method text,
  add column gateway_payment_id text,add column gateway_payment_link_id text,
  add column gateway_invoice_url text,add column gateway_bank_slip_url text,
  add column gateway_installment_id text,add column gateway_transaction_receipt_url text,
  add column gateway_status text,add column gateway_last_error text,
  add column gateway_fee_value numeric,add column gateway_net_value numeric,
  add column gateway_settlement_channel text,add column gateway_settlement_source text,
  add column gateway_boleto_issued_at timestamptz,add column gateway_boleto_nosso_numero text,
  add column gateway_financial_terms jsonb,add column gateway_financial_terms_confirmed_at timestamptz,
  add column asaas_payment_id text,add column asaas_payment_link_id text,
  add column asaas_invoice_url text,add column asaas_bank_slip_url text,
  add column asaas_installment_id text,add column asaas_transaction_receipt_url text,
  add column asaas_status text,add column asaas_last_error text,
  add column asaas_fee_value numeric,add column asaas_net_value numeric,
  add column manual_settlement_principal_cents bigint,
  add column manual_settlement_discount_cents bigint,add column manual_settlement_interest_cents bigint,
  add column manual_settlement_penalty_cents bigint,add column manual_settlement_addition_cents bigint;
create table internal_proesc.obligation_links (
  id uuid,receivable_id uuid,source_key text);
create table internal_proesc.financial_snapshots (
  id uuid,link_id uuid,observed_at timestamptz,recorded_at timestamptz,verification text,
  source_status text,evidence_kind text,collector_review_reasons jsonb,
  principal_cents bigint,received_cents bigint,payment_date date);
create function internal_contas.caixa_proesc_effective_snapshot(public.contas_receber,uuid)
returns setof internal_proesc.financial_snapshots language sql stable as $$
  select * from internal_proesc.financial_snapshots where link_id=$2 $$;
create function internal_contas.caixa_proesc_open_receivable_verified(
  public.contas_receber,internal_proesc.financial_snapshots)
returns boolean language sql stable as $$ select true $$;
create function internal_proesc.reconciliation_source_system(public.contas_receber)
returns text language sql immutable as $$ select 'LOCAL'::text $$;
create function public.financeiro_normalize_search_text(text)
returns text language sql immutable as $$ select lower(coalesce($1,'')) $$;
create function public.assert_receivables_filter_scope(uuid)
returns boolean language plpgsql stable as $$ begin
  if not public.gestor_has_any_global_module(array['financeiro'])
    and not public.gestor_has_any_module_for_polo(array['financeiro'],$1) then
    raise exception 'scope denied' using errcode='42501'; end if;
  return true;
end $$;
create function public.is_gestor_global() returns boolean language sql stable as $$
  select public.gestor_has_any_global_module(array['relatorios']) $$;
create function public.is_gestor_for_polo(uuid) returns boolean language sql stable as $$
  select public.gestor_has_any_module_for_polo(array['relatorios'],$1) $$;
create function public.gestor_has_module(text) returns boolean language sql stable as $$ select true $$;
