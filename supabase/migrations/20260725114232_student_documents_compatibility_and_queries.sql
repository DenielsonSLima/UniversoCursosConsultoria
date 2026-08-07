BEGIN;
-- Versao registrada pelo MCP Supabase: 20260725114232.

-- Converte arquivos privados existentes para a primeira versao imutavel.
DO $$
DECLARE
  v_documento public.documentos_aluno;
  v_lote_id uuid;
  v_arquivo_id uuid;
  v_versao_id uuid;
  v_mime text;
  v_status text;
  v_tamanho bigint;
BEGIN
  FOR v_documento IN
    SELECT documento.*
    FROM public.documentos_aluno documento
    WHERE documento.versao_atual_id IS NULL
      AND documento.arquivo_bucket = 'documentos-alunos'
      AND documento.arquivo_path IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM storage.objects objeto
        WHERE objeto.bucket_id = documento.arquivo_bucket
          AND objeto.name = documento.arquivo_path
      )
  LOOP
    v_lote_id := gen_random_uuid();
    v_arquivo_id := gen_random_uuid();
    v_versao_id := gen_random_uuid();
    v_mime := CASE
      WHEN v_documento.arquivo_path ~* '\.pdf$' THEN 'application/pdf'
      WHEN v_documento.arquivo_path ~* '\.png$' THEN 'image/png'
      WHEN v_documento.arquivo_path ~* '\.webp$' THEN 'image/webp'
      ELSE 'image/jpeg'
    END;
    v_status := CASE lower(coalesce(v_documento.status, ''))
      WHEN 'aprovado' THEN 'aprovado'
      WHEN 'recusado' THEN 'recusado'
      ELSE 'pendente'
    END;
    SELECT greatest(
      1,
      coalesce(nullif(objeto.metadata ->> 'size', '')::bigint, 1)
    )
    INTO v_tamanho
    FROM storage.objects objeto
    WHERE objeto.bucket_id = v_documento.arquivo_bucket
      AND objeto.name = v_documento.arquivo_path;

    INSERT INTO public.documentos_aluno_lotes (
      id, aluno_id, modo, status, documento_ids, criado_por_auth_uid,
      criado_em, finalizado_em
    )
    VALUES (
      v_lote_id,
      v_documento.aluno_id,
      'separado',
      'finalizado',
      ARRAY[v_documento.id],
      '00000000-0000-0000-0000-000000000000'::uuid,
      coalesce(v_documento.updated_at, now()),
      coalesce(v_documento.updated_at, now())
    );

    INSERT INTO public.documentos_aluno_arquivos (
      id, lote_id, aluno_id, bucket, path, nome_original, mime_type,
      tamanho_declarado, tamanho_confirmado, status, enviado_em, criado_em
    )
    VALUES (
      v_arquivo_id,
      v_lote_id,
      v_documento.aluno_id,
      v_documento.arquivo_bucket,
      v_documento.arquivo_path,
      regexp_replace(v_documento.arquivo_path, '^.*/', ''),
      v_mime,
      v_tamanho,
      v_tamanho,
      'enviado',
      coalesce(v_documento.updated_at, now()),
      coalesce(v_documento.updated_at, now())
    )
    ON CONFLICT (bucket, path) DO UPDATE
    SET path = EXCLUDED.path
    RETURNING id INTO v_arquivo_id;

    INSERT INTO public.documentos_aluno_versoes (
      id,
      documento_id,
      lote_id,
      numero,
      status,
      atual,
      enviado_por_auth_uid,
      enviado_em,
      revisado_por,
      revisado_em,
      motivo_recusa
    )
    VALUES (
      v_versao_id,
      v_documento.id,
      v_lote_id,
      1,
      v_status,
      true,
      '00000000-0000-0000-0000-000000000000'::uuid,
      coalesce(v_documento.updated_at, now()),
      v_documento.revisado_por,
      v_documento.revisado_em,
      CASE WHEN v_status = 'recusado'
        THEN coalesce(nullif(btrim(v_documento.observacao), ''), 'Recusado pela secretaria.')
        ELSE NULL
      END
    );

    INSERT INTO public.documentos_aluno_versao_fontes (
      versao_id, arquivo_id, ordem
    )
    VALUES (v_versao_id, v_arquivo_id, 1);

    UPDATE public.documentos_aluno
    SET versao_atual_id = v_versao_id
    WHERE id = v_documento.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.definir_total_paginas_arquivo_documento_aluno(
  p_arquivo_id uuid,
  p_total_paginas integer
)
RETURNS public.documentos_aluno_arquivos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_arquivo public.documentos_aluno_arquivos;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;
  IF p_total_paginas IS NULL OR p_total_paginas < 1 THEN
    RAISE EXCEPTION 'Informe um total de paginas valido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_arquivo
  FROM public.documentos_aluno_arquivos
  WHERE id = p_arquivo_id
  FOR UPDATE;

  IF v_arquivo.id IS NULL
    OR v_arquivo.mime_type <> 'application/pdf'
    OR v_arquivo.status <> 'enviado'
    OR NOT public.gestor_pode_gerenciar_documento_aluno(v_arquivo.aluno_id)
  THEN
    RAISE EXCEPTION 'PDF fora do escopo do gestor.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.documentos_aluno_arquivos
  SET total_paginas = p_total_paginas
  WHERE id = v_arquivo.id
  RETURNING * INTO v_arquivo;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, lote_id, arquivo_id, evento, ator_usuario_id, detalhes
  )
  VALUES (
    v_arquivo.aluno_id,
    v_arquivo.lote_id,
    v_arquivo.id,
    'total_paginas_informado',
    public.documentos_aluno_usuario_atual_id(),
    jsonb_build_object('total_paginas', p_total_paginas)
  );

  RETURN v_arquivo;
