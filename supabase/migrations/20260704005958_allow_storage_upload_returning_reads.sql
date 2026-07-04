-- Supabase Storage returns the inserted/updated object row after uploads.
-- Keep public buckets from being broadly listable, but allow authenticated users
-- to read rows they own so INSERT/UPDATE ... RETURNING passes RLS.
DROP POLICY IF EXISTS "Authenticated upload object reads" ON storage.objects;

CREATE POLICY "Authenticated upload object reads"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('documentos', 'anexos', 'biblioteca')
    AND (
      owner = auth.uid()
      OR owner_id = auth.uid()::text
      OR (bucket_id = 'documentos' AND name LIKE 'templates/%')
    )
  );
