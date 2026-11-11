CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_context(id uuid PRIMARY KEY,actor uuid,allowed boolean,all_polos boolean,polos uuid[]);
CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
  LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
  $$SELECT lower($1) IN ('ativo','active')$$;
CREATE TABLE public.empresas(id uuid PRIMARY KEY,cnpj text,razao_social text,
  endereco text,numero text,complemento text,bairro text,cidade text,uf text,cep text,telefone text,email text);
CREATE TABLE public.polos(id uuid PRIMARY KEY,company_id uuid REFERENCES public.empresas(id),status text,
  cnpj text,nome text,endereco text,numero text,complemento text,bairro text,cidade text,estado text,cep text,
  telefone text,email text);
