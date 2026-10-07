CREATE OR REPLACE FUNCTION internal_academic.technical_manual_banese_review_cancel_candidate(p_receivable contas_receber, p_run internal_academic.technical_manual_cycle_runs, p_auth internal_academic.technical_manual_receivable_issuance_authorizations, p_recovery_request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(p_receivable.id = any(p_run.receivable_ids)
    and p_receivable.matricula_id = p_run.matricula_id
    and p_receivable.turma_id = p_run.turma_id
    and p_run.state = 'LOCAL_CREATED'
    and p_auth.receivable_id = p_receivable.id
    and p_auth.matricula_id = p_run.matricula_id
    and p_auth.turma_id = p_run.turma_id
    and p_auth.cycle_number = p_run.cycle_number
    and p_auth.request_id = p_recovery_request_id
    and p_auth.authorized_by = p_run.created_by
    and p_auth.first_claimed_at is not null
    and p_auth.claim_count >= 1
    and p_auth.receivable_fingerprint =
      internal_academic.technical_manual_receivable_issuance_fingerprint(
        p_receivable)
    and p_receivable.gateway_provider = 'banese_card'
    and p_receivable.gateway_environment = 'production'
    and p_receivable.gateway_payment_method = 'BOLETO'
    and p_receivable.forma_pagamento = 'BOLETO'
    and p_receivable.gateway_issuer_polo_id is not null
    and p_receivable.gateway_submission_channel = 'API'
    and p_receivable.gateway_submission_status = 'API_REVIEW'
    and p_receivable.gateway_status = 'CREATING'
    and p_receivable.gateway_creation_token = p_recovery_request_id
    and p_receivable.gateway_last_error =
      'CICLO_MANUAL_BANESE_REVISAO_INTERNAL_GET:' ||
        p_recovery_request_id::text
    and coalesce(p_receivable.gateway_boleto_nosso_numero, '')
      ~ '^[0-9]{9}$'
    and coalesce(p_receivable.gateway_boleto_convenio, '') ~ '^[0-9]+$'
    and coalesce(p_receivable.gateway_boleto_agencia, '')
      ~ '^[0-9]{3}$'
    and p_receivable.gateway_boleto_agencia <> '000'
    and jsonb_typeof(p_receivable.gateway_financial_terms) = 'object'
    and p_receivable.gateway_financial_terms =
      internal_academic.technical_manual_banese_expected_terms(p_receivable)
    and p_receivable.gateway_financial_terms_confirmed_at is null
    and upper(coalesce(p_receivable.status, '')) in ('PENDENTE', 'VENCIDO')
    and not internal_academic.technical_manual_banese_has_settlement_evidence(
      p_receivable)
    and p_receivable.gateway_payment_id is null
    and p_receivable.gateway_customer_id is null
    and p_receivable.gateway_payment_link_id is null
    and p_receivable.gateway_installment_id is null
    and p_receivable.gateway_invoice_url is null
    and p_receivable.gateway_bank_slip_url is null
    and p_receivable.gateway_transaction_receipt_url is null
    and p_receivable.gateway_boleto_linha_digitavel is null
    and p_receivable.gateway_boleto_codigo_barras is null
    and p_receivable.gateway_boleto_issued_at is null
    and p_receivable.gateway_pix_payload is null
    and p_receivable.gateway_pix_encoded_image is null
    and p_receivable.gateway_fee_value is null
    and p_receivable.gateway_net_value is null
    and p_receivable.gateway_synced_at is null
    and p_receivable.gateway_cnab_file_id is null
    and p_receivable.asaas_payment_id is null
    and p_receivable.asaas_payment_link_id is null
    and p_receivable.asaas_installment_id is null
    and p_receivable.nosso_numero_asaas is null
    and p_receivable.asaas_invoice_url is null
    and p_receivable.asaas_bank_slip_url is null
    and p_receivable.asaas_transaction_receipt_url is null
    and p_receivable.asaas_status is null
    and p_receivable.asaas_synced_at is null
    and not exists (
      select 1 from public.payment_gateway_transactions as transaction
      where transaction.receivable_id = p_receivable.id)
    and exists (
      select 1 from public.payment_gateway_routes as route
      where upper(route.modalidade) = 'TECNICO'
        and route.payment_method = 'BOLETO'
        and route.environment = 'production'
        and route.provider_code = 'banese_card'
        and route.enabled)
    and exists (
      select 1
      from public.matriculas as enrollment
      join public.turmas as class on class.id = enrollment.turma_id
      join public.cursos as course on course.id = class.curso_id
      where enrollment.id = p_receivable.matricula_id
        and enrollment.aluno_id = p_receivable.cliente_id
        and class.id = p_receivable.turma_id
        and upper(coalesce(enrollment.status,'')) in ('ATIVO','PENDENTE')
        and upper(coalesce(course.modalidade, '')) in ('TECNICO', 'TÉCNICO'))
    and not internal_academic.is_technical_manual_cycle_protected(p_receivable.matricula_id)
    and coalesce(p_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca','BOLETO') <> 'LOCAL'
    and not internal_academic.manual_cycle_has_local_intent(p_receivable), false);
$function$
;
CREATE OR REPLACE FUNCTION internal_academic.technical_manual_due_date_correction_bypass_valid(p_receivable_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (
    coalesce((select auth.role()), '') = 'service_role'
    or session_user in ('postgres', 'supabase_admin', 'service_role')
  ) and exists (
    select 1
    from internal_academic.technical_manual_banese_due_date_overlay overlay
    join internal_academic.technical_manual_banese_reissue_jobs job
      on job.receivable_id = overlay.receivable_id
     and job.recovery_request_id = overlay.authorization_request_id
     and job.cycle_request_id = overlay.cycle_request_id
    join internal_academic.technical_manual_banese_reissue_archive archive
      on archive.job_id = job.id
     and archive.receivable_id = overlay.receivable_id
     and archive.recovery_request_id = overlay.authorization_request_id
    join public.contas_receber receivable
      on receivable.id = overlay.receivable_id
    where overlay.receivable_id = p_receivable_id
      and overlay.correction_request_id::text = current_setting(
        'app.technical_manual_due_date_correction_id', true)
      and job.id::text = current_setting(
        'app.technical_manual_banese_reissue_job_id', true)
      and job.recovery_request_id::text = current_setting(
        'app.technical_manual_banese_reissue_request_id', true)
      and job.lease_token::text = current_setting(
        'app.technical_manual_banese_reissue_lease_token', true)
      and job.status = 'CANCEL_CONFIRMED'
      and job.lease_valid_until > clock_timestamp()
      and archive.remote_cancel_situation_code = 5
      and to_jsonb(receivable) = overlay.receivable_pre_snapshot
  );
$function$
;
