-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.is_technical_manual_cycle_protected_before_proesc_scopes(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from internal_academic.technical_manual_cycle_runs run
    where run.matricula_id = p_matricula_id and run.state = 'PROTECTED_EXISTING'
  ) or exists (
    select 1 from internal_academic.technical_external_cycle_coverage coverage
    where coverage.matricula_id = p_matricula_id and coverage.state = 'CONFIRMED'
  );
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.is_technical_manual_cycle_protected_before_individual_admission(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.is_technical_manual_cycle_protected_before_proesc_scopes(p_matricula_id)
    or internal_proesc.enrollment_financial_block(p_matricula_id) is not null;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.is_technical_manual_cycle_protected(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.is_technical_manual_cycle_protected_before_individual_admission(p_matricula_id)
    or (internal_academic.is_manual_technical_enrollment(p_matricula_id)
      and not internal_academic.technical_local_cycle_eligible(p_matricula_id)
      and (internal_academic.technical_cycle_history_outside_enrollment(p_matricula_id)
        or not exists(select 1 from internal_academic.technical_manual_cycle_policies p
        join public.matriculas m on m.turma_id=p.turma_id where m.id=p_matricula_id
          and p.active and p.generation_mode='MANUAL')));
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.guard_technical_manual_cycle_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_request_id uuid;
  v_expected_origin text;
begin
  if exists (select 1 from internal_proesc.class_scopes scope
    where scope.batch_id is not null and (scope.turma_id=new.turma_id
      or exists (select 1 from public.matriculas m where m.id=new.matricula_id and m.turma_id=scope.turma_id))) then
    if not exists (select 1 from public.matriculas m join public.turmas t on t.id=m.turma_id
      where m.id=new.matricula_id and m.turma_id=new.turma_id
        and m.aluno_id=new.cliente_id and t.polo_id=new.polo_id) then
      raise exception 'Identidade da cobrança Proesc diverge da matrícula.' using errcode='42501'; end if;
    if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
    if internal_proesc.enrollment_financial_block(new.matricula_id) is not null
      or new.origem_pagamento='SISTEMA_ANTERIOR' then
      raise exception 'Turma Proesc: inclusão financeira exige importação ou ciclo local conferido.' using errcode='42501';
    end if;
  end if;
  if new.matricula_id is not null
    and upper(coalesce(new.tipo_lancamento, '')) in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    and exists (
      select 1 from internal_academic.technical_external_cycle_coverage coverage
      where coverage.matricula_id = new.matricula_id and coverage.state = 'CONFIRMED'
    ) then
    raise exception 'Matrícula com cobertura Proesc: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if new.matricula_id is null
    or upper(coalesce(new.tipo_lancamento, '')) not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    or not internal_academic.is_manual_technical_enrollment(new.matricula_id) then return new; end if;
  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic.technical_imported_banese_c2_claim_is_current(
      new.matricula_id
    ) then
    raise exception 'Matrícula protegida: novas cobranças técnicas são bloqueadas.' using errcode = 'P0001';
  end if;
  if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
  begin
    v_request_id := nullif(current_setting('app.technical_manual_cycle_request_id', true), '')::uuid;
  exception when invalid_text_representation then v_request_id := null;
  end;
  select run.* into v_run from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = new.matricula_id and run.request_id = v_request_id
    and run.state = 'GENERATING';
  if v_run.matricula_id is null then
    raise exception 'Cobrança de ciclo técnico manual exige RPC autorizada.' using errcode = '42501';
  end if;
  v_expected_origin := case upper(new.tipo_lancamento)
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'ciclo-' || (v_run.cycle_number - 1) || '-rematricula'
    else 'ciclo-' || v_run.cycle_number || '-parc-' || new.parcela_numero end;
  if new.origem_cronograma_id is distinct from v_expected_origin then
    raise exception 'Identidade de cobrança incompatível com o ciclo manual.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_proesc.guard_fresh_cycle_generation_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.matricula_id is null or upper(coalesce(new.tipo_lancamento,'')) not in ('MATRICULA','REMATRICULA','PARCELA')
    or not exists(select 1 from public.matriculas m join internal_proesc.class_scopes s on s.turma_id=m.turma_id
      where m.id=new.matricula_id) then return new; end if;
  if internal_academic.is_authorized_external_history_insert(new) then return new; end if;
  perform internal_proesc.assert_fresh_cycle_generation(new.matricula_id);
  return new;
end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:51 UTC. Not a migration.
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
$function$;

CREATE OR REPLACE FUNCTION internal_academic.guard_protected_technical_bank_post()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if internal_academic.is_technical_manual_cycle_protected(new.matricula_id)
    and not internal_academic
      .technical_imported_c1_receivable_is_local_c2(
        new.id, new.matricula_id
      )
    and (
      (
        new.gateway_creation_token is not null
        and new.gateway_creation_token is distinct from old.gateway_creation_token
      )
      or (
        new.gateway_cnab_file_id is not null
        and new.gateway_cnab_file_id is distinct from old.gateway_cnab_file_id
      )
      or (
        new.gateway_submission_channel = 'CNAB'
        and new.gateway_submission_channel is distinct from old.gateway_submission_channel
      )
      or (
        new.gateway_submission_channel = 'API'
        and new.gateway_submission_status = 'API_AMBIGUOUS'
        and new.gateway_submission_status is distinct from old.gateway_submission_status
      )
    )
  then
    raise exception 'Matrícula protegida: novo POST Banese bloqueado.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.is_individual_manual_cycle_receivable(p_receivable contas_receber, p_creating boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.technical_local_cycle_eligible((p_receivable).matricula_id)
    and exists(select 1 from internal_academic.technical_manual_cycle_runs run
      join public.matriculas m on m.id=run.matricula_id
      join public.turmas t on t.id=m.turma_id
      where run.matricula_id=(p_receivable).matricula_id
        and run.turma_id=(p_receivable).turma_id and m.turma_id=run.turma_id
        and m.aluno_id=(p_receivable).cliente_id and t.polo_id=(p_receivable).polo_id
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}'=run.request_id::text
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}'=run.cycle_number::text
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,regraFingerprint}'=run.rule_fingerprint
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,politicaFingerprint}'=run.policy_fingerprint
        and (p_receivable).regra_financeira_tecnica_snapshot#>>'{cicloManual,cronogramaFingerprint}'=run.schedule_fingerprint
        and case (p_receivable).tipo_lancamento
          when 'MATRICULA' then run.cycle_number=1 and (p_receivable).parcela_numero=0
            and (p_receivable).origem_cronograma_id='matricula'
          when 'REMATRICULA' then run.cycle_number=2 and (p_receivable).parcela_numero=0
            and (p_receivable).origem_cronograma_id='ciclo-1-rematricula'
          when 'PARCELA' then (p_receivable).parcela_numero between 1 and run.expected_installment_count
            and (p_receivable).origem_cronograma_id='ciclo-'||run.cycle_number||'-parc-'||(p_receivable).parcela_numero
          else false end
        and case when p_creating then
          run.state='GENERATING' and run.request_id::text=
            current_setting('app.technical_manual_cycle_request_id',true)
        else run.state='LOCAL_CREATED' and (p_receivable).id=any(run.receivable_ids) end);
