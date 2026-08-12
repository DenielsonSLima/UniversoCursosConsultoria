BEGIN;

-- A migration de relatórios já publicada expõe a coluna como cb.ativo no
-- subselect de contas, mas o payload canônico lê conta.ativa. Recria somente
-- a função existente, a partir da definição canônica instalada imediatamente
-- antes desta correção, sem tocar em fatos financeiros nem em políticas.
DO $migration$
DECLARE
  v_definition text;
  v_original constant text := 'cb.ativo,';
  v_corrected constant text := 'cb.ativo AS ativa,';
BEGIN
  SELECT pg_get_functiondef(
    'public.get_relatorio_movimentacao_financeira_secure(uuid,text,date,date,uuid,text,text,text)'::regprocedure
  )
  INTO v_definition;

  IF v_definition IS NULL
     OR position(v_original IN v_definition) = 0
     OR position(v_corrected IN v_definition) > 0 THEN
    RAISE EXCEPTION 'Definição inesperada do relatório financeiro; correção de alias abortada.'
      USING ERRCODE = '55000';
  END IF;

  EXECUTE replace(v_definition, v_original, v_corrected);
END;
$migration$;

REVOKE ALL ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_relatorio_movimentacao_financeira_secure(
  uuid, text, date, date, uuid, text, text, text
) IS 'Contrato canônico dos relatórios separados de extrato por conta, entradas, saídas, receitas e despesas da Central de Relatórios.';

NOTIFY pgrst, 'reload schema';

COMMIT;
