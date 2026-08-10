-- Ciclo de vida auditável do Patrimônio.
--
-- Cadastro indevido é exclusão lógica e retroativa. Perda é uma movimentação
-- econômica parcial ou total, efetiva na data informada. O valor original de
-- aquisição permanece em valor_total; valor_patrimonial_ativo representa
-- somente a quantidade ainda disponível.

BEGIN;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.patrimonios patrimonio
    WHERE patrimonio.ativo = false
  ) THEN
    RAISE EXCEPTION
      'Existem patrimônios inativos sem classificação histórica; reconcilie-os antes de aplicar o ciclo de vida.';
  END IF;
END;
$migration$;

ALTER TABLE public.patrimonios
  ADD COLUMN status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN quantidade_baixada integer NOT NULL DEFAULT 0,
  ADD COLUMN quantidade_disponivel integer GENERATED ALWAYS AS (
    quantidade - quantidade_baixada
  ) STORED,
  ADD COLUMN valor_patrimonial_ativo numeric(16, 2) GENERATED ALWAYS AS (
    CASE
      WHEN status = 'excluido' THEN 0::numeric
      ELSE round((quantidade - quantidade_baixada)::numeric * valor_unitario, 2)
    END
  ) STORED,
  ADD COLUMN updated_by uuid,
  ADD COLUMN excluido_at timestamptz,
  ADD COLUMN excluido_by uuid,
  ADD CONSTRAINT patrimonios_status_chk
    CHECK (status IN ('ativo', 'baixado', 'excluido')),
  ADD CONSTRAINT patrimonios_quantidade_baixada_chk
    CHECK (
      quantidade_baixada >= 0
      AND quantidade_baixada <= quantidade
    ),
  ADD CONSTRAINT patrimonios_ciclo_vida_consistente_chk
    CHECK (
      (
        status = 'ativo'
        AND ativo = true
        AND quantidade_baixada < quantidade
      )
      OR (
        status = 'baixado'
        AND ativo = false
        AND quantidade_baixada = quantidade
      )
      OR (
        status = 'excluido'
        AND ativo = false
        AND excluido_at IS NOT NULL
      )
    ),
  ADD CONSTRAINT patrimonios_exclusao_consistente_chk
    CHECK (
      status = 'excluido'
      OR (excluido_at IS NULL AND excluido_by IS NULL)
    );

CREATE INDEX patrimonios_polo_status_data_id_idx
  ON public.patrimonios (polo_id, status, data_aquisicao DESC, id DESC);

CREATE TABLE public.patrimonio_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  polo_id uuid NOT NULL REFERENCES public.polos(id) ON DELETE RESTRICT,
  patrimonio_id uuid NOT NULL REFERENCES public.patrimonios(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  tipo text NOT NULL,
  effective_on date NOT NULL,
  quantidade_movimento integer,
  quantidade_original integer NOT NULL,
  quantidade_baixada integer NOT NULL,
  quantidade_disponivel integer NOT NULL,
  valor_unitario numeric(14, 2) NOT NULL,
  valor_patrimonial_ativo numeric(16, 2) NOT NULL,
  motivo text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado_anterior jsonb,
  estado_resultante jsonb NOT NULL,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patrimonio_eventos_company_request_uidx
    UNIQUE (company_id, request_id),
  CONSTRAINT patrimonio_eventos_tipo_chk
    CHECK (tipo IN ('criacao', 'edicao', 'baixa_perda', 'exclusao_cadastro')),
  CONSTRAINT patrimonio_eventos_motivo_chk
    CHECK (nullif(btrim(motivo), '') IS NOT NULL),
  CONSTRAINT patrimonio_eventos_movimento_chk
    CHECK (
      (tipo = 'baixa_perda' AND quantidade_movimento > 0)
      OR (tipo <> 'baixa_perda' AND quantidade_movimento IS NULL)
    ),
  CONSTRAINT patrimonio_eventos_quantidades_chk
    CHECK (
      quantidade_original > 0
      AND quantidade_baixada >= 0
      AND quantidade_baixada <= quantidade_original
      AND quantidade_disponivel = quantidade_original - quantidade_baixada
    ),
  CONSTRAINT patrimonio_eventos_valores_chk
    CHECK (
      valor_unitario >= 0
      AND valor_patrimonial_ativo >= 0
    ),
  CONSTRAINT patrimonio_eventos_json_chk
    CHECK (
      jsonb_typeof(payload) = 'object'
      AND (estado_anterior IS NULL OR jsonb_typeof(estado_anterior) = 'object')
      AND jsonb_typeof(estado_resultante) = 'object'
    )
);

CREATE INDEX patrimonio_eventos_patrimonio_effective_idx
  ON public.patrimonio_eventos (
    patrimonio_id,
    effective_on DESC,
    created_at DESC,
    id DESC
  );

CREATE INDEX patrimonio_eventos_polo_effective_idx
  ON public.patrimonio_eventos (
    polo_id,
    effective_on DESC,
    id DESC
  );

CREATE INDEX patrimonio_eventos_company_tipo_effective_idx
  ON public.patrimonio_eventos (
    company_id,
    tipo,
    effective_on DESC
  );

ALTER TABLE public.patrimonio_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY patrimonio_eventos_service_read
  ON public.patrimonio_eventos
  FOR SELECT
  TO service_role
  USING (true);

REVOKE ALL ON TABLE public.patrimonio_eventos
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.patrimonio_eventos TO service_role;

