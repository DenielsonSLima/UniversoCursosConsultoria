-- Catálogo empresarial de tipos de produto do Patrimônio.
--
-- O nome textual permanece em patrimonios como snapshot histórico. Novos
-- cadastros usam o vínculo canônico por UUID e o banco continua aceitando a
-- assinatura legada durante a transição do frontend publicado.

BEGIN;

CREATE TABLE public.patrimonio_tipos_produto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  nome text NOT NULL,
  nome_normalizado text GENERATED ALWAYS AS (
    public.financeiro_normalize_search_text(btrim(nome))
  ) STORED,
  descricao text,
  status text NOT NULL DEFAULT 'ativo',
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT patrimonio_tipos_produto_nome_not_blank_chk
    CHECK (nullif(btrim(nome), '') IS NOT NULL),
  CONSTRAINT patrimonio_tipos_produto_status_chk
    CHECK (status IN ('ativo', 'inativo')),
  CONSTRAINT patrimonio_tipos_produto_company_request_uidx
    UNIQUE (company_id, request_id),
  CONSTRAINT patrimonio_tipos_produto_company_id_uidx
    UNIQUE (company_id, id)
);

CREATE UNIQUE INDEX patrimonio_tipos_produto_company_nome_ativo_uidx
  ON public.patrimonio_tipos_produto (company_id, nome_normalizado)
  WHERE deleted_at IS NULL;

CREATE INDEX patrimonio_tipos_produto_company_status_nome_idx
  ON public.patrimonio_tipos_produto (company_id, status, nome_normalizado)
  WHERE deleted_at IS NULL;

ALTER TABLE public.patrimonio_tipos_produto ENABLE ROW LEVEL SECURITY;

-- A tabela é deliberadamente RPC-only. RLS permanece habilitada como defesa
-- em profundidade caso algum grant seja ampliado no futuro.
REVOKE ALL ON TABLE public.patrimonio_tipos_produto
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.patrimonio_tipos_produto TO service_role;

CREATE OR REPLACE FUNCTION public.patrimonio_tipo_produto_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.patrimonio_tipo_produto_touch_updated_at()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER patrimonio_tipos_produto_touch_updated_at
BEFORE UPDATE ON public.patrimonio_tipos_produto
FOR EACH ROW
EXECUTE FUNCTION public.patrimonio_tipo_produto_touch_updated_at();

-- As opções publicadas anteriormente passam a existir em toda empresa. O
-- request_id usa o default e não depende de UUIDs globais compartilhados.
INSERT INTO public.patrimonio_tipos_produto (
  company_id,
  nome,
  descricao,
  status
)
SELECT
  empresa.id,
  seed.nome,
  seed.descricao,
  'ativo'
FROM public.empresas empresa
CROSS JOIN (
  VALUES
    ('Equipamento de informática', 'Equipamentos de informática e tecnologia'),
    ('Mobiliário', 'Móveis e itens de ambientação'),
    ('Equipamento pedagógico', 'Equipamentos usados em atividades pedagógicas'),
    ('Veículo', 'Veículos vinculados à operação'),
    ('Eletrônico', 'Equipamentos eletrônicos em geral'),
    ('Instrumento', 'Instrumentos e ferramentas especializadas'),
    ('Outro', 'Outros tipos de bens patrimoniais')
) AS seed(nome, descricao)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.patrimonio_tipos_produto existente
  WHERE existente.company_id = empresa.id
    AND existente.deleted_at IS NULL
    AND existente.nome_normalizado = public.financeiro_normalize_search_text(seed.nome)
);

-- Todo texto histórico, inclusive opções livres que nunca fizeram parte da
-- constante do frontend, recebe um tipo canônico antes da FK ser exigida.
WITH historicos AS (
  SELECT
    patrimonio.company_id,
    btrim(patrimonio.tipo_produto) AS nome,
    public.financeiro_normalize_search_text(btrim(patrimonio.tipo_produto)) AS nome_normalizado,
    row_number() OVER (
      PARTITION BY
        patrimonio.company_id,
        public.financeiro_normalize_search_text(btrim(patrimonio.tipo_produto))
      ORDER BY patrimonio.created_at, patrimonio.id
    ) AS ordem
  FROM public.patrimonios patrimonio
  WHERE nullif(btrim(patrimonio.tipo_produto), '') IS NOT NULL
)
INSERT INTO public.patrimonio_tipos_produto (
  company_id,
  nome,
  descricao,
  status
)
SELECT
  historico.company_id,
  historico.nome,
  'Tipo preservado do histórico de patrimônio',
  'ativo'
