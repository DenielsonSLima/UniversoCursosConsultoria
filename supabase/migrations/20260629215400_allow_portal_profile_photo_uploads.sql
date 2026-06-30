DROP POLICY IF EXISTS "Anon profile photo uploads" ON storage.objects;
DROP POLICY IF EXISTS "Anon profile photo updates" ON storage.objects;

CREATE POLICY "Anon profile photo uploads"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE '%/perfil/%'
  );

CREATE POLICY "Anon profile photo updates"
  ON storage.objects
  FOR UPDATE
  TO anon
  USING (
    bucket_id = 'documentos'
    AND name LIKE '%/perfil/%'
  )
  WITH CHECK (
    bucket_id = 'documentos'
    AND name LIKE '%/perfil/%'
  );
