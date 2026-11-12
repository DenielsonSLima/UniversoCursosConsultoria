begin;
-- Read-only course metadata for visual grouping; authorization and totals unchanged.
create or replace function public.parceiro_aluno_ead_boletos(p_aluno_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.parceiros p where p.id=p_aluno_id
    and public.is_partner_in_gestor_read_scope(p.polo_id,p.polo_ids)
  ) then raise exception 'Acesso ao aluno não autorizado.' using errcode='42501'; end if;

  with eligible as (
    select r.id,r.cliente_id,r.matricula_id,r.turma_id,r.polo_id,r.descricao,
      r.valor,r.valor_pago,r.data_vencimento,r.data_pagamento,r.status,r.tipo_lancamento,
      (r.gateway_provider='banese_card' and r.gateway_payment_method='BOLETO'
        and r.gateway_environment='production'
        and nullif(r.gateway_boleto_codigo_barras,'') is not null
        and nullif(r.gateway_boleto_linha_digitavel,'') is not null
        and r.gateway_boleto_issued_at is not null
        and r.status in ('PENDENTE','VENCIDO')) as can_open_boleto,
      jsonb_build_object('id',m.id,'status',m.status,'data_matricula',m.data_matricula) as matriculas,
      jsonb_build_object('nome',t.nome,'codigo',t.codigo,
        'cursos',jsonb_build_object('id',c.id,'nome',c.nome,'modalidade',c.modalidade),
        'polos',jsonb_build_object('nome',polo.nome)) as turmas
    from public.contas_receber r
    join public.matriculas m on m.id=r.matricula_id
    join public.turmas t on t.id=m.turma_id
    join public.cursos c on c.id=t.curso_id
    left join public.polos polo on polo.id=t.polo_id
    where r.cliente_id=p_aluno_id and public.parceiro_aluno_ead_boleto_can_read(r.id)
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(e) order by e.data_vencimento desc,e.id) from eligible e),'[]'::jsonb),
    'summary',jsonb_build_object(
      'paid',coalesce((select sum(coalesce(nullif(valor_pago,0),valor,0)) from eligible where status='PAGO'),0),
      'open',coalesce((select sum(coalesce(valor,0)) from eligible where status in ('PENDENTE','VENCIDO')),0),
      'suspended',coalesce((select sum(coalesce(valor,0)) from eligible where status='SUSPENSO'),0)
    )) into v_result;
  return v_result;
end; $$;
revoke all on function public.parceiro_aluno_ead_boletos(uuid) from public,anon;
grant execute on function public.parceiro_aluno_ead_boletos(uuid) to authenticated;
-- Invoker keeps the existing financial RLS intact for legacy history.
create or replace function public.parceiro_aluno_financeiro_visualizacao(p_aluno_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_ead jsonb; v_result jsonb;
begin
  v_ead:=public.parceiro_aluno_ead_boletos(p_aluno_id);
  with legacy as (
    select jsonb_build_object('id',r.id,'cliente_id',r.cliente_id,
      'matricula_id',r.matricula_id,'turma_id',r.turma_id,'polo_id',r.polo_id,
      'descricao',r.descricao,'valor',r.valor,'valor_pago',r.valor_pago,
      'data_vencimento',r.data_vencimento,'data_pagamento',r.data_pagamento,
      'status',r.status,'tipo_lancamento',r.tipo_lancamento,'can_open_boleto',false,
      'matriculas',case when m.id is null then null else jsonb_build_object('id',m.id,'status',m.status,'data_matricula',m.data_matricula) end,
      'turmas',case when t.id is null then null else jsonb_build_object('nome',t.nome,'codigo',t.codigo,
        'cursos',jsonb_build_object('id',c.id,'nome',c.nome,'modalidade',c.modalidade),'polos',jsonb_build_object('nome',p.nome)) end) as item
    from public.contas_receber r
    left join public.matriculas m on m.id=r.matricula_id
    left join public.turmas t on t.id=r.turma_id
    left join public.cursos c on c.id=t.curso_id
    left join public.polos p on p.id=t.polo_id
    where r.cliente_id=p_aluno_id
  ), ead as (select value as item from jsonb_array_elements(v_ead->'items')),
  items as (
    select item from ead union all
    select l.item from legacy l where not exists(select 1 from ead e where e.item->>'id'=l.item->>'id')
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(item order by item->>'data_vencimento' desc,item->>'id'),'[]'::jsonb),
    'summary',jsonb_build_object(
      'paid',coalesce(sum(coalesce(nullif((item->>'valor_pago')::numeric,0),(item->>'valor')::numeric,0)) filter(where item->>'status'='PAGO'),0),
      'open',coalesce(sum(coalesce((item->>'valor')::numeric,0)) filter(where item->>'status' in ('PENDENTE','VENCIDO')),0),
      'suspended',coalesce(sum(coalesce((item->>'valor')::numeric,0)) filter(where item->>'status'='SUSPENSO'),0))) into v_result from items;
  return v_result;
end; $$;
revoke all on function public.parceiro_aluno_financeiro_visualizacao(uuid) from public,anon;
grant execute on function public.parceiro_aluno_financeiro_visualizacao(uuid) to authenticated;
commit;
