import { readFile } from 'node:fs/promises';

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const [poloA, poloB, alunoA, alunoB, orphan] = [1, 2, 11, 12, 13].map(id);
export const path = owner => `${owner}/perfil/photo.jpg`;
export const url = owner => `https://kfekgwyqozhicpfuunpo.supabase.co/storage/v1/object/public/documentos/${path(owner)}`;
export const read = file => readFile(new URL(file, import.meta.url), 'utf8');
export const patch = async db => {
  for (const name of ['20261101030405_lgpd_private_profile_photos.sql', '20261101030414_lgpd_profile_photo_migration_journal.sql']) {
    await db.exec(await read(`../migrations/${name}`));
  }
};
export const actor = async (db, { uid = id(900), role = 'authenticated', kind = 'gestor', modules = ['parceiros'], polo = poloA } = {}) => {
  await db.exec('RESET ROLE');
  for (const [key, value] of Object.entries({ uid, role, kind, modules: modules.join(','), polo })) {
    await db.query('SELECT set_config($1,$2,false)', [`test.${key}`, value]);
  }
  await db.exec(`SET ROLE ${role}`);
};
export const setup = async db => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('test.uid',true),'')::uuid;
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.role',true);
    $$;
    CREATE FUNCTION public.current_aluno_id() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN current_setting('test.kind',true)='aluno' THEN auth.uid() END;
    $$;
    CREATE FUNCTION public.current_professor_id() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN current_setting('test.kind',true)='professor' THEN auth.uid() END;
    $$;
    CREATE FUNCTION public.gestor_has_module(text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT current_setting('test.kind',true)='gestor' AND $1=ANY(string_to_array(current_setting('test.modules',true),','));
    $$;
    CREATE FUNCTION public.gestor_has_tab(text,text) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT public.gestor_has_module($1);
    $$;
    CREATE FUNCTION public.gestor_has_any_tab(text,text[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT public.gestor_has_module($1);
    $$;
    CREATE FUNCTION public.is_partner_in_gestor_scope(uuid,uuid[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT public.gestor_has_module('parceiros') AND $1::text=current_setting('test.polo',true);
    $$;
    CREATE FUNCTION public.is_partner_in_gestor_read_scope(uuid,uuid[]) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT public.is_partner_in_gestor_scope($1,$2);
    $$;
    CREATE FUNCTION public.can_manage_secretaria_document(text,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
      SELECT public.gestor_has_module('secretaria') AND $2::text=current_setting('test.polo',true);
    $$;
    CREATE TABLE public.parceiros(id uuid PRIMARY KEY,tipo text,polo_id uuid,polo_ids uuid[] DEFAULT '{}',foto_url text);
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,bucket_id text,name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
    GRANT SELECT,INSERT,UPDATE ON public.parceiros TO authenticated,service_role;
    INSERT INTO storage.buckets VALUES ('documentos','documentos',true,NULL,NULL);
  `);
  for (const [student, polo] of [[alunoA, poloA], [alunoB, poloB]]) {
    await db.query('INSERT INTO public.parceiros(id,tipo,polo_id,foto_url) VALUES ($1,$2,$3,$4)', [student, 'Aluno', polo, url(student)]);
  }
  for (const owner of [alunoA, alunoB, orphan]) {
    await db.query('INSERT INTO storage.objects(bucket_id,name) VALUES ($1,$2)', ['documentos', path(owner)]);
  }
  const source = await read('../migrations/20260718085930_enforce_tabs_reports_and_storage_rbac.sql');
  const start = source.indexOf('CREATE OR REPLACE FUNCTION public.can_mutate_documentos_storage_object(');
  const end = source.indexOf('$$;', start) + 3;
  await db.exec(source.slice(start, end));
};
