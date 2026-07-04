ALTER TABLE public.cursos
ADD COLUMN IF NOT EXISTS vacinas_config JSONB NOT NULL DEFAULT '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb;

COMMENT ON COLUMN public.cursos.vacinas_config IS
  'Configuracao de vacinas obrigatorias para liberacao de estagio por curso.';

CREATE TABLE IF NOT EXISTS public.aluno_vacinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  curso_id UUID NOT NULL REFERENCES public.cursos(id) ON DELETE CASCADE,
  matricula_id UUID REFERENCES public.matriculas(id) ON DELETE SET NULL,
  turma_id UUID REFERENCES public.turmas(id) ON DELETE SET NULL,
  vacina_codigo TEXT NOT NULL,
  vacina_nome TEXT NOT NULL,
  dose_numero INTEGER NOT NULL CHECK (dose_numero > 0),
  dose_label TEXT NOT NULL,
  data_aplicacao DATE,
  lote TEXT,
  local_aplicacao TEXT,
  arquivo_url TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'aprovado', 'reprovado')),
  origem TEXT NOT NULL DEFAULT 'aluno' CHECK (origem IN ('aluno', 'secretaria')),
  observacao TEXT,
  validado_por UUID,
  validado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, curso_id, vacina_codigo, dose_numero)
);

CREATE INDEX IF NOT EXISTS aluno_vacinas_aluno_id_idx ON public.aluno_vacinas (aluno_id);
CREATE INDEX IF NOT EXISTS aluno_vacinas_curso_id_idx ON public.aluno_vacinas (curso_id);
CREATE INDEX IF NOT EXISTS aluno_vacinas_matricula_id_idx ON public.aluno_vacinas (matricula_id);
CREATE INDEX IF NOT EXISTS aluno_vacinas_turma_id_idx ON public.aluno_vacinas (turma_id);
CREATE INDEX IF NOT EXISTS aluno_vacinas_status_idx ON public.aluno_vacinas (status);

CREATE OR REPLACE FUNCTION public.touch_aluno_vacinas_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_touch_aluno_vacinas_updated_at ON public.aluno_vacinas;
CREATE TRIGGER trigger_touch_aluno_vacinas_updated_at
BEFORE UPDATE ON public.aluno_vacinas
FOR EACH ROW
EXECUTE FUNCTION public.touch_aluno_vacinas_updated_at();

ALTER TABLE public.aluno_vacinas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_aluno_vacinas_select" ON public.aluno_vacinas;
DROP POLICY IF EXISTS "portal_aluno_vacinas_write" ON public.aluno_vacinas;

CREATE POLICY "portal_aluno_vacinas_select"
  ON public.aluno_vacinas FOR SELECT
  USING (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = aluno_vacinas.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  );

