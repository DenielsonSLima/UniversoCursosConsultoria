BEGIN;

-- Enriquece o contrato do workspace com dimensões canônicas de filtro.
-- A função anterior permanece responsável pela seleção e pelas regras de
-- diário aberto/fechado; esta fachada apenas hidrata modalidade e turma.
ALTER FUNCTION public.get_secretaria_dependencias_workspace_secure(uuid, text)
RENAME TO p3_get_secretaria_dependencias_workspace_secure_20260731;

REVOKE ALL ON FUNCTION
  public.p3_get_secretaria_dependencias_workspace_secure_20260731(uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_secretaria_dependencias_workspace_secure(
  p_polo_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_workspace jsonb;
  v_dependencies jsonb;
BEGIN
  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND (
      NOT (
        public.gestor_has_tab(
          'secretaria',
          'dependencias-academicas'
        )
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
      )
      OR (
        p_polo_id IS NOT NULL
        AND NOT public.is_gestor_for_polo(p_polo_id)
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso ao workspace de dependências não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_workspace :=
    public.p3_get_secretaria_dependencias_workspace_secure_20260731(
      p_polo_id,
      p_search
    );

  SELECT coalesce(
    jsonb_agg(
      dependency.item
        || jsonb_build_object(
          'modalidade',
          coalesce(
            curso.modalidade,
            nullif(dependency.item ->> 'modalidade', ''),
            'TECNICO'
          ),
          'turmaOrigemId',
          coalesce(
            turma.id::text,
            nullif(dependency.item ->> 'turmaOrigemId', '')
          )
        )
      ORDER BY
        dependency.item ->> 'alunoNome',
        dependency.item ->> 'disciplinaNome'
    ),
    '[]'::jsonb
  )
  INTO v_dependencies
  FROM jsonb_array_elements(
    coalesce(v_workspace -> 'dependencias', '[]'::jsonb)
  ) AS dependency(item)
  LEFT JOIN public.matriculas matricula
    ON matricula.id = nullif(
      dependency.item ->> 'matriculaId',
      ''
    )::uuid
  LEFT JOIN public.turmas turma
    ON turma.id = matricula.turma_id
  LEFT JOIN public.cursos curso
    ON curso.id = turma.curso_id;

  RETURN jsonb_set(
    v_workspace,
    '{dependencias}',
    v_dependencies,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION
  public.get_secretaria_dependencias_workspace_secure(uuid, text)
IS
  'Workspace acadêmico seguro com dimensões canônicas de modalidade, curso e turma; prévias de diário aberto permanecem não acionáveis.';

COMMIT;
