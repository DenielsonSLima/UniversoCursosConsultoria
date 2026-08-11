begin;

-- O resumo de financiamento continua expondo a movimentação da competência,
-- mas passa a informar também o saldo contratual que ainda existia no seu
-- fechamento. Esse saldo não usa contas_pagar: para contratos rateados, o
-- título físico fica na Matriz e duplicaria a obrigação econômica dos polos.
create or replace function public.get_caixa_financiamento_resumo_secure(
  p_polo_id uuid default null,
  p_competencia date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_inicio date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month')::date;
  v_fechamento date := (date_trunc('month', coalesce(p_competencia, current_date)) + interval '1 month - 1 day')::date;
  v_credito numeric := 0;
  v_obrigacao numeric := 0;
  v_pago_rateado numeric := 0;
  v_principal numeric := 0;
  v_encargos numeric := 0;
  v_saldo_emprestimos_a_pagar numeric := 0;
begin
  if auth.role() <> 'service_role'
     and not (
       (p_polo_id is null and public.is_financeiro_global() and public.gestor_has_module('caixa'))
       or (p_polo_id is not null and public.is_financeiro_for_polo(p_polo_id) and public.gestor_has_module('caixa'))
     ) then
    raise exception 'Acesso não autorizado ao resumo financeiro do Caixa.' using errcode = '42501';
  end if;

  select coalesce(sum(emprestimo.valor_liberado), 0)
  into v_credito
  from public.emprestimos_financeiros emprestimo
  where emprestimo.data_liberacao >= v_inicio
    and emprestimo.data_liberacao < v_fim
    and (p_polo_id is null or emprestimo.polo_matriz_id = p_polo_id);

  with valores_financiamento as (
    select
      rateio.valor_total,
      rateio.valor_principal,
      rateio.valor_encargos,
      rateio.status
    from public.emprestimo_parcela_rateios rateio
    join public.emprestimo_parcelas parcela on parcela.id = rateio.emprestimo_parcela_id
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo in ('TODOS', 'SELECIONADOS')
      and parcela.data_vencimento >= v_inicio
      and parcela.data_vencimento < v_fim
      and (p_polo_id is null or rateio.polo_id = p_polo_id)

    union all

    select
      parcela.valor_total,
      parcela.valor_principal,
      parcela.valor_encargos,
      parcela.status
    from public.emprestimo_parcelas parcela
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo = 'SEM_RATEIO'
      and parcela.data_vencimento >= v_inicio
      and parcela.data_vencimento < v_fim
      and (p_polo_id is null or emprestimo.polo_matriz_id = p_polo_id)
  )
  select
    coalesce(sum(valor_total), 0),
    coalesce(sum(valor_total) filter (where status = 'PAGO'), 0),
    coalesce(sum(valor_principal), 0),
    coalesce(sum(valor_encargos), 0)
  into v_obrigacao, v_pago_rateado, v_principal, v_encargos
  from valores_financiamento;

  -- O saldo devedor inclui as parcelas futuras de contratos já liberados.
  -- `data_pagamento` preserva a competência histórica: uma baixa posterior
  -- não apaga uma obrigação que existia no fechamento anterior.
  with saldo_devedor as (
    select rateio.valor_total
    from public.emprestimo_parcela_rateios rateio
    join public.emprestimo_parcelas parcela on parcela.id = rateio.emprestimo_parcela_id
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo in ('TODOS', 'SELECIONADOS')
      and emprestimo.data_liberacao <= v_fechamento
      and emprestimo.status <> 'CANCELADO'
      and parcela.status <> 'CANCELADO'
      and rateio.status <> 'CANCELADO'
      and (parcela.data_pagamento is null or parcela.data_pagamento > v_fechamento)
      and (p_polo_id is null or rateio.polo_id = p_polo_id)

    union all

    select parcela.valor_total
    from public.emprestimo_parcelas parcela
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo = 'SEM_RATEIO'
      and emprestimo.data_liberacao <= v_fechamento
      and emprestimo.status <> 'CANCELADO'
      and parcela.status <> 'CANCELADO'
      and (parcela.data_pagamento is null or parcela.data_pagamento > v_fechamento)
      and (p_polo_id is null or emprestimo.polo_matriz_id = p_polo_id)
  )
  select coalesce(sum(valor_total), 0)
  into v_saldo_emprestimos_a_pagar
  from saldo_devedor;

  return jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'credito_liberado_matriz', v_credito,
    'obrigacao_rateada', v_obrigacao,
    'principal_rateado', v_principal,
    'encargos_rateados', v_encargos,
    'pago_rateado', v_pago_rateado,
    'saldo_emprestimos_a_pagar', round(v_saldo_emprestimos_a_pagar, 2)::text,
    'observacao', 'Crédito, principal e encargos de empréstimo são financiamento, não receita ou despesa operacional. O saldo de empréstimos a pagar representa as parcelas ainda devidas no fechamento da competência, incluindo encargos contratuais.'
  );
