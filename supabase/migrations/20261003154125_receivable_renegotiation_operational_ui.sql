begin;

create or replace function internal_finance.receivable_renegotiation_proposal_json(
  p_agreement_id uuid
) returns jsonb language sql stable security invoker set search_path = '' as $function$
  select jsonb_build_object(
    'id', agreement.id,
    'lifecycleStatus', agreement.lifecycle_status,
    'version', agreement.version,
    'poloId', agreement.polo_id,
    'alunoId', agreement.aluno_id,
    'matriculaId', agreement.matricula_id,
    'turmaId', agreement.turma_id,
    'studentName', student.nome,
    'className', turma.nome,
    'classCode', turma.codigo,
    'sourceCount', agreement.source_count,
    'sourcePrincipalCents', agreement.source_principal_cents,
    'sourceOpenCents', agreement.source_open_cents,
    'negotiatedCents', agreement.negotiated_cents,
    'installmentCount', agreement.installment_count,
    'firstDueDate', agreement.first_due_date,
    'asOf', agreement.as_of,
    'selectionFingerprint', agreement.selection_fingerprint,
    'policyFingerprint', agreement.policy_fingerprint,
    'calculationFingerprint', agreement.calculation_fingerprint,
    'proposalFingerprint', agreement.proposal_fingerprint,
    'reason', agreement.reason,
    'createdByName', creator.nome,
    'createdAt', agreement.created_at,
    'updatedAt', agreement.updated_at,
    'submittedAt', agreement.submitted_at,
    'canceledAt', agreement.canceled_at,
    'canceledReason', agreement.canceled_reason,
    'capabilities', internal_finance.receivable_renegotiation_activation_capabilities(agreement.id)
  )
  from public.receivable_renegotiation_agreements agreement
  join public.parceiros student on student.id = agreement.aluno_id
  join public.turmas turma on turma.id = agreement.turma_id
  left join public.usuarios_sistema creator
    on creator.auth_user_id = agreement.created_by
  where agreement.id = p_agreement_id;
$function$;

