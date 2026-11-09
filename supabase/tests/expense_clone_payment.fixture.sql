-- Estrutura mínima descartável. Não contém registros nem identificadores de produção.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.role',true),'') $$;
CREATE FUNCTION public.is_financeiro_for_polo(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL AND $1='00000000-0000-0000-0000-000000000001'::uuid
    AND current_setting('test.allowed',true)='yes' $$;
CREATE FUNCTION public.gestor_has_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.allowed',true)='yes' $$;
CREATE FUNCTION public.gestor_has_effective_financeiro_tab(text) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.gestor_has_financeiro_tab($1) $$;
CREATE FUNCTION public.conta_bancaria_disponivel_no_polo(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$
  SELECT $1='00000000-0000-0000-0000-000000000051'::uuid
    AND $2='00000000-0000-0000-0000-000000000001'::uuid $$;
-- Hash determinístico somente da fixture; a produção usa extensions.digest/sha256.
CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE sql AS $$
  SELECT decode(md5($1),'hex') $$;

CREATE TABLE public.polos(id uuid PRIMARY KEY,company_id uuid,is_matriz boolean,status text);
INSERT INTO public.polos VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000009',true,'ativo'),
 ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000009',false,'ativo');
CREATE TABLE public.despesas_lancamentos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), polo_id uuid,tipo text,descricao text,
 valor_base numeric,valor numeric,juros_valor numeric,multa_valor numeric,desconto_valor numeric,
 data_lancamento date,data_vencimento date,data_pagamento date,valor_pago numeric,status text,
 categoria_financeira_id uuid,fornecedor_id uuid,forma_pagamento text,conta_bancaria_id uuid,
 parcela_numero integer,total_parcelas integer,grupo_parcelas_id uuid,observacao text,turma_id uuid,
 anexo_bucket text,anexo_path text,anexo_nome text,anexo_mime text,anexo_tamanho bigint,
 request_id uuid,rateio_modo text DEFAULT 'SEM_RATEIO',rateio_polo_ids uuid[]
);
CREATE TABLE public.despesas_lancamentos_rateios(
 despesa_lancamento_id uuid REFERENCES public.despesas_lancamentos(id),company_id uuid,polo_id uuid,
 valor_base numeric,juros_valor numeric,multa_valor numeric,desconto_valor numeric,status text,data_pagamento date
);
CREATE TABLE public.financial_payment_events(source_kind text,source_id uuid);
CREATE TABLE public.convenios_financeiros_competencias(
 id uuid PRIMARY KEY,polo_id uuid,competencia date,status text,convenio_id uuid,company_id uuid
);
INSERT INTO public.convenios_financeiros_competencias VALUES
 ('00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-000000000001','2026-11-01','ABERTO',
  '00000000-0000-0000-0000-000000000062','00000000-0000-0000-0000-000000000009');
CREATE TABLE public.convenios_financeiros_operacoes_requisicoes(
 request_id uuid PRIMARY KEY,convenio_id uuid,competencia_id uuid,operacao text,actor_id uuid,payload_hash text,resultado jsonb
);
CREATE TABLE public.convenios_financeiros_despesas(
 competencia_id uuid,convenio_id uuid,company_id uuid,polo_id uuid,despesa_lancamento_id uuid,valor_vinculado numeric,created_by uuid
);
CREATE FUNCTION public.convenios_financeiros_mes_item_secure(uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT '{"saldo_projetado":10000}'::jsonb $$;

CREATE OR REPLACE FUNCTION public.financeiro_dividir_centavos(p_valor numeric, p_quantidade integer, p_indice integer)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
DECLARE
  v_centavos bigint;
  v_base bigint;
  v_resto bigint;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade < 1 OR p_indice IS NULL
     OR p_indice < 1 OR p_indice > p_quantidade THEN
    RAISE EXCEPTION 'Parâmetros inválidos para divisão de centavos.';
  END IF;

  v_centavos := round(coalesce(p_valor, 0) * 100)::bigint;
  v_base := v_centavos / p_quantidade;
  v_resto := mod(v_centavos, p_quantidade);

  RETURN (v_base + CASE WHEN p_indice <= v_resto THEN 1 ELSE 0 END)::numeric / 100;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calcular_ajustes_despesa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM public.financial_payment_events
    WHERE source_kind='EXPENSE' AND source_id=OLD.id) THEN
    RETURN NEW;
  END IF;
  NEW.valor_base := round(coalesce(NEW.valor_base, NEW.valor, 0)::numeric, 2);
  NEW.juros_valor := round(coalesce(NEW.juros_valor, 0)::numeric, 2);
  NEW.multa_valor := round(coalesce(NEW.multa_valor, 0)::numeric, 2);
  NEW.desconto_valor := round(coalesce(NEW.desconto_valor, 0)::numeric, 2);

  IF NEW.valor_base <= 0 THEN
    RAISE EXCEPTION 'O valor-base da despesa deve ser maior que zero.';
  END IF;

  IF NEW.juros_valor < 0 OR NEW.multa_valor < 0 OR NEW.desconto_valor < 0 THEN
    RAISE EXCEPTION 'Juros, multa e desconto não podem ser negativos.';
  END IF;

  IF NEW.desconto_valor > NEW.valor_base + NEW.juros_valor + NEW.multa_valor THEN
    RAISE EXCEPTION 'O desconto não pode superar o valor-base acrescido de juros e multa.';
  END IF;

  NEW.valor := round(
    NEW.valor_base + NEW.juros_valor + NEW.multa_valor - NEW.desconto_valor,
    2
  );

  IF NEW.status = 'PAGO'
    AND (
      TG_OP = 'INSERT'
      OR OLD.status IS DISTINCT FROM NEW.status
      OR OLD.valor_base IS DISTINCT FROM NEW.valor_base
      OR OLD.juros_valor IS DISTINCT FROM NEW.juros_valor
      OR OLD.multa_valor IS DISTINCT FROM NEW.multa_valor
      OR OLD.desconto_valor IS DISTINCT FROM NEW.desconto_valor
    )
  THEN
    NEW.valor_pago := NEW.valor;
  END IF;

  RETURN NEW;
END;
$function$;


CREATE TRIGGER despesas_calcular_ajustes_trigger BEFORE INSERT OR UPDATE OF
 valor_base,juros_valor,multa_valor,desconto_valor,status ON public.despesas_lancamentos
 FOR EACH ROW EXECUTE FUNCTION public.calcular_ajustes_despesa();
