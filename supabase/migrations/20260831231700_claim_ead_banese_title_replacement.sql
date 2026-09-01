begin;

create or replace function public.enqueue_banese_ead_title_replacement(
  p_receivable_id uuid,
  p_expected_nosso_numero text,
  p_authorized_reason text,
  p_requested_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_receivable public.contas_receber%rowtype;
  v_transaction public.payment_gateway_transactions%rowtype;
  v_inscription public.inscricoes_online%rowtype;
  v_job public.banese_ead_title_replacement_jobs%rowtype;
  v_transaction_count integer;
  v_inscription_count integer;
  v_agency text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado a substituicao BolePix EAD.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null
    or coalesce(p_expected_nosso_numero, '') !~ '^[0-9]{9}$'
    or length(btrim(coalesce(p_authorized_reason, ''))) not between 12 and 200 then
    raise exception 'Pedido de substituicao BolePix EAD invalido.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_receivable_id::text, 0));
  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id for update;
  if not found then raise exception 'Cobranca EAD nao encontrada.'; end if;
  v_agency := regexp_replace(coalesce(v_receivable.gateway_boleto_agencia, ''),
    '\D', '', 'g');
  if v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment not in ('sandbox', 'production')
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_submission_channel is distinct from 'API'
    or v_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
    or v_receivable.gateway_cnab_file_id is not null
    or v_receivable.asaas_payment_id is not null
    or v_receivable.asaas_payment_link_id is not null
    or v_receivable.asaas_installment_id is not null
    or v_receivable.nosso_numero_asaas is not null
    or v_receivable.asaas_invoice_url is not null
    or v_receivable.asaas_bank_slip_url is not null
    or v_receivable.asaas_transaction_receipt_url is not null
    or v_receivable.asaas_status is not null
    or v_receivable.asaas_synced_at is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_channel is not null
    or v_receivable.gateway_settlement_source is not null
    or v_receivable.gateway_settlement_evidence is not null
    or v_receivable.gateway_settlement_recorded_at is not null
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null or v_receivable.valor_pago is not null
    or upper(coalesce(v_receivable.gateway_status, '')) not in ('PENDING', 'REGISTERED')
    or v_receivable.gateway_boleto_nosso_numero is distinct from p_expected_nosso_numero
    or v_receivable.gateway_payment_id is distinct from p_expected_nosso_numero
    or coalesce(v_receivable.gateway_boleto_convenio, '') !~ '^[0-9]{1,20}$'
    or v_agency !~ '^[0-9]{3}$' or v_agency = '000'
    or coalesce(v_receivable.gateway_boleto_linha_digitavel, '') !~ '^0479[0-9]{43}$'
    or coalesce(v_receivable.gateway_boleto_codigo_barras, '') !~ '^0479[0-9]{40}$'
    or substring(v_receivable.gateway_boleto_codigo_barras from 31 for 9)
      <> p_expected_nosso_numero
    or concat(substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
      substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
      substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
      substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
      substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
      substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10))
      <> v_receivable.gateway_boleto_codigo_barras
    or v_receivable.gateway_boleto_issued_at is null
    or jsonb_typeof(v_receivable.gateway_financial_terms) is distinct from 'object'
    or v_receivable.gateway_financial_terms_confirmed_at is null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '') is not null
    or not exists (
      select 1 from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      join public.cursos course on course.id = class.curso_id
      where enrollment.id = v_receivable.matricula_id
        and enrollment.aluno_id = v_receivable.cliente_id
        and class.id = v_receivable.turma_id
        and upper(coalesce(course.modalidade, '')) = 'EAD'
    ) then
    raise exception 'Cobranca nao e um BolePix EAD elegivel para substituicao.';
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction_count <> 1 then
    raise exception 'Cobranca EAD nao possui uma unica transacao canonica.';
  end if;
  select transaction.* into v_transaction
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id for update;
  if v_transaction.provider_code is distinct from 'banese_card'
    or v_transaction.environment is distinct from v_receivable.gateway_environment
    or v_transaction.payment_method is distinct from 'BOLETO'
    or v_transaction.remote_payment_id is distinct from p_expected_nosso_numero
    or v_transaction.bank_slip_our_number is distinct from p_expected_nosso_numero
    or round(v_transaction.amount, 2) is distinct from round(v_receivable.valor, 2)
    or v_transaction.bank_slip_digitable_line
      is distinct from v_receivable.gateway_boleto_linha_digitavel
    or v_transaction.bank_slip_barcode
      is distinct from v_receivable.gateway_boleto_codigo_barras
    or upper(coalesce(v_transaction.remote_status, '')) not in ('PENDING', 'REGISTERED')
    or v_transaction.origin_polo_id is distinct from v_receivable.polo_id
    or v_transaction.issuer_polo_id is distinct from v_receivable.gateway_issuer_polo_id
    or nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is not null then
    raise exception 'Transacao Banese diverge da cobranca EAD solicitada.';
  end if;

  select count(*) into v_inscription_count
  from public.inscricoes_online inscription
  where inscription.matricula_id = v_receivable.matricula_id
    or inscription.receivable_id = v_receivable.id
    or (inscription.gateway_provider = 'banese_card'
      and inscription.gateway_environment = v_receivable.gateway_environment
      and inscription.gateway_payment_id = p_expected_nosso_numero);
  if v_inscription_count > 1 then
    raise exception 'Cobranca EAD possui projecoes de inscricao conflitantes.';
  elsif v_inscription_count = 0 and v_transaction.inscricao_online_id is not null then
    raise exception 'Transacao EAD aponta para inscricao inexistente.';
  elsif v_inscription_count = 1 then
    select inscription.* into v_inscription
    from public.inscricoes_online inscription
    where inscription.matricula_id = v_receivable.matricula_id
      or inscription.receivable_id = v_receivable.id
      or (inscription.gateway_provider = 'banese_card'
        and inscription.gateway_environment = v_receivable.gateway_environment
        and inscription.gateway_payment_id = p_expected_nosso_numero)
    for update;
    if v_inscription.matricula_id is distinct from v_receivable.matricula_id
      or v_inscription.receivable_id is distinct from v_receivable.id
      or v_inscription.aluno_id is distinct from v_receivable.cliente_id
      or v_inscription.turma_id is distinct from v_receivable.turma_id
      or round(v_inscription.valor, 2) is distinct from round(v_receivable.valor, 2)
      or v_inscription.status is distinct from 'AGUARDANDO_PAGAMENTO'
      or v_inscription.gateway_provider is distinct from 'banese_card'
      or v_inscription.gateway_environment
        is distinct from v_receivable.gateway_environment
      or v_inscription.gateway_payment_id is distinct from p_expected_nosso_numero
      or v_inscription.gateway_payment_link_id is not null
      or v_inscription.asaas_payment_id is not null
      or v_inscription.asaas_payment_link_id is not null
      or v_transaction.inscricao_online_id is distinct from v_inscription.id then
      raise exception 'Inscricao online diverge da cobranca EAD solicitada.';
    end if;
  end if;

  insert into public.banese_ead_title_replacement_jobs (
    receivable_id, environment, convenio, agency, canceled_nosso_numero,
    expected_amount, expected_due_date, expected_receivable_updated_at,
    authorized_reason, requested_by
  ) values (
    v_receivable.id, v_receivable.gateway_environment,
    v_receivable.gateway_boleto_convenio, v_agency, p_expected_nosso_numero,
    v_receivable.valor, v_receivable.data_vencimento, v_receivable.updated_at,
    btrim(p_authorized_reason), p_requested_by
  )
  on conflict (receivable_id, canceled_nosso_numero) do update
  set authorized_reason = excluded.authorized_reason,
      requested_by = coalesce(excluded.requested_by,
        public.banese_ead_title_replacement_jobs.requested_by),
      updated_at = now()
  where public.banese_ead_title_replacement_jobs.status = 'QUEUED'
  returning * into v_job;
  if v_job.id is null then
    raise exception 'Substituicao EAD ja processada ou exige revisao manual.';
  end if;
  return jsonb_build_object('jobId', v_job.id, 'status', v_job.status,
    'receivableId', v_job.receivable_id,
    'nossoNumero', v_job.canceled_nosso_numero);
