-- Canonical read-only function capture, 2026-10-27. Synthetic tests only.
CREATE OR REPLACE FUNCTION internal_academic.technical_manual_cycle_preview_before_automatic_proesc(p_matricula_id uuid, p_cycle_number integer, p_first_due_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_proesc.enrollment_financial_block(p_matricula_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case
    when internal_academic.manager_second_cycle_permitted(p_matricula_id) then null
    when internal_academic.technical_imported_cycle_has_conflict(
      p_matricula_id
    ) then 'HISTORICO_IMPORTADO_IDENTIDADE_DIVERGENTE'
    when internal_academic.technical_imported_cycle_exists(
      p_matricula_id, 2
    ) then 'PROESC_CONTRATO_EXTERNO'
    when internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    ) then null
    when exists (
      select 1 from internal_academic.technical_imported_cycle_facts fact
      where fact.matricula_id = p_matricula_id
    ) then 'PROESC_COBERTURA_INDIVIDUAL_EM_CONFERENCIA'
    when internal_academic.technical_local_cycle_eligible(p_matricula_id)
      then null
    else internal_proesc.enrollment_financial_block_before_individual_admission(
      p_matricula_id
    )
  end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_proesc.assert_fresh_cycle_generation(p_matricula_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if internal_academic.manager_second_cycle_permitted(p_matricula_id) then return; end if;
  if internal_academic.technical_imported_cycle_has_conflict(
    p_matricula_id
  ) then
    raise exception 'A identidade ou a origem do histórico exige revisão.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_imported_cycle_exists(
    p_matricula_id, 2
  ) then
    raise exception 'O segundo ciclo já possui cobertura confirmada.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_imported_cycle_generation_permitted(
    p_matricula_id
  ) then
    return;
  end if;
  if exists (
    select 1 from internal_academic.technical_imported_cycle_facts fact
    where fact.matricula_id = p_matricula_id
  ) then
    raise exception 'O histórico importado não autoriza esta geração.'
      using errcode = '42501';
  end if;
  if internal_academic.technical_local_cycle_eligible(p_matricula_id) then
    return;
  end if;
  if internal_academic.technical_imported_cycle_identity_context(
    p_matricula_id
  ) is not null then
    raise exception 'A cobertura individual importada exige prova confirmada.'
      using errcode = '42501';
  end if;
  perform internal_proesc.assert_fresh_cycle_generation_before_individual_admission(
    p_matricula_id
  );
end;
$function$;

-- READ-ONLY reference fetched 2026-10-27 11:44-11:45 UTC. Not a migration.
CREATE OR REPLACE FUNCTION internal_academic.technical_imported_banese_c2_claim_is_current(p_matricula_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select internal_academic.technical_imported_banese_cycle_is_durable(
      p_matricula_id, 1
    )
    and internal_academic.technical_imported_cycle_generation_permitted(
      p_matricula_id
    )
    and exists (
      select 1
      from internal_academic.technical_manual_cycle_runs run
      where run.matricula_id = p_matricula_id
        and run.cycle_number = 2
        and run.state = 'GENERATING'
        and run.request_id is not null
        and run.completed_at is null
        and run.xmin = pg_catalog.pg_current_xact_id_if_assigned()::xid
        and coalesce(cardinality(run.receivable_ids), 0) = 0
    );
$function$;

