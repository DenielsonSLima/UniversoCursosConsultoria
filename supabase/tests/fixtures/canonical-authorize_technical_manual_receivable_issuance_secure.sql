CREATE OR REPLACE FUNCTION public.authorize_technical_manual_receivable_issuance_secure(p_receivable_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_receivable public.contas_receber%rowtype;
  v_run internal_academic.technical_manual_cycle_runs%rowtype;
  v_enrollment_status text;
  v_fingerprint text;
  v_existing internal_academic.technical_manual_receivable_issuance_authorizations%rowtype;
  v_request_owner uuid;
  v_has_remote_identity boolean;
begin
  if v_actor is null then
    raise exception 'Autenticação obrigatória para autorizar a emissão.'
      using errcode = '42501';
  end if;
  if p_receivable_id is null or p_request_id is null then
    raise exception 'Recebível e requisição são obrigatórios.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'technical-manual-receivable-issuance-request:' || p_request_id::text,
      0
    )
  );

  select receivable.* into v_receivable
  from public.contas_receber receivable
  where receivable.id = p_receivable_id
  for update;
  if not found then
    return jsonb_build_object(
      'required', false, 'authorized', false, 'replayed', false
    );
  end if;

  if internal_academic.is_technical_manual_cycle_protected(
    v_receivable.matricula_id
  ) and not internal_academic
    .technical_imported_c1_receivable_is_local_c2(
      v_receivable.id, v_receivable.matricula_id
    ) then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;

  select run.* into v_run
  from internal_academic.technical_manual_cycle_runs run
  where run.matricula_id = v_receivable.matricula_id
    and run.turma_id = v_receivable.turma_id
    and v_receivable.id = any(run.receivable_ids)
    and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING')
  order by run.cycle_number desc
  limit 1;
  if not found then
    return jsonb_build_object(
      'required', false, 'authorized', false, 'replayed', false
    );
  end if;

  if not (
    public.gestor_has_financeiro_tab('receber')
    and public.is_gestor_for_polo(v_receivable.polo_id)
  ) then
    raise exception 'Sem permissão financeira para emitir este recebível.'
      using errcode = '42501';
  end if;

  if v_run.state = 'PROTECTED_EXISTING' then
    raise exception 'Matrícula protegida: nova emissão bancária bloqueada.'
      using errcode = '42501';
  end if;

  select upper(coalesce(enrollment.status, '')) into v_enrollment_status
  from public.matriculas enrollment
  where enrollment.id = v_receivable.matricula_id
    and enrollment.turma_id = v_receivable.turma_id;
  if coalesce(v_enrollment_status, '') not in ('PENDENTE', 'ATIVO') then
    raise exception 'A situação acadêmica não permite emitir cobranças.'
      using errcode = 'P0001';
  end if;
  if upper(coalesce(v_receivable.status, '')) not in ('PENDENTE', 'VENCIDO') then
    raise exception 'O recebível não está disponível para emissão.'
      using errcode = 'P0001';
  end if;

  perform internal_academic.assert_manual_cycle_reviewed_receivable(v_receivable);
  if v_receivable.regra_financeira_tecnica_snapshot->>'destinoCobranca'='LOCAL'
    or internal_academic.manual_cycle_has_local_intent(v_receivable) then
    raise exception 'Matrícula registrada sem boleto não permite autorização bancária.' using errcode='23514';
  end if;
  v_fingerprint :=
    internal_academic.technical_manual_receivable_issuance_fingerprint(
      v_receivable
    );

  select authz.receivable_id into v_request_owner
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.request_id = p_request_id;
  if v_request_owner is not null
    and v_request_owner is distinct from p_receivable_id
  then
    raise exception 'A requisição já autoriza outro recebível.'
      using errcode = '23505';
  end if;

  select authz.* into v_existing
  from internal_academic.technical_manual_receivable_issuance_authorizations
    as authz
  where authz.receivable_id = p_receivable_id;
  if v_existing.receivable_id is not null
    and v_existing.request_id = p_request_id
  then
    if v_existing.authorized_by is distinct from v_actor
      or v_existing.receivable_fingerprint is distinct from v_fingerprint
    then
      raise exception 'Replay de autorização incompatível.'
        using errcode = 'PT422';
    end if;
    return jsonb_build_object(
      'required', true,
      'authorized', true,
      'replayed', true,
      'receivableId', p_receivable_id,
      'cycleNumber', v_run.cycle_number
    );
  end if;

  v_has_remote_identity :=
    v_receivable.gateway_boleto_issued_at is not null
    or v_receivable.gateway_payment_id is not null
    or v_receivable.gateway_payment_link_id is not null
    or v_receivable.gateway_boleto_linha_digitavel is not null
    or v_receivable.gateway_boleto_codigo_barras is not null
    or v_receivable.gateway_invoice_url is not null
    or v_receivable.gateway_bank_slip_url is not null
    or v_receivable.asaas_payment_id is not null
    or v_receivable.asaas_payment_link_id is not null;

  if not v_has_remote_identity then
    insert into
      internal_academic.technical_manual_receivable_issuance_authorizations(
        receivable_id, matricula_id, turma_id, cycle_number, request_id,
        receivable_fingerprint, authorized_by, authorized_at
      ) values (
        p_receivable_id, v_run.matricula_id, v_run.turma_id,
        v_run.cycle_number, p_request_id, v_fingerprint, v_actor, now()
      )
    on conflict (receivable_id) do update
    set request_id = excluded.request_id,
        receivable_fingerprint = excluded.receivable_fingerprint,
        authorized_by = excluded.authorized_by,
        authorized_at = excluded.authorized_at;

    perform public.registrar_turma_financeiro_auditoria(
      v_run.matricula_id,
      'EMISSAO_RECEBIVEL_CICLO_TECNICO_MANUAL_AUTORIZADA',
      jsonb_build_object(
        'receivableId', p_receivable_id,
        'cycleNumber', v_run.cycle_number,
        'requestId', p_request_id,
        'fingerprint', v_fingerprint,
        'actorId', v_actor
      ),
      'Consentimento explícito registrado antes do primeiro claim bancário.'
    );
  end if;

  return jsonb_build_object(
    'required', true,
    'authorized', true,
    'replayed', false,
    'existingRemoteTitle', v_has_remote_identity,
    'receivableId', p_receivable_id,
    'cycleNumber', v_run.cycle_number
  );
end;
$function$

