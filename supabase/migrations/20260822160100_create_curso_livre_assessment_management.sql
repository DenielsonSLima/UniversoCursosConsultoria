begin;

create table internal_academic.curso_livre_avaliacao_requests (
  request_id uuid primary key,
  actor_id uuid,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on table internal_academic.curso_livre_avaliacao_requests
  from public, anon, authenticated, service_role;

create or replace function internal_academic.assert_can_manage_curso_livre(
  p_curso_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_curso_id is null then
    raise exception 'Curso Livre obrigatório.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.cursos course
    where course.id = p_curso_id
      and upper(coalesce(course.modalidade, '')) = 'LIVRE'
  ) then
    raise exception 'Curso Livre não encontrado.' using errcode = 'P0002';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role' and not (
    public.is_gestor_global()
    and public.gestor_can_manage_curso(p_curso_id)
  ) then
    raise exception 'Sem permissão para configurar a avaliação deste Curso Livre.'
      using errcode = '42501';
  end if;
end;
$function$;

revoke all on function internal_academic.assert_can_manage_curso_livre(uuid)
  from public, anon, authenticated;

create or replace function internal_academic.get_curso_livre_assessment_gestao_payload(
  p_curso_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_assessment public.curso_livre_avaliacoes%rowtype;
  v_questions jsonb := '[]'::jsonb;
begin
  select assessment.*
  into v_assessment
  from public.curso_livre_avaliacoes assessment
  where assessment.curso_id = p_curso_id
  order by
    case assessment.status when 'RASCUNHO' then 0 else 1 end,
    assessment.versao desc
  limit 1;

  if v_assessment.id is null then
    return jsonb_build_object('cursoId', p_curso_id, 'avaliacao', null);
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', question.id,
      'enunciado', question.enunciado,
      'opcoes', question.opcoes,
      'respostaCorreta', question.resposta_correta,
      'ativa', question.ativa
    ) order by question.created_at, question.id
  ), '[]'::jsonb)
  into v_questions
  from public.curso_livre_questoes question
  where question.avaliacao_id = v_assessment.id;

  return jsonb_build_object(
    'cursoId', p_curso_id,
    'avaliacao', jsonb_build_object(
      'id', v_assessment.id,
      'cursoId', v_assessment.curso_id,
      'versao', v_assessment.versao,
      'revisao', v_assessment.revisao,
      'status', v_assessment.status,
      'titulo', v_assessment.titulo,
      'notaMinimaPercentual', v_assessment.nota_minima_percentual,
      'quantidadeSorteada', v_assessment.quantidade_sorteada,
      'minimoBanco', v_assessment.minimo_banco,
      'intervaloNovaTentativaHoras', v_assessment.intervalo_nova_tentativa_horas,
      'publicadaEm', v_assessment.publicada_em,
      'questoes', v_questions
    )
  );
end;
$function$;

revoke all on function internal_academic.get_curso_livre_assessment_gestao_payload(uuid)
  from public, anon, authenticated;

