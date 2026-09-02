begin;

create or replace function internal_academic.technical_manual_cycle_boleto_details(
  p_value numeric,
  p_due date,
  p_effective_rule jsonb,
  p_kind text,
  p_description text,
  p_class_code text,
  p_class_name text
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
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

revoke all on function
  internal_academic.technical_manual_cycle_boleto_details(
    numeric, date, jsonb, text, text, text, text
  ) from public, anon, authenticated, service_role;

do $manual_cycle_boleto_self_check$
declare
  v_rule jsonb := jsonb_build_object(
    'encargos', jsonb_build_object(
      'descontoPontualidade', '19.90',
      'jurosAtrasoPercentual', '2',
      'multaAtrasoPercentual', '2'
    ),
    'aplicacao', jsonb_build_object(
      'matricula', jsonb_build_object(
        'desconto', false, 'multaJuros', false
      ),
      'rematricula', jsonb_build_object(
        'desconto', false, 'multaJuros', true
      ),
      'mensalidade', jsonb_build_object(
        'desconto', true, 'multaJuros', true
      )
    ),
    'boleto', jsonb_build_object(
      'instrucao', E'  INSTRUÇÃO   CONFIGURADA\n'
    )
  );
  v_monthly jsonb;
  v_reenrollment jsonb;
  v_disabled jsonb;
begin
  v_monthly := internal_academic.technical_manual_cycle_boleto_details(
    279.90, date '2026-11-15', v_rule, 'MENSALIDADE',
    E'  Mensalidade 1/12 - Ciclo 2 - ENF\nT-42 INT  ',
    ' ENF-T42-INT-MAT ', ' ENF  T-42 INT '
  );
  if v_monthly #>> '{desconto,valor}' is distinct from '19.90'
    or v_monthly ->> 'valorEmDia' is distinct from '260.00'
    or v_monthly #>> '{multa,valor}' is distinct from '5.60'
    or v_monthly #>> '{juros,valorDia}' is distinct from '0.19'
    or coalesce(jsonb_array_length(
      v_monthly -> 'mensagensBoleto'
    ), 0) <> 3
    or v_monthly #>> '{mensagensBoleto,0}' is distinct from
      'Mensalidade 1/12 - Ciclo 2 - ENF T-42 INT'
    or v_monthly #>> '{mensagensBoleto,1}' is distinct from
      'TURMA: ENF-T42-INT-MAT — ENF T-42 INT'
    or v_monthly #>> '{mensagensBoleto,2}' is distinct from
      'INSTRUÇÃO CONFIGURADA'
  then
    raise exception 'Autoverificação da prévia mensal técnica falhou.';
  end if;

  v_reenrollment := internal_academic.technical_manual_cycle_boleto_details(
    100.00, date '2026-10-15', v_rule, 'REMATRICULA',
    'Rematrícula - Ciclo 2 - ENF T-42 INT',
    'ENF-T42-INT-MAT', 'ENF T-42 INT'
  );
  if v_reenrollment -> 'desconto' is distinct from 'null'::jsonb
    or v_reenrollment ->> 'valorEmDia' is distinct from '100.00'
    or v_reenrollment #>> '{multa,valor}' is distinct from '2.00'
    or v_reenrollment #>> '{juros,valorDia}' is distinct from '0.07'
    or coalesce(jsonb_array_length(
      v_reenrollment -> 'mensagensBoleto'
    ), 0) <> 3
  then
    raise exception 'Autoverificação da prévia de rematrícula falhou.';
  end if;

  v_disabled := internal_academic.technical_manual_cycle_boleto_details(
    100.00, date '2026-10-15',
    pg_catalog.jsonb_set(v_rule, '{boleto,instrucao}', '""'::jsonb),
    'MATRICULA', 'Matrícula - Ciclo 1 - ENF T-42 INT',
    'ENF-T42-INT-MAT', 'ENF T-42 INT'
  );
  if v_disabled -> 'desconto' is distinct from 'null'::jsonb
    or v_disabled -> 'multa' is distinct from 'null'::jsonb
    or v_disabled -> 'juros' is distinct from 'null'::jsonb
    or v_disabled ->> 'valorEmDia' is distinct from '100.00'
    or v_disabled #>> '{mensagensBoleto,2}' is distinct from
      'SR.(A) CAIXA: NÃO RECEBER ESTE TÍTULO APÓS 60 (SESSENTA) DIAS DO VENCIMENTO.'
  then
    raise exception 'Autoverificação da prévia sem encargos falhou.';
  end if;
end;
$manual_cycle_boleto_self_check$;

create or replace function internal_academic.technical_manual_cycle_preview(
  p_matricula_id uuid,
  p_cycle_number integer,
  p_first_due_date date default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_enrollment public.matriculas%rowtype;
  v_class public.turmas%rowtype;
  v_state jsonb;
  v_rule jsonb;
  v_items jsonb := '[]'::jsonb;
  v_source text;
  v_origin_date date;
  v_first_due date;
  v_due date;
  v_day integer;
  v_count integer;
  v_number integer;
  v_total numeric := 0;
  v_value numeric;
  v_description text;
  v_key text;
  v_rule_fingerprint text;
  v_policy_fingerprint text;
  v_schedule_fingerprint text;
  v_has_lead_fee boolean := false;
begin
  if p_cycle_number = 2 and p_first_due_date is null then
    raise exception 'O 2º ciclo exige o vencimento individual do primeiro item.'
      using errcode = '22023';
  end if;
  select enrollment.* into v_enrollment
  from public.matriculas enrollment
  where enrollment.id = p_matricula_id;
  select class.* into v_class
  from public.turmas class
  where class.id = v_enrollment.turma_id;
  v_state := internal_academic.technical_manual_cycle_state(p_matricula_id);

  if not coalesce((v_state ->> 'habilitado')::boolean, false)
    or p_cycle_number is distinct from
      (v_state ->> 'proximoCicloNumero')::integer
  then
    raise exception 'Ciclo técnico manual inválido para esta matrícula.'
      using errcode = '22023';
  end if;
  if not coalesce((v_state ->> 'podeGerar')::boolean, false) then
    raise exception '%', coalesce(
      v_state -> 'bloqueio' ->> 'mensagem', 'Ciclo indisponível.'
    ) using errcode = 'P0001';
  end if;

  v_rule :=
    internal_academic.technical_financial_effective_rule(p_matricula_id);
  v_rule_fingerprint := v_rule -> 'identidade' ->> 'efetivaFingerprint';
  v_policy_fingerprint := v_state -> 'politica' ->> 'fingerprint';
  v_count :=
    (v_rule -> 'cobranca' -> 'mensalidade' ->> 'quantidade')::integer;

  if p_first_due_date is not null then
    v_source := 'INDIVIDUAL';
    v_origin_date := p_first_due_date;
    v_first_due := p_first_due_date;
    v_day := extract(day from p_first_due_date)::integer;
  else
    v_source := 'TURMA';
    v_day := (v_rule -> 'vencimento' ->> 'diaBase')::integer;
    select max(receivable.data_vencimento) into v_origin_date
    from public.contas_receber receivable
    where receivable.matricula_id = p_matricula_id
      and receivable.tipo_lancamento = 'PARCELA'
      and receivable.origem_cronograma_id like
        'ciclo-' || (p_cycle_number - 1) || '-parc-%';
    v_origin_date := coalesce(
      v_origin_date,
      (v_rule ->> 'primeiroVencimentoSugerido')::date
    );
    v_first_due := public.data_vencimento_mensal(
      v_origin_date, v_day, 0
    );
  end if;

  if v_first_due < (pg_catalog.timezone('America/Maceio', now()))::date
    or v_first_due
      > (pg_catalog.timezone('America/Maceio', now()))::date + 1825
  then
    raise exception 'O primeiro vencimento deve estar entre hoje e cinco anos.'
      using errcode = '22023';
  end if;

  if p_cycle_number = 1
    and (v_rule -> 'cobranca' -> 'matricula' ->> 'habilitada')::boolean
  then
    v_value :=
      (v_rule -> 'cobranca' -> 'matricula' ->> 'valor')::numeric;
    v_description := 'Matrícula - Ciclo 1 - ' || v_class.nome;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', 'matricula', 'tipo', 'MATRICULA', 'numero', 0,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_first_due, v_rule, 'MATRICULA',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
    v_has_lead_fee := true;
  elsif p_cycle_number = 2
    and (v_rule -> 'cobranca' -> 'rematricula' ->> 'habilitada')::boolean
  then
    v_value :=
      (v_rule -> 'cobranca' -> 'rematricula' ->> 'valor')::numeric;
    v_description := 'Rematrícula - Ciclo 2 - ' || v_class.nome;
    v_key := 'ciclo-1-rematricula';
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', v_key, 'tipo', 'REMATRICULA', 'numero', 0,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_first_due, v_rule, 'REMATRICULA',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
    v_has_lead_fee := true;
  end if;

  for v_number in 1..v_count loop
    v_due := public.data_vencimento_mensal(
      v_first_due,
      v_day,
      v_number - case when v_has_lead_fee then 0 else 1 end
    );
    v_value :=
      (v_rule -> 'cobranca' -> 'mensalidade' ->> 'valor')::numeric;
    v_key := 'ciclo-' || p_cycle_number || '-parc-' || v_number;
    v_description := 'Mensalidade ' || v_number || '/' || v_count
      || ' - Ciclo ' || p_cycle_number || ' - ' || v_class.nome;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'chave', v_key, 'tipo', 'PARCELA', 'numero', v_number,
      'descricao', v_description,
      'valor', pg_catalog.to_char(v_value, 'FM999999990.00'),
      'vencimento', pg_catalog.to_char(v_due, 'YYYY-MM-DD'),
      'detalhesBoleto',
        internal_academic.technical_manual_cycle_boleto_details(
          v_value, v_due, v_rule, 'MENSALIDADE',
          v_description, v_class.codigo, v_class.nome
        )
    ));
    v_total := v_total + v_value;
  end loop;

  v_schedule_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(jsonb_build_object(
      'matriculaId', p_matricula_id,
      'cicloNumero', p_cycle_number,
      'sourceVencimento', v_source,
      'dataOrigem', v_origin_date,
      'primeiroVencimento', v_first_due,
      'itens', v_items,
      'regraEfetivaFingerprint', v_rule_fingerprint,
      'politicaFingerprint', v_policy_fingerprint
    )::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'matriculaId', p_matricula_id,
    'turmaId', v_enrollment.turma_id,
    'cicloManual', v_state,
    'preview', jsonb_build_object(
      'cicloNumero', p_cycle_number,
      'sourceVencimento', v_source,
      'dataOrigem', pg_catalog.to_char(v_origin_date, 'YYYY-MM-DD'),
      'primeiroVencimento', pg_catalog.to_char(v_first_due, 'YYYY-MM-DD'),
      'quantidadeItens', jsonb_array_length(v_items),
      'total', pg_catalog.to_char(v_total, 'FM999999990.00'),
      'termos', internal_academic.technical_manual_cycle_terms(v_rule),
      'itens', v_items,
      'regraEfetivaFingerprint', v_rule_fingerprint,
      'politicaFingerprint', v_policy_fingerprint,
      'cronogramaFingerprint', v_schedule_fingerprint
    )
  );
end;
$function$;

revoke all on function internal_academic.technical_manual_cycle_preview(
  uuid, integer, date
) from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
