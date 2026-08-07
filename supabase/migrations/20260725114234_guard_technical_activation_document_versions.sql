BEGIN;
-- Versao registrada pelo MCP Supabase: 20260725114234.

CREATE OR REPLACE FUNCTION public.guard_technical_activation_document_versions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modalidade text;
BEGIN
  IF upper(coalesce(NEW.status, '')) <> 'ATIVO' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF upper(coalesce(OLD.status, '')) = 'ATIVO'
      AND OLD.aluno_id IS NOT DISTINCT FROM NEW.aluno_id
      AND OLD.turma_id IS NOT DISTINCT FROM NEW.turma_id
    THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT upper(coalesce(curso.modalidade, ''))
  INTO v_modalidade
  FROM public.turmas turma
  JOIN public.cursos curso ON curso.id = turma.curso_id
  WHERE turma.id = NEW.turma_id;

  IF v_modalidade <> 'TECNICO' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = NEW.aluno_id
      AND (
        lote.status = 'aguardando_mapeamento'
        OR (
          lote.status = 'preparando'
          AND lote.criado_em >= now() - interval '24 hours'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Existe envio documental incompleto ou PDF aguardando mapeamento.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = NEW.aluno_id
      AND versao.status = 'aprovado'
  ) THEN
    RAISE EXCEPTION
      'Aprove ao menos um documento enviado antes de ativar a matricula.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.aluno_id = NEW.aluno_id
      AND versao.status <> 'aprovado'
  ) THEN
    RAISE EXCEPTION
      'Ainda existem documentos enviados aguardando aprovacao ou recusados.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_technical_activation_document_versions()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_technical_activation_document_versions
  ON public.matriculas;
CREATE TRIGGER trg_guard_technical_activation_document_versions
BEFORE INSERT OR UPDATE OF status, aluno_id, turma_id ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.guard_technical_activation_document_versions();

COMMIT;