CREATE OR REPLACE FUNCTION public.patrimonio_build_result_json(
  p_item public.patrimonios,
  p_polo_nome text,
  p_ultima_baixa_em date,
  p_ultima_baixa_motivo text,
  p_permitir_exclusao boolean
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT jsonb_build_object(
    'id', (p_item).id,
    'company_id', (p_item).company_id,
    'polo_id', (p_item).polo_id,
    'polo_nome', p_polo_nome,
    'data_aquisicao', (p_item).data_aquisicao,
    'tipo_produto_id', (p_item).tipo_produto_id,
    'tipo_produto', (p_item).tipo_produto,
    'descricao', (p_item).descricao,
    'quantidade', (p_item).quantidade,
    'quantidade_original', (p_item).quantidade,
    'quantidade_baixada', (p_item).quantidade_baixada,
    'quantidade_disponivel', (p_item).quantidade_disponivel,
    'valor_unitario', (p_item).valor_unitario::text,
    'valor_total', (p_item).valor_total::text,
    'valor_total_original', (p_item).valor_total::text,
    'valor_disponivel', (p_item).valor_patrimonial_ativo::text,
    'numero_serie', (p_item).numero_serie,
    'observacao', (p_item).observacao,
    'status', (p_item).status,
    'can_edit_economic_fields', (
      (p_item).status <> 'excluido'
      AND (p_item).quantidade_baixada = 0
    ),
    'can_write_off', (
      (p_item).status = 'ativo'
      AND (p_item).quantidade_disponivel > 0
    ),
    'can_delete', (
      coalesce(p_permitir_exclusao, false)
      AND (p_item).status = 'ativo'
      AND (p_item).quantidade_baixada = 0
    ),
    'ultima_baixa_em', p_ultima_baixa_em,
    'ultima_baixa_motivo', p_ultima_baixa_motivo,
    'created_at', (p_item).created_at,
    'updated_at', (p_item).updated_at
  );
$function$;

REVOKE ALL ON FUNCTION public.patrimonio_build_result_json(
  public.patrimonios,
  text,
  date,
  text,
  boolean
) FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.patrimonio_eventos (
  company_id,
  polo_id,
  patrimonio_id,
  request_id,
  tipo,
  effective_on,
  quantidade_movimento,
  quantidade_original,
  quantidade_baixada,
  quantidade_disponivel,
  valor_unitario,
  valor_patrimonial_ativo,
  motivo,
  payload,
  estado_anterior,
  estado_resultante,
  actor_id,
  created_at
)
SELECT
  patrimonio.company_id,
  patrimonio.polo_id,
  patrimonio.id,
  patrimonio.request_id,
  'criacao',
  patrimonio.data_aquisicao,
  NULL,
  patrimonio.quantidade,
  patrimonio.quantidade_baixada,
  patrimonio.quantidade_disponivel,
  patrimonio.valor_unitario,
  patrimonio.valor_patrimonial_ativo,
  'Cadastro inicial preservado na implantação do ciclo de vida',
  jsonb_build_object(
    'origem', 'backfill',
    'data_aquisicao', patrimonio.data_aquisicao,
    'tipo_produto_id', patrimonio.tipo_produto_id,
    'descricao', patrimonio.descricao,
    'quantidade', patrimonio.quantidade,
    'valor_unitario', patrimonio.valor_unitario
  ),
  NULL,
  public.patrimonio_build_result_json(
    patrimonio,
    polo.nome,
    NULL,
    NULL,
    false
  ),
  patrimonio.created_by,
  patrimonio.created_at
FROM public.patrimonios patrimonio
JOIN public.polos polo ON polo.id = patrimonio.polo_id;

CREATE OR REPLACE FUNCTION public.protect_patrimonio_eventos_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Eventos do patrimônio são imutáveis.'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_patrimonio_eventos_immutability()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER patrimonio_eventos_immutable
BEFORE UPDATE OR DELETE ON public.patrimonio_eventos
FOR EACH ROW
EXECUTE FUNCTION public.protect_patrimonio_eventos_immutability();

DROP POLICY IF EXISTS patrimonio_select_scoped ON public.patrimonios;
CREATE POLICY patrimonio_select_scoped
  ON public.patrimonios
  FOR SELECT
  TO authenticated
  USING (
    public.gestor_has_module('patrimonio')
    AND polo_id = ANY(
      coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
    )
    AND (status <> 'excluido' OR public.is_gestor_global())
  );

REVOKE ALL ON TABLE public.patrimonios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.patrimonios TO authenticated;
REVOKE ALL ON TABLE public.patrimonios FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.patrimonios TO service_role;

ALTER TABLE public.patrimonios REPLICA IDENTITY FULL;
DO $realtime$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.patrimonios;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$realtime$;

DROP TRIGGER IF EXISTS patrimonios_emit_finance_realtime_event
  ON public.patrimonios;
CREATE TRIGGER patrimonios_emit_finance_realtime_event
AFTER INSERT OR UPDATE OR DELETE ON public.patrimonios
FOR EACH ROW
EXECUTE FUNCTION public.emit_finance_realtime_event();

CREATE OR REPLACE FUNCTION public.criar_patrimonio_v2_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_data_aquisicao date,
  p_tipo_produto_id uuid,
  p_descricao text,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_numero_serie text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.patrimonios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_polo_nome text;
  v_tipo public.patrimonio_tipos_produto%rowtype;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
  v_result_json jsonb;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  SELECT polo.company_id, polo.nome
  INTO v_company_id, v_polo_nome
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || p_request_id::text, 0)
  );

  SELECT patrimonio.*
  INTO v_existing
  FROM public.patrimonios patrimonio
  WHERE patrimonio.request_id = p_request_id
    AND patrimonio.polo_id = p_polo_id;

  IF FOUND THEN
    IF v_existing.data_aquisicao IS DISTINCT FROM p_data_aquisicao
       OR v_existing.tipo_produto_id IS DISTINCT FROM p_tipo_produto_id
       OR v_existing.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_existing.quantidade IS DISTINCT FROM p_quantidade
       OR v_existing.valor_unitario IS DISTINCT FROM round(p_valor_unitario, 2)
       OR v_existing.numero_serie IS DISTINCT FROM nullif(btrim(coalesce(p_numero_serie, '')), '')
       OR v_existing.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '') THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_existing;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patrimonio_eventos evento
    WHERE evento.company_id = v_company_id
      AND evento.request_id = p_request_id
  ) THEN
    RAISE EXCEPTION 'A chave de idempotência já foi usada por outra operação.';
  END IF;

  IF p_data_aquisicao IS NULL
     OR p_tipo_produto_id IS NULL
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR coalesce(p_quantidade, 0) < 1
     OR p_valor_unitario IS NULL
     OR p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Informe data, tipo, descrição, quantidade e valor unitário válidos.';
  END IF;
  IF p_data_aquisicao > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de aquisição não pode estar no futuro.';
  END IF;
  IF p_valor_unitario > 999999999999.99 THEN
    RAISE EXCEPTION 'O valor unitário excede o limite permitido de R$ 999.999.999.999,99.';
  END IF;
  IF p_quantidade::numeric * round(p_valor_unitario, 2) > 99999999999999.99 THEN
    RAISE EXCEPTION 'O valor total excede o limite permitido de R$ 99.999.999.999.999,99.';
  END IF;

  SELECT tipo.*
  INTO v_tipo
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.id = p_tipo_produto_id
    AND tipo.company_id = v_company_id
    AND tipo.status = 'ativo'
    AND tipo.deleted_at IS NULL
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O tipo de produto deve estar ativo e pertencer à empresa do polo.';
  END IF;

  INSERT INTO public.patrimonios (
    company_id,
    polo_id,
    data_aquisicao,
    tipo_produto_id,
    tipo_produto,
    descricao,
    quantidade,
    valor_unitario,
    numero_serie,
    observacao,
    request_id,
    created_by,
    updated_by
  ) VALUES (
    v_company_id,
    p_polo_id,
    p_data_aquisicao,
    v_tipo.id,
    v_tipo.nome,
    btrim(p_descricao),
    p_quantidade,
    round(p_valor_unitario, 2),
    nullif(btrim(coalesce(p_numero_serie, '')), ''),
    nullif(btrim(coalesce(p_observacao, '')), ''),
    p_request_id,
    auth.uid(),
    auth.uid()
  )
  RETURNING * INTO v_result;

  v_result_json := public.patrimonio_build_result_json(
    v_result,
    v_polo_nome,
    NULL,
    NULL,
    coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
      OR public.is_gestor_global()
  );

  INSERT INTO public.patrimonio_eventos (
    company_id,
    polo_id,
    patrimonio_id,
    request_id,
    tipo,
    effective_on,
    quantidade_movimento,
    quantidade_original,
    quantidade_baixada,
    quantidade_disponivel,
    valor_unitario,
    valor_patrimonial_ativo,
    motivo,
    payload,
    estado_anterior,
    estado_resultante,
    actor_id
  ) VALUES (
    v_result.company_id,
    v_result.polo_id,
    v_result.id,
    p_request_id,
    'criacao',
    v_result.data_aquisicao,
    NULL,
    v_result.quantidade,
    v_result.quantidade_baixada,
    v_result.quantidade_disponivel,
    v_result.valor_unitario,
    v_result.valor_patrimonial_ativo,
    'Cadastro inicial do patrimônio',
    jsonb_build_object(
      'data_aquisicao', p_data_aquisicao,
      'tipo_produto_id', p_tipo_produto_id,
      'descricao', btrim(p_descricao),
      'quantidade', p_quantidade,
      'valor_unitario', round(p_valor_unitario, 2),
      'numero_serie', nullif(btrim(coalesce(p_numero_serie, '')), ''),
      'observacao', nullif(btrim(coalesce(p_observacao, '')), '')
    ),
    NULL,
    v_result_json,
    auth.uid()
  );

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_patrimonio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_data_aquisicao date,
  p_tipo_produto text,
  p_descricao text,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_numero_serie text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS public.patrimonios
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_tipo_produto_id uuid;
  v_existing public.patrimonios%rowtype;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_polo_id::text || ':' || p_request_id::text, 0)
  );

  SELECT patrimonio.*
  INTO v_existing
  FROM public.patrimonios patrimonio
  WHERE patrimonio.request_id = p_request_id
    AND patrimonio.polo_id = p_polo_id;

  IF FOUND THEN
    IF v_existing.data_aquisicao IS DISTINCT FROM p_data_aquisicao
       OR public.financeiro_normalize_search_text(v_existing.tipo_produto)
          IS DISTINCT FROM public.financeiro_normalize_search_text(btrim(p_tipo_produto))
       OR v_existing.descricao IS DISTINCT FROM btrim(p_descricao)
       OR v_existing.quantidade IS DISTINCT FROM p_quantidade
       OR v_existing.valor_unitario IS DISTINCT FROM round(p_valor_unitario, 2)
       OR v_existing.numero_serie IS DISTINCT FROM nullif(btrim(coalesce(p_numero_serie, '')), '')
       OR v_existing.observacao IS DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '') THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_existing;
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  SELECT tipo.id
  INTO v_tipo_produto_id
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.company_id = v_company_id
    AND tipo.nome_normalizado = public.financeiro_normalize_search_text(
      btrim(coalesce(p_tipo_produto, ''))
    )
    AND tipo.status = 'ativo'
    AND tipo.deleted_at IS NULL
  FOR SHARE;

  IF v_tipo_produto_id IS NULL THEN
    RAISE EXCEPTION 'O tipo de produto deve estar ativo e pertencer à empresa do polo.';
  END IF;

  RETURN public.criar_patrimonio_v2_secure(
    p_request_id,
    p_polo_id,
    p_data_aquisicao,
    v_tipo_produto_id,
    p_descricao,
    p_quantidade,
    p_valor_unitario,
    p_numero_serie,
    p_observacao
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_patrimonio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_patrimonio_id uuid,
  p_expected_updated_at timestamptz,
  p_data_aquisicao date,
  p_tipo_produto_id uuid,
  p_descricao text,
  p_quantidade integer,
  p_valor_unitario numeric,
  p_numero_serie text,
  p_observacao text,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_polo_nome text;
  v_event public.patrimonio_eventos%rowtype;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
  v_tipo_nome text;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_ultima_baixa_em date;
  v_ultima_baixa_motivo text;
  v_can_delete boolean;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para editar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe request, versão esperada e motivo da edição.';
  END IF;

  SELECT polo.company_id, polo.nome
  INTO v_company_id, v_polo_nome
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  v_payload := jsonb_build_object(
    'patrimonio_id', p_patrimonio_id,
    'expected_updated_at', p_expected_updated_at,
    'data_aquisicao', p_data_aquisicao,
    'tipo_produto_id', p_tipo_produto_id,
    'descricao', btrim(coalesce(p_descricao, '')),
    'quantidade', p_quantidade,
    'valor_unitario', round(p_valor_unitario, 2),
    'numero_serie', nullif(btrim(coalesce(p_numero_serie, '')), ''),
    'observacao', nullif(btrim(coalesce(p_observacao, '')), ''),
    'motivo', v_motivo
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || p_request_id::text, 0)
  );

  SELECT evento.*
  INTO v_event
  FROM public.patrimonio_eventos evento
  WHERE evento.company_id = v_company_id
    AND evento.polo_id = p_polo_id
    AND evento.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.tipo IS DISTINCT FROM 'edicao'
       OR v_event.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_event.estado_resultante;
  END IF;

  IF p_data_aquisicao IS NULL
     OR p_tipo_produto_id IS NULL
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR coalesce(p_quantidade, 0) < 1
     OR p_valor_unitario IS NULL
     OR p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Informe data, tipo, descrição, quantidade e valor unitário válidos.';
  END IF;
  IF p_data_aquisicao > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de aquisição não pode estar no futuro.';
  END IF;
  IF p_valor_unitario > 999999999999.99
     OR p_quantidade::numeric * round(p_valor_unitario, 2) > 99999999999999.99 THEN
    RAISE EXCEPTION 'O valor informado excede o limite patrimonial permitido.';
  END IF;

  SELECT patrimonio.*
  INTO v_existing
  FROM public.patrimonios patrimonio
  WHERE patrimonio.id = p_patrimonio_id
    AND patrimonio.polo_id = p_polo_id
    AND patrimonio.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patrimônio não encontrado neste polo.';
  END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'O patrimônio foi alterado por outro usuário. Atualize a lista e tente novamente.'
      USING ERRCODE = '40001';
  END IF;
  IF v_existing.status = 'excluido' THEN
    RAISE EXCEPTION 'Patrimônio excluído não pode ser editado.';
  END IF;
  IF v_existing.quantidade_baixada > 0
     AND (
       v_existing.data_aquisicao IS DISTINCT FROM p_data_aquisicao
       OR v_existing.quantidade IS DISTINCT FROM p_quantidade
       OR v_existing.valor_unitario IS DISTINCT FROM round(p_valor_unitario, 2)
     ) THEN
    RAISE EXCEPTION 'Data, quantidade e valor não podem mudar após uma baixa por perda.';
  END IF;

  IF v_existing.tipo_produto_id IS DISTINCT FROM p_tipo_produto_id THEN
    SELECT tipo.nome
    INTO v_tipo_nome
    FROM public.patrimonio_tipos_produto tipo
    WHERE tipo.id = p_tipo_produto_id
      AND tipo.company_id = v_company_id
      AND tipo.status = 'ativo'
      AND tipo.deleted_at IS NULL
    FOR SHARE;

    IF v_tipo_nome IS NULL THEN
      RAISE EXCEPTION 'O novo tipo deve estar ativo e pertencer à empresa do patrimônio.';
    END IF;
  ELSE
    v_tipo_nome := v_existing.tipo_produto;
  END IF;

  IF v_existing.data_aquisicao IS NOT DISTINCT FROM p_data_aquisicao
     AND v_existing.tipo_produto_id IS NOT DISTINCT FROM p_tipo_produto_id
     AND v_existing.descricao IS NOT DISTINCT FROM btrim(p_descricao)
     AND v_existing.quantidade IS NOT DISTINCT FROM p_quantidade
     AND v_existing.valor_unitario IS NOT DISTINCT FROM round(p_valor_unitario, 2)
     AND v_existing.numero_serie IS NOT DISTINCT FROM nullif(btrim(coalesce(p_numero_serie, '')), '')
     AND v_existing.observacao IS NOT DISTINCT FROM nullif(btrim(coalesce(p_observacao, '')), '') THEN
    RAISE EXCEPTION 'Nenhuma alteração foi informada para o patrimônio.';
  END IF;

  SELECT evento.effective_on, evento.motivo
  INTO v_ultima_baixa_em, v_ultima_baixa_motivo
  FROM public.patrimonio_eventos evento
  WHERE evento.patrimonio_id = v_existing.id
    AND evento.tipo = 'baixa_perda'
  ORDER BY evento.effective_on DESC, evento.created_at DESC, evento.id DESC
  LIMIT 1;

  v_can_delete := (
    coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
    OR public.is_gestor_global()
  );
  v_before := public.patrimonio_build_result_json(
    v_existing,
    v_polo_nome,
    v_ultima_baixa_em,
    v_ultima_baixa_motivo,
    v_can_delete
  );

  UPDATE public.patrimonios patrimonio
  SET
    data_aquisicao = p_data_aquisicao,
    tipo_produto_id = p_tipo_produto_id,
    tipo_produto = v_tipo_nome,
    descricao = btrim(p_descricao),
    quantidade = p_quantidade,
    valor_unitario = round(p_valor_unitario, 2),
    numero_serie = nullif(btrim(coalesce(p_numero_serie, '')), ''),
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = auth.uid(),
    updated_at = pg_catalog.clock_timestamp()
  WHERE patrimonio.id = v_existing.id
  RETURNING * INTO v_result;

  v_after := public.patrimonio_build_result_json(
    v_result,
    v_polo_nome,
    v_ultima_baixa_em,
    v_ultima_baixa_motivo,
    v_can_delete
  );

  INSERT INTO public.patrimonio_eventos (
    company_id, polo_id, patrimonio_id, request_id, tipo, effective_on,
    quantidade_movimento, quantidade_original, quantidade_baixada,
    quantidade_disponivel, valor_unitario, valor_patrimonial_ativo,
    motivo, payload, estado_anterior, estado_resultante, actor_id
  ) VALUES (
    v_result.company_id, v_result.polo_id, v_result.id, p_request_id,
    'edicao', CURRENT_DATE, NULL, v_result.quantidade,
    v_result.quantidade_baixada, v_result.quantidade_disponivel,
    v_result.valor_unitario, v_result.valor_patrimonial_ativo,
    v_motivo, v_payload, v_before, v_after, auth.uid()
  );

  RETURN v_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.baixar_patrimonio_perda_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_patrimonio_id uuid,
  p_expected_updated_at timestamptz,
  p_data_baixa date,
  p_quantidade_baixa integer,
  p_motivo text,
  p_observacao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_polo_nome text;
  v_event public.patrimonio_eventos%rowtype;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_motivo text := nullif(lower(btrim(coalesce(p_motivo, ''))), '');
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_can_delete boolean;
  v_previous_baixa_em date;
  v_previous_baixa_motivo text;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para baixar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL
     OR p_expected_updated_at IS NULL
     OR p_data_baixa IS NULL
     OR coalesce(p_quantidade_baixa, 0) < 1
     OR v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe request, versão, data, quantidade e motivo da perda.';
  END IF;
  IF v_motivo NOT IN ('perda', 'furto', 'dano', 'obsolescencia', 'outro') THEN
    RAISE EXCEPTION 'O motivo da baixa deve ser perda, furto, dano, obsolescencia ou outro.';
  END IF;
  IF v_motivo = 'outro' AND v_observacao IS NULL THEN
    RAISE EXCEPTION 'Descreva a perda quando o motivo informado for outro.';
  END IF;

  SELECT polo.company_id, polo.nome
  INTO v_company_id, v_polo_nome
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  v_payload := jsonb_build_object(
    'patrimonio_id', p_patrimonio_id,
    'expected_updated_at', p_expected_updated_at,
    'data_baixa', p_data_baixa,
    'quantidade_baixa', p_quantidade_baixa,
    'motivo', v_motivo,
    'observacao', v_observacao
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || p_request_id::text, 0)
  );

  SELECT evento.*
  INTO v_event
  FROM public.patrimonio_eventos evento
  WHERE evento.company_id = v_company_id
    AND evento.polo_id = p_polo_id
    AND evento.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.tipo IS DISTINCT FROM 'baixa_perda'
       OR v_event.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_event.estado_resultante;
  END IF;

  SELECT patrimonio.*
  INTO v_existing
  FROM public.patrimonios patrimonio
  WHERE patrimonio.id = p_patrimonio_id
    AND patrimonio.polo_id = p_polo_id
    AND patrimonio.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patrimônio não encontrado neste polo.';
  END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'O patrimônio foi alterado por outro usuário. Atualize a lista e tente novamente.'
      USING ERRCODE = '40001';
  END IF;
  IF v_existing.status <> 'ativo' THEN
    RAISE EXCEPTION 'Somente patrimônio ativo pode receber baixa por perda.';
  END IF;
  IF p_data_baixa < v_existing.data_aquisicao OR p_data_baixa > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data da perda deve estar entre a aquisição e a data atual.';
  END IF;
  IF p_quantidade_baixa > v_existing.quantidade_disponivel THEN
    RAISE EXCEPTION 'A quantidade da perda excede a quantidade disponível.';
  END IF;

  SELECT evento.effective_on, evento.motivo
  INTO v_previous_baixa_em, v_previous_baixa_motivo
  FROM public.patrimonio_eventos evento
  WHERE evento.patrimonio_id = v_existing.id
    AND evento.tipo = 'baixa_perda'
  ORDER BY evento.effective_on DESC, evento.created_at DESC, evento.id DESC
  LIMIT 1;

  v_can_delete := (
    coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
    OR public.is_gestor_global()
  );
  v_before := public.patrimonio_build_result_json(
    v_existing,
    v_polo_nome,
    v_previous_baixa_em,
    v_previous_baixa_motivo,
    v_can_delete
  );

  UPDATE public.patrimonios patrimonio
  SET
    quantidade_baixada = patrimonio.quantidade_baixada + p_quantidade_baixa,
    status = CASE
      WHEN patrimonio.quantidade_baixada + p_quantidade_baixa = patrimonio.quantidade
        THEN 'baixado'
      ELSE 'ativo'
    END,
    ativo = patrimonio.quantidade_baixada + p_quantidade_baixa < patrimonio.quantidade,
    updated_by = auth.uid(),
    updated_at = pg_catalog.clock_timestamp()
  WHERE patrimonio.id = v_existing.id
  RETURNING * INTO v_result;

  v_after := public.patrimonio_build_result_json(
    v_result,
    v_polo_nome,
    p_data_baixa,
    v_motivo,
    v_can_delete
  );

  INSERT INTO public.patrimonio_eventos (
    company_id, polo_id, patrimonio_id, request_id, tipo, effective_on,
    quantidade_movimento, quantidade_original, quantidade_baixada,
    quantidade_disponivel, valor_unitario, valor_patrimonial_ativo,
    motivo, payload, estado_anterior, estado_resultante, actor_id
  ) VALUES (
    v_result.company_id, v_result.polo_id, v_result.id, p_request_id,
    'baixa_perda', p_data_baixa, p_quantidade_baixa,
    v_result.quantidade, v_result.quantidade_baixada,
    v_result.quantidade_disponivel, v_result.valor_unitario,
    v_result.valor_patrimonial_ativo, v_motivo, v_payload,
    v_before, v_after, auth.uid()
  );

  RETURN v_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_patrimonio_secure(
  p_request_id uuid,
  p_polo_id uuid,
  p_patrimonio_id uuid,
  p_expected_updated_at timestamptz,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_polo_nome text;
  v_event public.patrimonio_eventos%rowtype;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
  v_payload jsonb;
  v_before jsonb;
  v_after jsonb;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_gestor_global()
       AND public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Apenas gestor global pode excluir cadastro patrimonial indevido.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL OR p_expected_updated_at IS NULL OR v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe request, versão esperada e motivo da exclusão.';
  END IF;

  SELECT polo.company_id, polo.nome
  INTO v_company_id, v_polo_nome
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  v_payload := jsonb_build_object(
    'patrimonio_id', p_patrimonio_id,
    'expected_updated_at', p_expected_updated_at,
    'motivo', v_motivo
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || p_request_id::text, 0)
  );

  SELECT evento.*
  INTO v_event
  FROM public.patrimonio_eventos evento
  WHERE evento.company_id = v_company_id
    AND evento.polo_id = p_polo_id
    AND evento.request_id = p_request_id;

  IF FOUND THEN
    IF v_event.tipo IS DISTINCT FROM 'exclusao_cadastro'
       OR v_event.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;
    RETURN v_event.estado_resultante;
  END IF;

  SELECT patrimonio.*
  INTO v_existing
  FROM public.patrimonios patrimonio
  WHERE patrimonio.id = p_patrimonio_id
    AND patrimonio.polo_id = p_polo_id
    AND patrimonio.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Patrimônio não encontrado neste polo.';
  END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'O patrimônio foi alterado por outro usuário. Atualize a lista e tente novamente.'
      USING ERRCODE = '40001';
  END IF;
  IF v_existing.status <> 'ativo' THEN
    RAISE EXCEPTION 'Somente cadastro patrimonial ativo pode ser excluído.';
  END IF;
  IF v_existing.quantidade_baixada > 0
     OR EXISTS (
       SELECT 1
       FROM public.patrimonio_eventos evento
       WHERE evento.patrimonio_id = v_existing.id
         AND evento.tipo = 'baixa_perda'
     ) THEN
    RAISE EXCEPTION 'Patrimônio com baixa por perda não pode ser excluído; preserve o histórico.';
  END IF;

  v_before := public.patrimonio_build_result_json(
    v_existing,
    v_polo_nome,
    NULL,
    NULL,
    true
  );

  UPDATE public.patrimonios patrimonio
  SET
    status = 'excluido',
    ativo = false,
    excluido_at = pg_catalog.clock_timestamp(),
    excluido_by = auth.uid(),
    updated_by = auth.uid(),
    updated_at = pg_catalog.clock_timestamp()
  WHERE patrimonio.id = v_existing.id
  RETURNING * INTO v_result;

  v_after := public.patrimonio_build_result_json(
    v_result,
    v_polo_nome,
    NULL,
    NULL,
    false
  );

  INSERT INTO public.patrimonio_eventos (
    company_id, polo_id, patrimonio_id, request_id, tipo, effective_on,
    quantidade_movimento, quantidade_original, quantidade_baixada,
    quantidade_disponivel, valor_unitario, valor_patrimonial_ativo,
    motivo, payload, estado_anterior, estado_resultante, actor_id
  ) VALUES (
    v_result.company_id, v_result.polo_id, v_result.id, p_request_id,
    'exclusao_cadastro', CURRENT_DATE, NULL, v_result.quantidade,
    v_result.quantidade_baixada, v_result.quantidade_disponivel,
    v_result.valor_unitario, v_result.valor_patrimonial_ativo,
    v_motivo, v_payload, v_before, v_after, auth.uid()
  );

  RETURN v_after;
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_patrimonios_v2_secure(
  p_polo_id uuid,
  p_search text DEFAULT NULL,
  p_tipo_produto_id uuid DEFAULT NULL,
  p_status text DEFAULT 'ativos',
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status text := lower(btrim(coalesce(p_status, 'ativos')));
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))),
    ''
  );
  v_can_view_excluded boolean := (
    coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role'
    OR public.is_gestor_global()
  );
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN (
    'ativo', 'ativos', 'baixado', 'baixados',
    'excluido', 'excluidos', 'todos'
  ) THEN
    RAISE EXCEPTION 'Filtro de status patrimonial inválido.';
  END IF;
  IF v_status IN ('excluido', 'excluidos') AND NOT v_can_view_excluded THEN
    RAISE EXCEPTION 'Somente gestor global pode consultar patrimônios excluídos.'
      USING ERRCODE = '42501';
  END IF;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*
    FROM public.patrimonios patrimonio
    WHERE patrimonio.polo_id = p_polo_id
      AND (p_tipo_produto_id IS NULL OR patrimonio.tipo_produto_id = p_tipo_produto_id)
      AND (
        (v_status IN ('ativo', 'ativos') AND patrimonio.status = 'ativo')
        OR (v_status IN ('baixado', 'baixados') AND patrimonio.status = 'baixado')
        OR (v_status IN ('excluido', 'excluidos') AND patrimonio.status = 'excluido')
        OR (
          v_status = 'todos'
          AND (v_can_view_excluded OR patrimonio.status <> 'excluido')
        )
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          coalesce(patrimonio.tipo_produto, '') || ' '
          || coalesce(patrimonio.descricao, '') || ' '
          || coalesce(patrimonio.numero_serie, '') || ' '
          || coalesce(patrimonio.observacao, '')
        ) LIKE '%' || v_search || '%'
      )
  )
  SELECT count(*) INTO v_total FROM filtrados;

  SELECT coalesce(
    jsonb_agg(item.resultado ORDER BY item.data_aquisicao DESC, item.id DESC),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT
      patrimonio.id,
      patrimonio.data_aquisicao,
      public.patrimonio_build_result_json(
        patrimonio,
        polo.nome,
        ultima_baixa.effective_on,
        ultima_baixa.motivo,
        v_can_view_excluded
      ) AS resultado
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    LEFT JOIN LATERAL (
      SELECT evento.effective_on, evento.motivo
      FROM public.patrimonio_eventos evento
      WHERE evento.patrimonio_id = patrimonio.id
        AND evento.tipo = 'baixa_perda'
      ORDER BY evento.effective_on DESC, evento.created_at DESC, evento.id DESC
      LIMIT 1
    ) ultima_baixa ON true
    WHERE patrimonio.polo_id = p_polo_id
      AND (p_tipo_produto_id IS NULL OR patrimonio.tipo_produto_id = p_tipo_produto_id)
      AND (
        (v_status IN ('ativo', 'ativos') AND patrimonio.status = 'ativo')
        OR (v_status IN ('baixado', 'baixados') AND patrimonio.status = 'baixado')
        OR (v_status IN ('excluido', 'excluidos') AND patrimonio.status = 'excluido')
        OR (
          v_status = 'todos'
          AND (v_can_view_excluded OR patrimonio.status <> 'excluido')
        )
      )
      AND (
        v_search IS NULL
        OR public.financeiro_normalize_search_text(
          coalesce(patrimonio.tipo_produto, '') || ' '
          || coalesce(patrimonio.descricao, '') || ' '
          || coalesce(patrimonio.numero_serie, '') || ' '
          || coalesce(patrimonio.observacao, '')
        ) LIKE '%' || v_search || '%'
      )
    ORDER BY patrimonio.data_aquisicao DESC, patrimonio.id DESC
    LIMIT v_limit OFFSET v_offset
  ) item;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'status', v_status
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.listar_patrimonios_secure(
  p_polo_id uuid,
  p_search text DEFAULT NULL,
  p_tipo_produto text DEFAULT NULL,
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_tipo_produto_id uuid;
  v_tipo_normalizado text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_tipo_produto, ''))),
    ''
  );
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.gestor_has_module('patrimonio')
       AND p_polo_id = ANY(
         coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;

  IF btrim(coalesce(p_tipo_produto, '')) ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_tipo_produto_id := btrim(p_tipo_produto)::uuid;
  ELSIF v_tipo_normalizado IS NOT NULL THEN
    SELECT candidato.tipo_produto_id
    INTO v_tipo_produto_id
    FROM (
      SELECT tipo.id AS tipo_produto_id, 0 AS prioridade
      FROM public.patrimonio_tipos_produto tipo
      WHERE tipo.company_id = v_company_id
        AND tipo.nome_normalizado = v_tipo_normalizado
      UNION ALL
      SELECT patrimonio.tipo_produto_id, 1 AS prioridade
      FROM public.patrimonios patrimonio
      WHERE patrimonio.company_id = v_company_id
        AND public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo_normalizado
    ) candidato
    ORDER BY candidato.prioridade
    LIMIT 1;

    IF v_tipo_produto_id IS NULL THEN
      RETURN jsonb_build_object(
        'items', '[]'::jsonb,
        'total', 0,
        'limit', least(greatest(coalesce(p_limit, 30), 1), 100),
        'offset', greatest(coalesce(p_offset, 0), 0)
      );
    END IF;
  END IF;

  RETURN public.listar_patrimonios_v2_secure(
    p_polo_id,
    p_search,
    v_tipo_produto_id,
    'ativos',
    p_limit,
    p_offset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_caixa_patrimonio_resumo_secure(
  p_polo_id uuid,
  p_competencia date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_inicio date := date_trunc('month', coalesce(p_competencia, CURRENT_DATE))::date;
  v_fim date := (date_trunc('month', coalesce(p_competencia, CURRENT_DATE))
    + interval '1 month - 1 day')::date;
  v_allowed_polo_ids uuid[] := ARRAY[]::uuid[];
  v_registros_ativos bigint := 0;
  v_unidades_ativas bigint := 0;
  v_valor_ativo numeric := 0;
  v_aquisicoes_registros bigint := 0;
  v_aquisicoes_unidades bigint := 0;
  v_aquisicoes_valor numeric := 0;
  v_perdas_movimentos bigint := 0;
  v_perdas_unidades bigint := 0;
  v_perdas_valor numeric := 0;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') = 'service_role' THEN
    IF p_polo_id IS NULL THEN
      SELECT coalesce(array_agg(polo.id), ARRAY[]::uuid[])
      INTO v_allowed_polo_ids
      FROM public.polos polo
      WHERE lower(coalesce(polo.status, 'ativo')) = 'ativo';
    ELSE
      SELECT ARRAY[polo.id]
      INTO v_allowed_polo_ids
      FROM public.polos polo
      WHERE polo.id = p_polo_id
        AND lower(coalesce(polo.status, 'ativo')) = 'ativo';
    END IF;
  ELSE
    IF NOT public.gestor_has_module('caixa') THEN
      RAISE EXCEPTION 'Acesso não autorizado ao resumo patrimonial do Caixa.'
        USING ERRCODE = '42501';
    END IF;

    IF p_polo_id IS NULL THEN
      IF NOT public.is_gestor_global() THEN
        RAISE EXCEPTION 'Somente gestor global pode consultar o patrimônio consolidado.'
          USING ERRCODE = '42501';
      END IF;
      v_allowed_polo_ids := coalesce(
        public.gestor_allowed_polo_ids(),
        ARRAY[]::uuid[]
      );
    ELSIF p_polo_id = ANY(
      coalesce(public.gestor_allowed_polo_ids(), ARRAY[]::uuid[])
    ) THEN
      v_allowed_polo_ids := ARRAY[p_polo_id];
    ELSE
      RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_inicio > date_trunc('month', CURRENT_DATE)::date THEN
    RAISE EXCEPTION 'A competência do resumo patrimonial não pode estar em mês futuro.';
  END IF;

  IF coalesce(pg_catalog.array_length(v_allowed_polo_ids, 1), 0) = 0 THEN
    IF p_polo_id IS NOT NULL THEN
      RAISE EXCEPTION 'O polo informado não está ativo ou não pertence ao escopo.';
    END IF;
    RETURN jsonb_build_object(
      'versao', 1,
      'competencia', v_inicio,
      'escopo_tipo', 'GLOBAL',
      'polo_id', NULL,
      'posicao_fechamento', jsonb_build_object(
        'registros_ativos', 0,
        'unidades_ativas', 0,
        'valor_ativo_custo', '0.00'
      ),
      'aquisicoes_competencia', jsonb_build_object(
        'registros', 0,
        'unidades', 0,
        'valor_custo', '0.00'
      ),
      'perdas_competencia', jsonb_build_object(
        'movimentos', 0,
        'unidades', 0,
        'valor_custo', '0.00'
      ),
      'observacao', 'Posição patrimonial recalculável: não há fechamento patrimonial imutável. Edições econômicas anteriores à primeira baixa são correções cadastrais retroativas; após a primeira baixa, data de aquisição, quantidade e valor unitário permanecem bloqueados. Patrimônio a custo não altera saldo, entradas, saídas ou resultado operacional.'
    );
  END IF;

  WITH perdas_ate_fechamento AS (
    SELECT
      evento.patrimonio_id,
      sum(evento.quantidade_movimento)::integer AS quantidade_baixada
    FROM public.patrimonio_eventos evento
    JOIN public.patrimonios patrimonio ON patrimonio.id = evento.patrimonio_id
    WHERE evento.tipo = 'baixa_perda'
      AND evento.effective_on <= v_fim
      AND evento.polo_id = ANY(v_allowed_polo_ids)
      AND patrimonio.status <> 'excluido'
    GROUP BY evento.patrimonio_id
  ), posicao AS (
    SELECT
      patrimonio.id,
      greatest(
        patrimonio.quantidade - coalesce(perda.quantidade_baixada, 0),
        0
      )::integer AS unidades_ativas,
      round(
        greatest(
          patrimonio.quantidade - coalesce(perda.quantidade_baixada, 0),
          0
        )::numeric * patrimonio.valor_unitario,
        2
      ) AS valor_ativo
    FROM public.patrimonios patrimonio
    LEFT JOIN perdas_ate_fechamento perda
      ON perda.patrimonio_id = patrimonio.id
    WHERE patrimonio.status <> 'excluido'
      AND patrimonio.polo_id = ANY(v_allowed_polo_ids)
      AND patrimonio.data_aquisicao <= v_fim
  )
  SELECT
    count(*) FILTER (WHERE posicao.unidades_ativas > 0),
    coalesce(sum(posicao.unidades_ativas), 0),
    coalesce(sum(posicao.valor_ativo), 0)
  INTO v_registros_ativos, v_unidades_ativas, v_valor_ativo
  FROM posicao;

  SELECT
    count(*),
    coalesce(sum(patrimonio.quantidade), 0),
    coalesce(sum(patrimonio.valor_total), 0)
  INTO v_aquisicoes_registros, v_aquisicoes_unidades, v_aquisicoes_valor
  FROM public.patrimonios patrimonio
  WHERE patrimonio.status <> 'excluido'
    AND patrimonio.polo_id = ANY(v_allowed_polo_ids)
    AND patrimonio.data_aquisicao BETWEEN v_inicio AND v_fim;

  SELECT
    count(*),
    coalesce(sum(evento.quantidade_movimento), 0),
    coalesce(sum(evento.quantidade_movimento::numeric * evento.valor_unitario), 0)
  INTO v_perdas_movimentos, v_perdas_unidades, v_perdas_valor
  FROM public.patrimonio_eventos evento
  JOIN public.patrimonios patrimonio ON patrimonio.id = evento.patrimonio_id
  WHERE evento.tipo = 'baixa_perda'
    AND evento.polo_id = ANY(v_allowed_polo_ids)
    AND evento.effective_on BETWEEN v_inicio AND v_fim
    AND patrimonio.status <> 'excluido';

  RETURN jsonb_build_object(
    'versao', 1,
    'competencia', v_inicio,
    'escopo_tipo', CASE WHEN p_polo_id IS NULL THEN 'GLOBAL' ELSE 'POLO' END,
    'polo_id', p_polo_id,
    'posicao_fechamento', jsonb_build_object(
      'registros_ativos', v_registros_ativos,
      'unidades_ativas', v_unidades_ativas,
      'valor_ativo_custo', round(v_valor_ativo, 2)::text
    ),
    'aquisicoes_competencia', jsonb_build_object(
      'registros', v_aquisicoes_registros,
      'unidades', v_aquisicoes_unidades,
      'valor_custo', round(v_aquisicoes_valor, 2)::text
    ),
    'perdas_competencia', jsonb_build_object(
      'movimentos', v_perdas_movimentos,
      'unidades', v_perdas_unidades,
      'valor_custo', round(v_perdas_valor, 2)::text
    ),
    'observacao', 'Posição patrimonial recalculável: não há fechamento patrimonial imutável. Edições econômicas anteriores à primeira baixa são correções cadastrais retroativas; após a primeira baixa, data de aquisição, quantidade e valor unitário permanecem bloqueados. Patrimônio a custo não altera saldo, entradas, saídas ou resultado operacional.'
  );
END;
$function$;

COMMENT ON FUNCTION public.get_caixa_patrimonio_resumo_secure(uuid, date) IS
  'Prestação patrimonial recalculável: não há fechamento patrimonial imutável. Edições econômicas anteriores à primeira baixa são correções cadastrais retroativas; após a primeira baixa, data de aquisição, quantidade e valor unitário permanecem bloqueados.';

REVOKE ALL ON FUNCTION public.criar_patrimonio_v2_secure(
  uuid, uuid, date, uuid, text, integer, numeric, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_patrimonio_secure(
  uuid, uuid, date, text, text, integer, numeric, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_patrimonio_secure(
  uuid, uuid, uuid, timestamptz, date, uuid, text, integer, numeric, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.baixar_patrimonio_perda_secure(
  uuid, uuid, uuid, timestamptz, date, integer, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.excluir_patrimonio_secure(
  uuid, uuid, uuid, timestamptz, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_patrimonios_v2_secure(
  uuid, text, uuid, text, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_patrimonios_secure(
  uuid, text, text, integer, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_caixa_patrimonio_resumo_secure(uuid, date)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.criar_patrimonio_v2_secure(
  uuid, uuid, date, uuid, text, integer, numeric, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_patrimonio_secure(
  uuid, uuid, date, text, text, integer, numeric, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_patrimonio_secure(
  uuid, uuid, uuid, timestamptz, date, uuid, text, integer, numeric, text, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.baixar_patrimonio_perda_secure(
  uuid, uuid, uuid, timestamptz, date, integer, text, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_patrimonio_secure(
  uuid, uuid, uuid, timestamptz, text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_patrimonios_v2_secure(
  uuid, text, uuid, text, integer, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_patrimonios_secure(
  uuid, text, text, integer, integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_caixa_patrimonio_resumo_secure(uuid, date)
  TO authenticated, service_role;

COMMIT;
