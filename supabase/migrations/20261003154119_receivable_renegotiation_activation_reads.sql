begin;

create function internal_finance.receivable_renegotiation_activation_ready()
returns boolean language sql stable security invoker set search_path = '' as $function$
  select bool_and(to_regprocedure(signature) is not null)
  from unnest(array[
    'public.start_receivable_renegotiation_activation_secure(uuid,uuid,bigint,text,boolean,boolean)',
    'public.get_receivable_renegotiation_activation_secure(uuid)',
    'public.claim_receivable_renegotiation_activation_secure(uuid,integer)',
    'public.mark_receivable_renegotiation_cancel_intent_secure(uuid,uuid,uuid,uuid)',
    'public.confirm_receivable_renegotiation_source_cancel_secure(uuid,uuid,uuid,uuid,jsonb)',
    'public.prepare_receivable_renegotiation_replacements_secure(uuid,uuid)',
    'public.mark_receivable_renegotiation_issuance_intent_secure(uuid,uuid,uuid,uuid)',
    'public.record_receivable_renegotiation_bank_response_secure(uuid,uuid,uuid,uuid,jsonb)',
    'public.confirm_receivable_renegotiation_replacement_issued_secure(uuid,uuid,uuid,uuid,jsonb)',
    'public.finish_receivable_renegotiation_activation_secure(uuid,uuid)',
    'public.release_receivable_renegotiation_activation_secure(uuid,uuid,text)',
    'public.mark_receivable_renegotiation_activation_review_secure(uuid,uuid,text)',
    'internal_finance.build_receivable_renegotiation_schedule_v2(bigint,bigint,integer,date,date,text,integer)'
  ]::text[]) signature;
$function$;

create function internal_finance.receivable_renegotiation_activation_capabilities(
  p_agreement_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  with state as (
    select agreement.lifecycle_status,
      agreement.canonical_snapshot ->> 'version' = '2'
        and agreement.policy_snapshot #>> '{receiptPolicy,daysAfterDue}' = '60'
        and jsonb_typeof(agreement.canonical_snapshot -> 'requiresApproval') = 'boolean'
        as terms_ready,
      agreement.canonical_snapshot -> 'requiresApproval' = 'true'::jsonb
        as approval_required,
      internal_finance.can_approve_receivable_renegotiation_terms(agreement.polo_id)
        as can_approve_custom_terms,
      operation.id as operation_id,
      operation.state as operation_state,
      operation.actor_id is not distinct from auth.uid() as same_actor,
      internal_finance.receivable_renegotiation_activation_ready() as ready
    from public.receivable_renegotiation_agreements agreement
    left join public.receivable_renegotiation_activation_operations operation
      on operation.agreement_id = agreement.id
    where agreement.id = p_agreement_id
  ), allowed as (
    select *,
      ready and lifecycle_status = 'PROPOSED'
        and coalesce(terms_ready, false) and operation_id is null
        and (not approval_required or can_approve_custom_terms) as can_activate,
      ready and lifecycle_status = 'ACTIVATING' and same_actor
        and (not approval_required or can_approve_custom_terms)
        and operation_state in ('CANCELING_SOURCES', 'ISSUING_REPLACEMENTS')
        as can_resume
    from state
  )
  select jsonb_build_object(
    'proposalOnly', false,
    'canDiscard', lifecycle_status in ('DRAFT', 'PROPOSED') and operation_id is null,
    'canActivate', can_activate,
    'canApproveCustomTerms', can_approve_custom_terms,
    'canResume', coalesce(can_resume, false),
    'canCancelSourceTitles', can_activate or coalesce(can_resume, false),
    'canIssueReplacementTitles', can_activate or coalesce(can_resume, false),
    'activationUnavailableReason', case
      when not ready then 'ACTIVATION_DEPENDENCIES_NOT_APPLIED'
      when lifecycle_status = 'REVIEW_REQUIRED' then 'ACTIVATION_REVIEW_REQUIRED'
      when lifecycle_status = 'ACTIVE' then 'AGREEMENT_ALREADY_ACTIVE'
      when operation_id is not null and not same_actor then 'ACTIVATION_ACTOR_MISMATCH'
      when operation_id is not null then 'ACTIVATION_ALREADY_STARTED'
      when lifecycle_status <> 'PROPOSED' then 'PROPOSAL_NOT_SUBMITTED'
      when coalesce(approval_required, false) and not can_approve_custom_terms
        then 'RENEGOTIATION_APPROVAL_REQUIRED'
      when not coalesce(terms_ready, false) then 'PROPOSAL_REQUIRES_NEW_SIMULATION'
      else null end
  ) from allowed;
$function$;

create function public.get_receivable_renegotiation_activation_secure(
  p_agreement_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_operation public.receivable_renegotiation_activation_operations%rowtype;
begin
  if p_agreement_id is null then
    raise exception 'Identificador do acordo é obrigatório.' using errcode = '22023';
  end if;
  perform internal_finance.assert_receivable_renegotiation_identity();
  -- Não distingue acordo ausente de acordo fora do escopo autorizado.
  select agreement.* into v_agreement
  from public.receivable_renegotiation_agreements agreement
  where agreement.id = p_agreement_id
    and (coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.can_read_receivable_renegotiation_for_polo(agreement.polo_id));
  if not found then
    raise exception 'Acordo indisponível no escopo autorizado.' using errcode = '42501';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_agreement.polo_id);
  select operation.* into v_operation
  from public.receivable_renegotiation_activation_operations operation
  where operation.agreement_id = p_agreement_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'operationId', v_operation.id, 'agreementId', v_agreement.id,
    'requestId', v_operation.request_id, 'state', v_operation.state,
    'expectedVersion', v_operation.expected_version,
    'expectedFingerprint', v_operation.expected_fingerprint,
    'approvedCustomTerms', coalesce(
      v_operation.activation_snapshot #> '{customTermsApproval,approved}' = 'true'::jsonb,
      false
    ),
    'agreementVersion', v_agreement.version,
    'proposalFingerprint', v_agreement.proposal_fingerprint,
    'sourcesTotal', v_operation.source_count,
    'sourcesCanceled', (select count(*)
      from public.receivable_renegotiation_activation_sources source
      where source.operation_id = v_operation.id and source.state = 'CANCELED_CONFIRMED'),
    'replacementsTotal', v_operation.replacement_count,
    'replacementsIssued', (select count(*)
      from public.receivable_renegotiation_replacements replacement
      where replacement.operation_id = v_operation.id and replacement.state = 'ISSUED'),
    'retryable', v_operation.state in ('CANCELING_SOURCES', 'ISSUING_REPLACEMENTS')
      and v_operation.actor_id is not distinct from auth.uid(),
    'lastErrorCode', v_operation.last_error_code,
    'createdAt', v_operation.created_at, 'updatedAt', v_operation.updated_at,
    'completedAt', v_operation.completed_at
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_activation_ready(),
  internal_finance.receivable_renegotiation_activation_capabilities(uuid),
  public.get_receivable_renegotiation_activation_secure(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_receivable_renegotiation_activation_secure(uuid)
  to authenticated, service_role;

commit;
