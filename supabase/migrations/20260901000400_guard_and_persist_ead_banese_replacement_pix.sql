begin;

create or replace function public.guard_banese_ead_reissue_receivable_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_gateway_fields text[] := array[
    'gateway_payment_id', 'gateway_customer_id', 'gateway_payment_link_id',
    'gateway_installment_id', 'gateway_status', 'gateway_invoice_url',
    'gateway_bank_slip_url', 'gateway_pix_payload',
    'gateway_pix_encoded_image', 'gateway_transaction_receipt_url',
    'gateway_fee_value', 'gateway_net_value', 'gateway_synced_at',
    'gateway_last_error', 'gateway_boleto_linha_digitavel',
    'gateway_boleto_codigo_barras', 'gateway_boleto_nosso_numero',
    'gateway_boleto_issued_at', 'gateway_financial_terms',
    'gateway_financial_terms_confirmed_at', 'gateway_creation_token',
    'gateway_submission_channel', 'gateway_submission_status',
    'asaas_last_error', 'updated_at'
  ];
  v_paid_fields text[] := array[
    'status', 'valor_pago', 'data_pagamento', 'forma_pagamento',
    'origem_pagamento', 'gateway_settlement_channel',
    'gateway_settlement_source', 'gateway_settlement_evidence',
    'gateway_settlement_recorded_at'
  ];
  v_paid_fields_changed boolean;
  v_paid_transition boolean := false;
