BEGIN;

CREATE FUNCTION public.gestor_listar_documentos_professor(
  p_professor_id uuid, p_offset integer DEFAULT 0, p_limit integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.gestor_pode_gerir_dossie_professor(p_professor_id) THEN
    RAISE EXCEPTION 'Sem permissão para o dossiê deste professor.' USING ERRCODE = '42501';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Paginação inválida.' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object(
    'total',count(*), 'pendentes',count(*) FILTER (WHERE status IN ('pendente','recusado')),
    'emAnalise',count(*) FILTER (WHERE status = 'em_analise'),
    'aprovados',count(*) FILTER (WHERE status = 'aprovado')
  ) INTO v_result FROM public.professor_documentos WHERE professor_id = p_professor_id;
  RETURN v_result || jsonb_build_object('itens',coalesce((
    SELECT jsonb_agg(to_jsonb(item) ORDER BY item."criadoEm" DESC, item.id) FROM (
      SELECT d.id,d.nome,d.categoria,d.status,d.instrucao,
        d.observacao_revisao AS "observacaoRevisao",d.arquivo_atual_id AS "arquivoAtualId",
        d.criado_em AS "criadoEm",d.atualizado_em AS "atualizadoEm",
        coalesce((SELECT jsonb_agg(to_jsonb(arquivo) ORDER BY arquivo."confirmadoEm" DESC) FROM (
          SELECT a.id,a.bucket,a.path,a.nome_original AS nome,a.mime_type AS "mimeType",
            a.tamanho,a.confirmado_em AS "confirmadoEm"
          FROM public.professor_documentos_arquivos a WHERE a.documento_id = d.id
            AND a.confirmado_em IS NOT NULL ORDER BY a.confirmado_em DESC LIMIT 10
        ) arquivo),'[]'::jsonb) AS arquivos,
        coalesce((SELECT jsonb_agg(to_jsonb(evento) ORDER BY evento."criadoEm" DESC) FROM (
          SELECT e.id,e.acao,e.observacao,e.arquivo_id AS "arquivoId",e.criado_em AS "criadoEm"
          FROM public.professor_documentos_eventos e WHERE e.documento_id = d.id
          ORDER BY e.criado_em DESC LIMIT 15
        ) evento),'[]'::jsonb) AS historico
      FROM public.professor_documentos d WHERE d.professor_id = p_professor_id
      ORDER BY d.criado_em DESC,d.id OFFSET p_offset LIMIT p_limit
    ) item
  ),'[]'::jsonb));
END;
$$;

