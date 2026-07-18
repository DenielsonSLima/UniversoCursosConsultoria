-- Corrige os dados fictícios de homologação antes de tornar o CPF obrigatório.
WITH cpfs_homologacao(email, cpf) AS (
  VALUES
    ('aline.teste@hml.universo.invalid', '90000010057'),
    ('beatriz.certificacao@hml.universo.invalid', '90000010138'),
    ('bruno.teste@hml.universo.invalid', '90000010219'),
    ('carla.teste@hml.universo.invalid', '90000010308'),
    ('diego.teste@hml.universo.invalid', '90000010480'),
    ('elisa.teste@hml.universo.invalid', '90000010561'),
    ('fabio.teste@hml.universo.invalid', '90000010642'),
    ('gabriela.teste@hml.universo.invalid', '90000010723'),
    ('helena.teste@hml.universo.invalid', '90000010804'),
    ('igor.teste@hml.universo.invalid', '90000010995')
)
UPDATE public.parceiros p
SET cpf_cnpj = h.cpf,
    updated_at = now()
FROM cpfs_homologacao h
WHERE lower(p.email) = h.email
  AND p.tipo = 'Aluno'
  AND nullif(pg_catalog.regexp_replace(coalesce(p.cpf_cnpj, ''), '\D', '', 'g'), '') IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.parceiros'::regclass
      AND conname = 'parceiros_aluno_cpf_required'
  ) THEN
    ALTER TABLE public.parceiros
      ADD CONSTRAINT parceiros_aluno_cpf_required
      CHECK (
        upper(coalesce(tipo, '')) <> 'ALUNO'
        OR pg_catalog.regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') ~ '^[0-9]{11}$'
      ) NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.parceiros
  VALIDATE CONSTRAINT parceiros_aluno_cpf_required;

-- A fila de certificados passa a usar a mesma apuração autoritativa da
-- finalização da turma: frequência ponderada, regras próprias, aproveitamentos
-- e avaliações de estágio permanecem no banco, nunca no frontend.
CREATE OR REPLACE FUNCTION public.sincronizar_certificado_matricula()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_turma public.turmas%rowtype;
  v_curso public.cursos%rowtype;
  v_aluno public.parceiros%rowtype;
  v_conclusao date;
  v_media numeric;
  v_status_final text;
BEGIN
  IF upper(coalesce(NEW.status, '')) <> 'CONCLUIDO' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_turma
  FROM public.turmas
  WHERE id = NEW.turma_id;

  SELECT * INTO v_curso
  FROM public.cursos
  WHERE id = v_turma.curso_id;

  SELECT * INTO v_aluno
  FROM public.parceiros
  WHERE id = NEW.aluno_id;

  IF v_curso.modalidade NOT IN ('TECNICO', 'LIVRE', 'EAD', 'ESPECIALIZACAO') THEN
    RETURN NEW;
  END IF;

  IF v_curso.modalidade = 'TECNICO' THEN
    v_status_final := internal_academic.final_enrollment_status(
      NEW.turma_id,
      NEW.aluno_id
    );

    IF v_status_final <> 'CONCLUIDO' THEN
      RETURN NEW;
    END IF;

    SELECT avg(resultados.media_final)
    INTO v_media
    FROM internal_academic.get_enrollment_results(NEW.id) resultados
    WHERE resultados.resultado_final IN ('APROVADO', 'APROVEITADO');
  END IF;

  SELECT coalesce(max(data_movimentacao), current_date)
  INTO v_conclusao
  FROM public.matricula_movimentacoes
  WHERE matricula_id = NEW.id
    AND tipo = 'CONCLUSAO';

  INSERT INTO public.certificados_academicos (
    matricula_id,
    aluno_id,
    turma_id,
    curso_id,
    polo_id,
    modalidade,
    data_inscricao,
    data_conclusao,
    nota_final,
    ensino_medio_estabelecimento,
    ensino_medio_localidade_uf,
    ensino_medio_ano_conclusao
  ) VALUES (
    NEW.id,
    NEW.aluno_id,
    NEW.turma_id,
    v_curso.id,
    v_turma.polo_id,
    v_curso.modalidade,
    NEW.data_matricula,
    v_conclusao,
    v_media,
    coalesce(
      nullif(btrim(v_aluno.escola_ensino_medio), ''),
      nullif(btrim(v_aluno.instituicao_origem), '')
    ),
    coalesce(v_aluno.cidade, '')
      || CASE WHEN v_aluno.uf IS NOT NULL THEN ' - ' || v_aluno.uf ELSE '' END,
    v_aluno.ano_conclusao_ensino_medio
  )
  ON CONFLICT (matricula_id) DO UPDATE SET
    nota_final = EXCLUDED.nota_final,
    data_conclusao = EXCLUDED.data_conclusao,
    ensino_medio_estabelecimento = EXCLUDED.ensino_medio_estabelecimento,
    ensino_medio_localidade_uf = EXCLUDED.ensino_medio_localidade_uf,
    ensino_medio_ano_conclusao = EXCLUDED.ensino_medio_ano_conclusao,
    updated_at = now()
  WHERE certificados_academicos.status = 'PENDENTE';

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sincronizar_certificado_matricula()
  FROM PUBLIC, anon, authenticated;

-- Reprocessa somente concluintes técnicos sem fila criada, sem gerar egress.
UPDATE public.matriculas m
SET status = m.status
FROM public.turmas t
JOIN public.cursos c ON c.id = t.curso_id
WHERE m.turma_id = t.id
  AND m.status = 'CONCLUIDO'
  AND c.modalidade = 'TECNICO'
  AND NOT EXISTS (
    SELECT 1
    FROM public.certificados_academicos ca
    WHERE ca.matricula_id = m.id
  );
