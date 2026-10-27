-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
-- READ-ONLY reference fetched 2026-10-27 11:51 UTC. Not a migration.
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

  if not coalesce((
    public.gestor_has_financeiro_tab('receber')
    and public.is_gestor_for_polo(v_receivable.polo_id)
  ), false) then
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
    if v_existing.receivable_id is distinct from v_receivable.id
      or v_existing.matricula_id is distinct from v_run.matricula_id
      or v_existing.turma_id is distinct from v_run.turma_id
      or v_existing.cycle_number is distinct from v_run.cycle_number
      or v_receivable.regra_financeira_tecnica_snapshot
        -> 'cicloManual' ->> 'requestId' is distinct from v_run.request_id::text
    then
      raise exception 'A autorização não corresponde à mesma operação do ciclo. A emissão exige revisão.'
        using errcode = 'PT422',
          detail = 'CYCLE_AUTHORIZATION_CONTEXT_MISMATCH';
    end if;
    if v_existing.receivable_fingerprint is distinct from v_fingerprint then
      raise exception 'Os dados da cobrança diferem da autorização original. Revise a operação antes de retomar.'
        using errcode = 'PT422',
          detail = 'CYCLE_AUTHORIZATION_FINGERPRINT_MISMATCH';
    end if;

    -- O consentimento original permanece imutável. O gestor atual já passou
    -- por RBAC, polo, situação acadêmica e prova canônica do recebível.
    -- A mesma request não cria outra operação e não muda seu estado bancário.
    if v_existing.authorized_by is distinct from v_actor and not exists (
      select 1 from public.historico_turma_financeira audit
      where audit.matricula_id = v_run.matricula_id
        and audit.evento = 'CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR'
        and audit.regra ->> 'receivableId' = p_receivable_id::text
        and audit.regra ->> 'authorizationRequestId' = p_request_id::text
        and audit.regra ->> 'cycleRequestId' = v_run.request_id::text
        and audit.regra ->> 'resumedBy' = v_actor::text
    ) then
      perform public.registrar_turma_financeiro_auditoria(
        v_run.matricula_id,
        'CICLO_TECNICO_MANUAL_RETOMADA_OUTRO_GESTOR',
        jsonb_build_object(
          'receivableId', p_receivable_id,
          'cycleNumber', v_run.cycle_number,
          'cycleRequestId', v_run.request_id,
          'authorizationRequestId', p_request_id,
          'originalAuthorizedBy', v_existing.authorized_by,
          'resumedBy', v_actor,
          'fingerprint', v_fingerprint
        ),
        'Retomada da mesma operação por gestor autorizado; consentimento e identidade bancária preservados.'
      );
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
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb;
begin
  v_state := internal_academic.technical_manual_cycle_state_before_manager_decision(p_matricula_id);
  if v_state->>'habilitado' <> 'true' or v_state->>'modo' <> 'MANUAL'
    or v_state->>'proximoCicloNumero' is distinct from '2'
    or v_state->>'estado' not in ('ELEGIVEL', 'BLOQUEADO') then
    return v_state;
  end if;
  if internal_academic.technical_manual_monthly_count(p_matricula_id) >= 24 then
    return (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'BLOQUEADO', 'podeGerar', false,
      'bloqueio', jsonb_build_object('codigo', 'PARCELAS_COMPLETAS',
        'mensagem', 'Esta matrícula já possui 24 mensalidades. Consulte as cobranças existentes.'));
  end if;
  if internal_academic.manager_second_cycle_permitted(p_matricula_id)
    and coalesce(v_state#>>'{bloqueio,codigo}', '') in (
      '', 'PROESC_CONFERENCIA_ATUALIZADA_NECESSARIA',
      'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA', 'PROESC_REVIEW_REQUIRED',
      'HISTORICO_EXTERNO_REQUER_REVISAO', 'INADIMPLENCIA_CICLO_ANTERIOR',
      'CICLO_ANTERIOR_INCOMPLETO', 'CICLO_ANTERIOR_EMISSAO_PENDENTE') then
    v_state := (v_state - 'conferenciaProesc') || jsonb_build_object(
      'estado', 'ELEGIVEL', 'podeGerar', true, 'bloqueio', null);
    v_state := jsonb_set(v_state, '{politica,fingerprint}', to_jsonb(encode(extensions.digest(
      jsonb_build_object('base', v_state#>>'{politica,fingerprint}',
        'decision', 'GESTOR_C2_MENOS_24_V1',
        'monthlyCount', internal_academic.technical_manual_monthly_count(p_matricula_id))::text,
      'sha256'), 'hex')));
  end if;
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_manager_decision(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_entry internal_academic.technical_transfer_entry_plans%rowtype; v_state jsonb;
  v_max integer; v_next integer; v_first date; v_has_items boolean; v_fingerprint text;
begin
  select * into v_entry from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found or v_entry.financial_plan->'versao' is distinct from '3'::jsonb then
    return internal_academic.technical_manual_cycle_state_before_transfer_schedule(p_matricula_id);
  end if;
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  v_max:=(v_entry.rule_snapshot#>>'{continuidade,maxCiclos}')::integer;
  v_fingerprint:=internal_academic.transfer_schedule_fingerprint(v_entry.financial_plan);
  v_state:=v_state||jsonb_build_object('cicloMaximo',v_max,'planoEntrada',jsonb_build_object(
    'versao',3,'requestId',v_entry.request_id,'cicloInicial',v_entry.initial_cycle,'maxCiclos',v_max,
    'itens',v_entry.financial_plan->'itens','cronogramaFingerprint',v_fingerprint));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_entry.initial_cycle,
      'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
  end if;
  v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
    jsonb_build_object('base',v_state#>>'{politica,fingerprint}','requestId',v_entry.request_id,
      'cronogramaFingerprint',v_fingerprint,'maxCiclos',v_max)::text,'sha256'),'hex')));
  v_next:=(v_state->>'proximoCicloNumero')::integer;
  if v_next>v_max then
    return v_state||jsonb_build_object('estado','JA_GERADO','podeGerar',false,
      'proximoCicloNumero',null,'primeiroVencimentoSugerido',null,'bloqueio',null);
  elsif v_next is not null then
    select (i->>'vencimento')::date into v_first from jsonb_array_elements(v_entry.financial_plan->'itens') i
      where (i->>'cicloNumero')::integer=v_next order by (i->>'ordem')::integer limit 1;
    v_has_items:=found;
    v_state:=v_state||jsonb_build_object('primeiroVencimentoSugerido',coalesce(v_first,
      timezone('America/Maceio',now())::date));
    if not v_has_items and v_state->>'estado' in ('ELEGIVEL','BLOQUEADO') then
      v_state:=v_state||jsonb_build_object('estado','BLOQUEADO','podeGerar',false,
        'bloqueio',jsonb_build_object('codigo','SEM_COBRANCAS_PLANEJADAS',
          'mensagem','Este cronograma individual não possui cobranças para o ciclo.'));
    end if;
  end if;
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_state_before_transfer_schedule(p_matricula_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_state jsonb; v_plan internal_academic.technical_transfer_entry_plans%rowtype;
  v_max integer; v_next integer; v_monthly boolean; v_fee boolean;
begin
  v_state:=internal_academic.technical_manual_cycle_state_before_transfer_entry(p_matricula_id);
  select * into v_plan from internal_academic.technical_transfer_entry_plans where matricula_id=p_matricula_id;
  if not found then return v_state; end if;
  v_monthly:=coalesce((v_plan.financial_plan->>'cobrarMensalidades')::boolean,true);
  v_max:=greatest(v_plan.initial_cycle,
    coalesce((v_plan.rule_snapshot#>>'{continuidade,maxCiclos}')::integer,2));
  v_state:=v_state||jsonb_build_object('cicloMaximo',v_max,'planoEntrada',jsonb_build_object(
    'cicloInicial',v_plan.initial_cycle,'quantidadeParcelas',v_plan.installment_count,
    'primeiroVencimento',v_plan.first_due_date,'justificativaCiclo2',v_plan.cycle_two_reason,
    'requestId',v_plan.request_id,'cobrarMensalidades',v_monthly,
    'condicoes',coalesce(v_plan.financial_plan->'condicoes',
      internal_academic.transfer_entry_conditions(v_plan.rule_snapshot))));
  if internal_academic.technical_local_cycle_eligible(p_matricula_id)
    and v_state->>'estado'='ELEGIVEL' and v_state->'cicloGerado'='null'::jsonb
    and not exists(select 1 from internal_academic.technical_manual_cycle_runs where matricula_id=p_matricula_id) then
    v_state:=v_state||jsonb_build_object('cicloBaseHistorico',0,'proximoCicloNumero',v_plan.initial_cycle,
      'primeiroVencimentoSugerido',v_plan.first_due_date,'criterioElegibilidade','TRANSFERENCIA_PLANEJADA');
  end if;
  v_state:=jsonb_set(v_state,'{politica,fingerprint}',to_jsonb(encode(extensions.digest(
    jsonb_build_object('base',v_state#>>'{politica,fingerprint}','entry',v_plan.financial_plan,
      'requestId',v_plan.request_id,'maximum',v_max)::text,'sha256'),'hex')));
  v_next:=(v_state->>'proximoCicloNumero')::integer;
  if v_next>v_max then
    v_state:=v_state||jsonb_build_object('estado','JA_GERADO','podeGerar',false,
      'proximoCicloNumero',null,'bloqueio',null);
  elsif v_next is not null and not v_monthly then
    v_fee:=coalesce((v_plan.rule_snapshot#>>(case when v_next=1
      then '{cobranca,matricula,habilitada}'::text[]
      else '{cobranca,rematricula,habilitada}'::text[] end))::boolean,false);
    if not v_fee and v_state->>'estado'='ELEGIVEL' then
      v_state:=v_state||jsonb_build_object('estado','BLOQUEADO','podeGerar',false,
        'bloqueio',jsonb_build_object('codigo','SEM_COBRANCAS_PLANEJADAS',
          'mensagem','Este plano individual não possui cobranças selecionadas para o ciclo.'));
    end if;
  end if;
  return v_state;
end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.manager_second_cycle_permitted(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    join public.cursos c on c.id = t.curso_id
    where m.id = p_matricula_id and upper(m.status) in ('ATIVO', 'PENDENTE')
      and upper(c.modalidade) in ('TECNICO', 'TÉCNICO')
      and exists (select 1 from public.matriculas_tecnicas_financeiro_config cfg
        where cfg.matricula_id = m.id)
      and internal_academic.technical_manual_monthly_count(m.id) < 24
      and not internal_academic.technical_imported_cycle_has_conflict(m.id)
      and not internal_academic.technical_imported_cycle_exists(m.id, 2)
      and not internal_academic.technical_cycle_history_outside_enrollment(m.id)
      and (
        exists (select 1 from internal_academic.technical_manual_cycle_policies p
          where p.turma_id = m.turma_id and p.active and p.generation_mode = 'MANUAL'
            and p.baseline_cycle = 1 and p.max_cycle = 2)
        or exists (select 1 from internal_academic.technical_manual_cycle_runs run
          where run.matricula_id = m.id and run.cycle_number = 1
            and run.state in ('LOCAL_CREATED', 'PROTECTED_EXISTING'))
      )
      and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
        where run.matricula_id = m.id and run.cycle_number = 2
          and not (run.state = 'GENERATING' and run.completed_at is null
            and run.request_id is not null
            and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)))
      and not exists (select 1 from public.contas_receber r
        where r.matricula_id = m.id and r.status <> 'CANCELADO'
          and (r.tipo_lancamento = 'REMATRICULA'
            or r.regra_financeira_tecnica_snapshot#>>'{cicloManual,cicloNumero}' = '2'
            or r.origem_cronograma_id = 'ciclo-1-rematricula'
            or r.origem_cronograma_id like 'ciclo-2-parc-%')
          and not exists (select 1 from internal_academic.technical_manual_cycle_runs run
            where run.matricula_id = m.id and run.cycle_number = 2
              and run.state = 'GENERATING' and run.completed_at is null
              and run.request_id is not null
              and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
              and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text))
      and not exists (select 1 from internal_academic.technical_external_cycle_coverage cov
        where cov.matricula_id = m.id)
      and not exists (select 1 from internal_proesc.enrollment_cycle_evidence e
        where e.matricula_id = m.id and e.verification = 'CONFIRMED'
          and e.has_external_cycle2 is true)
      and not exists (select 1 from internal_proesc.obligation_links l
        join internal_proesc.obligation_imports i on i.link_id = l.id
        where l.matricula_id = m.id and i.source_cycle in ('SECOND', 'FULL_CONTRACT'))
  );
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.technical_manual_monthly_count(p_matricula_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::integer from public.contas_receber r
  where r.matricula_id = p_matricula_id and r.tipo_lancamento = 'PARCELA'
    and r.status <> 'CANCELADO'
    and not exists (
      select 1 from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id and run.cycle_number = 2
        and run.state = 'GENERATING' and run.completed_at is null
        and run.request_id is not null
        and coalesce(run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid, false)
        and r.regra_financeira_tecnica_snapshot#>>'{cicloManual,requestId}' = run.request_id::text
    );
$function$;

