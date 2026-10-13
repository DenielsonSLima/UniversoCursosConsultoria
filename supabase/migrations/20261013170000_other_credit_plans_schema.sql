BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

-- Financial agreements remain independent from academic enrollments and classes.
CREATE TABLE public.outros_creditos_planos (
  id uuid PRIMARY KEY,
  polo_id uuid NOT NULL REFERENCES public.polos(id),
  cliente_id uuid NOT NULL REFERENCES public.parceiros(id),
  categoria_financeira_id uuid REFERENCES public.categorias_financeiras(id),
  descricao text NOT NULL CHECK (char_length(descricao) BETWEEN 1 AND 500),
  input jsonb NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  preview jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.outros_creditos_planos ENABLE ROW LEVEL SECURITY;
CREATE POLICY outros_creditos_planos_no_direct_access
  ON public.outros_creditos_planos FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
REVOKE ALL ON public.outros_creditos_planos FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.outros_creditos_planos TO service_role;
CREATE INDEX outros_creditos_planos_polo_idx ON public.outros_creditos_planos(polo_id);
CREATE INDEX outros_creditos_planos_cliente_idx ON public.outros_creditos_planos(cliente_id);
CREATE INDEX outros_creditos_planos_categoria_idx
  ON public.outros_creditos_planos(categoria_financeira_id)
  WHERE categoria_financeira_id IS NOT NULL;

ALTER TABLE public.contas_receber
  ADD COLUMN outros_creditos_plano_id uuid REFERENCES public.outros_creditos_planos(id),
  ADD COLUMN outros_creditos_papel text,
  ADD COLUMN regra_financeira_outros_creditos_snapshot jsonb;

ALTER TABLE public.contas_receber DROP CONSTRAINT contas_receber_tipo_lancamento_check;
ALTER TABLE public.contas_receber ADD CONSTRAINT contas_receber_tipo_lancamento_check
  CHECK (tipo_lancamento IS NULL OR tipo_lancamento IN (
    'MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA', 'RENEGOCIACAO', 'OUTRO_CREDITO'
  ));

ALTER TABLE public.contas_receber ADD CONSTRAINT contas_receber_outros_creditos_plano_check
  CHECK (coalesce(
    (outros_creditos_plano_id IS NULL AND outros_creditos_papel IS NULL
      AND regra_financeira_outros_creditos_snapshot IS NULL)
    OR (outros_creditos_plano_id IS NOT NULL AND categoria = 'OUTROS_CREDITOS'
      AND tipo_lancamento = 'OUTRO_CREDITO' AND cliente_id IS NOT NULL
      AND polo_id IS NOT NULL AND matricula_id IS NULL AND turma_id IS NULL
      AND origem_cronograma_id IS NULL
      AND regra_financeira_tecnica_snapshot IS NULL
      AND regra_financeira_plano_unico_snapshot IS NULL
      AND regra_financeira_dependencia_snapshot IS NULL
      AND regra_financeira_renegociacao_snapshot IS NULL
      AND jsonb_typeof(regra_financeira_outros_creditos_snapshot) = 'object'
      AND regra_financeira_outros_creditos_snapshot ->> 'origem' = 'OUTROS_CREDITOS_PLANO'
      AND regra_financeira_outros_creditos_snapshot ->> 'versao' = '1'
      AND regra_financeira_outros_creditos_snapshot ->> 'planoId' = outros_creditos_plano_id::text
      AND regra_financeira_outros_creditos_snapshot ->> 'papel' = outros_creditos_papel
      AND jsonb_typeof(regra_financeira_outros_creditos_snapshot -> 'financialTerms') = 'object'
      AND ((outros_creditos_papel = 'PARCELA' AND parcela_numero BETWEEN 1 AND 60)
        OR (outros_creditos_papel IN ('MATRICULA', 'REMATRICULA') AND parcela_numero = 0))), false));

CREATE UNIQUE INDEX contas_receber_outros_creditos_plano_slot_idx
  ON public.contas_receber(outros_creditos_plano_id, outros_creditos_papel, parcela_numero)
  WHERE outros_creditos_plano_id IS NOT NULL;

COMMENT ON COLUMN public.contas_receber.outros_creditos_papel IS
  'Papel comercial da cobrança avulsa; matrícula/rematrícula aqui são taxas financeiras e não efeitos acadêmicos.';

COMMIT;
