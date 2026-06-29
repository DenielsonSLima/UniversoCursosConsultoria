INSERT INTO public.documentos_templates (id, conteudo, updated_at)
VALUES (
  'site_publico_ticker_config',
  '{
    "enabled": false,
    "mode": "manual",
    "manualText": "",
    "modalidades": ["TECNICO", "LIVRE", "ESPECIALIZACAO"],
    "cursoIds": [],
    "turmaIds": [],
    "maxItems": 12,
    "speedSeconds": 28,
    "showPolo": true,
    "showStartDate": false
  }'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documentos_templates_public_site_ticker_select" ON public.documentos_templates;

CREATE POLICY "documentos_templates_public_site_ticker_select"
  ON public.documentos_templates
  FOR SELECT
  TO anon
  USING (id = 'site_publico_ticker_config');
