-- Pastas da biblioteca são privadas por padrão e só aparecem nos portais
-- quando a gestão escolhe explicitamente um público.

alter table public.biblioteca_pastas
  add column if not exists publico_alvo text not null default 'INTERNO';

alter table public.biblioteca_pastas
  drop constraint if exists biblioteca_pastas_publico_alvo_check;

alter table public.biblioteca_pastas
  add constraint biblioteca_pastas_publico_alvo_check
  check (publico_alvo in ('INTERNO', 'ALUNOS', 'PROFESSORES', 'TODOS'));

-- O comportamento anterior não registrava intenção de compartilhamento.
-- O backfill seguro mantém todas as pastas existentes privadas.
update public.biblioteca_pastas
set publico_alvo = 'INTERNO'
where publico_alvo is distinct from 'INTERNO';

create index if not exists idx_biblioteca_pastas_publico_alvo
  on public.biblioteca_pastas (publico_alvo);

create or replace function public.biblioteca_folder_row_allowed(
  p_teacher_id uuid,
  p_publico_alvo text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select auth.uid()) is not null
    and (
      public.gestor_has_module('biblioteca')
      or (
        public.current_professor_id() is not null
        and (
          p_teacher_id = public.current_professor_id()
          or (
            p_teacher_id is null
            and p_publico_alvo in ('PROFESSORES', 'TODOS')
          )
        )
      )
      or (
        public.current_aluno_id() is not null
        and p_publico_alvo in ('ALUNOS', 'TODOS')
        and (
          p_teacher_id is null
          or exists (
            select 1
            from public.matriculas m
            join public.turmas_disciplinas td on td.turma_id = m.turma_id
            where m.aluno_id = public.current_aluno_id()
              and m.status = 'ATIVO'
              and td.professor_id = p_teacher_id
          )
        )
      )
    );
$$;

