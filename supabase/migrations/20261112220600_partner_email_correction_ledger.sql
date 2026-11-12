BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE private.portal_partner_email_corrections (
  request_id uuid PRIMARY KEY,
  actor_auth_user_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  auth_user_id uuid NOT NULL,
  expected_email text,
  expected_auth_email text NOT NULL,
  new_email text NOT NULL,
  state text NOT NULL DEFAULT 'COMMITTED' CHECK (state IN ('COMMITTED','SENDING','SENT','FAILED','UNKNOWN')),
  delivery_nonce uuid,
  delivery_lease_until timestamptz,
  retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_partner_email_correction_auth_idx
  ON private.portal_partner_email_corrections(auth_user_id, delivery_lease_until)
  WHERE state IN ('SENDING','UNKNOWN');
ALTER TABLE private.portal_partner_email_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.portal_partner_email_corrections FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.partner_email_correction_in_scope(p_context jsonb, p_partner public.parceiros)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
  SELECT coalesce((p_context->>'allPolos')::boolean,false) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(coalesce(p_context->'poloIds','[]'::jsonb)) polo(id)
    WHERE polo.id::uuid = p_partner.polo_id OR polo.id::uuid = ANY(coalesce(p_partner.polo_ids,ARRAY[]::uuid[]))
  );
$$;
REVOKE ALL ON FUNCTION private.partner_email_correction_in_scope(jsonb,public.parceiros) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lock_partner_email_correction_context(p_actor uuid,p_partner uuid)
RETURNS public.parceiros LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE context jsonb; partner public.parceiros%ROWTYPE; gestor public.usuarios_sistema%ROWTYPE;
BEGIN
  context:=public.portal_identidade_exigir_service_role_actor(p_actor);
  SELECT * INTO partner FROM public.parceiros WHERE id=p_partner FOR UPDATE NOWAIT;
  IF NOT FOUND OR partner.tipo NOT IN ('Aluno','Professor') OR NOT coalesce(public.is_active_status(partner.status),false) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_NOT_ELIGIBLE' USING ERRCODE='55000';
  END IF;
  IF NOT private.partner_email_correction_in_scope(context,partner) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  IF partner.auth_user_id IS NULL THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_LINK_REQUIRED' USING ERRCODE='55000';
  END IF;
  -- Same lock order/fences as the existing identity and temporary-password RPCs.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-temporary-password-auth:'||partner.auth_user_id::text,0))
    OR NOT pg_try_advisory_xact_lock(hashtextextended('portal-auth-identity:'||partner.auth_user_id::text,0)) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_BUSY' USING ERRCODE='40001';
  END IF;
  SELECT * INTO gestor FROM public.usuarios_sistema WHERE auth_user_id=p_actor
    AND public.is_active_status(status) LIMIT 1 FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF gestor.perfil_acesso_id IS NOT NULL THEN
    PERFORM 1 FROM public.perfis_acesso WHERE id=gestor.perfil_acesso_id FOR SHARE NOWAIT;
  END IF;
  IF gestor.context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    PERFORM 1 FROM public.polos WHERE id=gestor.context::uuid FOR SHARE NOWAIT;
  END IF;
  context:=public.portal_identidade_exigir_service_role_actor(p_actor);
  IF NOT private.partner_email_correction_in_scope(context,partner) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_SCOPE_DENIED' USING ERRCODE='42501';
  END IF;
  RETURN partner;
END;
$$;
REVOKE ALL ON FUNCTION private.lock_partner_email_correction_context(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.require_partner_email_correction_pending(p_partner public.parceiros,p_user auth.users)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF coalesce(p_user.encrypted_password,'')<>'' OR p_user.last_sign_in_at IS NOT NULL
    OR p_user.deleted_at IS NOT NULL OR coalesce(p_user.is_sso_user,false) OR coalesce(p_user.is_anonymous,false)
    OR p_user.banned_until>clock_timestamp()
    OR p_partner.senha_atualizada_em IS NOT NULL OR p_partner.senha_institucional_criada_em IS NOT NULL
    OR NOT coalesce(p_partner.acesso_status IN ('sem_acesso','pendente','convite_enviado','erro'),false)
    OR coalesce(p_partner.senha_temporaria_pendente,false)
    OR p_partner.senha_temporaria_emissao_id IS NOT NULL
    OR p_partner.senha_temporaria_emissao_iniciada_em IS NOT NULL
    OR p_partner.senha_temporaria_emissao_senha_alterada_em IS NOT NULL
    OR (p_partner.tipo='Aluno' AND p_partner.troca_senha_obrigatoria IS DISTINCT FROM true)
    OR (p_partner.tipo='Professor' AND p_partner.primeiro_acesso_institucional_pendente IS DISTINCT FROM true)
    OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id=p_user.id)
    OR EXISTS(SELECT 1 FROM auth.refresh_tokens WHERE user_id=p_user.id::text)
    OR EXISTS(SELECT 1 FROM public.portal_identidade_institucional_senha_eventos WHERE auth_user_id=p_user.id)
    OR EXISTS(SELECT 1 FROM jsonb_each_text(coalesce(p_user.raw_app_meta_data,'{}'::jsonb)) marker
      WHERE marker.key IN ('universocc_temporary_password_issue_id','universocc_temporary_password_write_nonce',
        'universocc_responsavel_temporary_password_issue_id','universocc_responsavel_temporary_password_write_nonce')
        AND nullif(marker.value,'') IS NOT NULL) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_PENDING_FIRST_ACCESS_ONLY' USING ERRCODE='55000';
  END IF;
  IF NOT coalesce(public.is_valid_cpf(regexp_replace(coalesce(p_partner.cpf_cnpj,''),'[^0-9]','','g')),false)
    OR EXISTS(SELECT 1 FROM public.parceiros WHERE auth_user_id=p_user.id AND id<>p_partner.id)
    OR EXISTS(SELECT 1 FROM public.usuarios_sistema WHERE auth_user_id=p_user.id)
    OR EXISTS(SELECT 1 FROM public.responsaveis_legais WHERE auth_user_id=p_user.id)
    OR (SELECT count(*) FROM auth.identities WHERE user_id=p_user.id)<>1
    OR NOT EXISTS(SELECT 1 FROM auth.identities WHERE user_id=p_user.id AND provider='email'
      AND lower(nullif(btrim(identity_data->>'email'),''))=lower(btrim(p_user.email))) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_SHARED_OR_INVALID_IDENTITY' USING ERRCODE='55000';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.require_partner_email_correction_pending(public.parceiros,auth.users) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.clear_partner_email_correction_tokens(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Mirrors Auth ClearAllPendingTokens; never write encrypted_password or account identity.
  UPDATE auth.users SET confirmation_token='',confirmation_sent_at=NULL,recovery_token='',recovery_sent_at=NULL,
    email_change_token_new='',email_change_token_current='',email_change='',email_change_sent_at=NULL,
    email_change_confirm_status=0,phone_change='',phone_change_token='',phone_change_sent_at=NULL,
    reauthentication_token='',reauthentication_sent_at=NULL,updated_at=statement_timestamp()
  WHERE id=p_user;
  DELETE FROM auth.one_time_tokens WHERE user_id=p_user;
END;
$$;
REVOKE ALL ON FUNCTION private.clear_partner_email_correction_tokens(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
