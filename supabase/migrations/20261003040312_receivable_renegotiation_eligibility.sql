begin;

create or replace function internal_finance.classify_receivable_renegotiation_eligibility(
  p_facts jsonb
) returns jsonb language plpgsql immutable security invoker set search_path = '' as $function$
declare
  v_code text := 'ELIGIBLE';
  v_reason text := 'Parcela elegível para renegociação.';
begin
  if not coalesce((p_facts ->> 'exists')::boolean, false) then
    v_code := 'NOT_FOUND'; v_reason := 'Parcela não encontrada.';
  elsif not coalesce((p_facts ->> 'identityComplete')::boolean, false) then
    v_code := 'MISSING_IDENTITY'; v_reason := 'A identidade financeira da parcela está incompleta.';
  elsif not coalesce((p_facts ->> 'open')::boolean, false) then
    v_code := 'NOT_OPEN'; v_reason := 'A parcela não está em aberto.';
  elsif coalesce((p_facts ->> 'partialPayment')::boolean, false) then
    v_code := 'PARTIAL_PAYMENT'; v_reason := 'Parcela com pagamento parcial exige revisão individual.';
  elsif coalesce((p_facts ->> 'proescManaged')::boolean, false) then
    v_code := 'PROESC_MANAGED'; v_reason := 'Obrigação Proesc é somente consulta.';
  elsif coalesce((p_facts ->> 'conflictingSource')::boolean, false) then
    v_code := 'CONFLICTING_SOURCE'; v_reason := 'A origem financeira está conflitante.';
  elsif coalesce((p_facts ->> 'remotePaid')::boolean, false) then
    v_code := 'REMOTE_PAYMENT_UNRECONCILED';
    v_reason := 'O provedor indica pagamento ainda não conciliado localmente.';
  elsif coalesce((p_facts ->> 'operationInProgress')::boolean, false) then
    v_code := 'OPERATION_IN_PROGRESS'; v_reason := 'Há outra operação financeira em andamento.';
  elsif coalesce((p_facts ->> 'renegotiationConflict')::boolean, false) then
    v_code := 'CONFLICTING_RENEGOTIATION';
    v_reason := 'A parcela já está vinculada a outra proposta em aberto.';
  elsif not coalesce((p_facts ->> 'supportedCharge')::boolean, false) then
    v_code := 'UNSUPPORTED_CHARGE_KIND';
    v_reason := 'Somente mensalidades do escopo inicial podem ser renegociadas.';
  elsif not coalesce((p_facts ->> 'supportedSource')::boolean, false) then
    v_code := 'UNSUPPORTED_SOURCE'; v_reason := 'O provedor desta parcela ainda não é suportado.';
  elsif coalesce((p_facts ->> 'bankManaged')::boolean, false)
    and not coalesce((p_facts ->> 'bankCancelable')::boolean, false) then
    v_code := 'BANK_IDENTITY_UNVERIFIED';
    v_reason := 'A identidade bancária não está comprovada para cancelamento futuro.';
  elsif not coalesce((p_facts ->> 'policyReadable')::boolean, false) then
    v_code := 'UNKNOWN_POLICY';
    v_reason := 'A política financeira congelada não é confiável para cálculo.';
  end if;
  return jsonb_build_object(
    'eligible', v_code = 'ELIGIBLE', 'code', v_code, 'reason', v_reason
  );
exception when others then
  return jsonb_build_object(
    'eligible', false, 'code', 'UNKNOWN_POLICY',
    'reason', 'A elegibilidade não pôde ser comprovada.'
  );
end;
$function$;