FROM historicos historico
WHERE historico.ordem = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.patrimonio_tipos_produto existente
    WHERE existente.company_id = historico.company_id
      AND existente.deleted_at IS NULL
      AND existente.nome_normalizado = historico.nome_normalizado
  );

ALTER TABLE public.patrimonios
  ADD COLUMN tipo_produto_id uuid;

UPDATE public.patrimonios patrimonio
SET tipo_produto_id = tipo.id
FROM public.patrimonio_tipos_produto tipo
WHERE tipo.company_id = patrimonio.company_id
  AND tipo.deleted_at IS NULL
  AND tipo.nome_normalizado = public.financeiro_normalize_search_text(
    btrim(patrimonio.tipo_produto)
  );

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.patrimonios patrimonio
    WHERE patrimonio.tipo_produto_id IS NULL
  ) THEN
    RAISE EXCEPTION 'O backfill não vinculou todos os patrimônios a um tipo de produto.';
  END IF;
END;
$migration$;

ALTER TABLE public.patrimonios
  ALTER COLUMN tipo_produto_id SET NOT NULL,
  ADD CONSTRAINT patrimonios_company_tipo_produto_fkey
    FOREIGN KEY (company_id, tipo_produto_id)
    REFERENCES public.patrimonio_tipos_produto(company_id, id)
    ON DELETE RESTRICT;

CREATE INDEX patrimonios_polo_tipo_data_id_ativos_idx
  ON public.patrimonios (
    polo_id,
    tipo_produto_id,
    data_aquisicao DESC,
    id DESC
  )
  WHERE ativo = true;

