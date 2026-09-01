begin;

alter table public.banese_reconciliation_queue
  drop constraint banese_reconciliation_queue_state_check;
alter table public.banese_reconciliation_queue
  add constraint banese_reconciliation_queue_state_check check (state in (
    'READY', 'LEASED', 'DONE', 'QUARANTINED', 'REPLACEMENT_FENCED'
  ));

create or replace function public.banese_ead_replacement_bypass_valid(
  p_receivable_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.banese_ead_title_replacement_jobs job
    join public.banese_ead_title_replacement_archive archive
      on archive.job_id = job.id and archive.receivable_id = job.receivable_id
    join public.banese_reconciliation_queue queue
      on queue.receivable_id = job.receivable_id
    where job.id::text = current_setting('app.banese_ead_replacement_job', true)
      and job.lease_token::text =
        current_setting('app.banese_ead_replacement_lease', true)
      and job.receivable_id = p_receivable_id
      and job.status = 'CANCEL_FENCED'
      and job.lease_until > now()
      and archive.environment = job.environment
      and archive.convenio = job.convenio
      and archive.canceled_nosso_numero = job.canceled_nosso_numero
      and queue.state = 'REPLACEMENT_FENCED'
  );
$function$;

create or replace function public.guard_banese_ead_replacement_receivable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1 from public.banese_ead_title_replacement_jobs job
    where job.receivable_id = old.id
      and job.status in ('CANCEL_FENCED', 'REVIEW_FENCED')
  ) then
    return new;
  end if;
  if not public.banese_ead_replacement_bypass_valid(old.id)
    or to_jsonb(new) - array[
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
      'gateway_cnab_file_id', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
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
      'gateway_cnab_file_id', 'updated_at'
    ]
    or new.gateway_payment_id is not null
    or new.gateway_customer_id is not null
    or new.gateway_payment_link_id is not null
    or new.gateway_installment_id is not null
    or new.gateway_status is not null
    or new.gateway_invoice_url is not null
    or new.gateway_bank_slip_url is not null
    or new.gateway_pix_payload is not null
    or new.gateway_pix_encoded_image is not null
    or new.gateway_transaction_receipt_url is not null
    or new.gateway_fee_value is not null or new.gateway_net_value is not null
    or new.gateway_synced_at is not null or new.gateway_last_error is not null
    or new.gateway_boleto_linha_digitavel is not null
    or new.gateway_boleto_codigo_barras is not null
    or new.gateway_boleto_nosso_numero is not null
    or new.gateway_boleto_issued_at is not null
    or new.gateway_financial_terms is not null
    or new.gateway_financial_terms_confirmed_at is not null
    or new.gateway_creation_token is not null
    or new.gateway_submission_channel is not null
    or new.gateway_submission_status is not null
    or new.gateway_cnab_file_id is not null
    or new.updated_at is null or new.updated_at <= old.updated_at
  then
    raise exception 'Cobranca bloqueada durante substituicao BolePix EAD.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

drop trigger if exists a_guard_banese_ead_replacement_receivable
  on public.contas_receber;
create trigger a_guard_banese_ead_replacement_receivable
before update on public.contas_receber
for each row execute function public.guard_banese_ead_replacement_receivable();

create or replace function public.preserve_banese_ead_replacement_queue_fence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.banese_ead_title_replacement_jobs job
    where job.receivable_id = new.id
      and job.status in (
        'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING', 'REVIEW_FENCED'
      )
  ) then
    update public.banese_reconciliation_queue
    set state = 'REPLACEMENT_FENCED', next_check_at = null,
        lease_run_id = null, lease_until = null, updated_at = now()
    where receivable_id = new.id;
  end if;
  return new;
end;
$function$;

drop trigger if exists zz_preserve_banese_ead_replacement_queue_fence
  on public.contas_receber;
create trigger zz_preserve_banese_ead_replacement_queue_fence
after insert or update of gateway_boleto_nosso_numero, gateway_status,
  gateway_submission_status, status
on public.contas_receber
for each row execute function public.preserve_banese_ead_replacement_queue_fence();

