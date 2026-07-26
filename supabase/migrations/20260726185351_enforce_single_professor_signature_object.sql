begin;

-- Um professor possui no máximo um objeto pendente ou vinculado. INSERT é
-- permitido uma única vez; UPDATE e DELETE permanecem exclusivos da gestão.
create or replace function public.can_create_assinatura_storage_object(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.gestor_has_module('configuracoes')
    or (
      public.current_professor_id() is not null
      and p_name = 'professores/' || public.current_professor_id()::text || '/assinatura'
      and not exists (
        select 1
        from public.assinaturas_pessoas ap
        where ap.categoria = 'PROFESSOR'
          and ap.parceiro_id = public.current_professor_id()
          and (ap.assinatura_path is not null or ap.assinatura_url is not null)
      )
    );
$$;

create or replace function public.can_write_assinatura_storage_object(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.gestor_has_module('configuracoes');
$$;

revoke all on function public.can_create_assinatura_storage_object(text) from public;
revoke all on function public.can_write_assinatura_storage_object(text) from public;
grant execute on function public.can_create_assinatura_storage_object(text) to authenticated;
grant execute on function public.can_write_assinatura_storage_object(text) to authenticated;

drop policy if exists assinaturas_objects_select on storage.objects;
create policy assinaturas_objects_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'assinaturas'
  and (
    public.gestor_has_module('configuracoes')
    or name = 'professores/' || (select public.current_professor_id())::text || '/assinatura'
    or exists (
      select 1
      from public.assinaturas_pessoas ap
      where ap.categoria = 'PROFESSOR'
        and ap.parceiro_id = (select public.current_professor_id())
        and ap.assinatura_path = name
    )
  )
);

drop policy if exists assinaturas_objects_insert on storage.objects;
create policy assinaturas_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'assinaturas'
  and public.can_create_assinatura_storage_object(name)
);

drop policy if exists assinaturas_objects_update on storage.objects;
create policy assinaturas_objects_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'assinaturas'
  and public.can_write_assinatura_storage_object(name)
)
with check (
  bucket_id = 'assinaturas'
  and public.can_write_assinatura_storage_object(name)
);

drop policy if exists assinaturas_objects_delete on storage.objects;
create policy assinaturas_objects_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'assinaturas'
  and public.can_delete_assinatura_storage_object()
);

commit;
