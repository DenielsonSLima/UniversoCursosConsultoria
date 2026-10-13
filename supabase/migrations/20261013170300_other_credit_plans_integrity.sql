BEGIN;

CREATE FUNCTION internal_finance.guard_other_credit_plan()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'O carnê e suas condições originais são imutáveis.' USING ERRCODE = '22023';
END;
$function$;
CREATE TRIGGER outros_creditos_planos_immutable
  BEFORE UPDATE OR DELETE ON public.outros_creditos_planos
  FOR EACH ROW EXECUTE FUNCTION internal_finance.guard_other_credit_plan();

CREATE FUNCTION internal_finance.guard_other_credit_plan_receivable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_plan public.outros_creditos_planos%ROWTYPE;
  v_item jsonb;
  v_expected_snapshot jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.outros_creditos_plano_id IS NOT NULL THEN
      RAISE EXCEPTION 'Os títulos do carnê preservam o histórico financeiro.' USING ERRCODE = '22023';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.outros_creditos_plano_id IS NOT NULL AND (
    NEW.id IS DISTINCT FROM OLD.id OR NEW.polo_id IS DISTINCT FROM OLD.polo_id
    OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id OR NEW.descricao IS DISTINCT FROM OLD.descricao
    OR NEW.valor IS DISTINCT FROM OLD.valor OR NEW.data_vencimento IS DISTINCT FROM OLD.data_vencimento
    OR NEW.categoria IS DISTINCT FROM OLD.categoria
    OR NEW.categoria_financeira_id IS DISTINCT FROM OLD.categoria_financeira_id
    OR NEW.tipo_lancamento IS DISTINCT FROM OLD.tipo_lancamento
    OR NEW.parcela_numero IS DISTINCT FROM OLD.parcela_numero
    OR NEW.matricula_id IS DISTINCT FROM OLD.matricula_id OR NEW.turma_id IS DISTINCT FROM OLD.turma_id
    OR NEW.origem_cronograma_id IS DISTINCT FROM OLD.origem_cronograma_id
    OR NEW.outros_creditos_plano_id IS DISTINCT FROM OLD.outros_creditos_plano_id
    OR NEW.outros_creditos_papel IS DISTINCT FROM OLD.outros_creditos_papel
    OR NEW.regra_financeira_outros_creditos_snapshot IS DISTINCT FROM OLD.regra_financeira_outros_creditos_snapshot
  ) THEN
    RAISE EXCEPTION 'A identidade e os termos do título avulso são imutáveis.' USING ERRCODE = '22023';
  END IF;
  IF NEW.outros_creditos_plano_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.outros_creditos_plano_id IS NULL THEN
    RAISE EXCEPTION 'Um título existente não pode ser anexado a este carnê.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_plan FROM public.outros_creditos_planos WHERE id = NEW.outros_creditos_plano_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plano do título avulso indisponível.' USING ERRCODE = '22023';
  END IF;
  SELECT value INTO v_item FROM jsonb_array_elements(v_plan.preview -> 'parcelas')
    WHERE value ->> 'papel' = NEW.outros_creditos_papel
      AND (value ->> 'numero')::integer = NEW.parcela_numero;
  v_expected_snapshot := jsonb_build_object('origem', 'OUTROS_CREDITOS_PLANO', 'versao', 1,
    'planoId', v_plan.id, 'papel', v_item ->> 'papel', 'numero', (v_item ->> 'numero')::integer,
    'ordem', (v_item ->> 'ordem')::integer, 'quantidadeParcelas', (v_plan.input ->> 'quantidadeParcelas')::integer,
    'financialTerms', v_item -> 'financialTerms');
  IF v_item IS NULL OR NEW.polo_id IS DISTINCT FROM v_plan.polo_id
    OR NEW.cliente_id IS DISTINCT FROM v_plan.cliente_id
    OR NEW.categoria_financeira_id IS DISTINCT FROM v_plan.categoria_financeira_id
    OR NEW.valor IS DISTINCT FROM (v_item ->> 'valor')::numeric
    OR NEW.data_vencimento IS DISTINCT FROM (v_item ->> 'dataVencimento')::date
    OR NEW.regra_financeira_outros_creditos_snapshot IS DISTINCT FROM v_expected_snapshot THEN
    RAISE EXCEPTION 'O título diverge do carnê canônico.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER guard_other_credit_plan_receivable
  BEFORE INSERT OR UPDATE OR DELETE ON public.contas_receber
  FOR EACH ROW EXECUTE FUNCTION internal_finance.guard_other_credit_plan_receivable();
REVOKE ALL ON FUNCTION internal_finance.guard_other_credit_plan()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION internal_finance.guard_other_credit_plan_receivable()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
