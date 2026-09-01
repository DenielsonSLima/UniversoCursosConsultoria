begin;

create or replace function public.begin_banese_ead_title_cancel(
  p_job_id uuid,
  p_lease_token uuid,
  p_expected_receivable_updated_at timestamptz
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
  v_inscription public.inscricoes_online%rowtype;
  v_queue public.banese_reconciliation_queue%rowtype;
  v_transaction_count integer;
  v_inscription_count integer;
  v_receivable_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado ao fence de substituicao BolePix EAD.'
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
  if not found or v_job.status <> 'PROCESSING'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now() then
    raise exception 'Lease invalida para cancelar BolePix EAD.' using errcode = 'PT409';
  end if;
  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = v_job.receivable_id for update;
  if not found
    or v_receivable.updated_at is distinct from p_expected_receivable_updated_at
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from v_job.environment
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
    or v_receivable.gateway_boleto_nosso_numero
      is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_payment_id is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_convenio is distinct from v_job.convenio
    or regexp_replace(coalesce(v_receivable.gateway_boleto_agencia, ''),
      '\D', '', 'g') is distinct from v_job.agency
    or round(v_receivable.valor, 2) is distinct from round(v_job.expected_amount, 2)
    or v_receivable.data_vencimento is distinct from v_job.expected_due_date
    or coalesce(v_receivable.gateway_boleto_linha_digitavel, '') !~ '^0479[0-9]{43}$'
    or coalesce(v_receivable.gateway_boleto_codigo_barras, '') !~ '^0479[0-9]{40}$'
    or concat(substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
      substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
      substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
      substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
      substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
      substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10))
      is distinct from v_receivable.gateway_boleto_codigo_barras
    or substring(v_receivable.gateway_boleto_codigo_barras from 31 for 9)
      is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_issued_at is null
    or jsonb_typeof(v_receivable.gateway_financial_terms) is distinct from 'object'
    or v_receivable.gateway_financial_terms_confirmed_at is null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '') is not null
    or exists (select 1 from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id)
    or not exists (
      select 1 from public.matriculas enrollment
      join public.turmas class on class.id = enrollment.turma_id
      join public.cursos course on course.id = class.curso_id
      where enrollment.id = v_receivable.matricula_id
        and enrollment.aluno_id = v_receivable.cliente_id
        and class.id = v_receivable.turma_id
        and upper(coalesce(course.modalidade, '')) = 'EAD'
    )
    or not exists (
      select 1 from public.payment_gateway_routes route
      where upper(route.modalidade) = 'EAD'
        and route.payment_method = 'BOLETO'
        and route.environment = v_job.environment
        and route.provider_code = 'banese_card'
        and route.enabled
    ) then
    raise exception 'Cobranca EAD mudou antes do fence de cancelamento.'
      using errcode = 'PT409';
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction_count <> 1 then
    raise exception 'Transacao EAD mudou antes do fence de cancelamento.';
  end if;
  select transaction.* into v_transaction
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id for update;
  if v_transaction.provider_code is distinct from 'banese_card'
    or v_transaction.environment is distinct from v_job.environment
    or v_transaction.payment_method is distinct from 'BOLETO'
    or v_transaction.remote_payment_id is distinct from v_job.canceled_nosso_numero
    or v_transaction.bank_slip_our_number is distinct from v_job.canceled_nosso_numero
    or v_transaction.bank_slip_digitable_line
      is distinct from v_receivable.gateway_boleto_linha_digitavel
    or v_transaction.bank_slip_barcode
      is distinct from v_receivable.gateway_boleto_codigo_barras
    or round(v_transaction.amount, 2) is distinct from round(v_job.expected_amount, 2)
    or upper(coalesce(v_transaction.remote_status, '')) not in ('PENDING', 'REGISTERED')
    or v_transaction.origin_polo_id is distinct from v_receivable.polo_id
    or v_transaction.issuer_polo_id is distinct from v_receivable.gateway_issuer_polo_id
    or nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is not null then
    raise exception 'Identidade transacional EAD divergiu antes do cancelamento.';
  end if;

  select count(*) into v_inscription_count
  from public.inscricoes_online inscription
  where inscription.matricula_id = v_receivable.matricula_id
    or inscription.receivable_id = v_receivable.id
    or (inscription.gateway_provider = 'banese_card'
      and inscription.gateway_environment = v_job.environment
      and inscription.gateway_payment_id = v_job.canceled_nosso_numero);
  if v_inscription_count > 1 then
    raise exception 'Projecoes EAD mudaram antes do cancelamento.';
  elsif v_inscription_count = 0 and v_transaction.inscricao_online_id is not null then
    raise exception 'Transacao EAD aponta para inscricao inexistente.';
  elsif v_inscription_count = 1 then
    select inscription.* into v_inscription
    from public.inscricoes_online inscription
    where inscription.matricula_id = v_receivable.matricula_id
      or inscription.receivable_id = v_receivable.id
      or (inscription.gateway_provider = 'banese_card'
        and inscription.gateway_environment = v_job.environment
        and inscription.gateway_payment_id = v_job.canceled_nosso_numero)
    for update;
    if v_inscription.matricula_id is distinct from v_receivable.matricula_id
      or v_inscription.receivable_id is distinct from v_receivable.id
      or v_inscription.aluno_id is distinct from v_receivable.cliente_id
      or v_inscription.turma_id is distinct from v_receivable.turma_id
      or round(v_inscription.valor, 2) is distinct from round(v_receivable.valor, 2)
      or v_inscription.status is distinct from 'AGUARDANDO_PAGAMENTO'
      or v_inscription.gateway_provider is distinct from 'banese_card'
      or v_inscription.gateway_environment is distinct from v_job.environment
      or v_inscription.gateway_payment_id is distinct from v_job.canceled_nosso_numero
      or v_inscription.gateway_payment_link_id is not null
      or v_inscription.asaas_payment_id is not null
      or v_inscription.asaas_payment_link_id is not null
      or v_transaction.inscricao_online_id is distinct from v_inscription.id then
      raise exception 'Inscricao EAD divergiu antes do cancelamento.';
    end if;
  end if;

  select queue.* into v_queue from public.banese_reconciliation_queue queue
  where queue.receivable_id = v_receivable.id for update;
  if found and (
    v_queue.environment is distinct from v_job.environment
    or v_queue.modality is distinct from 'EAD'
    or v_queue.state in ('DONE', 'QUARANTINED', 'REPLACEMENT_FENCED')
    or (v_queue.state = 'LEASED' and v_queue.lease_until > now())
  ) then
    raise exception 'Fila de conciliacao impede a substituicao EAD.'
      using errcode = 'PT409';
  end if;
  insert into public.banese_reconciliation_queue (
    receivable_id, environment, modality, priority, state,
    next_check_at, lease_run_id, lease_until, issued_at
  ) values (
    v_receivable.id, v_job.environment, 'EAD', 10, 'REPLACEMENT_FENCED',
    null, null, null, coalesce(v_receivable.gateway_boleto_issued_at, now())
  ) on conflict (receivable_id) do update
  set state = 'REPLACEMENT_FENCED', next_check_at = null,
      lease_run_id = null, lease_until = null, updated_at = now();
  update public.banese_ead_title_replacement_jobs
  set status = 'CANCEL_FENCED',
      expected_receivable_updated_at = p_expected_receivable_updated_at,
      lease_until = now() + interval '3 minutes', updated_at = now()
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('fenced', true, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token, 'receivableId', v_job.receivable_id);
end;
$function$;

