CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA internal_finance;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $function$
  SELECT nullif(current_setting('test.uid', true), '')::uuid;
$function$;
CREATE FUNCTION public.is_financeiro_for_polo(p_polo_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT auth.uid() IS NOT NULL AND p_polo_id::text = current_setting('test.polo', true);
$function$;
CREATE FUNCTION public.gestor_has_effective_financeiro_tab(p_tab text)
RETURNS boolean LANGUAGE sql STABLE AS $function$
  SELECT p_tab = 'outros-creditos' AND current_setting('test.tab', true) = 'true';
$function$;
CREATE TABLE public.polos(id uuid PRIMARY KEY, status text);
CREATE TABLE public.parceiros(id uuid PRIMARY KEY, nome text, status text, polo_id uuid, polo_ids uuid[]);
CREATE TABLE public.categorias_financeiras(id uuid PRIMARY KEY, tipo text, status text);
CREATE TABLE public.usuarios_sistema(auth_user_id uuid PRIMARY KEY, perfil text, status text);
CREATE TABLE public.contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), polo_id uuid, cliente_id uuid,
  descricao text NOT NULL, valor numeric NOT NULL, data_vencimento date NOT NULL,
  status text NOT NULL, categoria text, categoria_financeira_id uuid,
  tipo_lancamento text, parcela_numero integer, origem_pagamento text,
  forma_pagamento text, gateway_payment_method text,
  matricula_id uuid, turma_id uuid, origem_cronograma_id text,
  regra_financeira_tecnica_snapshot jsonb, regra_financeira_plano_unico_snapshot jsonb,
  regra_financeira_dependencia_snapshot jsonb, regra_financeira_renegociacao_snapshot jsonb,
  gateway_provider text, gateway_financial_terms jsonb, gateway_financial_terms_confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contas_receber_tipo_lancamento_check CHECK (tipo_lancamento IS NULL
    OR tipo_lancamento IN ('MATRICULA','PARCELA','REMATRICULA','DEPENDENCIA','RENEGOCIACAO'))
);
CREATE TABLE public.convenios_financeiros_creditos(conta_receber_id uuid);
CREATE FUNCTION public.listar_outros_creditos_sem_convenios_core(p_polo_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT coalesce(public.gestor_has_effective_financeiro_tab('outros-creditos'), false)
    OR NOT coalesce(public.is_financeiro_for_polo(p_polo_id), false) THEN
    RAISE EXCEPTION 'List scope denied' USING ERRCODE = '42501';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(c) - ARRAY[
    'outros_creditos_plano_id','outros_creditos_papel','regra_financeira_outros_creditos_snapshot'])
    FROM public.contas_receber c WHERE c.polo_id = p_polo_id
      AND c.categoria = 'OUTROS_CREDITOS' AND c.matricula_id IS NULL AND c.turma_id IS NULL
      AND c.origem_cronograma_id IS NULL AND coalesce(c.tipo_lancamento, '')
        NOT IN ('MATRICULA','PARCELA','REMATRICULA','DEPENDENCIA')), '[]'::jsonb);
END;
$function$;
CREATE FUNCTION public.listar_outros_creditos_secure(p_polo_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT public.listar_outros_creditos_sem_convenios_core(p_polo_id);
$function$;
REVOKE ALL ON FUNCTION public.listar_outros_creditos_sem_convenios_core(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.listar_outros_creditos_secure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_outros_creditos_secure(uuid) TO authenticated, service_role;