$function$;

CREATE OR REPLACE FUNCTION public.guard_implantation_receivable()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_matricula_id uuid; v_manual boolean:=false;
begin
  if tg_op='DELETE' then v_matricula_id:=old.matricula_id;
  else v_matricula_id:=new.matricula_id; end if;
  if v_matricula_id is null then
    return case when tg_op='DELETE' then old else new end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('matricula_workflow:'||v_matricula_id::text,0));
  if tg_op<>'DELETE' and exists(select 1 from public.matriculas m
    where m.id=v_matricula_id and m.fluxo_operacional='IMPLANTACAO') then
    if tg_op='INSERT' then
      v_manual:=internal_academic.is_individual_manual_cycle_receivable(new,true);
    elsif tg_op='UPDATE' then
      v_manual:=internal_academic.is_individual_manual_cycle_receivable(old,false)
        and internal_academic.is_individual_manual_cycle_receivable(new,false)
        and row(old.id,old.matricula_id,old.turma_id,old.cliente_id,old.polo_id,
          old.tipo_lancamento,old.parcela_numero,old.origem_cronograma_id,
          old.valor,old.data_vencimento,old.regra_financeira_tecnica_snapshot)
        is not distinct from row(new.id,new.matricula_id,new.turma_id,new.cliente_id,new.polo_id,
          new.tipo_lancamento,new.parcela_numero,new.origem_cronograma_id,
          new.valor,new.data_vencimento,new.regra_financeira_tecnica_snapshot);
    end if;
    if not coalesce(v_manual,false) then
      raise exception 'Matrícula de implantação não pode receber lançamento financeiro.' using errcode='22023';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$function$;

