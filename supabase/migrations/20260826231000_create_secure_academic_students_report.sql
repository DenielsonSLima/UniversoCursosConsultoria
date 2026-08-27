BEGIN;

CREATE OR REPLACE FUNCTION public.get_relatorio_alunos_academicos_secure(
  p_modo text,
  p_polo_id uuid DEFAULT NULL,
  p_modalidade text DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL,
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
  v_modo text := upper(btrim(coalesce(p_modo, '')));
  v_modalidade text := nullif(upper(btrim(coalesce(p_modalidade, ''))), '');
  v_status text := nullif(upper(btrim(coalesce(p_status, ''))), '');
  v_busca text := nullif(left(btrim(coalesce(p_busca, '')), 160), '');
  v_busca_digitos text;
  v_limit integer := coalesce(p_limit, 200);
  v_offset integer := coalesce(p_offset, 0);
  v_escopo text := 'Consolidado';
  v_total_escopo integer := 0;
  v_total_registros integer := 0;
  v_total_ativos integer := 0;
  v_total_concluidos integer := 0;
  v_total_pendentes integer := 0;
  v_total_tecnico integer := 0;
  v_total_ead integer := 0;
  v_total_certificados_finalizados integer := 0;
  v_linhas jsonb := '[]'::jsonb;
  v_turmas jsonb := '[]'::jsonb;
  v_status_counts jsonb := '[]'::jsonb;
  v_modalidade_counts jsonb := '[]'::jsonb;
  v_page_count integer := 0;
  v_empty_reason text;
BEGIN
  v_busca_digitos := regexp_replace(coalesce(v_busca, ''), '[^0-9]', '', 'g');

  IF v_modo NOT IN ('CURSANDO', 'FINALIZADOS', 'MATRICULA_INICIAL', 'SITUACAO_ALUNO') THEN
    RAISE EXCEPTION 'Modo inválido para o relatório acadêmico.'
      USING ERRCODE = '22023';
  END IF;

  IF v_modalidade = 'TODOS' THEN
    v_modalidade := NULL;
  END IF;

  IF v_status = 'TODOS' THEN
    v_status := NULL;
  END IF;

  IF v_modalidade IS NOT NULL
     AND v_modalidade NOT IN ('TECNICO', 'LIVRE', 'ESPECIALIZACAO', 'EAD', 'SUPERIOR') THEN
    RAISE EXCEPTION 'Modalidade inválida para o relatório acadêmico.'
      USING ERRCODE = '22023';
  END IF;

  IF v_status IS NOT NULL
     AND v_status NOT IN (
       'PENDENTE', 'ATIVO', 'TRANCADO', 'CANCELADO', 'CONCLUIDO',
       'REPROVADO', 'EM_DEPENDENCIA', 'DESISTENTE', 'TRANSFERIDO'
     ) THEN
    RAISE EXCEPTION 'Situação inválida para o relatório acadêmico.'
      USING ERRCODE = '22023';
  END IF;

  -- PENDENTE permanece uma situação própria. Aluno cursando é exclusivamente ATIVO.
  IF v_modo = 'CURSANDO' THEN
    v_status := 'ATIVO';
  ELSIF v_modo = 'FINALIZADOS' THEN
    v_status := 'CONCLUIDO';
  END IF;

  IF v_limit < 1 OR v_limit > 500 THEN
    RAISE EXCEPTION 'O limite do relatório acadêmico deve estar entre 1 e 500.'
      USING ERRCODE = '22023';
  END IF;

  IF v_offset < 0 OR v_offset > 100000 THEN
    RAISE EXCEPTION 'A paginação do relatório acadêmico é inválida.'
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
    RAISE EXCEPTION 'Acesso não autorizado ao relatório acadêmico.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL THEN
    SELECT polo.nome
    INTO v_escopo
    FROM public.polos polo
    WHERE polo.id = p_polo_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Polo do relatório acadêmico não encontrado.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_turma_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.turmas turma
       WHERE turma.id = p_turma_id
         AND (p_polo_id IS NULL OR turma.polo_id = p_polo_id)
     ) THEN
    RAISE EXCEPTION 'Turma fora do escopo autorizado do relatório acadêmico.'
      USING ERRCODE = '22023';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT
      matricula.id,
      matricula.aluno_id,
      matricula.turma_id,
      upper(matricula.status) AS status,
      (pg_catalog.timezone('America/Maceio', matricula.data_matricula))::date AS data_matricula,
      aluno.nome AS aluno_nome,
      CASE
        WHEN cpf.digitos = '' THEN '—'
        WHEN length(cpf.digitos) = 11 THEN
          '***.' || substr(cpf.digitos, 4, 3) || '.' || substr(cpf.digitos, 7, 3) || '-**'
        ELSE '***'
      END AS aluno_cpf_mascarado,
      cpf.digitos AS aluno_cpf_busca,
      aluno.data_nascimento,
      coalesce(aluno.pcd, false) AS pcd,
      aluno.pcd_tipo,
      curso.nome AS curso_nome,
      curso.modalidade,
      coalesce(curso.carga_horaria, 0)::integer AS carga_horaria,
      turma.nome AS turma_nome,
      turma.codigo AS turma_codigo,
      turma.status AS turma_status,
      turma.data_inicio,
      turma.data_previsao_termino AS data_fim,
      polo.nome AS polo_nome,
      certificado.status AS certificado_status
    FROM public.matriculas matricula
    JOIN public.parceiros aluno ON aluno.id = matricula.aluno_id
    JOIN public.turmas turma ON turma.id = matricula.turma_id
    JOIN public.cursos curso ON curso.id = turma.curso_id
    JOIN public.polos polo ON polo.id = turma.polo_id
    LEFT JOIN public.certificados_academicos certificado
      ON certificado.matricula_id = matricula.id
    LEFT JOIN LATERAL (
      SELECT regexp_replace(coalesce(aluno.cpf_cnpj, ''), '[^0-9]', '', 'g') AS digitos
    ) cpf ON true
    WHERE p_polo_id IS NULL OR turma.polo_id = p_polo_id
  ), filtradas AS MATERIALIZED (
    SELECT item.*
    FROM base item
    WHERE (v_modalidade IS NULL OR item.modalidade = v_modalidade)
      AND (p_turma_id IS NULL OR item.turma_id = p_turma_id)
      AND (v_status IS NULL OR item.status = v_status)
      AND (
        v_busca IS NULL
        OR lower(concat_ws(
          ' ',
          item.aluno_nome,
          item.aluno_cpf_busca,
          item.curso_nome,
          item.turma_nome,
          item.turma_codigo,
          item.polo_nome,
          item.status
        )) LIKE '%' || lower(v_busca) || '%'
        OR (
          v_busca_digitos <> ''
          AND item.aluno_cpf_busca LIKE '%' || v_busca_digitos || '%'
        )
      )
  ), ordenadas AS (
    SELECT
      item.*,
      row_number() OVER (
        ORDER BY item.aluno_nome, item.curso_nome, item.turma_nome,
          item.data_matricula DESC NULLS LAST, item.id
      ) AS sequencia
    FROM filtradas item
  ), status_agrupados AS (
    SELECT item.status, count(*)::integer AS quantidade
    FROM filtradas item
    GROUP BY item.status
  ), modalidade_agrupadas AS (
    SELECT item.modalidade, count(*)::integer AS quantidade
    FROM filtradas item
    GROUP BY item.modalidade
  )
  SELECT
    (SELECT count(*)::integer FROM base),
    (SELECT count(*)::integer FROM filtradas),
    (SELECT count(*)::integer FROM filtradas WHERE status = 'ATIVO'),
    (SELECT count(*)::integer FROM filtradas WHERE status = 'CONCLUIDO'),
    (SELECT count(*)::integer FROM filtradas WHERE status = 'PENDENTE'),
    (SELECT count(*)::integer FROM filtradas WHERE modalidade = 'TECNICO'),
    (SELECT count(*)::integer FROM filtradas WHERE modalidade = 'EAD'),
    (
      SELECT count(*)::integer
      FROM filtradas
      WHERE certificado_status = 'FINALIZADO'
    ),
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'aluno_id', item.aluno_id,
          'aluno_nome', item.aluno_nome,
          'aluno_cpf_mascarado', item.aluno_cpf_mascarado,
          'data_nascimento', CASE
            WHEN v_modo = 'MATRICULA_INICIAL' THEN to_char(item.data_nascimento, 'YYYY-MM-DD')
            ELSE NULL
          END,
          'pcd', CASE WHEN v_modo = 'MATRICULA_INICIAL' THEN item.pcd ELSE false END,
          'pcd_tipo', CASE WHEN v_modo = 'MATRICULA_INICIAL' THEN item.pcd_tipo ELSE NULL END,
          'status', item.status,
          'data_matricula', to_char(item.data_matricula, 'YYYY-MM-DD'),
          'curso_nome', item.curso_nome,
          'modalidade', item.modalidade,
          'carga_horaria', item.carga_horaria,
          'turma_id', item.turma_id,
          'turma_nome', item.turma_nome,
          'turma_codigo', item.turma_codigo,
          'turma_status', item.turma_status,
          'data_inicio', to_char(item.data_inicio, 'YYYY-MM-DD'),
          'data_fim', to_char(item.data_fim, 'YYYY-MM-DD'),
          'polo_nome', item.polo_nome,
          'certificado_status', item.certificado_status
        )
        ORDER BY item.sequencia
      ), '[]'::jsonb)
      FROM ordenadas item
      WHERE item.sequencia > v_offset
        AND item.sequencia <= v_offset + v_limit
    ),
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('status', item.status, 'quantidade', item.quantidade)
        ORDER BY item.status
      ), '[]'::jsonb)
      FROM status_agrupados item
    ),
    (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('modalidade', item.modalidade, 'quantidade', item.quantidade)
        ORDER BY item.modalidade
      ), '[]'::jsonb)
      FROM modalidade_agrupadas item
    )
  INTO
    v_total_escopo,
    v_total_registros,
    v_total_ativos,
    v_total_concluidos,
    v_total_pendentes,
    v_total_tecnico,
    v_total_ead,
    v_total_certificados_finalizados,
    v_linhas,
    v_status_counts,
    v_modalidade_counts;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', turma.id,
      'nome', turma.nome,
      'codigo', turma.codigo,
      'modalidade', curso.modalidade
    )
    ORDER BY curso.nome, turma.nome, turma.codigo, turma.id
  ), '[]'::jsonb)
  INTO v_turmas
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE (p_polo_id IS NULL OR turma.polo_id = p_polo_id)
    AND (v_modalidade IS NULL OR curso.modalidade = v_modalidade);

  v_page_count := jsonb_array_length(v_linhas);

  IF v_total_registros = 0 THEN
    v_empty_reason := CASE
      WHEN v_total_escopo = 0 THEN 'NO_ROWS'
      WHEN v_modo IN ('CURSANDO', 'FINALIZADOS')
        AND v_modalidade IS NULL
        AND p_turma_id IS NULL
        AND v_busca IS NULL
        THEN 'NO_ROWS_FOR_MODE'
      ELSE 'FILTERS_EXCLUDE_ROWS'
    END;
  END IF;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object(
      'modo', v_modo,
      'escopo', v_escopo,
      'generated_at', now()
    ),
    'filtros_aplicados', jsonb_build_object(
      'polo_id', p_polo_id,
      'modalidade', v_modalidade,
      'turma_id', p_turma_id,
      'status', v_status,
      'busca', v_busca
    ),
    'resumo', jsonb_build_object(
      'total_registros', v_total_registros,
      'total_ativos', v_total_ativos,
      'total_concluidos', v_total_concluidos,
      'total_pendentes', v_total_pendentes,
      'total_tecnico', v_total_tecnico,
      'total_ead', v_total_ead,
      'total_certificados_finalizados', v_total_certificados_finalizados,
      'por_status', v_status_counts,
      'por_modalidade', v_modalidade_counts
    ),
    'turmas_disponiveis', v_turmas,
    'linhas', v_linhas,
    'page_info', jsonb_build_object(
      'offset', v_offset,
      'limit', v_limit,
      'returned', v_page_count,
      'total', v_total_registros,
      'has_more', v_offset + v_page_count < v_total_registros
    ),
    'empty_reason', v_empty_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_relatorio_alunos_academicos_secure(
  text, uuid, text, uuid, text, text, integer, integer
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_relatorio_alunos_academicos_secure(
  text, uuid, text, uuid, text, text, integer, integer
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_relatorio_alunos_academicos_secure(
  text, uuid, text, uuid, text, text, integer, integer
) IS 'Contrato canônico paginado dos relatórios acadêmicos; filtros, status, KPIs, ordem e CPF mascarado são resolvidos no backend.';

NOTIFY pgrst, 'reload schema';

COMMIT;
