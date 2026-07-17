begin;

-- O helper ja existia no ambiente remoto por uma migration historica, mas sua
-- definicao nao estava presente no repositorio. Mantemos o contrato versionado
-- para que bancos reconstruidos tenham a mesma protecao usada pela exclusao.
create or replace function public.turma_possui_lancamentos_academicos(
  p_turma_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.diario_frequencia df where df.turma_id = p_turma_id
  ) or exists (
    select 1 from public.diario_notas dn where dn.turma_id = p_turma_id
  ) or exists (
    select 1 from public.diario_praticas dp where dp.turma_id = p_turma_id
  ) or exists (
    select 1 from public.diario_observacoes observacao where observacao.turma_id = p_turma_id
  ) or exists (
    select 1 from public.matriculas_estagios me where me.turma_id = p_turma_id
  ) or exists (
    select 1 from public.fechamentos_academicos fa where fa.turma_id = p_turma_id
  ) or exists (
    select 1 from public.certificados_academicos ca where ca.turma_id = p_turma_id
  ) or exists (
    select 1
    from public.matricula_aproveitamentos ma
    join public.matriculas m on m.id = ma.matricula_id
    where m.turma_id = p_turma_id
  ) or exists (
    select 1
    from public.matricula_movimentacoes mm
    where (mm.turma_origem_id = p_turma_id or mm.turma_destino_id = p_turma_id)
      and mm.tipo <> 'MATRICULA'
  ) or exists (
    select 1
    from public.transferencias_academicas ta
    where ta.turma_origem_id = p_turma_id
       or ta.turma_destino_id = p_turma_id
  );
$$;

revoke all on function public.turma_possui_lancamentos_academicos(uuid)
  from public, anon, authenticated;
grant execute on function public.turma_possui_lancamentos_academicos(uuid)
  to service_role;

comment on function public.turma_possui_lancamentos_academicos(uuid) is
  'Indica se a turma possui histórico acadêmico que impede exclusão física.';

commit;
