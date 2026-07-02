-- Enriquece a auditoria para responder quem fez, quem foi afetado e em qual polo.

BEGIN;

ALTER TABLE public.sistema_eventos
  ADD COLUMN IF NOT EXISTS actor_tipo text,
  ADD COLUMN IF NOT EXISTS pessoa_id uuid,
  ADD COLUMN IF NOT EXISTS pessoa_nome text,
  ADD COLUMN IF NOT EXISTS pessoa_tipo text,
  ADD COLUMN IF NOT EXISTS polo_id uuid REFERENCES public.polos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_pessoa_tipo_created_at
  ON public.sistema_eventos (pessoa_tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_actor_tipo_created_at
  ON public.sistema_eventos (actor_tipo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_polo_id_created_at
  ON public.sistema_eventos (polo_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.registrar_sistema_evento_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new jsonb := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_old jsonb := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_row jsonb := COALESCE(v_new, v_old);
  v_actor_id uuid := auth.uid();
  v_actor_email text := NULLIF(auth.jwt() ->> 'email', '');
  v_actor_nome text;
  v_actor_tipo text;
  v_entidade_id text;
  v_label text;
  v_acao text;
  v_modulo text;
  v_origem text := 'Auditoria';
  v_descricao text;
  v_changed_fields text[];
  v_pessoa_id uuid;
  v_pessoa_nome text;
  v_pessoa_tipo text;
  v_polo_id uuid;
  v_turma_nome text;
  v_has_paid boolean := false;
  v_context text;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME = 'sistema_eventos' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed_fields
    FROM jsonb_each(v_new) n
    FULL JOIN jsonb_each(v_old) o USING (key)
    WHERE n.value IS DISTINCT FROM o.value
      AND n.key NOT IN ('updated_at', 'asaas_synced_at', 'asaas_last_error');

    IF COALESCE(array_length(v_changed_fields, 1), 0) = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT u.nome, u.email, 'Gestor'
    INTO v_actor_nome, v_actor_email, v_actor_tipo
  FROM public.usuarios_sistema u
  WHERE (v_actor_id IS NOT NULL AND u.id = v_actor_id)
     OR (v_actor_email IS NOT NULL AND lower(u.email) = lower(v_actor_email))
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_actor_nome IS NULL THEN
    SELECT p.nome, p.email, p.tipo
      INTO v_actor_nome, v_actor_email, v_actor_tipo
    FROM public.parceiros p
    WHERE (v_actor_id IS NOT NULL AND p.id = v_actor_id)
       OR (v_actor_email IS NOT NULL AND lower(p.email) = lower(v_actor_email))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  v_actor_nome := COALESCE(v_actor_nome, v_actor_email, 'Sistema');
  v_actor_tipo := COALESCE(v_actor_tipo, 'Sistema');

  v_entidade_id := COALESCE(
    NULLIF(v_row ->> 'id', ''),
    NULLIF(v_row ->> 'event_id', ''),
    NULLIF(v_row ->> 'codigo', ''),
    NULLIF(v_row ->> 'asaas_payment_id', '')
  );
  v_label := COALESCE(
    NULLIF(v_row ->> 'nome', ''),
    NULLIF(v_row ->> 'titulo', ''),
    NULLIF(v_row ->> 'descricao', ''),
    NULLIF(v_row ->> 'email', ''),
    NULLIF(v_row ->> 'codigo', ''),
    NULLIF(v_row ->> 'tipo', ''),
    v_entidade_id,
    'registro'
  );
  v_acao := CASE TG_OP
    WHEN 'INSERT' THEN 'Criou'
    WHEN 'UPDATE' THEN 'Atualizou'
    WHEN 'DELETE' THEN 'Excluiu'
    ELSE TG_OP
  END;
  v_modulo := public.sistema_evento_modulo(TG_TABLE_NAME);

  IF v_row ? 'polo_id' AND NULLIF(v_row ->> 'polo_id', '') IS NOT NULL THEN
    v_polo_id := (v_row ->> 'polo_id')::uuid;
  END IF;

  IF TG_TABLE_NAME = 'parceiros' THEN
    v_pessoa_id := (v_row ->> 'id')::uuid;
    v_pessoa_nome := NULLIF(v_row ->> 'nome', '');
    v_pessoa_tipo := NULLIF(v_row ->> 'tipo', '');
    IF v_polo_id IS NULL AND NULLIF(v_row ->> 'polo_id', '') IS NOT NULL THEN
      v_polo_id := (v_row ->> 'polo_id')::uuid;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_acao := 'Cadastrou parceiro';
      v_descricao := 'Cadastrou ' || lower(COALESCE(v_pessoa_tipo, 'parceiro')) || ': ' || COALESCE(v_pessoa_nome, v_label);
    ELSIF TG_OP = 'DELETE' THEN
      v_acao := 'Excluiu parceiro';
      v_descricao := 'Excluiu ' || lower(COALESCE(v_pessoa_tipo, 'parceiro')) || ': ' || COALESCE(v_pessoa_nome, v_label);
    ELSIF 'troca_senha_obrigatoria' = ANY(COALESCE(v_changed_fields, ARRAY[]::text[]))
       AND COALESCE((v_old ->> 'troca_senha_obrigatoria')::boolean, false) = true
       AND COALESCE((v_new ->> 'troca_senha_obrigatoria')::boolean, false) = false THEN
      v_acao := 'Alterou senha';
      v_descricao := COALESCE(v_pessoa_tipo, 'Pessoa') || ' concluiu primeiro acesso e alterou a senha: ' || COALESCE(v_pessoa_nome, v_label);
    ELSE
      v_descricao := v_acao || ' cadastro de ' || lower(COALESCE(v_pessoa_tipo, 'parceiro')) || ': ' || COALESCE(v_pessoa_nome, v_label);
    END IF;
  ELSIF TG_TABLE_NAME = 'usuarios_sistema' THEN
    v_pessoa_id := (v_row ->> 'id')::uuid;
    v_pessoa_nome := COALESCE(NULLIF(v_row ->> 'nome', ''), NULLIF(v_row ->> 'email', ''));
    v_pessoa_tipo := 'Gestor';
    v_context := NULLIF(v_row ->> 'context', '');
    IF v_polo_id IS NULL AND v_context ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_polo_id := v_context::uuid;
    END IF;

    IF TG_OP = 'INSERT' THEN
      v_acao := 'Cadastrou usuário';
      v_descricao := 'Cadastrou usuário gestor: ' || COALESCE(v_pessoa_nome, v_label);
    ELSIF TG_OP = 'DELETE' THEN
      v_acao := 'Excluiu usuário';
      v_descricao := 'Excluiu usuário gestor: ' || COALESCE(v_pessoa_nome, v_label);
    ELSE
      v_descricao := 'Atualizou usuário gestor: ' || COALESCE(v_pessoa_nome, v_label);
    END IF;
  ELSIF TG_TABLE_NAME = 'contas_receber' THEN
    SELECT p.id, p.nome, p.tipo
      INTO v_pessoa_id, v_pessoa_nome, v_pessoa_tipo
    FROM public.parceiros p
    WHERE p.id = (v_row ->> 'cliente_id')::uuid;

    IF TG_OP = 'UPDATE'
       AND upper(COALESCE(v_new ->> 'status', '')) = 'PAGO'
       AND upper(COALESCE(v_old ->> 'status', '')) <> 'PAGO' THEN
      v_acao := 'Recebeu pagamento';
      v_descricao := 'Recebeu pagamento de ' || COALESCE(v_pessoa_nome, 'cliente') || ': ' || COALESCE(NULLIF(v_row ->> 'descricao', ''), 'cobrança');
    ELSIF TG_OP = 'DELETE' THEN
      v_acao := 'Excluiu cobrança';
      v_descricao := 'Excluiu cobrança de ' || COALESCE(v_pessoa_nome, 'cliente') || ': ' || COALESCE(NULLIF(v_row ->> 'descricao', ''), 'cobrança');
    ELSIF TG_OP = 'INSERT' THEN
      v_acao := 'Criou cobrança';
      v_descricao := 'Criou cobrança para ' || COALESCE(v_pessoa_nome, 'cliente') || ': ' || COALESCE(NULLIF(v_row ->> 'descricao', ''), 'cobrança');
    ELSE
      v_descricao := 'Atualizou cobrança de ' || COALESCE(v_pessoa_nome, 'cliente') || ': ' || COALESCE(NULLIF(v_row ->> 'descricao', ''), 'cobrança');
    END IF;
  ELSIF TG_TABLE_NAME = 'matriculas' THEN
    SELECT p.id, p.nome, p.tipo, t.polo_id, t.nome
      INTO v_pessoa_id, v_pessoa_nome, v_pessoa_tipo, v_polo_id, v_turma_nome
    FROM public.parceiros p
    JOIN public.turmas t ON t.id = (v_row ->> 'turma_id')::uuid
    WHERE p.id = (v_row ->> 'aluno_id')::uuid;

    IF upper(COALESCE(v_new ->> 'status', v_row ->> 'status', '')) = 'ATIVO'
       AND (TG_OP = 'INSERT' OR upper(COALESCE(v_old ->> 'status', '')) <> 'ATIVO') THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.contas_receber cr
        WHERE cr.matricula_id = (v_row ->> 'id')::uuid
          AND upper(cr.status) = 'PAGO'
      ) OR EXISTS (
        SELECT 1
        FROM public.inscricoes_online io
        WHERE io.matricula_id = (v_row ->> 'id')::uuid
          AND upper(io.status) = 'PAGO'
      ) INTO v_has_paid;

      IF NOT COALESCE(v_has_paid, false) THEN
        v_acao := 'Liberou sem receber';
        v_descricao := 'Liberou matrícula sem recebimento confirmado para ' || COALESCE(v_pessoa_nome, 'aluno') || COALESCE(' - ' || v_turma_nome, '');
      ELSE
        v_acao := 'Liberou matrícula';
        v_descricao := 'Liberou matrícula de ' || COALESCE(v_pessoa_nome, 'aluno') || COALESCE(' - ' || v_turma_nome, '');
      END IF;
    ELSE
      v_descricao := v_acao || ' matrícula de ' || COALESCE(v_pessoa_nome, 'aluno') || COALESCE(' - ' || v_turma_nome, '');
    END IF;
  ELSIF TG_TABLE_NAME = 'matricula_movimentacoes' THEN
    SELECT p.id, p.nome, p.tipo, COALESCE(td.polo_id, tor.polo_id, tm.polo_id), COALESCE(td.nome, tor.nome, tm.nome)
      INTO v_pessoa_id, v_pessoa_nome, v_pessoa_tipo, v_polo_id, v_turma_nome
    FROM public.parceiros p
    LEFT JOIN public.matriculas m ON m.id = NULLIF(v_row ->> 'matricula_id', '')::uuid
    LEFT JOIN public.turmas tm ON tm.id = m.turma_id
    LEFT JOIN public.turmas td ON td.id = NULLIF(v_row ->> 'turma_destino_id', '')::uuid
    LEFT JOIN public.turmas tor ON tor.id = NULLIF(v_row ->> 'turma_origem_id', '')::uuid
    WHERE p.id = (v_row ->> 'aluno_id')::uuid;

    v_acao := COALESCE(NULLIF(v_row ->> 'tipo', ''), v_acao);
    v_descricao := 'Movimentação de matrícula de ' || COALESCE(v_pessoa_nome, 'aluno') || COALESCE(': ' || NULLIF(v_row ->> 'motivo', ''), '');
  ELSIF TG_TABLE_NAME = 'turmas' THEN
    v_polo_id := COALESCE(v_polo_id, NULLIF(v_row ->> 'polo_id', '')::uuid);
    v_descricao := v_acao || ' turma: ' || COALESCE(NULLIF(v_row ->> 'nome', ''), v_label);
  ELSE
    v_descricao := v_acao || ' ' || v_label || ' em ' || replace(TG_TABLE_NAME, '_', ' ');
  END IF;

  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
    actor_tipo,
    pessoa_id,
    pessoa_nome,
    pessoa_tipo,
    polo_id,
    modulo,
    entidade,
    entidade_id,
    acao,
    descricao,
    origem,
    detalhes
  )
  VALUES (
    v_actor_id,
    v_actor_nome,
    v_actor_email,
    v_actor_tipo,
    v_pessoa_id,
    v_pessoa_nome,
    v_pessoa_tipo,
    v_polo_id,
    v_modulo,
    TG_TABLE_NAME,
    v_entidade_id,
    v_acao,
    COALESCE(v_descricao, v_acao || ' ' || v_label || ' em ' || replace(TG_TABLE_NAME, '_', ' ')),
    v_origem,
    jsonb_strip_nulls(jsonb_build_object(
      'operacao', TG_OP,
      'tabela', TG_TABLE_NAME,
      'camposAlterados', v_changed_fields
    ))
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_sistema_evento_manual(
  p_modulo text,
  p_entidade text,
  p_acao text,
  p_descricao text,
  p_pessoa_id uuid DEFAULT NULL,
  p_pessoa_tipo text DEFAULT NULL,
  p_polo_id uuid DEFAULT NULL,
  p_detalhes jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento_id uuid;
  v_actor_id uuid := auth.uid();
  v_actor_email text := NULLIF(auth.jwt() ->> 'email', '');
  v_actor_nome text;
  v_actor_tipo text;
  v_pessoa_nome text;
  v_pessoa_tipo text := p_pessoa_tipo;
  v_polo_id uuid := p_polo_id;
BEGIN
  SELECT u.nome, u.email, 'Gestor'
    INTO v_actor_nome, v_actor_email, v_actor_tipo
  FROM public.usuarios_sistema u
  WHERE (v_actor_id IS NOT NULL AND u.id = v_actor_id)
     OR (v_actor_email IS NOT NULL AND lower(u.email) = lower(v_actor_email))
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_actor_nome IS NULL THEN
    SELECT p.nome, p.email, p.tipo, p.id, COALESCE(v_polo_id, p.polo_id)
      INTO v_actor_nome, v_actor_email, v_actor_tipo, v_actor_id, v_polo_id
    FROM public.parceiros p
    WHERE (v_actor_id IS NOT NULL AND p.id = v_actor_id)
       OR (v_actor_email IS NOT NULL AND lower(p.email) = lower(v_actor_email))
    ORDER BY p.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF p_pessoa_id IS NOT NULL THEN
    SELECT p.nome, COALESCE(v_pessoa_tipo, p.tipo), COALESCE(v_polo_id, p.polo_id)
      INTO v_pessoa_nome, v_pessoa_tipo, v_polo_id
    FROM public.parceiros p
    WHERE p.id = p_pessoa_id;

    IF v_pessoa_nome IS NULL THEN
      SELECT u.nome, COALESCE(v_pessoa_tipo, 'Gestor')
        INTO v_pessoa_nome, v_pessoa_tipo
      FROM public.usuarios_sistema u
      WHERE u.id = p_pessoa_id;
    END IF;
  END IF;

  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
    actor_tipo,
    pessoa_id,
    pessoa_nome,
    pessoa_tipo,
    polo_id,
    modulo,
    entidade,
    entidade_id,
    acao,
    descricao,
    origem,
    detalhes
  )
  VALUES (
    v_actor_id,
    COALESCE(v_actor_nome, v_actor_email, 'Sistema'),
    v_actor_email,
    COALESCE(v_actor_tipo, 'Sistema'),
    p_pessoa_id,
    v_pessoa_nome,
    v_pessoa_tipo,
    v_polo_id,
    COALESCE(NULLIF(p_modulo, ''), 'Sistema'),
    COALESCE(NULLIF(p_entidade, ''), 'manual'),
    p_pessoa_id::text,
    COALESCE(NULLIF(p_acao, ''), 'Evento'),
    COALESCE(NULLIF(p_descricao, ''), 'Evento registrado no sistema'),
    'Aplicativo',
    COALESCE(p_detalhes, '{}'::jsonb)
  )
  RETURNING id INTO v_evento_id;

  RETURN v_evento_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_sistema_eventos(integer, text, text);

CREATE OR REPLACE FUNCTION public.get_sistema_eventos(
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_modulo text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_actor_tipo text DEFAULT NULL,
  p_pessoa_tipo text DEFAULT NULL,
  p_polo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id text,
  data_evento timestamptz,
  usuario_nome text,
  usuario_email text,
  usuario_tipo text,
  pessoa_nome text,
  pessoa_tipo text,
  polo_id uuid,
  polo_nome text,
  modulo text,
  entidade text,
  acao text,
  descricao text,
  entidade_id text,
  origem text,
  detalhes jsonb,
  total_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eventos AS (
    SELECT
      se.id::text AS id,
      se.created_at AS data_evento,
      COALESCE(se.actor_nome, 'Sistema') AS usuario_nome,
      se.actor_email AS usuario_email,
      COALESCE(se.actor_tipo, 'Sistema') AS usuario_tipo,
      se.pessoa_nome,
      se.pessoa_tipo,
      se.polo_id,
      po.nome AS polo_nome,
      se.modulo,
      se.entidade,
      se.acao,
      se.descricao,
      se.entidade_id,
      se.origem,
      se.detalhes
    FROM public.sistema_eventos se
    LEFT JOIN public.polos po ON po.id = se.polo_id

    UNION ALL

    SELECT
      ('asaas:' || awe.event_id)::text AS id,
      COALESCE(awe.received_at, awe.processed_at) AS data_evento,
      'Sistema'::text AS usuario_nome,
      NULL::text AS usuario_email,
      'Sistema'::text AS usuario_tipo,
      p.nome AS pessoa_nome,
      p.tipo AS pessoa_tipo,
      cr.polo_id,
      po.nome AS polo_nome,
      'Financeiro'::text AS modulo,
      'asaas_webhook_events'::text AS entidade,
      'Webhook'::text AS acao,
      COALESCE(awe.event_type, 'Evento Asaas') || COALESCE(' - pagamento ' || awe.payment_id, '') AS descricao,
      awe.payment_id AS entidade_id,
      'Asaas'::text AS origem,
      jsonb_strip_nulls(jsonb_build_object(
        'processado', awe.processed,
        'erro', awe.processing_error
      )) AS detalhes
    FROM public.asaas_webhook_events awe
    LEFT JOIN public.contas_receber cr ON cr.asaas_payment_id = awe.payment_id
    LEFT JOIN public.parceiros p ON p.id = cr.cliente_id
    LEFT JOIN public.polos po ON po.id = cr.polo_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sistema_eventos se
      WHERE se.entidade = 'asaas_webhook_events'
        AND se.entidade_id = awe.event_id
    )

    UNION ALL

    SELECT
      ('matricula:' || mm.id::text)::text AS id,
      COALESCE(mm.created_at, mm.data_movimentacao::timestamptz) AS data_evento,
      COALESCE(u.nome, 'Sistema') AS usuario_nome,
      u.email AS usuario_email,
      CASE WHEN u.id IS NULL THEN 'Sistema' ELSE 'Gestor' END AS usuario_tipo,
      p.nome AS pessoa_nome,
      p.tipo AS pessoa_tipo,
      COALESCE(td.polo_id, tor.polo_id, tm.polo_id) AS polo_id,
      po.nome AS polo_nome,
      'Gestão Acadêmica'::text AS modulo,
      'matricula_movimentacoes'::text AS entidade,
      COALESCE(mm.tipo, 'Movimentação') AS acao,
      'Movimentação de matrícula' || COALESCE(': ' || mm.motivo, '') AS descricao,
      mm.matricula_id::text AS entidade_id,
      'Matrícula'::text AS origem,
      jsonb_strip_nulls(jsonb_build_object(
        'statusAnterior', mm.status_anterior,
        'statusNovo', mm.status_novo,
        'alunoId', mm.aluno_id
      )) AS detalhes
    FROM public.matricula_movimentacoes mm
    LEFT JOIN public.usuarios_sistema u ON u.id = mm.responsavel_id
    LEFT JOIN public.parceiros p ON p.id = mm.aluno_id
    LEFT JOIN public.matriculas m ON m.id = mm.matricula_id
    LEFT JOIN public.turmas tm ON tm.id = m.turma_id
    LEFT JOIN public.turmas td ON td.id = mm.turma_destino_id
    LEFT JOIN public.turmas tor ON tor.id = mm.turma_origem_id
    LEFT JOIN public.polos po ON po.id = COALESCE(td.polo_id, tor.polo_id, tm.polo_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sistema_eventos se
      WHERE se.entidade = 'matricula_movimentacoes'
        AND se.entidade_id = mm.id::text
    )

    UNION ALL

    SELECT
      ('turma-financeiro:' || htf.id::text)::text AS id,
      htf.created_at AS data_evento,
      'Sistema'::text AS usuario_nome,
      NULL::text AS usuario_email,
      'Sistema'::text AS usuario_tipo,
      p.nome AS pessoa_nome,
      p.tipo AS pessoa_tipo,
      t.polo_id AS polo_id,
      po.nome AS polo_nome,
      'Financeiro'::text AS modulo,
      'historico_turma_financeira'::text AS entidade,
      COALESCE(htf.evento, 'Histórico') AS acao,
      COALESCE(htf.observacao, htf.evento, 'Histórico financeiro de turma') AS descricao,
      COALESCE(htf.matricula_id::text, htf.turma_id::text) AS entidade_id,
      'Financeiro'::text AS origem,
      jsonb_strip_nulls(jsonb_build_object(
        'turmaId', htf.turma_id,
        'matriculaId', htf.matricula_id
      )) AS detalhes
    FROM public.historico_turma_financeira htf
    LEFT JOIN public.matriculas m ON m.id = htf.matricula_id
    LEFT JOIN public.parceiros p ON p.id = m.aluno_id
    LEFT JOIN public.turmas t ON t.id = COALESCE(htf.turma_id, m.turma_id)
    LEFT JOIN public.polos po ON po.id = t.polo_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.sistema_eventos se
      WHERE se.entidade = 'historico_turma_financeira'
        AND se.entidade_id = htf.id::text
    )
  ),
  filtered AS (
    SELECT e.*
    FROM eventos e
    WHERE (p_modulo IS NULL OR p_modulo = '' OR e.modulo = p_modulo)
      AND (p_actor_tipo IS NULL OR p_actor_tipo = '' OR e.usuario_tipo = p_actor_tipo)
      AND (p_pessoa_tipo IS NULL OR p_pessoa_tipo = '' OR e.pessoa_tipo = p_pessoa_tipo)
      AND (p_polo_id IS NULL OR e.polo_id = p_polo_id)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR e.usuario_nome ILIKE '%' || p_search || '%'
        OR COALESCE(e.usuario_email, '') ILIKE '%' || p_search || '%'
        OR COALESCE(e.usuario_tipo, '') ILIKE '%' || p_search || '%'
        OR COALESCE(e.pessoa_nome, '') ILIKE '%' || p_search || '%'
        OR COALESCE(e.pessoa_tipo, '') ILIKE '%' || p_search || '%'
        OR COALESCE(e.polo_nome, '') ILIKE '%' || p_search || '%'
        OR e.modulo ILIKE '%' || p_search || '%'
        OR e.acao ILIKE '%' || p_search || '%'
        OR e.descricao ILIKE '%' || p_search || '%'
        OR e.entidade ILIKE '%' || p_search || '%'
      )
  )
  SELECT
    f.*,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.data_evento DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100)
  OFFSET (GREATEST(COALESCE(p_page, 1), 1) - 1) * LEAST(GREATEST(COALESCE(p_page_size, 25), 1), 100);
$$;

REVOKE EXECUTE ON FUNCTION public.registrar_sistema_evento_manual(text, text, text, text, uuid, text, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_sistema_eventos(integer, integer, text, text, text, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.registrar_sistema_evento_manual(text, text, text, text, uuid, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_sistema_eventos(integer, integer, text, text, text, text, uuid) TO authenticated, service_role;

COMMIT;
