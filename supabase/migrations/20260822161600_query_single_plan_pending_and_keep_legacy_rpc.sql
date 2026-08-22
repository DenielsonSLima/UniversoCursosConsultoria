begin;

select pg_catalog.set_config(
  'app.nontechnical_single_plan_v2',
  'backfill-generated-single-plan-config',
  true
);

insert into public.matriculas_plano_financeiro_unico_config(
  matricula_id, turma_id, aluno_id, status_financeiro, modo_condicao,
  plano_turma_revisao, plano_turma_fingerprint,
  desconto_comercial_tipo, desconto_comercial_valor,
  override_revisao, override_fingerprint, regra_efetiva_fingerprint,
  generated_by, generated_at, created_by, created_at, updated_at
)
select
  snapshot.matricula_id, snapshot.turma_id, snapshot.aluno_id,
  'GERADA', 'HERDAR', snapshot.plano_turma_revisao,
  snapshot.plano_turma_fingerprint, 'NENHUM', 0, 0,
  internal_academic.nontechnical_adjustment_fingerprint_v2(
    internal_academic.normalize_nontechnical_adjustment_v2(
      plan, jsonb_build_object('modo', 'HERDAR')
    )
  ),
  snapshot.regra_snapshot ->> 'fingerprint',
  snapshot.generated_by, snapshot.generated_at,
  snapshot.generated_by, snapshot.created_at, snapshot.generated_at
from public.matriculas_plano_financeiro_unico snapshot
join public.turmas_plano_financeiro_unico plan
  on plan.turma_id = snapshot.turma_id
where not exists (
  select 1
  from public.matriculas_plano_financeiro_unico_config config
  where config.matricula_id = snapshot.matricula_id
);

create or replace function public.obter_pendencias_plano_financeiro_unico_turma_secure(
  p_turma_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_plan public.turmas_plano_financeiro_unico%rowtype;
  v_total integer;
  v_pending jsonb;
begin
  perform internal_academic.assert_can_operate_nontechnical_plan_v2(
    p_turma_id, true
  );
  select plan.* into v_plan
  from public.turmas_plano_financeiro_unico plan
  where plan.turma_id = p_turma_id;
  if not found then
    raise exception 'Esta turma não utiliza plano financeiro único.' using errcode = '22023';
  end if;
  select count(*)::integer, coalesce(jsonb_agg(jsonb_build_object(
    'matricula', jsonb_build_object(
      'id', enrollment.id,
      'status', enrollment.status,
      'turmaId', enrollment.turma_id,
      'alunoId', enrollment.aluno_id
    ),
    'aluno', jsonb_build_object(
      'id', student.id,
      'nome', student.nome
    ),
    'config', jsonb_build_object(
      'status', config.status_financeiro,
      'modo', config.modo_condicao,
      'overrideRevisao', config.override_revisao,
      'overrideFingerprint', config.override_fingerprint,
      'regraEfetivaFingerprint', config.regra_efetiva_fingerprint,
      'motivo', config.motivo,
      'justificativa', config.justificativa,
      'updatedAt', config.updated_at
    ),
    'regra', internal_academic.render_nontechnical_condition_v2(
      v_plan,
      internal_academic.nontechnical_config_adjustment_v2(config),
      config.override_revisao,
      false
    )
  ) order by student.nome, enrollment.id), '[]'::jsonb)
  into v_total, v_pending
  from public.matriculas_plano_financeiro_unico_config config
  join public.matriculas enrollment on enrollment.id = config.matricula_id
  join public.parceiros student on student.id = config.aluno_id
  where config.turma_id = p_turma_id
    and config.status_financeiro = 'PENDENTE';
  return jsonb_build_object(
    'turmaId', p_turma_id,
    'total', v_total,
    'planoTurma', internal_academic.render_nontechnical_single_plan(v_plan),
    'pendencias', v_pending
  );
end;
$function$;

revoke all on function public.obter_pendencias_plano_financeiro_unico_turma_secure(uuid)
  from public, anon;
grant execute on function public.obter_pendencias_plano_financeiro_unico_turma_secure(uuid)
  to authenticated, service_role;

create or replace function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  p_request_id uuid,
  p_turma_id uuid,
  p_aluno_id uuid,
  p_expected_revisao integer,
  p_expected_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_payload_hash text;
  v_existing record;
  v_result jsonb;
begin
  if p_request_id is null or p_turma_id is null or p_aluno_id is null then
    raise exception 'Turma, aluno e requestId são obrigatórios.' using errcode = '22023';
  end if;
  perform internal_academic.assert_can_operate_nontechnical_plan_v2(
    p_turma_id, true
  );
  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'turmaId', p_turma_id,
      'alunoId', p_aluno_id,
      'revisao', p_expected_revisao,
      'fingerprint', p_expected_fingerprint
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
  if found and v_existing.operation = 'MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO' then
    if v_existing.actor_id is distinct from auth.uid()
      or v_existing.payload_hash <> v_payload_hash
    then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_existing.response, '{replayed}', 'true'::jsonb, true);
  end if;
  v_result := public.matricular_aluno_plano_financeiro_unico_v2_secure(
    p_request_id, p_turma_id, p_aluno_id,
    p_expected_revisao, p_expected_fingerprint,
    jsonb_build_object('modo', 'HERDAR'), true,
    null, null, null
  );
  if v_result ->> 'operacao' = 'AUTORIZACAO_NEGADA' then
    raise exception 'A matrícula possui condição individual pendente e exige autorização.'
      using errcode = '42501';
  end if;
  return jsonb_set(
    v_result || jsonb_build_object('plano', v_result -> 'regra'),
    '{operacao}',
    to_jsonb('MATRICULAR_E_GERAR_PARCELAS_PLANO_UNICO'::text),
    true
  );
end;
$function$;

revoke all on function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  uuid, uuid, uuid, integer, text
) from public, anon;
grant execute on function public.matricular_aluno_e_gerar_parcelas_plano_financeiro_unico_secure(
  uuid, uuid, uuid, integer, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
