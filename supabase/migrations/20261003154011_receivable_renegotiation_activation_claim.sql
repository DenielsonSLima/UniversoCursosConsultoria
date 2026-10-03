begin;

create function internal_finance.receivable_renegotiation_activation_context(
  p_operation_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_sources jsonb;
  v_replacements jsonb;
begin
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'receivableId', source.receivable_id,
    'kind', source.kind,
    'state', source.state,
    'attemptKey', source.attempt_key,
    'sourceFingerprint', source.source_fingerprint,
    'bankSnapshot', source.bank_snapshot
  ) order by source.position), '[]'::jsonb) into v_sources
  from public.receivable_renegotiation_activation_sources source
  where source.operation_id = v_operation.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'receivableId', replacement.receivable_id,
    'state', replacement.state,
    'attemptKey', replacement.attempt_key,
    'financialTerms', replacement.financial_terms
  ) order by replacement.sequence), '[]'::jsonb) into v_replacements
  from public.receivable_renegotiation_replacements replacement
  where replacement.operation_id = v_operation.id;
  if jsonb_array_length(v_sources) <> v_operation.source_count
    or (v_operation.state in ('ISSUING_REPLACEMENTS', 'ACTIVE')
      and jsonb_array_length(v_replacements) <> v_operation.replacement_count)
    or (v_operation.state = 'CANCELING_SOURCES'
      and jsonb_array_length(v_replacements) <> 0) then
    raise exception 'RENEGOTIATION_ACTIVATION_CONTEXT_INCOMPLETE'
      using errcode = '23514';
  end if;
  return jsonb_build_object(
    'operationId', v_operation.id,
    'agreementId', v_operation.agreement_id,
    'requestId', v_operation.request_id,
    'state', v_operation.state,
    'leaseToken', v_operation.lease_token,
    'identity', jsonb_build_object(
      'alunoId', v_operation.aluno_id,
      'matriculaId', v_operation.matricula_id,
      'turmaId', v_operation.turma_id,
      'poloId', v_operation.polo_id
    ),
    'courseType', v_operation.course_type,
    'payerDocument', v_operation.activation_snapshot ->> 'payerDocument',
    'runtime', v_operation.gateway_runtime_snapshot,
    'replacementPlan', v_operation.activation_snapshot -> 'replacementPlan',
    'sources', v_sources,
    'replacements', v_replacements
  );
end;
$function$;

