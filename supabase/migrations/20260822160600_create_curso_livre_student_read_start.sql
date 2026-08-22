begin;

create or replace function internal_academic.curso_livre_student_payload(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_context record;
  v_attempt public.curso_livre_tentativas%rowtype;
  v_release_at timestamptz;
  v_retry_at timestamptz;
  v_exact boolean;
  v_released boolean;
  v_reason text;
  v_questions jsonb := '[]'::jsonb;
  v_certificate jsonb;
begin
  select enrollment.id as matricula_id, enrollment.turma_id, enrollment.status as matricula_status,
    class.curso_id, config.avaliacao_id, config.professor_id,
    assessment.versao, assessment.status as avaliacao_status, assessment.titulo,
    assessment.nota_minima_percentual, assessment.quantidade_sorteada,
    assessment.intervalo_nova_tentativa_horas
  into v_context
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  left join public.turmas_livres_academico config on config.turma_id = class.id
  left join public.curso_livre_avaliacoes assessment on assessment.id = config.avaliacao_id
  where enrollment.id = p_matricula_id;
  if not found then
    raise exception 'Matrícula de Curso Livre não encontrada.' using errcode = 'P0002';
  end if;

  v_release_at := internal_academic.curso_livre_liberacao_em(v_context.turma_id);
  v_exact := internal_academic.curso_livre_carga_planejada_exata(v_context.turma_id);
  select attempt.* into v_attempt
  from public.curso_livre_tentativas attempt
  where attempt.matricula_id = p_matricula_id
  order by attempt.iniciada_em desc, attempt.id desc limit 1;
  if v_attempt.status = 'REPROVADA' and v_attempt.enviada_em is not null then
    v_retry_at := v_attempt.enviada_em
      + make_interval(hours => coalesce(v_context.intervalo_nova_tentativa_horas, 0));
  end if;
  v_released := upper(coalesce(v_context.matricula_status, '')) = 'ATIVO'
    and v_context.avaliacao_id is not null
    and v_context.avaliacao_status = 'PUBLICADA'
    and v_context.professor_id is not null
    and v_exact and v_release_at is not null and now() >= v_release_at
    and (v_retry_at is null or now() >= v_retry_at);
  v_reason := case
    when upper(coalesce(v_context.matricula_status, '')) <> 'ATIVO' then 'MATRICULA_INATIVA'
    when v_context.avaliacao_id is null or v_context.avaliacao_status <> 'PUBLICADA'
      then 'AVALIACAO_NAO_PUBLICADA'
    when v_context.professor_id is null then 'PROFESSOR_NAO_ATRIBUIDO'
    when not v_exact then 'CRONOGRAMA_INCOMPLETO'
    when v_release_at is null then 'ULTIMA_AULA_NAO_DEFINIDA'
    when now() < v_release_at then 'AGUARDANDO_ULTIMA_AULA'
    when v_retry_at is not null and now() < v_retry_at then 'INTERVALO_NOVA_TENTATIVA'
    else 'LIBERADA'
  end;
  if v_attempt.id is not null and v_attempt.status = 'EM_ANDAMENTO' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', snapshot.id,
      'ordem', snapshot.ordem,
      'enunciado', snapshot.enunciado,
      'opcoes', snapshot.opcoes
    ) order by snapshot.ordem), '[]'::jsonb)
    into v_questions
    from public.curso_livre_tentativa_questoes snapshot
    where snapshot.tentativa_id = v_attempt.id;
  end if;

  select jsonb_build_object(
    'id', certificate.id,
    'status', certificate.status,
    'codigoValidacao', certificate.codigo_validacao
  ) into v_certificate
  from public.certificados_academicos certificate
  where certificate.matricula_id = p_matricula_id
    and certificate.status = 'FINALIZADO';

  return jsonb_build_object(
    'matriculaId', v_context.matricula_id,
    'turmaId', v_context.turma_id,
    'cursoId', v_context.curso_id,
    'avaliacao', case when v_context.avaliacao_id is null then null else jsonb_build_object(
      'id', v_context.avaliacao_id,
      'versao', v_context.versao,
      'titulo', v_context.titulo,
      'notaMinimaPercentual', v_context.nota_minima_percentual,
      'quantidadeSorteada', v_context.quantidade_sorteada
    ) end,
    'liberacao', jsonb_build_object(
      'liberada', v_released,
      'podeIniciar', v_released,
      'liberadaEm', v_release_at,
      'novaTentativaEm', v_retry_at,
      'motivo', v_reason
    ),
    'tentativa', case when v_attempt.id is null then null else jsonb_build_object(
      'id', v_attempt.id,
      'status', v_attempt.status,
      'iniciadaEm', v_attempt.iniciada_em,
      'enviadaEm', v_attempt.enviada_em,
      'notaPercentual', v_attempt.nota_percentual,
      'acertos', v_attempt.acertos,
      'total', v_attempt.total,
      'questoes', v_questions
    ) end,
    'certificado', v_certificate
  );
