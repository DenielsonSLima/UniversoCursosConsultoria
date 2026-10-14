-- Synthetic additions to other_credit_cancellation.fixture.sql; no production rows.
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role',true); $$;
CREATE TABLE public.contas_bancarias(id uuid PRIMARY KEY,polo_id uuid,nome text,ativo boolean DEFAULT true);
CREATE TABLE public.contas_bancarias_polos(conta_bancaria_id uuid,polo_id uuid,PRIMARY KEY(conta_bancaria_id,polo_id));
CREATE FUNCTION public.conta_bancaria_disponivel_no_polo(p_account uuid,p_polo uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.contas_bancarias c
 JOIN public.contas_bancarias_polos a ON a.conta_bancaria_id=c.id WHERE c.id=p_account AND c.ativo AND a.polo_id=p_polo); $$;
ALTER TABLE public.contas_receber ADD COLUMN conta_bancaria_id uuid;
CREATE TABLE public.contas_pagar(
 id uuid PRIMARY KEY,polo_id uuid,company_id uuid,descricao text,valor numeric,valor_pago numeric,status text,
 data_pagamento date,data_vencimento date,conta_bancaria_id uuid,forma_pagamento text,
 baixa_request_id uuid,despesa_lancamento_id uuid,emprestimo_parcela_id uuid,emprestimo_id uuid,origem text,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.despesas_lancamentos(
 id uuid PRIMARY KEY,polo_id uuid,company_id uuid,tipo text DEFAULT 'VARIAVEL',descricao text,
 valor_base numeric,valor numeric,valor_pago numeric,status text,juros_valor numeric DEFAULT 0,
 multa_valor numeric DEFAULT 0,desconto_valor numeric DEFAULT 0,data_vencimento date,data_lancamento date,
 data_pagamento date,conta_bancaria_id uuid,forma_pagamento text,baixa_request_id uuid,
 rateio_modo text DEFAULT 'SEM_RATEIO',rateio_polo_ids uuid[],categoria_financeira_id uuid,
 excluido_em timestamptz,estornado_em timestamptz,cancelado_em timestamptz,
 created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
 CONSTRAINT despesas_pagamento_completo_check CHECK(status<>'PAGO' OR (conta_bancaria_id IS NOT NULL
   AND data_pagamento IS NOT NULL AND forma_pagamento IS NOT NULL AND valor_pago IS NOT NULL))
);
CREATE TABLE public.despesas_lancamentos_rateios(
 id uuid PRIMARY KEY,despesa_lancamento_id uuid,company_id uuid,polo_id uuid,
 valor_base numeric,juros_valor numeric DEFAULT 0,multa_valor numeric DEFAULT 0,desconto_valor numeric DEFAULT 0,
 valor_total numeric GENERATED ALWAYS AS (round(valor_base+juros_valor+multa_valor-desconto_valor,2)) STORED,
 status text,data_pagamento date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.convenios_financeiros_despesas(despesa_lancamento_id uuid,status text);
CREATE FUNCTION public.baixar_despesa_secure(uuid,uuid,uuid,date,text,numeric DEFAULT 0,numeric DEFAULT 0,numeric DEFAULT 0)
RETURNS public.despesas_lancamentos LANGUAGE sql AS $$ SELECT s FROM public.despesas_lancamentos s WHERE id=$1; $$;
CREATE FUNCTION public.baixar_conta_pagar_secure(uuid,uuid,uuid,date,text)
RETURNS public.contas_pagar LANGUAGE sql AS $$ SELECT s FROM public.contas_pagar s WHERE id=$1; $$;