create function internal_finance.mark_receivable_renegotiation_activation_review(
  p_operation_id uuid,
  p_error_code text,
  p_details jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_now timestamptz := clock_timestamp();
  v_request_id uuid := gen_random_uuid();
  v_payload jsonb;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if coalesce(p_error_code, '') !~ '^[A-Z0-9_]{3,80}$'
    or jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Motivo de revisão inválido.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state = 'REVIEW_REQUIRED' then return; end if;
  if v_operation.state = 'ACTIVE' then
    raise exception 'Ativação concluída não pode retornar para revisão.'
      using errcode = 'PT409';
  end if;
  update public.receivable_renegotiation_activation_operations
  set state = 'REVIEW_REQUIRED', last_error_code = p_error_code,
      lease_token = null, lease_until = null, updated_at = v_now,
      review_required_at = v_now
  where id = v_operation.id;
  update public.receivable_renegotiation_agreements
  set lifecycle_status = 'REVIEW_REQUIRED', version = version + 1,
      review_required_at = v_now, updated_at = v_now
  where id = v_operation.agreement_id and lifecycle_status = 'ACTIVATING'
  returning * into v_agreement;
  if not found then
    raise exception 'Estado do acordo divergiu ao exigir revisão.'
      using errcode = '40001';
  end if;
  v_payload := jsonb_build_object(
    'operationId', v_operation.id,
    'errorCode', p_error_code,
    'details', p_details
  );
  insert into public.receivable_renegotiation_events (
    agreement_id, polo_id, event_type, from_lifecycle_status,
    to_lifecycle_status, version, actor_id, request_id, payload_hash, details
  ) values (
    v_agreement.id, v_agreement.polo_id, 'ACTIVATION_REVIEW_REQUIRED',
    'ACTIVATING', 'REVIEW_REQUIRED', v_agreement.version, null,
    v_request_id, internal_finance.receivable_renegotiation_hash(v_payload),
    v_payload
  );
end;
$function$;

create function internal_finance.assert_receivable_renegotiation_runtime_current(
  p_operation public.receivable_renegotiation_activation_operations
) returns void language plpgsql stable security definer set search_path = '' as $function$
declare
  v_runtime jsonb;
begin
  v_runtime := internal_finance.receivable_renegotiation_activation_runtime(
    p_operation.turma_id
  );
  if v_runtime is distinct from p_operation.gateway_runtime_snapshot
    or v_runtime ->> 'fingerprint' is distinct from
      p_operation.gateway_runtime_fingerprint then
    raise exception 'RENEGOTIATION_GATEWAY_RUNTIME_CHANGED'
      using errcode = 'PT409';
  end if;
end;
$function$;

create function public.claim_receivable_renegotiation_activation_secure(
  p_operation_id uuid,
  p_lease_seconds integer default 180
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
  v_lease_token uuid;
begin
  perform internal_finance.assert_receivable_renegotiation_worker();
  if p_operation_id is null or p_lease_seconds not between 30 and 300 then
    raise exception 'Parâmetros de lease inválidos.' using errcode = '22023';
  end if;
  select operation.* into strict v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.id = p_operation_id for update;
  if v_operation.state in ('ACTIVE', 'REVIEW_REQUIRED') then
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  begin
    perform internal_finance.assert_receivable_renegotiation_runtime_current(
      v_operation
    );
  exception when others then
    perform internal_finance.mark_receivable_renegotiation_activation_review(
      v_operation.id, 'GATEWAY_RUNTIME_CHANGED',
      jsonb_build_object('stage', 'CLAIM')
    );
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end;
  if v_operation.lease_until > now() then
    raise exception 'Ativação já está em execução.' using errcode = '55P03';
  end if;
  if v_operation.pix_recovery_first_pending_at is not null
    and v_operation.pix_recovery_first_pending_at <=
      clock_timestamp() - interval '7 days' then
    perform internal_finance.mark_receivable_renegotiation_activation_review(
      v_operation.id, 'BANESE_PIX_RECOVERY_EXPIRED',
      jsonb_build_object('stage', 'CLAIM')
    );
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  if v_operation.last_error_code = 'BANESE_PIX_PENDING'
    and v_operation.next_attempt_at > clock_timestamp() then
    raise exception 'BANESE_PIX_COOLDOWN' using errcode = '55P03';
  end if;
  if (v_operation.pix_recovery_first_pending_at is null
      and v_operation.attempt_count >= 100)
    or v_operation.attempt_count >= 500 then
    perform internal_finance.mark_receivable_renegotiation_activation_review(
      v_operation.id, 'ACTIVATION_ATTEMPT_LIMIT',
      jsonb_build_object('stage', 'CLAIM')
    );
    return internal_finance.receivable_renegotiation_activation_context(
      v_operation.id
    );
  end if;
  v_lease_token := gen_random_uuid();
  update public.receivable_renegotiation_activation_operations
  set lease_token = v_lease_token,
      lease_until = clock_timestamp() + make_interval(secs => p_lease_seconds),
      attempt_count = attempt_count + 1, updated_at = clock_timestamp()
  where id = v_operation.id;
  return internal_finance.receivable_renegotiation_activation_context(
    v_operation.id
  );
end;
$function$;

revoke all on function
  internal_finance.receivable_renegotiation_activation_context(uuid),
  internal_finance.mark_receivable_renegotiation_activation_review(
    uuid, text, jsonb
  ),
  internal_finance.assert_receivable_renegotiation_runtime_current(
    public.receivable_renegotiation_activation_operations
  ),
  public.claim_receivable_renegotiation_activation_secure(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_receivable_renegotiation_activation_secure(
  uuid, integer
) to service_role;

commit;
