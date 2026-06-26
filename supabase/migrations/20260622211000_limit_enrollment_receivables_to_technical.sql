-- Evita cobrança local duplicada em matrículas online já pagas pelo Asaas.
CREATE OR REPLACE FUNCTION public.criar_financeiro_ao_matricular()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modalidade TEXT;
BEGIN
  SELECT c.modalidade INTO v_modalidade
  FROM public.turmas t
  JOIN public.cursos c ON c.id = t.curso_id
  WHERE t.id = NEW.turma_id;

  IF NEW.status = 'ATIVO' AND v_modalidade = 'TECNICO' THEN
    PERFORM public.gerar_cobranca_matricula(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
