BEGIN;
CREATE FUNCTION public.portal_correct_partner_email_internal(
  p_actor_auth_user_id uuid,p_partner_id uuid,p_request_id uuid,p_email text,
  p_expected_email text,p_expected_auth_user_id uuid,p_expected_auth_email text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE partner public.parceiros%ROWTYPE; usuario auth.users%ROWTYPE;
  operation private.portal_partner_email_corrections%ROWTYPE; gestor public.usuarios_sistema%ROWTYPE;
  target text:=lower(nullif(btrim(p_email),'')); contact text:=lower(nullif(btrim(p_expected_email),''));
  login text:=lower(nullif(btrim(p_expected_auth_email),''));
BEGIN
  -- Reauthorize before consulting even a replayed request ID.
  partner:=private.lock_partner_email_correction_context(p_actor_auth_user_id,p_partner_id);
  IF p_request_id IS NULL OR p_expected_auth_user_id IS NULL OR target IS NULL OR login IS NULL
    OR length(target)>254 OR target !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    OR target LIKE '%@acesso.universocc.invalid' THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO usuario FROM auth.users WHERE id=partner.auth_user_id FOR UPDATE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_IDENTITY_CHANGED' USING ERRCODE='40001'; END IF;
  SELECT * INTO operation FROM private.portal_partner_email_corrections WHERE request_id=p_request_id FOR UPDATE NOWAIT;
  IF FOUND THEN
    IF operation.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id OR operation.partner_id IS DISTINCT FROM p_partner_id
      OR operation.auth_user_id IS DISTINCT FROM p_expected_auth_user_id OR operation.expected_email IS DISTINCT FROM contact
      OR operation.expected_auth_email IS DISTINCT FROM login OR operation.new_email IS DISTINCT FROM target THEN
      RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_REQUEST_CONFLICT' USING ERRCODE='40001';
    END IF;
    IF partner.auth_user_id IS DISTINCT FROM operation.auth_user_id OR lower(btrim(usuario.email)) IS DISTINCT FROM target
      OR lower(nullif(btrim(partner.email),'')) IS DISTINCT FROM target
      OR lower(nullif(btrim(partner.auth_login_email),'')) IS DISTINCT FROM target THEN
      RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_IDENTITY_CHANGED' USING ERRCODE='40001';
    END IF;
    RETURN jsonb_build_object('userId',usuario.id,'email',target,'emailCorrected',true,'loginEmailChanged',true,
      'emailSent',operation.state='SENT','deliveryPending',operation.state<>'SENT','requestId',p_request_id);
  END IF;
  IF partner.auth_user_id IS DISTINCT FROM p_expected_auth_user_id OR lower(btrim(usuario.email)) IS DISTINCT FROM login
    OR lower(nullif(btrim(partner.email),'')) IS DISTINCT FROM contact
    OR lower(coalesce(nullif(btrim(partner.auth_login_email),''),usuario.email)) IS DISTINCT FROM login THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_IDENTITY_CHANGED' USING ERRCODE='40001';
  END IF;
  IF target=login THEN RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_NO_LOGIN_CHANGE' USING ERRCODE='22023'; END IF;
  PERFORM private.require_partner_email_correction_pending(partner,usuario);
  IF EXISTS(SELECT 1 FROM private.portal_partner_email_corrections
    WHERE auth_user_id=usuario.id AND state IN ('SENDING','UNKNOWN') AND delivery_lease_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_DELIVERY_BUSY' USING ERRCODE='40001';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-email-correction-email:'||target,0)) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_BUSY' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id<>usuario.id AND lower(btrim(email))=target)
    OR EXISTS(SELECT 1 FROM auth.identities WHERE user_id<>usuario.id AND lower(btrim(email))=target)
    OR EXISTS(SELECT 1 FROM public.parceiros WHERE id<>partner.id
      AND (lower(nullif(btrim(email),''))=target OR lower(nullif(btrim(auth_login_email),''))=target))
    OR EXISTS(SELECT 1 FROM public.usuarios_sistema WHERE lower(btrim(email))=target)
    OR EXISTS(SELECT 1 FROM public.responsaveis_legais WHERE lower(btrim(email))=target) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_EMAIL_IN_USE' USING ERRCODE='23505';
  END IF;
  PERFORM private.clear_partner_email_correction_tokens(usuario.id);
  UPDATE auth.identities SET identity_data=jsonb_set(jsonb_set(coalesce(identity_data,'{}'::jsonb),
    '{email}',to_jsonb(target),true),'{email_verified}','false'::jsonb,true),updated_at=statement_timestamp()
  WHERE user_id=usuario.id AND provider='email';
  UPDATE auth.users SET email=target,email_confirmed_at=NULL,
    raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{email_verified}','false'::jsonb,true),
    updated_at=statement_timestamp() WHERE id=usuario.id;
  UPDATE public.parceiros SET email=target,auth_login_email=target,email_validado_gestor_em=NULL,
    acesso_status='pendente',acesso_erro=NULL,convite_enviado_em=NULL,acesso_ativado_em=NULL,
    troca_senha_obrigatoria=CASE WHEN tipo='Aluno' THEN true ELSE troca_senha_obrigatoria END,
    updated_at=statement_timestamp() WHERE id=partner.id AND auth_user_id=usuario.id;
  -- Check effects of existing Auth/profile triggers without promoting first access.
  SELECT * INTO partner FROM public.parceiros WHERE id=p_partner_id;
  SELECT * INTO usuario FROM auth.users WHERE id=p_expected_auth_user_id;
  IF partner.auth_user_id IS DISTINCT FROM p_expected_auth_user_id OR lower(btrim(partner.email)) IS DISTINCT FROM target
    OR lower(btrim(partner.auth_login_email)) IS DISTINCT FROM target OR lower(btrim(usuario.email)) IS DISTINCT FROM target
    OR usuario.email_confirmed_at IS NOT NULL OR partner.email_validado_gestor_em IS NOT NULL THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_TRIGGER_CONFLICT' USING ERRCODE='40001';
  END IF;
  PERFORM private.require_partner_email_correction_pending(partner,usuario);
  INSERT INTO private.portal_partner_email_corrections(request_id,actor_auth_user_id,partner_id,auth_user_id,
    expected_email,expected_auth_email,new_email)
  VALUES(p_request_id,p_actor_auth_user_id,p_partner_id,usuario.id,contact,login,target);
  SELECT * INTO gestor FROM public.usuarios_sistema WHERE auth_user_id=p_actor_auth_user_id LIMIT 1;
  INSERT INTO public.sistema_eventos(actor_id,actor_nome,actor_email,actor_tipo,pessoa_id,pessoa_nome,pessoa_tipo,polo_id,
    modulo,entidade,entidade_id,acao,descricao,origem,detalhes)
  VALUES(gestor.id,gestor.nome,gestor.email,'Gestor',partner.id,partner.nome,partner.tipo,partner.polo_id,
    'Parceiros','parceiros',partner.id::text,'Corrigiu e-mail do primeiro acesso',
    'Corrigiu a identidade postal pendente, preservando UID, CPF e senha e invalidando links anteriores.',
    'Aplicativo',jsonb_build_object('requestId',p_request_id,'authUserId',usuario.id,'emailConfirmed',false));
  RETURN jsonb_build_object('userId',usuario.id,'email',target,'emailCorrected',true,'loginEmailChanged',true,
    'emailSent',false,'deliveryPending',true,'requestId',p_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_correct_partner_email_internal(uuid,uuid,uuid,text,text,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.portal_correct_partner_email_internal(uuid,uuid,uuid,text,text,uuid,text) TO service_role;
COMMIT;
