-- Migration: 20260620_create_storage_bucket_anexos.sql
-- Description: Create storage bucket for file attachments in communication module.

-- Insert bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos',
  'anexos',
  true,
  26214400, -- 25MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 26214400,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS Policies for storage
-- Allow anyone to upload to the comunicacao folder (in practice, auth is handled by app)
CREATE POLICY "Public comunicacao uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'anexos');

CREATE POLICY "Public comunicacao reads" ON storage.objects
  FOR SELECT USING (bucket_id = 'anexos');

CREATE POLICY "Public comunicacao deletes" ON storage.objects
  FOR DELETE USING (bucket_id = 'anexos');
