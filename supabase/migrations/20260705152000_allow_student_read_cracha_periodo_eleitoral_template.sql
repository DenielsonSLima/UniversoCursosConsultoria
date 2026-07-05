DROP POLICY IF EXISTS "documentos_templates_cracha_periodo_eleitoral_authenticated_select" ON public.documentos_templates;

CREATE POLICY "documentos_templates_cracha_periodo_eleitoral_authenticated_select"
  ON public.documentos_templates
  FOR SELECT
  TO authenticated
  USING (id = 'cracha_periodo_eleitoral');
