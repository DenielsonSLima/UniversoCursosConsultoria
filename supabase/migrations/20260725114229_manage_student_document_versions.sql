BEGIN;
-- Versao registrada pelo MCP Supabase: 20260725114229.

CREATE OR REPLACE FUNCTION public.mapear_paginas_pdf_documento_aluno(
  p_lote_id uuid,
  p_mapeamentos jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.documentos_aluno_lotes;
  v_arquivo public.documentos_aluno_arquivos;
  v_item jsonb;
  v_documento_id uuid;
  v_inicio integer;
  v_fim integer;
  v_numero integer;
  v_versao_id uuid;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_mapeamentos) <> 'array'
    OR jsonb_array_length(p_mapeamentos) = 0
  THEN
    RAISE EXCEPTION 'Mapeie ao menos um documento.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL
    OR v_lote.modo <> 'pdf_unico'
    OR v_lote.status <> 'aguardando_mapeamento'
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_lote.aluno_id)
  THEN
    RAISE EXCEPTION 'PDF fora do escopo do gestor ou ja processado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_arquivo
  FROM public.documentos_aluno_arquivos
  WHERE lote_id = v_lote.id
    AND status = 'enviado'
    AND mime_type = 'application/pdf'
  ORDER BY criado_em
  LIMIT 1
  FOR UPDATE;

  IF v_arquivo.id IS NULL OR v_arquivo.total_paginas IS NULL THEN
    RAISE EXCEPTION 'Informe o total de paginas do PDF antes do mapeamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT item ->> 'documento_id')
  INTO v_total
  FROM jsonb_array_elements(p_mapeamentos) item;
  IF v_total <> jsonb_array_length(p_mapeamentos)
    OR v_total <> cardinality(v_lote.documento_ids)
  THEN
    RAISE EXCEPTION 'Mapeie uma unica vez todos os itens selecionados no envio.'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_mapeamentos)
  LOOP
    BEGIN
      v_documento_id := (v_item ->> 'documento_id')::uuid;
      v_inicio := (v_item ->> 'pagina_inicio')::integer;
      v_fim := (v_item ->> 'pagina_fim')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Intervalo de paginas invalido.' USING ERRCODE = '22023';
    END;

    IF v_documento_id <> ALL(v_lote.documento_ids)
      OR v_inicio < 1
      OR v_fim < v_inicio
      OR v_fim > v_arquivo.total_paginas
    THEN
      RAISE EXCEPTION 'Documento ou intervalo fora dos limites do PDF.'
        USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.documentos_aluno
    WHERE id = v_documento_id
      AND aluno_id = v_lote.aluno_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM public.documentos_aluno documento
      JOIN public.documentos_aluno_versoes atual
        ON atual.id = documento.versao_atual_id
      WHERE documento.id = v_documento_id
        AND atual.status NOT IN ('recusado', 'arquivado')
    ) THEN
      RAISE EXCEPTION 'Um dos documentos recebeu outro envio durante o mapeamento.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.documentos_aluno_versoes
    SET atual = false
    WHERE documento_id = v_documento_id
      AND atual;

    SELECT coalesce(max(numero), 0) + 1 INTO v_numero
    FROM public.documentos_aluno_versoes
    WHERE documento_id = v_documento_id;

    INSERT INTO public.documentos_aluno_versoes (
      documento_id, lote_id, numero, status, atual, enviado_por_auth_uid
    )
    VALUES (
      v_documento_id,
      v_lote.id,
      v_numero,
      'pendente',
      true,
      v_lote.criado_por_auth_uid
    )
    RETURNING id INTO v_versao_id;

    INSERT INTO public.documentos_aluno_versao_fontes (
      versao_id, arquivo_id, pagina_inicio, pagina_fim, ordem
    )
    VALUES (v_versao_id, v_arquivo.id, v_inicio, v_fim, 1);

    UPDATE public.documentos_aluno
    SET versao_atual_id = v_versao_id,
        arquivo_url = NULL,
        arquivo_bucket = v_arquivo.bucket,
        arquivo_path = v_arquivo.path,
        status = 'pendente',
        observacao = NULL,
        revisado_em = NULL,
        revisado_por = NULL,
        updated_at = now()
    WHERE id = v_documento_id;

    INSERT INTO public.documentos_aluno_eventos (
      aluno_id,
      documento_id,
      versao_id,
      arquivo_id,
      lote_id,
      evento,
      ator_usuario_id,
      detalhes
    )
    VALUES (
      v_lote.aluno_id,
      v_documento_id,
      v_versao_id,
      v_arquivo.id,
      v_lote.id,
      'pdf_mapeado',
      public.documentos_aluno_usuario_atual_id(),
      jsonb_build_object('pagina_inicio', v_inicio, 'pagina_fim', v_fim)
    );
  END LOOP;

  UPDATE public.documentos_aluno_lotes
  SET status = 'finalizado',
      finalizado_em = coalesce(finalizado_em, now())
  WHERE id = v_lote.id;

  RETURN jsonb_build_object('lote_id', v_lote.id, 'status', 'finalizado');
