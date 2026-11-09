-- Read-only grouping over the same authorized economic rows and payment projection.
create or replace function public.get_despesas_economicas_agrupamento_secure(
  p_tipo text, p_polo_id uuid, p_agrupamento text default 'mes',
  p_categoria_id uuid default null, p_search text default null,
  p_due_start date default null, p_due_end date default null,
  p_status_scope text default 'todos', p_turma_id uuid default null
)
returns table(grupo_chave text, grupo_nome text, total_value numeric, paid_value numeric, item_count bigint)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_group text := lower(trim(coalesce(p_agrupamento, 'mes')));
begin
  if auth.role() is distinct from 'service_role' and (
    auth.uid() is null or p_polo_id is null
    or public.is_financeiro_for_polo(p_polo_id) is not true
    or public.gestor_has_financeiro_tab('despesas') is not true
  ) then
    raise exception 'Acesso ao agrupamento de despesas fora do escopo autorizado.' using errcode='42501';
  end if;
  if p_polo_id is null or p_tipo not in ('DESPESA_FIXA','DESPESA_VARIAVEL')
    or p_tipo is null or v_group not in ('mes','fornecedor') then
    raise exception 'Agrupamento de despesas inválido.' using errcode='22023';
  end if;
  return query
  with items as materialized (
    select item.*, case when v_group='mes'
      then coalesce(to_char(item.data_vencimento,'YYYY-MM'),'__sem_vencimento__')
      else coalesce(item.fornecedor_id::text,'__sem_fornecedor__') end as group_key
    from public.listar_despesas_economicas_detalhadas_secure(
      p_tipo,p_polo_id,p_categoria_id,p_search,p_due_start,p_due_end,p_status_scope,p_turma_id
    ) item
  )
  select item.group_key,
    case when v_group='mes' then
      case when min(item.data_vencimento) is null then 'Sem vencimento'
        else (array['janeiro','fevereiro','março','abril','maio','junho','julho','agosto',
          'setembro','outubro','novembro','dezembro'])[extract(month from min(item.data_vencimento))::integer]
          || ' de ' || to_char(min(item.data_vencimento),'YYYY') end
      else coalesce(max(nullif(item.fornecedor_nome,'')),'Fornecedor não informado') end,
    coalesce(sum(item.valor) filter(where item.status<>'CANCELADO'),0)::numeric(15,2),
    coalesce(sum((item.payment_summary->>'previouslyPaid')::numeric)
      filter(where item.status<>'CANCELADO'),0)::numeric(15,2),
    count(*)
  from items item group by item.group_key order by item.group_key;
end;
$$;
revoke all on function public.get_despesas_economicas_agrupamento_secure(text,uuid,text,uuid,text,date,date,text,uuid) from public,anon;
grant execute on function public.get_despesas_economicas_agrupamento_secure(text,uuid,text,uuid,text,date,date,text,uuid) to authenticated,service_role;
