begin;

-- A única exceção retroativa é a matrícula local. O limite simétrico evita
-- datas históricas arbitrárias sem afrouxar os títulos enviados ao banco.
create function internal_academic.manual_cycle_due_is_allowed(
  p_type text,
  p_due date,
  p_enrollment_mode text,
  p_today date
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $function$
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

-- Mantém a regra histórica de mês-calendário. O modo OMITIR do ciclo 1 não
-- reserva o primeiro mês para uma matrícula que não será criada.
create function internal_academic.manual_cycle_monthly_offset(
  p_cycle_number integer,
  p_enrollment_mode text,
  p_has_lead_fee boolean,
  p_installment_number integer
)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $function$
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

-- O modo é argumento explícito: nenhuma sessão ou estado compartilhado decide
-- se uma data retroativa pode ser aceita.
create function internal_academic.review_manual_cycle_items_with_enrollment_mode(
  p_items jsonb,
  p_review jsonb,
  p_rule jsonb,
  p_class_code text,
  p_class_name text,
  p_enrollment_mode text
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

create or replace function internal_academic.review_manual_cycle_items(
  p_items jsonb,
  p_review jsonb,
  p_rule jsonb,
  p_class_code text,
  p_class_name text
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $function$
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

-- Altera somente a implementação preservada sob o wrapper de transferências.
-- Cada fronteira é única e a migration aborta se o contrato remoto divergir.
do $patch$
declare
  v_definition text;
  v_from text;
  v_to text;
begin
  v_definition := pg_get_functiondef(
    'internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(uuid,integer,date,jsonb)'::regprocedure);
  if md5(v_definition) <> '9614f54115456663f0cbdbb9a8518f94' then
    raise exception 'Canonical manual cycle preview implementation changed.';
  end if;

  v_from := $old$  v_has_lead_fee boolean := false;
  v_reviewed jsonb;
  v_today date := timezone('America/Maceio', now())::date;$old$;
  v_to := $new$  v_has_lead_fee boolean := false;
  v_reviewed jsonb;
  v_mode text;
  v_today date := timezone('America/Maceio', now())::date;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Canonical preview declaration boundary changed.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$  v_policy_fingerprint := v_state -> 'politica' ->> 'fingerprint';
  v_count :=$old$;
  v_to := $new$  v_policy_fingerprint := v_state -> 'politica' ->> 'fingerprint';
  v_mode := internal_academic.manual_cycle_enrollment_mode(p_review);
  v_count :=$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Canonical preview mode boundary changed.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$  if v_first_due < (pg_catalog.timezone('America/Maceio', now()))::date
    or v_first_due
      > (pg_catalog.timezone('America/Maceio', now()))::date + 1825
  then
    raise exception 'O primeiro vencimento deve estar entre hoje e cinco anos.'
      using errcode = '22023';
  end if;$old$;
  v_to := $new$  if not internal_academic.manual_cycle_due_is_allowed(
    case p_cycle_number
      when 1 then 'MATRICULA'
      when 2 then 'REMATRICULA'
      else null
    end,
    v_first_due,
    v_mode,
    v_today
  ) then
    raise exception 'A data inicial deve estar entre hoje e cinco anos; somente matrícula local pode usar até cinco anos anteriores.'
      using errcode = '22023';
  end if;$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Canonical preview initial due boundary changed.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  v_from := $old$      v_number - case when v_has_lead_fee then 0 else 1 end$old$;
  v_to := $new$      internal_academic.manual_cycle_monthly_offset(
        p_cycle_number, v_mode, v_has_lead_fee, v_number)$new$;
  if length(v_definition) - length(replace(v_definition, v_from, '')) <> length(v_from) then
    raise exception 'Canonical preview monthly offset boundary changed.';
  end if;
  v_definition := replace(v_definition, v_from, v_to);

  execute v_definition;
end;
$patch$;

revoke all on function internal_academic.manual_cycle_due_is_allowed(
  text, date, text, date),
  internal_academic.manual_cycle_monthly_offset(integer, text, boolean, integer),
  internal_academic.review_manual_cycle_items_with_enrollment_mode(
    jsonb, jsonb, jsonb, text, text, text),
  internal_academic.review_manual_cycle_items(jsonb, jsonb, jsonb, text, text),
  internal_academic.technical_manual_cycle_reviewed_preview_before_transfer_entry(
    uuid, integer, date, jsonb)
  from public, anon, authenticated, service_role;

commit;