CREATE POLICY "portal_aluno_vacinas_write"
  ON public.aluno_vacinas FOR ALL
  TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = aluno_vacinas.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  )
  WITH CHECK (
    aluno_id = public.current_aluno_id()
    OR EXISTS (
      SELECT 1
      FROM public.parceiros p
      WHERE p.id = aluno_vacinas.aluno_id
        AND public.is_partner_in_gestor_scope(p.polo_id, p.polo_ids)
    )
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.aluno_vacinas;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

WITH required_health_vaccines AS (
  SELECT jsonb_build_object(
    'exigirCarteiraEstagio', true,
    'observacao', 'Obrigatorio para liberacao de estagio em cursos da area da saude.',
    'vacinas', jsonb_build_array(
      jsonb_build_object(
        'codigo', 'hepatite_b',
        'nome', 'Hepatite B',
        'obrigatoria', true,
        'doses', jsonb_build_array(
          jsonb_build_object('numero', 1, 'label', '1a dose'),
          jsonb_build_object('numero', 2, 'label', '2a dose'),
          jsonb_build_object('numero', 3, 'label', '3a dose')
        )
      ),
      jsonb_build_object(
        'codigo', 'tetano_dt',
        'nome', 'Tetano / dT',
        'obrigatoria', true,
        'doses', jsonb_build_array(
          jsonb_build_object('numero', 1, 'label', '1a dose'),
          jsonb_build_object('numero', 2, 'label', '2a dose'),
          jsonb_build_object('numero', 3, 'label', '3a dose'),
          jsonb_build_object('numero', 4, 'label', 'Reforco')
        )
      ),
      jsonb_build_object(
        'codigo', 'covid_19',
        'nome', 'COVID-19',
        'obrigatoria', true,
        'doses', jsonb_build_array(
          jsonb_build_object('numero', 1, 'label', '1a dose'),
          jsonb_build_object('numero', 2, 'label', '2a dose')
        )
      )
    )
  ) AS config
)
UPDATE public.cursos c
SET vacinas_config = required_health_vaccines.config
FROM required_health_vaccines
WHERE c.modalidade = 'TECNICO'
  AND (
    c.nome ILIKE '%enfermagem%'
    OR c.nome ILIKE '%radiologia%'
    OR c.nome ILIKE '%radiol%'
  )
  AND (
    c.vacinas_config IS NULL
    OR c.vacinas_config = '{}'::jsonb
    OR c.vacinas_config = '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb
  );

DROP FUNCTION IF EXISTS public.get_cursos_com_kpis(TEXT);

CREATE OR REPLACE FUNCTION public.get_cursos_com_kpis(p_modalidade TEXT)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  modalidade TEXT,
  carga_horaria INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  area TEXT,
  descricao TEXT,
  versao TEXT,
  parceiro_instituicao TEXT,
  parceiro_logo_url TEXT,
  imagem_url TEXT,
  duracao_meses INTEGER,
  carga_horaria_cadastrada NUMERIC,
  total_turmas BIGINT,
  publicar_site BOOLEAN,
  imagem_detalhe_1 TEXT,
  imagem_detalhe_2 TEXT,
  valor NUMERIC,
  ead_config JSONB,
  asaas_payment_link_id TEXT,
  asaas_payment_link_url TEXT,
  asaas_link_status TEXT,
  asaas_link_updated_at TIMESTAMPTZ,
  financeiro_config JSONB,
  vacinas_config JSONB
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.nome::TEXT,
    c.modalidade::TEXT,
    c.carga_horaria,
    c.status::TEXT,
    c.created_at,
    c.area::TEXT,
    c.descricao::TEXT,
    c.versao::TEXT,
    c.parceiro_instituicao::TEXT,
    c.parceiro_logo_url::TEXT,
    c.imagem_url::TEXT,
    c.duracao_meses,
    COALESCE((
      SELECT SUM(d.carga_horaria)
      FROM public.modulos m
      JOIN public.disciplinas d ON d.modulo_id = m.id
      WHERE m.curso_id = c.id
    ), 0)::NUMERIC AS carga_horaria_cadastrada,
    COALESCE((
      SELECT COUNT(*)
      FROM public.turmas t
      WHERE t.curso_id = c.id
    ), 0)::BIGINT AS total_turmas,
    COALESCE(c.publicar_site, false) AS publicar_site,
    c.imagem_detalhe_1::TEXT,
    c.imagem_detalhe_2::TEXT,
    c.valor,
    c.ead_config,
    c.asaas_payment_link_id::TEXT,
    c.asaas_payment_link_url::TEXT,
    c.asaas_link_status::TEXT,
    c.asaas_link_updated_at,
    c.financeiro_config,
    COALESCE(c.vacinas_config, '{"exigirCarteiraEstagio":false,"vacinas":[]}'::jsonb)
  FROM public.cursos c
  WHERE c.modalidade = p_modalidade
  ORDER BY c.nome ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_cursos_com_kpis(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cursos_com_kpis(TEXT) TO authenticated, service_role;
