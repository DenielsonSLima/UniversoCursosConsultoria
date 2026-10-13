BEGIN;

CREATE FUNCTION internal_finance.other_credit_plan_preview(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $function$
DECLARE
  v_input jsonb;
  v_key text;
  v_uuid_pattern text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_description text;
  v_count integer;
  v_amount numeric;
  v_interest numeric;
  v_penalty numeric;
  v_discount numeric;
  v_discount_type text;
  v_discount_days integer;
  v_first_due date;
  v_month date;
  v_due date;
  v_fee jsonb;
  v_fees jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_item jsonb;
  v_terms jsonb;
  v_role text;
  v_number integer;
  v_order integer := 0;
  v_item_discount numeric;
  v_total_fees numeric := 0;
  v_total_discounted numeric := 0;
BEGIN
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Informe as condições do carnê.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_input) k WHERE k NOT IN (
    'clienteId', 'descricao', 'categoriaFinanceiraId', 'quantidadeParcelas',
    'valorParcela', 'primeiroVencimento', 'jurosMensalPercentual', 'multaPercentual',
    'descontoTipo', 'descontoValor', 'descontoDiasAntecedencia', 'matricula', 'rematricula'
  )) THEN
    RAISE EXCEPTION 'As condições contêm campos não reconhecidos.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_input ->> 'clienteId', '') !~* v_uuid_pattern THEN
    RAISE EXCEPTION 'Selecione o pagador do carnê.' USING ERRCODE = '22023';
  END IF;
  IF nullif(p_input ->> 'categoriaFinanceiraId', '') IS NOT NULL
    AND (p_input ->> 'categoriaFinanceiraId') !~* v_uuid_pattern THEN
    RAISE EXCEPTION 'Categoria financeira inválida.' USING ERRCODE = '22023';
  END IF;
  v_description := btrim(regexp_replace(coalesce(p_input ->> 'descricao', ''), '\s+', ' ', 'g'));
  IF jsonb_typeof(p_input -> 'descricao') IS DISTINCT FROM 'string'
    OR char_length(v_description) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A descrição deve ter entre 1 e 500 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_input ->> 'quantidadeParcelas', '') !~ '^[0-9]+$'
    OR length(p_input ->> 'quantidadeParcelas') > 2 THEN
    RAISE EXCEPTION 'A quantidade deve ser um inteiro entre 1 e 60.' USING ERRCODE = '22023';
  END IF;
  v_count := (p_input ->> 'quantidadeParcelas')::integer;
  IF v_count NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'A quantidade deve ser um inteiro entre 1 e 60.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['valorParcela', 'jurosMensalPercentual', 'multaPercentual', 'descontoValor'] LOOP
    IF coalesce(p_input ->> v_key, CASE WHEN v_key = 'valorParcela' THEN '' ELSE '0' END)
      !~ '^[0-9]{1,12}([.][0-9]{1,6})?$' THEN
      RAISE EXCEPTION 'Valor monetário ou percentual inválido.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_amount := round((p_input ->> 'valorParcela')::numeric, 2);
  v_interest := coalesce((p_input ->> 'jurosMensalPercentual')::numeric, 0);
  v_penalty := coalesce((p_input ->> 'multaPercentual')::numeric, 0);
  v_discount_type := upper(coalesce(nullif(p_input ->> 'descontoTipo', ''), 'FIXO'));
  v_discount := coalesce((p_input ->> 'descontoValor')::numeric, 0);
  IF v_amount <= 0 OR v_amount > 99999999.99 OR v_interest >= 100 OR v_penalty >= 100
    OR v_discount_type NOT IN ('FIXO', 'PERCENTUAL') THEN
    RAISE EXCEPTION 'Valor da parcela ou condições de atraso inválidos.' USING ERRCODE = '22023';
  END IF;
  IF v_discount_type = 'FIXO' THEN v_discount := round(v_discount, 2); END IF;
  IF (v_discount_type = 'FIXO' AND v_discount >= v_amount)
    OR (v_discount_type = 'PERCENTUAL' AND v_discount >= 100) THEN
    RAISE EXCEPTION 'O desconto deve ser menor que o valor da parcela.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_input ->> 'descontoDiasAntecedencia', '0') !~ '^[0-9]{1,2}$' THEN
    RAISE EXCEPTION 'Prazo do desconto inválido.' USING ERRCODE = '22023';
  END IF;
  v_discount_days := coalesce((p_input ->> 'descontoDiasAntecedencia')::integer, 0);
  IF v_discount_days > 60 THEN
    RAISE EXCEPTION 'O desconto aceita até 60 dias de antecedência.' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_input ->> 'primeiroVencimento', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'Primeiro vencimento inválido.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_first_due := (p_input ->> 'primeiroVencimento')::date;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Primeiro vencimento inválido.' USING ERRCODE = '22023';
  END;
  IF v_first_due NOT BETWEEN '1900-01-01'::date AND '9994-12-31'::date THEN
    RAISE EXCEPTION 'Primeiro vencimento fora do período aceito.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['matricula', 'rematricula'] LOOP
    v_fee := p_input -> v_key;
    IF v_fee IS NOT NULL AND v_fee <> 'null'::jsonb THEN
      IF jsonb_typeof(v_fee) IS DISTINCT FROM 'object'
        OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_fee) k WHERE k NOT IN ('valor', 'vencimento'))
        OR coalesce(v_fee ->> 'valor', '') !~ '^[0-9]{1,12}([.][0-9]{1,6})?$'
        OR coalesce(v_fee ->> 'vencimento', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Taxa opcional inválida: informe valor e vencimento.' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_due := (v_fee ->> 'vencimento')::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RAISE EXCEPTION 'Vencimento da taxa inválido.' USING ERRCODE = '22023';
      END;
      v_amount := round((v_fee ->> 'valor')::numeric, 2);
      IF v_amount <= 0 OR v_amount > 99999999.99
        OR v_due NOT BETWEEN '1900-01-01'::date AND '9999-12-30'::date THEN
        RAISE EXCEPTION 'Valor ou vencimento da taxa inválido.' USING ERRCODE = '22023';
      END IF;
      v_fee := jsonb_build_object('valor', v_amount, 'vencimento', v_due);
      v_fees := v_fees || jsonb_build_array(v_fee || jsonb_build_object('papel', upper(v_key)));
      v_total_fees := v_total_fees + v_amount;
    ELSE v_fee := 'null'::jsonb;
    END IF;
    v_input := coalesce(v_input, '{}'::jsonb) || jsonb_build_object(v_key, v_fee);
  END LOOP;
  v_amount := round((p_input ->> 'valorParcela')::numeric, 2);
  v_input := v_input || jsonb_build_object(
    'clienteId', (p_input ->> 'clienteId')::uuid,
    'descricao', v_description,
    'categoriaFinanceiraId', nullif(p_input ->> 'categoriaFinanceiraId', '')::uuid,
    'quantidadeParcelas', v_count, 'valorParcela', v_amount, 'primeiroVencimento', v_first_due,
    'jurosMensalPercentual', v_interest, 'multaPercentual', v_penalty,
    'descontoTipo', v_discount_type, 'descontoValor', v_discount,
    'descontoDiasAntecedencia', v_discount_days
  );
  -- Always anchor every month to the original day, including 29/30/31 and leap years.
  FOR v_number IN 1..v_count LOOP
    v_month := (date_trunc('month', v_first_due::timestamp) + make_interval(months => v_number - 1))::date;
    v_due := v_month + least(extract(day FROM v_first_due)::integer,
      extract(day FROM (v_month + interval '1 month - 1 day'))::integer) - 1;
    v_fees := v_fees || jsonb_build_array(jsonb_build_object(
      'papel', 'PARCELA', 'numero', v_number, 'valor', v_amount, 'vencimento', v_due
    ));
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_fees) LOOP
    v_order := v_order + 1;
    v_role := v_item ->> 'papel';
    v_number := coalesce((v_item ->> 'numero')::integer, 0);
    v_amount := (v_item ->> 'valor')::numeric;
    v_due := (v_item ->> 'vencimento')::date;
    v_item_discount := CASE WHEN v_role <> 'PARCELA' THEN 0
      WHEN v_discount_type = 'FIXO' THEN v_discount ELSE round(v_amount * v_discount / 100, 2) END;
    IF v_amount - v_item_discount < 0.01 THEN
      RAISE EXCEPTION 'O desconto deve preservar ao menos um centavo da parcela.' USING ERRCODE = '22023';
    END IF;
    v_terms := jsonb_build_object('nominalAmount', v_amount, 'dueDate', v_due,
      'discount', CASE WHEN v_role = 'PARCELA' AND v_discount > 0 THEN jsonb_build_object(
        'type', CASE WHEN v_discount_type = 'FIXO' THEN 'fixed' ELSE 'percentage' END,
        'value', v_discount, 'validUntil', v_due - v_discount_days) ELSE NULL END,
      'interest', CASE WHEN v_interest > 0 THEN jsonb_build_object(
        'type', 'monthly-percentage', 'value', v_interest, 'startsOn', v_due + 1) ELSE NULL END,
      'penalty', CASE WHEN v_penalty > 0 THEN jsonb_build_object(
        'type', 'percentage', 'value', v_penalty, 'startsOn', v_due + 1) ELSE NULL END
    );
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'ordem', v_order, 'papel', v_role, 'numero', v_number, 'valor', v_amount,
      'dataVencimento', v_due, 'financialTerms', v_terms, 'valorComDesconto', v_amount - v_item_discount
    ));
    v_total_discounted := v_total_discounted + v_amount - v_item_discount;
  END LOOP;
  RETURN jsonb_build_object('versao', 1, 'input', v_input, 'quantidadeParcelas', v_count,
    'totalParcelas', round((v_input ->> 'valorParcela')::numeric * v_count, 2),
    'totalTaxas', v_total_fees,
    'totalNominal', round((v_input ->> 'valorParcela')::numeric * v_count + v_total_fees, 2),
    'totalComDesconto', v_total_discounted, 'parcelas', v_rows);
END;
$function$;

REVOKE ALL ON FUNCTION internal_finance.other_credit_plan_preview(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
