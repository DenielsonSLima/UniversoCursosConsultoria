BEGIN;
-- Versao registrada pelo MCP Supabase: 20260725114226.

CREATE OR REPLACE FUNCTION public.documentos_aluno_usuario_atual_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT usuario.id
  FROM public.usuarios_sistema usuario
  WHERE lower(usuario.email) = public.auth_email()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.documentos_aluno_usuario_atual_id()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.documentos_aluno_usuario_atual_id()
  TO service_role;

CREATE OR REPLACE FUNCTION public.iniciar_envio_documentos_aluno(
  p_modo text,
  p_documento_ids uuid[]
)
RETURNS public.documentos_aluno_lotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_modo text := lower(btrim(coalesce(p_modo, '')));
  v_ids uuid[];
  v_aluno_id uuid;
  v_total integer;
  v_lote public.documentos_aluno_lotes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF v_modo NOT IN ('separado', 'pdf_unico') THEN
    RAISE EXCEPTION 'Modo de envio invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT
    array_agg(DISTINCT id ORDER BY id),
    count(DISTINCT id),
    min(aluno_id::text)::uuid
  INTO v_ids, v_total, v_aluno_id
  FROM public.documentos_aluno
  WHERE id = ANY(coalesce(p_documento_ids, '{}'::uuid[]));

  IF v_total IS NULL OR v_total = 0
    OR v_total <> cardinality(coalesce(p_documento_ids, '{}'::uuid[]))
    OR EXISTS (
      SELECT 1
      FROM public.documentos_aluno documento
      WHERE documento.id = ANY(v_ids)
        AND documento.aluno_id <> v_aluno_id
    )
  THEN
    RAISE EXCEPTION 'Selecione documentos validos do mesmo aluno.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.pode_acessar_documento_aluno(v_aluno_id)
    OR (
      public.current_aluno_id() IS NOT NULL
      AND public.current_aluno_id() <> v_aluno_id
    )
  THEN
    RAISE EXCEPTION 'Documentos fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.documentos_aluno
  WHERE id = ANY(v_ids)
  FOR UPDATE;

  UPDATE public.documentos_aluno_lotes
  SET status = 'cancelado'
  WHERE aluno_id = v_aluno_id
    AND status = 'preparando'
    AND criado_em < now() - interval '24 hours'
    AND documento_ids && v_ids;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = v_aluno_id
      AND lote.status IN ('preparando', 'aguardando_mapeamento')
      AND lote.documento_ids && v_ids
  ) THEN
    RAISE EXCEPTION
      'Ja existe um envio aberto para um dos documentos selecionados.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    JOIN public.documentos_aluno_versoes versao
      ON versao.id = documento.versao_atual_id
    WHERE documento.id = ANY(v_ids)
      AND versao.status NOT IN ('recusado', 'arquivado')
  ) THEN
    RAISE EXCEPTION
      'Ha documento bloqueado. Aguarde a analise ou arquive a versao atual.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.documentos_aluno_lotes (
    aluno_id,
    modo,
    documento_ids,
    criado_por_auth_uid
  )
  VALUES (v_aluno_id, v_modo, v_ids, auth.uid())
  RETURNING * INTO v_lote;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, lote_id, evento, detalhes
  )
  VALUES (
    v_aluno_id,
    v_lote.id,
    'lote_iniciado',
    jsonb_build_object('modo', v_modo, 'documento_ids', v_ids)
  );

  RETURN v_lote;
END;
$$;