END;
$$;

REVOKE ALL ON FUNCTION public.definir_total_paginas_arquivo_documento_aluno(
  uuid, integer
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_total_paginas_arquivo_documento_aluno(
  uuid, integer
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.listar_painel_documentos_aluno(
  p_aluno_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aluno_id uuid := coalesce(p_aluno_id, public.current_aluno_id());
  v_itens jsonb;
  v_lotes_pdf jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_aluno_id IS NULL THEN
    RAISE EXCEPTION 'Aluno nao identificado.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.pode_acessar_documento_aluno(v_aluno_id)
    OR (
      public.current_aluno_id() IS NOT NULL
      AND public.current_aluno_id() <> v_aluno_id
    )
  THEN
    RAISE EXCEPTION 'Documentos fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(item ORDER BY item ->> 'nome'), '[]'::jsonb)
  INTO v_itens
  FROM (
    SELECT jsonb_build_object(
      'id', documento.id,
      'nome', documento.nome_documento,
      'obrigatorio', documento.nome_documento !~* '(titulo de eleitor|reservista)',
      'status', CASE
        WHEN atual.id IS NULL THEN 'nao_enviado'
        ELSE atual.status
      END,
      'versaoAtual', CASE
        WHEN atual.id IS NULL THEN NULL
        ELSE jsonb_build_object(
          'id', atual.id,
          'numero', atual.numero,
          'status', atual.status,
          'enviadoEm', atual.enviado_em,
          'revisadoEm', atual.revisado_em,
          'revisadoPorNome', revisor_atual.nome,
          'motivoRecusa', atual.motivo_recusa,
          'motivoArquivamento', atual.motivo_arquivamento,
          'fontes', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', fonte.id,
                'paginaInicio', fonte.pagina_inicio,
                'paginaFim', fonte.pagina_fim,
                'ordem', fonte.ordem,
                'arquivo', jsonb_build_object(
                  'id', arquivo.id,
                  'nome', arquivo.nome_original,
                  'mimeType', arquivo.mime_type,
                  'url', NULL,
                  'bucket', arquivo.bucket,
                  'path', arquivo.path,
                  'status', arquivo.status,
                  'tamanhoBytes', coalesce(
                    arquivo.tamanho_confirmado,
                    arquivo.tamanho_declarado
                  ),
                  'totalPaginas', arquivo.total_paginas
                )
              )
              ORDER BY fonte.ordem
            )
            FROM public.documentos_aluno_versao_fontes fonte
            JOIN public.documentos_aluno_arquivos arquivo
              ON arquivo.id = fonte.arquivo_id
            WHERE fonte.versao_id = atual.id
          ), '[]'::jsonb)
        )
      END,
      'versoes', coalesce((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', versao.id,
            'numero', versao.numero,
            'status', versao.status,
            'enviadoEm', versao.enviado_em,
            'revisadoEm', versao.revisado_em,
            'revisadoPorNome', revisor.nome,
            'motivoRecusa', versao.motivo_recusa,
            'motivoArquivamento', versao.motivo_arquivamento,
            'fontes', coalesce((
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', fonte.id,
                  'paginaInicio', fonte.pagina_inicio,
                  'paginaFim', fonte.pagina_fim,
                  'ordem', fonte.ordem,
                  'arquivo', jsonb_build_object(
                    'id', arquivo.id,
                    'nome', arquivo.nome_original,
                    'mimeType', arquivo.mime_type,
                    'url', NULL,
                    'bucket', arquivo.bucket,
                    'path', arquivo.path,
                    'status', arquivo.status,
                    'tamanhoBytes', coalesce(
                      arquivo.tamanho_confirmado,
                      arquivo.tamanho_declarado
                    ),
                    'totalPaginas', arquivo.total_paginas
                  )
                )
                ORDER BY fonte.ordem
              )
              FROM public.documentos_aluno_versao_fontes fonte
              JOIN public.documentos_aluno_arquivos arquivo
                ON arquivo.id = fonte.arquivo_id
              WHERE fonte.versao_id = versao.id
            ), '[]'::jsonb)
          )
          ORDER BY versao.numero DESC
        )
        FROM public.documentos_aluno_versoes versao
        LEFT JOIN public.usuarios_sistema revisor ON revisor.id = versao.revisado_por
        WHERE versao.documento_id = documento.id
      ), '[]'::jsonb)
    ) AS item
    FROM public.documentos_aluno documento
    LEFT JOIN public.documentos_aluno_versoes atual
      ON atual.id = documento.versao_atual_id
    LEFT JOIN public.usuarios_sistema revisor_atual
      ON revisor_atual.id = atual.revisado_por
    WHERE documento.aluno_id = v_aluno_id
  ) itens;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', lote.id,
      'modo', lote.modo,
      'status', lote.status,
      'documentoIds', lote.documento_ids,
      'criadoEm', lote.criado_em,
      'finalizadoEm', lote.finalizado_em,
      'arquivos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', arquivo.id,
          'nome', arquivo.nome_original,
          'mimeType', arquivo.mime_type,
          'url', NULL,
          'bucket', arquivo.bucket,
          'path', arquivo.path,
          'status', arquivo.status,
          'tamanhoBytes', coalesce(
            arquivo.tamanho_confirmado,
            arquivo.tamanho_declarado
          ),
          'totalPaginas', arquivo.total_paginas
        ) ORDER BY arquivo.criado_em)
        FROM public.documentos_aluno_arquivos arquivo
        WHERE arquivo.lote_id = lote.id
      ), '[]'::jsonb)
    )
    ORDER BY lote.criado_em DESC
  ), '[]'::jsonb)
  INTO v_lotes_pdf
  FROM public.documentos_aluno_lotes lote
  WHERE lote.aluno_id = v_aluno_id
    AND (
      lote.status <> 'cancelado'
      OR public.gestor_pode_gerenciar_documento_aluno(v_aluno_id)
    );

  RETURN jsonb_build_object(
    'alunoId', v_aluno_id,
    'itens', v_itens,
    'lotesPdf', v_lotes_pdf
  );
