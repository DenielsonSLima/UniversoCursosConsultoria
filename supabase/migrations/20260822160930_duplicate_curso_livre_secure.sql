begin;

create table internal_academic.curso_livre_duplicate_requests (
  request_id uuid primary key,
  actor_id uuid,
  source_curso_id uuid not null,
  payload_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now()
);

revoke all on table internal_academic.curso_livre_duplicate_requests
  from public, anon, authenticated, service_role;

create or replace function public.duplicar_curso_livre_gestao_secure(
  p_request_id uuid,
  p_curso_id uuid,
  p_novo_nome text,
  p_nova_versao text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_name text := pg_catalog.btrim(coalesce(p_novo_nome, ''));
  v_version text := pg_catalog.btrim(coalesce(p_nova_versao, ''));
  v_payload_hash text;
  v_stored internal_academic.curso_livre_duplicate_requests%rowtype;
  v_source_course public.cursos%rowtype;
  v_new_course public.cursos%rowtype;
  v_source_module record;
  v_source_discipline record;
  v_source_lesson record;
  v_new_module_id uuid;
  v_new_discipline_id uuid;
  v_grade jsonb;
  v_response jsonb;
begin
  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);

  if p_request_id is null then
    raise exception 'requestId obrigatório.' using errcode = '22023';
  end if;
  if v_name = '' or pg_catalog.length(v_name) > 200 then
    raise exception 'Nome do novo Curso Livre inválido.' using errcode = '22023';
  end if;
  if v_version = '' or pg_catalog.length(v_version) > 100 then
    raise exception 'Versão do novo Curso Livre inválida.' using errcode = '22023';
  end if;

  v_payload_hash := pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
    jsonb_build_object(
      'operacao', 'duplicar-curso-livre',
      'cursoId', p_curso_id,
      'novoNome', v_name,
      'novaVersao', v_version
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-duplicate-request:' || p_request_id::text,
    0
  ));
  select request.* into v_stored
  from internal_academic.curso_livre_duplicate_requests request
  where request.request_id = p_request_id;
  if found then
    if v_stored.actor_id is distinct from v_actor_id
      or v_stored.source_curso_id is distinct from p_curso_id
      or v_stored.payload_hash <> v_payload_hash then
      raise exception 'requestId já utilizado com outra intenção.' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_set(v_stored.response, '{replayed}', 'true'::jsonb, true);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'curso-livre-grade:' || p_curso_id::text,
    0
  ));
  select source.* into v_source_course
  from public.cursos source
  where source.id = p_curso_id
    and upper(coalesce(source.modalidade, '')) = 'LIVRE'
  for share;
  if not found then
    raise exception 'Curso Livre não encontrado.' using errcode = 'P0002';
  end if;

  perform internal_academic.assert_can_manage_curso_livre(p_curso_id);
  perform module.id
  from public.modulos module
  where module.curso_id = p_curso_id
  order by module.id
  for share;
  perform discipline.id
  from public.disciplinas discipline
  join public.modulos module on module.id = discipline.modulo_id
  where module.curso_id = p_curso_id
  order by discipline.id
  for share of discipline;
  perform lesson.id
  from public.aulas lesson
  join public.disciplinas discipline on discipline.id = lesson.disciplina_id
  join public.modulos module on module.id = discipline.modulo_id
  where module.curso_id = p_curso_id
  order by lesson.id
  for share of lesson;

  insert into public.cursos(
    nome,
    modalidade,
    carga_horaria,
    status,
    area,
    descricao,
    versao,
    parceiro_instituicao,
    parceiro_logo_url,
    imagem_url,
    duracao_meses,
    publicar_site,
    imagem_detalhe_1,
    imagem_detalhe_2,
    valor,
    financeiro_config,
    vacinas_config
  ) values (
    v_name,
    'LIVRE',
    v_source_course.carga_horaria,
    'ativo',
    v_source_course.area,
    v_source_course.descricao,
    v_version,
    v_source_course.parceiro_instituicao,
    v_source_course.parceiro_logo_url,
    v_source_course.imagem_url,
    v_source_course.duracao_meses,
    false,
    v_source_course.imagem_detalhe_1,
    v_source_course.imagem_detalhe_2,
    null,
    v_source_course.financeiro_config,
    v_source_course.vacinas_config
  )
  returning * into v_new_course;

  for v_source_module in
    select module.*
    from public.modulos module
    where module.curso_id = p_curso_id
    order by coalesce(module.ordem, 2147483647), module.created_at, module.id
  loop
    insert into public.modulos(curso_id, nome, descricao, ordem)
    values (
      v_new_course.id,
      v_source_module.nome,
      coalesce(v_source_module.descricao, ''),
      v_source_module.ordem
    )
    returning id into v_new_module_id;

    for v_source_discipline in
      select discipline.*
      from public.disciplinas discipline
      where discipline.modulo_id = v_source_module.id
      order by coalesce(discipline.ordem, 2147483647),
        discipline.created_at, discipline.id
    loop
      insert into public.disciplinas(
        modulo_id,
        nome,
        carga_horaria,
        descricao,
        ordem,
        carga_horaria_teoria,
        carga_horaria_pratica,
        carga_horaria_estagio
      ) values (
        v_new_module_id,
        v_source_discipline.nome,
        v_source_discipline.carga_horaria,
        coalesce(v_source_discipline.descricao, ''),
        v_source_discipline.ordem,
        v_source_discipline.carga_horaria_teoria,
        v_source_discipline.carga_horaria_pratica,
        v_source_discipline.carga_horaria_estagio
      )
      returning id into v_new_discipline_id;

      for v_source_lesson in
        select lesson.*
        from public.aulas lesson
        where lesson.disciplina_id = v_source_discipline.id
        order by coalesce(lesson.ordem, 2147483647), lesson.created_at, lesson.id
      loop
        insert into public.aulas(
          disciplina_id,
          titulo,
          carga_horaria,
          descricao,
          ordem
        ) values (
          v_new_discipline_id,
          v_source_lesson.titulo,
          v_source_lesson.carga_horaria,
          coalesce(v_source_lesson.descricao, ''),
          v_source_lesson.ordem
        );
      end loop;
    end loop;
  end loop;

  v_grade := internal_academic.get_curso_livre_grade_payload(v_new_course.id);
  v_response := jsonb_build_object(
    'cursoId', v_new_course.id,
    'curso', jsonb_build_object(
      'id', v_new_course.id,
      'nome', v_new_course.nome,
      'versao', v_new_course.versao,
      'modalidade', v_new_course.modalidade,
      'status', v_new_course.status,
      'cargaHoraria', v_new_course.carga_horaria,
      'publicarSite', v_new_course.publicar_site
    ),
    'fingerprint', v_grade ->> 'fingerprint',
    'modulos', v_grade -> 'modulos',
    'replayed', false
  );

  insert into internal_academic.curso_livre_duplicate_requests(
    request_id,
    actor_id,
    source_curso_id,
    payload_hash,
    response
  ) values (
    p_request_id,
    v_actor_id,
    p_curso_id,
    v_payload_hash,
    v_response
  );

  return v_response;
end;
$function$;

revoke all on function public.duplicar_curso_livre_gestao_secure(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.duplicar_curso_livre_gestao_secure(uuid, uuid, text, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
