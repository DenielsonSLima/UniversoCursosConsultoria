-- Controla se uma turma presencial aceita inscrições online pelo portal/site.

ALTER TABLE public.turmas
  ADD COLUMN IF NOT EXISTS permitir_inscricoes_online BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_public_turma(p_turma_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.turmas t
    JOIN public.cursos c ON c.id = t.curso_id
    WHERE t.id = p_turma_id
      AND upper(coalesce(t.status, '')) = 'EM_ANDAMENTO'
      AND coalesce(t.permitir_inscricoes_online, false) = true
      AND lower(coalesce(c.status, '')) = 'ativo'
      AND coalesce(c.publicar_site, false) = true
  );
$$;