create or replace function public.get_receivable_renegotiation_readiness_secure(
  p_polo_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_build_ready boolean;
  v_rules_ready boolean;
  v_candidate_groups_ready boolean;
  v_candidate_items_ready boolean;
  v_preview_ready boolean;
  v_list_ready boolean;
  v_detail_ready boolean;
  v_save_ready boolean;
  v_discard_ready boolean;
  v_activation_ready boolean;
begin
  perform internal_finance.assert_receivable_renegotiation_scope(p_polo_id);
  v_activation_ready := internal_finance.receivable_renegotiation_activation_ready();
  v_build_ready := to_regprocedure(
    'internal_finance.build_receivable_renegotiation_snapshot(uuid[],jsonb,jsonb,date)'
  ) is not null;
  v_candidate_groups_ready := to_regprocedure(
    'public.list_receivable_renegotiation_candidate_groups_secure(uuid,text,integer,integer,date)'
  ) is not null;
  v_candidate_items_ready := to_regprocedure(
    'public.list_receivable_renegotiation_candidate_items_secure(uuid,date)'
  ) is not null;
  v_preview_ready := to_regprocedure(
    'public.preview_receivable_renegotiation_secure(uuid[],jsonb,jsonb,date)'
  ) is not null;
  v_rules_ready := v_build_ready and v_candidate_groups_ready
    and v_candidate_items_ready and v_preview_ready;
  v_list_ready := to_regprocedure(
    'public.list_receivable_renegotiation_proposals_secure(uuid,text,text,integer,integer)'
  ) is not null;
  v_detail_ready := to_regprocedure(
    'public.get_receivable_renegotiation_proposal_secure(uuid)'
  ) is not null;
  v_save_ready := v_rules_ready and v_preview_ready and to_regprocedure(
    'public.save_receivable_renegotiation_proposal_secure(uuid,uuid[],text,jsonb,jsonb,date,boolean,text)'
  ) is not null;
  v_discard_ready := to_regprocedure(
    'public.discard_receivable_renegotiation_proposal_secure(uuid,uuid,bigint,text,text)'
  ) is not null;
  return jsonb_build_object(
    'version', 2,
    'applied', true,
    'proposalOnly', not v_activation_ready,
    'buildReady', v_build_ready,
    'rulesReady', v_rules_ready,
    'lifecycleStatuses', jsonb_build_array('DRAFT', 'PROPOSED', 'CANCELED', 'ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED'),
    'capabilities', jsonb_build_object(
      'listProposals', v_list_ready,
      'viewProposal', v_detail_ready,
      'listCandidateGroups', v_candidate_groups_ready,
      'listCandidateItems', v_candidate_items_ready,
      'previewProposal', v_preview_ready,
      'saveProposal', v_save_ready,
      'discardProposal', v_discard_ready,
      'activateProposal', v_activation_ready,
      'cancelSourceTitles', v_activation_ready,
      'issueReplacementTitles', v_activation_ready,
      'getActivation', to_regprocedure('public.get_receivable_renegotiation_activation_secure(uuid)') is not null
    ),
    'unavailableReasons', jsonb_build_object(
      'listProposals', case when v_list_ready then null else 'RPC_NOT_APPLIED' end,
      'viewProposal', case when v_detail_ready then null else 'RPC_NOT_APPLIED' end,
      'listCandidateGroups', case when v_candidate_groups_ready then null
        else 'RPC_NOT_APPLIED' end,
      'listCandidateItems', case when v_candidate_items_ready then null
        else 'RPC_NOT_APPLIED' end,
      'previewProposal', case when v_preview_ready then null
        else 'RPC_NOT_APPLIED' end,
      'saveProposal', case
        when not v_build_ready then 'RENEGOTIATION_RULES_NOT_READY'
        when not v_rules_ready then 'RPC_NOT_APPLIED'
        when not v_save_ready then 'RPC_NOT_APPLIED' else null end,
      'discardProposal', case when v_discard_ready then null else 'RPC_NOT_APPLIED' end,
      'activateProposal', case when v_activation_ready then null else 'ACTIVATION_DEPENDENCIES_NOT_APPLIED' end,
      'cancelSourceTitles', case when v_activation_ready then null else 'ACTIVATION_DEPENDENCIES_NOT_APPLIED' end,
      'issueReplacementTitles', case when v_activation_ready then null else 'ACTIVATION_DEPENDENCIES_NOT_APPLIED' end
    )
  );
end;
$function$;

create or replace function public.list_receivable_renegotiation_proposals_secure(
  p_polo_id uuid default null,
  p_search text default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 20
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_total bigint;
  v_rows jsonb;
begin
  perform internal_finance.assert_receivable_renegotiation_scope(p_polo_id);
  if length(coalesce(v_search, '')) > 120
    or (v_status is not null and v_status not in ('DRAFT', 'PROPOSED', 'CANCELED', 'ACTIVATING', 'ACTIVE', 'REVIEW_REQUIRED'))
    or p_page is null or p_page < 1 or p_page > 1000000
    or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise exception 'Filtros ou paginação inválidos.' using errcode = '22023';
  end if;

  with filtered as materialized (
    select agreement.id, agreement.updated_at
    from public.receivable_renegotiation_agreements agreement
    join public.parceiros student on student.id = agreement.aluno_id
    join public.turmas turma on turma.id = agreement.turma_id
    where (p_polo_id is null or agreement.polo_id = p_polo_id)
      and (v_status is null or agreement.lifecycle_status = v_status)
      and (v_search is null
        or student.nome ilike '%' || v_search || '%'
        or turma.nome ilike '%' || v_search || '%'
        or turma.codigo ilike '%' || v_search || '%'
        or agreement.id::text = v_search)
  ), positioned as (
    select * from filtered order by updated_at desc, id desc
    limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
  )
  select
    (select count(*) from filtered),
    coalesce(jsonb_agg(
      internal_finance.receivable_renegotiation_proposal_json(positioned.id)
      order by positioned.updated_at desc, positioned.id desc
    ), '[]'::jsonb)
  into v_total, v_rows
  from positioned;

  return jsonb_build_object(
    'version', 1,
    'page', p_page,
    'pageSize', p_page_size,
    'totalItems', v_total,
    'totalPages', greatest(1, ceil(v_total::numeric / p_page_size)::integer),
    'rows', v_rows,
    'capabilities', jsonb_build_object(
      'proposalOnly', not internal_finance.receivable_renegotiation_activation_ready(),
      'canActivate', internal_finance.receivable_renegotiation_activation_ready()
    )
  );
end;
$function$;

create or replace function public.get_receivable_renegotiation_proposal_secure(
  p_agreement_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_agreement public.receivable_renegotiation_agreements%rowtype;
  v_sources jsonb;
  v_events jsonb;
begin
  if p_agreement_id is null then
    raise exception 'Identificador da proposta é obrigatório.' using errcode = '22023';
  end if;
  perform internal_finance.assert_receivable_renegotiation_identity();
  select agreement.* into v_agreement
  from public.receivable_renegotiation_agreements agreement
  where agreement.id = p_agreement_id
    and (coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.can_read_receivable_renegotiation_for_polo(agreement.polo_id));
  if not found then
    raise exception 'Proposta indisponível no escopo autorizado.' using errcode = '42501';
  end if;
  perform internal_finance.assert_receivable_renegotiation_scope(v_agreement.polo_id);

  select coalesce(jsonb_agg(
    item.source_snapshot || jsonb_build_object('releasedAt', item.released_at)
    order by item.position
  ), '[]'::jsonb)
  into v_sources
  from public.receivable_renegotiation_source_items item
  where item.agreement_id = p_agreement_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'eventType', event.event_type,
    'fromLifecycleStatus', event.from_lifecycle_status,
    'toLifecycleStatus', event.to_lifecycle_status,
    'version', event.version,
    'actorName', actor.nome,
    'details', event.details,
    'createdAt', event.created_at
  ) order by event.created_at, event.id), '[]'::jsonb)
  into v_events
  from public.receivable_renegotiation_events event
  left join public.usuarios_sistema actor on actor.auth_user_id = event.actor_id
  where event.agreement_id = p_agreement_id;

  return jsonb_build_object(
    'version', 1,
    'proposal', internal_finance.receivable_renegotiation_proposal_json(p_agreement_id),
    'sourceItems', v_sources,
    'terms', v_agreement.canonical_snapshot -> 'terms',
    'policyOverrides', v_agreement.canonical_snapshot -> 'policyOverrides',
    'policySnapshot', v_agreement.policy_snapshot,
    'calculationSnapshot', v_agreement.calculation_snapshot,
    'totals', v_agreement.canonical_snapshot -> 'totals',
    'schedule', v_agreement.canonical_snapshot -> 'schedule',
    'fingerprints', jsonb_build_object(
      'selection', v_agreement.selection_fingerprint,
      'policy', v_agreement.policy_fingerprint,
      'calculation', v_agreement.calculation_fingerprint,
      'proposal', v_agreement.proposal_fingerprint
    ),
    'canonicalSnapshot', v_agreement.canonical_snapshot,
    'events', v_events,
    'capabilities', internal_finance.receivable_renegotiation_activation_capabilities(p_agreement_id)
  );
end;
$function$;

revoke all on function internal_finance.receivable_renegotiation_proposal_json(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.get_receivable_renegotiation_readiness_secure(uuid),
  public.list_receivable_renegotiation_proposals_secure(uuid, text, text, integer, integer),
  public.get_receivable_renegotiation_proposal_secure(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_receivable_renegotiation_readiness_secure(uuid),
  public.list_receivable_renegotiation_proposals_secure(uuid, text, text, integer, integer),
  public.get_receivable_renegotiation_proposal_secure(uuid)
  to authenticated, service_role;

comment on function public.get_receivable_renegotiation_readiness_secure(uuid) is
  'Capacidades verificadas do cálculo e da ativação Banese. Efetivação não significa quitação do acordo.';

notify pgrst, 'reload schema';
commit;
