begin;

set transaction isolation level serializable;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Corrige somente a regra-base da turma importada do Banese. Os titulos
-- existentes e as condicoes individuais permanecem imutaveis.
do $migration$
declare
  v_turma public.turmas%rowtype;
  v_turma_id uuid;
  v_rule_before jsonb;
  v_rule_after jsonb;
  v_titles_before text;
  v_titles_after text;
  v_enrollments_before text;
  v_enrollments_after text;
  v_configs_before text;
  v_configs_after text;
  v_title_count bigint;
  v_parcel_count bigint;
  v_enrollment_fee_count bigint;
  v_renewal_count bigint;
  v_banese_count bigint;
  v_canonical_parcel_count bigint;
  v_title_asaas_provider_count bigint;
  v_title_asaas_id_count bigint;
  v_enrollment_count bigint;
  v_enrollment_asaas_disabled_count bigint;
  v_active_future_count bigint;
  v_dropout_blocked_count bigint;
  v_pending_without_override_count bigint;
  v_config_count bigint;
  v_override_count bigint;
  v_expected_override_count bigint;
  v_effective_rule_count bigint;
  v_history_count bigint;
  v_row_count integer;
begin
  select turma.*
  into v_turma
  from public.turmas turma
  where turma.codigo = '2026.1-RAD-INT-JAP'
  for update;

  if not found then
    raise exception 'Turma 2026.1-RAD-INT-JAP nao encontrada.';
  end if;

  v_turma_id := v_turma.id;

  -- A baixa de uma parcela comeca por contas_receber. Bloquear nessa mesma
  -- direcao impede que a 12a baixa atravesse a troca da regra-base.
  perform 1
  from public.contas_receber conta
  where conta.turma_id = v_turma_id
  order by conta.id
  for update;

  perform 1
  from public.matriculas matricula
  where matricula.turma_id = v_turma_id
  order by matricula.id
  for update;

  perform 1
  from public.matriculas_tecnicas_financeiro_config config
  join public.matriculas matricula on matricula.id = config.matricula_id
  where matricula.turma_id = v_turma_id
  order by config.matricula_id
  for update of config;

  if v_turma.status is distinct from 'EM_ANDAMENTO'
     or v_turma.data_inicio is distinct from date '2026-03-12'
     or v_turma.data_previsao_termino is distinct from date '2028-03-12'
     or v_turma.primeiro_vencimento_padrao is distinct from date '2026-04-11'
     or v_turma.origem_financeira is distinct from 'LEGADO'
     or v_turma.financeiro_herdado is distinct from true
     or v_turma.cobrar_matricula is distinct from false
     or v_turma.valor_matricula is distinct from 0.00
     or v_turma.cobrar_rematricula is distinct from false
     or v_turma.valor_rematricula is distinct from 0.00
     or v_turma.qtd_parcelas is distinct from 12
     or v_turma.valor_parcela is distinct from 279.90
     or v_turma.desconto_pontualidade is distinct from 19.90
     or v_turma.juros_atraso is distinct from 1.00
     or v_turma.multa_atraso_percentual is distinct from 2.00
     or v_turma.aplicar_desconto_matricula is distinct from false
     or v_turma.aplicar_multa_juros_matricula is distinct from true
     or v_turma.aplicar_desconto_mensalidade is distinct from true
     or v_turma.aplicar_multa_juros_mensalidade is distinct from true
     or v_turma.aplicar_desconto_rematricula is distinct from false
     or v_turma.aplicar_multa_juros_rematricula is distinct from true
     or v_turma.gerar_cobrancas_futuras is distinct from false
     or v_turma.sincronizar_asaas_futuro is distinct from false
     or v_turma.regra_financeira_revisao is distinct from 4
     or v_turma.regra_financeira_fingerprint is distinct from
       '70bc7c53a094c98d81d1257a704259f1fbf3cc19d0906b97f7d81f64fe6cb970'
  then
    raise exception
      'A regra-base da turma mudou; correcao financeira cancelada.';
  end if;

  v_rule_before := internal_academic.technical_financial_rule(v_turma_id);
  if (v_rule_before #>> '{cobranca,matricula,habilitada}')::boolean
       is distinct from false
     or (v_rule_before #>> '{cobranca,rematricula,habilitada}')::boolean
       is distinct from false
     or (v_rule_before #>> '{continuidade,maxCiclos}')::integer
       is distinct from 1
     or v_rule_before #>> '{continuidade,proximoCiclo}' is distinct from
       'ENCERRA_APOS_MENSALIDADES'
  then
    raise exception
      'O contrato financeiro anterior mudou; correcao cancelada.';
  end if;

  select
    count(*),
    count(*) filter (where conta.tipo_lancamento = 'PARCELA'),
    count(*) filter (where conta.tipo_lancamento = 'MATRICULA'),
    count(*) filter (where conta.tipo_lancamento = 'REMATRICULA'),
    count(*) filter (
      where conta.tipo_lancamento = 'PARCELA'
        and conta.gateway_provider = 'banese_card'
        and conta.gateway_environment = 'production'
        and conta.gateway_submission_status = 'API_REGISTERED'
    ),
    count(*) filter (
      where conta.tipo_lancamento = 'PARCELA'
        and conta.origem_cronograma_id ~ '^ciclo-1-parc-[0-9]+$'
    ),
    count(*) filter (where conta.gateway_provider = 'asaas'),
    count(*) filter (
      where conta.asaas_payment_id is not null
         or conta.asaas_installment_id is not null
         or conta.asaas_payment_link_id is not null
    ),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(conta)::text,
      '|' order by conta.id
    ), ''))
  into
    v_title_count,
    v_parcel_count,
    v_enrollment_fee_count,
    v_renewal_count,
    v_banese_count,
    v_canonical_parcel_count,
    v_title_asaas_provider_count,
    v_title_asaas_id_count,
    v_titles_before
  from public.contas_receber conta
  where conta.turma_id = v_turma_id;

  if v_title_count is distinct from 338
     or v_parcel_count is distinct from 312
     or v_enrollment_fee_count is distinct from 26
     or v_renewal_count is distinct from 0
     or v_banese_count is distinct from 312
     or v_canonical_parcel_count is distinct from 312
     or v_title_asaas_provider_count is distinct from 0
     or v_title_asaas_id_count is distinct from 0
  then
    raise exception
      'Os titulos importados mudaram; correcao financeira cancelada.';
  end if;

  select
    count(*),
    count(*) filter (where matricula.sincronizar_asaas is false),
    count(*) filter (
      where matricula.status = 'PENDENTE'
        and matricula.gerar_cobranca_futura is true
        and config.override_ativo is true
    ),
    count(*) filter (
      where matricula.status = 'DESISTENTE'
        and matricula.gerar_cobranca_futura is false
        and config.override_ativo is true
    ),
    count(*) filter (
      where matricula.status = 'PENDENTE'
        and matricula.gerar_cobranca_futura is false
        and config.override_ativo is false
    ),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(matricula)::text,
      '|' order by matricula.id
    ), ''))
  into
    v_enrollment_count,
    v_enrollment_asaas_disabled_count,
    v_active_future_count,
    v_dropout_blocked_count,
    v_pending_without_override_count,
    v_enrollments_before
  from public.matriculas matricula
  join public.matriculas_tecnicas_financeiro_config config
    on config.matricula_id = matricula.id
  where matricula.turma_id = v_turma_id;

  if v_enrollment_count is distinct from 27
     or v_enrollment_asaas_disabled_count is distinct from 27
     or v_active_future_count is distinct from 24
     or v_dropout_blocked_count is distinct from 2
     or v_pending_without_override_count is distinct from 1
  then
    raise exception
      'As matriculas da turma mudaram; correcao financeira cancelada.';
  end if;

  select
    count(*),
    count(*) filter (where config.override_ativo is true),
    pg_catalog.md5(coalesce(pg_catalog.string_agg(
      pg_catalog.to_jsonb(config)::text,
      '|' order by config.matricula_id
    ), ''))
  into v_config_count, v_override_count, v_configs_before
  from public.matriculas_tecnicas_financeiro_config config
  join public.matriculas matricula on matricula.id = config.matricula_id
  where matricula.turma_id = v_turma_id;

  select count(*)
  into v_expected_override_count
  from public.matriculas matricula
  join public.matriculas_tecnicas_financeiro_config config
    on config.matricula_id = matricula.id
  where matricula.turma_id = v_turma_id
    and config.override_ativo is true
    and matricula.cobrar_matricula_individual is true
    and matricula.valor_matricula_individual = 200.00
    and matricula.cobrar_rematricula_individual is true
    and matricula.valor_rematricula_individual = 200.00
    and matricula.aplicar_desconto_matricula_individual is false
    and matricula.aplicar_multa_juros_matricula_individual is true
    and matricula.aplicar_desconto_rematricula_individual is false
    and matricula.aplicar_multa_juros_rematricula_individual is true;

  if v_config_count is distinct from 27
     or v_override_count is distinct from 26
     or v_expected_override_count is distinct from 26
  then
    raise exception
      'As condicoes individuais mudaram; correcao financeira cancelada.';
  end if;

  -- Se a 12a parcela ja tiver sido quitada sob a regra antiga, nao ha nova
  -- transicao de status capaz de disparar a rematricula. Abortamos sem criar
  -- cobranca para que esse caso seja tratado de forma explicitamente auditada.
  if exists (
    select 1
    from public.matriculas matricula
    where matricula.turma_id = v_turma_id
      and matricula.status = 'PENDENTE'
      and matricula.gerar_cobranca_futura is true
      and (
        select count(*)
        from public.contas_receber conta
        where conta.matricula_id = matricula.id
          and conta.tipo_lancamento = 'PARCELA'
          and conta.origem_cronograma_id ~ '^ciclo-1-parc-[0-9]+$'
      ) = 12
      and (
        select count(*)
        from public.contas_receber conta
        where conta.matricula_id = matricula.id
          and conta.tipo_lancamento = 'PARCELA'
          and conta.origem_cronograma_id ~ '^ciclo-1-parc-[0-9]+$'
          and conta.status = 'PAGO'
      ) = 12
      and not exists (
        select 1
        from public.contas_receber conta
        where conta.matricula_id = matricula.id
          and conta.tipo_lancamento = 'REMATRICULA'
          and conta.origem_cronograma_id = 'ciclo-1-rematricula'
      )
  ) then
    raise exception
      'Ha aluno com 12/12 pagas e sem rematricula; correcao automatica cancelada.';
  end if;

  select count(*) into v_history_count
  from public.historico_turma_financeira history
  where history.turma_id = v_turma_id;

  update public.turmas turma
  set cobrar_matricula = true,
      valor_matricula = 200.00,
      cobrar_rematricula = true,
      valor_rematricula = 200.00,
      aplicar_desconto_matricula = false,
      aplicar_multa_juros_matricula = true,
      aplicar_desconto_rematricula = false,
      aplicar_multa_juros_rematricula = true,
      gerar_cobrancas_futuras = true,
      sincronizar_asaas_futuro = false,
      obs_financeira_origem =
        'Ciclo 1 preservado da importacao Banese API: matricula local de R$ 200,00 e 12 parcelas historicas. Apos a quitacao do ciclo 1, gerar rematricula de R$ 200,00 sem desconto e com multa/juros; apos a baixa da rematricula, gerar o segundo e ultimo ciclo de 12 mensalidades. Nao reemitir cobrancas Banese ja importadas.'
  where turma.id = v_turma_id;

  get diagnostics v_row_count = row_count;
  if v_row_count is distinct from 1 then
    raise exception 'A regra-base da turma nao foi atualizada.';
  end if;

  select turma.* into strict v_turma
  from public.turmas turma
  where turma.id = v_turma_id;

  v_rule_after := internal_academic.technical_financial_rule(v_turma_id);
  if v_turma.cobrar_matricula is distinct from true
     or v_turma.valor_matricula is distinct from 200.00
     or v_turma.cobrar_rematricula is distinct from true
     or v_turma.valor_rematricula is distinct from 200.00
     or v_turma.gerar_cobrancas_futuras is distinct from true
     or v_turma.sincronizar_asaas_futuro is distinct from false
     or v_turma.regra_financeira_revisao is distinct from 5
     or v_turma.regra_financeira_fingerprint is distinct from
       '256ebb50613a830ba43dbd15065102e5e140a251f6f83ba6a79e37377a86f0b8'
     or jsonb_array_length(v_turma.cronograma_financeiro) is distinct from 14
     or (v_rule_after #>> '{cobranca,matricula,habilitada}')::boolean
       is distinct from true
     or (v_rule_after #>> '{cobranca,matricula,valor}')::numeric
       is distinct from 200.00
     or (v_rule_after #>> '{cobranca,rematricula,habilitada}')::boolean
       is distinct from true
     or (v_rule_after #>> '{cobranca,rematricula,valor}')::numeric
       is distinct from 200.00
     or (v_rule_after #>> '{aplicacao,matricula,desconto}')::boolean
       is distinct from false
     or (v_rule_after #>> '{aplicacao,matricula,multaJuros}')::boolean
       is distinct from true
     or (v_rule_after #>> '{aplicacao,rematricula,desconto}')::boolean
       is distinct from false
     or (v_rule_after #>> '{aplicacao,rematricula,multaJuros}')::boolean
       is distinct from true
     or (v_rule_after #>> '{continuidade,maxCiclos}')::integer
       is distinct from 2
     or v_rule_after #>> '{continuidade,proximoCiclo}'
       is distinct from 'APOS_REMATRICULA'
     or (v_rule_after #>> '{continuidade,encerraAposCiclo}')::integer
       is distinct from 2
     or jsonb_array_length(v_rule_after -> 'cronogramaCiclo')
       is distinct from 14
  then
    raise exception 'A regra-base corrigida nao atende ao contrato esperado.';
  end if;

  select count(*)
  into v_effective_rule_count
  from public.matriculas matricula
  where matricula.turma_id = v_turma_id
    and matricula.status = 'PENDENTE'
    and matricula.gerar_cobranca_futura is true
    and (
      select count(*)
      from public.contas_receber conta
      where conta.matricula_id = matricula.id
        and conta.tipo_lancamento = 'PARCELA'
        and conta.origem_cronograma_id ~ '^ciclo-1-parc-[0-9]+$'
    ) = 12
    and (
      internal_academic.technical_financial_effective_rule(matricula.id)
        #>> '{cobranca,rematricula,habilitada}'
    )::boolean
    and (
      internal_academic.technical_financial_effective_rule(matricula.id)
        #>> '{cobranca,rematricula,valor}'
    )::numeric = 200.00
    and not (
      internal_academic.technical_financial_effective_rule(matricula.id)
        #>> '{aplicacao,rematricula,desconto}'
    )::boolean
    and (
      internal_academic.technical_financial_effective_rule(matricula.id)
        #>> '{aplicacao,rematricula,multaJuros}'
    )::boolean
    and internal_academic.technical_financial_effective_rule(matricula.id)
      #>> '{continuidade,proximoCiclo}' = 'APOS_REMATRICULA';

  if v_effective_rule_count is distinct from 24 then
    raise exception
      'A regra efetiva dos alunos vigentes nao foi preservada.';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(conta)::text,
    '|' order by conta.id
  ), ''))
  into v_titles_after
  from public.contas_receber conta
  where conta.turma_id = v_turma_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(matricula)::text,
    '|' order by matricula.id
  ), ''))
  into v_enrollments_after
  from public.matriculas matricula
  where matricula.turma_id = v_turma_id;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
    pg_catalog.to_jsonb(config)::text,
    '|' order by config.matricula_id
  ), ''))
  into v_configs_after
  from public.matriculas_tecnicas_financeiro_config config
  join public.matriculas matricula on matricula.id = config.matricula_id
  where matricula.turma_id = v_turma_id;

  select
    count(*) filter (where conta.gateway_provider = 'asaas'),
    count(*) filter (
      where conta.asaas_payment_id is not null
         or conta.asaas_installment_id is not null
         or conta.asaas_payment_link_id is not null
    )
  into v_title_asaas_provider_count, v_title_asaas_id_count
  from public.contas_receber conta
  where conta.turma_id = v_turma_id;

  select count(*) filter (where matricula.sincronizar_asaas is false)
  into v_enrollment_asaas_disabled_count
  from public.matriculas matricula
  where matricula.turma_id = v_turma_id;

  if v_titles_after is distinct from v_titles_before
     or v_enrollments_after is distinct from v_enrollments_before
     or v_configs_after is distinct from v_configs_before
     or v_title_asaas_provider_count is distinct from 0
     or v_title_asaas_id_count is distinct from 0
     or v_enrollment_asaas_disabled_count is distinct from 27
  then
    raise exception
      'Titulos ou condicoes individuais foram alterados; rollback obrigatorio.';
  end if;

  insert into public.historico_turma_financeira(
    turma_id,
    matricula_id,
    evento,
    regra,
    observacao
  ) values (
    v_turma_id,
    null,
    'REGRA_TECNICA_ATUALIZADA',
    v_rule_after,
    'Correcao auditada da regra-base: matricula e rematricula de R$ 200,00, sem desconto e com multa/juros; segundo ciclo liberado somente apos a rematricula paga. Titulos Banese e overrides preservados.'
  );

  if (
    select count(*)
    from public.historico_turma_financeira history
    where history.turma_id = v_turma_id
  ) is distinct from v_history_count + 1 then
    raise exception 'O historico financeiro da correcao nao foi registrado.';
  end if;
end;
$migration$;

commit;
