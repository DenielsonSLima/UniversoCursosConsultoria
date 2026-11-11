-- Synthetic authorization and public catalogs for an isolated pre-model contract.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_context(id uuid PRIMARY KEY,actor uuid,allowed boolean,all_polos boolean,polos uuid[]);
CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
  LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1='ativo'$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,tipo text,status text,polo_id uuid,polo_ids uuid[]);
CREATE TABLE public.catalogo_paises_nacionalidades(codigo_iso3 text,pais text,ativo boolean);
INSERT INTO public.catalogo_paises_nacionalidades VALUES
  ('BRA','Brasil',true),('PRT','Portugal',true),('USA','Estados Unidos',true),('ZZZ','País inativo sintético',false);
CREATE TABLE public.catalogo_municipios_ibge(codigo_ibge text,nome text,uf text,ativo boolean);
INSERT INTO public.catalogo_municipios_ibge VALUES
  ('3550308','São Paulo','SP',true),('3304557','Rio de Janeiro','RJ',true),('9999999','Município inativo sintético','ZZ',false);
