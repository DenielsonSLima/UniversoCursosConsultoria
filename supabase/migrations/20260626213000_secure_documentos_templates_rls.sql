ALTER TABLE public.documentos_templates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.documentos_templates FROM anon, authenticated;
GRANT SELECT ON TABLE public.documentos_templates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.documentos_templates TO authenticated;

DROP POLICY IF EXISTS "documentos_templates_public_validation_select" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_select" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_insert" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_update" ON public.documentos_templates;
DROP POLICY IF EXISTS "documentos_templates_authenticated_delete" ON public.documentos_templates;

CREATE POLICY "documentos_templates_public_validation_select"
  ON public.documentos_templates
  FOR SELECT
  TO anon
  USING (id LIKE 'validation\_%' ESCAPE '\');

CREATE POLICY "documentos_templates_authenticated_select"
  ON public.documentos_templates
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "documentos_templates_authenticated_insert"
  ON public.documentos_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "documentos_templates_authenticated_update"
  ON public.documentos_templates
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "documentos_templates_authenticated_delete"
  ON public.documentos_templates
  FOR DELETE
  TO authenticated
  USING (true);