create or replace function public.can_access_biblioteca_pasta(p_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive ancestors as (
    select p.id, p.parent_id, p.teacher_id, p.publico_alvo, array[p.id] as path
    from public.biblioteca_pastas p
    where p.id = p_folder_id

    union all

    select parent.id, parent.parent_id, parent.teacher_id, parent.publico_alvo,
           child.path || parent.id
    from public.biblioteca_pastas parent
    join ancestors child on child.parent_id = parent.id
    where not parent.id = any(child.path)
  )
  select coalesce(
    count(*) > 0
    and bool_and(public.biblioteca_folder_row_allowed(teacher_id, publico_alvo)),
    false
  )
  from ancestors;
$$;

create or replace function public.can_access_biblioteca_documento(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  d public.biblioteca_documentos%rowtype;
  v_aluno_id uuid := public.current_aluno_id();
  v_professor_id uuid := public.current_professor_id();
begin
  if (select auth.uid()) is null then
    return false;
  end if;

  select * into d
  from public.biblioteca_documentos
  where id = p_document_id;

  if not found then return false; end if;
  if d.pasta_id is not null and not public.can_access_biblioteca_pasta(d.pasta_id) then
    return false;
  end if;
  if public.gestor_has_module('biblioteca') then return true; end if;

  if v_professor_id is not null then
    return d.teacher_id = v_professor_id
      or (d.teacher_id is null and d.publico_alvo in ('PROFESSORES', 'TODOS'));
  end if;

  if v_aluno_id is null or d.publico_alvo not in ('ALUNOS', 'TODOS') then
    return false;
  end if;

  if d.teacher_id is not null and not exists (
    select 1
    from public.matriculas m
    join public.turmas_disciplinas td on td.turma_id = m.turma_id
    where m.aluno_id = v_aluno_id
      and m.status = 'ATIVO'
      and td.professor_id = d.teacher_id
  ) then return false; end if;

  if d.abrangencia = 'POLO_ESPECIFICO' and d.polo_id is not null and not exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    where m.aluno_id = v_aluno_id and m.status = 'ATIVO' and t.polo_id = d.polo_id
  ) then return false; end if;

  if coalesce(cardinality(d.curso_ids), 0) > 0 and not exists (
    select 1 from public.matriculas m
    join public.turmas t on t.id = m.turma_id
    where m.aluno_id = v_aluno_id and m.status = 'ATIVO' and t.curso_id = any(d.curso_ids)
  ) then return false; end if;

  if coalesce(cardinality(d.turma_ids), 0) > 0 and not exists (
    select 1 from public.matriculas m
    where m.aluno_id = v_aluno_id and m.status = 'ATIVO' and m.turma_id = any(d.turma_ids)
  ) then return false; end if;

  if d.liberacao_tipo = 'POR_DATA' and (
    d.liberacao_data is null
    or now() < d.liberacao_data
    or (
      coalesce(d.liberacao_dias_validade, 0) > 0
      and now() > d.liberacao_data + make_interval(days => d.liberacao_dias_validade)
    )
  ) then return false; end if;

  if d.liberacao_tipo = 'DISCIPLINA_INICIO' and not exists (
    select 1
    from public.matriculas m
    join public.turmas_disciplinas td on td.turma_id = m.turma_id
    where m.aluno_id = v_aluno_id
      and m.status = 'ATIVO'
      and (
        td.disciplina_id = d.liberacao_disciplina_id
        or td.disciplina_id = any(coalesce(d.disciplina_ids, '{}'::uuid[]))
      )
      and (
        coalesce(d.liberacao_dias_validade, 0) <= 0
        or td.created_at is null
        or now() <= td.created_at + make_interval(days => d.liberacao_dias_validade)
      )
  ) then return false; end if;

  if coalesce(d.liberacao_tipo, 'IMEDIATO') <> 'DISCIPLINA_INICIO'
     and coalesce(cardinality(d.disciplina_ids), 0) > 0
     and not exists (
       select 1
       from public.matriculas m
       join public.turmas_disciplinas td on td.turma_id = m.turma_id
       where m.aluno_id = v_aluno_id
         and m.status = 'ATIVO'
         and td.disciplina_id = any(d.disciplina_ids)
     ) then return false; end if;

  return true;
end;
$$;

revoke all on function public.biblioteca_folder_row_allowed(uuid, text) from public;
revoke all on function public.can_access_biblioteca_pasta(uuid) from public;
revoke all on function public.can_access_biblioteca_documento(uuid) from public;
grant execute on function public.biblioteca_folder_row_allowed(uuid, text) to authenticated;
grant execute on function public.can_access_biblioteca_pasta(uuid) to authenticated;
grant execute on function public.can_access_biblioteca_documento(uuid) to authenticated;

drop policy if exists portal_biblioteca_pastas_select on public.biblioteca_pastas;
create policy portal_biblioteca_pastas_select
on public.biblioteca_pastas for select to authenticated
using (public.can_access_biblioteca_pasta(id));

drop policy if exists portal_biblioteca_pastas_insert on public.biblioteca_pastas;
create policy portal_biblioteca_pastas_insert
on public.biblioteca_pastas for insert to authenticated
with check (
  public.gestor_has_module('biblioteca')
  or (
    teacher_id = public.current_professor_id()
    and publico_alvo in ('INTERNO', 'ALUNOS')
  )
);

drop policy if exists portal_biblioteca_pastas_update on public.biblioteca_pastas;
create policy portal_biblioteca_pastas_update
on public.biblioteca_pastas for update to authenticated
using (
  public.gestor_has_module('biblioteca')
  or teacher_id = public.current_professor_id()
)
with check (
  public.gestor_has_module('biblioteca')
  or (
    teacher_id = public.current_professor_id()
    and publico_alvo in ('INTERNO', 'ALUNOS')
  )
);

drop policy if exists portal_biblioteca_documentos_select on public.biblioteca_documentos;
create policy portal_biblioteca_documentos_select
on public.biblioteca_documentos for select to authenticated
using (public.can_access_biblioteca_documento(id));

create or replace function public.validate_biblioteca_folder_tree()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_teacher_id uuid;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then raise exception 'Uma pasta não pode ser filha dela mesma.'; end if;

  select teacher_id into v_parent_teacher_id
  from public.biblioteca_pastas where id = new.parent_id;
  if not found then raise exception 'Pasta pai não encontrada.'; end if;
  if v_parent_teacher_id is distinct from new.teacher_id then
    raise exception 'A pasta pai pertence a outro repositório.';
  end if;
  if exists (
    with recursive descendants as (
      select p.id from public.biblioteca_pastas p where p.parent_id = new.id
      union all
      select p.id from public.biblioteca_pastas p join descendants d on p.parent_id = d.id
    )
    select 1 from descendants where id = new.parent_id
  ) then raise exception 'A movimentação criaria um ciclo de pastas.'; end if;
  return new;
end;
$$;

drop trigger if exists validate_biblioteca_folder_tree_trigger on public.biblioteca_pastas;
create trigger validate_biblioteca_folder_tree_trigger
before insert or update of parent_id, teacher_id on public.biblioteca_pastas
for each row execute function public.validate_biblioteca_folder_tree();

-- O manifesto de ZIP reaproveita exatamente as mesmas decisões da RLS.
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
  v_manifest jsonb;
begin
  if public.current_aluno_id() is null then
    raise exception 'Aluno autenticado não encontrado.';
  end if;
  if coalesce(cardinality(p_folder_ids), 0) + coalesce(cardinality(p_document_ids), 0) > 250 then
    raise exception 'Selecione no máximo 250 itens por download.';
  end if;

  with recursive selected_folders as (
    select p.id, p.nome, p.parent_id
    from public.biblioteca_pastas p
    where p.id = any(coalesce(p_folder_ids, '{}'::uuid[]))
      and public.can_access_biblioteca_pasta(p.id)
    union
    select child.id, child.nome, child.parent_id
    from public.biblioteca_pastas child
    join selected_folders parent on parent.id = child.parent_id
    where public.can_access_biblioteca_pasta(child.id)
  ),
  allowed_documents as (
    select d.* from public.biblioteca_documentos d
    where (
      d.id = any(coalesce(p_document_ids, '{}'::uuid[]))
      or exists (select 1 from selected_folders f where f.id = d.pasta_id)
    )
    and public.can_access_biblioteca_documento(d.id)
  )
  select jsonb_build_object(
    'folders', coalesce((select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.nome, 'parentId', f.parent_id
    ) order by f.nome) from selected_folders f), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'folderId', d.pasta_id, 'name', d.titulo,
      'url', d.arquivo_url, 'fileType', d.tipo_arquivo, 'sizeBytes', d.tamanho_bytes
    ) order by d.titulo) from allowed_documents d), '[]'::jsonb)
  ) into v_manifest;
  return coalesce(v_manifest, jsonb_build_object('folders', '[]'::jsonb, 'documents', '[]'::jsonb));
end;
$$;

-- O bucket passa a ser privado. Downloads existentes continuam sujeitos à
-- autorização do registro do documento, e novos uploads serão assinados.
update storage.buckets set public = false where id = 'biblioteca';

drop policy if exists portal_biblioteca_select on storage.objects;
create policy portal_biblioteca_select
on storage.objects for select to authenticated
using (
  bucket_id = 'biblioteca'
  and exists (
    select 1
    from public.biblioteca_documentos d
    where public.can_access_biblioteca_documento(d.id)
      and (
        d.arquivo_url = name
        or d.arquivo_url like '%/biblioteca/' || replace(name, '%', '\\%')
      )
  )
);