end;
$function$;

create or replace function public.claim_banese_ead_title_replacement()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.banese_ead_title_replacement_jobs%rowtype;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado ao worker de substituicao BolePix EAD.'
      using errcode = '42501';
  end if;
  with exhausted as (
    update public.banese_ead_title_replacement_jobs
    set status = case when status in ('CANCEL_FENCED', 'REISSUING')
          then 'REVIEW_FENCED' else 'REVIEW_REQUIRED' end,
        lease_token = null, lease_until = null,
        last_error_code = 'REPLACEMENT_ATTEMPTS_EXHAUSTED', updated_at = now()
    where attempt_count >= 20
      and (status = 'QUEUED' or lease_until <= now())
      and status in (
        'QUEUED', 'PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING'
      )
    returning receivable_id, status
  )
  update public.banese_reconciliation_queue queue
  set state = 'READY', next_check_at = now(), lease_run_id = null,
      lease_until = null, updated_at = now()
  where queue.state = 'REPLACEMENT_FENCED' and exists (
    select 1 from exhausted
    where exhausted.receivable_id = queue.receivable_id
      and exhausted.status = 'REVIEW_REQUIRED'
  );
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.attempt_count < 20 and (
    job.status = 'QUEUED'
    or (job.status in (
        'PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING'
      )
      and job.lease_until <= now())
  )
  order by job.created_at, job.id
  for update skip locked limit 1;
  if not found then return jsonb_build_object('claimed', false); end if;
  update public.banese_ead_title_replacement_jobs
  set status = case when v_job.status = 'QUEUED' then 'PROCESSING'
        else v_job.status end,
      attempt_count = attempt_count + 1,
      lease_token = gen_random_uuid(), lease_until = now() + interval '3 minutes',
      updated_at = now()
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('claimed', true, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token, 'status', v_job.status,
    'receivableId', v_job.receivable_id, 'environment', v_job.environment,
    'convenio', v_job.convenio, 'agency', v_job.agency,
    'nossoNumero', v_job.canceled_nosso_numero);
end;
$function$;

revoke all on function public.enqueue_banese_ead_title_replacement(uuid,text,text,uuid)
  from public, anon, authenticated;
revoke all on function public.claim_banese_ead_title_replacement()
  from public, anon, authenticated;
grant execute on function public.enqueue_banese_ead_title_replacement(uuid,text,text,uuid)
  to service_role;
grant execute on function public.claim_banese_ead_title_replacement()
  to service_role;

commit;
