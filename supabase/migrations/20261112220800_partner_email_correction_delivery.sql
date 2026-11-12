BEGIN;
CREATE FUNCTION public.portal_partner_email_correction_delivery_internal(
  p_actor_auth_user_id uuid,p_partner_id uuid,p_request_id uuid,p_action text,
  p_delivery_nonce uuid DEFAULT NULL,p_sent boolean DEFAULT NULL,p_definitive_failure boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET statement_timeout='10s' AS $$
DECLARE partner public.parceiros%ROWTYPE; usuario auth.users%ROWTYPE;
  operation private.portal_partner_email_corrections%ROWTYPE; delay integer;
BEGIN
  partner:=private.lock_partner_email_correction_context(p_actor_auth_user_id,p_partner_id);
  IF p_action IS NULL OR p_action NOT IN ('CLAIM','FINISH') THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_INVALID_INPUT' USING ERRCODE='22023';
  END IF;
  SELECT * INTO usuario FROM auth.users WHERE id=partner.auth_user_id FOR UPDATE NOWAIT;
  SELECT * INTO operation FROM private.portal_partner_email_corrections WHERE request_id=p_request_id FOR UPDATE NOWAIT;
  IF NOT FOUND OR operation.partner_id IS DISTINCT FROM p_partner_id
    OR operation.actor_auth_user_id IS DISTINCT FROM p_actor_auth_user_id
    OR operation.auth_user_id IS DISTINCT FROM partner.auth_user_id
    OR lower(nullif(btrim(usuario.email),'')) IS DISTINCT FROM operation.new_email
    OR lower(nullif(btrim(partner.email),'')) IS DISTINCT FROM operation.new_email
    OR lower(nullif(btrim(partner.auth_login_email),'')) IS DISTINCT FROM operation.new_email THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_IDENTITY_CHANGED' USING ERRCODE='40001';
  END IF;
  IF p_action='FINISH' THEN
    IF operation.state='SENT' THEN
      RETURN jsonb_build_object('emailSent',true,'deliveryPending',false);
    END IF;
    IF operation.state<>'SENDING' OR p_delivery_nonce IS NULL
      OR p_delivery_nonce IS DISTINCT FROM operation.delivery_nonce OR p_sent IS NULL OR p_definitive_failure IS NULL THEN
      RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_DELIVERY_CHANGED' USING ERRCODE='40001';
    END IF;
    UPDATE private.portal_partner_email_corrections SET state=CASE WHEN p_sent THEN 'SENT'
        WHEN p_definitive_failure THEN 'FAILED' ELSE 'UNKNOWN' END,
      delivered_at=CASE WHEN p_sent THEN clock_timestamp() ELSE NULL END,
      delivery_lease_until=CASE WHEN p_sent OR p_definitive_failure THEN NULL ELSE clock_timestamp()+interval '120 seconds' END,
      retry_at=CASE WHEN p_sent THEN NULL ELSE clock_timestamp()+interval '120 seconds' END,updated_at=now()
    WHERE request_id=p_request_id;
    IF p_sent AND partner.acesso_status<>'ativo' AND partner.senha_atualizada_em IS NULL THEN
      UPDATE public.parceiros SET convite_enviado_em=clock_timestamp(),
        acesso_status='convite_enviado',acesso_erro=NULL,updated_at=statement_timestamp()
      WHERE id=partner.id;
    END IF;
    RETURN jsonb_build_object('emailSent',p_sent,'deliveryPending',NOT p_sent,
      'retryAfterSeconds',CASE WHEN p_sent THEN 0 ELSE 120 END);
  END IF;
  IF operation.state='SENT' THEN
    RETURN jsonb_build_object('claimed',false,'emailSent',true,'deliveryPending',false);
  END IF;
  delay:=greatest(0,ceil(extract(epoch FROM greatest(operation.retry_at,operation.delivery_lease_until)-clock_timestamp()))::integer);
  IF delay>0 THEN
    RETURN jsonb_build_object('claimed',false,'emailSent',false,'deliveryPending',true,'retryAfterSeconds',delay);
  END IF;
  PERFORM private.require_partner_email_correction_pending(partner,usuario);
  IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-email-correction-email:'||operation.new_email,0)) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_BUSY' USING ERRCODE='40001';
  END IF;
  IF EXISTS(SELECT 1 FROM public.parceiros WHERE id<>partner.id
      AND (auth_user_id=usuario.id OR lower(nullif(btrim(email),''))=operation.new_email
        OR lower(nullif(btrim(auth_login_email),''))=operation.new_email))
    OR EXISTS(SELECT 1 FROM public.usuarios_sistema WHERE auth_user_id=usuario.id OR lower(btrim(email))=operation.new_email)
    OR EXISTS(SELECT 1 FROM public.responsaveis_legais WHERE auth_user_id=usuario.id OR lower(btrim(email))=operation.new_email)
    OR EXISTS(SELECT 1 FROM auth.users WHERE id<>usuario.id AND lower(btrim(email))=operation.new_email)
    OR EXISTS(SELECT 1 FROM auth.identities WHERE user_id<>usuario.id AND lower(btrim(email))=operation.new_email)
    OR EXISTS(SELECT 1 FROM private.portal_partner_email_corrections WHERE auth_user_id=usuario.id
      AND request_id<>p_request_id AND state IN ('SENDING','UNKNOWN') AND delivery_lease_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_DELIVERY_BUSY' USING ERRCODE='40001';
  END IF;
  -- A bounded retry rotates previous recovery/confirmation links before dispatching to the same verified binding.
  PERFORM private.clear_partner_email_correction_tokens(usuario.id);
  UPDATE private.portal_partner_email_corrections SET state='SENDING',delivery_nonce=gen_random_uuid(),
    delivery_lease_until=clock_timestamp()+interval '120 seconds',retry_at=NULL,updated_at=now()
  WHERE request_id=p_request_id RETURNING * INTO operation;
  RETURN jsonb_build_object('claimed',true,'emailSent',false,'deliveryPending',true,
    'userId',usuario.id,'email',operation.new_email,'deliveryNonce',operation.delivery_nonce);
END;
$$;
REVOKE ALL ON FUNCTION public.portal_partner_email_correction_delivery_internal(uuid,uuid,uuid,text,uuid,boolean,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.portal_partner_email_correction_delivery_internal(uuid,uuid,uuid,text,uuid,boolean,boolean) TO service_role;

CREATE FUNCTION private.guard_partner_email_correction_delivery()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb:='{}'::jsonb; after_row jsonb:='{}'::jsonb;
  ids uuid[]:=ARRAY[]::uuid[]; emails text[]:=ARRAY[]::text[]; identity uuid; address text;
  guarded_partner_id uuid;
BEGIN
  IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
  IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
  IF TG_TABLE_SCHEMA='auth' AND TG_TABLE_NAME='users' THEN
    IF TG_OP='UPDATE' AND before_row->>'email' IS NOT DISTINCT FROM after_row->>'email' THEN RETURN NEW; END IF;
    ids:=ARRAY[(before_row->>'id')::uuid,(after_row->>'id')::uuid];
    emails:=ARRAY[before_row->>'email',after_row->>'email'];
  ELSIF TG_TABLE_SCHEMA='auth' THEN
    IF TG_OP='UPDATE' AND before_row->>'user_id' IS NOT DISTINCT FROM after_row->>'user_id'
      AND before_row->>'provider' IS NOT DISTINCT FROM after_row->>'provider'
      AND before_row#>>'{identity_data,email}' IS NOT DISTINCT FROM after_row#>>'{identity_data,email}' THEN RETURN NEW; END IF;
    ids:=ARRAY[(before_row->>'user_id')::uuid,(after_row->>'user_id')::uuid];
    emails:=ARRAY[before_row#>>'{identity_data,email}',after_row#>>'{identity_data,email}'];
  ELSE
    IF TG_OP='UPDATE' AND before_row->>'auth_user_id' IS NOT DISTINCT FROM after_row->>'auth_user_id'
      AND before_row->>'email' IS NOT DISTINCT FROM after_row->>'email'
      AND before_row->>'auth_login_email' IS NOT DISTINCT FROM after_row->>'auth_login_email'
      AND before_row->>'cpf_cnpj' IS NOT DISTINCT FROM after_row->>'cpf_cnpj'
      AND before_row->>'cpf' IS NOT DISTINCT FROM after_row->>'cpf'
      AND before_row->>'cpf_normalizado' IS NOT DISTINCT FROM after_row->>'cpf_normalizado'
      AND before_row->>'tipo' IS NOT DISTINCT FROM after_row->>'tipo' THEN RETURN NEW; END IF;
    ids:=ARRAY[(before_row->>'auth_user_id')::uuid,(after_row->>'auth_user_id')::uuid];
    emails:=ARRAY[before_row->>'email',after_row->>'email',before_row->>'auth_login_email',after_row->>'auth_login_email'];
    IF TG_TABLE_NAME='parceiros' THEN guarded_partner_id:=coalesce((after_row->>'id')::uuid,(before_row->>'id')::uuid); END IF;
  END IF;
  SELECT array_agg(DISTINCT lower(nullif(btrim(value),''))) INTO emails FROM unnest(emails) value;
  FOR identity IN SELECT DISTINCT value FROM unnest(ids) value WHERE value IS NOT NULL ORDER BY value LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended('portal-temporary-password-auth:'||identity::text,0))
      OR NOT pg_try_advisory_xact_lock(hashtextextended('portal-auth-identity:'||identity::text,0)) THEN
      RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_BUSY' USING ERRCODE='40001';
    END IF;
  END LOOP;
  FOR address IN SELECT DISTINCT lower(nullif(btrim(value),'')) FROM unnest(emails) value ORDER BY 1 LOOP
    IF address IS NOT NULL AND NOT pg_try_advisory_xact_lock(hashtextextended('portal-email-correction-email:'||address,0)) THEN
      RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_BUSY' USING ERRCODE='40001';
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM private.portal_partner_email_corrections operation
    WHERE operation.state IN ('SENDING','UNKNOWN') AND operation.delivery_lease_until>clock_timestamp()
      AND (operation.auth_user_id=ANY(ids)
        OR (operation.new_email=ANY(emails) AND operation.partner_id IS DISTINCT FROM guarded_partner_id))) THEN
    RAISE EXCEPTION 'PARTNER_EMAIL_CORRECTION_DELIVERY_BUSY' USING ERRCODE='40001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_partner_email_correction_delivery() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER a03_guard_email_correction_delivery BEFORE INSERT OR UPDATE OR DELETE ON public.parceiros
  FOR EACH ROW EXECUTE FUNCTION private.guard_partner_email_correction_delivery();
CREATE TRIGGER a03_guard_email_correction_delivery BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios_sistema
  FOR EACH ROW EXECUTE FUNCTION private.guard_partner_email_correction_delivery();
CREATE TRIGGER a03_guard_email_correction_delivery BEFORE INSERT OR UPDATE OR DELETE ON public.responsaveis_legais
  FOR EACH ROW EXECUTE FUNCTION private.guard_partner_email_correction_delivery();
CREATE TRIGGER a03_guard_email_correction_delivery BEFORE INSERT OR UPDATE OF email OR DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.guard_partner_email_correction_delivery();
CREATE TRIGGER a03_guard_email_correction_delivery BEFORE INSERT OR UPDATE OR DELETE ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION private.guard_partner_email_correction_delivery();
NOTIFY pgrst,'reload schema';
COMMIT;
