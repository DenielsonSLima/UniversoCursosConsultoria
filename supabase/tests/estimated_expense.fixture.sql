-- Synthetic additions; payment arithmetic and guards come from real migrations.
CREATE SCHEMA private;
ALTER TABLE public.polos ADD COLUMN nome text, ADD COLUMN company_id uuid, ADD COLUMN is_matriz boolean DEFAULT false;
ALTER TABLE public.parceiros ADD COLUMN nome text, ADD COLUMN nome_fantasia text;
CREATE TABLE public.categorias_financeiras(id uuid PRIMARY KEY,nome text,tipo text,status text);
ALTER TABLE public.despesas_lancamentos ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.despesas_lancamentos
  ADD COLUMN request_id uuid, ADD COLUMN fornecedor_id uuid, ADD COLUMN turma_id uuid,
  ADD COLUMN parcela_numero integer NOT NULL DEFAULT 1,
  ADD COLUMN total_parcelas integer NOT NULL DEFAULT 1,
  ADD COLUMN grupo_parcelas_id uuid, ADD COLUMN observacao text,
  ADD COLUMN anexo_bucket text, ADD COLUMN anexo_path text, ADD COLUMN anexo_nome text,
  ADD COLUMN anexo_mime text, ADD COLUMN anexo_tamanho bigint;
ALTER TABLE public.despesas_lancamentos ADD COLUMN cancelamento_motivo text, ADD COLUMN cancelado_por uuid;
CREATE SCHEMA extensions;
-- Hash mechanics are not under test; production uses its installed SHA256 implementation.
CREATE FUNCTION extensions.digest(bytea,text) RETURNS bytea LANGUAGE sql IMMUTABLE AS $$
  SELECT decode(md5(encode($1,'hex')),'hex');
$$;
CREATE TABLE public.despesas_operacoes_requisicoes(
  request_id uuid PRIMARY KEY,despesa_lancamento_id uuid,operacao text,actor_id uuid,
  payload_hash text,resultado jsonb,created_at timestamptz DEFAULT now()
);
ALTER TABLE public.despesas_lancamentos_rateios ALTER COLUMN id SET DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX test_expense_request_parcela ON public.despesas_lancamentos(request_id,parcela_numero);
CREATE OR REPLACE FUNCTION public.gestor_has_effective_financeiro_tab(text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.tab',true)='true'; $$;
CREATE FUNCTION public.gestor_has_financeiro_tab(text)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT current_setting('test.tab',true)='true'; $$;
CREATE FUNCTION public.financeiro_normalize_search_text(text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT lower($1); $$;