end;
$function$;

revoke all on function internal_academic.curso_livre_student_payload(uuid)
  from public, anon, authenticated;

create or replace function public.obter_avaliacao_curso_livre_aluno_secure(
  p_matricula_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
  v_status text;
begin
  select enrollment.aluno_id, upper(coalesce(enrollment.status, ''))
  into v_student_id, v_status
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
  where enrollment.id = p_matricula_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE';
  if not found or v_status not in ('ATIVO', 'CONCLUIDO') then
    raise exception 'Matrícula Livre ativa não encontrada.' using errcode = 'P0002';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
    and v_student_id is distinct from public.current_aluno_id() then
    raise exception 'Sem permissão para consultar esta avaliação.' using errcode = '42501';
  end if;
  return internal_academic.curso_livre_student_payload(p_matricula_id);
end;
$function$;

revoke all on function public.obter_avaliacao_curso_livre_aluno_secure(uuid)
  from public, anon;
grant execute on function public.obter_avaliacao_curso_livre_aluno_secure(uuid)
  to authenticated, service_role;

create or replace function public.iniciar_tentativa_curso_livre_secure(
  p_request_id uuid,
  p_matricula_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_context record;
  v_student_id uuid;
  v_stored internal_academic.curso_livre_tentativa_requests%rowtype;
  v_hash text;
  v_attempt_id uuid;
  v_release_at timestamptz;
  v_response jsonb;
  v_snapshot_count integer;
  v_last_failed timestamptz;
begin
  if p_request_id is null or p_matricula_id is null then
    raise exception 'requestId e matriculaId são obrigatórios.' using errcode = '22023';
  end if;
  select enrollment.aluno_id
  into v_student_id
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  where enrollment.id = p_matricula_id;
  if not found then
    raise exception 'Matrícula de Curso Livre não encontrada.' using errcode = 'P0002';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
    and v_student_id is distinct from public.current_aluno_id() then
    raise exception 'Sem permissão para iniciar esta tentativa.' using errcode = '42501';
  end if;

  v_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object('matriculaId', p_matricula_id)::text, 'UTF8'
  ), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-attempt-request:' || p_request_id::text, 0
  ));
  select request.* into v_stored
  from internal_academic.curso_livre_tentativa_requests request
  where request.request_id = p_request_id;
  if found then
    if v_stored.operacao <> 'INICIAR' or v_stored.actor_id is distinct from v_actor_id
      or v_stored.payload_hash <> v_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_stored.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform 1 from public.matriculas enrollment
  where enrollment.id = p_matricula_id for update;
  select enrollment.aluno_id, enrollment.status as matricula_status,
    enrollment.turma_id, class.curso_id, config.avaliacao_id, config.professor_id,
    assessment.status as avaliacao_status, assessment.intervalo_nova_tentativa_horas
  into v_context
  from public.matriculas enrollment
  join public.turmas class on class.id = enrollment.turma_id
  join public.cursos course on course.id = class.curso_id
    and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  left join public.turmas_livres_academico config on config.turma_id = class.id
  left join public.curso_livre_avaliacoes assessment on assessment.id = config.avaliacao_id
  where enrollment.id = p_matricula_id;
  if not found or upper(coalesce(v_context.matricula_status, '')) <> 'ATIVO' then
    raise exception 'A tentativa exige matrícula Livre ATIVA.' using errcode = '55000';
  end if;
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-schedule:' || v_context.turma_id::text, 0
  ));
  if v_context.avaliacao_id is null or v_context.avaliacao_status <> 'PUBLICADA' then
    raise exception 'A turma Livre ainda não possui avaliação publicada.' using errcode = '55000';
  end if;
  if v_context.professor_id is null then
    raise exception 'A turma Livre ainda não possui professor.' using errcode = '55000';
  end if;
  if not internal_academic.curso_livre_carga_planejada_exata(v_context.turma_id) then
    raise exception 'A prova exige cronograma com a carga planejada exata.' using errcode = '55000';
  end if;
  v_release_at := internal_academic.curso_livre_liberacao_em(v_context.turma_id);
  if v_release_at is null or now() < v_release_at then
    raise exception 'A prova será liberada no início da última aula.' using errcode = '55000';
  end if;

  select attempt.id into v_attempt_id
  from public.curso_livre_tentativas attempt
  where attempt.matricula_id = p_matricula_id and attempt.status = 'EM_ANDAMENTO'
  for update;
  if v_attempt_id is null then
    select max(attempt.enviada_em) into v_last_failed
    from public.curso_livre_tentativas attempt
    where attempt.matricula_id = p_matricula_id and attempt.status = 'REPROVADA';
    if v_last_failed is not null and now() < v_last_failed
      + make_interval(hours => v_context.intervalo_nova_tentativa_horas) then
      raise exception 'O intervalo para uma nova tentativa ainda não terminou.' using errcode = '55000';
    end if;
    insert into public.curso_livre_tentativas(
      matricula_id, avaliacao_id, inicio_request_id, liberada_em
    ) values (p_matricula_id, v_context.avaliacao_id, p_request_id, v_release_at)
    returning id into v_attempt_id;

    insert into public.curso_livre_tentativa_questoes(
      tentativa_id, questao_id, ordem, enunciado, opcoes, resposta_correta
    )
    select v_attempt_id, sampled.id, sampled.ordem::smallint,
      sampled.enunciado, sampled.opcoes, sampled.resposta_correta
    from (
      select question.*,
        row_number() over (order by pg_catalog.encode(extensions.digest(
          pg_catalog.convert_to(v_attempt_id::text || ':' || question.id::text, 'UTF8'),
          'sha256'
        ), 'hex'), question.id) as ordem
      from public.curso_livre_questoes question
      where question.avaliacao_id = v_context.avaliacao_id and question.ativa
    ) sampled
    where sampled.ordem <= 10;
    get diagnostics v_snapshot_count = row_count;
    if v_snapshot_count <> 10 then
      raise exception 'A avaliação publicada não possui 10 questões válidas.' using errcode = '23514';
    end if;
  end if;

  v_response := jsonb_build_object('replayed', false)
    || internal_academic.curso_livre_student_payload(p_matricula_id);
  insert into internal_academic.curso_livre_tentativa_requests(
    request_id, operacao, actor_id, payload_hash, response
  ) values (p_request_id, 'INICIAR', v_actor_id, v_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.iniciar_tentativa_curso_livre_secure(uuid, uuid)
  from public, anon;
grant execute on function public.iniciar_tentativa_curso_livre_secure(uuid, uuid)
  to authenticated, service_role;

commit;
