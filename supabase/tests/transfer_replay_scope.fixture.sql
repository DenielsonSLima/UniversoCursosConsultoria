CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA test_transfer;
CREATE TABLE test_transfer.access_state (
  role_name text, actor uuid, allowed_polos uuid[], module_allowed boolean
);
INSERT INTO test_transfer.access_state VALUES (
  'authenticated', '00000000-0000-0000-0000-000000000099',
  ARRAY['00000000-0000-0000-0000-000000000001'::uuid,
        '00000000-0000-0000-0000-000000000002'::uuid], true
);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
  $$SELECT role_name FROM test_transfer.access_state$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
  $$SELECT actor FROM test_transfer.access_state$$;
CREATE FUNCTION public.is_gestor_for_polo(p uuid) RETURNS boolean LANGUAGE sql AS
  $$SELECT p=ANY(allowed_polos) FROM test_transfer.access_state$$;
CREATE FUNCTION public.gestor_has_module(m text) RETURNS boolean LANGUAGE sql AS
  $$SELECT module_allowed FROM test_transfer.access_state$$;
CREATE FUNCTION public.gestor_has_financeiro_tab(t text) RETURNS boolean LANGUAGE sql AS
  $$SELECT module_allowed FROM test_transfer.access_state$$;
CREATE TABLE public.contas_bancarias_polos (
  conta_bancaria_id uuid, polo_id uuid, ativo boolean DEFAULT true,
  PRIMARY KEY (conta_bancaria_id, polo_id)
);
INSERT INTO public.contas_bancarias_polos (conta_bancaria_id,polo_id) VALUES
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002');
CREATE FUNCTION public.conta_bancaria_disponivel_no_polo(c uuid,p uuid)
RETURNS boolean LANGUAGE sql AS $$
  SELECT EXISTS (SELECT FROM public.contas_bancarias_polos
    WHERE conta_bancaria_id=c AND polo_id=p AND ativo)
$$;
CREATE TABLE public.transferencias_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  polo_id uuid NOT NULL, polo_destino_id uuid NOT NULL,
  conta_origem_id uuid NOT NULL, conta_destino_id uuid NOT NULL,
  tipo text NOT NULL, request_id uuid UNIQUE,
  valor numeric NOT NULL, data_transferencia date NOT NULL,
  observacao text, updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.transferencias_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY portal_transferencias_contas_select ON public.transferencias_contas
FOR SELECT TO authenticated USING (
  public.is_gestor_for_polo(polo_id)
  AND public.is_gestor_for_polo(polo_destino_id)
  AND (public.gestor_has_module('caixa')
       OR public.gestor_has_financeiro_tab('transferencias'))
);
GRANT ALL ON public.transferencias_contas TO anon,authenticated,service_role;
