export const PROFESSOR = '10000000-0000-4000-8000-000000000001';
export const OTHER_PROFESSOR = '10000000-0000-4000-8000-000000000002';
export const ACTOR = '10000000-0000-4000-8000-000000000003';

export const dossierFixture = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
  SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION public.is_partner_in_gestor_scope(uuid,uuid[]) RETURNS boolean LANGUAGE sql AS $$
  SELECT current_setting('test.allowed',true) = 'true'
    AND $1 = '10000000-0000-4000-8000-000000000010'::uuid $$;
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,tipo text,polo_id uuid,polo_ids uuid[]);
INSERT INTO public.parceiros VALUES
  ('${PROFESSOR}','Professor','10000000-0000-4000-8000-000000000010','{}'),
  ('${OTHER_PROFESSOR}','Professor','10000000-0000-4000-8000-000000000020','{}');
CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,
  file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated,anon;
CREATE POLICY legacy_storage_all ON storage.objects FOR ALL TO authenticated,anon
  USING (true) WITH CHECK (true);
SELECT set_config('test.actor','${ACTOR}',false),set_config('test.allowed','true',false);
`;
