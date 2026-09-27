BEGIN;

CREATE TABLE public.convenios_financeiros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  parceiro_id uuid REFERENCES public.parceiros(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  observacao text,
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'ARQUIVADO')),
  request_id uuid NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convenios_financeiros_nome_chk CHECK (nullif(btrim(nome), '') IS NOT NULL)
);

CREATE TABLE public.convenios_financeiros_competencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id uuid NOT NULL REFERENCES public.convenios_financeiros(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  competencia date NOT NULL,
  status text NOT NULL DEFAULT 'ABERTO' CHECK (status IN ('ABERTO', 'FINALIZADO')),
  saldo_inicial numeric(15, 2) NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
  creditos_fechamento numeric(15, 2),
  despesas_fechamento numeric(15, 2),
  saldo_final numeric(15, 2),
  competencia_anterior_id uuid UNIQUE
    REFERENCES public.convenios_financeiros_competencias(id) ON DELETE RESTRICT,
  observacao text,
  fechado_em timestamptz,
  fechado_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convenios_financeiros_competencia_mes_chk CHECK (
    competencia = date_trunc('month', competencia)::date
  ),
  CONSTRAINT convenios_financeiros_primeiro_saldo_zero_chk CHECK (
    competencia_anterior_id IS NOT NULL OR saldo_inicial = 0
  ),
  CONSTRAINT convenios_financeiros_competencia_fechamento_chk CHECK (
    (status = 'ABERTO' AND creditos_fechamento IS NULL
      AND despesas_fechamento IS NULL AND saldo_final IS NULL
      AND fechado_em IS NULL AND fechado_por IS NULL)
    OR
    (status = 'FINALIZADO' AND creditos_fechamento IS NOT NULL
      AND despesas_fechamento IS NOT NULL AND saldo_final IS NOT NULL
      AND saldo_final >= 0 AND fechado_em IS NOT NULL)
  ),
  CONSTRAINT convenios_financeiros_competencia_uidx UNIQUE (convenio_id, competencia)
);

CREATE UNIQUE INDEX convenios_financeiros_um_mes_aberto_uidx
  ON public.convenios_financeiros_competencias (convenio_id)
  WHERE status = 'ABERTO';
CREATE INDEX convenios_financeiros_polo_status_nome_idx
  ON public.convenios_financeiros (polo_id, status, nome);
CREATE INDEX convenios_financeiros_competencias_polo_status_mes_idx
  ON public.convenios_financeiros_competencias (polo_id, status, competencia DESC, id DESC);

CREATE TABLE public.convenios_financeiros_creditos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL
    REFERENCES public.convenios_financeiros_competencias(id) ON DELETE RESTRICT,
  convenio_id uuid NOT NULL REFERENCES public.convenios_financeiros(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  conta_receber_id uuid NOT NULL UNIQUE REFERENCES public.contas_receber(id) ON DELETE RESTRICT,
  conta_bancaria_id uuid NOT NULL REFERENCES public.contas_bancarias(id) ON DELETE RESTRICT,
  data_credito date NOT NULL,
  valor numeric(15, 2) NOT NULL CHECK (valor > 0),
  forma_recebimento text NOT NULL CHECK (forma_recebimento IN ('PIX', 'TED', 'DINHEIRO', 'BOLETO')),
  descricao text NOT NULL,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convenios_financeiros_creditos_descricao_chk
    CHECK (nullif(btrim(descricao), '') IS NOT NULL)
);

CREATE INDEX convenios_financeiros_creditos_mes_data_idx
  ON public.convenios_financeiros_creditos (competencia_id, data_credito DESC, id DESC);
CREATE INDEX convenios_financeiros_creditos_polo_data_idx
  ON public.convenios_financeiros_creditos (polo_id, data_credito DESC);

CREATE TABLE public.convenios_financeiros_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competencia_id uuid NOT NULL
    REFERENCES public.convenios_financeiros_competencias(id) ON DELETE RESTRICT,
  convenio_id uuid NOT NULL REFERENCES public.convenios_financeiros(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  despesa_lancamento_id uuid NOT NULL UNIQUE
    REFERENCES public.despesas_lancamentos(id) ON DELETE RESTRICT,
  valor_vinculado numeric(15, 2) NOT NULL CHECK (valor_vinculado > 0),
  status text NOT NULL DEFAULT 'ATIVO' CHECK (status IN ('ATIVO', 'ESTORNADO')),
  estorno_motivo text,
  estornado_em timestamptz,
  estornado_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT convenios_financeiros_despesas_estorno_chk CHECK (
    (status = 'ATIVO' AND estornado_em IS NULL AND estornado_por IS NULL)
    OR (status = 'ESTORNADO' AND estornado_em IS NOT NULL)
  )
);

CREATE INDEX convenios_financeiros_despesas_mes_status_idx
  ON public.convenios_financeiros_despesas (competencia_id, status);
CREATE INDEX convenios_financeiros_despesas_polo_idx
  ON public.convenios_financeiros_despesas (polo_id, despesa_lancamento_id);

CREATE TABLE public.convenios_financeiros_operacoes_requisicoes (
  request_id uuid PRIMARY KEY,
  convenio_id uuid REFERENCES public.convenios_financeiros(id) ON DELETE RESTRICT,
  competencia_id uuid REFERENCES public.convenios_financeiros_competencias(id) ON DELETE RESTRICT,
  operacao text NOT NULL CHECK (operacao IN (
    'CRIAR_CONVENIO', 'LANCAR_CREDITO', 'VINCULAR_DESPESA', 'CRIAR_DESPESA', 'FINALIZAR_MES'
  )),
  actor_id uuid,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX convenios_financeiros_operacoes_convenio_idx
  ON public.convenios_financeiros_operacoes_requisicoes (convenio_id, created_at DESC);
CREATE INDEX convenios_financeiros_operacoes_mes_idx
  ON public.convenios_financeiros_operacoes_requisicoes (competencia_id, created_at DESC);

ALTER TABLE public.convenios_financeiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenios_financeiros_competencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenios_financeiros_creditos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenios_financeiros_despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.convenios_financeiros_operacoes_requisicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY convenios_financeiros_select_scoped ON public.convenios_financeiros
  FOR SELECT TO authenticated
  USING (public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_financeiro_tab('convenios'));
CREATE POLICY convenios_financeiros_competencias_select_scoped
  ON public.convenios_financeiros_competencias FOR SELECT TO authenticated
  USING (public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_financeiro_tab('convenios'));
CREATE POLICY convenios_financeiros_creditos_select_scoped
  ON public.convenios_financeiros_creditos FOR SELECT TO authenticated
  USING (public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_financeiro_tab('convenios'));
CREATE POLICY convenios_financeiros_despesas_select_scoped
  ON public.convenios_financeiros_despesas FOR SELECT TO authenticated
  USING (public.is_financeiro_for_polo(polo_id)
    AND public.gestor_has_financeiro_tab('convenios'));

REVOKE ALL ON TABLE public.convenios_financeiros,
  public.convenios_financeiros_competencias,
  public.convenios_financeiros_creditos,
  public.convenios_financeiros_despesas,
  public.convenios_financeiros_operacoes_requisicoes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.convenios_financeiros,
  public.convenios_financeiros_competencias,
  public.convenios_financeiros_creditos,
  public.convenios_financeiros_despesas TO authenticated;

COMMIT;
