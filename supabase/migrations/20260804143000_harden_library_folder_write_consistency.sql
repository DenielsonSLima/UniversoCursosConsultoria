begin;

-- A pasta de um documento precisa pertencer ao mesmo repositório do documento.
-- A trigger mantém essa invariável inclusive em operações privilegiadas; a função
-- de policy, abaixo, também confirma que o ator pode escrever naquele repositório.
create or replace function public.validate_biblioteca_document_folder()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder_teacher_id uuid;
begin
  if new.pasta_id is null then
    return new;
  end if;

  select folder.teacher_id
    into v_folder_teacher_id
  from public.biblioteca_pastas folder
  where folder.id = new.pasta_id;

  if not found then
    raise exception 'Pasta da biblioteca não encontrada.';
  end if;

  if v_folder_teacher_id is distinct from new.teacher_id then
    raise exception 'O documento e a pasta precisam pertencer ao mesmo repositório.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_biblioteca_document_folder()
  from public, anon, authenticated;

drop trigger if exists validate_biblioteca_document_folder_trigger
  on public.biblioteca_documentos;
create trigger validate_biblioteca_document_folder_trigger
before insert or update of pasta_id, teacher_id
on public.biblioteca_documentos
for each row execute function public.validate_biblioteca_document_folder();

create or replace function public.biblioteca_document_folder_write_allowed(
  p_folder_id uuid,
  p_teacher_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_folder_id is null
    or exists (
      select 1
      from public.biblioteca_pastas folder
      where folder.id = p_folder_id
        and folder.teacher_id is not distinct from p_teacher_id
        and (
          public.gestor_has_module('biblioteca')
          or (
            public.current_professor_id() is not null
            and folder.teacher_id = public.current_professor_id()
            and p_teacher_id = public.current_professor_id()
          )
        )
    );
$$;

revoke all on function public.biblioteca_document_folder_write_allowed(uuid, uuid)
  from public, anon;
grant execute on function public.biblioteca_document_folder_write_allowed(uuid, uuid)
  to authenticated, service_role;

drop policy if exists portal_biblioteca_documentos_insert
  on public.biblioteca_documentos;
create policy portal_biblioteca_documentos_insert
on public.biblioteca_documentos
for insert
to authenticated
with check (
  (
    public.gestor_has_module('biblioteca')
    or public.professor_can_publish_library_document(
      teacher_id,
      publico_alvo,
      turma_ids
    )
  )
  and public.biblioteca_document_folder_write_allowed(pasta_id, teacher_id)
);

drop policy if exists portal_biblioteca_documentos_update
  on public.biblioteca_documentos;
create policy portal_biblioteca_documentos_update
on public.biblioteca_documentos
for update
to authenticated
using (
  public.gestor_has_module('biblioteca')
  or teacher_id = public.current_professor_id()
)
with check (
  (
    public.gestor_has_module('biblioteca')
    or public.professor_can_publish_library_document(
      teacher_id,
      publico_alvo,
      turma_ids
    )
  )
  and public.biblioteca_document_folder_write_allowed(pasta_id, teacher_id)
);

-- Reforça a trigger criada na migration de compartilhamento. Além de impedir
-- ciclos e mistura de repositórios, cada subpasta deve ter audiência contida em
-- todos os ancestrais. Uma alteração no pai também não pode deixar descendentes
-- com audiência mais ampla do que a nova audiência efetiva.
create or replace function public.validate_biblioteca_folder_tree()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_teacher_id uuid;
  v_relative record;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Uma pasta não pode ser filha dela mesma.';
    end if;

    select parent.teacher_id
      into v_parent_teacher_id
    from public.biblioteca_pastas parent
    where parent.id = new.parent_id;

    if not found then
      raise exception 'Pasta pai não encontrada.';
    end if;

    if v_parent_teacher_id is distinct from new.teacher_id then
      raise exception 'A pasta pai pertence a outro repositório.';
    end if;

    if exists (
      with recursive descendants as (
        select child.id, array[child.id] as path
        from public.biblioteca_pastas child
        where child.parent_id = new.id

        union all

        select child.id, descendants.path || child.id
        from public.biblioteca_pastas child
        join descendants on child.parent_id = descendants.id
        where not child.id = any(descendants.path)
      )
      select 1
      from descendants
      where id = new.parent_id
    ) then
      raise exception 'A movimentação criaria um ciclo de pastas.';
    end if;

    for v_relative in
      with recursive ancestors as (
        select parent.id, parent.parent_id, parent.publico_alvo,
               array[parent.id] as path
        from public.biblioteca_pastas parent
        where parent.id = new.parent_id

        union all

        select parent.id, parent.parent_id, parent.publico_alvo,
               ancestors.path || parent.id
        from public.biblioteca_pastas parent
        join ancestors on ancestors.parent_id = parent.id
        where not parent.id = any(ancestors.path)
      )
      select publico_alvo
      from ancestors
    loop
      if not (case new.publico_alvo
        when 'INTERNO' then true
        when 'ALUNOS' then v_relative.publico_alvo in ('ALUNOS', 'TODOS')
        when 'PROFESSORES' then v_relative.publico_alvo in ('PROFESSORES', 'TODOS')
        when 'TODOS' then v_relative.publico_alvo = 'TODOS'
        else false
      end) then
        raise exception 'A subpasta não pode ter público mais amplo que seus ancestrais.';
      end if;
    end loop;
  end if;

  -- Se a audiência desta pasta for restringida, toda a subárvore continua
  -- obrigada a caber nessa nova audiência.
  for v_relative in
    with recursive descendants as (
      select child.id, child.teacher_id, child.publico_alvo,
             array[child.id] as path
      from public.biblioteca_pastas child
      where child.parent_id = new.id

      union all

      select child.id, child.teacher_id, child.publico_alvo,
             descendants.path || child.id
      from public.biblioteca_pastas child
      join descendants on child.parent_id = descendants.id
      where not child.id = any(descendants.path)
    )
    select teacher_id, publico_alvo
    from descendants
  loop
    if v_relative.teacher_id is distinct from new.teacher_id then
      raise exception 'As subpastas precisam permanecer no mesmo repositório da pasta pai.';
    end if;

    if not (case v_relative.publico_alvo
      when 'INTERNO' then true
      when 'ALUNOS' then new.publico_alvo in ('ALUNOS', 'TODOS')
      when 'PROFESSORES' then new.publico_alvo in ('PROFESSORES', 'TODOS')
      when 'TODOS' then new.publico_alvo = 'TODOS'
      else false
    end) then
      raise exception 'A pasta não pode ficar mais privada que uma de suas subpastas.';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.validate_biblioteca_folder_tree()
  from public, anon, authenticated;

drop trigger if exists validate_biblioteca_folder_tree_trigger
  on public.biblioteca_pastas;
create trigger validate_biblioteca_folder_tree_trigger
before insert or update of parent_id, teacher_id, publico_alvo
on public.biblioteca_pastas
for each row execute function public.validate_biblioteca_folder_tree();

commit;
