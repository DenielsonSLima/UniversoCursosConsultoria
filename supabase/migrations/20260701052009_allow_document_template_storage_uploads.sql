-- Ensure all document template editors can upload their background/assets.
-- Paths currently used by the app:
-- - templates/bgFrenteUrl_*.png|jpg|webp
-- - templates/cracha-*.png|jpg|webp
-- - templates/certificados/*.png|jpg|webp
-- - templates/diarios/*/*.png|jpg|webp

INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "portal_documentos_templates_storage_insert_gestor" ON storage.objects;
DROP POLICY IF EXISTS "portal_documentos_templates_storage_update_gestor" ON storage.objects;
DROP POLICY IF EXISTS "portal_documentos_templates_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "portal_documentos_templates_storage_update" ON storage.objects;

CREATE POLICY "portal_documentos_templates_storage_insert"
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
  );

CREATE POLICY "portal_documentos_templates_storage_update"
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE 'templates/%'
  );