CREATE FUNCTION public.gestor_operar_documento_professor(
  p_professor_id uuid, p_acao text, p_payload jsonb, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_operacao public.professor_documentos_operacoes;
  v_documento public.professor_documentos;
  v_arquivo public.professor_documentos_arquivos;
  v_resultado jsonb;
  v_nome text;
  v_categoria text;
  v_mime text;
  v_tamanho bigint;
  v_objeto storage.objects;
  v_estado text;
  v_observacao text;
BEGIN
  -- Escopo e identidade são conferidos também antes de qualquer replay.
  IF NOT public.gestor_pode_gerir_dossie_professor(p_professor_id) THEN
    RAISE EXCEPTION 'Sem permissão para o dossiê deste professor.' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
    OR p_acao IS NULL OR p_acao NOT IN ('solicitar','reservar','confirmar','revisar') THEN
    RAISE EXCEPTION 'Operação documental inválida.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  SELECT * INTO v_operacao FROM public.professor_documentos_operacoes WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_operacao.professor_id IS DISTINCT FROM p_professor_id
      OR v_operacao.ator_id IS DISTINCT FROM v_ator OR v_operacao.acao IS DISTINCT FROM p_acao
      OR v_operacao.payload IS DISTINCT FROM p_payload THEN
      RAISE EXCEPTION 'Identificador já usado em outra operação.' USING ERRCODE = '22023';
    END IF;
    RETURN v_operacao.resultado;
  END IF;

  IF p_acao = 'solicitar' THEN
    v_nome := btrim(p_payload->>'nome');
    v_categoria := p_payload->>'categoria';
    v_observacao := nullif(btrim(p_payload->>'instrucao'),'');
    IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 2 AND 160
      OR v_categoria IS NULL OR v_categoria NOT IN ('identificacao','formacao','contrato','outro')
      OR length(v_observacao) > 1000 THEN
      RAISE EXCEPTION 'Revise o nome, a categoria e a orientação do documento.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.professor_documentos(professor_id,nome,categoria,instrucao,criado_por)
      VALUES(p_professor_id,v_nome,v_categoria,v_observacao,v_ator) RETURNING * INTO v_documento;
    INSERT INTO public.professor_documentos_eventos(documento_id,acao,observacao,ator_id)
      VALUES(v_documento.id,'solicitado',v_observacao,v_ator);
    v_resultado := jsonb_build_object('documentoId',v_documento.id);
  ELSE
    SELECT * INTO v_documento FROM public.professor_documentos
      WHERE id = (p_payload->>'documentoId')::uuid AND professor_id = p_professor_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Documento não pertence ao professor.' USING ERRCODE = '42501';
    END IF;
    IF p_acao = 'reservar' THEN
      v_nome := btrim(p_payload->>'nome');
      v_mime := p_payload->>'mimeType';
      v_tamanho := (p_payload->>'tamanho')::bigint;
      IF v_nome IS NULL OR length(v_nome) NOT BETWEEN 1 AND 240
        OR v_mime IS NULL OR v_mime NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
        OR v_tamanho IS NULL OR v_tamanho NOT BETWEEN 1 AND 10485760 THEN
        RAISE EXCEPTION 'Envie PDF, JPG, PNG ou WEBP de até 10 MB.' USING ERRCODE = '22023';
      END IF;
      v_arquivo.id := gen_random_uuid();
      INSERT INTO public.professor_documentos_arquivos(
        id,documento_id,path,nome_original,mime_type,tamanho,criado_por)
      VALUES(v_arquivo.id,v_documento.id,
        p_professor_id::text || '/' || v_documento.id::text || '/' || v_arquivo.id::text
          || CASE v_mime WHEN 'application/pdf' THEN '.pdf' WHEN 'image/png' THEN '.png'
            WHEN 'image/webp' THEN '.webp' ELSE '.jpg' END,
        v_nome,v_mime,v_tamanho,v_ator) RETURNING * INTO v_arquivo;
      v_resultado := jsonb_build_object('id',v_arquivo.id,'bucket',v_arquivo.bucket,'path',v_arquivo.path);
    ELSE
      SELECT * INTO v_arquivo FROM public.professor_documentos_arquivos
        WHERE id = (p_payload->>'arquivoId')::uuid AND documento_id = v_documento.id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Arquivo não pertence ao documento.' USING ERRCODE = '42501';
      END IF;
      IF p_acao = 'confirmar' THEN
        IF v_arquivo.criado_por IS DISTINCT FROM v_ator THEN
          RAISE EXCEPTION 'Reserva pertence a outro usuário.' USING ERRCODE = '42501';
        END IF;
        IF v_arquivo.confirmado_em IS NOT NULL THEN
          RAISE EXCEPTION 'Envio já concluído. Reutilize a operação original.' USING ERRCODE = '22023';
        END IF;
        SELECT * INTO v_objeto FROM storage.objects
          WHERE bucket_id = v_arquivo.bucket AND name = v_arquivo.path;
        IF NOT FOUND OR (v_objeto.metadata->>'size')::bigint IS DISTINCT FROM v_arquivo.tamanho
          OR v_objeto.metadata->>'mimetype' IS DISTINCT FROM v_arquivo.mime_type THEN
          RAISE EXCEPTION 'Arquivo ausente ou incompatível com a reserva.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.professor_documentos_arquivos SET confirmado_em = clock_timestamp()
          WHERE id = v_arquivo.id;
        UPDATE public.professor_documentos SET arquivo_atual_id = v_arquivo.id,status = 'em_analise',
          observacao_revisao = NULL,atualizado_em = clock_timestamp() WHERE id = v_documento.id;
        INSERT INTO public.professor_documentos_eventos(documento_id,arquivo_id,acao,ator_id)
          VALUES(v_documento.id,v_arquivo.id,'enviado',v_ator);
      ELSE
        v_estado := p_payload->>'status';
        v_observacao := nullif(btrim(p_payload->>'observacao'),'');
        IF v_estado IS NULL OR v_estado NOT IN ('aprovado','recusado')
          OR length(v_observacao) > 1000 OR (v_estado = 'recusado' AND v_observacao IS NULL) THEN
          RAISE EXCEPTION 'Informe uma decisão válida e o motivo da recusa.' USING ERRCODE = '22023';
        END IF;
        IF v_arquivo.confirmado_em IS NULL OR v_documento.arquivo_atual_id IS DISTINCT FROM v_arquivo.id
          OR v_documento.status <> 'em_analise' THEN
          RAISE EXCEPTION 'O documento mudou. Atualize antes de revisar.' USING ERRCODE = '40001';
        END IF;
        UPDATE public.professor_documentos SET status = v_estado,observacao_revisao = v_observacao,
          atualizado_em = clock_timestamp() WHERE id = v_documento.id;
        INSERT INTO public.professor_documentos_eventos(documento_id,arquivo_id,acao,observacao,ator_id)
          VALUES(v_documento.id,v_arquivo.id,v_estado,v_observacao,v_ator);
      END IF;
      v_resultado := jsonb_build_object('documentoId',v_documento.id,'arquivoId',v_arquivo.id);
    END IF;
  END IF;
  INSERT INTO public.professor_documentos_operacoes(request_id,professor_id,ator_id,acao,payload,resultado)
    VALUES(p_request_id,p_professor_id,v_ator,p_acao,p_payload,v_resultado);
  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.gestor_listar_documentos_professor(uuid,integer,integer),
  public.gestor_operar_documento_professor(uuid,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gestor_listar_documentos_professor(uuid,integer,integer),
  public.gestor_operar_documento_professor(uuid,text,jsonb,uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.gestor_operar_documento_professor(uuid,text,jsonb,uuid) IS
  'Dossiê privado do professor: solicitação administrativa, arquivos imutáveis e revisão auditada; não altera elegibilidade acadêmica.';

COMMIT;
