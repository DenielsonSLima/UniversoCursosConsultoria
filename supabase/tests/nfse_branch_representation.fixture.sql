-- Offline boundaries: synthetic identities and explicit scope grants, never a live session.
ALTER TABLE public.polos ADD COLUMN company_id uuid,ADD COLUMN is_matriz boolean DEFAULT false;
CREATE TABLE public.test_scope_access(actor uuid,context uuid,polo_id uuid,allowed boolean DEFAULT true);
CREATE TABLE public.perfis_acesso(id uuid PRIMARY KEY,permissoes jsonb);
CREATE TABLE public.usuarios_sistema(id uuid PRIMARY KEY,auth_user_id uuid,perfil_acesso_id uuid,
  personalizar_permissoes boolean,permissoes jsonb);
CREATE OR REPLACE FUNCTION private.authorize_nfse_model_scope(uuid,uuid,text,text)
RETURNS void LANGUAGE plpgsql AS $$BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR $3 NOT IN('PRODUCAO','HOMOLOGACAO')
    OR $4 !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    OR NOT EXISTS(SELECT 1 FROM public.test_scope_access a JOIN public.polos p ON p.id=a.polo_id
      WHERE a.actor=auth.uid() AND a.context=$1 AND a.polo_id=$2 AND a.allowed
      AND public.is_active_status(p.status)) THEN
    RAISE EXCEPTION 'scope denied' USING ERRCODE='42501'; END IF;
END$$;
CREATE FUNCTION private.nfse_preset_partner_ids(jsonb) RETURNS TABLE(partner_id uuid)
LANGUAGE sql IMMUTABLE AS $$SELECT NULL::uuid WHERE false$$;
CREATE FUNCTION private.nfse_model_partner_label(uuid,uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$SELECT NULL::text$$;
CREATE FUNCTION private.nfse_queue_description(jsonb,text,text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$SELECT 'DESCRIÇÃO ACADÊMICA SINTÉTICA'::text$$;
