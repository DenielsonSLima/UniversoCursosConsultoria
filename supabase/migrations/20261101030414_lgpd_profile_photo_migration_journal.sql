BEGIN;

CREATE SCHEMA IF NOT EXISTS internal_privacy;
REVOKE ALL ON SCHEMA internal_privacy FROM PUBLIC, anon, authenticated;

CREATE TABLE internal_privacy.profile_photo_migration_jobs (
  source_path text PRIMARY KEY,
  target_path text NOT NULL,
  partner_id uuid,
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'verified', 'finalized', 'completed')),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  requested_by uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  finalized_at timestamptz,
  completed_at timestamptz
);
ALTER TABLE internal_privacy.profile_photo_migration_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE internal_privacy.profile_photo_migration_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.profile_photo_migration_summary()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_new integer; v_pending integer; v_quarantine integer; v_completed integer; v_public integer;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*), count(*) FILTER (WHERE p.id IS NULL)
  INTO v_new, v_quarantine FROM storage.objects o
  LEFT JOIN public.parceiros p ON p.id = public.profile_photo_partner_id(o.name)
  WHERE o.bucket_id = 'documentos' AND public.profile_photo_partner_id(o.name) IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM internal_privacy.profile_photo_migration_jobs j WHERE j.source_path = o.name);
  SELECT count(*) FILTER (WHERE j.status <> 'completed'), count(*) FILTER (WHERE j.status = 'completed'),
    v_quarantine + count(*) FILTER (WHERE j.status <> 'completed' AND j.partner_id IS NULL)
  INTO v_pending, v_completed, v_quarantine FROM internal_privacy.profile_photo_migration_jobs j;
  SELECT count(*) INTO v_public FROM storage.objects o
    WHERE o.bucket_id = 'documentos' AND public.profile_photo_partner_id(o.name) IS NOT NULL;
  RETURN jsonb_build_object('pending', v_new + v_pending, 'quarantineCandidates', v_quarantine,
    'completed', v_completed, 'publicSourcesRemaining', v_public);
END;
$$;

