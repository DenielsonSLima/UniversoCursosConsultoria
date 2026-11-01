begin;

-- A abertura de conversa precisa identificar o destinatário, não ler seu
-- cadastro completo. Não inclui foto, CPF, contatos ou campos sensíveis.
create or replace function public.comunicacao_contatos_internos_listar()
returns table(id uuid, nome text, tipo text, status text, cidade text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_setor text;
begin
  if auth.uid() is null or not coalesce(public.is_gestor(), false)
    or not coalesce(public.gestor_has_tab('comunicacao', 'comunicacao-mensagem'), false)
  then
    raise exception 'Diretório de atendimento não autorizado.' using errcode = '42501';
  end if;
  select case when u.setor_comunicacao = 'todos' then 'atendimento_geral'
    else coalesce(u.setor_comunicacao, 'atendimento_geral') end
  into v_setor from public.usuarios_sistema u
  where u.auth_user_id = auth.uid() and public.is_active_status(u.status);

  return query
  select p.id, p.nome, p.tipo, p.status, p.cidade
  from public.parceiros p
  where p.tipo = 'Aluno' and public.is_active_status(p.status)
    and public.comunicacao_gestor_can_access(v_setor, coalesce(p.polo_id,
      case when cardinality(p.polo_ids) = 1 then p.polo_ids[1] end))
  order by p.nome, p.id
  limit 1000;
end;
$$;

revoke all on function public.comunicacao_contatos_internos_listar() from public, anon;
grant execute on function public.comunicacao_contatos_internos_listar() to authenticated;
comment on function public.comunicacao_contatos_internos_listar() is
  'Diretório textual mínimo de alunos ativos dentro do polo/setor de atendimento do gestor. Não concede leitura geral de parceiros.';

create or replace function public.comunicacao_categorias_internas_listar()
returns table(id uuid, nome text, ativo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_polo_id uuid;
  v_todos_polos boolean;
begin
  if auth.uid() is null or not coalesce(public.is_gestor(), false)
    or not coalesce(public.gestor_has_tab('comunicacao', 'comunicacao-mensagem'), false)
  then
    raise exception 'Categorias de atendimento não autorizadas.' using errcode = '42501';
  end if;
  select u.polo_comunicacao_id, coalesce(u.pode_visualizar_todos_polos, false)
  into v_polo_id, v_todos_polos from public.usuarios_sistema u
  where u.auth_user_id = auth.uid() and public.is_active_status(u.status);
  if v_polo_id is null and v_todos_polos then
    -- A permissão de todos os polos autoriza qualquer unidade existente.
    -- A projeção de categorias usa uma delas; não fabrica um polo ou escopo.
    select p.id into v_polo_id from public.polos p order by p.id limit 1;
  end if;
  return query
  select options.id, options.nome, true
  from (
    select null::uuid as id, 'Geral'::text as nome, 0 as ordem
    where public.comunicacao_gestor_can_access('atendimento_geral', v_polo_id)
    union all
    select c.id, c.nome, 1 as ordem from public.comunicacao_categorias c
    where coalesce(c.ativo, false)
      and public.comunicacao_gestor_can_access(
        coalesce(public.comunicacao_normalizar_setor(c.nome), 'atendimento_geral'), v_polo_id)
  ) options order by options.ordem, options.nome, options.id;
end;
$$;
revoke all on function public.comunicacao_categorias_internas_listar() from public, anon;
grant execute on function public.comunicacao_categorias_internas_listar() to authenticated;
comment on function public.comunicacao_categorias_internas_listar() is
  'Projeção de categorias e opção Geral autorizadas pelo mesmo escopo de polo/setor usado pelo chat.';
commit;