END;
$$;

REVOKE ALL ON FUNCTION public.mapear_paginas_pdf_documento_aluno(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mapear_paginas_pdf_documento_aluno(uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revisar_versao_documento_aluno(
  p_versao_id uuid,
  p_status text,
  p_observacao text DEFAULT NULL
)
RETURNS public.documentos_aluno_versoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_versao public.documentos_aluno_versoes;
  v_aluno_id uuid;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_observacao text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_usuario_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF v_status NOT IN ('aprovado', 'recusado') THEN
    RAISE EXCEPTION 'Decisao de revisao invalida.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'recusado' AND v_observacao IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da recusa.' USING ERRCODE = '22023';
  END IF;

  SELECT versao.*
  INTO v_versao
  FROM public.documentos_aluno_versoes versao
  JOIN public.documentos_aluno documento ON documento.id = versao.documento_id
  WHERE versao.id = p_versao_id
  FOR UPDATE OF versao;

  SELECT aluno_id INTO v_aluno_id
  FROM public.documentos_aluno
  WHERE id = v_versao.documento_id;

  IF v_versao.id IS NULL
    OR NOT v_versao.atual
    OR v_versao.status <> 'pendente'
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
  THEN
    RAISE EXCEPTION 'Versao indisponivel para revisao.' USING ERRCODE = '42501';
  END IF;

  v_usuario_id := public.documentos_aluno_usuario_atual_id();

  UPDATE public.documentos_aluno_versoes
  SET status = v_status,
      motivo_recusa = CASE WHEN v_status = 'recusado' THEN v_observacao ELSE NULL END,
      revisado_por = v_usuario_id,
      revisado_em = now()
  WHERE id = v_versao.id
  RETURNING * INTO v_versao;

  UPDATE public.documentos_aluno
  SET status = v_status,
      observacao = CASE WHEN v_status = 'recusado' THEN v_observacao ELSE NULL END,
      revisado_por = v_usuario_id,
      revisado_em = now(),
      updated_at = now()
  WHERE id = v_versao.documento_id;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, documento_id, versao_id, lote_id, evento, ator_usuario_id, detalhes
  )
  VALUES (
    v_aluno_id,
    v_versao.documento_id,
    v_versao.id,
    v_versao.lote_id,
    CASE WHEN v_status = 'aprovado' THEN 'versao_aprovada' ELSE 'versao_recusada' END,
    v_usuario_id,
    jsonb_build_object('observacao', v_observacao)
  );

  RETURN v_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_versao_documento_aluno(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_versao_documento_aluno(uuid, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.arquivar_versao_documento_aluno(
  p_versao_id uuid,
  p_motivo text
)
RETURNS public.documentos_aluno_versoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_versao public.documentos_aluno_versoes;
  v_aluno_id uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_usuario_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do arquivamento.' USING ERRCODE = '22023';
  END IF;

  SELECT versao.*
  INTO v_versao
  FROM public.documentos_aluno_versoes versao
  JOIN public.documentos_aluno documento ON documento.id = versao.documento_id
  WHERE versao.id = p_versao_id
  FOR UPDATE OF versao;

  SELECT aluno_id INTO v_aluno_id
  FROM public.documentos_aluno
  WHERE id = v_versao.documento_id;

  IF v_versao.id IS NULL
    OR v_versao.status = 'arquivado'
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
  THEN
    RAISE EXCEPTION 'Versao indisponivel para arquivamento.' USING ERRCODE = '42501';
  END IF;

  v_usuario_id := public.documentos_aluno_usuario_atual_id();
  UPDATE public.documentos_aluno_versoes
  SET status = 'arquivado',
      atual = false,
      motivo_arquivamento = v_motivo,
      arquivado_por = v_usuario_id,
      arquivado_em = now()
  WHERE id = v_versao.id
  RETURNING * INTO v_versao;

  UPDATE public.documentos_aluno
  SET versao_atual_id = NULL,
      arquivo_url = NULL,
      arquivo_bucket = NULL,
      arquivo_path = NULL,
      status = 'pendente',
      observacao = NULL,
      revisado_por = NULL,
      revisado_em = NULL,
      updated_at = now()
  WHERE id = v_versao.documento_id
    AND versao_atual_id = v_versao.id;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, documento_id, versao_id, lote_id, evento, ator_usuario_id, detalhes
  )
  VALUES (
    v_aluno_id,
    v_versao.documento_id,
    v_versao.id,
    v_versao.lote_id,
    'versao_arquivada',
    v_usuario_id,
    jsonb_build_object('motivo', v_motivo)
  );

  RETURN v_versao;
END;
$$;

REVOKE ALL ON FUNCTION public.arquivar_versao_documento_aluno(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arquivar_versao_documento_aluno(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.solicitar_exclusao_arquivo_documento_aluno(
  p_arquivo_id uuid,
  p_motivo text
)
RETURNS public.documentos_aluno_exclusoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_arquivo public.documentos_aluno_arquivos;
  v_exclusao public.documentos_aluno_exclusoes;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_usuario_id uuid;
  v_ativos integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa da exclusao.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_arquivo
  FROM public.documentos_aluno_arquivos
  WHERE id = p_arquivo_id
  FOR UPDATE;

  IF v_arquivo.id IS NULL
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_arquivo.aluno_id)
  THEN
    RAISE EXCEPTION 'Arquivo indisponivel para exclusao.' USING ERRCODE = '42501';
  END IF;

  IF v_arquivo.status = 'excluido' THEN
    SELECT * INTO v_exclusao
    FROM public.documentos_aluno_exclusoes
    WHERE arquivo_id = v_arquivo.id
      AND status = 'concluida'
    ORDER BY processado_em DESC NULLS LAST
    LIMIT 1;

    IF v_exclusao.id IS NOT NULL THEN
      RETURN v_exclusao;
    END IF;
    RAISE EXCEPTION 'Arquivo excluido sem registro administrativo correspondente.'
      USING ERRCODE = '22023';
  END IF;

  IF v_arquivo.status = 'exclusao_pendente' THEN
    SELECT * INTO v_exclusao
    FROM public.documentos_aluno_exclusoes
    WHERE arquivo_id = v_arquivo.id
      AND status IN ('pendente', 'processando', 'falhou')
    ORDER BY solicitado_em DESC
    LIMIT 1;

    IF v_exclusao.id IS NOT NULL THEN
      RETURN v_exclusao;
    END IF;
    RAISE EXCEPTION 'Arquivo com exclusao ja em processamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT count(DISTINCT versao.documento_id)
  INTO v_ativos
  FROM public.documentos_aluno_versao_fontes fonte
  JOIN public.documentos_aluno_versoes versao ON versao.id = fonte.versao_id
  WHERE fonte.arquivo_id = v_arquivo.id
    AND versao.atual
    AND versao.status <> 'arquivado';

  IF v_ativos > 0 THEN
    RAISE EXCEPTION
      'O arquivo ainda pertence a uma versao ativa. Arquive-a antes de excluir.'
      USING ERRCODE = '22023';
  END IF;

  v_usuario_id := public.documentos_aluno_usuario_atual_id();

  UPDATE public.documentos_aluno_arquivos
  SET status = 'exclusao_pendente'
  WHERE id = v_arquivo.id;

  INSERT INTO public.documentos_aluno_exclusoes (
    arquivo_id,
    aluno_id,
    motivo,
    solicitado_por,
    solicitado_por_auth_uid
  )
  VALUES (
    v_arquivo.id,
    v_arquivo.aluno_id,
    v_motivo,
    v_usuario_id,
    auth.uid()
  )
  RETURNING * INTO v_exclusao;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, arquivo_id, lote_id, evento, ator_usuario_id, detalhes
  )
  VALUES (
    v_arquivo.aluno_id,
    v_arquivo.id,
    v_arquivo.lote_id,
    'exclusao_solicitada',
    v_usuario_id,
    jsonb_build_object(
      'exclusao_id', v_exclusao.id,
      'motivo', v_motivo
    )
  );

  RETURN v_exclusao;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_exclusao_arquivo_documento_aluno(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_exclusao_arquivo_documento_aluno(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.solicitar_exclusao_arquivos_documento_aluno(
  p_arquivo_ids uuid[],
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_arquivo_id uuid;
  v_exclusao public.documentos_aluno_exclusoes;
  v_resultado jsonb := '[]'::jsonb;
BEGIN
  IF cardinality(coalesce(p_arquivo_ids, '{}'::uuid[])) NOT BETWEEN 1 AND 5
    OR (
      SELECT count(DISTINCT arquivo_id)
      FROM unnest(coalesce(p_arquivo_ids, '{}'::uuid[])) AS ids(arquivo_id)
    ) <> cardinality(p_arquivo_ids)
  THEN
    RAISE EXCEPTION 'Informe de um a cinco arquivos distintos.'
      USING ERRCODE = '22023';
  END IF;

  -- A fila inteira e criada na mesma transacao; qualquer falha desfaz o grupo.
  FOR v_arquivo_id IN
    SELECT arquivo_id
    FROM unnest(p_arquivo_ids) AS ids(arquivo_id)
    ORDER BY arquivo_id
  LOOP
    SELECT * INTO v_exclusao
    FROM public.solicitar_exclusao_arquivo_documento_aluno(
      v_arquivo_id,
      p_motivo
    );
    v_resultado := v_resultado || jsonb_build_array(jsonb_build_object(
      'id', v_exclusao.id,
      'arquivoId', v_exclusao.arquivo_id,
      'status', v_exclusao.status
    ));
  END LOOP;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.solicitar_exclusao_arquivos_documento_aluno(
  uuid[], text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.solicitar_exclusao_arquivos_documento_aluno(
  uuid[], text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reivindicar_exclusao_arquivo_documento_aluno(
  p_exclusao_id uuid,
  p_lease_minutos integer DEFAULT 10
)
RETURNS public.documentos_aluno_exclusoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exclusao public.documentos_aluno_exclusoes;
  v_lease integer := greatest(1, least(coalesce(p_lease_minutos, 10), 60));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacao exclusiva do backend.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.documentos_aluno_exclusoes
  SET status = 'processando',
      processamento_iniciado_em = now(),
      erro = NULL
  WHERE id = p_exclusao_id
    AND (
      status IN ('pendente', 'falhou')
      OR (
        status = 'processando'
        AND coalesce(processamento_iniciado_em, solicitado_em)
          < now() - make_interval(mins => v_lease)
      )
    )
  RETURNING * INTO v_exclusao;

  IF v_exclusao.id IS NULL THEN
    RAISE EXCEPTION
      'Solicitacao ja concluida, cancelada ou com processamento ativo.'
      USING ERRCODE = '55000';
  END IF;

  RETURN v_exclusao;
END;
$$;

REVOKE ALL ON FUNCTION public.reivindicar_exclusao_arquivo_documento_aluno(
  uuid, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reivindicar_exclusao_arquivo_documento_aluno(
  uuid, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalizar_exclusao_arquivo_documento_aluno(
  p_exclusao_id uuid,
  p_sucesso boolean,
  p_erro text DEFAULT NULL
)
RETURNS public.documentos_aluno_exclusoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exclusao public.documentos_aluno_exclusoes;
  v_arquivo public.documentos_aluno_arquivos;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Operacao exclusiva do backend.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_exclusao
  FROM public.documentos_aluno_exclusoes
  WHERE id = p_exclusao_id
  FOR UPDATE;

  IF v_exclusao.id IS NULL
    OR v_exclusao.status NOT IN ('pendente', 'processando', 'falhou')
  THEN
    RAISE EXCEPTION 'Solicitacao de exclusao indisponivel.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_arquivo
  FROM public.documentos_aluno_arquivos
  WHERE id = v_exclusao.arquivo_id
  FOR UPDATE;

  IF p_sucesso THEN
    -- A projecao so e retirada depois que o Storage confirmou a exclusao.
    UPDATE public.documentos_aluno_versoes versao
    SET status = 'arquivado',
        atual = false,
        motivo_arquivamento = 'Exclusao administrativa: ' || v_exclusao.motivo,
        arquivado_por = v_exclusao.solicitado_por,
        arquivado_em = now()
    FROM public.documentos_aluno_versao_fontes fonte
    WHERE fonte.versao_id = versao.id
      AND fonte.arquivo_id = v_arquivo.id
      AND versao.atual;

    UPDATE public.documentos_aluno documento
    SET versao_atual_id = NULL,
        arquivo_url = NULL,
        arquivo_bucket = NULL,
        arquivo_path = NULL,
        status = 'pendente',
        observacao = NULL,
        revisado_por = NULL,
        revisado_em = NULL,
        updated_at = now()
    WHERE EXISTS (
      SELECT 1
      FROM public.documentos_aluno_versao_fontes fonte
      JOIN public.documentos_aluno_versoes versao ON versao.id = fonte.versao_id
      WHERE fonte.arquivo_id = v_arquivo.id
        AND versao.documento_id = documento.id
        AND versao.id = documento.versao_atual_id
        AND versao.status = 'arquivado'
    );
  END IF;

  UPDATE public.documentos_aluno_exclusoes
  SET status = CASE WHEN p_sucesso THEN 'concluida' ELSE 'falhou' END,
      erro = CASE WHEN p_sucesso THEN NULL ELSE left(coalesce(p_erro, 'Erro desconhecido'), 1000) END,
      processado_em = now()
  WHERE id = v_exclusao.id
  RETURNING * INTO v_exclusao;

  UPDATE public.documentos_aluno_arquivos
  SET status = CASE WHEN p_sucesso THEN 'excluido' ELSE 'exclusao_pendente' END,
      excluido_em = CASE WHEN p_sucesso THEN now() ELSE NULL END
  WHERE id = v_arquivo.id;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, arquivo_id, lote_id, evento, detalhes
  )
  VALUES (
    v_arquivo.aluno_id,
    v_arquivo.id,
    v_arquivo.lote_id,
    CASE WHEN p_sucesso THEN 'arquivo_excluido' ELSE 'exclusao_falhou' END,
    jsonb_build_object(
      'exclusao_id', v_exclusao.id,
      'erro', CASE WHEN p_sucesso THEN NULL ELSE p_erro END
    )
  );

  RETURN v_exclusao;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_exclusao_arquivo_documento_aluno(
  uuid, boolean, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_exclusao_arquivo_documento_aluno(
  uuid, boolean, text
) TO service_role;

COMMIT;
