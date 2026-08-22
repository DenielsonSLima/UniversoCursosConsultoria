begin;

create or replace function internal_academic.validate_nontechnical_condition_code_v2(
  p_code text
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_code text := pg_catalog.btrim(coalesce(p_code, ''));
begin
  if pg_catalog.length(v_code) not between 8 and 32
    or pg_catalog.octet_length(v_code) > 72
    or v_code !~ '[A-Za-z]'
    or v_code !~ '[0-9]'
  then
    raise exception 'O código deve ter de 8 a 32 caracteres, com pelo menos uma letra e um número.'
      using errcode = '22023';
  end if;
  return v_code;
end;
$function$;

revoke all on function internal_academic.validate_nontechnical_condition_code_v2(text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.normalize_nontechnical_condition_reason_v2(
  p_reason text,
  p_justification text default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_reason text := upper(pg_catalog.btrim(coalesce(p_reason, '')));
  v_justification text := pg_catalog.btrim(coalesce(p_justification, ''));
begin
  if v_reason not in (
    'BOLSA', 'CONVENIO', 'INCENTIVO', 'NEGOCIACAO',
    'A_VISTA', 'OUTRO'
  ) then
    raise exception 'Motivo da condição individual inválido.' using errcode = '22023';
  end if;
  if pg_catalog.length(v_justification) > 300
    or (v_reason = 'OUTRO' and pg_catalog.length(v_justification) not between 5 and 300)
  then
    raise exception 'Descreva o motivo em 5 a 300 caracteres.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'motivo', v_reason,
    'justificativa', nullif(v_justification, '')
  );
end;
$function$;

revoke all on function internal_academic.normalize_nontechnical_condition_reason_v2(text, text)
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_manage_nontechnical_condition_code_v2(
  p_turma_id uuid,
  p_require_settings boolean default false
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform internal_academic.assert_can_operate_nontechnical_plan_v2(p_turma_id, true);
  if not internal_academic.is_service_financial_actor()
    and p_require_settings
    and not public.gestor_has_tab('gestao', 'configuracoes')
  then
    raise exception 'Sem permissão para redefinir o código financeiro desta turma.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_manage_nontechnical_condition_code_v2(
  uuid, boolean
) from public, anon, authenticated, service_role;

create or replace function public.obter_status_codigo_condicao_individual_plano_unico_secure(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_code record;
begin
  perform internal_academic.assert_can_manage_nontechnical_condition_code_v2(
    p_turma_id, false
  );
  select code.revision, code.updated_at into v_code
  from internal_academic.nontechnical_condition_codes code
  where code.turma_id = p_turma_id;
  return jsonb_build_object(
    'turmaId', p_turma_id,
    'configurado', found,
    'revisao', case when found then v_code.revision else null end,
    'atualizadoEm', case when found then v_code.updated_at else null end
  );
end;
$function$;

revoke all on function public.obter_status_codigo_condicao_individual_plano_unico_secure(uuid)
  from public, anon;
grant execute on function public.obter_status_codigo_condicao_individual_plano_unico_secure(uuid)
  to authenticated, service_role;

create or replace function public.redefinir_codigo_condicao_individual_plano_unico_secure(
  p_turma_id uuid,
  p_request_id uuid,
  p_novo_codigo text,
  p_justificativa text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text;
  v_justification text := pg_catalog.btrim(coalesce(p_justificativa, ''));
  v_payload_hash text;
  v_existing record;
  v_revision integer;
  v_updated_at timestamptz;
  v_response jsonb;
begin
  if p_request_id is null then
    raise exception 'requestId é obrigatório.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_manage_nontechnical_condition_code_v2(
    p_turma_id, true
  );
  v_code := internal_academic.validate_nontechnical_condition_code_v2(p_novo_codigo);
  if pg_catalog.length(v_justification) not between 5 and 300 then
    raise exception 'Informe uma justificativa de 5 a 300 caracteres.'
      using errcode = '22023';
  end if;
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'justificativa', v_justification
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nontechnical-single-plan-request:' || p_request_id::text, 0
  ));
  select request.operation, request.actor_id, request.payload_hash, request.response
  into v_existing
  from internal_academic.nontechnical_financial_requests request
  where request.request_id = p_request_id;
  if found then
    if v_existing.operation <> 'REDEFINIR_CODIGO_CONDICAO_PLANO_UNICO'
      or v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
      or not exists (
        select 1 from internal_academic.nontechnical_condition_codes code
        where code.turma_id = p_turma_id
          and extensions.crypt(v_code, code.code_hash) = code.code_hash
      )
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform 1 from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id for update;
  if not found then
    raise exception 'Esta turma não utiliza plano financeiro único.' using errcode = '22023';
  end if;
  insert into internal_academic.nontechnical_condition_codes(
    turma_id, code_hash, revision, updated_by, updated_at
  ) values (
    p_turma_id, extensions.crypt(v_code, extensions.gen_salt('bf', 10)),
    1, auth.uid(), now()
  ) on conflict (turma_id) do update set
    code_hash = excluded.code_hash,
    revision = internal_academic.nontechnical_condition_codes.revision + 1,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning revision, updated_at into v_revision, v_updated_at;
  delete from internal_academic.nontechnical_condition_attempts attempt
  where attempt.turma_id = p_turma_id;
  insert into public.historico_turma_financeira(
    turma_id, matricula_id, evento, regra, observacao
  ) values (
    p_turma_id, null, 'CODIGO_CONDICAO_PLANO_UNICO_REDEFINIDO',
    jsonb_build_object(
      'codigoConfigurado', true,
      'revisao', v_revision,
      'atorId', auth.uid()
    ),
    v_justification
  );
  v_response := jsonb_build_object(
    'operacao', 'REDEFINIR_CODIGO_CONDICAO_PLANO_UNICO',
    'requestId', p_request_id,
    'replayed', false,
    'status', jsonb_build_object(
      'turmaId', p_turma_id,
      'configurado', true,
      'revisao', v_revision,
      'atualizadoEm', v_updated_at
    )
  );
  insert into internal_academic.nontechnical_financial_requests(
    request_id, operation, actor_id, payload_hash, response
  ) values (
    p_request_id, 'REDEFINIR_CODIGO_CONDICAO_PLANO_UNICO',
    auth.uid(), v_payload_hash, v_response
  );
  return v_response;
end;
$function$;

revoke all on function public.redefinir_codigo_condicao_individual_plano_unico_secure(
  uuid, uuid, text, text
) from public, anon;
grant execute on function public.redefinir_codigo_condicao_individual_plano_unico_secure(
  uuid, uuid, text, text
) to authenticated, service_role;

create or replace function public.validar_codigo_condicao_individual_plano_unico_secure(
  p_turma_id uuid,
  p_aluno_id uuid,
  p_codigo text,
  p_motivo text,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_service boolean := internal_academic.is_service_financial_actor();
  v_reason jsonb;
  v_code record;
  v_attempt record;
  v_failed integer;
  v_locked_until timestamptz;
  v_candidate text := pg_catalog.btrim(coalesce(p_codigo, ''));
  v_code_matches boolean := false;
begin
  perform internal_academic.assert_can_manage_nontechnical_condition_code_v2(
    p_turma_id, false
  );
  v_reason := internal_academic.normalize_nontechnical_condition_reason_v2(
    p_motivo, p_justificativa
  );
  perform 1 from public.parceiros student
  where student.id = p_aluno_id and student.tipo = 'Aluno';
  if not found then raise exception 'Aluno não encontrado.' using errcode = '22023'; end if;
  if v_actor is null and not v_service then
    raise exception 'Sessão obrigatória.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'nontechnical-condition-attempt:' || p_turma_id::text || ':'
    || coalesce(v_actor::text, 'service'),
    0
  ));
  select code.code_hash, code.revision into v_code
  from internal_academic.nontechnical_condition_codes code
  where code.turma_id = p_turma_id;
  if not found then
    return jsonb_build_object('autorizado', false, 'motivo', 'NAO_CONFIGURADO');
  end if;
  if not v_service then
    select attempt.failed_attempts, attempt.locked_until into v_attempt
    from internal_academic.nontechnical_condition_attempts attempt
    where attempt.turma_id = p_turma_id
      and attempt.actor_id = v_actor;
    if found and v_attempt.locked_until is not null and v_attempt.locked_until > now() then
      return jsonb_build_object(
        'autorizado', false,
        'motivo', 'BLOQUEADO',
        'bloqueadoAte', v_attempt.locked_until
      );
    end if;
  end if;
  if pg_catalog.length(v_candidate) between 8 and 32
    and pg_catalog.octet_length(v_candidate) <= 72
    and v_candidate ~ '[A-Za-z]'
    and v_candidate ~ '[0-9]'
  then
    v_code_matches := extensions.crypt(v_candidate, v_code.code_hash) = v_code.code_hash;
  end if;
  if not v_code_matches then
    if v_service then
      return jsonb_build_object('autorizado', false, 'motivo', 'INVALIDO');
    end if;
    v_failed := case
      when found and (v_attempt.locked_until is null or v_attempt.locked_until <= now())
        then least(v_attempt.failed_attempts + 1, 5)
      else 1
    end;
    v_locked_until := case when v_failed >= 5 then now() + interval '15 minutes' else null end;
    insert into internal_academic.nontechnical_condition_attempts(
      turma_id, aluno_id, actor_id, failed_attempts, locked_until, updated_at
    ) values (
      p_turma_id, p_aluno_id, v_actor, v_failed, v_locked_until, now()
    ) on conflict (turma_id, actor_id) do update set
      aluno_id = excluded.aluno_id,
      failed_attempts = excluded.failed_attempts,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at;
    return jsonb_build_object(
      'autorizado', false,
      'motivo', case when v_locked_until is null then 'INVALIDO' else 'BLOQUEADO' end,
      'tentativasRestantes', greatest(0, 5 - v_failed),
      'bloqueadoAte', v_locked_until
    );
  end if;
  if not v_service then
    delete from internal_academic.nontechnical_condition_attempts attempt
    where attempt.turma_id = p_turma_id
      and attempt.actor_id = v_actor;
  end if;
  return jsonb_build_object(
    'autorizado', true,
    'motivo', 'VALIDO',
    'codigoRevisao', v_code.revision,
    'condicaoMotivo', v_reason ->> 'motivo'
  );
end;
$function$;

revoke all on function public.validar_codigo_condicao_individual_plano_unico_secure(
  uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.validar_codigo_condicao_individual_plano_unico_secure(
  uuid, uuid, text, text, text
) to authenticated, service_role;

commit;
