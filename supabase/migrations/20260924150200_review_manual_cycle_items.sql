begin;

-- A revisão só altera a intenção de novos títulos; não edita cobranças existentes.
create or replace function internal_academic.review_manual_cycle_items(
  p_items jsonb, p_review jsonb, p_rule jsonb,
  p_class_code text, p_class_name text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
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
  v_today date := timezone('America/Maceio', now())::date;
begin
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

  for v_item in select i from jsonb_array_elements(p_items) i loop
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
    if v_due < v_today or v_due > v_today + 1825
      or (v_previous_due is not null and v_due < v_previous_due)
    then
      raise exception 'Revise os vencimentos: entre hoje e cinco anos, na ordem das parcelas.'
        using errcode = '22023';
    end if;
    if v_value <= 0 and (p_review is not null or v_kind = 'mensalidade') then
      raise exception 'Informe valor positivo para cada boleto selecionado ou desmarque a matrícula.'
        using errcode = '22023';
    end if;
    v_previous_due := v_due;
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('itens', v_items, 'matriculaSemBoleto', v_omitted);
end;
$function$;

revoke all on function internal_academic.review_manual_cycle_items(
  jsonb, jsonb, jsonb, text, text) from public, anon, authenticated, service_role;

-- Congela exatamente os termos mostrados na revisão; o adapter já valida v2.
create or replace function internal_academic.manual_cycle_reviewed_snapshot(
  p_matricula_id uuid, p_item jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_details jsonb := p_item -> 'detalhesBoleto';
  v_value numeric := (p_item ->> 'valor')::numeric;
  v_fine numeric := coalesce((v_details #>> '{multa,percentual}')::numeric, 0);
begin
  return internal_academic.build_technical_receivable_policy_snapshot(
    p_matricula_id, p_item ->> 'tipo', p_item ->> 'descricao', v_value, false
  ) || jsonb_build_object(
    'versao', 2,
    'valorBase', v_value,
    'descontoPontualidade', coalesce((v_details #>> '{desconto,valor}')::numeric, 0),
    'jurosAtrasoPercentual', coalesce((v_details #>> '{juros,percentualMes}')::numeric, 0),
    'multaAtrasoPercentual', v_fine,
    'multaAtrasoValor', round(v_value * v_fine / 100, 2),
    'aplicarDesconto', v_details -> 'desconto' is distinct from 'null'::jsonb,
    'aplicarMultaJuros', v_details -> 'juros' is distinct from 'null'::jsonb
      or v_details -> 'multa' is distinct from 'null'::jsonb,
    'revisaoPorItem', true
  );
end;
$function$;
revoke all on function internal_academic.manual_cycle_reviewed_snapshot(uuid, jsonb)
  from public, anon, authenticated, service_role;

commit;
