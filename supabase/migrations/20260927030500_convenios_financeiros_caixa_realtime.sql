BEGIN;

CREATE FUNCTION public.get_caixa_convenios_resumo_secure(
  p_polo_id uuid DEFAULT NULL,
  p_competencia date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_competencia date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_items jsonb;
  v_quantidade integer;
  v_saldo_inicial numeric;
  v_creditos numeric;
  v_pagas numeric;
  v_aberto numeric;
BEGIN
  IF auth.role() <> 'service_role' AND NOT (
    (
      (p_polo_id IS NULL AND public.is_financeiro_global())
      OR (p_polo_id IS NOT NULL AND public.is_financeiro_for_polo(p_polo_id))
    )
    AND public.gestor_has_effective_financeiro_tab('convenios')
  ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao resumo de convênios do Caixa.'
      USING ERRCODE = '42501';
  END IF;

  WITH meses AS (
    SELECT
      mes.id,
      mes.convenio_id,
      convenio.nome,
      mes.competencia,
      mes.status,
      mes.saldo_inicial,
      coalesce((SELECT sum(credito.valor)
        FROM public.convenios_financeiros_creditos credito
        WHERE credito.competencia_id = mes.id), 0)::numeric AS creditos,
      coalesce((SELECT sum(vinculo.valor_vinculado)
        FROM public.convenios_financeiros_despesas vinculo
        JOIN public.despesas_lancamentos despesa
          ON despesa.id = vinculo.despesa_lancamento_id
        WHERE vinculo.competencia_id = mes.id AND vinculo.status = 'ATIVO'
          AND despesa.status = 'PAGO'), 0)::numeric AS despesas_pagas,
      coalesce((SELECT sum(vinculo.valor_vinculado)
        FROM public.convenios_financeiros_despesas vinculo
        JOIN public.despesas_lancamentos despesa
          ON despesa.id = vinculo.despesa_lancamento_id
        WHERE vinculo.competencia_id = mes.id AND vinculo.status = 'ATIVO'
          AND despesa.status IN ('PENDENTE', 'VENCIDO')), 0)::numeric AS comprometido_aberto
    FROM public.convenios_financeiros_competencias mes
    JOIN public.convenios_financeiros convenio ON convenio.id = mes.convenio_id
    WHERE mes.competencia = v_competencia
      AND (p_polo_id IS NULL OR mes.polo_id = p_polo_id)
  )
  SELECT
    count(*)::integer,
    coalesce(sum(saldo_inicial), 0),
    coalesce(sum(creditos), 0),
    coalesce(sum(despesas_pagas), 0),
    coalesce(sum(comprometido_aberto), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'convenio_id', convenio_id,
      'nome', nome,
      'competencia', competencia,
      'status', status,
      'saldo_inicial', saldo_inicial,
      'creditos_recebidos', creditos,
      'despesas_pagas', despesas_pagas,
      'comprometido_aberto', comprometido_aberto,
      'saldo_disponivel', round(saldo_inicial + creditos - despesas_pagas, 2),
      'saldo_projetado', round(
        saldo_inicial + creditos - despesas_pagas - comprometido_aberto, 2
      )
    ) ORDER BY nome, convenio_id), '[]'::jsonb)
  INTO v_quantidade, v_saldo_inicial, v_creditos, v_pagas, v_aberto, v_items
  FROM meses;

  RETURN jsonb_build_object(
    'versao', 1,
    'competencia', v_competencia,
    'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id', p_polo_id,
    'quantidade_convenios', v_quantidade,
    'saldo_inicial', v_saldo_inicial,
    'creditos_recebidos', v_creditos,
    'despesas_pagas', v_pagas,
    'comprometido_aberto', v_aberto,
    'saldo_disponivel', round(v_saldo_inicial + v_creditos - v_pagas, 2),
    'saldo_projetado', round(v_saldo_inicial + v_creditos - v_pagas - v_aberto, 2),
    'itens', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_caixa_convenios_resumo_secure(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_caixa_convenios_resumo_secure(uuid, date)
  TO authenticated, service_role;

DROP POLICY IF EXISTS finance_realtime_events_select ON public.finance_realtime_events;
CREATE POLICY finance_realtime_events_select
  ON public.finance_realtime_events FOR SELECT TO authenticated
  USING (
    (aluno_id IS NOT NULL AND aluno_id = public.current_aluno_id())
    OR (
      (
        (polo_id IS NULL AND public.is_gestor_global())
        OR (polo_id IS NOT NULL AND public.is_gestor_for_polo(polo_id))
      )
      AND (
        public.gestor_has_module('caixa')
        OR public.gestor_has_module('relatorios')
        OR public.gestor_has_financeiro_tab('resumo')
        OR public.gestor_has_financeiro_tab('receber')
        OR public.gestor_has_financeiro_tab('despesas')
        OR public.gestor_has_financeiro_tab('convenios')
        OR public.gestor_has_financeiro_tab('outros-debitos')
        OR public.gestor_has_financeiro_tab('outros-creditos')
        OR public.gestor_has_tab('secretaria', 'recebimentos')
        OR public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
    )
  );

CREATE TRIGGER convenios_financeiros_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.convenios_financeiros
FOR EACH ROW EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');
CREATE TRIGGER convenios_financeiros_competencias_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.convenios_financeiros_competencias
FOR EACH ROW EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');
CREATE TRIGGER convenios_financeiros_creditos_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.convenios_financeiros_creditos
FOR EACH ROW EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');
CREATE TRIGGER convenios_financeiros_despesas_emit_caixa_event
AFTER INSERT OR UPDATE OR DELETE ON public.convenios_financeiros_despesas
FOR EACH ROW EXECUTE FUNCTION public.emit_caixa_realtime_event('ROW');

COMMENT ON FUNCTION public.get_caixa_convenios_resumo_secure(uuid, date) IS
  'Recorte analítico dos convênios por competência; não adiciona novamente créditos ou despesas aos totais físicos do Caixa.';

COMMIT;
