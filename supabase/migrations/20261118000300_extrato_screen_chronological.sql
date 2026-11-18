BEGIN;
-- Extrato da tela também cronológico, antes do limite; demais tipos mantêm DESC.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.get_relatorio_movimentacao_financeira_secure(uuid,text,date,date,uuid,text,text,text)'::regprocedure);
  IF md5(v_definition) <> 'd481f9522dc0d25ee26ab273475fd0c9' THEN
    RAISE EXCEPTION 'Contrato financeiro mudou; revisar ordem do extrato.';
  END IF;
  v_definition := replace(v_definition, $old$row_number() OVER (ORDER BY movimento.data DESC, movimento.id DESC) AS sequencia$old$, $new$row_number() OVER (ORDER BY
        CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN movimento.data END ASC,
        CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN movimento.id END ASC,
        movimento.data DESC, movimento.id DESC
      ) AS sequencia$new$);
  v_definition := replace(v_definition, $old$ORDER BY data DESC, id DESC
    ) FILTER (WHERE sequencia <= v_limite)$old$, $new$ORDER BY sequencia
    ) FILTER (WHERE sequencia <= v_limite)$new$);
  IF md5(v_definition) <> 'bcd97edfb0dd0dc9da0160c490767ff3' THEN
    RAISE EXCEPTION 'Ordenação divergiu do contrato revisado.';
  END IF;
  EXECUTE v_definition;
END;
$migration$;
COMMIT;
