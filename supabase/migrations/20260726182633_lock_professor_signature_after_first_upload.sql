begin;

-- O professor pode preparar o arquivo somente enquanto ainda não existe uma
-- assinatura vinculada. Gestores continuam podendo criar, substituir e excluir.
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
      and not exists (
        select 1
        from public.assinaturas_pessoas ap
        where ap.categoria = 'PROFESSOR'
          and ap.parceiro_id = public.current_professor_id()
          and (ap.assinatura_path is not null or ap.assinatura_url is not null)
      )
    );
$$;

revoke all on function public.can_write_assinatura_storage_object(text) from public;
grant execute on function public.can_write_assinatura_storage_object(text) to authenticated;

-- A função aceita o primeiro vínculo, inclusive quando o gestor já criou um
-- cadastro pendente sem imagem. Depois disso, qualquer nova alteração é negada.
create or replace function public.salvar_minha_assinatura_professor(p_assinatura_path text)
returns public.assinaturas_pessoas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_professor_id uuid := public.current_professor_id();
  v_professor_nome text;
  v_existing public.assinaturas_pessoas;
  v_result public.assinaturas_pessoas;
begin
  if v_professor_id is null then
    raise exception 'Professor autenticado não identificado.';
  end if;

  if p_assinatura_path is null
     or p_assinatura_path <> ('professores/' || v_professor_id::text || '/assinatura') then
    raise exception 'Caminho da assinatura inválido.';
  end if;

  -- Serializa tentativas simultâneas do mesmo professor.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('professor-signature:' || v_professor_id::text, 0)
  );

  select p.nome
    into v_professor_nome
  from public.parceiros p
  where p.id = v_professor_id
    and p.tipo = 'Professor'
    and public.is_active_status(p.status);

  if v_professor_nome is null then
    raise exception 'Cadastro de professor ativo não encontrado.';
  end if;

  if not exists (
    select 1
    from storage.objects so
    where so.bucket_id = 'assinaturas'
      and so.name = p_assinatura_path
  ) then
    raise exception 'O arquivo da assinatura ainda não foi enviado.';
  end if;

  select ap.*
    into v_existing
  from public.assinaturas_pessoas ap
  where ap.categoria = 'PROFESSOR'
    and ap.parceiro_id = v_professor_id
  for update;

  if found and (
    v_existing.assinatura_path is not null
    or v_existing.assinatura_url is not null
  ) then
    raise exception
      'Sua assinatura já está vinculada. Solicite à gestão qualquer alteração ou exclusão.';
  end if;

  if found then
    update public.assinaturas_pessoas
    set
      nome = v_professor_nome,
      cargo = 'Professor(a)',
      assinatura_url = null,
      assinatura_path = p_assinatura_path,
      ativo = true
    where id = v_existing.id
    returning * into v_result;
  else
    insert into public.assinaturas_pessoas (
      categoria,
      parceiro_id,
      nome,
      cargo,
      assinatura_url,
      assinatura_path,
      ativo
    )
    values (
      'PROFESSOR',
      v_professor_id,
      v_professor_nome,
      'Professor(a)',
      null,
      p_assinatura_path,
      true
    )
    returning * into v_result;
  end if;

  return v_result;
end;
$$;

revoke all on function public.salvar_minha_assinatura_professor(text) from public;
grant execute on function public.salvar_minha_assinatura_professor(text) to authenticated;

commit;
