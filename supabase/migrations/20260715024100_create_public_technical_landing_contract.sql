BEGIN;

-- Chave estável que liga cada curso à sua pasta de landing page. A escolha não
-- depende do nome visível depois deste backfill, então renomear o curso não
-- troca silenciosamente o formulário utilizado.
ALTER TABLE public.cursos
  ADD COLUMN IF NOT EXISTS landing_template_key text NOT NULL DEFAULT 'default';

ALTER TABLE public.cursos
  DROP CONSTRAINT IF EXISTS cursos_landing_template_key_check;

ALTER TABLE public.cursos
  ADD CONSTRAINT cursos_landing_template_key_check CHECK (
    landing_template_key IN (
      'default',
      'enfermagem',
      'seguranca-do-trabalho',
      'radiologia',
      'analises-clinicas',
      'saude-bucal'
    )
  );

UPDATE public.cursos
SET landing_template_key = CASE
  WHEN lower(nome) LIKE '%enfermagem%' THEN 'enfermagem'
  WHEN lower(nome) LIKE '%seguran%trabalho%' THEN 'seguranca-do-trabalho'
  WHEN lower(nome) LIKE '%radiologia%' THEN 'radiologia'
  WHEN lower(nome) LIKE '%análises clínicas%'
    OR lower(nome) LIKE '%analises clinicas%' THEN 'analises-clinicas'
  WHEN lower(nome) LIKE '%saúde bucal%'
    OR lower(nome) LIKE '%saude bucal%' THEN 'saude-bucal'
  ELSE landing_template_key
END
WHERE modalidade = 'TECNICO';

COMMENT ON COLUMN public.cursos.landing_template_key IS
  'Chave estável da pasta/formulário usado pela landing page pública do curso técnico.';

-- Retorna somente dados públicos e a quantidade agregada de vagas. A função
-- evita expor matrículas/alunos ao visitante anônimo e mantém janela e fuso em
-- uma única regra autoritativa.
CREATE OR REPLACE FUNCTION public.list_public_technical_classes(
  p_limit integer DEFAULT 3,
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE (
  turma_id uuid,
  curso_id uuid,
  curso_nome text,
  curso_descricao text,
  curso_area text,
  curso_carga_horaria integer,
  curso_duracao_meses integer,
  curso_imagem_url text,
  landing_template_key text,
  turma_nome text,
  turma_codigo text,
  turma_status text,
  turno text,
  data_inicio date,
  data_previsao_termino date,
  data_inicio_inscricao date,
  data_fim_inscricao date,
  vagas_totais integer,
  vagas_ocupadas bigint,
  vagas_disponiveis integer,
  situacao_vagas text,
  valor_matricula numeric,
  qtd_parcelas integer,
  valor_parcela numeric,
  aceita_concomitante boolean,
  aceita_subsequente boolean,
  serie_minima_ensino_medio smallint,
  polo_id uuid,
  polo_nome text,
  polo_cidade text,
  polo_estado text,
  polo_endereco text,
  polo_numero text,
  polo_bairro text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH public_turmas AS (
    SELECT
      t.*,
      c.nome AS c_nome,
      c.descricao AS c_descricao,
      c.area AS c_area,
      c.carga_horaria AS c_carga_horaria,
      c.duracao_meses AS c_duracao_meses,
      c.imagem_url AS c_imagem_url,
      c.landing_template_key AS c_template_key,
      p.nome AS p_nome,
      p.cidade AS p_cidade,
      p.estado AS p_estado,
      p.endereco AS p_endereco,
      p.numero AS p_numero,
      p.bairro AS p_bairro,
      count(m.id) FILTER (
        WHERE m.status IN ('PENDENTE', 'ATIVO', 'TRANCADO', 'CONCLUIDO')
      ) AS ocupadas,
      CASE
        WHEN coalesce(t.qtd_vagas_minima, 0) > 0 AND coalesce(t.vagas_totais, 0) > 0
          THEN least(t.qtd_vagas_minima, t.vagas_totais)
        WHEN coalesce(t.qtd_vagas_minima, 0) > 0 THEN t.qtd_vagas_minima
        ELSE coalesce(t.vagas_totais, 0)
      END AS capacidade_online
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    JOIN public.polos p ON p.id = t.polo_id
    LEFT JOIN public.matriculas m ON m.turma_id = t.id
    WHERE c.modalidade = 'TECNICO'
      AND lower(coalesce(c.status, '')) = 'ativo'
      AND coalesce(c.publicar_site, false)
      AND coalesce(t.permitir_inscricoes_online, false)
      AND t.status IN ('INSCRICOES_ABERTAS', 'EM_ANDAMENTO')
      AND (t.data_inicio_inscricao IS NULL
        OR t.data_inicio_inscricao <= (pg_catalog.timezone('America/Maceio', now()))::date)
      AND (t.data_fim_inscricao IS NULL
        OR t.data_fim_inscricao >= (pg_catalog.timezone('America/Maceio', now()))::date)
      AND (p_turma_id IS NULL OR t.id = p_turma_id)
    GROUP BY t.id, c.id, p.id
  )
  SELECT
    pt.id,
    pt.curso_id,
    pt.c_nome::text,
    coalesce(pt.c_descricao, '')::text,
    coalesce(pt.c_area, 'Formação técnica')::text,
    coalesce(pt.c_carga_horaria, 0)::integer,
    pt.c_duracao_meses::integer,
    pt.c_imagem_url::text,
    pt.c_template_key::text,
    pt.nome::text,
    coalesce(pt.codigo, '')::text,
    pt.status::text,
    coalesce(pt.turno, 'A DEFINIR')::text,
    pt.data_inicio,
    pt.data_previsao_termino,
    pt.data_inicio_inscricao,
    pt.data_fim_inscricao,
    coalesce(pt.vagas_totais, 0)::integer,
    pt.ocupadas,
    greatest(pt.capacidade_online - pt.ocupadas::integer, 0)::integer,
    CASE
      WHEN pt.capacidade_online > 0 AND pt.ocupadas >= pt.capacidade_online THEN 'VAGAS ESGOTADAS'
      WHEN pt.capacidade_online > 0 AND pt.capacidade_online - pt.ocupadas <= 5 THEN 'ÚLTIMAS VAGAS'
      ELSE 'VAGAS DISPONÍVEIS'
    END::text,
    coalesce(pt.valor_matricula, 0)::numeric,
    coalesce(pt.qtd_parcelas, 0)::integer,
    coalesce(pt.valor_parcela, 0)::numeric,
    coalesce(pt.aceita_concomitante, false),
    coalesce(pt.aceita_subsequente, true),
    coalesce(pt.serie_minima_ensino_medio, 2)::smallint,
    pt.polo_id,
    pt.p_nome::text,
    coalesce(pt.p_cidade, '')::text,
    coalesce(pt.p_estado, '')::text,
    pt.p_endereco::text,
    pt.p_numero::text,
    pt.p_bairro::text
  FROM public_turmas pt
  ORDER BY pt.data_inicio NULLS LAST, pt.c_nome, pt.nome
  LIMIT greatest(1, least(coalesce(p_limit, 3), 20));
$$;

REVOKE ALL ON FUNCTION public.list_public_technical_classes(integer, uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_technical_classes(integer, uuid)
  TO anon, authenticated, service_role;

COMMIT;
