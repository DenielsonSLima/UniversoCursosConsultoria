CREATE OR REPLACE FUNCTION public.get_storage_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_storage_quota_bytes constant bigint := 107374182400; -- 100 GiB
BEGIN
  IF auth.role() <> 'service_role'
    AND NOT public.gestor_has_module('configuracoes')
  THEN
    RAISE EXCEPTION 'Acesso negado ao painel de armazenamento.'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH object_data AS (
      SELECT
        o.bucket_id,
        o.name,
        lower(coalesce(o.metadata ->> 'mimetype', '')) AS mime_type,
        lower(regexp_replace(o.name, '^.*\.', '')) AS extension,
        CASE
          WHEN coalesce(o.metadata ->> 'size', o.metadata ->> 'contentLength', '') ~ '^[0-9]+$'
            THEN coalesce(o.metadata ->> 'size', o.metadata ->> 'contentLength')::bigint
          ELSE 0::bigint
        END AS bytes
      FROM storage.objects o
    ),
    typed_objects AS (
      SELECT
        object_data.*,
        CASE
          WHEN mime_type LIKE 'image/%' THEN 'imagens'
          WHEN mime_type = 'application/pdf' OR extension = 'pdf' THEN 'pdfs'
          WHEN mime_type LIKE 'video/%' THEN 'videos'
          WHEN mime_type LIKE 'audio/%' THEN 'audios'
          WHEN mime_type LIKE '%spreadsheet%'
            OR mime_type LIKE '%excel%'
            OR extension IN ('xls', 'xlsx', 'ods', 'csv') THEN 'planilhas'
          WHEN mime_type LIKE '%presentation%'
            OR mime_type LIKE '%powerpoint%'
            OR extension IN ('ppt', 'pptx', 'odp') THEN 'apresentacoes'
          WHEN mime_type LIKE '%word%'
            OR extension IN ('doc', 'docx', 'odt', 'rtf', 'txt') THEN 'documentos'
          WHEN extension IN ('zip', 'rar', '7z', 'tar', 'gz') THEN 'compactados'
          ELSE 'outros'
        END AS file_type
      FROM object_data
    ),
    storage_totals AS (
      SELECT
        count(*)::bigint AS object_count,
        coalesce(sum(bytes), 0)::bigint AS used_bytes
      FROM typed_objects
    ),
    storage_by_type AS (
      SELECT
        file_type,
        count(*)::bigint AS object_count,
        coalesce(sum(bytes), 0)::bigint AS used_bytes
      FROM typed_objects
      GROUP BY file_type
    ),
    storage_by_bucket AS (
      SELECT
        b.id AS bucket_id,
        b.name AS bucket_name,
        b.public,
        count(t.name)::bigint AS object_count,
        coalesce(sum(t.bytes), 0)::bigint AS used_bytes
      FROM storage.buckets b
      LEFT JOIN typed_objects t ON t.bucket_id = b.id
      GROUP BY b.id, b.name, b.public
    ),
    partner_totals AS (
      SELECT
        lower(coalesce(p.tipo, 'outros')) AS partner_type,
        count(*)::bigint AS total_count,
        count(*) FILTER (
          WHERE upper(coalesce(p.status, '')) = 'ATIVO'
        )::bigint AS active_count
      FROM public.parceiros p
      GROUP BY lower(coalesce(p.tipo, 'outros'))
    ),
    entity_totals AS (
      SELECT 'alunos'::text AS entity_id, 'Alunos'::text AS label,
        coalesce(sum(total_count), 0)::bigint AS total_count,
        coalesce(sum(active_count), 0)::bigint AS active_count
      FROM partner_totals WHERE partner_type = 'aluno'
      UNION ALL
      SELECT 'professores', 'Professores',
        coalesce(sum(total_count), 0)::bigint,
        coalesce(sum(active_count), 0)::bigint
      FROM partner_totals WHERE partner_type = 'professor'
      UNION ALL
      SELECT 'parceiros', 'Outros parceiros',
        coalesce(sum(total_count), 0)::bigint,
        coalesce(sum(active_count), 0)::bigint
      FROM partner_totals WHERE partner_type NOT IN ('aluno', 'professor')
      UNION ALL
      SELECT 'matriculas', 'Matrículas', count(*)::bigint,
        count(*) FILTER (
          WHERE upper(coalesce(status, '')) IN ('ATIVO', 'ATIVA', 'CURSANDO')
        )::bigint
      FROM public.matriculas
      UNION ALL
      SELECT 'turmas', 'Turmas', count(*)::bigint,
        count(*) FILTER (
          WHERE upper(coalesce(status, '')) IN ('ATIVO', 'ATIVA', 'EM ANDAMENTO')
        )::bigint
      FROM public.turmas
      UNION ALL
      SELECT 'cursos', 'Cursos', count(*)::bigint,
        count(*) FILTER (
          WHERE upper(coalesce(status, '')) IN ('ATIVO', 'ATIVA')
        )::bigint
      FROM public.cursos
      UNION ALL
      SELECT 'gestores', 'Usuários do sistema', count(*)::bigint,
        count(*) FILTER (
          WHERE upper(coalesce(status, '')) IN ('ATIVO', 'ATIVA')
        )::bigint
      FROM public.usuarios_sistema
    ),
    public_table_sizes AS (
      SELECT
        c.relname AS table_name,
        pg_total_relation_size(c.oid)::bigint AS total_bytes,
        greatest(coalesce(c.reltuples, 0), 0)::bigint AS estimated_rows
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
    )
    SELECT jsonb_build_object(
      'generated_at', statement_timestamp(),
      'storage', jsonb_build_object(
        'quota_bytes', v_storage_quota_bytes,
        'used_bytes', storage_totals.used_bytes,
        'available_bytes', greatest(v_storage_quota_bytes - storage_totals.used_bytes, 0),
        'object_count', storage_totals.object_count,
        'usage_percent', CASE
          WHEN v_storage_quota_bytes = 0 THEN 0
          ELSE round((storage_totals.used_bytes::numeric / v_storage_quota_bytes::numeric) * 100, 4)
        END,
        'by_type', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'type', file_type,
              'object_count', object_count,
              'used_bytes', used_bytes
            )
            ORDER BY used_bytes DESC, file_type
          )
          FROM storage_by_type
        ), '[]'::jsonb),
        'by_bucket', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', bucket_id,
              'name', bucket_name,
              'public', public,
              'object_count', object_count,
              'used_bytes', used_bytes
            )
            ORDER BY used_bytes DESC, bucket_name
          )
          FROM storage_by_bucket
        ), '[]'::jsonb)
      ),
      'database', jsonb_build_object(
        'used_bytes', pg_database_size(current_database()),
        'largest_tables', coalesce((
          SELECT jsonb_agg(
            jsonb_build_object(
              'name', table_name,
              'used_bytes', total_bytes,
              'estimated_rows', estimated_rows
            )
            ORDER BY total_bytes DESC, table_name
          )
          FROM (
            SELECT table_name, total_bytes, estimated_rows
            FROM public_table_sizes
            ORDER BY total_bytes DESC
            LIMIT 8
          ) largest
        ), '[]'::jsonb)
      ),
      'entities', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', entity_id,
            'label', label,
            'total_count', total_count,
            'active_count', active_count
          )
          ORDER BY CASE entity_id
            WHEN 'alunos' THEN 1
            WHEN 'professores' THEN 2
            WHEN 'matriculas' THEN 3
            WHEN 'turmas' THEN 4
            WHEN 'cursos' THEN 5
            WHEN 'gestores' THEN 6
            ELSE 7
          END
        )
        FROM entity_totals
      ), '[]'::jsonb)
    )
    FROM storage_totals
  );
END;
$$;

COMMENT ON FUNCTION public.get_storage_dashboard() IS
  'Painel administrativo consolidado de uso do Storage, banco e volumes cadastrais.';

REVOKE ALL ON FUNCTION public.get_storage_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_storage_dashboard() TO authenticated, service_role;