END;
$$;

REVOKE ALL ON FUNCTION public.listar_painel_documentos_aluno(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_painel_documentos_aluno(uuid)
  TO authenticated, service_role;

-- Ponte para a tela antiga: registra o objeto ja enviado como uma versao
-- imutavel. A politica de INSERT so permite a operacao quando o item esta livre
-- ou recusado.
CREATE OR REPLACE FUNCTION public.registrar_envio_documento_aluno(
  p_documento_id uuid,
  p_bucket text,
  p_path text
)
RETURNS public.documentos_aluno
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno;
  v_lote_id uuid := gen_random_uuid();
  v_arquivo_id uuid := gen_random_uuid();
  v_versao_id uuid := gen_random_uuid();
  v_numero integer;
  v_mime text;
  v_tamanho bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticacao obrigatoria.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id
  FOR UPDATE;

  IF v_documento.id IS NULL
    OR NOT public.pode_acessar_documento_aluno(v_documento.aluno_id)
    OR (
      public.current_aluno_id() IS NOT NULL
      AND public.current_aluno_id() <> v_documento.aluno_id
    )
  THEN
    RAISE EXCEPTION 'Documento fora do seu escopo.' USING ERRCODE = '42501';
  END IF;

  IF p_bucket <> 'documentos-alunos'
    OR split_part(p_path, '/', 1) <> v_documento.aluno_id::text
    OR split_part(p_path, '/', 2) <> 'documentos'
    OR p_path LIKE '%..%'
  THEN
    RAISE EXCEPTION 'Caminho de documento invalido.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_versoes atual
    WHERE atual.id = v_documento.versao_atual_id
      AND atual.status NOT IN ('recusado', 'arquivado')
  ) THEN
    RAISE EXCEPTION 'Documento bloqueado ate a conclusao da analise.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.documentos_aluno_lotes lote
    WHERE lote.aluno_id = v_documento.aluno_id
      AND lote.status IN ('preparando', 'aguardando_mapeamento')
      AND lote.documento_ids @> ARRAY[v_documento.id]
  ) THEN
    RAISE EXCEPTION
      'Existe um envio novo em andamento para este documento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT nullif(objeto.metadata ->> 'size', '')::bigint
  INTO v_tamanho
  FROM storage.objects objeto
  WHERE objeto.bucket_id = p_bucket
    AND objeto.name = p_path;
  IF v_tamanho IS NULL THEN
    RAISE EXCEPTION 'Arquivo nao encontrado no Storage.' USING ERRCODE = '22023';
  END IF;

  v_mime := CASE
    WHEN p_path ~* '\.pdf$' THEN 'application/pdf'
    WHEN p_path ~* '\.png$' THEN 'image/png'
    WHEN p_path ~* '\.webp$' THEN 'image/webp'
    ELSE 'image/jpeg'
  END;

  UPDATE public.documentos_aluno_versoes
  SET atual = false
  WHERE documento_id = v_documento.id
    AND atual;

  SELECT coalesce(max(numero), 0) + 1 INTO v_numero
  FROM public.documentos_aluno_versoes
  WHERE documento_id = v_documento.id;

  INSERT INTO public.documentos_aluno_lotes (
    id, aluno_id, modo, status, documento_ids, criado_por_auth_uid, finalizado_em
  )
  VALUES (
    v_lote_id,
    v_documento.aluno_id,
    'separado',
    'finalizado',
    ARRAY[v_documento.id],
    auth.uid(),
    now()
  );

  INSERT INTO public.documentos_aluno_arquivos (
    id, lote_id, aluno_id, bucket, path, nome_original, mime_type,
    tamanho_declarado, tamanho_confirmado, status, enviado_em
  )
  VALUES (
    v_arquivo_id,
    v_lote_id,
    v_documento.aluno_id,
    p_bucket,
    p_path,
    regexp_replace(p_path, '^.*/', ''),
    v_mime,
    v_tamanho,
    v_tamanho,
    'enviado',
    now()
  );

  INSERT INTO public.documentos_aluno_versoes (
    id, documento_id, lote_id, numero, status, atual, enviado_por_auth_uid
  )
  VALUES (
    v_versao_id,
    v_documento.id,
    v_lote_id,
    v_numero,
    'pendente',
    true,
    auth.uid()
  );

  INSERT INTO public.documentos_aluno_versao_fontes (
    versao_id, arquivo_id, ordem
  )
  VALUES (v_versao_id, v_arquivo_id, 1);

  UPDATE public.documentos_aluno
  SET versao_atual_id = v_versao_id,
      arquivo_url = NULL,
      arquivo_bucket = p_bucket,
      arquivo_path = p_path,
      status = 'pendente',
      observacao = NULL,
      revisado_em = NULL,
      revisado_por = NULL,
      updated_at = now()
  WHERE id = v_documento.id
  RETURNING * INTO v_documento;

  INSERT INTO public.documentos_aluno_eventos (
    aluno_id, documento_id, versao_id, arquivo_id, lote_id, evento, detalhes
  )
  VALUES (
    v_documento.aluno_id,
    v_documento.id,
    v_versao_id,
    v_arquivo_id,
    v_lote_id,
    'versao_enviada_legado',
    jsonb_build_object('numero', v_numero)
  );

  RETURN v_documento;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_envio_documento_aluno(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_envio_documento_aluno(uuid, text, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revisar_documento_aluno(
  p_documento_id uuid,
  p_status text,
  p_observacao text DEFAULT NULL
)
RETURNS public.documentos_aluno
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_documento public.documentos_aluno;
BEGIN
  SELECT * INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id;

  IF v_documento.id IS NULL OR v_documento.versao_atual_id IS NULL THEN
    RAISE EXCEPTION 'Documento sem versao atual para revisar.' USING ERRCODE = '22023';
  END IF;

  PERFORM public.revisar_versao_documento_aluno(
    v_documento.versao_atual_id,
    p_status,
    p_observacao
  );

  SELECT * INTO v_documento
  FROM public.documentos_aluno
  WHERE id = p_documento_id;
  RETURN v_documento;
END;
$$;

REVOKE ALL ON FUNCTION public.revisar_documento_aluno(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_documento_aluno(uuid, text, text)
  TO authenticated, service_role;

COMMIT;
