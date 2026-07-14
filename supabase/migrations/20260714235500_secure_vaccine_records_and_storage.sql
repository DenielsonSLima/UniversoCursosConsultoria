-- Comprovantes vacinais privados e validação autoritativa por aluno/gestor.
-- Mantém somente paths privados no banco; a aplicação gera URLs assinadas curtas.

INSERT INTO storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) VALUES (
  'vacinas',
  'vacinas',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.aluno_vacinas
  DROP CONSTRAINT IF EXISTS aluno_vacinas_validado_por_fkey;
ALTER TABLE public.aluno_vacinas
  ADD CONSTRAINT aluno_vacinas_validado_por_fkey
  FOREIGN KEY (validado_por) REFERENCES public.usuarios_sistema(id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_manage_aluno_vacina(p_aluno_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parceiros p
    WHERE p.id = p_aluno_id
      AND p.tipo = 'Aluno'
      AND (
        public.is_gestor_global()
        OR (
          public.is_gestor()
          AND (
            p.polo_id = ANY(coalesce(
              public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
            ))
            OR EXISTS (
              SELECT 1
              FROM unnest(coalesce(p.polo_ids, ARRAY[]::uuid[])) scoped_polo(id)
              WHERE scoped_polo.id = ANY(coalesce(
                public.gestor_allowed_polo_ids(), ARRAY[]::uuid[]
              ))
            )
          )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.vacina_storage_aluno_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN split_part(coalesce(p_name, ''), '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN split_part(p_name, '/', 1)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.vacina_storage_curso_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN split_part(coalesce(p_name, ''), '/', 2)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN split_part(p_name, '/', 2)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_vacina_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.vacina_storage_aluno_id(p_name) IS NOT NULL
    AND public.vacina_storage_curso_id(p_name) IS NOT NULL
    AND (
      public.vacina_storage_aluno_id(p_name) = public.current_aluno_id()
      OR public.can_manage_aluno_vacina(public.vacina_storage_aluno_id(p_name))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_mutate_vacina_storage_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.vacina_storage_aluno_id(p_name) IS NOT NULL
    AND public.vacina_storage_curso_id(p_name) IS NOT NULL
    AND (
      public.can_manage_aluno_vacina(public.vacina_storage_aluno_id(p_name))
      OR (
        public.vacina_storage_aluno_id(p_name) = public.current_aluno_id()
        AND NOT EXISTS (
          SELECT 1
          FROM public.aluno_vacinas av
          WHERE av.aluno_id = public.vacina_storage_aluno_id(p_name)
            AND av.arquivo_url = p_name
            AND av.status = 'aprovado'
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_aluno_vacina(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vacina_storage_aluno_id(text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.vacina_storage_curso_id(text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_vacina_storage_object(text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_mutate_vacina_storage_object(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_aluno_vacina(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vacina_storage_aluno_id(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vacina_storage_curso_id(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_vacina_storage_object(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_mutate_vacina_storage_object(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "portal_vacinas_storage_select" ON storage.objects;
CREATE POLICY "portal_vacinas_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'vacinas'
    AND public.can_access_vacina_storage_object(name)
  );

DROP POLICY IF EXISTS "portal_vacinas_storage_insert" ON storage.objects;
CREATE POLICY "portal_vacinas_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vacinas'
    AND public.can_access_vacina_storage_object(name)
  );

DROP POLICY IF EXISTS "portal_vacinas_storage_update" ON storage.objects;
CREATE POLICY "portal_vacinas_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'vacinas'
    AND public.can_mutate_vacina_storage_object(name)
  )
  WITH CHECK (
    bucket_id = 'vacinas'
    AND public.can_mutate_vacina_storage_object(name)
  );

DROP POLICY IF EXISTS "portal_vacinas_storage_delete" ON storage.objects;
CREATE POLICY "portal_vacinas_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'vacinas'
    AND public.can_mutate_vacina_storage_object(name)
  );

DROP POLICY IF EXISTS "portal_aluno_vacinas_write" ON public.aluno_vacinas;
DROP POLICY IF EXISTS "portal_aluno_vacinas_select" ON public.aluno_vacinas;
DROP POLICY IF EXISTS "portal_aluno_vacinas_insert" ON public.aluno_vacinas;
DROP POLICY IF EXISTS "portal_aluno_vacinas_update" ON public.aluno_vacinas;
DROP POLICY IF EXISTS "portal_aluno_vacinas_delete" ON public.aluno_vacinas;

CREATE POLICY "portal_aluno_vacinas_select"
  ON public.aluno_vacinas FOR SELECT TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_manage_aluno_vacina(aluno_id)
  );

CREATE POLICY "portal_aluno_vacinas_insert"
  ON public.aluno_vacinas FOR INSERT TO authenticated
  WITH CHECK (
    aluno_id = public.current_aluno_id()
    OR public.can_manage_aluno_vacina(aluno_id)
  );

CREATE POLICY "portal_aluno_vacinas_update"
  ON public.aluno_vacinas FOR UPDATE TO authenticated
  USING (
    aluno_id = public.current_aluno_id()
    OR public.can_manage_aluno_vacina(aluno_id)
  )
  WITH CHECK (
    aluno_id = public.current_aluno_id()
    OR public.can_manage_aluno_vacina(aluno_id)
  );

CREATE POLICY "portal_aluno_vacinas_delete"
  ON public.aluno_vacinas FOR DELETE TO authenticated
  USING (
    public.can_manage_aluno_vacina(aluno_id)
    OR (aluno_id = public.current_aluno_id() AND status <> 'aprovado')
  );

CREATE OR REPLACE FUNCTION public.guard_aluno_vacinas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.aluno_vacinas%rowtype;
  v_service boolean := coalesce((SELECT auth.role()), '') = 'service_role';
  v_owner boolean;
  v_manager boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;
  v_owner := coalesce(
    v_row.aluno_id = (SELECT public.current_aluno_id()), false
  );
  v_manager := coalesce(
    (SELECT public.can_manage_aluno_vacina(v_row.aluno_id)), false
  );

  IF NOT v_service AND NOT v_owner AND NOT v_manager THEN
    RAISE EXCEPTION 'Sem permissão para alterar este registro vacinal.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF v_owner AND NOT v_manager AND OLD.status = 'aprovado' THEN
      RAISE EXCEPTION 'Comprovante aprovado não pode ser excluído pelo aluno.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.data_aplicacao IS NOT NULL
    AND NEW.data_aplicacao > (pg_catalog.timezone('America/Maceio', now()))::date THEN
    RAISE EXCEPTION 'A data de aplicação da vacina não pode estar no futuro.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.matricula_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.matriculas m
    JOIN public.turmas t ON t.id = m.turma_id
    WHERE m.id = NEW.matricula_id
      AND m.aluno_id = NEW.aluno_id
      AND t.curso_id = NEW.curso_id
      AND (NEW.turma_id IS NULL OR NEW.turma_id = m.turma_id)
  ) THEN
    RAISE EXCEPTION 'Matrícula, aluno, turma e curso do comprovante são incompatíveis.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.turma_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.turmas t
    WHERE t.id = NEW.turma_id AND t.curso_id = NEW.curso_id
  ) THEN
    RAISE EXCEPTION 'A turma não pertence ao curso informado.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.arquivo_url IS NOT NULL
    AND (
      public.vacina_storage_aluno_id(NEW.arquivo_url) IS DISTINCT FROM NEW.aluno_id
      OR public.vacina_storage_curso_id(NEW.arquivo_url) IS DISTINCT FROM NEW.curso_id
    ) THEN
    RAISE EXCEPTION 'O comprovante deve estar no diretório privado do aluno.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (
    NEW.aluno_id IS DISTINCT FROM OLD.aluno_id
    OR NEW.curso_id IS DISTINCT FROM OLD.curso_id
    OR NEW.matricula_id IS DISTINCT FROM OLD.matricula_id
    OR NEW.turma_id IS DISTINCT FROM OLD.turma_id
    OR NEW.vacina_codigo IS DISTINCT FROM OLD.vacina_codigo
    OR NEW.vacina_nome IS DISTINCT FROM OLD.vacina_nome
    OR NEW.dose_numero IS DISTINCT FROM OLD.dose_numero
    OR NEW.dose_label IS DISTINCT FROM OLD.dose_label
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'A identidade do registro vacinal é imutável.'
      USING ERRCODE = '42501';
  END IF;

  IF v_service THEN
    IF NEW.status IN ('aprovado', 'reprovado') THEN
      NEW.validado_por := internal_academic.resolve_responsavel(NEW.validado_por);
      IF NEW.validado_por IS NULL THEN
        RAISE EXCEPTION 'A validação de serviço exige um gestor responsável.';
      END IF;
      NEW.validado_em := now();
    ELSE
      NEW.validado_por := NULL;
      NEW.validado_em := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF v_manager THEN
    IF TG_OP = 'INSERT' THEN
      NEW.origem := 'secretaria';
    ELSE
      NEW.origem := OLD.origem;
    END IF;
    IF NEW.status IN ('aprovado', 'reprovado') THEN
      NEW.validado_por := internal_academic.resolve_responsavel(NULL);
      NEW.validado_em := now();
    ELSE
      NEW.validado_por := NULL;
      NEW.validado_em := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'em_analise' OR NEW.origem <> 'aluno'
      OR NEW.validado_por IS NOT NULL OR NEW.validado_em IS NOT NULL THEN
      RAISE EXCEPTION 'O aluno só pode enviar comprovante para análise.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.status = 'aprovado' THEN
      RAISE EXCEPTION 'Comprovante aprovado só pode ser alterado pela secretaria.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status <> 'em_analise' OR NEW.origem IS DISTINCT FROM OLD.origem THEN
      RAISE EXCEPTION 'O aluno não pode alterar validação, origem ou status do comprovante.'
        USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'reprovado' AND (
      NEW.validado_por IS DISTINCT FROM OLD.validado_por
      OR NEW.validado_em IS DISTINCT FROM OLD.validado_em
    ) THEN
      RAISE EXCEPTION 'O aluno não pode alterar os dados de validação do comprovante.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.origem := 'aluno';
  ELSE
    NEW.origem := OLD.origem;
  END IF;
  NEW.status := 'em_analise';
  NEW.observacao := NULL;
  NEW.validado_por := NULL;
  NEW.validado_em := NULL;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_aluno_vacinas()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_aluno_vacinas_trigger ON public.aluno_vacinas;
CREATE TRIGGER guard_aluno_vacinas_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.aluno_vacinas
  FOR EACH ROW EXECUTE FUNCTION public.guard_aluno_vacinas();
