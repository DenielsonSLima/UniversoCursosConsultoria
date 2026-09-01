begin;

create or replace function public.finish_banese_ead_title_replacement(
  p_job_id uuid,
  p_lease_token uuid,
  p_result text,
  p_replacement_nosso_numero text default null,
  p_error_code text default null
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
  v_result text := upper(coalesce(p_result, ''));
  v_final_status text;
  v_transaction_count integer;
  v_inscription_count integer;
  v_has_receivable_pix boolean;
  v_has_transaction_pix boolean;
  v_receivable_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
      <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Acesso negado a conclusao da substituicao BolePix EAD.'
      using errcode = '42501';
  end if;
  if v_result not in ('RECOVERED_EXISTING_PIX', 'COMPLETED',
      'REISSUED_PIX_PENDING', 'STOPPED_PAID', 'REISSUED_PAID',
      'REVIEW_REQUIRED')
    or (p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{3,80}$')
    or (v_result = 'REVIEW_REQUIRED' and p_error_code is null)
    or (v_result <> 'REVIEW_REQUIRED' and p_error_code is not null)
    or (v_result in ('COMPLETED', 'REISSUED_PIX_PENDING', 'REISSUED_PAID')
      and coalesce(p_replacement_nosso_numero, '') !~ '^[0-9]{9}$')
    or (v_result not in ('COMPLETED', 'REISSUED_PIX_PENDING', 'REISSUED_PAID')
      and p_replacement_nosso_numero is not null) then
    raise exception 'Resultado de substituicao BolePix EAD invalido.';
  end if;
  select job.receivable_id into v_receivable_id
  from public.banese_ead_title_replacement_jobs job where job.id = p_job_id;
  if not found then raise exception 'Job BolePix EAD inexistente.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_receivable_id::text, 0));
  select job.* into v_job
  from public.banese_ead_title_replacement_jobs job
  where job.id = p_job_id for update;
  if not found or v_job.status not in (
      'PROCESSING', 'RECOVERING_PIX', 'CANCEL_FENCED', 'REISSUING'
    )
    or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_until <= now() then
    raise exception 'Lease invalida na conclusao BolePix EAD.' using errcode = 'PT409';
  end if;
  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = v_job.receivable_id for update;
  if not found then raise exception 'Cobranca EAD nao encontrada na conclusao.'; end if;

  if v_result = 'REVIEW_REQUIRED' then
    v_final_status := case when v_job.status in ('CANCEL_FENCED', 'REISSUING')
      then 'REVIEW_FENCED' else 'REVIEW_REQUIRED' end;
    if v_job.status = 'RECOVERING_PIX' then
      update public.banese_reconciliation_queue
      set state = 'READY', next_check_at = now(), lease_run_id = null,
          lease_until = null, updated_at = now()
      where receivable_id = v_receivable.id
        and state = 'REPLACEMENT_FENCED';
    end if;
    update public.banese_ead_title_replacement_jobs
    set status = v_final_status, last_error_code = p_error_code,
        lease_token = null, lease_until = null, updated_at = now()
    where id = v_job.id;
    return jsonb_build_object('jobId', v_job.id, 'status', v_final_status);
  end if;

  if v_result = 'STOPPED_PAID' then
    if v_job.status not in ('PROCESSING', 'RECOVERING_PIX')
      or upper(v_receivable.status) <> 'PAGO'
      or v_receivable.data_pagamento is null
      or coalesce(v_receivable.valor_pago, 0) <= 0 then
      raise exception 'Conclusao paga sem liquidacao canonica do recebivel.';
    end if;
    update public.banese_reconciliation_queue
    set state = 'DONE', next_check_at = null, lease_run_id = null,
        lease_until = null, updated_at = now()
    where receivable_id = v_receivable.id
      and (state <> 'LEASED' or lease_until <= now());
    v_final_status := 'STOPPED_PAID';
  elsif v_result = 'RECOVERED_EXISTING_PIX' then
    if v_job.status not in ('PROCESSING', 'RECOVERING_PIX')
      or v_receivable.gateway_boleto_nosso_numero
        is distinct from v_job.canceled_nosso_numero
      or v_receivable.gateway_payment_id is distinct from v_job.canceled_nosso_numero
      or v_receivable.gateway_provider is distinct from 'banese_card'
      or v_receivable.gateway_environment is distinct from v_job.environment
      or v_receivable.gateway_payment_method is distinct from 'BOLETO'
      or v_receivable.gateway_status is distinct from 'PENDING'
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
      or coalesce(v_receivable.gateway_boleto_linha_digitavel, '')
        !~ '^0479[0-9]{43}$'
      or coalesce(v_receivable.gateway_boleto_codigo_barras, '')
        !~ '^0479[0-9]{40}$'
      or substring(v_receivable.gateway_boleto_codigo_barras from 31 for 9)
        is distinct from v_job.canceled_nosso_numero
      or concat(substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
        substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
        substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
        substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
        substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
        substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10))
        is distinct from v_receivable.gateway_boleto_codigo_barras
      or not exists (
        select 1 from public.matriculas enrollment
        join public.turmas class on class.id = enrollment.turma_id
        join public.cursos course on course.id = class.curso_id
        where enrollment.id = v_receivable.matricula_id
          and enrollment.aluno_id = v_receivable.cliente_id
          and class.id = v_receivable.turma_id
          and upper(coalesce(course.modalidade, '')) = 'EAD'
      )
    then raise exception 'Pix recuperado nao pertence ao titulo original.'; end if;
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
      or v_transaction.remote_payment_id
        is distinct from v_job.canceled_nosso_numero
      or v_transaction.bank_slip_our_number
        is distinct from v_job.canceled_nosso_numero
      or v_transaction.bank_slip_digitable_line
        is distinct from v_receivable.gateway_boleto_linha_digitavel
      or v_transaction.bank_slip_barcode
        is distinct from v_receivable.gateway_boleto_codigo_barras
      or round(v_transaction.amount, 2)
        is distinct from round(v_job.expected_amount, 2)
      or v_transaction.origin_polo_id is distinct from v_receivable.polo_id
      or v_transaction.issuer_polo_id
        is distinct from v_receivable.gateway_issuer_polo_id then
      raise exception 'Transacao do Pix recuperado diverge do titulo EAD.';
    end if;
    v_has_receivable_pix := nullif(btrim(coalesce(
      v_receivable.gateway_pix_payload, '')), '') is not null
      and nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '')
        is not null;
    v_has_transaction_pix := nullif(btrim(coalesce(v_transaction.pix_payload, '')), '')
        is not null
      and nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is not null;
    if not v_has_receivable_pix or not v_has_transaction_pix
      or v_transaction.pix_payload is distinct from v_receivable.gateway_pix_payload
      or v_transaction.pix_encoded_image
        is distinct from v_receivable.gateway_pix_encoded_image
      or v_transaction.remote_payment_id
        is distinct from v_job.canceled_nosso_numero then
      raise exception 'Snapshot Pix recuperado esta incompleto ou divergente.';
    end if;
    update public.banese_reconciliation_queue
    set state = 'READY', next_check_at = now(), lease_run_id = null,
        lease_until = null, updated_at = now()
    where receivable_id = v_receivable.id
      and (state <> 'LEASED' or lease_until <= now());
    v_final_status := 'RECOVERED_EXISTING_PIX';
  elsif v_result = 'REISSUED_PAID' then
    if not public.banese_ead_reissued_paid_identity_valid(
      v_job.id, p_replacement_nosso_numero
    ) then
      raise exception 'Novo titulo pago diverge da substituicao BolePix EAD.';
    end if;
    update public.banese_reconciliation_queue
    set state = 'DONE', next_check_at = null, lease_run_id = null,
        lease_until = null, updated_at = now()
    where receivable_id = v_receivable.id and state = 'REPLACEMENT_FENCED';
    if not found then raise exception 'Fila EAD perdeu o fence do titulo pago.'; end if;
    v_final_status := 'REISSUED_PAID';
  else
    if v_job.status <> 'REISSUING'
      or not exists (select 1
        from public.banese_ead_title_replacement_archive archive
        where archive.job_id = v_job.id)
      or coalesce(p_replacement_nosso_numero, '') !~ '^[0-9]{9}$'
      or p_replacement_nosso_numero = v_job.canceled_nosso_numero
      or v_receivable.gateway_boleto_nosso_numero
        is distinct from p_replacement_nosso_numero
      or v_receivable.gateway_payment_id is distinct from p_replacement_nosso_numero
      or v_receivable.gateway_provider is distinct from 'banese_card'
      or v_receivable.gateway_environment is distinct from v_job.environment
      or v_receivable.gateway_payment_method is distinct from 'BOLETO'
      or upper(coalesce(v_receivable.gateway_status, ''))
        not in ('PENDING', 'REGISTERED')
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
      or v_receivable.gateway_submission_channel is distinct from 'API'
      or v_receivable.gateway_submission_status is distinct from 'API_REGISTERED'
      or v_receivable.gateway_boleto_issued_at is null
      or jsonb_typeof(v_receivable.gateway_financial_terms)
        is distinct from 'object'
      or v_receivable.gateway_financial_terms_confirmed_at is null
      or coalesce(v_receivable.gateway_boleto_linha_digitavel, '') !~ '^0479[0-9]{43}$'
      or coalesce(v_receivable.gateway_boleto_codigo_barras, '') !~ '^0479[0-9]{40}$'
      or substring(v_receivable.gateway_boleto_codigo_barras from 31 for 9)
        is distinct from p_replacement_nosso_numero
      or concat(substring(v_receivable.gateway_boleto_linha_digitavel from 1 for 4),
        substring(v_receivable.gateway_boleto_linha_digitavel from 33 for 1),
        substring(v_receivable.gateway_boleto_linha_digitavel from 34 for 14),
        substring(v_receivable.gateway_boleto_linha_digitavel from 5 for 5),
        substring(v_receivable.gateway_boleto_linha_digitavel from 11 for 10),
        substring(v_receivable.gateway_boleto_linha_digitavel from 22 for 10))
        is distinct from v_receivable.gateway_boleto_codigo_barras
      or not exists (
        select 1 from public.matriculas enrollment
        join public.turmas class on class.id = enrollment.turma_id
        join public.cursos course on course.id = class.curso_id
        where enrollment.id = v_receivable.matricula_id
          and enrollment.aluno_id = v_receivable.cliente_id
          and class.id = v_receivable.turma_id
          and upper(coalesce(course.modalidade, '')) = 'EAD'
      ) then
      raise exception 'Novo titulo BolePix nao possui identidade bancaria valida.';
    end if;
    select count(*) into v_transaction_count
    from public.payment_gateway_transactions transaction
    where transaction.receivable_id = v_receivable.id;
    if v_transaction_count <> 1 then
      raise exception 'Novo titulo BolePix nao possui transacao canonica unica.';
    end if;
    select transaction.* into v_transaction
    from public.payment_gateway_transactions transaction
    where transaction.receivable_id = v_receivable.id for update;
    if v_transaction.provider_code is distinct from 'banese_card'
      or v_transaction.environment is distinct from v_job.environment
      or v_transaction.payment_method is distinct from 'BOLETO'
      or v_transaction.remote_payment_id is distinct from p_replacement_nosso_numero
      or v_transaction.bank_slip_our_number is distinct from p_replacement_nosso_numero
      or v_transaction.bank_slip_digitable_line
        is distinct from v_receivable.gateway_boleto_linha_digitavel
      or v_transaction.bank_slip_barcode
        is distinct from v_receivable.gateway_boleto_codigo_barras
      or round(v_transaction.amount, 2) is distinct from round(v_job.expected_amount, 2)
      or v_transaction.origin_polo_id is distinct from v_receivable.polo_id
      or v_transaction.issuer_polo_id
        is distinct from v_receivable.gateway_issuer_polo_id
      or v_transaction.installments
        is distinct from coalesce(v_receivable.gateway_installments, 1)
      or upper(coalesce(v_transaction.remote_status, ''))
        not in ('PENDING', 'REGISTERED')
      or upper(coalesce(v_transaction.remote_status, '')) is distinct from
        upper(coalesce(v_receivable.gateway_status, ''))
    then raise exception 'Nova transacao BolePix diverge do recebivel EAD.'; end if;
    select count(*) into v_inscription_count
    from public.inscricoes_online inscription
    where inscription.matricula_id = v_receivable.matricula_id
      or inscription.receivable_id = v_receivable.id
      or (inscription.gateway_provider = 'banese_card'
        and inscription.gateway_environment = v_job.environment
        and inscription.gateway_payment_id = p_replacement_nosso_numero);
    if v_inscription_count <> 1 then
      raise exception 'Novo BolePix nao possui uma unica inscricao canonica.';
    end if;
    select inscription.* into v_inscription
    from public.inscricoes_online inscription
    where inscription.matricula_id = v_receivable.matricula_id
      or inscription.receivable_id = v_receivable.id
      or (inscription.gateway_provider = 'banese_card'
        and inscription.gateway_environment = v_job.environment
        and inscription.gateway_payment_id = p_replacement_nosso_numero)
    for update;
    if v_inscription.receivable_id is distinct from v_receivable.id
      or v_inscription.matricula_id is distinct from v_receivable.matricula_id
      or v_inscription.aluno_id is distinct from v_receivable.cliente_id
      or v_inscription.turma_id is distinct from v_receivable.turma_id
      or v_inscription.gateway_provider is distinct from 'banese_card'
      or v_inscription.gateway_environment is distinct from v_job.environment
      or v_inscription.gateway_payment_id is distinct from p_replacement_nosso_numero
      or round(v_inscription.valor, 2) is distinct from round(v_job.expected_amount, 2)
      or v_inscription.status is distinct from 'AGUARDANDO_PAGAMENTO'
      or v_transaction.inscricao_online_id is distinct from v_inscription.id then
      raise exception 'Projecao do novo BolePix diverge da cobranca EAD.';
    end if;
    v_has_receivable_pix := nullif(btrim(coalesce(
      v_receivable.gateway_pix_payload, '')), '') is not null
      and nullif(btrim(coalesce(v_receivable.gateway_pix_encoded_image, '')), '')
        is not null;
    v_has_transaction_pix := nullif(btrim(coalesce(v_transaction.pix_payload, '')), '')
        is not null
      and nullif(btrim(coalesce(v_transaction.pix_encoded_image, '')), '') is not null;
    if (nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '') is null)
        <> (nullif(btrim(coalesce(
          v_receivable.gateway_pix_encoded_image, '')), '') is null)
      or (nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is null)
        <> (nullif(btrim(coalesce(
          v_transaction.pix_encoded_image, '')), '') is null) then
      raise exception 'Novo titulo BolePix possui par Pix incompleto.';
    end if;
    if v_result = 'COMPLETED' and (
        not v_has_receivable_pix or not v_has_transaction_pix
        or v_transaction.pix_payload is distinct from v_receivable.gateway_pix_payload
        or v_transaction.pix_encoded_image
          is distinct from v_receivable.gateway_pix_encoded_image)
      or v_result = 'REISSUED_PIX_PENDING' and (
        nullif(btrim(coalesce(v_receivable.gateway_pix_payload, '')), '')
          is not null
        or nullif(btrim(coalesce(
          v_receivable.gateway_pix_encoded_image, '')), '') is not null
        or nullif(btrim(coalesce(v_transaction.pix_payload, '')), '') is not null
        or nullif(btrim(coalesce(
          v_transaction.pix_encoded_image, '')), '') is not null
      ) then
      raise exception 'Estado Pix do novo titulo diverge da conclusao solicitada.';
    end if;
    update public.banese_reconciliation_queue
    set state = 'READY', next_check_at = now(), lease_run_id = null,
        lease_until = null, updated_at = now()
    where receivable_id = v_receivable.id and state = 'REPLACEMENT_FENCED';
    if not found then raise exception 'Fila EAD perdeu o fence da substituicao.'; end if;
    v_final_status := v_result;
  end if;

  update public.banese_ead_title_replacement_jobs
  set status = v_final_status,
      replacement_nosso_numero = p_replacement_nosso_numero,
      last_error_code = null, lease_token = null, lease_until = null,
      completed_at = now(), updated_at = now()
  where id = v_job.id;
  return jsonb_build_object('jobId', v_job.id, 'status', v_final_status,
    'replacementNossoNumero', p_replacement_nosso_numero);
end;
$function$;

revoke all on function public.finish_banese_ead_title_replacement(
  uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.finish_banese_ead_title_replacement(
  uuid,uuid,text,text,text) to service_role;

commit;
