create or replace function public.biblioteca_aluno_download_manifest(
  p_folder_ids uuid[] default '{}'::uuid[],
  p_document_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_aluno_id uuid := public.current_aluno_id();
  v_manifest jsonb;
begin
  if v_aluno_id is null then
    raise exception 'Aluno autenticado não encontrado.';
  end if;

  if coalesce(cardinality(p_folder_ids), 0) + coalesce(cardinality(p_document_ids), 0) > 250 then
    raise exception 'Selecione no máximo 250 itens por download.';
  end if;

  with recursive
  active_enrollments as materialized (
    select m.turma_id, m.polo_id, t.curso_id
    from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    where m.aluno_id = v_aluno_id
      and m.status = 'ATIVO'
  ),
  active_teachers as materialized (
    select distinct td.professor_id
    from public.turmas_disciplinas td
    join active_enrollments ae on ae.turma_id = td.turma_id
    where td.professor_id is not null
  ),
  accessible_folders as (
    select p.id, p.nome, p.parent_id, p.teacher_id
    from public.biblioteca_pastas p
    where p.parent_id is null
      and (
        p.teacher_id is null
        or exists (
          select 1
          from active_teachers teacher
          where teacher.professor_id = p.teacher_id
        )
      )

    union

    select child.id, child.nome, child.parent_id, child.teacher_id
    from public.biblioteca_pastas child
    join accessible_folders parent on parent.id = child.parent_id
    where child.teacher_id is null
      or exists (
        select 1
        from active_teachers teacher
        where teacher.professor_id = child.teacher_id
      )
  ),
  selected_folders as (
    select folder.id, folder.nome, folder.parent_id, folder.teacher_id
    from accessible_folders folder
    where folder.id = any(coalesce(p_folder_ids, '{}'::uuid[]))

    union

    select child.id, child.nome, child.parent_id, child.teacher_id
    from accessible_folders child
    join selected_folders parent on parent.id = child.parent_id
  ),
  allowed_documents as materialized (
    select d.*
    from public.biblioteca_documentos d
    where (
        d.id = any(coalesce(p_document_ids, '{}'::uuid[]))
        or exists (
          select 1
          from selected_folders folder
          where folder.id = d.pasta_id
        )
      )
      and d.publico_alvo in ('ALUNOS', 'TODOS')
      and (
        d.abrangencia <> 'POLO_ESPECIFICO'
        or d.polo_id is null
        or exists (
          select 1
          from active_enrollments ae
          where ae.polo_id = d.polo_id
        )
      )
      and (
        d.teacher_id is null
        or exists (
          select 1
          from active_teachers teacher
          where teacher.professor_id = d.teacher_id
        )
      )
      and (
        coalesce(cardinality(d.curso_ids), 0) = 0
        or exists (
          select 1
          from active_enrollments ae
          where ae.curso_id = any(d.curso_ids)
        )
      )
      and (
        coalesce(cardinality(d.turma_ids), 0) = 0
        or exists (
          select 1
          from active_enrollments ae
          where ae.turma_id = any(d.turma_ids)
        )
      )
      and (
        coalesce(d.liberacao_tipo, 'IMEDIATO') = 'IMEDIATO'
        or (
          d.liberacao_tipo = 'POR_DATA'
          and d.liberacao_data is not null
          and now() >= d.liberacao_data
          and (
            coalesce(d.liberacao_dias_validade, 0) <= 0
            or now() <= d.liberacao_data + make_interval(days => d.liberacao_dias_validade)
          )
        )
        or (
          d.liberacao_tipo = 'DISCIPLINA_INICIO'
          and exists (
            select 1
            from public.turmas_disciplinas td
            join active_enrollments ae on ae.turma_id = td.turma_id
            where (
                td.disciplina_id = d.liberacao_disciplina_id
                or td.disciplina_id = any(coalesce(d.disciplina_ids, '{}'::uuid[]))
              )
              and (
                coalesce(d.liberacao_dias_validade, 0) <= 0
                or td.created_at is null
                or now() <= td.created_at + make_interval(days => d.liberacao_dias_validade)
              )
          )
        )
      )
      and (
        d.liberacao_tipo = 'DISCIPLINA_INICIO'
        or coalesce(cardinality(d.disciplina_ids), 0) = 0
        or exists (
          select 1
          from public.turmas_disciplinas td
          join active_enrollments ae on ae.turma_id = td.turma_id
          where td.disciplina_id = any(d.disciplina_ids)
        )
      )
  )
  select jsonb_build_object(
    'folders',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', folder.id,
            'name', folder.nome,
            'parentId', folder.parent_id
          )
          order by folder.nome
        )
        from selected_folders folder
      ),
      '[]'::jsonb
    ),
    'documents',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', document.id,
            'folderId', document.pasta_id,
            'name', document.titulo,
            'url', document.arquivo_url,
            'fileType', document.tipo_arquivo,
            'sizeBytes', document.tamanho_bytes
          )
          order by document.titulo
        )
        from allowed_documents document
      ),
      '[]'::jsonb
    )
  )
  into v_manifest;

  return coalesce(
    v_manifest,
    jsonb_build_object('folders', '[]'::jsonb, 'documents', '[]'::jsonb)
  );
end;
$$;

revoke all on function public.biblioteca_aluno_download_manifest(uuid[], uuid[]) from public;
revoke all on function public.biblioteca_aluno_download_manifest(uuid[], uuid[]) from anon;
grant execute on function public.biblioteca_aluno_download_manifest(uuid[], uuid[]) to authenticated;