create or replace function public.guard_banese_ead_replacement_new_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare v_job public.banese_ead_title_replacement_jobs%rowtype;
begin
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.receivable_id = new.id and job.status = 'REISSUING';
  if not found or new.gateway_boleto_nosso_numero is null then return new; end if;
  if new.gateway_boleto_nosso_numero !~ '^[0-9]{9}$'
    or new.gateway_boleto_nosso_numero = v_job.canceled_nosso_numero
    or exists (select 1
      from public.banese_ead_title_replacement_archive archive
      where archive.environment = v_job.environment
        and archive.convenio = v_job.convenio
        and archive.canceled_nosso_numero = new.gateway_boleto_nosso_numero)
    or exists (select 1
      from public.payment_gateway_transactions transaction
      where transaction.provider_code = 'banese_card'
        and transaction.environment = v_job.environment
        and (lpad(regexp_replace(coalesce(transaction.remote_payment_id, ''),
          '\D', '', 'g'), 9, '0') = new.gateway_boleto_nosso_numero
          or lpad(regexp_replace(coalesce(transaction.bank_slip_our_number, ''),
            '\D', '', 'g'), 9, '0') = new.gateway_boleto_nosso_numero)
        and transaction.receivable_id is distinct from new.id)
  then
    raise exception 'Nosso Numero de substituicao Banese ja foi utilizado.'
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

drop trigger if exists b_guard_banese_ead_replacement_new_number
  on public.contas_receber;
create trigger b_guard_banese_ead_replacement_new_number
before update of gateway_boleto_nosso_numero on public.contas_receber
for each row execute function public.guard_banese_ead_replacement_new_number();

create or replace function public.guard_banese_ead_replacement_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if new.receivable_id is not null and exists (
      select 1 from public.banese_ead_title_replacement_jobs job
      where job.receivable_id = new.receivable_id
        and job.status in ('CANCEL_FENCED', 'REVIEW_FENCED')
    ) then
      raise exception 'Transacao bloqueada durante substituicao BolePix EAD.'
        using errcode = 'PT409';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1
      from public.banese_ead_title_replacement_archive archive
      where archive.source_transaction_id = old.id)
      or old.receivable_id is not null and exists (
        select 1 from public.banese_ead_title_replacement_jobs job
        where job.receivable_id = old.receivable_id
          and job.status in ('CANCEL_FENCED', 'REVIEW_FENCED')
      ) then
      raise exception 'Transacao bloqueada durante substituicao BolePix EAD.'
        using errcode = 'PT409';
    end if;
    return old;
  end if;
  if exists (select 1
    from public.banese_ead_title_replacement_archive archive
    where archive.source_transaction_id = old.id)
    and (old.receivable_id is null
      or not public.banese_ead_replacement_bypass_valid(old.receivable_id)) then
    raise exception 'Transacao arquivada de BolePix EAD e imutavel.'
      using errcode = '55000';
  end if;
  if old.receivable_id is null or not exists (
    select 1 from public.banese_ead_title_replacement_jobs job
    where job.receivable_id = old.receivable_id
      and job.status in ('CANCEL_FENCED', 'REVIEW_FENCED')
  ) then
    return new;
  end if;
  if not public.banese_ead_replacement_bypass_valid(old.receivable_id)
    or to_jsonb(new) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'receivable_id', 'remote_status', 'last_error', 'synced_at', 'updated_at'
    ]
    or new.receivable_id is not null
    or new.remote_status is distinct from 'CANCELED'
    or new.last_error is not null
    or new.synced_at is null or new.updated_at is null
    or new.synced_at is distinct from new.updated_at
    or new.updated_at <= old.updated_at
  then
    raise exception 'Transacao bloqueada durante substituicao BolePix EAD.'
      using errcode = 'PT409';
  end if;
  return new;
end;
$function$;

drop trigger if exists a_guard_banese_ead_replacement_transaction
  on public.payment_gateway_transactions;
create trigger a_guard_banese_ead_replacement_transaction
before insert or update or delete on public.payment_gateway_transactions
for each row execute function public.guard_banese_ead_replacement_transaction();

