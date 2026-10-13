-- Execute only through the authorized Supabase MCP after all five migrations.
-- The actor/payer identifiers remain inside the transaction and never enter output.
-- This exercises the real RPCs, constraints, audit and Realtime triggers. No bank call.
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

DO $contract$
DECLARE
  v_actor uuid;
  v_polo uuid;
  v_candidate_polo uuid;
  v_payer uuid;
  v_request uuid := 'decafbad-0013-4013-8013-000000000001';
  v_input jsonb;
  v_preview jsonb;
  v_created jsonb;
  v_replayed jsonb;
  v_ids uuid[];
  v_before_titles bigint;
  v_before_plans bigint;
  v_before_bank bigint;
  v_before_enrollments bigint;
  v_found boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.outros_creditos_planos WHERE id = v_request) THEN
    RAISE EXCEPTION 'O identificador reservado do ensaio está ocupado; interrompa o ensaio.';
  END IF;
  SELECT count(*) INTO v_before_titles FROM public.contas_receber;
  SELECT count(*) INTO v_before_plans FROM public.outros_creditos_planos;
  SELECT count(*) INTO v_before_bank FROM public.payment_gateway_transactions;
  SELECT count(*) INTO v_before_enrollments FROM public.matriculas;

  -- Select one genuinely authorized operator and a scoped payer without exposing their data.
  FOR v_actor IN SELECT auth_user_id FROM public.usuarios_sistema
    WHERE auth_user_id IS NOT NULL AND lower(btrim(status)) IN ('ativo', 'active')
      AND lower(btrim(perfil)) IN ('gestor', 'financeiro') ORDER BY auth_user_id LIMIT 30
  LOOP
    PERFORM set_config('request.jwt.claim.sub', v_actor::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    IF NOT coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'), false) THEN CONTINUE; END IF;
    FOR v_candidate_polo IN SELECT p.id FROM public.polos p
      WHERE lower(coalesce(p.status, '')) = 'ativo' AND public.is_financeiro_for_polo(p.id)
      ORDER BY p.id LIMIT 30
    LOOP
      SELECT id INTO v_payer FROM public.get_financeiro_credores_por_polo_secure(v_candidate_polo)
        ORDER BY (tipo = 'Aluno') DESC, id LIMIT 1;
      IF v_payer IS NOT NULL THEN v_polo := v_candidate_polo; v_found := true; EXIT; END IF;
    END LOOP;
    IF v_found THEN EXIT; END IF;
  END LOOP;
  IF NOT v_found THEN
    RAISE EXCEPTION 'Sem operador/pagador autorizado para ensaio seguro neste horário.';
  END IF;

  v_input := jsonb_build_object('clienteId', v_payer,
    'descricao', 'ENSAIO TRANSACIONAL CARNÊ AVULSO — ROLLBACK',
    'quantidadeParcelas', 3, 'valorParcela', 100.25, 'primeiroVencimento', '2028-01-31',
    'jurosMensalPercentual', 1.234567, 'multaPercentual', 2,
    'descontoTipo', 'PERCENTUAL', 'descontoValor', 10, 'descontoDiasAntecedencia', 3,
    'matricula', jsonb_build_object('valor', 50, 'vencimento', '2028-01-20'), 'rematricula', NULL);
  v_preview := public.preview_outros_creditos_plano_secure(v_polo, v_input);
  IF jsonb_array_length(v_preview -> 'parcelas') <> 4
    OR v_preview #>> '{parcelas,2,dataVencimento}' <> '2028-02-29'
    OR v_preview #>> '{parcelas,3,dataVencimento}' <> '2028-03-31'
    OR (v_preview ->> 'totalNominal')::numeric <> 350.75 THEN
    RAISE EXCEPTION 'A prévia real divergiu do contrato canônico.';
  END IF;
  IF (SELECT count(*) FROM public.contas_receber) <> v_before_titles THEN
    RAISE EXCEPTION 'A prévia produziu efeitos financeiros indevidos.';
  END IF;

  v_created := public.criar_outros_creditos_plano_secure(v_request, v_polo, v_input);
  SELECT array_agg(id) INTO v_ids FROM public.contas_receber WHERE outros_creditos_plano_id = v_request;
  IF cardinality(v_ids) <> 4 OR (v_created ->> 'replayed')::boolean THEN
    RAISE EXCEPTION 'A criação real não confirmou exatamente quatro títulos locais.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contas_receber WHERE id = ANY(v_ids)
    AND (matricula_id IS NOT NULL OR turma_id IS NOT NULL OR origem_cronograma_id IS NOT NULL
      OR status <> 'PENDENTE' OR tipo_lancamento <> 'OUTRO_CREDITO'
      OR forma_pagamento <> 'BOLETO' OR gateway_payment_method <> 'BOLETO'
      OR gateway_provider IS NOT NULL OR gateway_payment_id IS NOT NULL
      OR gateway_financial_terms IS NOT NULL OR gateway_financial_terms_confirmed_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'A criação real alterou identidade acadêmica ou antecipou registro bancário.';
  END IF;
  IF (SELECT count(*) FROM public.payment_gateway_transactions) <> v_before_bank
    OR (SELECT count(*) FROM public.matriculas) <> v_before_enrollments THEN
    RAISE EXCEPTION 'A criação avulsa produziu registro bancário ou acadêmico indevido.';
  END IF;
  IF (SELECT count(*) FROM public.sistema_eventos WHERE entidade = 'contas_receber'
      AND entidade_id IN (SELECT unnest(v_ids)::text) AND actor_id = v_actor) < 4 THEN
    RAISE EXCEPTION 'A auditoria real não identifica o autor de todos os títulos.';
  END IF;
  IF (SELECT count(*) FROM public.finance_realtime_events WHERE source_table = 'contas_receber'
      AND entity_id = ANY(v_ids) AND polo_id = v_polo) < 4 THEN
    RAISE EXCEPTION 'Os eventos Realtime reais não cobrem os títulos do polo.';
  END IF;

  v_replayed := public.criar_outros_creditos_plano_secure(v_request, v_polo, v_input);
  IF NOT (v_replayed ->> 'replayed')::boolean
    OR (SELECT count(*) FROM public.outros_creditos_planos) <> v_before_plans + 1
    OR (SELECT count(*) FROM public.contas_receber) <> v_before_titles + 4 THEN
    RAISE EXCEPTION 'O replay real duplicou o carnê ou seus títulos.';
  END IF;
  BEGIN
    PERFORM public.criar_outros_creditos_plano_secure(v_request, v_polo,
      v_input || jsonb_build_object('valorParcela', 101));
    RAISE EXCEPTION 'O replay divergente foi aceito.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    UPDATE public.contas_receber SET valor = valor + 1 WHERE id = v_ids[1];
    RAISE EXCEPTION 'O valor canônico foi alterado.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    DELETE FROM public.contas_receber WHERE id = v_ids[1];
    RAISE EXCEPTION 'Um título canônico foi excluído.';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF jsonb_array_length(public.obter_outros_creditos_plano_secure(v_request) -> 'receivables') <> 4 THEN
    RAISE EXCEPTION 'A leitura real do plano está incompleta.';
  END IF;
END;
$contract$;

-- Mandatory: all transient plans/titles/audit/events above are discarded.
ROLLBACK;

SELECT NOT EXISTS (SELECT 1 FROM public.outros_creditos_planos
  WHERE id = 'decafbad-0013-4013-8013-000000000001') AS rollback_preserved_no_plan,
  NOT EXISTS (SELECT 1 FROM public.contas_receber
  WHERE outros_creditos_plano_id = 'decafbad-0013-4013-8013-000000000001') AS rollback_preserved_no_titles;
