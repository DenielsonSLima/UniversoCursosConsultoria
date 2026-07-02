-- Auditoria central para o submodulo Configuracoes > Logs e Eventos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sistema_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  actor_nome text,
  actor_email text,
  modulo text NOT NULL DEFAULT 'Sistema',
  entidade text NOT NULL,
  entidade_id text,
  acao text NOT NULL,
  descricao text NOT NULL,
  origem text NOT NULL DEFAULT 'Sistema',
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_created_at
  ON public.sistema_eventos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_modulo_created_at
  ON public.sistema_eventos (modulo, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sistema_eventos_actor_id_created_at
  ON public.sistema_eventos (actor_id, created_at DESC);

ALTER TABLE public.sistema_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sistema_eventos_select_gestor ON public.sistema_eventos;
CREATE POLICY sistema_eventos_select_gestor
  ON public.sistema_eventos
  FOR SELECT
  TO authenticated
  USING (
    public.gestor_has_all_polos()
    OR public.gestor_has_module('configuracoes')
  );

CREATE OR REPLACE FUNCTION public.sistema_evento_modulo(p_table_name text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_table_name
    WHEN 'usuarios_sistema' THEN 'Configurações'
    WHEN 'polos' THEN 'Configurações'
    WHEN 'empresas' THEN 'Configurações'
    WHEN 'categorias' THEN 'Configurações'
    WHEN 'categorias_financeiras' THEN 'Configurações'
    WHEN 'contas_bancarias' THEN 'Configurações'
    WHEN 'regras_cobranca' THEN 'Configurações'
    WHEN 'taxas_pagamento' THEN 'Configurações'
    WHEN 'templates_mensagens' THEN 'Configurações'
    WHEN 'mensageria_config' THEN 'Configurações'
    WHEN 'asaas_config' THEN 'Configurações'
    WHEN 'documentos_templates' THEN 'Configurações'
    WHEN 'parceiros' THEN 'Parceiros'
    WHEN 'cursos' THEN 'Cadastros'
    WHEN 'disciplinas' THEN 'Cadastros'
    WHEN 'turmas' THEN 'Gestão Acadêmica'
    WHEN 'matriculas' THEN 'Gestão Acadêmica'
    WHEN 'matricula_movimentacoes' THEN 'Gestão Acadêmica'
    WHEN 'contas_receber' THEN 'Financeiro'
    WHEN 'contas_pagar' THEN 'Financeiro'
    WHEN 'despesas_lancamentos' THEN 'Financeiro'
    WHEN 'transferencias_contas' THEN 'Caixa'
    WHEN 'secretaria_solicitacoes' THEN 'Secretaria'
    WHEN 'certificados_academicos' THEN 'Secretaria'
    WHEN 'documentos_validacao' THEN 'Secretaria'
    WHEN 'biblioteca_documentos' THEN 'Biblioteca'
    WHEN 'biblioteca_pastas' THEN 'Biblioteca'
    WHEN 'comunicacao_chats' THEN 'Comunicação'
    WHEN 'comunicacao_mensagens' THEN 'Comunicação'
    ELSE 'Sistema'
  END;
$$;

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
  v_entidade_id text;
  v_label text;
  v_acao text;
  v_modulo text;
  v_changed_fields text[];
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

  SELECT u.nome, u.email
    INTO v_actor_nome, v_actor_email
  FROM public.usuarios_sistema u
  WHERE (v_actor_id IS NOT NULL AND u.id = v_actor_id)
     OR (v_actor_email IS NOT NULL AND lower(u.email) = lower(v_actor_email))
  ORDER BY u.created_at DESC NULLS LAST
  LIMIT 1;

  v_actor_nome := COALESCE(v_actor_nome, v_actor_email, 'Sistema');
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

  INSERT INTO public.sistema_eventos (
    actor_id,
    actor_nome,
    actor_email,
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
    v_modulo,
    TG_TABLE_NAME,
    v_entidade_id,
    v_acao,
    v_acao || ' ' || v_label || ' em ' || replace(TG_TABLE_NAME, '_', ' '),
    'Auditoria',
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

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'asaas_config',
    'aulas',
    'aulas_turma',
    'biblioteca_documentos',
    'biblioteca_pastas',
    'biblioteca_professor_quotas',
    'categorias',
    'categorias_financeiras',
    'certificados_academicos',
    'comunicacao_categorias',
    'comunicacao_chats',
    'comunicacao_config',
    'comunicacao_mensagens',
    'config_checklist_estagio',
    'contas_bancarias',
    'contas_pagar',
    'contas_receber',
    'cursos',
    'despesas_lancamentos',
    'diario_frequencia',
    'diario_notas',
    'diario_observacoes',
    'diario_praticas',
    'disciplinas',
    'documentos_aluno',
    'documentos_templates',
    'documentos_validacao',
    'documentos_validacao_politicas',
    'ead_aluno_progresso',
    'empresas',
    'fechamentos_academicos',
    'historico_turma_financeira',
    'inscricoes_online',
    'matricula_aproveitamentos',
    'matricula_movimentacoes',
    'matriculas',
    'matriculas_estagios',
    'mensageria_config',
    'modelos_fichas',
    'modulos',
    'parceiros',
    'periodos_letivos',
    'polos',
    'regras_cobranca',
    'secretaria_config',
    'secretaria_solicitacoes',
    'site_publico_ticker_mensagens',
    'taxas_pagamento',
    'templates_mensagens',
    'transferencias_academicas',
    'transferencias_contas',
    'turmas',
    'turmas_disciplinas',
    'usuarios_sistema'
  ] LOOP
    IF to_regclass(format('public.%I', v_table)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_sistema_eventos_audit ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER trg_sistema_eventos_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_sistema_evento_trigger()',
        v_table
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_sistema_eventos(
  p_limit integer DEFAULT 100,
  p_modulo text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  data_evento timestamptz,
  usuario_nome text,
  usuario_email text,
  modulo text,
  entidade text,
  acao text,
  descricao text,
  entidade_id text,
  origem text,
  detalhes jsonb
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
      se.modulo,
      se.entidade,
      se.acao,
      se.descricao,
      se.entidade_id,
      se.origem,
      se.detalhes
    FROM public.sistema_eventos se

    UNION ALL

    SELECT
      ('asaas:' || awe.event_id)::text AS id,
      COALESCE(awe.received_at, awe.processed_at) AS data_evento,
      'Sistema'::text AS usuario_nome,
      NULL::text AS usuario_email,
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

    UNION ALL

    SELECT
      ('matricula:' || mm.id::text)::text AS id,
      COALESCE(mm.created_at, mm.data_movimentacao::timestamptz) AS data_evento,
      COALESCE(u.nome, 'Sistema') AS usuario_nome,
      u.email AS usuario_email,
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

    UNION ALL

    SELECT
      ('turma-financeiro:' || htf.id::text)::text AS id,
      htf.created_at AS data_evento,
      'Sistema'::text AS usuario_nome,
      NULL::text AS usuario_email,
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
  )
  SELECT *
  FROM eventos e
  WHERE (p_modulo IS NULL OR p_modulo = '' OR e.modulo = p_modulo)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR e.usuario_nome ILIKE '%' || p_search || '%'
      OR COALESCE(e.usuario_email, '') ILIKE '%' || p_search || '%'
      OR e.modulo ILIKE '%' || p_search || '%'
      OR e.acao ILIKE '%' || p_search || '%'
      OR e.descricao ILIKE '%' || p_search || '%'
      OR e.entidade ILIKE '%' || p_search || '%'
    )
  ORDER BY e.data_evento DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
$$;

REVOKE ALL ON public.sistema_eventos FROM PUBLIC, anon;
GRANT SELECT ON public.sistema_eventos TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.sistema_evento_modulo(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_sistema_evento_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sistema_eventos(integer, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.sistema_evento_modulo(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_sistema_evento_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sistema_eventos(integer, text, text) TO authenticated, service_role;

COMMIT;