create or replace function public.enforce_receivable_gateway_submission_fence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if public.banese_ead_replacement_bypass_valid(old.id)
    and new.gateway_payment_id is null
    and new.gateway_payment_link_id is null
    and new.gateway_submission_channel is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_financial_terms is null
    and new.gateway_financial_terms_confirmed_at is null
    and new.gateway_boleto_issued_at is null
    and new.gateway_boleto_linha_digitavel is null
    and new.gateway_boleto_codigo_barras is null
    and new.gateway_invoice_url is null and new.gateway_bank_slip_url is null
  then
    return new;
  end if;
  if old.gateway_submission_channel is null
    and new.gateway_submission_channel is null
    and old.gateway_submission_status is null
    and new.gateway_submission_status is null
    and new.gateway_cnab_file_id is null
    and new.gateway_provider = 'banese_card'
    and (new.gateway_boleto_issued_at is not null
      or new.gateway_payment_id is not null
      or new.gateway_payment_link_id is not null
      or new.gateway_boleto_linha_digitavel is not null
      or new.gateway_boleto_codigo_barras is not null
      or new.gateway_invoice_url is not null
      or new.gateway_bank_slip_url is not null) then
    new.gateway_submission_channel := 'API';
    new.gateway_submission_status := 'API_REGISTERED';
  end if;
  if old.gateway_submission_channel is not null
    and new.gateway_submission_channel is distinct from old.gateway_submission_channel then
    raise exception 'O canal de registro externo do titulo nao pode ser trocado depois do claim.'
      using errcode = '23514';
  end if;
  if old.gateway_cnab_file_id is not null
    and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id then
    raise exception 'A remessa CNAB vinculada ao titulo e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_channel = 'CNAB' and (
    new.gateway_financial_terms is distinct from old.gateway_financial_terms
    or new.gateway_financial_terms_confirmed_at
      is distinct from old.gateway_financial_terms_confirmed_at) then
    raise exception 'O snapshot financeiro da remessa CNAB e imutavel.'
      using errcode = '23514';
  end if;
  if old.gateway_submission_status is not null
    and new.gateway_submission_status is distinct from old.gateway_submission_status
    and not coalesce(case old.gateway_submission_status
      when 'API_AMBIGUOUS' then new.gateway_submission_status = 'API_REGISTERED'
      when 'API_REGISTERED' then false
      when 'CNAB_GENERATED' then new.gateway_submission_status in
        ('CNAB_SENT', 'CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_SENT' then new.gateway_submission_status in
        ('CNAB_REGISTERED', 'CNAB_REJECTED')
      when 'CNAB_REGISTERED' then new.gateway_submission_status = 'CNAB_REJECTED'
      when 'CNAB_REJECTED' then new.gateway_submission_status = 'CNAB_REGISTERED'
      else false end, false) then
    raise exception 'Transicao invalida no fencing de registro externo do titulo.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

create or replace function public.preserve_online_inscription_terminal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.receivable_id is not null
    and public.banese_ead_replacement_bypass_valid(old.receivable_id)
    and to_jsonb(new) - array[
      'gateway_payment_id', 'gateway_customer_id',
      'gateway_payment_link_id', 'updated_at'
    ] is not distinct from to_jsonb(old) - array[
      'gateway_payment_id', 'gateway_customer_id',
      'gateway_payment_link_id', 'updated_at'
    ]
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.updated_at is not null and new.updated_at > old.updated_at
  then
    return new;
  end if;
  if old.matricula_id is not null
    and new.matricula_id is distinct from old.matricula_id then
    raise exception 'A identidade canonica da matricula em inscricoes_online e imutavel';
  end if;
  if old.receivable_id is not null
    and new.receivable_id is distinct from old.receivable_id then
    raise exception 'A identidade canonica do recebivel em inscricoes_online e imutavel';
  end if;
  if old.gateway_provider is not null
    and new.gateway_provider is distinct from old.gateway_provider then
    raise exception 'A identidade canonica do provedor em inscricoes_online e imutavel';
  end if;
  if old.gateway_environment is not null
    and new.gateway_environment is distinct from old.gateway_environment then
    raise exception 'A identidade canonica do ambiente em inscricoes_online e imutavel';
  end if;
  if old.gateway_payment_link_id is not null
    and new.gateway_payment_link_id is distinct from old.gateway_payment_link_id then
    raise exception 'A identidade canonica do link remoto em inscricoes_online e imutavel';
  end if;
  if old.gateway_payment_id is not null
    and new.gateway_payment_id is distinct from old.gateway_payment_id
    and not (
      new.gateway_payment_id is not null
      and
      old.gateway_provider = 'banese_card'
      and old.gateway_payment_id ~ '^[0-9]{1,9}$'
      and new.gateway_payment_id ~ '^[0-9]{1,9}$'
      and lpad(old.gateway_payment_id, 9, '0') =
        lpad(new.gateway_payment_id, 9, '0')
    )
    and not (
      coalesce(old.gateway_payment_link_id,
        case when old.gateway_provider = 'asaas'
          then old.asaas_payment_link_id else null end) is not null
      and old.gateway_payment_id = coalesce(old.gateway_payment_link_id,
        case when old.gateway_provider = 'asaas'
          then old.asaas_payment_link_id else null end)
      and new.gateway_payment_link_id = coalesce(
        old.gateway_payment_link_id, old.asaas_payment_link_id)
      and new.gateway_payment_id is not null
    ) then
    raise exception 'A identidade canonica do pagamento remoto em inscricoes_online e imutavel';
  end if;
  if old.asaas_payment_link_id is not null
    and new.asaas_payment_link_id is distinct from old.asaas_payment_link_id then
    raise exception 'A identidade canonica do link Asaas em inscricoes_online e imutavel';
  end if;
  if old.asaas_payment_id is not null
    and new.asaas_payment_id is distinct from old.asaas_payment_id
    and not (
      old.asaas_payment_link_id is not null
      and old.asaas_payment_id = old.asaas_payment_link_id
      and new.asaas_payment_link_id = old.asaas_payment_link_id
      and new.asaas_payment_id is not null
    ) then
    raise exception 'A identidade canonica do pagamento Asaas em inscricoes_online e imutavel';
  end if;
  if old.status = 'PAGO' and new.status <> 'PAGO' then
    new.status := 'PAGO';
  elsif old.status = 'CANCELADO' and new.status not in ('PAGO', 'CANCELADO') then
    new.status := 'CANCELADO';
    new.erro := coalesce(old.erro, new.erro);
  end if;
  if new.status = 'PAGO' then
    new.pago_em := coalesce(old.pago_em, new.pago_em, now());
    new.confirmado_em := coalesce(old.confirmado_em, new.confirmado_em, now());
    new.erro := null;
  end if;
  return new;
end;
$function$;

create or replace function public.guard_banese_ead_replacement_inscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable_id uuid := case when tg_op = 'DELETE'
    then old.receivable_id else coalesce(new.receivable_id, old.receivable_id) end;
  v_matricula_id uuid := case when tg_op = 'DELETE'
    then old.matricula_id else coalesce(new.matricula_id, old.matricula_id) end;
begin
  if not exists (
    select 1
    from public.banese_ead_title_replacement_jobs job
    join public.contas_receber receivable on receivable.id = job.receivable_id
    where job.status in ('CANCEL_FENCED', 'REVIEW_FENCED')
      and (job.receivable_id = v_receivable_id
        or receivable.matricula_id = v_matricula_id)
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE'
    and v_receivable_id is not null
    and public.banese_ead_replacement_bypass_valid(v_receivable_id)
    and to_jsonb(new) - array[
      'gateway_payment_id', 'gateway_customer_id',
      'gateway_payment_link_id', 'updated_at'
    ] is not distinct from to_jsonb(old) - array[
      'gateway_payment_id', 'gateway_customer_id',
      'gateway_payment_link_id', 'updated_at'
    ]
    and new.gateway_payment_id is null
    and new.gateway_customer_id is null
    and new.gateway_payment_link_id is null
    and new.updated_at is not null and new.updated_at > old.updated_at
  then
    return new;
  end if;
  raise exception 'Inscricao bloqueada durante substituicao BolePix EAD.'
    using errcode = 'PT409';
end;
$function$;

drop trigger if exists a_guard_banese_ead_replacement_inscription
  on public.inscricoes_online;
create trigger a_guard_banese_ead_replacement_inscription
before insert or update or delete on public.inscricoes_online
for each row execute function public.guard_banese_ead_replacement_inscription();

revoke all on function public.banese_ead_replacement_bypass_valid(uuid)
  from public, anon, authenticated;
revoke all on function public.guard_banese_ead_replacement_receivable()
  from public, anon, authenticated;
revoke all on function public.guard_banese_ead_replacement_transaction()
  from public, anon, authenticated;
revoke all on function public.guard_banese_ead_replacement_inscription()
  from public, anon, authenticated;
revoke all on function public.preserve_banese_ead_replacement_queue_fence()
  from public, anon, authenticated;
revoke all on function public.guard_banese_ead_replacement_new_number()
  from public, anon, authenticated;

commit;