begin
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.receivable_id = old.id and job.status = 'REISSUING';
  if not found then return new; end if;
  v_paid_fields_changed := row(
    new.status, new.valor_pago, new.data_pagamento, new.forma_pagamento,
    new.origem_pagamento, new.gateway_settlement_channel,
    new.gateway_settlement_source, new.gateway_settlement_evidence,
    new.gateway_settlement_recorded_at
  ) is distinct from row(
    old.status, old.valor_pago, old.data_pagamento, old.forma_pagamento,
    old.origem_pagamento, old.gateway_settlement_channel,
    old.gateway_settlement_source, old.gateway_settlement_evidence,
    old.gateway_settlement_recorded_at
  );
  if v_paid_fields_changed then
    v_paid_transition := old.status in ('PENDENTE', 'VENCIDO')
      and old.valor_pago is null and old.data_pagamento is null
      and old.manual_settlement_id is null
      and old.gateway_settlement_channel is null
      and old.gateway_settlement_source is null
      and old.gateway_settlement_evidence is null
      and old.gateway_settlement_recorded_at is null
      and new.status = 'PAGO' and coalesce(new.valor_pago, 0) > 0
      and new.data_pagamento is not null
      and new.forma_pagamento in ('PIX', 'BOLETO')
      and new.origem_pagamento = 'BANESE'
      and new.manual_settlement_id is null
      and new.gateway_status = 'PAID'
      and new.gateway_settlement_channel in (
        'PIX', 'BOLETO', 'NAO_IDENTIFICADO', 'MISTO'
      )
      and new.gateway_settlement_source = 'API'
      and new.gateway_settlement_recorded_at is not null
      and jsonb_typeof(new.gateway_settlement_evidence) = 'object'
      and new.gateway_settlement_evidence ->> 'classification'
        = new.gateway_settlement_channel
      and coalesce(new.gateway_settlement_evidence ->> 'paymentCount', '')
        ~ '^[1-9][0-9]*$'
      and new.gateway_settlement_evidence -> 'documentedFields'
        = jsonb_build_array('BancoRecebedor', 'DataPagamento', 'ValorPago')
      and (
        (new.gateway_settlement_channel = 'PIX' and new.forma_pagamento = 'PIX')
        or (new.gateway_settlement_channel <> 'PIX'
          and new.forma_pagamento = 'BOLETO')
      )
      and coalesce(new.gateway_boleto_nosso_numero, '') ~ '^[0-9]{9}$'
      and new.gateway_boleto_nosso_numero <> v_job.canceled_nosso_numero
      and new.gateway_payment_id = new.gateway_boleto_nosso_numero
      and new.gateway_submission_channel = 'API'
      and new.gateway_submission_status = 'API_REGISTERED'
      and new.gateway_cnab_file_id is null
      and coalesce(new.gateway_boleto_linha_digitavel, '') ~ '^0479[0-9]{43}$'
      and coalesce(new.gateway_boleto_codigo_barras, '') ~ '^0479[0-9]{40}$'
      and substring(new.gateway_boleto_codigo_barras from 31 for 9)
        = new.gateway_boleto_nosso_numero
      and concat(substring(new.gateway_boleto_linha_digitavel from 1 for 4),
        substring(new.gateway_boleto_linha_digitavel from 33 for 1),
        substring(new.gateway_boleto_linha_digitavel from 34 for 14),
        substring(new.gateway_boleto_linha_digitavel from 5 for 5),
        substring(new.gateway_boleto_linha_digitavel from 11 for 10),
        substring(new.gateway_boleto_linha_digitavel from 22 for 10))
        = new.gateway_boleto_codigo_barras
      and (nullif(btrim(coalesce(new.gateway_pix_payload, '')), '') is null)
        = (nullif(btrim(coalesce(new.gateway_pix_encoded_image, '')), '') is null)
      and exists (select 1
        from public.banese_ead_title_replacement_archive archive
        where archive.job_id = v_job.id)
      and exists (select 1 from public.banese_reconciliation_queue queue
        where queue.receivable_id = old.id
          and queue.state = 'REPLACEMENT_FENCED')
      and (select count(*) = 1
        from public.payment_gateway_transactions transaction
        where transaction.receivable_id = old.id
          and transaction.provider_code = 'banese_card'
          and transaction.environment = v_job.environment
          and transaction.payment_method = 'BOLETO'
          and transaction.remote_status = 'PAID'
          and transaction.remote_payment_id = new.gateway_boleto_nosso_numero
          and transaction.bank_slip_our_number = new.gateway_boleto_nosso_numero
          and transaction.bank_slip_digitable_line
            = new.gateway_boleto_linha_digitavel
          and transaction.bank_slip_barcode = new.gateway_boleto_codigo_barras
          and round(transaction.amount, 2) = round(v_job.expected_amount, 2)
          and transaction.origin_polo_id = new.polo_id
          and transaction.issuer_polo_id = new.gateway_issuer_polo_id
          and transaction.installments = coalesce(new.gateway_installments, 1)
          and transaction.pix_payload is not distinct from new.gateway_pix_payload
          and transaction.pix_encoded_image
            is not distinct from new.gateway_pix_encoded_image);
  end if;
  if old.gateway_provider is distinct from 'banese_card'
    or new.gateway_provider is distinct from 'banese_card'
    or old.gateway_environment is distinct from v_job.environment
    or new.gateway_environment is distinct from v_job.environment
    or old.gateway_payment_method is distinct from 'BOLETO'
    or new.gateway_payment_method is distinct from 'BOLETO'
    or old.gateway_boleto_convenio is distinct from v_job.convenio
    or new.gateway_boleto_convenio is distinct from v_job.convenio
    or regexp_replace(coalesce(old.gateway_boleto_agencia, ''), '\D', '', 'g')
      is distinct from v_job.agency
    or regexp_replace(coalesce(new.gateway_boleto_agencia, ''), '\D', '', 'g')
      is distinct from v_job.agency
    or v_paid_fields_changed and not v_paid_transition
    or to_jsonb(new) - (v_gateway_fields || case when v_paid_transition
        then v_paid_fields else array[]::text[] end)
      is distinct from to_jsonb(old) - (v_gateway_fields || case
        when v_paid_transition then v_paid_fields else array[]::text[] end)
  then
    raise exception 'Identidade EAD bloqueada durante reemissao BolePix.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

create trigger aa_guard_banese_ead_reissue_receivable_route
before update on public.contas_receber
for each row execute function public.guard_banese_ead_reissue_receivable_route();

