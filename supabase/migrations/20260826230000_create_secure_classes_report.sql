BEGIN;

CREATE OR REPLACE FUNCTION public.get_relatorio_turmas_secure(
  p_polo_id uuid DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_busca text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_modalidade text := nullif(upper(btrim(coalesce(p_modalidade, ''))), '');
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_busca text := nullif(left(btrim(coalesce(p_busca, '')), 160), '');
  v_limit integer := coalesce(p_limit, 200);
  v_offset integer := coalesce(p_offset, 0);
  v_escopo text := 'Consolidado';
  v_total_turmas integer := 0;
  v_total_alunos_ativos integer := 0;
  v_linhas jsonb := '[]'::jsonb;
  v_status_counts jsonb := '[]'::jsonb;
  v_page_count integer := 0;
  v_empty_reason text;
BEGIN
  IF v_modalidade = 'TODOS' THEN
    v_modalidade := NULL;
  END IF;

  IF v_status = 'TODOS' THEN
    v_status := NULL;
  END IF;

  IF v_modalidade IS NOT NULL
     AND v_modalidade NOT IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD', 'SUPERIOR') THEN
    RAISE EXCEPTION 'Modalidade inválida para o relatório de turmas.'
      USING ERRCODE = '22023';
  END IF;

  IF v_status IS NOT NULL
     AND v_status NOT IN ('PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'FINALIZADA') THEN
    RAISE EXCEPTION 'Situação inválida para o relatório de turmas.'
      USING ERRCODE = '22023';
  END IF;

  IF v_limit < 1 OR v_limit > 500 THEN
    RAISE EXCEPTION 'O limite do relatório de turmas deve estar entre 1 e 500.'
      USING ERRCODE = '22023';
  END IF;

  IF v_offset < 0 OR v_offset > 100000 THEN
    RAISE EXCEPTION 'A paginação do relatório de turmas é inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND NOT (
       (
         p_polo_id IS NULL
         AND public.is_gestor_global()
         AND public.gestor_has_module('relatorios')
       )
       OR (
         p_polo_id IS NOT NULL
         AND public.is_gestor_for_polo(p_polo_id)
         AND public.gestor_has_module('relatorios')
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao relatório de turmas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    SELECT polo.nome
    INTO v_escopo
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Polo do relatório não encontrado.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  WITH base AS (
    SELECT
      turma.id,
      turma.codigo,
      turma.nome,
      turma.status,
      turma.turno,
      turma.data_inicio,
      turma.data_previsao_termino,
      curso.nome AS curso_nome,
      curso.modalidade,
      polo.nome AS polo_nome,
      count(matricula.id) FILTER (
        WHERE upper(coalesce(matricula.status, '')) = 'ATIVO'
      )::integer AS alunos_ativos
    FROM public.turmas turma
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.polos polo ON polo.id = turma.polo_id
    LEFT JOIN public.matriculas matricula ON matricula.turma_id = turma.id
    WHERE p_polo_id IS NULL OR turma.polo_id = p_polo_id
    GROUP BY
      turma.id,
      turma.codigo,
      turma.nome,
      turma.status,
      turma.turno,
      turma.data_inicio,
      turma.data_previsao_termino,
      curso.nome,
      curso.modalidade,
      polo.nome
  ), filtradas AS (
    SELECT turma.*
    FROM base turma
    WHERE (v_modalidade IS NULL OR turma.modalidade = v_modalidade)
      AND (v_status IS NULL OR turma.status = v_status)
      AND (
        v_busca IS NULL
        OR lower(concat_ws(
          ' ',
          turma.codigo,
          turma.nome,
          turma.curso_nome,
          turma.modalidade,
          turma.status,
          turma.polo_nome
        )) LIKE '%' || lower(v_busca) || '%'
      )
  ), ordenadas AS (
    SELECT
      turma.*,
      row_number() OVER (
        ORDER BY turma.curso_nome ASC, turma.nome ASC, turma.codigo ASC, turma.id ASC
      ) AS sequencia
    FROM filtradas turma
  ), status_agrupados AS (
    SELECT
      turma.status,
      count(*)::integer AS quantidade_turmas,
      coalesce(sum(turma.alunos_ativos), 0)::integer AS quantidade_alunos_ativos
    FROM filtradas turma
    GROUP BY turma.status
  )
  SELECT
    (SELECT count(*)::integer FROM filtradas),
    (SELECT coalesce(sum(alunos_ativos), 0)::integer FROM filtradas),
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', turma.id,
          'codigo', turma.codigo,
          'nome', turma.nome,
          'status', turma.status,
          'turno', turma.turno,
          'data_inicio', to_char(turma.data_inicio, 'YYYY-MM-DD'),
          'data_previsao_termino', to_char(turma.data_previsao_termino, 'YYYY-MM-DD'),
          'curso_nome', turma.curso_nome,
          'modalidade', turma.modalidade,
          'polo_nome', turma.polo_nome,
          'alunos_ativos', turma.alunos_ativos
        )
        ORDER BY turma.sequencia
      ), '[]'::jsonb)
      FROM ordenadas turma
      WHERE turma.sequencia > v_offset
        AND turma.sequencia <= v_offset + v_limit
    ),
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'status', agrupado.status,
          'quantidade_turmas', agrupado.quantidade_turmas,
          'quantidade_alunos_ativos', agrupado.quantidade_alunos_ativos
        )
        ORDER BY agrupado.status
      ), '[]'::jsonb)
      FROM status_agrupados agrupado
    )
  INTO
    v_total_turmas,
    v_total_alunos_ativos,
    v_linhas,
    v_status_counts;

  v_page_count := jsonb_array_length(v_linhas);

  IF v_total_turmas = 0 THEN
    v_empty_reason := CASE
      WHEN v_modalidade IS NOT NULL OR v_status IS NOT NULL OR v_busca IS NOT NULL
        THEN 'FILTERS_EXCLUDE_ROWS'
      ELSE 'NO_ROWS'
    END;
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'escopo', v_escopo,
      'generated_at', now()
    ),
    'filtros_aplicados', jsonb_build_object(
      'polo_id', p_polo_id,
      'modalidade', v_modalidade,
      'status', v_status,
      'busca', v_busca
    ),
    'resumo', jsonb_build_object(
      'total_turmas', v_total_turmas,
      'total_alunos_ativos', v_total_alunos_ativos,
      'por_status', v_status_counts
    ),
    'linhas', v_linhas,
    'page_info', jsonb_build_object(
      'offset', v_offset,
      'limit', v_limit,
      'returned', v_page_count,
      'total', v_total_turmas,
      'has_more', v_offset + v_page_count < v_total_turmas
    ),
    'empty_reason', v_empty_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_relatorio_turmas_secure(
  uuid, text, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_relatorio_turmas_secure(
  uuid, text, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_relatorio_turmas_secure(
  uuid, text, text, text, integer, integer
) IS 'Contrato canônico paginado do relatório de turmas; filtros, status e totais são resolvidos no backend.';

NOTIFY pgrst, 'reload schema';

COMMIT;
