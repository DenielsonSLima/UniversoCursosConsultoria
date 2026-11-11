CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA vault;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
  $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','authenticated')$$;
CREATE TABLE public.test_authorization(actor uuid,context uuid,matrix uuid,allowed boolean);
CREATE FUNCTION private.authorize_nfse_configuration_scope(uuid,uuid,text,text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v public.test_authorization%ROWTYPE; BEGIN SELECT * INTO v FROM public.test_authorization;
  IF auth.uid() IS DISTINCT FROM v.actor OR auth.role()<>'authenticated' OR NOT v.allowed
    OR $1 IS DISTINCT FROM v.context OR $4 !~ '^2026-[0-9]{2}$' THEN
    RAISE EXCEPTION 'denied' USING ERRCODE='42501'; END IF; RETURN v.matrix; END$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,cnpj text,status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,cpf_cnpj text,tipo text,status text,polo_id uuid,polo_ids uuid[],
  endereco text,numero text,complemento text,bairro text,cidade text,uf text,cep text);
CREATE TABLE private.nfse_models(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,environment text,definition jsonb,
  version int,created_by uuid,updated_by uuid);
CREATE TABLE private.nfse_configurations(polo_id uuid,environment text,credential_polo_id uuid,definition jsonb,version int,
  updated_by uuid,PRIMARY KEY(polo_id,environment));
CREATE TABLE private.nfse_certificates(polo_id uuid,environment text,vault_secret_id uuid,cnpj text,not_before timestamptz,
  expires_at timestamptz,fingerprint text,updated_by uuid,PRIMARY KEY(polo_id,environment));
CREATE TABLE vault.decrypted_secrets(id uuid,name text,decrypted_secret text);
CREATE FUNCTION private.nfse_issuer_preparation_snapshot(uuid) RETURNS jsonb LANGUAGE sql STABLE AS
  $$SELECT jsonb_build_object('cnpj',cnpj,'name','EMITENTE SINTÉTICO','legalName',null,'address',null) FROM public.polos WHERE id=$1$$;
CREATE FUNCTION private.render_nfse_model_description(text,text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT $1$$;
CREATE TABLE public.contas_receber(id uuid PRIMARY KEY,valor numeric,status text);
