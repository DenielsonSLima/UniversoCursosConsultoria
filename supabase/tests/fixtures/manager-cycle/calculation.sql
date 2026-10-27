CREATE OR REPLACE FUNCTION public.calculate_gestao_technical_financial_preview(
  p_valor NUMERIC,
  p_desconto NUMERIC,
  p_juros_percentual NUMERIC,
  p_multa_percentual NUMERIC,
  p_aplicar_desconto BOOLEAN DEFAULT TRUE,
  p_aplicar_encargos BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
  desconto_aplicado NUMERIC,
  juros_calculados NUMERIC,
  juros_percentual_dia NUMERIC,
  juros_valor_dia NUMERIC,
  multa_aplicada NUMERIC,
  valor_com_desconto NUMERIC,
  valor_com_atraso NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_valor NUMERIC := ROUND(COALESCE(p_valor, 0), 2);
  v_desconto NUMERIC;
  v_juros NUMERIC;
  v_juros_percentual_dia NUMERIC;
  v_juros_valor_dia NUMERIC;
  v_multa NUMERIC;
BEGIN
  IF v_valor < 0
     OR COALESCE(p_desconto, 0) < 0
     OR COALESCE(p_juros_percentual, 0) NOT BETWEEN 0 AND 100
     OR COALESCE(p_multa_percentual, 0) NOT BETWEEN 0 AND 100
  THEN
    RAISE EXCEPTION 'Valores financeiros inválidos para a prévia técnica.'
      USING ERRCODE = '22023';
  END IF;

  v_desconto := CASE
    WHEN COALESCE(p_aplicar_desconto, FALSE)
      THEN ROUND(COALESCE(p_desconto, 0), 2)
    ELSE 0
  END;
  v_juros := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(v_valor * (COALESCE(p_juros_percentual, 0) / 100.0), 2)
    ELSE 0
  END;
  v_juros_percentual_dia := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(COALESCE(p_juros_percentual, 0) / 30.0, 6)
    ELSE 0
  END;
  v_juros_valor_dia := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(
        v_valor * (COALESCE(p_juros_percentual, 0) / 100.0) / 30.0,
        2
      )
    ELSE 0
  END;
  v_multa := CASE
    WHEN COALESCE(p_aplicar_encargos, FALSE)
      THEN ROUND(v_valor * (COALESCE(p_multa_percentual, 0) / 100.0), 2)
    ELSE 0
  END;

  RETURN QUERY SELECT
    v_desconto,
    v_juros,
    v_juros_percentual_dia,
    v_juros_valor_dia,
    v_multa,
    ROUND(GREATEST(0, v_valor - v_desconto), 2),
    ROUND(v_valor + v_juros + v_multa, 2);
END;
$$;

-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
CREATE OR REPLACE FUNCTION public.data_vencimento_mensal(p_base date, p_dia integer, p_offset integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (date_trunc('month', p_base) + make_interval(months => p_offset) + (LEAST(GREATEST(COALESCE(p_dia, 10), 1), EXTRACT(DAY FROM (date_trunc('month', p_base) + make_interval(months => p_offset + 1) - interval '1 day'))::INTEGER) - 1) * interval '1 day')::DATE;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_due_is_allowed(p_type text, p_due date, p_enrollment_mode text, p_today date)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when p_type is null or p_type not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
      or p_due is null or p_today is null
      or p_enrollment_mode is null
      or p_enrollment_mode not in ('BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR')
      then false
    when p_due > p_today + 1825 then false
    when p_due >= p_today then true
    else p_type = 'MATRICULA'
      and p_enrollment_mode = 'REGISTRO_SEM_BOLETO'
      and p_due >= p_today - 1825
  end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_enrollment_mode(p_review jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_mode text;
begin
  if p_review is null then return 'BOLETO'; end if;
  if jsonb_typeof(p_review) is distinct from 'object' then
    raise exception 'Revisão do ciclo inválida.' using errcode='22023';
  end if;
  v_mode:=p_review->>'modoMatricula';
  if p_review ? 'modoMatricula' and jsonb_typeof(p_review->'modoMatricula') is distinct from 'string' then
    raise exception 'Tratamento da matrícula inválido.' using errcode='22023';
  end if;
  if v_mode is null then
    if jsonb_typeof(p_review->'emitirMatricula') is distinct from 'boolean' then
      raise exception 'Informe o tratamento da matrícula.' using errcode='22023';
    end if;
    return case when (p_review->>'emitirMatricula')::boolean then 'BOLETO' else 'OMITIR' end;
  end if;
  if v_mode not in ('BOLETO','REGISTRO_SEM_BOLETO','OMITIR') then
    raise exception 'Tratamento da matrícula inválido.' using errcode='22023';
  end if;
  if p_review ? 'emitirMatricula' and (
    jsonb_typeof(p_review->'emitirMatricula') is distinct from 'boolean'
    or (p_review->>'emitirMatricula')::boolean is distinct from (v_mode='BOLETO')
  ) then
    raise exception 'A opção de boleto conflita com o tratamento da matrícula.' using errcode='22023';
  end if;
  return v_mode;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.manual_cycle_monthly_offset(p_cycle_number integer, p_enrollment_mode text, p_has_lead_fee boolean, p_installment_number integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
begin
  if p_cycle_number not in (1, 2)
    or p_enrollment_mode is null
    or p_enrollment_mode not in ('BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR')
    or p_has_lead_fee is null
    or p_installment_number is null
    or p_installment_number < 1
  then
    raise exception 'Cronograma mensal do ciclo inválido.' using errcode = '22023';
  end if;
  if p_cycle_number = 1 and p_enrollment_mode = 'OMITIR' then
    return p_installment_number - 1;
  end if;
  return p_installment_number - case when p_has_lead_fee then 0 else 1 end;
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_terms(p_effective_rule jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'descontoPontualidade',
      p_effective_rule -> 'encargos' ->> 'descontoPontualidade',
    'jurosAtrasoPercentual',
      p_effective_rule -> 'encargos' ->> 'jurosAtrasoPercentual',
    'multaAtrasoPercentual',
      p_effective_rule -> 'encargos' ->> 'multaAtrasoPercentual',
    'instrucaoBoleto', coalesce(
      p_effective_rule -> 'boleto' ->> 'instrucao', ''
    ),
    'aplicacao', p_effective_rule -> 'aplicacao'
  );
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_financial_simulation(p_valor numeric, p_desconto numeric, p_juros numeric, p_multa numeric, p_aplicar_desconto boolean, p_aplicar_encargos boolean)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'descontoAplicado', pg_catalog.to_char(preview.desconto_aplicado, 'FM999999990.00'),
    'jurosMensal', pg_catalog.to_char(preview.juros_calculados, 'FM999999990.00'),
    'jurosPercentualDia', pg_catalog.to_char(preview.juros_percentual_dia, 'FM999999990.000000'),
    'jurosValorDia', pg_catalog.to_char(preview.juros_valor_dia, 'FM999999990.00'),
    'multa', pg_catalog.to_char(preview.multa_aplicada, 'FM999999990.00'),
    'valorComDesconto', pg_catalog.to_char(preview.valor_com_desconto, 'FM999999990.00'),
    'valorComAtraso', pg_catalog.to_char(preview.valor_com_atraso, 'FM999999990.00')
  )
  from public.calculate_gestao_technical_financial_preview(
    p_valor, p_desconto, p_juros, p_multa,
    p_aplicar_desconto, p_aplicar_encargos
  ) preview;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_boleto_details(p_value numeric, p_due date, p_effective_rule jsonb, p_kind text, p_description text, p_class_code text, p_class_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_kind_key text := case upper(coalesce(p_kind, ''))
    when 'MATRICULA' then 'matricula'
    when 'REMATRICULA' then 'rematricula'
    else 'mensalidade'
  end;
  v_apply_discount boolean;
  v_apply_late boolean;
  v_discount numeric;
  v_interest numeric;
  v_fine numeric;
  v_simulation jsonb;
  v_description text;
  v_class_code text;
  v_class_name text;
  v_instruction text;
begin
  v_apply_discount := coalesce(
    (p_effective_rule -> 'aplicacao' -> v_kind_key ->> 'desconto')::boolean,
    false
  );
  v_apply_late := coalesce(
    (p_effective_rule -> 'aplicacao' -> v_kind_key ->> 'multaJuros')::boolean,
    false
  );
  v_discount := greatest(0, coalesce(
    (p_effective_rule -> 'encargos' ->> 'descontoPontualidade')::numeric,
    0
  ));
  v_interest := greatest(0, coalesce(
    (p_effective_rule -> 'encargos' ->> 'jurosAtrasoPercentual')::numeric,
    0
  ));
  v_fine := greatest(0, coalesce(
    (p_effective_rule -> 'encargos' ->> 'multaAtrasoPercentual')::numeric,
    0
  ));
  v_simulation := internal_academic.technical_financial_simulation(
    p_value, v_discount, v_interest, v_fine,
    v_apply_discount, v_apply_late
  );
  v_description := pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(p_description, ''), '[[:space:]]+', ' ', 'g'
  ));
  v_class_code := pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(p_class_code, ''), '[[:space:]]+', ' ', 'g'
  ));
  v_class_name := pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(p_class_name, ''), '[[:space:]]+', ' ', 'g'
  ));
  v_instruction := coalesce(nullif(pg_catalog.btrim(
    pg_catalog.regexp_replace(
      coalesce(p_effective_rule -> 'boleto' ->> 'instrucao', ''),
      '[[:space:]]+', ' ', 'g'
    )
  ), ''),
    'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'
  );

  return jsonb_build_object(
    'valorNominal', pg_catalog.to_char(
      round(greatest(0, coalesce(p_value, 0)), 2), 'FM999999990.00'
    ),
    'valorEmDia', v_simulation ->> 'valorComDesconto',
    'desconto', case
      when v_apply_discount
        and (v_simulation ->> 'descontoAplicado')::numeric > 0
      then jsonb_build_object(
        'valor', v_simulation ->> 'descontoAplicado',
        'validoAte', pg_catalog.to_char(p_due, 'YYYY-MM-DD')
      ) else 'null'::jsonb
    end,
    'multa', case
      when v_apply_late and (v_simulation ->> 'multa')::numeric > 0
      then jsonb_build_object(
        'percentual', pg_catalog.to_char(v_fine, 'FM999999990.000000'),
        'valor', v_simulation ->> 'multa',
        'iniciaEm', pg_catalog.to_char(p_due + 1, 'YYYY-MM-DD')
      ) else 'null'::jsonb
    end,
    'juros', case
      when v_apply_late and v_interest > 0
      then jsonb_build_object(
        'percentualMes', pg_catalog.to_char(
          v_interest, 'FM999999990.000000'
        ),
        'valorDia', v_simulation ->> 'jurosValorDia',
        'iniciaEm', pg_catalog.to_char(p_due + 1, 'YYYY-MM-DD')
      ) else 'null'::jsonb
    end,
    'instrucaoBoleto', v_instruction,
    'mensagensBoleto', jsonb_build_array(
      v_description,
      'TURMA: ' || pg_catalog.concat_ws(
        ' — ', nullif(v_class_code, ''), nullif(v_class_name, '')
      ),
      v_instruction
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.review_manual_cycle_items_with_enrollment_mode(p_items jsonb, p_review jsonb, p_rule jsonb, p_class_code text, p_class_name text, p_enrollment_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_item jsonb;
  v_edit jsonb;
  v_items jsonb := '[]'::jsonb;
  v_omitted jsonb := 'null'::jsonb;
  v_edits jsonb := coalesce(p_review -> 'itens', '[]'::jsonb);
  v_issue_fee boolean := true;
  v_rule jsonb;
  v_kind text;
  v_value numeric;
  v_discount numeric;
  v_interest numeric;
  v_fine numeric;
  v_due date;
  v_previous_due date;
  v_today date := pg_catalog.timezone('America/Maceio', pg_catalog.now())::date;
begin
  if p_enrollment_mode is null
    or p_enrollment_mode not in ('BOLETO', 'REGISTRO_SEM_BOLETO', 'OMITIR')
  then
    raise exception 'Tratamento da matrícula inválido.' using errcode = '22023';
  end if;
  if p_review is not null then
    if jsonb_typeof(p_review) is distinct from 'object'
      or jsonb_typeof(p_review -> 'emitirMatricula') is distinct from 'boolean'
      or jsonb_typeof(v_edits) is distinct from 'array'
      or exists (select 1 from jsonb_object_keys(p_review) k
        where k not in ('emitirMatricula', 'itens'))
    then
      raise exception 'Revisão do ciclo inválida.' using errcode = '22023';
    end if;
    v_issue_fee := (p_review ->> 'emitirMatricula')::boolean;
    if jsonb_array_length(v_edits) > jsonb_array_length(p_items)
      or exists (select 1 from jsonb_array_elements(v_edits) e
        where jsonb_typeof(e) is distinct from 'object'
          or not exists (select 1 from jsonb_array_elements(p_items) i
            where i ->> 'chave' = e ->> 'chave'))
      or (select count(*) from jsonb_array_elements(v_edits)) <>
        (select count(distinct e ->> 'chave') from jsonb_array_elements(v_edits) e)
    then
      raise exception 'A revisão contém itens desconhecidos ou repetidos.'
        using errcode = '22023';
    end if;
  end if;
  if v_issue_fee is distinct from (p_enrollment_mode <> 'OMITIR') then
    raise exception 'Tratamento da matrícula conflita com a revisão.' using errcode = '22023';
  end if;

  for v_item in select i from jsonb_array_elements(p_items) i loop
    if v_item ->> 'tipo' is null
      or v_item ->> 'tipo' not in ('MATRICULA', 'REMATRICULA', 'PARCELA')
    then
      raise exception 'Tipo de cobrança do ciclo inválido.' using errcode = '22023';
    end if;
    select e into v_edit from jsonb_array_elements(v_edits) e
      where e ->> 'chave' = v_item ->> 'chave';
    v_kind := case v_item ->> 'tipo'
      when 'MATRICULA' then 'matricula'
      when 'REMATRICULA' then 'rematricula' else 'mensalidade' end;
    v_rule := p_rule;
    v_value := (v_item ->> 'valor')::numeric;
    v_due := (v_item ->> 'vencimento')::date;
    if v_edit is not null then
      if coalesce(v_edit ->> 'valor', '') !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
        or coalesce(v_edit ->> 'descontoPontualidade', '') !~ '^[0-9]{1,8}([.][0-9]{1,2})?$'
        or coalesce(v_edit ->> 'jurosAtrasoPercentual', '') !~ '^[0-9]{1,2}([.][0-9]{1,6})?$'
        or coalesce(v_edit ->> 'multaAtrasoPercentual', '') !~ '^[0-9]{1,2}([.][0-9]{1,6})?$'
        or coalesce(v_edit ->> 'vencimento', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or exists (select 1 from jsonb_object_keys(v_edit) k where k not in (
          'chave', 'valor', 'vencimento', 'descontoPontualidade',
          'jurosAtrasoPercentual', 'multaAtrasoPercentual'))
      then
        raise exception 'Preencha valor, vencimento, desconto, juros e multa de cada item.'
          using errcode = '22023';
      end if;
      v_value := (v_edit ->> 'valor')::numeric;
      v_due := (v_edit ->> 'vencimento')::date;
      v_discount := (v_edit ->> 'descontoPontualidade')::numeric;
      v_interest := (v_edit ->> 'jurosAtrasoPercentual')::numeric;
      v_fine := (v_edit ->> 'multaAtrasoPercentual')::numeric;
      if (v_discount > 0 and v_discount >= v_value)
        or v_interest >= 100 or v_fine >= 100
      then
        raise exception 'Desconto deve ser menor que o valor; juros e multa devem ser menores que 100%%.'
          using errcode = '22023';
      end if;
      v_rule := jsonb_set(v_rule, '{encargos}', jsonb_build_object(
        'descontoPontualidade', v_discount,
        'jurosAtrasoPercentual', v_interest,
        'multaAtrasoPercentual', v_fine));
      v_rule := jsonb_set(v_rule, array['aplicacao', v_kind], jsonb_build_object(
        'desconto', v_discount > 0, 'multaJuros', v_interest > 0 or v_fine > 0));
    end if;

    v_item := v_item || jsonb_build_object(
      'valor', to_char(v_value, 'FM999999990.00'),
      'vencimento', to_char(v_due, 'YYYY-MM-DD'),
      'aplicacao', v_rule -> 'aplicacao' -> v_kind,
      'detalhesBoleto', internal_academic.technical_manual_cycle_boleto_details(
        v_value, v_due, v_rule, upper(v_kind), v_item ->> 'descricao',
        p_class_code, p_class_name));

    if v_item ->> 'tipo' = 'MATRICULA' and not v_issue_fee then
      v_omitted := v_item;
      continue;
    end if;
    if not internal_academic.manual_cycle_due_is_allowed(
      v_item ->> 'tipo', v_due, p_enrollment_mode, v_today
    ) or (v_previous_due is not null and v_due < v_previous_due)
    then
      raise exception 'Revise os vencimentos: matrícula local até cinco anos atrás; demais cobranças entre hoje e cinco anos, na ordem das parcelas.'
        using errcode = '22023';
    end if;
    if v_value <= 0 and (p_review is not null or v_kind = 'mensalidade') then
      raise exception 'Informe valor positivo para cada cobrança selecionada ou desmarque a matrícula.'
        using errcode = '22023';
    end if;
    v_previous_due := v_due;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('itens', v_items, 'matriculaSemBoleto', v_omitted);
end;
$function$;

CREATE OR REPLACE FUNCTION internal_academic.review_manual_cycle_items(p_items jsonb, p_review jsonb, p_rule jsonb, p_class_code text, p_class_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_mode text;
  v_review jsonb;
  v_result jsonb;
  v_items jsonb;
begin
  v_mode := internal_academic.manual_cycle_enrollment_mode(p_review);
  if p_review ? 'modoMatricula' and v_mode <> 'BOLETO' and not exists (
    select 1 from jsonb_array_elements(p_items) i where i ->> 'tipo' = 'MATRICULA'
  ) then
    raise exception 'A opção de matrícula é exclusiva do primeiro ciclo.' using errcode = '22023';
  end if;
  v_review := case when p_review is null then null else
    (p_review - 'modoMatricula') || jsonb_build_object(
      'emitirMatricula', v_mode <> 'OMITIR') end;
  v_result := internal_academic.review_manual_cycle_items_with_enrollment_mode(
    p_items, v_review, p_rule, p_class_code, p_class_name, v_mode);
  select coalesce(jsonb_agg(i || jsonb_build_object(
    'destinoCobranca', case
      when v_mode = 'REGISTRO_SEM_BOLETO' and i ->> 'tipo' = 'MATRICULA'
        then 'LOCAL' else 'BANESE' end) order by n), '[]'::jsonb)
    into v_items from jsonb_array_elements(v_result -> 'itens') with ordinality a(i, n);
  return v_result || jsonb_build_object(
    'itens', v_items,
    'modoMatricula', v_mode,
    'quantidadeBancaria', (select count(*) from jsonb_array_elements(v_items) i
      where i ->> 'destinoCobranca' = 'BANESE'),
    'quantidadeLocal', (select count(*) from jsonb_array_elements(v_items) i
      where i ->> 'destinoCobranca' = 'LOCAL'));
end;
$function$;

