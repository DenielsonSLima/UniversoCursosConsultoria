begin;

create or replace function public.prepare_banese_ead_title_reissue(
  p_job_id uuid,
  p_lease_token uuid,
  p_confirmed_remote_status text,
  p_confirmed_situation_code integer,
  p_confirmed_at timestamptz,
  p_cancel_fingerprint text,
  p_already_canceled boolean,
  p_mutation_attempted boolean
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
  v_transaction_after public.payment_gateway_transactions%rowtype;
  v_inscription public.inscricoes_online%rowtype;
  v_inscription_after public.inscricoes_online%rowtype;
  v_transaction_count integer;
  v_inscription_count integer;
  v_now timestamptz := clock_timestamp();
  v_transaction_snapshot jsonb;
  v_inscription_snapshot jsonb;
  v_receivable_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado a preparacao da reemissao BolePix EAD.'
      using errcode = '42501';
  end if;
  if upper(coalesce(p_confirmed_remote_status, ''))
      not in ('CANCELED', 'CANCELLED')
    or p_confirmed_situation_code is distinct from 5
    or p_confirmed_at is null
    or p_confirmed_at < now() - interval '10 minutes'
    or p_confirmed_at > now() + interval '1 minute'
    or coalesce(p_cancel_fingerprint, '') !~ '^[0-9a-f]{64}$'
    or p_already_canceled is null or p_mutation_attempted is null
    or p_already_canceled = p_mutation_attempted then
    raise exception 'Baixa remota Banese nao confirmada.';
  end if;
  select job.receivable_id into v_receivable_id
  from public.banese_ead_title_replacement_jobs job where job.id = p_job_id;
  if not found then raise exception 'Job BolePix EAD inexistente.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receivable_id::text, 0));
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id for update;
  if not found or v_job.status <> 'CANCEL_FENCED'
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now() then
    raise exception 'Lease BolePix EAD indisponivel para reemissao.'
      using errcode = 'PT409';
  end if;
  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = v_job.receivable_id for update;
  if not found
    or v_receivable.gateway_provider is distinct from 'banese_card'
    or v_receivable.gateway_environment is distinct from v_job.environment
    or v_receivable.gateway_payment_method is distinct from 'BOLETO'
    or v_receivable.gateway_boleto_nosso_numero
      is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_payment_id is distinct from v_job.canceled_nosso_numero
    or v_receivable.gateway_boleto_convenio is distinct from v_job.convenio
    or regexp_replace(coalesce(v_receivable.gateway_boleto_agencia, ''),
      '\D', '', 'g') is distinct from v_job.agency
    or round(v_receivable.valor, 2) is distinct from round(v_job.expected_amount, 2)
    or v_receivable.data_vencimento is distinct from v_job.expected_due_date
    or v_receivable.status not in ('PENDENTE', 'VENCIDO')
    or v_receivable.data_pagamento is not null or v_receivable.valor_pago is not null
    or v_receivable.manual_settlement_id is not null
    or v_receivable.gateway_settlement_channel is not null
    or v_receivable.gateway_settlement_source is not null
    or v_receivable.gateway_settlement_evidence is not null
    or v_receivable.gateway_settlement_recorded_at is not null
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
    or nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is not null
    or nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '') is not null
    or not exists (select 1 from public.banese_reconciliation_queue queue
      where queue.receivable_id = v_receivable.id
        and queue.state = 'REPLACEMENT_FENCED'
        and queue.environment = v_job.environment and queue.modality = 'EAD')
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
    ) then
    raise exception 'Cobranca EAD mudou depois da baixa remota.'
      using errcode = 'PT409';
  end if;

  select count(*) into v_transaction_count
  from public.payment_gateway_transactions transaction
  where transaction.receivable_id = v_receivable.id;
  if v_transaction_count <> 1 then
    raise exception 'Transacao EAD mudou depois da baixa remota.';
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
    raise exception 'Identidade da transacao baixada diverge do job EAD.';
  end if;

  select count(*) into v_inscription_count
  from public.inscricoes_online inscription
  where inscription.matricula_id = v_receivable.matricula_id
    or inscription.receivable_id = v_receivable.id
    or (inscription.gateway_provider = 'banese_card'
      and inscription.gateway_environment = v_job.environment
      and inscription.gateway_payment_id = v_job.canceled_nosso_numero);
  if v_inscription_count > 1 then
    raise exception 'Projecoes EAD mudaram depois da baixa remota.';
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
      or v_inscription.gateway_provider is distinct from 'banese_card'
      or v_inscription.gateway_environment is distinct from v_job.environment
      or v_inscription.gateway_payment_id is distinct from v_job.canceled_nosso_numero
      or v_inscription.status is distinct from 'AGUARDANDO_PAGAMENTO'
      or v_transaction.inscricao_online_id is distinct from v_inscription.id then
      raise exception 'Inscricao EAD diverge do job de substituicao.';
    end if;
  end if;

  v_transaction_snapshot := to_jsonb(v_transaction) || jsonb_build_object(
    'receivable_id', null, 'remote_status', 'CANCELED', 'last_error', null,
    'synced_at', v_now, 'updated_at', v_now);
  if v_inscription_count = 1 then
    v_inscription_snapshot := to_jsonb(v_inscription) || jsonb_build_object(
      'gateway_payment_id', null, 'gateway_customer_id', null,
      'gateway_payment_link_id', null, 'updated_at', v_now);
  end if;
  insert into public.banese_ead_title_replacement_archive (
    job_id, receivable_id, source_transaction_id, source_inscription_id,
    environment, convenio, agency, canceled_nosso_numero,
    remote_cancel_situation_code, remote_cancel_confirmed_at,
    remote_cancel_fingerprint, remote_cancel_observed_pre_canceled,
    remote_cancel_put_attempted_in_confirmation,
    remote_cancel_mutation_intent_at,
    receivable_pre_snapshot, transaction_pre_snapshot,
    inscription_pre_snapshot, transaction_canceled_snapshot,
    inscription_reset_snapshot
  ) values (
    v_job.id, v_receivable.id, v_transaction.id,
    case when v_inscription_count = 1 then v_inscription.id else null end,
    v_job.environment, v_job.convenio, v_job.agency,
    v_job.canceled_nosso_numero, p_confirmed_situation_code, p_confirmed_at,
    p_cancel_fingerprint, p_already_canceled, p_mutation_attempted,
    v_job.cancel_mutation_intent_at,
    to_jsonb(v_receivable), to_jsonb(v_transaction),
    case when v_inscription_count = 1 then to_jsonb(v_inscription) else null end,
    v_transaction_snapshot, v_inscription_snapshot
  );
  perform set_config('app.banese_ead_replacement_job', v_job.id::text, true);
  perform set_config('app.banese_ead_replacement_lease',
    v_job.lease_token::text, true);

  update public.payment_gateway_transactions
  set receivable_id = null, remote_status = 'CANCELED', last_error = null,
      synced_at = v_now, updated_at = v_now
  where id = v_transaction.id returning * into v_transaction_after;
  if to_jsonb(v_transaction_after) is distinct from v_transaction_snapshot then
    raise exception 'Arquivo da transacao cancelada nao confere.';
  end if;
  if v_inscription_count = 1 then
    update public.inscricoes_online
    set gateway_payment_id = null, gateway_customer_id = null,
        gateway_payment_link_id = null, updated_at = v_now
    where id = v_inscription.id returning * into v_inscription_after;
    if to_jsonb(v_inscription_after) is distinct from v_inscription_snapshot then
      raise exception 'Reset da projecao EAD nao confere com o arquivo.';
    end if;
  end if;
  update public.contas_receber
  set gateway_payment_id = null, gateway_customer_id = null,
      gateway_payment_link_id = null, gateway_installment_id = null,
      gateway_status = null, gateway_invoice_url = null,
      gateway_bank_slip_url = null, gateway_pix_payload = null,
      gateway_pix_encoded_image = null,
      gateway_transaction_receipt_url = null, gateway_fee_value = null,
      gateway_net_value = null, gateway_synced_at = null,
      gateway_last_error = null, gateway_boleto_linha_digitavel = null,
      gateway_boleto_codigo_barras = null,
      gateway_boleto_nosso_numero = null, gateway_boleto_issued_at = null,
      gateway_financial_terms = null,
      gateway_financial_terms_confirmed_at = null,
      gateway_creation_token = null, gateway_submission_channel = null,
      gateway_submission_status = null, gateway_cnab_file_id = null,
      updated_at = v_now
  where id = v_receivable.id;
  update public.banese_ead_title_replacement_jobs
  set status = 'REISSUING', lease_until = now() + interval '3 minutes',
      updated_at = now()
  where id = v_job.id returning * into v_job;
  if not exists (select 1 from public.banese_reconciliation_queue queue
    where queue.receivable_id = v_receivable.id
      and queue.state = 'REPLACEMENT_FENCED') then
    raise exception 'Fila EAD perdeu o fence antes da reemissao.';
  end if;
  return jsonb_build_object('ready', true, 'jobId', v_job.id,
    'leaseToken', v_job.lease_token, 'receivableId', v_receivable.id);
end;
$function$;

revoke all on function public.prepare_banese_ead_title_reissue(
  uuid,uuid,text,integer,timestamptz,text,boolean,boolean)
  from public, anon, authenticated;
grant execute on function public.prepare_banese_ead_title_reissue(
  uuid,uuid,text,integer,timestamptz,text,boolean,boolean)
  to service_role;

commit;
