begin;

-- A RPC canônica de financiamento já referencia todos os objetos não nativos
-- com schema explícito. Mantemos a sua execução compatível com a política de
-- SECURITY DEFINER sem alterar cálculo, assinatura ou grants.
alter function public.get_caixa_financiamento_resumo_secure(uuid, date)
  set search_path = '';

-- A prestação de contas passa a carregar em um único snapshot as posições
-- complementares já calculadas pelas RPCs canônicas de patrimônio e
-- financiamento. Elas permanecem fora das entradas, saídas e resultado
-- operacional do Caixa.
alter function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  rename to get_caixa_relatorio_mensal_detalhado_v3_core;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_v3_core(uuid, date)
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
  v_financiamento jsonb;
  v_patrimonio jsonb;
begin
  -- Cada RPC chamada mantém sua própria autorização canônica: o núcleo v3
  -- valida Caixa, financiamento exige o escopo financeiro e patrimônio
  -- valida o escopo patrimonial. Não há leitura direta de tabelas aqui.
  v_relatorio := public.get_caixa_relatorio_mensal_detalhado_v3_core(
    p_polo_id,
    p_competencia
  );

  -- A falta de escopo complementar não elimina a prestação que já era
  -- autorizada pelo Caixa v3. O bloco fica explicitamente indisponível,
  -- sem valores substitutos e sem expor dados financeiros ou patrimoniais.
  begin
    v_financiamento := jsonb_build_object(
      'disponivel', true,
      'dados', public.get_caixa_financiamento_resumo_secure(
        p_polo_id,
        p_competencia
      )
    );
  exception when insufficient_privilege then
    v_financiamento := jsonb_build_object(
      'disponivel', false,
      'motivo', 'ACESSO_RESTRITO'
    );
  end;

  begin
    v_patrimonio := jsonb_build_object(
      'disponivel', true,
      'dados', public.get_caixa_patrimonio_resumo_secure(
        p_polo_id,
        p_competencia
      )
    );
  exception when insufficient_privilege then
    v_patrimonio := jsonb_build_object(
      'disponivel', false,
      'motivo', 'ACESSO_RESTRITO'
    );
  end;

  return v_relatorio || jsonb_build_object(
    'versao', 4,
    'financiamento', v_financiamento,
    'patrimonio', v_patrimonio
  );
end;
$function$;

revoke all on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  from public, anon;
grant execute on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date)
  to authenticated, service_role;

comment on function public.get_caixa_relatorio_mensal_detalhado_secure(uuid, date) is
  'Prestação mensal detalhada do Caixa v4: movimentos operacionais, carteira, patrimônio e financiamento canônicos no mesmo payload, sem compor financiamento ou patrimônio no resultado operacional.';

notify pgrst, 'reload schema';

commit;