create or replace function public.guard_banese_ead_reissue_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_candidate_nosso_numero text;
begin
  if new.receivable_id is null then return new; end if;
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.receivable_id = new.receivable_id and job.status = 'REISSUING';
  if not found then return new; end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable where receivable.id = new.receivable_id;
  v_candidate_nosso_numero := new.remote_payment_id;
  if new.provider_code is distinct from 'banese_card'
    or new.environment is distinct from v_job.environment
    or new.payment_method is distinct from 'BOLETO'
    or round(new.amount, 2) is distinct from round(v_job.expected_amount, 2)
    or new.origin_polo_id is distinct from v_receivable.polo_id
    or new.issuer_polo_id is distinct from v_receivable.gateway_issuer_polo_id
    or coalesce(v_candidate_nosso_numero, '') !~ '^[0-9]{9}$'
    or new.bank_slip_our_number is distinct from v_candidate_nosso_numero
    or v_candidate_nosso_numero = v_job.canceled_nosso_numero
    or (v_receivable.gateway_boleto_nosso_numero is not null
      and v_receivable.gateway_boleto_nosso_numero <> v_candidate_nosso_numero)
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from v_job.environment
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_status is distinct from 'CREATING'
    or v_receivable.gateway_creation_token is null
    or v_receivable.gateway_payment_id is not null
    or not (
      (v_receivable.gateway_submission_channel is null
        and v_receivable.gateway_submission_status is null)
      or (v_receivable.gateway_submission_channel = 'API'
        and v_receivable.gateway_submission_status = 'API_AMBIGUOUS')
    )
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null or v_receivable.valor_pago is not null
    or coalesce(new.remote_status, '') not in ('PENDING', 'REGISTERED', 'PAID')
    or new.installments is distinct from coalesce(v_receivable.gateway_installments, 1)
    or coalesce(new.bank_slip_digitable_line, '') !~ '^0479[0-9]{43}$'
    or coalesce(new.bank_slip_barcode, '') !~ '^0479[0-9]{40}$'
    or substring(new.bank_slip_barcode from 31 for 9)
      <> v_candidate_nosso_numero
    or concat(substring(new.bank_slip_digitable_line from 1 for 4),
      substring(new.bank_slip_digitable_line from 33 for 1),
      substring(new.bank_slip_digitable_line from 34 for 14),
      substring(new.bank_slip_digitable_line from 5 for 5),
      substring(new.bank_slip_digitable_line from 11 for 10),
      substring(new.bank_slip_digitable_line from 22 for 10))
      <> new.bank_slip_barcode
    or (nullif(btrim(coalesce(new.pix_payload, '')), '') is null)
      <> (nullif(btrim(coalesce(new.pix_encoded_image, '')), '') is null)
    or exists (select 1 from public.banese_ead_title_replacement_archive archive
      where archive.environment = v_job.environment
        and archive.convenio = v_job.convenio
        and archive.canceled_nosso_numero = v_candidate_nosso_numero)
    or not exists (select 1
      from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id)
    or not exists (select 1 from public.banese_reconciliation_queue queue
      where queue.receivable_id = new.receivable_id
        and queue.state = 'REPLACEMENT_FENCED')
    or exists (select 1 from public.payment_gateway_transactions transaction
      where transaction.receivable_id = new.receivable_id)
  then
    raise exception 'Transacao concorrente bloqueada na reemissao BolePix EAD.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

create trigger aa_guard_banese_ead_reissue_transaction_insert
before insert on public.payment_gateway_transactions
for each row execute function public.guard_banese_ead_reissue_transaction_insert();

