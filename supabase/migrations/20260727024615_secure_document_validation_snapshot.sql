create or replace function public.obter_snapshots_validacao_documentos(
  p_codigos text[]
)
returns table (
  codigo text,
  validade_ate timestamptz,
  validacao_publica boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_codigos text[];
begin
  select coalesce(array_agg(distinct upper(btrim(item.codigo))), array[]::text[])
  into v_codigos
  from unnest(coalesce(p_codigos, array[]::text[])) item(codigo)
  where nullif(btrim(item.codigo), '') is not null;

  if cardinality(v_codigos) = 0 then
    return;
  end if;

  if exists (
    select 1
    from public.documentos_validacao validation
    where upper(validation.codigo) = any(v_codigos)
      and coalesce((select auth.role()), '') <> 'service_role'
      and validation.aluno_id is distinct from public.current_aluno_id()
      and not public.can_manage_secretaria_document(
        validation.documento,
        validation.polo_id
      )
    )
  then
    raise exception 'Consulta ao snapshot documental não autorizada.'
      using errcode = '42501';
  end if;

  return query
  select
    validation.codigo,
    validation.validade_ate,
    validation.validacao_publica
  from public.documentos_validacao validation
  where upper(validation.codigo) = any(v_codigos);
end;
$$;

revoke all on function public.obter_snapshots_validacao_documentos(text[])
  from public, anon;
grant execute on function public.obter_snapshots_validacao_documentos(text[])
  to authenticated, service_role;

comment on function public.obter_snapshots_validacao_documentos(text[]) is
  'Retorna snapshots canônicos de validade e validação pública somente ao aluno titular ou ao gestor autorizado para cada documento e polo.';
