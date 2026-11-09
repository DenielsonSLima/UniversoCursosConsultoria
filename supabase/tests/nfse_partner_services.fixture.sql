CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA private; CREATE SCHEMA internal_finance; CREATE SCHEMA internal_proesc;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$SELECT nullif(current_setting('test.actor',true),'')::uuid$$;
CREATE TABLE public.test_context(id uuid PRIMARY KEY,actor uuid,allowed boolean,all_polos boolean,polos uuid[]);
CREATE FUNCTION public.get_nfse_access_secure(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT EXISTS(SELECT 1 FROM public.test_context WHERE id=$1 AND actor=auth.uid() AND allowed)$$;
CREATE FUNCTION public.portal_listar_perfis() RETURNS TABLE(role text,"contextId" uuid,"allPolos" boolean,"poloIds" uuid[])
  LANGUAGE sql STABLE AS $$SELECT 'GESTOR',id,all_polos,polos FROM public.test_context WHERE actor=auth.uid()$$;
CREATE FUNCTION public.is_active_status(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS
  $$SELECT lower($1) IN ('ativo','active')$$;
CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT auth.uid() IS NOT NULL AND $1::text=current_setting('test.polo',true)$$;
CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS
  $$SELECT $1='outros-creditos' AND current_setting('test.finance',true)='true'$$;
CREATE TABLE public.polos(id uuid PRIMARY KEY,status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY,nome text,nome_fantasia text,cpf_cnpj text,
  tipo text,status text,polo_id uuid,polo_ids uuid[]);
CREATE TABLE public.categorias_financeiras(id uuid PRIMARY KEY,nome text,tipo text,status text);
CREATE TABLE public.usuarios_sistema(auth_user_id uuid PRIMARY KEY,perfil text,status text);
CREATE TABLE public.contas_receber(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),polo_id uuid,cliente_id uuid,descricao text NOT NULL,
  valor numeric NOT NULL,data_vencimento date NOT NULL,status text NOT NULL,categoria text,
  categoria_financeira_id uuid,tipo_lancamento text,origem_pagamento text,
  matricula_id uuid,turma_id uuid,origem_cronograma_id text,data_pagamento date,valor_pago numeric,
  forma_pagamento text,gateway_provider text,gateway_payment_id text,gateway_payment_method text,
  gateway_submission_status text,manual_settlement_id uuid,created_at timestamptz DEFAULT now());
CREATE TABLE public.inscricoes_online(receivable_id uuid);
CREATE TABLE public.matricula_dependencia_cobrancas(conta_receber_id uuid);
CREATE TABLE internal_proesc.obligation_links(receivable_id uuid);
CREATE TABLE public.convenios_financeiros_creditos(conta_receber_id uuid);
