-- Torna as buscas textuais do modulo Financeiro insensiveis a acentos e caixa.
--
-- A migration reescreve somente as expressoes de busca das funcoes ja
-- instaladas. As assinaturas, predicados de polo, permissoes, status, datas,
-- paginacao e o corpo restante de cada funcao sao preservados a partir da
-- definicao ativa no momento da migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.financeiro_normalize_search_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT lower(extensions.unaccent(coalesce(p_value, '')));
$function$;

REVOKE ALL ON FUNCTION public.financeiro_normalize_search_text(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_normalize_search_text(text)
  TO authenticated, service_role;

DO $migration$
DECLARE
  v_signature text;
  v_function_oid regprocedure;
  v_definition text;
  v_rewritten text;
  v_field text;
  v_functions constant text[] := ARRAY[
    'public.search_financeiro_aluno_receivables_secure(text,uuid,integer)',
    'public.get_receivables_modality_page(text,uuid,text,date,date,text,text,text,integer,integer)',
    'public.get_receivables_modality_groups_page(text,uuid,text,date,date,text,text,integer,integer)',
    'public.get_receivables_modality_summary_v2(text,uuid,text,date,date)',
    'public.get_despesas_summary(text,uuid,uuid,text,date,date,text,uuid)',
    'public.get_despesas_group_summary_secure(text,uuid,uuid,text,date,date,text,uuid)',
    'public.get_transferencias_contas(uuid,text,uuid,uuid,date,date,boolean)',
    'public.get_outros_creditos_summary(uuid,text,date,date,uuid)'
  ];
BEGIN
  FOREACH v_signature IN ARRAY v_functions LOOP
    v_function_oid := to_regprocedure(v_signature);
    IF v_function_oid IS NULL THEN
      RAISE EXCEPTION 'Funcao financeira obrigatoria nao encontrada: %', v_signature;
    END IF;

    SELECT pg_get_functiondef(v_function_oid)
      INTO v_definition;

    -- Permite reaplicar a migration sem reescrever funcoes ja normalizadas.
    IF position('financeiro_normalize_search_text' IN v_definition) > 0 THEN
      CONTINUE;
    END IF;

    v_rewritten := v_definition;

    IF v_signature =
       'public.search_financeiro_aluno_receivables_secure(text,uuid,integer)'
    THEN
      v_rewritten := replace(
        v_rewritten,
        'lower(trim(COALESCE(p_search, '''')))',
        'public.financeiro_normalize_search_text(trim(COALESCE(p_search, '''')))'
      );
      v_rewritten := replace(
        v_rewritten,
        'lower(student.nome)',
        'public.financeiro_normalize_search_text(student.nome)'
      );
      v_rewritten := replace(
        v_rewritten,
        'lower(COALESCE(student.cpf_cnpj, ''''))',
        'public.financeiro_normalize_search_text(student.cpf_cnpj)'
      );
      v_rewritten := replace(
        v_rewritten,
        'lower(COALESCE(receivable.descricao, ''''))',
        'public.financeiro_normalize_search_text(receivable.descricao)'
      );

    ELSIF v_signature IN (
      'public.get_receivables_modality_page(text,uuid,text,date,date,text,text,text,integer,integer)',
      'public.get_receivables_modality_groups_page(text,uuid,text,date,date,text,text,integer,integer)'
    ) THEN
      v_rewritten := replace(
        v_rewritten,
        'NULLIF(BTRIM(COALESCE(p_search, '''')), '''') AS search_term',
        'NULLIF(public.financeiro_normalize_search_text(BTRIM(COALESCE(p_search, ''''))), '''') AS search_term'
      );

      FOREACH v_field IN ARRAY ARRAY[
        'cr.descricao',
        'pa.nome',
        'pa.cpf_cnpj',
        't.nome',
        'po.nome',
        'po.cnpj',
        'po.cidade',
        'po.estado'
      ] LOOP
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ILIKE',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ilike',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
      END LOOP;

    ELSIF v_signature =
          'public.get_receivables_modality_summary_v2(text,uuid,text,date,date)'
    THEN
      v_rewritten := replace(
        v_rewritten,
        'BTRIM(p_search)',
        'public.financeiro_normalize_search_text(BTRIM(p_search))'
      );
      FOREACH v_field IN ARRAY ARRAY[
        'cr.descricao',
        'pa.nome',
        'pa.cpf_cnpj',
        't.nome',
        'po.nome',
        'po.cnpj',
        'po.cidade',
        'po.estado'
      ] LOOP
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ILIKE',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ilike',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
      END LOOP;

    ELSIF v_signature IN (
      'public.get_despesas_summary(text,uuid,uuid,text,date,date,text,uuid)',
      'public.get_despesas_group_summary_secure(text,uuid,uuid,text,date,date,text,uuid)'
    ) THEN
      v_rewritten := replace(
        v_rewritten,
        'nullif(trim(coalesce(p_search, '''')), '''')',
        'nullif(public.financeiro_normalize_search_text(trim(coalesce(p_search, ''''))), '''')'
      );
      FOREACH v_field IN ARRAY ARRAY[
        'despesa.descricao',
        'categoria.nome',
        'parceiro.nome',
        'polo.nome'
      ] LOOP
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ILIKE',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ilike',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
      END LOOP;

    ELSIF v_signature =
          'public.get_transferencias_contas(uuid,text,uuid,uuid,date,date,boolean)'
    THEN
      v_rewritten := replace(
        v_rewritten,
        'trim(p_search)',
        'public.financeiro_normalize_search_text(trim(p_search))'
      );
      FOREACH v_field IN ARRAY ARRAY[
        'tc.observacao',
        'origem.banco',
        'destino.banco',
        'po.nome',
        'pd.nome'
      ] LOOP
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ILIKE',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ilike',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
      END LOOP;

    ELSIF v_signature =
          'public.get_outros_creditos_summary(uuid,text,date,date,uuid)'
    THEN
      v_rewritten := replace(
        v_rewritten,
        'btrim(p_search)',
        'public.financeiro_normalize_search_text(btrim(p_search))'
      );
      FOREACH v_field IN ARRAY ARRAY[
        'cr.descricao',
        'cf.nome',
        'p.nome',
        'p.cpf_cnpj',
        'po.nome',
        'po.cnpj',
        'po.cidade',
        'po.estado',
        'cr.forma_pagamento::text',
        'cr.asaas_status::text'
      ] LOOP
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ILIKE',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
        v_rewritten := replace(
          v_rewritten,
          v_field || ' ilike',
          'public.financeiro_normalize_search_text(' || v_field || ') LIKE'
        );
      END LOOP;
    END IF;

    IF v_rewritten = v_definition THEN
      RAISE EXCEPTION
        'Nenhuma expressao de busca reconhecida em %. Revise o contrato antes de migrar.',
        v_signature;
    END IF;

    EXECUTE v_rewritten;
  END LOOP;
END;
$migration$;

-- Mantem o principal caminho de busca indexado apos aplicar unaccent.
CREATE INDEX IF NOT EXISTS parceiros_alunos_nome_unaccent_trgm_idx
  ON public.parceiros
  USING gin (
    public.financeiro_normalize_search_text(nome) extensions.gin_trgm_ops
  )
  WHERE tipo = 'Aluno';

CREATE INDEX IF NOT EXISTS parceiros_alunos_cpf_unaccent_trgm_idx
  ON public.parceiros
  USING gin (
    public.financeiro_normalize_search_text(coalesce(cpf_cnpj, ''))
      extensions.gin_trgm_ops
  )
  WHERE tipo = 'Aluno';

CREATE INDEX IF NOT EXISTS contas_receber_descricao_abertos_unaccent_trgm_idx
  ON public.contas_receber
  USING gin (
    public.financeiro_normalize_search_text(coalesce(descricao, ''))
      extensions.gin_trgm_ops
  )
  WHERE categoria = 'MENSALIDADE'
    AND status IN ('PENDENTE', 'VENCIDO');

COMMIT;
