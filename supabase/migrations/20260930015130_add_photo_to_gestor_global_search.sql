-- Exibe a foto canônica do parceiro na busca global sem ampliar o escopo autorizado.

BEGIN;

DROP FUNCTION IF EXISTS public.search_gestor_global_entities_secure(text, integer);

CREATE FUNCTION public.search_gestor_global_entities_secure(
  p_search text,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  partner_id uuid,
  entity_type text,
  entity_name text,
  document_number text,
  entity_status text,
  photo_url text,
  polo_id uuid,
  polo_name text,
  polo_city text,
  polo_state text,
  class_id uuid,
  class_name text,
  class_code text,
  other_classes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_search text := lower(extensions.unaccent(trim(coalesce(p_search, ''))));
  v_digits text := pg_catalog.regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  v_document_search boolean := pg_catalog.regexp_replace(
    coalesce(p_search, ''),
    '[0-9[:space:]./()-]',
    '',
    'g'
  ) = '';
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 20);
  v_is_service_role boolean := coalesce((select auth.role()), '') = 'service_role';
  v_allowed_polo_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF NOT v_is_service_role AND NOT public.gestor_has_module('parceiros') THEN
    RAISE EXCEPTION 'Acesso negado a busca global de parceiros.'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(v_search) < 2 THEN
    RETURN;
  END IF;

  IF NOT v_is_service_role THEN
    v_allowed_polo_ids := coalesce(
      public.gestor_allowed_polo_ids(),
      ARRAY[]::uuid[]
    );
  END IF;

  RETURN QUERY
  WITH allowed_polos AS (
    SELECT polo.id, polo.nome, polo.cidade, polo.estado
    FROM public.polos polo
    WHERE lower(coalesce(polo.status, 'ativo')) = 'ativo'
      AND (
        v_is_service_role
        OR polo.id = ANY(v_allowed_polo_ids)
      )
  ),
  scoped_partners AS (
    SELECT
      partner.id,
      partner.tipo,
      partner.nome,
      partner.cpf_cnpj,
      partner.status,
      partner.foto_url,
      partner.created_at,
      allowed.id AS scoped_polo_id,
      allowed.nome AS scoped_polo_name,
      allowed.cidade AS scoped_polo_city,
      allowed.estado AS scoped_polo_state
    FROM public.parceiros partner
    JOIN allowed_polos allowed
      ON allowed.id = partner.polo_id
      OR allowed.id = ANY(coalesce(partner.polo_ids, ARRAY[]::uuid[]))
    WHERE partner.tipo IN ('Aluno', 'Professor', 'PF', 'PJ')
      AND (
        v_is_service_role
        OR public.is_partner_in_gestor_read_scope(partner.polo_id, partner.polo_ids)
      )

    UNION ALL

    SELECT
      partner.id,
      partner.tipo,
      partner.nome,
      partner.cpf_cnpj,
      partner.status,
      partner.foto_url,
      partner.created_at,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::text
    FROM public.parceiros partner
    WHERE partner.tipo IN ('PF', 'PJ')
      AND partner.polo_id IS NULL
      AND cardinality(coalesce(partner.polo_ids, ARRAY[]::uuid[])) = 0
      AND (v_is_service_role OR public.is_gestor_global())
      AND (
        v_is_service_role
        OR public.is_partner_in_gestor_read_scope(partner.polo_id, partner.polo_ids)
      )
  ),
  matched_partners AS (
    SELECT
      scoped.*,
      lower(extensions.unaccent(scoped.nome)) AS normalized_name,
      pg_catalog.regexp_replace(coalesce(scoped.cpf_cnpj, ''), '[^0-9]', '', 'g') AS document_digits
    FROM scoped_partners scoped
    WHERE pg_catalog.strpos(lower(extensions.unaccent(scoped.nome)), v_search) > 0
      OR (
        v_document_search
        AND pg_catalog.char_length(v_digits) >= 2
        AND pg_catalog.strpos(
          pg_catalog.regexp_replace(coalesce(scoped.cpf_cnpj, ''), '[^0-9]', '', 'g'),
          v_digits
        ) > 0
      )
  )
  SELECT
    matched.id AS partner_id,
    matched.tipo AS entity_type,
    matched.nome AS entity_name,
    matched.cpf_cnpj AS document_number,
    matched.status AS entity_status,
    matched.foto_url AS photo_url,
    matched.scoped_polo_id AS polo_id,
    matched.scoped_polo_name AS polo_name,
    matched.scoped_polo_city AS polo_city,
    matched.scoped_polo_state::text AS polo_state,
    class_result.turma_id AS class_id,
    class_result.turma_nome AS class_name,
    class_result.turma_codigo AS class_code,
    coalesce(class_result.other_classes, 0) AS other_classes
  FROM matched_partners matched
  LEFT JOIN LATERAL (
    SELECT
      classes.turma_id,
      classes.turma_nome,
      classes.turma_codigo,
      greatest(pg_catalog.count(*) OVER () - 1, 0)::integer AS other_classes
    FROM (
      SELECT
        turma.id AS turma_id,
        turma.nome AS turma_nome,
        turma.codigo AS turma_codigo,
        min(CASE
          WHEN upper(coalesce(matricula.status, '')) IN ('ATIVO', 'EM_ANDAMENTO') THEN 0
          ELSE 1
        END) AS class_priority,
        max(coalesce(matricula.data_matricula, turma.created_at)) AS class_date
      FROM public.matriculas matricula
      JOIN public.turmas turma ON turma.id = matricula.turma_id
      WHERE matched.tipo = 'Aluno'
        AND matricula.aluno_id = matched.id
        AND turma.polo_id = matched.scoped_polo_id
        AND public.gestor_can_read_academic_roster(turma.id)
      GROUP BY turma.id, turma.nome, turma.codigo

      UNION ALL

      SELECT DISTINCT
        turma.id,
        turma.nome,
        turma.codigo,
        CASE WHEN upper(coalesce(turma.status, '')) = 'EM_ANDAMENTO' THEN 0 ELSE 1 END,
        turma.created_at
      FROM public.turmas_disciplinas turma_disciplina
      JOIN public.turmas turma ON turma.id = turma_disciplina.turma_id
      WHERE matched.tipo = 'Professor'
        AND turma_disciplina.professor_id = matched.id
        AND turma.polo_id = matched.scoped_polo_id
        AND public.gestor_can_read_diario_results(turma.id)
    ) classes
    ORDER BY classes.class_priority, classes.class_date DESC NULLS LAST, classes.turma_nome
    LIMIT 1
  ) class_result ON true
  ORDER BY
    CASE
      WHEN v_document_search AND matched.document_digits = v_digits THEN 0
      WHEN matched.normalized_name = v_search THEN 1
      WHEN pg_catalog.left(matched.normalized_name, pg_catalog.char_length(v_search)) = v_search THEN 2
      WHEN v_document_search
        AND pg_catalog.left(matched.document_digits, pg_catalog.char_length(v_digits)) = v_digits THEN 3
      ELSE 4
    END,
    matched.nome,
    matched.scoped_polo_name NULLS LAST,
    matched.created_at DESC
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.search_gestor_global_entities_secure(text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_gestor_global_entities_secure(text, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.search_gestor_global_entities_secure(text, integer) IS
  'Busca parceiros com foto em todos os polos autorizados do gestor, sem aceitar escopo informado pelo cliente; turma e polo seguem as guardas academicas canonicas.';

COMMIT;