CREATE OR REPLACE FUNCTION public.profile_photo_migration_candidates(p_limit integer DEFAULT 10)
RETURNS TABLE(source_path text, target_path text, partner_id uuid, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT o.name AS source_path,
      CASE WHEN p.id IS NULL THEN 'quarentena/' || o.name ELSE o.name END AS target_path,
      p.id AS partner_id, 'new'::text AS status
    FROM storage.objects o
    LEFT JOIN public.parceiros p ON p.id = public.profile_photo_partner_id(o.name)
    WHERE o.bucket_id = 'documentos' AND public.profile_photo_partner_id(o.name) IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM internal_privacy.profile_photo_migration_jobs j
        WHERE j.source_path = o.name)
    UNION ALL
    SELECT j.source_path, j.target_path, j.partner_id, j.status
    FROM internal_privacy.profile_photo_migration_jobs j WHERE j.status <> 'completed'
  )
  SELECT c.source_path, c.target_path, c.partner_id, c.status
  FROM candidates c
  ORDER BY CASE WHEN c.status = 'finalized' THEN 1 ELSE 0 END, c.source_path
  LIMIT greatest(1, least(coalesce(p_limit, 10), 25));
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_profile_photo_migration(p_source_path text, p_actor_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_partner uuid; v_job internal_privacy.profile_photo_migration_jobs%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR p_actor_id IS NULL
    OR public.profile_photo_partner_id(p_source_path) IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) < 12 THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  SELECT j.* INTO v_job FROM internal_privacy.profile_photo_migration_jobs j
    WHERE j.source_path = p_source_path FOR UPDATE;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM storage.objects o
      WHERE o.bucket_id = 'documentos' AND o.name = p_source_path) THEN
      RAISE EXCEPTION 'Arquivo de origem não encontrado.' USING ERRCODE = '22023';
    END IF;
    SELECT p.id INTO v_partner FROM public.parceiros p
      WHERE p.id = public.profile_photo_partner_id(p_source_path);
    INSERT INTO internal_privacy.profile_photo_migration_jobs (
      source_path, target_path, partner_id, requested_by, reason
    ) VALUES (p_source_path,
      CASE WHEN v_partner IS NULL THEN 'quarentena/' || p_source_path ELSE p_source_path END,
      v_partner, p_actor_id, btrim(p_reason))
    ON CONFLICT (source_path) DO NOTHING;
    SELECT j.* INTO v_job FROM internal_privacy.profile_photo_migration_jobs j
      WHERE j.source_path = p_source_path FOR UPDATE;
  END IF;
  RETURN jsonb_build_object('sourcePath', v_job.source_path, 'targetPath', v_job.target_path,
    'partnerId', v_job.partner_id, 'status', v_job.status, 'sha256', v_job.sha256);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_profile_photo_migration(p_source_path text, p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  UPDATE internal_privacy.profile_photo_migration_jobs j
    SET status = 'verified', sha256 = p_sha256, verified_at = now()
    WHERE j.source_path = p_source_path AND j.status = 'prepared'
      AND EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'fotos-perfil' AND o.name = j.target_path);
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM internal_privacy.profile_photo_migration_jobs j
    WHERE j.source_path = p_source_path AND j.sha256 = p_sha256
      AND j.status IN ('verified', 'finalized', 'completed')) THEN
    RAISE EXCEPTION 'Cópia privada não verificada.' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_profile_photo_migration(p_source_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_job internal_privacy.profile_photo_migration_jobs%rowtype;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  SELECT j.* INTO v_job FROM internal_privacy.profile_photo_migration_jobs j
    WHERE j.source_path = p_source_path FOR UPDATE;
  IF NOT FOUND OR v_job.sha256 IS NULL OR v_job.status = 'prepared' THEN
    RAISE EXCEPTION 'Cópia privada não verificada.' USING ERRCODE = '22023';
  END IF;
  IF v_job.status IN ('finalized', 'completed') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = 'fotos-perfil' AND o.name = v_job.target_path) THEN
    RAISE EXCEPTION 'Cópia privada ausente.' USING ERRCODE = '22023';
  END IF;
  -- Somente a referência atual é atualizada. Snapshots históricos permanecem
  -- imutáveis; o filtro de validação/cliente resolve seus links legados.
  IF v_job.partner_id IS NOT NULL THEN
    UPDATE public.parceiros p SET foto_url = 'profile-photo://' || v_job.target_path
    WHERE p.id = v_job.partner_id
      AND public.canonical_private_profile_photo(p.foto_url) = 'profile-photo://' || v_job.source_path;
  END IF;
  UPDATE internal_privacy.profile_photo_migration_jobs SET status = 'finalized', finalized_at = now()
    WHERE source_path = p_source_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_profile_photo_migration(p_source_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Operação interna não autorizada.' USING ERRCODE = '42501';
  END IF;
  UPDATE internal_privacy.profile_photo_migration_jobs j SET status = 'completed', completed_at = now()
    WHERE j.source_path = p_source_path AND j.status = 'finalized'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'documentos' AND o.name = j.source_path)
      AND EXISTS (SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'fotos-perfil' AND o.name = j.target_path);
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM internal_privacy.profile_photo_migration_jobs j
    WHERE j.source_path = p_source_path AND j.status = 'completed') THEN
    RAISE EXCEPTION 'Migração ainda não concluída.' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_photo_migration_summary(), public.profile_photo_migration_candidates(integer),
  public.prepare_profile_photo_migration(text, uuid, text), public.verify_profile_photo_migration(text, text),
  public.finalize_profile_photo_migration(text), public.complete_profile_photo_migration(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_photo_migration_summary(), public.profile_photo_migration_candidates(integer),
  public.prepare_profile_photo_migration(text, uuid, text), public.verify_profile_photo_migration(text, text),
  public.finalize_profile_photo_migration(text), public.complete_profile_photo_migration(text)
  TO service_role;

COMMIT;