create or replace function public.release_banese_ead_title_cancel_for_pix(
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
    raise exception 'Acesso negado ao liberar fence BolePix EAD.'
      using errcode = '42501';
  end if;
  select job.receivable_id into v_receivable_id
  from public.banese_ead_title_replacement_jobs job where job.id = p_job_id;
  if not found then raise exception 'Job BolePix EAD inexistente.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receivable_id::text, 0));
  select job.* into v_job from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id for update;
  if not found or v_job.status <> 'CANCEL_FENCED'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now()
    or exists (select 1 from public.banese_ead_title_replacement_archive archive
      where archive.job_id = v_job.id) then
    raise exception 'Fence BolePix EAD nao pode ser liberado.' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.banese_reconciliation_queue queue
    where queue.receivable_id = v_job.receivable_id
      and queue.state = 'REPLACEMENT_FENCED') then
    raise exception 'Fila EAD perdeu o fence da substituicao.';
  end if;
  update public.banese_ead_title_replacement_jobs
  set status = 'RECOVERING_PIX', lease_until = now() + interval '3 minutes',
      updated_at = now()
  where id = v_job.id returning * into v_job;
  return jsonb_build_object('released', true, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token);
end;
$function$;

revoke all on function public.begin_banese_ead_title_cancel(uuid,uuid,timestamptz)
  from public, anon, authenticated;
revoke all on function public.release_banese_ead_title_cancel_for_pix(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.begin_banese_ead_title_cancel(uuid,uuid,timestamptz)
  to service_role;
grant execute on function public.release_banese_ead_title_cancel_for_pix(uuid,uuid)
  to service_role;

commit;
