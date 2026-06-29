-- Allow gestores to upload background assets used by document templates.
-- The cracha editor stores these files under the public documentos/templates path.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "portal_documentos_templates_storage_insert_gestor" ON storage.objects;
DROP POLICY IF EXISTS "portal_documentos_templates_storage_update_gestor" ON storage.objects;

CREATE POLICY "portal_documentos_templates_storage_insert_gestor"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
    AND (select public.is_gestor())
  );

CREATE POLICY "portal_documentos_templates_storage_update_gestor"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
    AND (select public.is_gestor())
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
    AND (select public.is_gestor())
  );
