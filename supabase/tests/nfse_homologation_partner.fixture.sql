CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','authenticated')$$;
CREATE TABLE public.test_authorization(actor uuid,context uuid,matrix uuid,allowed boolean);
CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid
LANGUAGE plpgsql STABLE AS $$DECLARE v_row public.test_authorization%ROWTYPE; BEGIN
  SELECT * INTO v_row FROM public.test_authorization;
  IF auth.uid() IS DISTINCT FROM v_row.actor OR auth.role()<>'authenticated' OR NOT v_row.allowed
    OR $1 IS DISTINCT FROM v_row.context OR $4 !~ '^2026-[0-9]{2}$' THEN
    RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF;
  RETURN v_row.matrix;
END$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,cnpj text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,cpf_cnpj text,tipo text,status text,polo_id uuid,polo_ids uuid[]);
CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,valor numeric,status text);
CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version int);
CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,cnpj text,not_before timestamptz,expires_at timestamptz,fingerprint text);
