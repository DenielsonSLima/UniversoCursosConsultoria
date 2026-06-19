-- Migração: Criação de tabelas para persistência do Diário de Classe e View Calculada
-- Autor: Antigravity

-- 1. TABELA: diario_frequencia (Frequência diária filtrável por turma/disciplina)
CREATE TABLE IF NOT EXISTS public.diario_frequencia (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  aula_id UUID NOT NULL REFERENCES public.aulas_turma(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  status CHAR(1) NOT NULL DEFAULT 'P' CHECK (status IN ('P', 'F')),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (aula_id, aluno_id)
);

ALTER TABLE public.diario_frequencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total local diario_frequencia" ON public.diario_frequencia;
CREATE POLICY "Acesso total local diario_frequencia" ON public.diario_frequencia FOR ALL USING (true) WITH CHECK (true);

-- 2. TABELA: diario_notas (Notas de avaliações dos alunos)
CREATE TABLE IF NOT EXISTS public.diario_notas (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  aluno_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  nota_p NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_p BETWEEN 0.0 AND 10.0),
  nota_ti NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_ti BETWEEN 0.0 AND 10.0),
  nota_tg NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_tg BETWEEN 0.0 AND 10.0),
  nota_s NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_s BETWEEN 0.0 AND 10.0),
  nota_cq NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_cq BETWEEN 0.0 AND 10.0),
  nota_o NUMERIC(4,2) NOT NULL DEFAULT 0.0 CHECK (nota_o BETWEEN 0.0 AND 10.0),
  nota_rec NUMERIC(4,2) CHECK (nota_rec IS NULL OR (nota_rec BETWEEN 0.0 AND 10.0)),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id, aluno_id)
);

ALTER TABLE public.diario_notas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total local diario_notas" ON public.diario_notas;
CREATE POLICY "Acesso total local diario_notas" ON public.diario_notas FOR ALL USING (true) WITH CHECK (true);

-- 3. TABELA: diario_praticas (Conteúdos e práticas pedagógicas registradas por aula)
CREATE TABLE IF NOT EXISTS public.diario_praticas (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  aula_id UUID PRIMARY KEY REFERENCES public.aulas_turma(id) ON DELETE CASCADE,
  pratica_pedagogica TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.diario_praticas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total local diario_praticas" ON public.diario_praticas;
CREATE POLICY "Acesso total local diario_praticas" ON public.diario_praticas FOR ALL USING (true) WITH CHECK (true);

-- 4. TABELA: diario_observacoes (Anotações gerais do docente)
CREATE TABLE IF NOT EXISTS public.diario_observacoes (
  turma_id UUID NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  disciplina_id UUID NOT NULL REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  observacoes TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (turma_id, disciplina_id)
);

ALTER TABLE public.diario_observacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acesso total local diario_observacoes" ON public.diario_observacoes;
CREATE POLICY "Acesso total local diario_observacoes" ON public.diario_observacoes FOR ALL USING (true) WITH CHECK (true);

-- 5. VIEW: v_diario_notas_resultados (Regras de negócio e cálculos centralizados no banco)
CREATE OR REPLACE VIEW public.v_diario_notas_resultados AS
WITH stats_faltas AS (
  SELECT 
    turma_id,
    disciplina_id,
    aluno_id,
    COUNT(CASE WHEN status = 'F' THEN 1 END) as total_faltas
  FROM public.diario_frequencia
  GROUP BY turma_id, disciplina_id, aluno_id
),
total_aulas_count AS (
  SELECT 
    turma_id,
    disciplina_id,
    COUNT(id) as total_aulas
  FROM public.aulas_turma
  GROUP BY turma_id, disciplina_id
)
SELECT 
  n.turma_id,
  n.disciplina_id,
  n.aluno_id,
  n.nota_p,
  n.nota_ti,
  n.nota_tg,
  n.nota_s,
  n.nota_cq,
  n.nota_o,
  n.nota_rec,
  COALESCE(ta.total_aulas, 0) as total_aulas,
  COALESCE(sf.total_faltas, 0) as total_faltas,
  CASE 
    WHEN COALESCE(ta.total_aulas, 0) > 0 THEN 
      ROUND(((ta.total_aulas - COALESCE(sf.total_faltas, 0))::NUMERIC / ta.total_aulas) * 100)
    ELSE 
      100
  END as frequencia_percent,
  -- Média parcial = (P + TI + TG + S) / 4 + CQ + O (máximo 10)
  LEAST(10.00, ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1)) as media_parcial,
  -- Média final = se nota_rec existir e for maior que média parcial, usa nota_rec, senão média parcial
  CASE 
    WHEN n.nota_rec IS NOT NULL AND n.nota_rec > LEAST(10.00, ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1)) THEN 
      n.nota_rec
    ELSE 
      LEAST(10.00, ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1))
  END as media_final,
  -- Resultado final (Média Final >= 6.0 e Frequência >= 75%)
  CASE 
    WHEN (
      CASE 
        WHEN n.nota_rec IS NOT NULL AND n.nota_rec > LEAST(10.00, ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1)) THEN 
          n.nota_rec
        ELSE 
          LEAST(10.00, ROUND(((n.nota_p + n.nota_ti + n.nota_tg + n.nota_s) / 4.0 + n.nota_cq + n.nota_o)::NUMERIC, 1))
      END
    ) >= 6.0 AND (
      CASE 
        WHEN COALESCE(ta.total_aulas, 0) > 0 THEN 
          ROUND(((ta.total_aulas - COALESCE(sf.total_faltas, 0))::NUMERIC / ta.total_aulas) * 100)
        ELSE 
          100
      END
    ) >= 75 THEN 
      'APROVADO'
    ELSE 
      'REPROVADO'
  END as resultado_final
FROM public.diario_notas n
LEFT JOIN stats_faltas sf ON n.turma_id = sf.turma_id AND n.disciplina_id = sf.disciplina_id AND n.aluno_id = sf.aluno_id
LEFT JOIN total_aulas_count ta ON n.turma_id = ta.turma_id AND n.disciplina_id = ta.disciplina_id;

-- 6. HABILITAR PUBLICAÇÕES REALTIME
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_frequencia;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_notas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_praticas;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.diario_observacoes;
COMMIT;
