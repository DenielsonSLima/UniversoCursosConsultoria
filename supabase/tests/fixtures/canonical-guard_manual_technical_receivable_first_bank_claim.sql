CREATE OR REPLACE FUNCTION internal_academic.guard_manual_technical_receivable_first_bank_claim()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_authorization
    internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_fingerprint text;
  v_first_claim boolean;
  v_protected_claim boolean;
  v_old_remote_identity boolean;
  v_enrollment_status text;
  v_protected_enrollment boolean;
begin
  v_protected_enrollment :=
    internal_academic.is_technical_manual_cycle_protected(new.matricula_id);
  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id
    and run.turma_id = new.turma_id
    and new.id = any(run.receivable_ids)
    and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
  order by run.cycle_number desc
  limit 1;
  if not found and not v_protected_enrollment then
    return new;
  end if;

  v_old_remote_identity :=
    old.gateway_boleto_issued_at is not null
    or old.gateway_payment_id is not null
    or old.gateway_payment_link_id is not null
    or old.gateway_boleto_linha_digitavel is not null
    or old.gateway_boleto_codigo_barras is not null
    or old.gateway_invoice_url is not null
    or old.gateway_bank_slip_url is not null
    or old.asaas_payment_id is not null
    or old.asaas_payment_link_id is not null;

  v_first_claim :=
    (old.gateway_creation_token is null
      and new.gateway_creation_token is not null)
    or (old.gateway_cnab_file_id is null
      and new.gateway_cnab_file_id is not null)
    or (old.gateway_submission_channel is null
      and new.gateway_submission_channel = 'CNAB')
    or (
      not v_old_remote_identity
      and (
        (old.gateway_submission_channel is null
          and new.gateway_submission_channel = 'API')
        or (old.gateway_submission_status is null
          and new.gateway_submission_status in (
            'API_REGISTERED', 'API_AMBIGUOUS',
            'CNAB_GENERATED', 'CNAB_SENT', 'CNAB_REGISTERED'
          ))
      )
    );

  v_protected_claim :=
    (new.gateway_creation_token is not null
      and new.gateway_creation_token is distinct from old.gateway_creation_token)
    or (new.gateway_cnab_file_id is not null
      and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id)
    or (new.gateway_submission_channel = 'CNAB'
      and new.gateway_submission_channel is distinct from old.gateway_submission_channel)
    or (new.gateway_submission_status = 'API_AMBIGUOUS'
      and new.gateway_submission_status is distinct from old.gateway_submission_status)
    or v_first_claim;

  if v_protected_enrollment and not internal_academic
    .technical_imported_c1_receivable_is_local_c2(
      new.id, new.matricula_id
    ) then
    if v_protected_claim then
      raise exception 'Matrícula protegida: novo claim bancário bloqueado.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if not v_first_claim then
    return new;
  end if;

  select upper(coalesce(enrollment.status, '')) into v_enrollment_status
  from public.matriculas enrollment
  where enrollment.id = new.matricula_id
    and enrollment.turma_id = new.turma_id;
  if coalesce(v_enrollment_status, '') not in ('PENDENTE', 'ATIVO') then
    raise exception 'A situação acadêmica não permite o primeiro claim bancário.'
      using errcode = 'P0001';
  end if;

  select authz.* into v_authorization
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = new.id;
  if v_authorization.receivable_id is null then
    raise exception 'Emissão manual exige consentimento explícito por recebível.'
      using errcode = '42501';
  end if;

  v_fingerprint :=
    internal_academic.technical_manual_receivable_issuance_fingerprint(new);
  if v_authorization.matricula_id is distinct from new.matricula_id
    or v_authorization.turma_id is distinct from new.turma_id
    or v_authorization.cycle_number is distinct from v_run.cycle_number
    or v_authorization.receivable_fingerprint is distinct from v_fingerprint
  then
    raise exception 'A autorização não corresponde mais ao recebível.'
      using errcode = 'PT422';
  end if;

  update internal_academic.technical_manual_receivable_issuance_authorizations
  set first_claimed_at = coalesce(first_claimed_at, now()),
      last_claimed_at = now(),
      claim_count = claim_count + 1
  where receivable_id = new.id;
  return new;
end;
$function$

