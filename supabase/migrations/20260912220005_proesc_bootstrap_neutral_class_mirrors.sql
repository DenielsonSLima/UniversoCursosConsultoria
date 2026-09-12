begin;

-- Existing trigger bodies are preserved outside the exact private import claim.
CREATE OR REPLACE FUNCTION public.aplicar_padrao_financeiro_turma_tecnica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_modalidade text;
  v_rule jsonb;
  v_fingerprint text;
  v_first_due date;
begin
  select upper(coalesce(course.modalidade, '')) into v_modalidade
  from public.cursos course where course.id = new.curso_id;
  if v_modalidade not in ('TECNICO', 'TÉCNICO') then return new; end if;
  if exists(select 1 from internal_proesc.class_scopes scope
    where scope.turma_id=new.id and scope.batch_id is not null
      and scope.financial_mode='INDIVIDUAL_REVIEW'
      and internal_proesc.is_bootstrap_claim('CLASS',new.id,to_jsonb(new))) then
    return new;
  end if;
  v_rule := internal_academic.validate_technical_financial_rule_input(jsonb_build_object(
    'cobrarMatricula', coalesce(new.cobrar_matricula, new.valor_matricula > 0),
    'valorMatricula', new.valor_matricula,
    'qtdMensalidades', new.qtd_parcelas,
    'valorMensalidade', new.valor_parcela,
    'cobrarRematricula', coalesce(new.cobrar_rematricula, new.valor_rematricula > 0),
    'valorRematricula', new.valor_rematricula,
    'diaVencimento', new.dia_vencimento_padrao,
    'descontoPontualidade', new.desconto_pontualidade,
    'jurosAtrasoPercentual', new.juros_atraso,
    'multaAtrasoPercentual', coalesce(new.multa_atraso_percentual, 0),
    'aplicarDescontoMatricula', new.aplicar_desconto_matricula,
    'aplicarMultaJurosMatricula', new.aplicar_multa_juros_matricula,
    'aplicarDescontoMensalidade', new.aplicar_desconto_mensalidade,
    'aplicarMultaJurosMensalidade', new.aplicar_multa_juros_mensalidade,
    'aplicarDescontoRematricula', new.aplicar_desconto_rematricula,
    'aplicarMultaJurosRematricula', new.aplicar_multa_juros_rematricula,
    'instrucaoBoleto', new.instrucao_boleto_carne
  ));
  new.cobrar_matricula := (v_rule ->> 'cobrarMatricula')::boolean;
  new.valor_matricula := (v_rule ->> 'valorMatricula')::numeric;
  new.qtd_parcelas := (v_rule ->> 'qtdMensalidades')::integer;
  new.valor_parcela := (v_rule ->> 'valorMensalidade')::numeric;
  new.cobrar_rematricula := (v_rule ->> 'cobrarRematricula')::boolean;
  new.valor_rematricula := (v_rule ->> 'valorRematricula')::numeric;
  new.dia_vencimento_padrao := (v_rule ->> 'diaVencimento')::integer;
  new.desconto_pontualidade := (v_rule ->> 'descontoPontualidade')::numeric;
  new.juros_atraso := (v_rule ->> 'jurosAtrasoPercentual')::numeric;
  new.multa_atraso_percentual := (v_rule ->> 'multaAtrasoPercentual')::numeric;
  new.multa_atraso := round(new.valor_parcela * new.multa_atraso_percentual / 100.0, 2);
  new.aplicar_desconto_matricula := (v_rule ->> 'aplicarDescontoMatricula')::boolean;
  new.aplicar_multa_juros_matricula := (v_rule ->> 'aplicarMultaJurosMatricula')::boolean;
  new.aplicar_desconto_mensalidade := (v_rule ->> 'aplicarDescontoMensalidade')::boolean;
  new.aplicar_multa_juros_mensalidade := (v_rule ->> 'aplicarMultaJurosMensalidade')::boolean;
  new.aplicar_desconto_rematricula := (v_rule ->> 'aplicarDescontoRematricula')::boolean;
  new.aplicar_multa_juros_rematricula := (v_rule ->> 'aplicarMultaJurosRematricula')::boolean;
  new.instrucao_boleto_carne := v_rule ->> 'instrucaoBoleto';
  new.sincronizar_asaas_futuro := false;
  new.primeiro_vencimento_padrao := coalesce(new.primeiro_vencimento_padrao, new.data_inicio);
  v_first_due := coalesce(new.primeiro_vencimento_padrao, new.data_inicio, (pg_catalog.timezone('America/Maceio', now()))::date);
  new.cronograma_financeiro := internal_academic.build_flexible_technical_financial_schedule(v_first_due, v_rule);
  v_fingerprint := internal_academic.technical_financial_rule_fingerprint_v3(
    new.data_inicio, new.primeiro_vencimento_padrao, v_rule
  );
  if tg_op = 'INSERT' then
    new.regra_financeira_revisao := 1;
  elsif old.regra_financeira_fingerprint is distinct from v_fingerprint then
    new.regra_financeira_revisao := greatest(coalesce(old.regra_financeira_revisao, 0) + 1, 1);
  else
    new.regra_financeira_revisao := old.regra_financeira_revisao;
  end if;
  new.regra_financeira_fingerprint := v_fingerprint;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.sincronizar_periodos_turma_tecnica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_count integer; v_days integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cursos c
    WHERE c.id = NEW.curso_id AND c.modalidade = 'TECNICO') THEN RETURN NEW; END IF;
  SELECT count(*)::integer INTO v_count FROM public.modulos m WHERE m.curso_id = NEW.curso_id;
  IF v_count = 0 THEN RETURN NEW; END IF;
  IF NEW.data_previsao_termino IS NULL AND EXISTS(
    SELECT 1 FROM internal_proesc.class_scopes scope
    WHERE scope.turma_id=NEW.id AND scope.batch_id IS NOT NULL
      AND scope.financial_mode='INDIVIDUAL_REVIEW'
      AND internal_proesc.is_bootstrap_claim('CLASS',NEW.id,to_jsonb(NEW))
  ) THEN RETURN NEW; END IF;
  IF NEW.data_inicio IS NULL OR NEW.data_previsao_termino IS NULL THEN
    RAISE EXCEPTION 'Turma técnica exige datas inicial e final.';
  END IF;
  v_days := NEW.data_previsao_termino - NEW.data_inicio + 1;
  IF v_days < v_count THEN RAISE EXCEPTION 'Informe ao menos um dia por módulo.'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.data_inicio, NEW.data_previsao_termino)
    IS DISTINCT FROM (OLD.data_inicio, OLD.data_previsao_termino) THEN
    PERFORM internal_academic.authorize_transition(
      'TURMA_DISCIPLINA_RELINK:' || NEW.id::text,
      td.disciplina_id,
      'PERIODO_NULL'
    )
    FROM public.turmas_disciplinas td
    WHERE td.turma_id = NEW.id AND td.periodo_letivo_id IS NOT NULL;
    DELETE FROM public.periodos_letivos WHERE turma_id = NEW.id;
  END IF;
  INSERT INTO public.periodos_letivos
    (turma_id, modulo_id, nome, ordem, data_inicio, data_fim, status)
  SELECT NEW.id, x.id, x.nome, x.pos,
    NEW.data_inicio + floor(v_days::numeric * (x.pos - 1) / x.total)::integer,
    NEW.data_inicio + floor(v_days::numeric * x.pos / x.total)::integer - 1,
    'PLANEJADO'
  FROM (SELECT m.id, m.nome,
    row_number() OVER (ORDER BY m.created_at, m.nome, m.id)::integer pos,
    count(*) OVER ()::integer total
    FROM public.modulos m WHERE m.curso_id = NEW.curso_id) x
  ON CONFLICT (turma_id, modulo_id) DO NOTHING;
  INSERT INTO public.turmas_disciplinas
    (turma_id, disciplina_id, periodo_letivo_id, concluida)
  SELECT NEW.id, d.id, pl.id, false
  FROM public.disciplinas d JOIN public.modulos m ON m.id = d.modulo_id
  JOIN public.periodos_letivos pl ON pl.turma_id = NEW.id AND pl.modulo_id = m.id
  WHERE m.curso_id = NEW.curso_id
  ON CONFLICT (turma_id, disciplina_id) DO UPDATE
    SET periodo_letivo_id = EXCLUDED.periodo_letivo_id;
  RETURN NEW;
END;
$function$;

commit;

