begin;

create or replace function public.can_write_assinatura_storage_object(p_name text)
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
    );
$$;

create or replace function public.can_delete_assinatura_storage_object()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.gestor_has_module('configuracoes');
$$;

commit;
