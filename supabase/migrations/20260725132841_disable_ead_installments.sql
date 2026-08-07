-- Cursos EAD usam cobrança única. Preserva métodos de pagamento e demais
-- configurações financeiras, removendo somente regras de parcelamento.
update public.cursos
set financeiro_config = coalesce(financeiro_config, '{}'::jsonb)
  || jsonb_build_object(
    'parcelasPadrao', 1,
    'cartao', coalesce(financeiro_config->'cartao', '{}'::jsonb)
      || jsonb_build_object(
        'maxParcelas', 1,
        'repassarCustoParcelamento', false
      ),
    'asaas', coalesce(financeiro_config->'asaas', '{}'::jsonb)
      || jsonb_build_object(
        'gerarParcelamentoMensalidades', false,
        'tipoCarnePreferencial', 'COBRANCAS_AVULSAS'
      )
  )
where upper(coalesce(modalidade, '')) = 'EAD';