end;
$function$;

-- A posição líquida é o único contrato que combina as duas leituras
-- complementares. O backend preserva os decimais e a autorização das RPCs
-- de origem; React e o PDF apenas apresentam o resultado canônico.
create function public.get_caixa_posicao_liquida_resumo_secure(
  p_polo_id uuid default null,
  p_competencia date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_inicio date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_patrimonio jsonb;
  v_financiamento jsonb;
  v_valor_patrimonial_custo numeric;
  v_saldo_emprestimos_a_pagar numeric;
begin
  -- A chamada financeira valida primeiro o escopo de financiamento. A chamada
  -- patrimonial valida o mesmo polo/consolidado para a posição a custo.
  v_financiamento := public.get_caixa_financiamento_resumo_secure(
    p_polo_id,
    v_inicio
  );
  v_patrimonio := public.get_caixa_patrimonio_resumo_secure(
    p_polo_id,
    v_inicio
  );

  v_valor_patrimonial_custo := nullif(
    v_patrimonio #>> '{posicao_fechamento,valor_ativo_custo}',
    ''
  )::numeric;
  v_saldo_emprestimos_a_pagar := nullif(
    v_financiamento ->> 'saldo_emprestimos_a_pagar',
    ''
  )::numeric;

  if v_valor_patrimonial_custo is null or v_saldo_emprestimos_a_pagar is null then
    raise exception 'Contrato incompleto da posição líquida do Caixa.';
  end if;

  return jsonb_build_object(
    'versao', 1,
    'competencia', to_char(v_inicio, 'YYYY-MM-DD'),
    'escopo_tipo', v_patrimonio -> 'escopo_tipo',
    'polo_id', v_patrimonio -> 'polo_id',
    'valor_patrimonial_custo', round(v_valor_patrimonial_custo, 2)::text,
    'saldo_emprestimos_a_pagar', round(v_saldo_emprestimos_a_pagar, 2)::text,
    'valor_liquido', round(v_valor_patrimonial_custo - v_saldo_emprestimos_a_pagar, 2)::text,
    'observacao', 'Valor líquido = patrimônio a custo menos empréstimos a pagar no fechamento da competência. Não inclui saldo de caixa, contas a receber ou pagar, tributos, depreciação, valor de mercado e não altera o resultado operacional.'
  );
end;
$function$;

revoke all on function public.get_caixa_financiamento_resumo_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_financiamento_resumo_secure(uuid, date)
  to authenticated, service_role;

revoke all on function public.get_caixa_posicao_liquida_resumo_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_posicao_liquida_resumo_secure(uuid, date)
  to authenticated, service_role;

-- O wrapper v4 já entrega o snapshot operacional e as posições isoladas.
-- A nova versão agrega uma terceira posição, sem abrir tabelas diretamente
-- e sem substituir uma falta de escopo por um valor zero.
alter function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  rename to get_caixa_relatorio_mensal_detalhado_v4_core;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_v4_core(uuid, date)
  from public, anon, authenticated, service_role;

create function public.get_caixa_relatorio_mensal_detalhado_secure(
  p_polo_id uuid default null,
  p_competencia date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_relatorio jsonb;
  v_posicao_liquida jsonb;
begin
  v_relatorio := public.get_caixa_relatorio_mensal_detalhado_v4_core(
    p_polo_id,
    p_competencia
  );

  begin
    v_posicao_liquida := jsonb_build_object(
      'disponivel', true,
      'dados', public.get_caixa_posicao_liquida_resumo_secure(
        p_polo_id,
        p_competencia
      )
    );
  exception when insufficient_privilege then
    v_posicao_liquida := jsonb_build_object(
      'disponivel', false,
      'motivo', 'ACESSO_RESTRITO'
    );
  end;

  return v_relatorio || jsonb_build_object(
    'versao', 5,
    'posicao_liquida', v_posicao_liquida
  );
end;
$function$;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  to authenticated, service_role;

comment on function public.get_caixa_posicao_liquida_resumo_secure(uuid, date) is
  'Posição líquida canônica do Caixa: patrimônio ativo a custo menos saldo de empréstimos ainda devidos no fechamento, sem compor caixa ou resultado operacional.';

comment on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) is
  'Prestação mensal detalhada do Caixa v5: movimentos operacionais, patrimônio, financiamento e valor líquido canônicos no mesmo snapshot, sem compor posições complementares no resultado operacional.';

notify pgrst, 'reload schema';

commit;
