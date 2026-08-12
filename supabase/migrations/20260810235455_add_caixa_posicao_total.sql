begin;

-- Posição total registrada: combina somente fatos que podem ser reconstruídos
-- no mesmo corte. Não é "patrimônio líquido" contábil: não inclui contas a
-- receber/pagar, tributos, depreciação ou valor de mercado.
--
-- O mês corrente fecha em CURRENT_DATE; os meses anteriores, no último dia
-- da competência. Conta sem uma base (data_saldo) anterior ao corte não pode
-- produzir saldo histórico confiável e deixa a posição explicitamente
-- indisponível, em vez de trocar a lacuna por zero.
create function public.get_caixa_posicao_total_resumo_secure(
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
  v_competencia date := date_trunc('month', coalesce(p_competencia, current_date))::date;
  v_data_corte date;
  v_allowed_polo_ids uuid[] := array[]::uuid[];
  v_valor_patrimonial_custo numeric := 0;
  v_saldo_emprestimos_a_pagar numeric := 0;
  v_saldo_caixa_registrado numeric := 0;
  v_contas_sem_historico integer := 0;
begin
  if v_competencia > date_trunc('month', current_date)::date then
    raise exception 'A competência da posição total não pode estar em mês futuro.'
      using errcode = '22023';
  end if;

  v_data_corte := least(
    (v_competencia + interval '1 month - 1 day')::date,
    current_date
  );

  -- Mantém a autorização dos dois domínios na fonte canônica antes de
  -- consultar qualquer fato. A posição complementar não expõe valor parcial.
  begin
    perform public.get_caixa_financiamento_resumo_secure(
      p_polo_id,
      v_competencia
    );
    perform public.get_caixa_patrimonio_resumo_secure(
      p_polo_id,
      v_competencia
    );
  exception when insufficient_privilege then
    return jsonb_build_object(
      'versao', 1,
      'competencia', to_char(v_competencia, 'YYYY-MM-DD'),
      'data_corte', to_char(v_data_corte, 'YYYY-MM-DD'),
      'escopo_tipo', case when p_polo_id is null then 'GLOBAL' else 'POLO' end,
      'polo_id', p_polo_id,
      'disponivel', false,
      'motivo', 'ACESSO_RESTRITO',
      'observacao', 'Não foi possível combinar caixa, patrimônio e empréstimos neste escopo.'
    );
  end;

  -- Espelha o escopo patrimonial já autorizado. A posição global usa os
  -- polos ativos; a de polo mantém exclusivamente o polo consultado.
  if auth.role() = 'service_role' then
    if p_polo_id is null then
      select coalesce(array_agg(polo.id), array[]::uuid[])
      into v_allowed_polo_ids
      from public.polos polo
      where lower(coalesce(polo.status, 'ativo')) = 'ativo';
    else
      select array[polo.id]
      into v_allowed_polo_ids
      from public.polos polo
      where polo.id = p_polo_id
        and lower(coalesce(polo.status, 'ativo')) = 'ativo';
    end if;
  elsif p_polo_id is null then
    v_allowed_polo_ids := coalesce(public.gestor_allowed_polo_ids(), array[]::uuid[]);
  else
    v_allowed_polo_ids := array[p_polo_id];
  end if;

  with perdas_ate_corte as (
    select
      evento.patrimonio_id,
      sum(evento.quantidade_movimento)::integer as quantidade_baixada
    from public.patrimonio_eventos evento
    join public.patrimonios patrimonio on patrimonio.id = evento.patrimonio_id
    where evento.tipo = 'baixa_perda'
      and evento.effective_on <= v_data_corte
      and evento.polo_id = any(v_allowed_polo_ids)
      and patrimonio.status <> 'excluido'
    group by evento.patrimonio_id
  ), posicao as (
    select round(
      greatest(
        patrimonio.quantidade - coalesce(perda.quantidade_baixada, 0),
        0
      )::numeric * patrimonio.valor_unitario,
      2
    ) as valor_ativo
    from public.patrimonios patrimonio
    left join perdas_ate_corte perda on perda.patrimonio_id = patrimonio.id
    where patrimonio.status <> 'excluido'
      and patrimonio.polo_id = any(v_allowed_polo_ids)
      and patrimonio.data_aquisicao <= v_data_corte
  )
  select coalesce(sum(posicao.valor_ativo), 0)
  into v_valor_patrimonial_custo
  from posicao;

  -- Em contratos rateados, a obrigação econômica vem exclusivamente do
  -- rateio; em SEM_RATEIO, da parcela física do polo responsável. Nunca use
  -- contas_pagar aqui: o título físico da Matriz duplicaria os polos.
  with saldo_devedor as (
    select rateio.valor_total
    from public.emprestimo_parcela_rateios rateio
    join public.emprestimo_parcelas parcela on parcela.id = rateio.emprestimo_parcela_id
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo in ('TODOS', 'SELECIONADOS')
      and emprestimo.data_liberacao <= v_data_corte
      and emprestimo.status <> 'CANCELADO'
      and parcela.status <> 'CANCELADO'
      and rateio.status <> 'CANCELADO'
      and (parcela.data_pagamento is null or parcela.data_pagamento > v_data_corte)
      and (p_polo_id is null or rateio.polo_id = p_polo_id)

    union all

    select parcela.valor_total
    from public.emprestimo_parcelas parcela
    join public.emprestimos_financeiros emprestimo on emprestimo.id = parcela.emprestimo_id
    where emprestimo.rateio_modo = 'SEM_RATEIO'
      and emprestimo.data_liberacao <= v_data_corte
      and emprestimo.status <> 'CANCELADO'
      and parcela.status <> 'CANCELADO'
      and (parcela.data_pagamento is null or parcela.data_pagamento > v_data_corte)
      and (p_polo_id is null or emprestimo.polo_matriz_id = p_polo_id)
  )
  select coalesce(sum(valor_total), 0)
  into v_saldo_emprestimos_a_pagar
  from saldo_devedor;

  -- Não há trilha temporal da data de criação da conta. Portanto, para um
  -- corte anterior à base declarada (ou sem base), não inferimos um saldo.
  -- Em polo, vínculos compartilhados nascidos depois do corte não entram.
  with contas_escopo as (
    select conta.id, conta.data_saldo
    from public.contas_bancarias conta
    where public.can_access_conta_bancaria(conta.id)
      and (
        p_polo_id is null
       or conta.polo_id = p_polo_id
       or exists (
         select 1
         from public.contas_bancarias_polos acesso
         where acesso.conta_bancaria_id = conta.id
           and acesso.polo_id = p_polo_id
           and acesso.created_at::date <= v_data_corte
       )
      )
  )
  select count(*)::integer
  into v_contas_sem_historico
  from contas_escopo conta
  where conta.data_saldo is null
     or conta.data_saldo > v_data_corte;

  if v_contas_sem_historico > 0 then
    return jsonb_build_object(
      'versao', 1,
      'competencia', to_char(v_competencia, 'YYYY-MM-DD'),
      'data_corte', to_char(v_data_corte, 'YYYY-MM-DD'),
      'escopo_tipo', case when p_polo_id is null then 'GLOBAL' else 'POLO' end,
      'polo_id', p_polo_id,
      'disponivel', false,
      'motivo', 'HISTORICO_INSUFICIENTE',
      'observacao', 'Não há base de saldo comprovadamente anterior ao corte para todas as contas deste escopo.'
    );
  end if;

  -- Global soma cada conta física apenas uma vez e ignora RATEIO_INTERNO.
  -- Polo recebe sua posição gerencial: saldos iniciais de conta compartilhada
  -- ficam não atribuídos e transferências de rateio movem somente posições.
  with contas_escopo as (
    select
      conta.id,
      conta.polo_id,
      conta.saldo_inicial,
      conta.data_saldo,
      (
        select count(*)
        from public.contas_bancarias_polos acesso
        where acesso.conta_bancaria_id = conta.id
          and acesso.created_at::date <= v_data_corte
      )::integer as polos_em_uso
    from public.contas_bancarias conta
    where public.can_access_conta_bancaria(conta.id)
      and (
        p_polo_id is null
       or conta.polo_id = p_polo_id
       or exists (
         select 1
         from public.contas_bancarias_polos acesso
         where acesso.conta_bancaria_id = conta.id
           and acesso.polo_id = p_polo_id
           and acesso.created_at::date <= v_data_corte
       )
      )
  ), movimentos as (
    select
      conta.id as conta_id,
      case when conta.polos_em_uso > 1 then null::uuid else conta.polo_id end as polo_movimento_id,
      coalesce(conta.saldo_inicial, 0)::numeric as entrada,
      0::numeric as saida
    from contas_escopo conta

    union all

    select
      recebimento.conta_bancaria_id,
      recebimento.polo_id,
      coalesce(
        case
          when recebimento.manual_settlement_id is not null
               and recebimento.manual_settlement_reversed_at is null
            then recebimento.manual_settlement_received_cents::numeric / 100.0
          else null
        end,
        recebimento.valor_pago,
        recebimento.valor,
        0
      ),
      0::numeric
    from public.contas_receber recebimento
    join contas_escopo conta on conta.id = recebimento.conta_bancaria_id
    where recebimento.status = 'PAGO'
      and coalesce(recebimento.data_pagamento, recebimento.created_at::date) >= conta.data_saldo
      and coalesce(recebimento.data_pagamento, recebimento.created_at::date) <= v_data_corte

    union all

    select
      pagamento.conta_bancaria_id,
      pagamento.polo_id,
      0::numeric,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)
    from public.contas_pagar pagamento
    join contas_escopo conta on conta.id = pagamento.conta_bancaria_id
    where pagamento.status = 'PAGO'
      and pagamento.despesa_lancamento_id is null
      and coalesce(pagamento.data_pagamento, pagamento.created_at::date) >= conta.data_saldo
      and coalesce(pagamento.data_pagamento, pagamento.created_at::date) <= v_data_corte

    union all

    select
      despesa.conta_bancaria_id,
      despesa.polo_id,
      0::numeric,
      coalesce(despesa.valor_pago, despesa.valor, 0)
    from public.despesas_lancamentos despesa
    join contas_escopo conta on conta.id = despesa.conta_bancaria_id
    where despesa.status = 'PAGO'
      and coalesce(despesa.data_pagamento, despesa.created_at::date) >= conta.data_saldo
      and coalesce(despesa.data_pagamento, despesa.created_at::date) <= v_data_corte

    union all

    select
      transferencia.conta_origem_id,
      transferencia.polo_id,
      0::numeric,
      coalesce(transferencia.valor, 0)
    from public.transferencias_contas transferencia
    join contas_escopo conta on conta.id = transferencia.conta_origem_id
    where transferencia.data_transferencia >= conta.data_saldo
      and transferencia.data_transferencia <= v_data_corte
      and (p_polo_id is not null or transferencia.tipo = 'FISICA')

    union all

    select
      transferencia.conta_destino_id,
      transferencia.polo_destino_id,
      coalesce(transferencia.valor, 0),
      0::numeric
    from public.transferencias_contas transferencia
    join contas_escopo conta on conta.id = transferencia.conta_destino_id
    where transferencia.data_transferencia >= conta.data_saldo
      and transferencia.data_transferencia <= v_data_corte
      and (p_polo_id is not null or transferencia.tipo = 'FISICA')
  )
  select coalesce(sum(
    case
      when p_polo_id is null or movimento.polo_movimento_id = p_polo_id
        then movimento.entrada - movimento.saida
      else 0
    end
  ), 0)
  into v_saldo_caixa_registrado
  from movimentos movimento;

  return jsonb_build_object(
    'versao', 1,
    'competencia', to_char(v_competencia, 'YYYY-MM-DD'),
    'data_corte', to_char(v_data_corte, 'YYYY-MM-DD'),
    'escopo_tipo', case when p_polo_id is null then 'GLOBAL' else 'POLO' end,
    'polo_id', p_polo_id,
    'disponivel', true,
    'dados', jsonb_build_object(
      'saldo_caixa_registrado', round(v_saldo_caixa_registrado, 2)::text,
      'valor_patrimonial_custo', round(v_valor_patrimonial_custo, 2)::text,
      'saldo_emprestimos_a_pagar', round(v_saldo_emprestimos_a_pagar, 2)::text,
      'valor_total_liquido', round(
        v_saldo_caixa_registrado
        + v_valor_patrimonial_custo
        - v_saldo_emprestimos_a_pagar,
        2
      )::text,
      'observacao', 'Posição total registrada = saldo de caixa registrado mais patrimônio a custo menos empréstimos a pagar no corte. Não é patrimônio líquido contábil e não inclui contas a receber ou pagar, tributos, depreciação ou valor de mercado.'
    )
  );