create or replace function public.obter_avaliacao_curso_livre_gestao_secure(
  p_curso_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  return internal_academic.get_curso_livre_assessment_gestao_payload(p_curso_id);
end;
$function$;

revoke all on function public.obter_avaliacao_curso_livre_gestao_secure(uuid)
  from public, anon;
grant execute on function public.obter_avaliacao_curso_livre_gestao_secure(uuid)
  to authenticated, service_role;

create or replace function public.salvar_avaliacao_curso_livre_gestao_secure(
  p_request_id uuid,
  p_curso_id uuid,
  p_avaliacao_id uuid,
  p_expected_revisao integer,
  p_publicar boolean,
  p_config jsonb,
  p_questoes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_payload_hash text;
  v_stored internal_academic.curso_livre_avaliacao_requests%rowtype;
  v_assessment public.curso_livre_avaliacoes%rowtype;
  v_title text;
  v_min_score numeric;
  v_retry_hours integer;
  v_version integer;
  v_question jsonb;
  v_question_id uuid;
  v_question_ids uuid[] := array[]::uuid[];
  v_correct smallint;
  v_active boolean;
  v_response jsonb;
begin
  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  if p_request_id is null then
    raise exception 'requestId obrigatório.' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(p_config) <> 'object'
    or pg_catalog.jsonb_typeof(p_questoes) <> 'array' then
    raise exception 'Configuração ou questões da avaliação Livre inválidas.'
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_questoes) > 500 then
    raise exception 'A avaliação Livre aceita no máximo 500 questões por versão.'
      using errcode = '22023';
  end if;

  v_title := nullif(pg_catalog.btrim(coalesce(p_config ->> 'titulo', '')), '');
  begin
    v_min_score := coalesce((p_config ->> 'notaMinimaPercentual')::numeric, 70);
    v_retry_hours := coalesce((p_config ->> 'intervaloNovaTentativaHoras')::integer, 0);
  exception when invalid_text_representation then
    raise exception 'Nota mínima ou intervalo de tentativa inválido.' using errcode = '22023';
  end;
  if v_title is null or v_min_score not between 0 and 100
    or v_retry_hours not between 0 and 720 then
    raise exception 'Revise título, nota mínima e intervalo da avaliação Livre.'
      using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'cursoId', p_curso_id,
      'avaliacaoId', p_avaliacao_id,
      'expectedRevisao', p_expected_revisao,
      'publicar', coalesce(p_publicar, false),
      'config', p_config,
      'questoes', p_questoes
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended('curso-livre-assessment-request:' || p_request_id::text, 0)
  );
  select request.* into v_stored
  from internal_academic.curso_livre_avaliacao_requests request
  where request.request_id = p_request_id;
  if found then
    if v_stored.actor_id is distinct from v_actor_id
      or v_stored.payload_hash <> v_payload_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return jsonb_set(v_stored.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform 1 from public.cursos course where course.id = p_curso_id for update;
  if p_avaliacao_id is null then
    if p_expected_revisao is not null then
      raise exception 'Nova versão não aceita revisão esperada.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.curso_livre_avaliacoes assessment
      where assessment.curso_id = p_curso_id and assessment.status = 'RASCUNHO'
    ) then
      raise exception 'Já existe um rascunho para este Curso Livre.' using errcode = '23505';
    end if;
    select coalesce(max(assessment.versao), 0) + 1
    into v_version
    from public.curso_livre_avaliacoes assessment
    where assessment.curso_id = p_curso_id;
    insert into public.curso_livre_avaliacoes(
      curso_id, versao, revisao, status, titulo, nota_minima_percentual,
      intervalo_nova_tentativa_horas, created_by
    ) values (
      p_curso_id, v_version, 1, 'RASCUNHO', v_title, v_min_score,
      v_retry_hours, v_actor_id
    ) returning * into v_assessment;
  else
    select assessment.* into v_assessment
    from public.curso_livre_avaliacoes assessment
    where assessment.id = p_avaliacao_id and assessment.curso_id = p_curso_id
    for update;
    if not found then
      raise exception 'Avaliação Livre não encontrada.' using errcode = 'P0002';
    end if;
    if v_assessment.status <> 'RASCUNHO' then
      raise exception 'Avaliação publicada é imutável; crie uma nova versão.'
        using errcode = '55000';
    end if;
    if p_expected_revisao is null or p_expected_revisao <> v_assessment.revisao then
      raise exception 'A avaliação Livre foi alterada por outra sessão.' using errcode = '40001';
    end if;
    update public.curso_livre_avaliacoes assessment
    set titulo = v_title,
        nota_minima_percentual = v_min_score,
        intervalo_nova_tentativa_horas = v_retry_hours,
        revisao = assessment.revisao + 1
    where assessment.id = v_assessment.id
    returning * into v_assessment;
    delete from public.curso_livre_questoes question
    where question.avaliacao_id = v_assessment.id;
  end if;

  for v_question in select value from pg_catalog.jsonb_array_elements(p_questoes)
  loop
    if pg_catalog.jsonb_typeof(v_question) <> 'object' then
      raise exception 'Questão Livre inválida.' using errcode = '22023';
    end if;
    begin
      v_question_id := case
        when nullif(pg_catalog.btrim(v_question ->> 'id'), '') is null then gen_random_uuid()
        else (v_question ->> 'id')::uuid
      end;
      v_correct := (v_question ->> 'respostaCorreta')::smallint;
      v_active := coalesce((v_question ->> 'ativa')::boolean, true);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Identificador, gabarito ou situação da questão Livre inválido.'
        using errcode = '22023';
    end;
    if v_question_id = any(v_question_ids) then
      raise exception 'A lista possui identificadores de questão repetidos.'
        using errcode = '23514';
    end if;
    v_question_ids := array_append(v_question_ids, v_question_id);
    insert into public.curso_livre_questoes(
      id, avaliacao_id, enunciado, opcoes, resposta_correta, ativa
    ) values (
      v_question_id,
      v_assessment.id,
      v_question ->> 'enunciado',
      v_question -> 'opcoes',
      v_correct,
      v_active
    );
  end loop;

  if coalesce(p_publicar, false) then
    update public.curso_livre_avaliacoes assessment
    set status = 'PUBLICADA'
    where assessment.id = v_assessment.id;
  end if;

  v_response := jsonb_build_object('replayed', false)
    || internal_academic.get_curso_livre_assessment_gestao_payload(p_curso_id);
  insert into internal_academic.curso_livre_avaliacao_requests(
    request_id, actor_id, payload_hash, response
  ) values (p_request_id, v_actor_id, v_payload_hash, v_response);
  return v_response;
end;
$function$;

revoke all on function public.salvar_avaliacao_curso_livre_gestao_secure(
  uuid, uuid, uuid, integer, boolean, jsonb, jsonb
) from public, anon;
grant execute on function public.salvar_avaliacao_curso_livre_gestao_secure(
  uuid, uuid, uuid, integer, boolean, jsonb, jsonb
) to authenticated, service_role;

commit;