CREATE OR REPLACE FUNCTION public.listar_patrimonio_tipos_produto_secure(
  p_polo_id uuid,
  p_incluir_inativos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_result jsonb := '[]'::jsonb;
BEGIN
  -- Autoriza antes de consultar polo, empresa ou catálogo.
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       (
         public.is_financeiro_for_polo(p_polo_id)
         AND public.gestor_has_module('patrimonio')
       )
       OR (
         public.is_gestor_global()
         AND public.gestor_has_module('configuracoes')
       )
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado aos tipos de produto do patrimônio.'
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

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tipo.id,
        'company_id', tipo.company_id,
        'nome', tipo.nome,
        'descricao', tipo.descricao,
        'status', tipo.status,
        'usage_count', tipo.usage_count,
        'can_delete', tipo.usage_count = 0,
        'created_at', tipo.created_at,
        'updated_at', tipo.updated_at
      )
      ORDER BY
        CASE WHEN tipo.status = 'ativo' THEN 0 ELSE 1 END,
        tipo.nome_normalizado,
        tipo.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT
      catalogo.*,
      count(patrimonio.id)::bigint AS usage_count
    FROM public.patrimonio_tipos_produto catalogo
    LEFT JOIN public.patrimonios patrimonio
      ON patrimonio.company_id = catalogo.company_id
     AND patrimonio.tipo_produto_id = catalogo.id
    WHERE catalogo.company_id = v_company_id
      AND catalogo.deleted_at IS NULL
      AND (coalesce(p_incluir_inativos, false) OR catalogo.status = 'ativo')
    GROUP BY catalogo.id
  ) tipo;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.criar_patrimonio_tipo_produto_secure(
  p_request_id uuid,
  p_polo_matriz_id uuid,
  p_nome text,
  p_descricao text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.patrimonio_tipos_produto%rowtype;
  v_result public.patrimonio_tipos_produto%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_usage_count bigint := 0;
  v_duplicate_status text;
BEGIN
  -- A autorização da Matriz precede lookup de request_id e de catálogo.
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_gestor_global()
       AND public.gestor_has_module('configuracoes')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode criar tipos de produto.'
      USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_matriz_id
    AND polo.is_matriz = true
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um polo Matriz ativo para administrar os tipos de produto.';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;
  IF nullif(v_nome, '') IS NULL THEN
    RAISE EXCEPTION 'Informe um nome válido para o tipo de produto.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':' || p_request_id::text, 0)
  );

  SELECT tipo.*
  INTO v_existing
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.company_id = v_company_id
    AND tipo.request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.nome_normalizado IS DISTINCT FROM
         public.financeiro_normalize_search_text(v_nome)
       OR v_existing.descricao IS DISTINCT FROM v_descricao THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes.';
    END IF;

    SELECT count(*)
    INTO v_usage_count
    FROM public.patrimonios patrimonio
    WHERE patrimonio.company_id = v_existing.company_id
      AND patrimonio.tipo_produto_id = v_existing.id;

    RETURN jsonb_build_object(
      'id', v_existing.id,
      'company_id', v_existing.company_id,
      'nome', v_existing.nome,
      'descricao', v_existing.descricao,
      'status', v_existing.status,
      'usage_count', v_usage_count,
      'can_delete', v_usage_count = 0,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at
    );
  END IF;

  SELECT tipo.status
  INTO v_duplicate_status
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.company_id = v_company_id
    AND tipo.deleted_at IS NULL
    AND tipo.nome_normalizado = public.financeiro_normalize_search_text(v_nome);

  IF v_duplicate_status = 'inativo' THEN
    RAISE EXCEPTION 'Já existe um tipo de produto inativo com este nome; reative em Configurações.';
  ELSIF v_duplicate_status = 'ativo' THEN
    RAISE EXCEPTION 'Já existe um tipo de produto com este nome.';
  END IF;

  BEGIN
    INSERT INTO public.patrimonio_tipos_produto (
      company_id,
      nome,
      descricao,
      status,
      request_id,
      created_by,
      updated_by
    ) VALUES (
      v_company_id,
      v_nome,
      v_descricao,
      'ativo',
      p_request_id,
      auth.uid(),
      auth.uid()
    )
    RETURNING * INTO v_result;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT tipo.status
      INTO v_duplicate_status
      FROM public.patrimonio_tipos_produto tipo
      WHERE tipo.company_id = v_company_id
        AND tipo.deleted_at IS NULL
        AND tipo.nome_normalizado = public.financeiro_normalize_search_text(v_nome);

      IF v_duplicate_status = 'inativo' THEN
        RAISE EXCEPTION 'Já existe um tipo de produto inativo com este nome; reative em Configurações.';
      END IF;
      RAISE EXCEPTION 'Já existe um tipo de produto com este nome.';
  END;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'company_id', v_result.company_id,
    'nome', v_result.nome,
    'descricao', v_result.descricao,
    'status', v_result.status,
    'usage_count', 0,
    'can_delete', true,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.atualizar_patrimonio_tipo_produto_secure(
  p_tipo_id uuid,
  p_polo_matriz_id uuid,
  p_nome text,
  p_descricao text,
  p_status text,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.patrimonio_tipos_produto%rowtype;
  v_result public.patrimonio_tipos_produto%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_descricao text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_usage_count bigint := 0;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_gestor_global()
       AND public.gestor_has_module('configuracoes')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode alterar tipos de produto.'
      USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_matriz_id
    AND polo.is_matriz = true
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um polo Matriz ativo para administrar os tipos de produto.';
  END IF;
  IF nullif(v_nome, '') IS NULL OR v_status NOT IN ('ativo', 'inativo') THEN
    RAISE EXCEPTION 'Informe nome e status válidos para o tipo de produto.';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'A versão esperada do tipo de produto é obrigatória.';
  END IF;

  SELECT tipo.*
  INTO v_existing
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.id = p_tipo_id
    AND tipo.company_id = v_company_id
    AND tipo.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de produto não encontrado.';
  END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'O tipo de produto foi alterado por outro usuário. Atualize a lista e tente novamente.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.patrimonio_tipos_produto tipo
  SET
    nome = v_nome,
    descricao = v_descricao,
    status = v_status,
    updated_by = auth.uid(),
    updated_at = pg_catalog.now()
  WHERE tipo.id = v_existing.id
    AND tipo.company_id = v_existing.company_id
  RETURNING * INTO v_result;

  SELECT count(*)
  INTO v_usage_count
  FROM public.patrimonios patrimonio
  WHERE patrimonio.company_id = v_result.company_id
    AND patrimonio.tipo_produto_id = v_result.id;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'company_id', v_result.company_id,
    'nome', v_result.nome,
    'descricao', v_result.descricao,
    'status', v_result.status,
    'usage_count', v_usage_count,
    'can_delete', v_usage_count = 0,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.excluir_patrimonio_tipo_produto_secure(
  p_tipo_id uuid,
  p_polo_matriz_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_existing public.patrimonio_tipos_produto%rowtype;
  v_result public.patrimonio_tipos_produto%rowtype;
  v_usage_count bigint := 0;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_gestor_global()
       AND public.gestor_has_module('configuracoes')
     ) THEN
    RAISE EXCEPTION 'Apenas a Matriz autorizada pode excluir tipos de produto.'
      USING ERRCODE = '42501';
  END IF;

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_matriz_id
    AND polo.is_matriz = true
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um polo Matriz ativo para administrar os tipos de produto.';
  END IF;

  SELECT tipo.*
  INTO v_existing
  FROM public.patrimonio_tipos_produto tipo
  WHERE tipo.id = p_tipo_id
    AND tipo.company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tipo de produto não encontrado.';
  END IF;

  -- A exclusão lógica repetida é idempotente, inclusive com o timestamp
  -- anterior enviado pela primeira tentativa.
  IF v_existing.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'company_id', v_existing.company_id,
      'nome', v_existing.nome,
      'descricao', v_existing.descricao,
      'status', v_existing.status,
      'usage_count', 0,
      'can_delete', true,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at
    );
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'A versão esperada do tipo de produto é obrigatória.';
  END IF;
  IF v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'O tipo de produto foi alterado por outro usuário. Atualize a lista e tente novamente.'
      USING ERRCODE = '40001';
  END IF;

  SELECT count(*)
  INTO v_usage_count
  FROM public.patrimonios patrimonio
  WHERE patrimonio.company_id = v_existing.company_id
    AND patrimonio.tipo_produto_id = v_existing.id;

  IF v_usage_count > 0 THEN
    RAISE EXCEPTION 'Este tipo possui patrimônios vinculados e deve ser apenas inativado.';
  END IF;

  UPDATE public.patrimonio_tipos_produto tipo
  SET
    status = 'inativo',
    deleted_at = pg_catalog.now(),
    updated_by = auth.uid(),
    updated_at = pg_catalog.now()
  WHERE tipo.id = v_existing.id
    AND tipo.company_id = v_existing.company_id
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'id', v_result.id,
    'company_id', v_result.company_id,
    'nome', v_result.nome,
    'descricao', v_result.descricao,
    'status', v_result.status,
    'usage_count', 0,
    'can_delete', true,
    'created_at', v_result.created_at,
    'updated_at', v_result.updated_at
  );