create or replace function public.mark_banese_ead_title_cancel_mutation_intent(
  p_job_id uuid,
  p_lease_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_receivable_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado a intencao de baixa Pix EAD.'
      using errcode = '42501';
  end if;
  select job.receivable_id into v_receivable_id
  from public.banese_ead_title_replacement_jobs job where job.id = p_job_id;
  if not found then raise exception 'Job BolePix EAD inexistente.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receivable_id::text, 0));
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id for update;
  if v_job.status <> 'CANCEL_FENCED'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now()
    or v_job.cancel_mutation_intent_count >= 20
    or exists (select 1 from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id)
    or not exists (select 1 from public.banese_reconciliation_queue queue
      where queue.receivable_id = v_job.receivable_id
        and queue.state = 'REPLACEMENT_FENCED') then
    raise exception 'Intencao de baixa BolePix EAD bloqueada.'
      using errcode = 'PT409';
  end if;
  update public.banese_ead_title_replacement_jobs
  set cancel_mutation_intent_at = pg_catalog.clock_timestamp(),
      cancel_mutation_intent_count = cancel_mutation_intent_count + 1,
      lease_until = now() + interval '3 minutes', updated_at = now()
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('recorded', true, 'jobId', v_job.id,
    'intentAt', v_job.cancel_mutation_intent_at);
end;
$function$;

create or replace function public.persist_banese_ead_title_pix_before_cancel(
  p_job_id uuid,
  p_lease_token uuid,
  p_pix_payload text,
  p_pix_encoded_image text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_receivable_id uuid;
  v_transaction_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado a persistencia Pix EAD.' using errcode = '42501';
  end if;
  if length(coalesce(p_pix_payload, '')) not between 20 and 4096
    or p_pix_payload !~ '^000201'
    or p_pix_payload !~ '6304[0-9A-Fa-f]{4}$'
    or length(coalesce(p_pix_encoded_image, '')) not between 100 and 1500000
    or p_pix_encoded_image !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
    raise exception 'Par Pix oficial invalido para persistencia EAD.';
  end if;
  select job.receivable_id into v_receivable_id
  from public.banese_ead_title_replacement_jobs job where job.id = p_job_id;
  if not found then raise exception 'Job BolePix EAD inexistente.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receivable_id::text, 0));
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id for update;
  if v_job.status <> 'CANCEL_FENCED'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now()
    or exists (select 1 from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id) then
    raise exception 'Lease invalida ao persistir Pix EAD.' using errcode = 'PT409';
  end if;
  select receivable.* into strict v_receivable
  from public.contas_receber receivable
  where receivable.id = v_job.receivable_id for update;
  if v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from v_job.environment
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_status is distinct from 'PENDING'
    or v_receivable.gateway_payment_id is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_nosso_numero
      is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_convenio is distinct from v_job.convenio
    or regexp_replace(coalesce(v_receivable.gateway_boleto_agencia, ''),
      '\D', '', 'g') is distinct from v_job.agency
    or round(v_receivable.valor, 2) is distinct from round(v_job.expected_amount, 2)
    or v_receivable.data_vencimento is distinct from v_job.expected_due_date
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null or v_receivable.valor_pago is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '') is not null
  then raise exception 'Recebivel divergiu antes de persistir Pix oficial.'; end if;
  select count(*) into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction_count <> 1 then
    raise exception 'Titulo recuperado nao possui transacao canonica unica.';
  end if;
  select transaction.* into v_transaction
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id for update;
  if v_transaction.provider_code is distinct from 'banese_card'
    or v_transaction.environment is distinct from v_job.environment
    or v_transaction.payment_method is distinct from 'BOLETO'
    or v_transaction.remote_status is distinct from 'PENDING'
    or v_transaction.remote_payment_id is distinct from v_job.canceled_nosso_numero
    or v_transaction.bank_slip_our_number is distinct from v_job.canceled_nosso_numero
    or round(v_transaction.amount, 2) is distinct from round(v_job.expected_amount, 2)
    or nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is not null
  then raise exception 'Transacao divergiu antes de persistir Pix oficial.'; end if;
  if not exists (select 1 from public.banese_reconciliation_queue queue
    where queue.receivable_id = v_receivable.id
      and queue.state = 'REPLACEMENT_FENCED') then
    raise exception 'Fila EAD perdeu o fence antes da persistencia Pix.';
  end if;
  update public.banese_ead_title_replacement_jobs
  set status = 'RECOVERING_PIX', lease_until = now() + interval '3 minutes',
      updated_at = now()
  where id = v_job.id;
  update public.contas_receber
  set gateway_pix_payload = p_pix_payload,
      gateway_pix_encoded_image = p_pix_encoded_image,
      gateway_synced_at = v_now, gateway_last_error = null, updated_at = v_now
  where id = v_receivable.id;
  update public.payment_gateway_transactions
  set pix_payload = p_pix_payload, pix_encoded_image = p_pix_encoded_image,
      remote_status = 'PENDING', last_error = null,
      synced_at = v_now, updated_at = v_now
  where id = v_transaction.id;
  return jsonb_build_object('persisted', true, 'jobId', v_job.id,
    'receivableId', v_receivable.id);
end;
$function$;

revoke all on function public.guard_banese_ead_reissue_receivable_route()
  from public, anon, authenticated;
revoke all on function public.guard_banese_ead_reissue_transaction_insert()
  from public, anon, authenticated;
revoke all on function public.mark_banese_ead_title_cancel_mutation_intent(
  uuid,uuid) from public, anon, authenticated;
revoke all on function public.persist_banese_ead_title_pix_before_cancel(
  uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.mark_banese_ead_title_cancel_mutation_intent(
  uuid,uuid) to service_role;
grant execute on function public.persist_banese_ead_title_pix_before_cancel(
  uuid,uuid,text,text) to service_role;

commit;
