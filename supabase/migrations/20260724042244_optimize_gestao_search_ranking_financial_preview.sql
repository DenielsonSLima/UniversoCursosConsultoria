CREATE INDEX IF NOT EXISTS idx_turmas_status_polo_curso
  ON public.turmas (status, polo_id, curso_id);

CREATE OR REPLACE FUNCTION public.rank_gestao_turmas(
  p_modalidade text,
  p_status text,
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 9
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      turma.id,
      turma.nome,
      count(matricula.id) AS alunos
    FROM public.turmas AS turma
    JOIN public.cursos AS curso
      ON curso.id = turma.curso_id
    LEFT JOIN public.matriculas AS matricula
      ON matricula.turma_id = turma.id
      AND (
        upper(coalesce(p_modalidade, '')) <> 'EAD'
        OR upper(coalesce(matricula.status, '')) IN ('ATIVO', 'CONCLUIDO')
      )
    WHERE upper(curso.modalidade) = upper(trim(p_modalidade))
      AND (
        (
          upper(trim(p_modalidade)) = 'TECNICO'
          AND upper(trim(p_status)) = 'INSCRICOES_ABERTAS'
          AND turma.status IN ('PLANEJADA', 'INSCRICOES_ABERTAS')
        )
        OR (
          NOT (
            upper(trim(p_modalidade)) = 'TECNICO'
            AND upper(trim(p_status)) = 'INSCRICOES_ABERTAS'
          )
          AND turma.status = p_status
        )
      )
      AND (p_polo_id IS NULL OR turma.polo_id = p_polo_id)
      AND (p_data_inicial IS NULL OR turma.data_inicio >= p_data_inicial)
      AND (p_data_final IS NULL OR turma.data_inicio <= p_data_final)
      AND (
        nullif(trim(coalesce(p_search, '')), '') IS NULL
        OR lower(turma.nome) LIKE '%' || lower(trim(p_search)) || '%'
        OR lower(coalesce(turma.codigo, '')) LIKE '%' || lower(trim(p_search)) || '%'
      )
    GROUP BY turma.id, turma.nome
  ),
  page AS (
    SELECT id, nome, alunos
    FROM filtered
    ORDER BY alunos DESC, nome, id
    OFFSET greatest(coalesce(p_offset, 0), 0)
    LIMIT least(greatest(coalesce(p_limit, 9), 1), 100)
  )
  SELECT jsonb_build_object(
    'data',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', page.id, 'alunos', page.alunos)
          ORDER BY page.alunos DESC, page.nome, page.id
        )
        FROM page
      ),
      '[]'::jsonb
    ),
    'total',
    (SELECT count(*) FROM filtered)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.rank_gestao_turmas(
  text, text, uuid, text, date, date, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rank_gestao_turmas(
  text, text, uuid, text, date, date, integer, integer
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_gestao_available_students(
  p_turma_id uuid,
  p_search text,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_curso_id uuid;
  v_polo_id uuid;
  v_search text := lower(trim(coalesce(p_search, '')));
  v_digits text := regexp_replace(coalesce(p_search, ''), '\D', '', 'g');
  v_result jsonb;
BEGIN
  IF length(v_search) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT turma.curso_id, turma.polo_id
  INTO v_curso_id, v_polo_id
  FROM public.turmas AS turma
  WHERE turma.id = p_turma_id;

  IF v_curso_id IS NULL THEN
    RAISE EXCEPTION 'Turma não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.role() <> 'service_role'
     AND NOT (
       public.gestor_has_module('gestao')
       AND (
         public.is_gestor_global()
         OR public.is_gestor_for_polo(v_polo_id)
       )
     )
  THEN
    RAISE EXCEPTION 'Busca de alunos da Gestão não autorizada.'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(
    jsonb_agg(to_jsonb(result_row) ORDER BY result_row.nome, result_row.id),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      aluno.id,
      aluno.nome,
      aluno.cpf_cnpj,
      aluno.telefone,
      aluno.tipo_documento,
      aluno.rg,
      aluno.nome_mae,
      aluno.responsavel_nome,
      aluno.responsavel_cpf,
      aluno.responsavel_parentesco,
      aluno.responsavel_telefone,
      aluno.responsavel_email,
      aluno.responsavel_financeiro,
      aluno.situacao_ensino_medio,
      aluno.serie_ensino_medio_atual,
      aluno.escola_ensino_medio,
      aluno.ano_conclusao_ensino_medio,
      aluno.ano_previsto_conclusao_ensino_medio
    FROM public.parceiros AS aluno
    WHERE aluno.tipo = 'Aluno'
      AND aluno.status = 'ATIVO'
      AND (
        lower(aluno.nome) LIKE '%' || v_search || '%'
        OR lower(coalesce(aluno.cpf_cnpj, '')) LIKE '%' || v_search || '%'
        OR (
          length(v_digits) >= 2
          AND (
            regexp_replace(coalesce(aluno.cpf_cnpj, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
            OR regexp_replace(coalesce(aluno.telefone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
            OR regexp_replace(coalesce(aluno.responsavel_telefone, ''), '\D', '', 'g') LIKE '%' || v_digits || '%'
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.matriculas AS matricula
        JOIN public.turmas AS turma_matriculada
          ON turma_matriculada.id = matricula.turma_id
        WHERE matricula.aluno_id = aluno.id
          AND turma_matriculada.curso_id = v_curso_id
          AND upper(coalesce(matricula.status, '')) IN (
            'PENDENTE',
            'AGUARDANDO_PAGAMENTO',
            'AGUARDANDO_CONFIRMACAO',
            'ATIVO',
            'TRANCADO',
            'CONCLUIDO'
          )
      )
    ORDER BY aluno.nome, aluno.id
    LIMIT least(greatest(coalesce(p_limit, 30), 1), 50)
  ) AS result_row;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.search_gestao_available_students(uuid, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_gestao_available_students(uuid, text, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_gestao_financial_preview(
  p_valor numeric,
  p_desconto numeric,
  p_juros_percentual numeric,
  p_multa numeric,
  p_aplicar_desconto boolean DEFAULT true,
  p_aplicar_encargos boolean DEFAULT true
)
RETURNS TABLE(
  desconto_aplicado numeric,
  juros_calculados numeric,
  multa_aplicada numeric,
  valor_com_desconto numeric,
  valor_com_atraso numeric
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_valor numeric := round(coalesce(p_valor, 0), 2);
  v_desconto numeric;
  v_juros numeric;
  v_multa numeric;
BEGIN
  IF v_valor < 0
     OR coalesce(p_desconto, 0) < 0
     OR coalesce(p_multa, 0) < 0
     OR coalesce(p_juros_percentual, 0) < 0
     OR coalesce(p_juros_percentual, 0) > 100
  THEN
    RAISE EXCEPTION 'Valores financeiros inválidos para a prévia.'
      USING ERRCODE = '22023';
  END IF;

  v_desconto := CASE
    WHEN coalesce(p_aplicar_desconto, false)
      THEN round(coalesce(p_desconto, 0), 2)
    ELSE 0
  END;
  v_juros := CASE
    WHEN coalesce(p_aplicar_encargos, false)
      THEN round(v_valor * (coalesce(p_juros_percentual, 0) / 100.0), 2)
    ELSE 0
  END;
  v_multa := CASE
    WHEN coalesce(p_aplicar_encargos, false)
      THEN round(coalesce(p_multa, 0), 2)
    ELSE 0
  END;

  RETURN QUERY SELECT
    v_desconto,
    v_juros,
    v_multa,
    round(greatest(0, v_valor - v_desconto), 2),
    round(v_valor + v_juros + v_multa, 2);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_gestao_financial_preview(
  numeric, numeric, numeric, numeric, boolean, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_gestao_financial_preview(
  numeric, numeric, numeric, numeric, boolean, boolean
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.build_gestao_financial_schedule(
  p_data_inicio date,
  p_valor_matricula numeric,
  p_valor_parcela numeric,
  p_valor_rematricula numeric,
  p_qtd_parcelas integer,
  p_dia_vencimento integer
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_index integer;
  v_month_start date;
  v_due_date date;
  v_last_day integer;
BEGIN
  IF coalesce(p_valor_matricula, 0) < 0
     OR coalesce(p_valor_parcela, 0) < 0
     OR coalesce(p_valor_rematricula, 0) < 0
     OR coalesce(p_qtd_parcelas, 0) NOT BETWEEN 1 AND 60
     OR coalesce(p_dia_vencimento, 0) NOT BETWEEN 1 AND 28
  THEN
    RAISE EXCEPTION 'Parâmetros inválidos para gerar o cronograma financeiro.'
      USING ERRCODE = '22023';
  END IF;

  v_result := v_result || jsonb_build_array(jsonb_build_object(
    'id', 'matr',
    'tipo', 'MATRICULA',
    'label', 'Matrícula Inicial',
    'valor', round(coalesce(p_valor_matricula, 0), 2),
    'dataVencimento', coalesce(to_char(p_data_inicio, 'YYYY-MM-DD'), '')
  ));

  FOR v_index IN 1..p_qtd_parcelas LOOP
    v_month_start := (date_trunc('month', p_data_inicio)::date + make_interval(months => v_index))::date;
    v_last_day := extract(day FROM (v_month_start + interval '1 month - 1 day'))::integer;
    v_due_date := v_month_start + (least(p_dia_vencimento, v_last_day) - 1);

    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'id', 'parc-' || v_index,
      'tipo', 'PARCELA',
      'label', 'Mensalidade ' || v_index || '/' || p_qtd_parcelas,
      'valor', round(coalesce(p_valor_parcela, 0), 2),
      'numero', v_index,
      'dataVencimento', coalesce(to_char(v_due_date, 'YYYY-MM-DD'), '')
    ));
  END LOOP;

  v_month_start := (
    date_trunc('month', p_data_inicio)::date
    + make_interval(months => p_qtd_parcelas + 1)
  )::date;
  v_last_day := extract(day FROM (v_month_start + interval '1 month - 1 day'))::integer;
  v_due_date := v_month_start + (least(p_dia_vencimento, v_last_day) - 1);

  RETURN v_result || jsonb_build_array(jsonb_build_object(
    'id', 'rem-apos-ciclo',
    'tipo', 'REMATRICULA',
    'label', 'Rematrícula após o ciclo',
    'valor', round(coalesce(p_valor_rematricula, 0), 2),
    'dataVencimento', coalesce(to_char(v_due_date, 'YYYY-MM-DD'), '')
  ));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.build_gestao_financial_schedule(
  date, numeric, numeric, numeric, integer, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.build_gestao_financial_schedule(
  date, numeric, numeric, numeric, integer, integer
) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.gestao_realtime_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  source_table text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('INSERT', 'UPDATE', 'DELETE')),
  entity_id uuid NOT NULL,
  turma_id uuid NOT NULL,
  polo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gestao_realtime_events_polo_id_idx
  ON public.gestao_realtime_events (polo_id, id DESC);
CREATE INDEX IF NOT EXISTS gestao_realtime_events_turma_id_idx
  ON public.gestao_realtime_events (turma_id, id DESC);
CREATE INDEX IF NOT EXISTS gestao_realtime_events_created_at_idx
  ON public.gestao_realtime_events (created_at);

ALTER TABLE public.gestao_realtime_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gestao_realtime_events_select ON public.gestao_realtime_events;
CREATE POLICY gestao_realtime_events_select
  ON public.gestao_realtime_events
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.gestor_has_module('gestao'))
    AND (
      (SELECT public.is_gestor_global())
      OR (polo_id IS NOT NULL AND (SELECT public.is_gestor_for_polo(polo_id)))
    )
  );

CREATE OR REPLACE FUNCTION public.emit_turma_gestao_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.turmas;
  v_event_id bigint;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  INSERT INTO public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    v_row.id,
    v_row.id,
    v_row.polo_id
  )
  RETURNING id INTO v_event_id;

  IF v_event_id % 100 = 0 THEN
    DELETE FROM public.gestao_realtime_events
    WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.emit_matricula_gestao_realtime_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.matriculas;
  v_polo_id uuid;
  v_event_id bigint;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  SELECT turma.polo_id
  INTO v_polo_id
  FROM public.turmas AS turma
  WHERE turma.id = v_row.turma_id;

  INSERT INTO public.gestao_realtime_events (
    source_table,
    event_type,
    entity_id,
    turma_id,
    polo_id
  )
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    v_row.id,
    v_row.turma_id,
    v_polo_id
  )
  RETURNING id INTO v_event_id;

  IF v_event_id % 100 = 0 THEN
    DELETE FROM public.gestao_realtime_events
    WHERE created_at < now() - interval '24 hours';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS turmas_emit_gestao_realtime_event ON public.turmas;
CREATE TRIGGER turmas_emit_gestao_realtime_event
AFTER INSERT OR UPDATE OR DELETE ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.emit_turma_gestao_realtime_event();

DROP TRIGGER IF EXISTS matriculas_emit_gestao_realtime_event ON public.matriculas;
CREATE TRIGGER matriculas_emit_gestao_realtime_event
AFTER INSERT OR UPDATE OR DELETE ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.emit_matricula_gestao_realtime_event();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'gestao_realtime_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.gestao_realtime_events;
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.gestao_realtime_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.gestao_realtime_events TO authenticated;
REVOKE ALL ON FUNCTION public.emit_turma_gestao_realtime_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.emit_matricula_gestao_realtime_event()
  FROM PUBLIC, anon, authenticated;
