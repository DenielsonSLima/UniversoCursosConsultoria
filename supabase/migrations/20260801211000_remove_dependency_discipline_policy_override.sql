BEGIN;

CREATE OR REPLACE FUNCTION public.remover_politica_dependencia_disciplina_secure(
  p_polo_id uuid,
  p_politica_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_policy public.politicas_cobranca_dependencia%ROWTYPE;
  v_today date := pg_catalog.timezone('America/Maceio', now())::date;
BEGIN
  IF p_polo_id IS NULL OR p_politica_id IS NULL THEN
    RAISE EXCEPTION 'Polo e política são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF coalesce((SELECT auth.role()), '') <> 'service_role'
    AND NOT (
      public.is_gestor_for_polo(p_polo_id)
      AND (
        public.gestor_has_tab('secretaria', 'dependencias-academicas')
        OR public.gestor_has_tab('secretaria', 'solicitacoes')
        OR public.gestor_has_financeiro_tab('receber')
      )
    )
  THEN
    RAISE EXCEPTION
      'Acesso à configuração financeira da dependência não autorizado.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'dependencia-politica-remocao:' || p_politica_id::text,
      0
    )
  );

  SELECT policy.*
  INTO v_policy
  FROM public.politicas_cobranca_dependencia policy
  WHERE policy.id = p_politica_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Regra de dependência não encontrada.'
      USING ERRCODE = '22023';
  END IF;

  IF v_policy.codigo <> 'DEPENDENCIA_DISCIPLINA'
    OR v_policy.disciplina_id IS NULL
    OR v_policy.polo_id IS DISTINCT FROM p_polo_id
  THEN
    RAISE EXCEPTION
      'Somente uma personalização de disciplina deste polo pode ser removida.'
      USING ERRCODE = '22023';
  END IF;

  IF v_policy.status = 'INATIVA' THEN
    RETURN jsonb_build_object(
      'removed', false,
      'replayed', true,
      'id', v_policy.id,
      'disciplinaId', v_policy.disciplina_id
    );
  END IF;

  UPDATE public.politicas_cobranca_dependencia policy
  SET
    status = 'INATIVA',
    vigencia_fim = greatest(policy.vigencia_inicio, v_today),
    updated_at = now()
  WHERE policy.id = v_policy.id;

  RETURN jsonb_build_object(
    'removed', true,
    'replayed', false,
    'id', v_policy.id,
    'disciplinaId', v_policy.disciplina_id,
    'fallback', 'REGRA_INSTITUCIONAL'
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.remover_politica_dependencia_disciplina_secure(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.remover_politica_dependencia_disciplina_secure(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION
  public.remover_politica_dependencia_disciplina_secure(uuid, uuid) IS
  'Inativa uma personalização versionada por disciplina e restaura a resolução pela faixa institucional, sem apagar o histórico financeiro.';

NOTIFY pgrst, 'reload schema';

COMMIT;