end;
$function$;

revoke all on function public.get_caixa_posicao_total_resumo_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_posicao_total_resumo_secure(uuid, date)
  to authenticated, service_role;

-- O wrapper do PDF continua centralizando o snapshot. A posição total vem
-- discriminada pela própria RPC para preservar uma indisponibilidade honesta.
alter function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  rename to get_caixa_relatorio_mensal_detalhado_v5_core;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_v5_core(uuid, date)
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
begin
  v_relatorio := public.get_caixa_relatorio_mensal_detalhado_v5_core(
    p_polo_id,
    p_competencia
  );

  return v_relatorio || jsonb_build_object(
    'versao', 6,
    'posicao_total', public.get_caixa_posicao_total_resumo_secure(
      p_polo_id,
      p_competencia
    )
  );
end;
$function$;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  to authenticated, service_role;

comment on function public.get_caixa_posicao_total_resumo_secure(uuid, date) is
  'Posição total registrada no corte: caixa registrado mais patrimônio a custo menos empréstimos a pagar. Não representa patrimônio líquido contábil completo.';

comment on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) is
  'Prestação mensal detalhada do Caixa v6: movimentos operacionais, patrimônio, financiamento, posição líquida complementar e posição total registrada no mesmo corte.';

notify pgrst, 'reload schema';

commit;
