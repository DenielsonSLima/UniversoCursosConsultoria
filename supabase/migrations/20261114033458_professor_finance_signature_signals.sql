BEGIN;

-- Sinais sem valores, nomes ou conteúdo documental. A RLS da outbox mantém
-- a audiência do professor; a releitura usa as RPCs canônicas do portal.
CREATE FUNCTION portal_private.emit_professor_finance_scope(p_professor_id uuid, p_polo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_polo_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.parceiros WHERE id = p_professor_id AND tipo = 'Professor'
  ) THEN
    PERFORM public.insert_portal_realtime_signal(
      'portal:professor:' || p_professor_id::text || ':polo:' || p_polo_id::text || ':financeiro',
      'PROFESSOR_POLO', p_professor_id, p_polo_id);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION portal_private.emit_professor_finance_scope(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION portal_private.emit_professor_finance_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM portal_private.emit_professor_finance_scope(OLD.fornecedor_id, OLD.polo_id);
  END IF;
  IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT'
    OR (NEW.fornecedor_id,NEW.polo_id) IS DISTINCT FROM (OLD.fornecedor_id,OLD.polo_id)) THEN
    PERFORM portal_private.emit_professor_finance_scope(NEW.fornecedor_id, NEW.polo_id);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_private.emit_professor_finance_row()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER professor_finance_signal AFTER INSERT OR UPDATE OR DELETE
  ON public.despesas_lancamentos FOR EACH ROW EXECUTE FUNCTION portal_private.emit_professor_finance_row();
CREATE TRIGGER professor_payable_signal AFTER INSERT OR UPDATE OR DELETE
  ON public.contas_pagar FOR EACH ROW EXECUTE FUNCTION portal_private.emit_professor_finance_row();

CREATE FUNCTION portal_private.emit_professor_signature_scope(p_professor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.parceiros WHERE id = p_professor_id AND tipo = 'Professor') THEN
    PERFORM public.insert_portal_realtime_signal(
      'portal:professor:' || p_professor_id::text || ':assinaturas',
      'PROFESSOR', p_professor_id, NULL);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION portal_private.emit_professor_signature_scope(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION portal_private.emit_professor_signature_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_professor uuid;
BEGIN
  IF TG_TABLE_NAME IN ('assinatura_eletronica_participantes','assinaturas_pessoas') THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM portal_private.emit_professor_signature_scope(OLD.parceiro_id);
    END IF;
    IF TG_OP <> 'DELETE' AND (TG_OP = 'INSERT' OR NEW.parceiro_id IS DISTINCT FROM OLD.parceiro_id) THEN
      PERFORM portal_private.emit_professor_signature_scope(NEW.parceiro_id);
    END IF;
  ELSE
    FOR v_professor IN SELECT DISTINCT p.parceiro_id
      FROM public.assinatura_eletronica_participantes p
      WHERE p.envelope_id = NEW.id
    LOOP
      PERFORM portal_private.emit_professor_signature_scope(v_professor);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION portal_private.emit_professor_signature_row()
  FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER professor_signature_participant_signal AFTER INSERT OR UPDATE OR DELETE
  ON public.assinatura_eletronica_participantes FOR EACH ROW
  EXECUTE FUNCTION portal_private.emit_professor_signature_row();
CREATE TRIGGER professor_registered_signature_signal AFTER INSERT OR UPDATE OR DELETE
  ON public.assinaturas_pessoas FOR EACH ROW
  EXECUTE FUNCTION portal_private.emit_professor_signature_row();
CREATE TRIGGER professor_signature_envelope_signal AFTER UPDATE
  ON public.assinatura_eletronica_envelopes FOR EACH ROW
  EXECUTE FUNCTION portal_private.emit_professor_signature_row();

COMMIT;
