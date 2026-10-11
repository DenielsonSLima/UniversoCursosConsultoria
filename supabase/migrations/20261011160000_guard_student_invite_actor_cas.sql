-- O checkpoint autoriza o despacho; o CAS final autoriza a escrita/entrega.
-- Não existe transação conjunta com Auth/HTTP nem cancelamento de envio aceito.
BEGIN;

CREATE OR REPLACE FUNCTION public.portal_atualizar_acesso_aluno_por_gestor_cas(
  p_actor_auth_user_id uuid,
  p_partner_id uuid,
  p_expected_snapshot jsonb,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_aluno public.parceiros%ROWTYPE;
  v_expected public.parceiros%ROWTYPE;
  v_patch public.parceiros%ROWTYPE;
  v_gestor public.usuarios_sistema%ROWTYPE;
  v_contexto jsonb;
  v_key text;
  v_auth_id uuid;
  v_assignments text;
  v_snapshot_keys constant text[] := ARRAY[
    'tipo', 'status', 'email', 'cpf_cnpj', 'polo_id', 'polo_ids', 'auth_user_id',
    'auth_login_email', 'acesso_status', 'troca_senha_obrigatoria',
    'senha_atualizada_em', 'senha_temporaria_pendente', 'senha_temporaria_emitida_em',
    'senha_temporaria_emissao_id', 'senha_temporaria_emissao_iniciada_em',
    'senha_temporaria_emissao_senha_alterada_em', 'acesso_ativado_em',
    'convite_enviado_em', 'aceitou_termos_uso', 'termos_uso_versao'
  ];
  v_patch_keys constant text[] := ARRAY[
    'auth_user_id', 'auth_login_email', 'troca_senha_obrigatoria', 'acesso_status',
    'acesso_erro', 'convite_enviado_em', 'acesso_ativado_em', 'senha_atualizada_em'
  ];
BEGIN
  -- Autoriza antes de expor o snapshot, inclusive para checkpoint/retry.
  v_contexto := public.portal_identidade_exigir_service_role_actor(p_actor_auth_user_id);
  IF p_partner_id IS NULL
    OR jsonb_typeof(p_expected_snapshot) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object'
    OR NOT (p_expected_snapshot ?& v_snapshot_keys)
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_expected_snapshot) key
      WHERE NOT (key = ANY(v_snapshot_keys)))
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) key
      WHERE NOT (key = ANY(v_patch_keys)))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PORTAL_CONVITE_CAS_PARAMETROS_INVALIDOS';
  END IF;
  BEGIN
    SELECT * INTO v_expected FROM jsonb_populate_record(NULL::public.parceiros, p_expected_snapshot);
    SELECT * INTO v_patch FROM jsonb_populate_record(NULL::public.parceiros, p_patch);
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PORTAL_CONVITE_CAS_PARAMETROS_INVALIDOS';
  END;

  SELECT aluno.* INTO v_aluno FROM public.parceiros aluno
  WHERE aluno.id = p_partner_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR v_aluno.tipo IS DISTINCT FROM 'Aluno' THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'PORTAL_CONVITE_CAS_ALUNO_ALTERADO';
  END IF;
  -- Evita espera/inversão com os triggers que propagam alterações do Auth.
  FOR v_auth_id IN SELECT DISTINCT identity_id FROM unnest(ARRAY[
    v_aluno.auth_user_id,
    CASE WHEN p_patch ? 'auth_user_id' THEN v_patch.auth_user_id ELSE NULL END
  ]) identity_id WHERE identity_id IS NOT NULL ORDER BY identity_id
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-temporary-password-auth:' || v_auth_id::text, 0))
      OR NOT pg_try_advisory_xact_lock(hashtextextended('portal-auth-identity:' || v_auth_id::text, 0)) THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'PORTAL_CONVITE_CAS_IDENTIDADE_OCUPADA';
    END IF;
  END LOOP;

  SELECT gestor.* INTO v_gestor FROM public.usuarios_sistema gestor
  WHERE gestor.auth_user_id = p_actor_auth_user_id
    AND coalesce(public.is_active_status(gestor.status), false)
  LIMIT 1 FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'GESTOR_PARCEIROS_NAO_AUTORIZADO';
  END IF;
  IF v_gestor.perfil_acesso_id IS NOT NULL THEN
    PERFORM 1 FROM public.perfis_acesso perfil
    WHERE perfil.id = v_gestor.perfil_acesso_id FOR SHARE NOWAIT;
  END IF;
  IF v_gestor.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM 1 FROM public.polos polo WHERE polo.id = v_gestor.context::uuid FOR SHARE NOWAIT;
  END IF;
  v_contexto := public.portal_identidade_exigir_service_role_actor(p_actor_auth_user_id);
  IF NOT public.portal_identidade_actor_pode_gerir_aluno(v_contexto, p_partner_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PORTAL_CONVITE_CAS_FORA_DO_ESCOPO';
  END IF;
  FOREACH v_key IN ARRAY v_snapshot_keys LOOP
    IF (to_jsonb(v_aluno) -> v_key) IS DISTINCT FROM (to_jsonb(v_expected) -> v_key) THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'PORTAL_CONVITE_CAS_ALUNO_ALTERADO';
    END IF;
  END LOOP;
  IF p_patch = '{}'::jsonb THEN
    RETURN to_jsonb(v_aluno); -- Nenhum UPDATE/trigger no checkpoint de despacho.
  END IF;

  -- Somente colunas presentes disparam os triggers UPDATE OF existentes.
  SELECT string_agg(format('%I = ($1::public.parceiros).%I', key, key), ', ' ORDER BY key)
  INTO v_assignments FROM jsonb_object_keys(p_patch) key;
  EXECUTE 'UPDATE public.parceiros SET ' || v_assignments || ' WHERE id = $2'
    USING v_patch, p_partner_id;
  -- Inclui também efeitos de AFTER triggers que fazem uma segunda escrita.
  SELECT aluno.* INTO v_aluno FROM public.parceiros aluno WHERE aluno.id = p_partner_id;
  RETURN to_jsonb(v_aluno);
END;
$function$;
REVOKE ALL ON FUNCTION public.portal_atualizar_acesso_aluno_por_gestor_cas(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_atualizar_acesso_aluno_por_gestor_cas(uuid, uuid, jsonb, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.portal_atualizar_acesso_aluno_por_gestor_cas(uuid, uuid, jsonb, jsonb) IS
  'CAS de acesso do aluno com ator/escopo fixados na transação; patch vazio é checkpoint sem escrita. Não cancela despacho externo já iniciado.';
COMMIT;
