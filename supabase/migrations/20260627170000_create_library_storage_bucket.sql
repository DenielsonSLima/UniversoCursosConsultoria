-- Migration: 20260627170000_create_library_storage_bucket.sql
-- Description: Create dedicated storage bucket for biblioteca documents.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'biblioteca',
  'biblioteca',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public biblioteca uploads'
  ) THEN
    CREATE POLICY "Public biblioteca uploads" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'biblioteca');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public biblioteca reads'
  ) THEN
    CREATE POLICY "Public biblioteca reads" ON storage.objects
      FOR SELECT USING (bucket_id = 'biblioteca');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public biblioteca deletes'
  ) THEN
    CREATE POLICY "Public biblioteca deletes" ON storage.objects
      FOR DELETE USING (bucket_id = 'biblioteca');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public biblioteca updates'
  ) THEN
    CREATE POLICY "Public biblioteca updates" ON storage.objects
      FOR UPDATE USING (bucket_id = 'biblioteca');
  END IF;
END;
$$;