create or replace function internal_finance.receivable_renegotiation_eligibility(
  p_receivable public.contas_receber,
  p_as_of date
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_as_of date := coalesce(
    p_as_of, (pg_catalog.timezone('America/Maceio', pg_catalog.now()))::date
  );
  v_identity_complete boolean := false;
  v_modality text;
  v_policy_kind text;
  v_policy_readable boolean := false;
  v_supported_charge boolean := false;
  v_proesc boolean := false;
  v_operation boolean := false;
  v_renegotiation_conflict boolean := false;
  v_capabilities jsonb := '{}'::jsonb;
  v_source text := 'CONFLICT';
  v_remote_paid boolean := false;
  v_facts jsonb;
  v_result jsonb;
  v_snapshot jsonb;
  v_snapshot_value numeric;
  v_snapshot_interest numeric;
  v_snapshot_penalty numeric;
  v_snapshot_discount numeric;
begin
  if p_receivable is null or p_receivable.id is null then
    return internal_finance.classify_receivable_renegotiation_eligibility(
      jsonb_build_object('exists', false)
    ) || jsonb_build_object('asOf', v_as_of, 'overdue', false, 'policyKind', null);
  end if;

  select
    enrollment.id is not null
      and enrollment.aluno_id = p_receivable.cliente_id
      and enrollment.turma_id = p_receivable.turma_id
      and class.polo_id = p_receivable.polo_id,
    upper(coalesce(course.modalidade, ''))
  into v_identity_complete, v_modality
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_receivable.matricula_id;
  v_identity_complete := coalesce(v_identity_complete, false)
    and p_receivable.cliente_id is not null
    and p_receivable.turma_id is not null
    and p_receivable.polo_id is not null;

  select exists(
    select 1 from internal_proesc.obligation_links link
    where link.receivable_id = p_receivable.id
  ) into v_proesc;

  begin
    v_capabilities := internal_academic.receivable_operation_capabilities(p_receivable);
    v_source := coalesce(v_capabilities ->> 'sourceSystem', 'CONFLICT');
  exception when others then
    v_capabilities := jsonb_build_object('sourceSystem', 'CONFLICT');
    v_source := 'CONFLICT';
  end;

  v_remote_paid := upper(coalesce(p_receivable.gateway_status, '')) in (
    'PAID', 'PAGO', 'RECEIVED', 'CONFIRMED', 'LIQUIDATED'
  );
  v_operation := p_receivable.gateway_submission_status in (
    'API_AMBIGUOUS', 'API_REVIEW', 'CNAB_GENERATED', 'CNAB_SENT'
  ) or exists(
    select 1 from public.receivable_manual_settlements settlement
    where settlement.receivable_id = p_receivable.id
      and settlement.state in (
        'STARTED', 'REMOTE_CANCELED_LOCAL_PENDING', 'FAILED_SAFE', 'REVIEW_REQUIRED'
      )
  ) or exists(
    select 1 from public.banese_cancellation_outbox job
    where job.receivable_id = p_receivable.id and job.state <> 'DONE'
  );
  select exists(
    select 1
    from public.receivable_renegotiation_source_items source_item
    join public.receivable_renegotiation_agreements agreement
      on agreement.id = source_item.agreement_id
    where source_item.receivable_id = p_receivable.id
      and source_item.released_at is null
  ) into v_renegotiation_conflict;

  v_supported_charge := upper(coalesce(p_receivable.tipo_lancamento, '')) = 'PARCELA'
    and p_receivable.regra_financeira_dependencia_snapshot is null
    and p_receivable.valor > 0
    and p_receivable.valor <= 90000000000000
    and round(p_receivable.valor, 2) = p_receivable.valor
    and p_receivable.data_vencimento is not null
    and pg_catalog.isfinite(p_receivable.data_vencimento);

  if v_supported_charge
    and v_modality in ('TECNICO', 'TÉCNICO')
    and p_receivable.regra_financeira_tecnica_snapshot is not null
    and p_receivable.regra_financeira_plano_unico_snapshot is null
  then
    v_snapshot := p_receivable.regra_financeira_tecnica_snapshot;
    begin
      if jsonb_typeof(v_snapshot) <> 'object'
        or coalesce(v_snapshot ->> 'tipoLancamento', '') <> 'MENSALIDADE'
        or coalesce(v_snapshot ->> 'origem', '') not in ('INDIVIDUAL', 'TURMA')
        or coalesce(v_snapshot ->> 'valorBase', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'descontoPontualidade', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'jurosAtrasoPercentual', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'multaAtrasoValor', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'aplicarMultaJuros', '') not in ('true', 'false')
      then
        raise exception 'invalid technical source policy' using errcode = '22000';
      end if;
      v_snapshot_value := (v_snapshot ->> 'valorBase')::numeric;
      v_snapshot_discount := (v_snapshot ->> 'descontoPontualidade')::numeric;
      v_snapshot_interest := (v_snapshot ->> 'jurosAtrasoPercentual')::numeric;
      v_snapshot_penalty := (v_snapshot ->> 'multaAtrasoValor')::numeric;
      if round(v_snapshot_value, 2) <> p_receivable.valor
        or v_snapshot_discount > 90000000000000
        or v_snapshot_interest not between 0 and 100
        or v_snapshot_penalty > 90000000000000
      then
        raise exception 'technical source amount mismatch' using errcode = '22000';
      end if;
      perform internal_finance.resolve_receivable_renegotiation_policy(
        p_receivable.matricula_id, 'TECNICO'
      );
      v_policy_kind := 'TECNICO';
      v_policy_readable := true;
    exception when others then
      v_policy_readable := false;
    end;
  elsif v_supported_charge
    and v_modality in ('LIVRE', 'ESPECIALIZACAO', 'ESPECIALIZAÇÃO')
    and p_receivable.regra_financeira_plano_unico_snapshot is not null
    and p_receivable.regra_financeira_tecnica_snapshot is null
  then
    v_snapshot := p_receivable.regra_financeira_plano_unico_snapshot;
    begin
      if jsonb_typeof(v_snapshot) <> 'object'
        or coalesce(v_snapshot ->> 'origem', '') <> 'PLANO_UNICO'
        or coalesce(v_snapshot -> 'parcela' ->> 'tipo', '') <> 'PARCELA'
        or coalesce(v_snapshot -> 'parcela' ->> 'valor', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot -> 'parcela' ->> 'numero', '') !~ '^[0-9]+$'
        or coalesce(v_snapshot -> 'parcela' ->> 'dataVencimento', '')
          !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or coalesce(v_snapshot ->> 'descontoPontualidade', '')
          !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'jurosAtrasoPercentual', '')
          !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_snapshot ->> 'multaAtraso', '')
          !~ '^[0-9]+([.][0-9]+)?$'
      then
        raise exception 'invalid single-plan source policy' using errcode = '22000';
      end if;
      v_snapshot_discount := (v_snapshot ->> 'descontoPontualidade')::numeric;
      v_snapshot_interest := (v_snapshot ->> 'jurosAtrasoPercentual')::numeric;
      v_snapshot_penalty := (v_snapshot ->> 'multaAtraso')::numeric;
      if round((v_snapshot -> 'parcela' ->> 'valor')::numeric, 2) <> p_receivable.valor
        or (v_snapshot -> 'parcela' ->> 'numero')::integer
          is distinct from p_receivable.parcela_numero
        or (v_snapshot -> 'parcela' ->> 'dataVencimento')::date
          is distinct from p_receivable.data_vencimento
        or v_snapshot_discount > 90000000000000
        or v_snapshot_interest not between 0 and 100
        or v_snapshot_penalty > 90000000000000
        or not exists(
          select 1 from public.matriculas_plano_financeiro_unico enrollment_plan
          where enrollment_plan.matricula_id = p_receivable.matricula_id
            and enrollment_plan.turma_id = p_receivable.turma_id
            and enrollment_plan.aluno_id = p_receivable.cliente_id
            and enrollment_plan.regra_snapshot ->> 'fingerprint'
              = v_snapshot ->> 'fingerprint'
        )
      then
        raise exception 'single-plan source mismatch' using errcode = '22000';
      end if;
      perform internal_finance.resolve_receivable_renegotiation_policy(
        p_receivable.matricula_id, 'PLANO_UNICO'
      );
      v_policy_kind := 'PLANO_UNICO';
      v_policy_readable := true;
    exception when others then
      v_policy_readable := false;
    end;
  end if;

  v_facts := jsonb_build_object(
    'exists', true,
    'identityComplete', v_identity_complete,
    'open', p_receivable.status in ('PENDENTE', 'VENCIDO')
      and p_receivable.data_pagamento is null,
    'partialPayment', coalesce(p_receivable.valor_pago, 0) <> 0,
    'proescManaged', v_proesc or v_source = 'PROESC',
    'conflictingSource', v_source = 'CONFLICT',
    'remotePaid', v_remote_paid,
    'operationInProgress', v_operation,
    'renegotiationConflict', v_renegotiation_conflict,
    'supportedCharge', v_supported_charge,
    'supportedSource', v_source in ('LOCAL', 'BANESE'),
    'bankManaged', v_source = 'BANESE',
    'bankCancelable', coalesce((v_capabilities ->> 'canCancel')::boolean, false),
    'policyReadable', v_policy_readable
  );
  v_result := internal_finance.classify_receivable_renegotiation_eligibility(v_facts);
  return v_result || jsonb_build_object(
    'asOf', v_as_of,
    'overdue', p_receivable.data_vencimento < v_as_of,
    'policyKind', v_policy_kind,
    'sourceSystem', v_source
  );
end;
$function$;

create or replace function internal_finance.receivable_renegotiation_eligibility(
  p_receivable_id uuid,
  p_as_of date default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $function$
declare
  v_receivable public.contas_receber%rowtype;
begin
  select * into v_receivable from public.contas_receber where id = p_receivable_id;
  return internal_finance.receivable_renegotiation_eligibility(v_receivable, p_as_of);
end;
$function$;

revoke all on function internal_finance.classify_receivable_renegotiation_eligibility(jsonb),
  internal_finance.receivable_renegotiation_eligibility(public.contas_receber, date),
  internal_finance.receivable_renegotiation_eligibility(uuid, date)
  from public, anon, authenticated, service_role;

commit;
