-- Publica o catálogo de Ensino Superior na vitrine pública.
-- A seed original da Anhanguera criou os cursos como rascunho
-- (publicar_site = false), o que faz a RLS pública ocultar todos eles.

UPDATE public.cursos
SET
  status = 'ativo',
  publicar_site = true
WHERE modalidade = 'SUPERIOR';

