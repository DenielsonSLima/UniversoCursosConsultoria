DROP POLICY IF EXISTS "documentos_templates_site_ticker_insert_gestor" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_site_ticker_update_gestor" ON public.documentos_templates;

CREATE POLICY "documentos_templates_site_ticker_insert_gestor"
  ON public.documentos_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (id = 'site_publico_ticker_config' AND public.is_gestor());

CREATE POLICY "documentos_templates_site_ticker_update_gestor"
  ON public.documentos_templates
  FOR UPDATE
  TO authenticated
  USING (id = 'site_publico_ticker_config' AND public.is_gestor())
  WITH CHECK (id = 'site_publico_ticker_config' AND public.is_gestor());