END;
$function$;

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
  v_tipo public.patrimonio_tipos_produto%rowtype;
  v_existing public.patrimonios%rowtype;
  v_result public.patrimonios%rowtype;
BEGIN
  -- Autoriza antes de qualquer lookup por request_id ou tipo de produto.
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
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

  SELECT polo.company_id
  INTO v_company_id
  FROM public.polos polo
  WHERE polo.id = p_polo_id
    AND lower(coalesce(polo.status, 'ativo')) = 'ativo';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'O polo informado não está ativo ou não possui empresa vinculada.';
  END IF;
  IF p_data_aquisicao IS NULL
     OR p_tipo_produto_id IS NULL
     OR nullif(btrim(coalesce(p_descricao, '')), '') IS NULL
     OR coalesce(p_quantidade, 0) < 1
     OR p_valor_unitario IS NULL
     OR p_valor_unitario < 0 THEN
    RAISE EXCEPTION 'Informe data, tipo, descrição, quantidade e valor unitário válidos.';
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

  BEGIN
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
      created_by
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
      auth.uid()
    )
    RETURNING * INTO v_result;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'A chave de idempotência já foi usada.';
  END;

  RETURN v_result;
END;
$function$;

-- Mantém a assinatura publicada baseada em texto. Em replay, o snapshot é
-- validado antes do estado atual do catálogo; criações novas exigem tipo ativo.
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
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado para cadastrar patrimônio neste polo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'A chave de idempotência é obrigatória.';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_id::text, 0)
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
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_tipo_produto_id uuid := CASE
    WHEN btrim(coalesce(p_tipo_produto, '')) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN btrim(p_tipo_produto)::uuid
    ELSE NULL
  END;
  v_search text := nullif(
    public.financeiro_normalize_search_text(btrim(coalesce(p_search, ''))),
    ''
  );
  v_tipo text := CASE
    WHEN v_tipo_produto_id IS NULL THEN nullif(
      public.financeiro_normalize_search_text(btrim(coalesce(p_tipo_produto, ''))),
      ''
    )
    ELSE NULL
  END;
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF coalesce((SELECT auth.jwt() ->> 'role'), '') <> 'service_role'
     AND NOT (
       public.is_financeiro_for_polo(p_polo_id)
       AND public.gestor_has_module('patrimonio')
     ) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao patrimônio deste polo.'
      USING ERRCODE = '42501';
  END IF;

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        (v_tipo_produto_id IS NULL AND v_tipo IS NULL)
        OR (
          v_tipo_produto_id IS NOT NULL
          AND patrimonio.tipo_produto_id = v_tipo_produto_id
        )
        OR (
          v_tipo_produto_id IS NULL
          AND (
            public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
            OR EXISTS (
              SELECT 1
              FROM public.patrimonio_tipos_produto tipo_atual
              WHERE tipo_atual.company_id = patrimonio.company_id
                AND tipo_atual.id = patrimonio.tipo_produto_id
                AND tipo_atual.nome_normalizado = v_tipo
            )
          )
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

  WITH filtrados AS MATERIALIZED (
    SELECT patrimonio.*, polo.nome AS polo_nome
    FROM public.patrimonios patrimonio
    JOIN public.polos polo ON polo.id = patrimonio.polo_id
    WHERE patrimonio.ativo = true
      AND patrimonio.polo_id = p_polo_id
      AND (
        (v_tipo_produto_id IS NULL AND v_tipo IS NULL)
        OR (
          v_tipo_produto_id IS NOT NULL
          AND patrimonio.tipo_produto_id = v_tipo_produto_id
        )
        OR (
          v_tipo_produto_id IS NULL
          AND (
            public.financeiro_normalize_search_text(patrimonio.tipo_produto) = v_tipo
            OR EXISTS (
              SELECT 1
              FROM public.patrimonio_tipos_produto tipo_atual
              WHERE tipo_atual.company_id = patrimonio.company_id
                AND tipo_atual.id = patrimonio.tipo_produto_id
                AND tipo_atual.nome_normalizado = v_tipo
            )
          )
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
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'company_id', item.company_id,
        'polo_id', item.polo_id,
        'polo_nome', item.polo_nome,
        'data_aquisicao', item.data_aquisicao,
        'tipo_produto_id', item.tipo_produto_id,
        'tipo_produto', item.tipo_produto,
        'descricao', item.descricao,
        'quantidade', item.quantidade,
        'valor_unitario', item.valor_unitario::text,
        'valor_total', item.valor_total::text,
        'numero_serie', item.numero_serie,
        'observacao', item.observacao,
        'created_at', item.created_at
      )
      ORDER BY item.data_aquisicao DESC, item.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_items
  FROM (
    SELECT *
    FROM filtrados
    ORDER BY data_aquisicao DESC, id DESC
    LIMIT v_limit OFFSET v_offset
  ) item;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.listar_patrimonio_tipos_produto_secure(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_patrimonio_tipo_produto_secure(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atualizar_patrimonio_tipo_produto_secure(uuid, uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.excluir_patrimonio_tipo_produto_secure(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_patrimonio_v2_secure(uuid, uuid, date, uuid, text, integer, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_patrimonio_secure(uuid, uuid, date, text, text, integer, numeric, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.listar_patrimonios_secure(uuid, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.listar_patrimonio_tipos_produto_secure(uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_patrimonio_tipo_produto_secure(uuid, uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.atualizar_patrimonio_tipo_produto_secure(uuid, uuid, text, text, text, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.excluir_patrimonio_tipo_produto_secure(uuid, uuid, timestamptz)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_patrimonio_v2_secure(uuid, uuid, date, uuid, text, integer, numeric, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_patrimonio_secure(uuid, uuid, date, text, text, integer, numeric, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.listar_patrimonios_secure(uuid, text, text, integer, integer)
  TO authenticated, service_role;

COMMIT;