REVOKE ALL ON FUNCTION public.iniciar_envio_documentos_aluno(text, uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iniciar_envio_documentos_aluno(text, uuid[])
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reservar_arquivo_documento_aluno(
  p_lote_id uuid,
  p_nome_original text,
  p_mime_type text,
  p_tamanho_declarado bigint
)
RETURNS public.documentos_aluno_arquivos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.documentos_aluno_lotes;
  v_arquivo public.documentos_aluno_arquivos;
  v_arquivo_id uuid := gen_random_uuid();
  v_extensao text;
  v_limite bigint;
  v_quantidade integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL
    OR v_lote.status <> 'preparando'
    OR NOT public.pode_acessar_documento_aluno(v_lote.aluno_id)
    OR (
      v_lote.criado_por_auth_uid <> auth.uid()
      AND NOT public.gestor_pode_gerenciar_documento_aluno(v_lote.aluno_id)
    )
  THEN
    RAISE EXCEPTION 'Lote indisponivel para envio.' USING ERRCODE = '42501';
  END IF;

  IF p_mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') THEN
    RAISE EXCEPTION 'Tipo de arquivo nao permitido.' USING ERRCODE = '22023';
  END IF;
  IF v_lote.modo = 'pdf_unico' AND p_mime_type <> 'application/pdf' THEN
    RAISE EXCEPTION 'O envio consolidado aceita somente PDF.' USING ERRCODE = '22023';
  END IF;

  v_limite := CASE WHEN v_lote.modo = 'pdf_unico' THEN 31457280 ELSE 10485760 END;
  IF p_tamanho_declarado IS NULL
    OR p_tamanho_declarado < 1
    OR p_tamanho_declarado > v_limite
  THEN
    RAISE EXCEPTION 'Tamanho de arquivo invalido.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_quantidade
  FROM public.documentos_aluno_arquivos
  WHERE lote_id = v_lote.id
    AND status <> 'excluido';

  IF (v_lote.modo = 'pdf_unico' AND v_quantidade >= 1)
    OR (
      v_lote.modo = 'separado'
      AND v_quantidade >= cardinality(v_lote.documento_ids) * 5
    )
  THEN
    RAISE EXCEPTION 'Limite de arquivos do lote atingido.' USING ERRCODE = '22023';
  END IF;

  v_extensao := CASE p_mime_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/png' THEN 'png'
    WHEN 'image/webp' THEN 'webp'
    ELSE 'jpg'
  END;

  INSERT INTO public.documentos_aluno_arquivos (
    id,
    lote_id,
    aluno_id,
    bucket,
    path,
    nome_original,
    mime_type,
    tamanho_declarado
  )
  VALUES (
    v_arquivo_id,
    v_lote.id,
    v_lote.aluno_id,
    'documentos-alunos',
    format(
      '%s/documentos/v2/%s/%s.%s',
      v_lote.aluno_id,
      v_lote.id,
      v_arquivo_id,
      v_extensao
    ),
    left(btrim(coalesce(p_nome_original, 'arquivo')), 255),
    p_mime_type,
    p_tamanho_declarado
  )
  RETURNING * INTO v_arquivo;

  RETURN v_arquivo;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_arquivo_documento_aluno(
  uuid, text, text, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reservar_arquivo_documento_aluno(
  uuid, text, text, bigint
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.confirmar_arquivo_documento_aluno(
  p_arquivo_id uuid,
  p_total_paginas integer DEFAULT NULL
)
RETURNS public.documentos_aluno_arquivos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_arquivo public.documentos_aluno_arquivos;
  v_lote public.documentos_aluno_lotes;
  v_tamanho bigint;
  v_limite bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT arquivo.*
  INTO v_arquivo
  FROM public.documentos_aluno_arquivos arquivo
  JOIN public.documentos_aluno_lotes lote ON lote.id = arquivo.lote_id
  WHERE arquivo.id = p_arquivo_id
  FOR UPDATE OF arquivo, lote;

  SELECT * INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = v_arquivo.lote_id;

  IF v_arquivo.id IS NULL
    OR v_arquivo.status <> 'reservado'
    OR v_lote.status <> 'preparando'
    OR NOT public.pode_acessar_documento_aluno(v_arquivo.aluno_id)
    OR (
      v_lote.criado_por_auth_uid <> auth.uid()
      AND NOT public.gestor_pode_gerenciar_documento_aluno(v_arquivo.aluno_id)
    )
  THEN
    RAISE EXCEPTION 'Reserva de arquivo invalida.' USING ERRCODE = '42501';
  END IF;

  SELECT nullif(objeto.metadata ->> 'size', '')::bigint
  INTO v_tamanho
  FROM storage.objects objeto
  WHERE objeto.bucket_id = v_arquivo.bucket
    AND objeto.name = v_arquivo.path;

  IF v_tamanho IS NULL THEN
    RAISE EXCEPTION 'Arquivo nao encontrado no Storage.' USING ERRCODE = '22023';
  END IF;

  v_limite := CASE WHEN v_lote.modo = 'pdf_unico' THEN 31457280 ELSE 10485760 END;
  IF v_tamanho < 1 OR v_tamanho > v_limite THEN
    RAISE EXCEPTION 'O arquivo ultrapassa o limite permitido.' USING ERRCODE = '22023';
  END IF;
  IF v_arquivo.mime_type = 'application/pdf'
    AND p_total_paginas IS NOT NULL
    AND p_total_paginas < 1
  THEN
    RAISE EXCEPTION 'Total de paginas invalido.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.documentos_aluno_arquivos
  SET status = 'enviado',
      tamanho_confirmado = v_tamanho,
      total_paginas = p_total_paginas,
      enviado_em = now()
  WHERE id = v_arquivo.id
  RETURNING * INTO v_arquivo;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, lote_id, arquivo_id, evento, detalhes
  )
  VALUES (
    v_arquivo.aluno_id,
    v_arquivo.lote_id,
    v_arquivo.id,
    'arquivo_confirmado',
    jsonb_build_object(
      'nome', v_arquivo.nome_original,
      'tamanho', v_tamanho,
      'total_paginas', p_total_paginas
    )
  );

  RETURN v_arquivo;
END;
$$;

REVOKE ALL ON FUNCTION public.confirmar_arquivo_documento_aluno(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_arquivo_documento_aluno(uuid, integer)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalizar_envio_documentos_separados(
  p_lote_id uuid,
  p_fontes jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.documentos_aluno_lotes;
  v_item jsonb;
  v_documento_id uuid;
  v_arquivo_ids uuid[];
  v_versao_id uuid;
  v_numero integer;
  v_primeiro public.documentos_aluno_arquivos;
  v_ordem integer;
  v_total_mapeado integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_fontes) <> 'array' OR jsonb_array_length(p_fontes) = 0 THEN
    RAISE EXCEPTION 'Informe os arquivos de cada documento.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL
    OR v_lote.modo <> 'separado'
    OR v_lote.status <> 'preparando'
    OR NOT public.pode_acessar_documento_aluno(v_lote.aluno_id)
    OR (
      v_lote.criado_por_auth_uid <> auth.uid()
      AND NOT public.gestor_pode_gerenciar_documento_aluno(v_lote.aluno_id)
    )
  THEN
    RAISE EXCEPTION 'Lote separado indisponivel.' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT item ->> 'documento_id')
  INTO v_total_mapeado
  FROM jsonb_array_elements(p_fontes) item;

  IF v_total_mapeado <> cardinality(v_lote.documento_ids)
    OR jsonb_array_length(p_fontes) <> v_total_mapeado
  THEN
    RAISE EXCEPTION 'Cada documento do lote deve aparecer uma unica vez.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_fontes)
  LOOP
    BEGIN
      v_documento_id := (v_item ->> 'documento_id')::uuid;
      SELECT array_agg(value::uuid)
      INTO v_arquivo_ids
      FROM jsonb_array_elements_text(v_item -> 'arquivo_ids');
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Mapeamento de arquivos invalido.' USING ERRCODE = '22023';
    END;

    PERFORM 1
    FROM public.documentos_aluno_arquivos arquivo
    WHERE arquivo.id = ANY(v_arquivo_ids)
    ORDER BY arquivo.id
    FOR UPDATE;

    IF v_documento_id <> ALL(v_lote.documento_ids)
      OR cardinality(coalesce(v_arquivo_ids, '{}'::uuid[])) NOT BETWEEN 1 AND 5
      OR EXISTS (
        SELECT 1
        FROM unnest(v_arquivo_ids) arquivo_id
        LEFT JOIN public.documentos_aluno_arquivos arquivo
          ON arquivo.id = arquivo_id
          AND arquivo.lote_id = v_lote.id
          AND arquivo.status = 'enviado'
        WHERE arquivo.id IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM public.documentos_aluno_arquivos arquivo
        WHERE arquivo.id = ANY(v_arquivo_ids)
          AND NOT EXISTS (
            SELECT 1
            FROM storage.objects objeto
            WHERE objeto.bucket_id = arquivo.bucket
              AND objeto.name = arquivo.path
          )
      )
    THEN
      RAISE EXCEPTION 'Arquivo fora do lote ou documento invalido.' USING ERRCODE = '22023';
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
      RAISE EXCEPTION
        'O documento recebeu outro envio e esta bloqueado para substituicao.'
        USING ERRCODE = '40001';
    END IF;

    UPDATE public.documentos_aluno_versoes
    SET atual = false
    WHERE documento_id = v_documento_id
      AND atual;

    SELECT coalesce(max(numero), 0) + 1
    INTO v_numero
    FROM public.documentos_aluno_versoes
    WHERE documento_id = v_documento_id;

    INSERT INTO public.documentos_aluno_versoes (
      documento_id, lote_id, numero, status, atual, enviado_por_auth_uid
    )
    VALUES (
      v_documento_id, v_lote.id, v_numero, 'pendente', true, auth.uid()
    )
    RETURNING id INTO v_versao_id;

    v_ordem := 0;
    FOREACH v_documento_id IN ARRAY v_arquivo_ids
    LOOP
      v_ordem := v_ordem + 1;
      INSERT INTO public.documentos_aluno_versao_fontes (
        versao_id, arquivo_id, ordem
      )
      VALUES (v_versao_id, v_documento_id, v_ordem);
    END LOOP;

    SELECT *
    INTO v_primeiro
    FROM public.documentos_aluno_arquivos
    WHERE id = v_arquivo_ids[1];

    -- Recupera o documento, pois a variavel foi reutilizada no FOREACH.
    v_documento_id := (v_item ->> 'documento_id')::uuid;
    UPDATE public.documentos_aluno
    SET versao_atual_id = v_versao_id,
        arquivo_url = NULL,
        arquivo_bucket = v_primeiro.bucket,
        arquivo_path = v_primeiro.path,
        status = 'pendente',
        observacao = NULL,
        revisado_em = NULL,
        revisado_por = NULL,
        updated_at = now()
    WHERE id = v_documento_id;

    INSERT INTO public.documentos_aluno_eventos (
      aluno_id, documento_id, versao_id, lote_id, evento, detalhes
    )
    VALUES (
      v_lote.aluno_id,
      v_documento_id,
      v_versao_id,
      v_lote.id,
      'versao_enviada',
      jsonb_build_object('numero', v_numero, 'arquivo_ids', v_arquivo_ids)
    );
  END LOOP;

  UPDATE public.documentos_aluno_lotes
  SET status = 'finalizado',
      finalizado_em = now()
  WHERE id = v_lote.id;

  RETURN jsonb_build_object('lote_id', v_lote.id, 'status', 'finalizado');
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_envio_documentos_separados(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_envio_documentos_separados(uuid, jsonb)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalizar_envio_pdf_unico(
  p_lote_id uuid,
  p_arquivo_id uuid
)
RETURNS public.documentos_aluno_lotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.documentos_aluno_lotes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  PERFORM 1
  FROM public.documentos_aluno_arquivos
  WHERE id = p_arquivo_id
  FOR UPDATE;

  IF v_lote.id IS NULL
    OR v_lote.modo <> 'pdf_unico'
    OR v_lote.status <> 'preparando'
    OR NOT public.pode_acessar_documento_aluno(v_lote.aluno_id)
    OR (
      v_lote.criado_por_auth_uid <> auth.uid()
      AND NOT public.gestor_pode_gerenciar_documento_aluno(v_lote.aluno_id)
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.documentos_aluno_arquivos arquivo
      WHERE arquivo.id = p_arquivo_id
        AND arquivo.lote_id = v_lote.id
        AND arquivo.mime_type = 'application/pdf'
        AND arquivo.status = 'enviado'
        AND EXISTS (
          SELECT 1
          FROM storage.objects objeto
          WHERE objeto.bucket_id = arquivo.bucket
            AND objeto.name = arquivo.path
        )
    )
  THEN
    RAISE EXCEPTION 'PDF ou lote invalido.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.documentos_aluno_lotes
  SET status = 'aguardando_mapeamento',
      finalizado_em = now()
  WHERE id = v_lote.id
  RETURNING * INTO v_lote;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, lote_id, arquivo_id, evento
  )
  VALUES (
    v_lote.aluno_id, v_lote.id, p_arquivo_id, 'pdf_aguardando_mapeamento'
  );

  RETURN v_lote;
END;
$$;

REVOKE ALL ON FUNCTION public.finalizar_envio_pdf_unico(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_envio_pdf_unico(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancelar_lote_documentos_aluno(
  p_lote_id uuid,
  p_motivo text DEFAULT NULL
)
RETURNS public.documentos_aluno_lotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.documentos_aluno_lotes;
  v_gestor boolean;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_status_anterior text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lote
  FROM public.documentos_aluno_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  v_gestor := v_lote.id IS NOT NULL
    AND public.gestor_pode_gerenciar_documento_aluno(v_lote.aluno_id);

  IF v_lote.id IS NULL
    OR v_lote.status NOT IN ('preparando', 'aguardando_mapeamento')
    OR (
      v_lote.criado_por_auth_uid <> auth.uid()
      AND NOT v_gestor
    )
    OR (v_lote.status = 'aguardando_mapeamento' AND NOT v_gestor)
    OR (v_lote.status = 'aguardando_mapeamento' AND v_motivo IS NULL)
  THEN
    RAISE EXCEPTION 'Lote indisponivel para cancelamento.' USING ERRCODE = '42501';
  END IF;

  v_status_anterior := v_lote.status;

  UPDATE public.documentos_aluno_lotes
  SET status = 'cancelado',
      finalizado_em = now()
  WHERE id = v_lote.id
  RETURNING * INTO v_lote;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, lote_id, evento, detalhes
  )
  VALUES (
    v_lote.aluno_id,
    v_lote.id,
    'lote_cancelado',
    jsonb_build_object('motivo', v_motivo, 'status_anterior', v_status_anterior)
  );

  RETURN v_lote;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_lote_documentos_aluno(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_lote_documentos_aluno(uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pode_excluir_reserva_documento_aluno(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid;
  v_documento_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_arquivos arquivo
    JOIN public.documentos_aluno_lotes lote ON lote.id = arquivo.lote_id
    WHERE arquivo.bucket = 'documentos-alunos'
      AND arquivo.path = p_name
      AND lote.criado_por_auth_uid = auth.uid()
      AND (
        lote.status = 'cancelado'
        OR (
          lote.status = 'preparando'
          AND arquivo.status = 'reservado'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.documentos_aluno_versao_fontes fonte
        WHERE fonte.arquivo_id = arquivo.id
      )
  ) THEN
    RETURN true;
  END IF;

  IF split_part(p_name, '/', 2) <> 'documentos'
    OR split_part(p_name, '/', 1)
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR split_part(p_name, '/', 3)
      !~* '^[0-9a-f-]{36}_[0-9]{10,}\.[a-z0-9]+$'
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_aluno_id := split_part(p_name, '/', 1)::uuid;
    v_documento_id :=
      split_part(split_part(p_name, '/', 3), '_', 1)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.documentos_aluno_arquivos arquivo
    WHERE arquivo.bucket = 'documentos-alunos'
      AND arquivo.path = p_name
  )
  AND EXISTS (
    SELECT 1
    FROM public.documentos_aluno documento
    WHERE documento.id = v_documento_id
      AND documento.aluno_id = v_aluno_id
      AND (
        public.current_aluno_id() = documento.aluno_id
        OR public.gestor_pode_gerenciar_documento_aluno(documento.aluno_id)
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pode_excluir_reserva_documento_aluno(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_excluir_reserva_documento_aluno(text)
  TO authenticated, service_role;

DROP POLICY IF EXISTS documentos_alunos_cancelled_reservation_delete
  ON storage.objects;
CREATE POLICY documentos_alunos_cancelled_reservation_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos-alunos'
  AND public.pode_excluir_reserva_documento_aluno(name)
);

COMMIT;
