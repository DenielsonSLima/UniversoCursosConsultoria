BEGIN;
-- Seis rótulos do extrato; guardas, joins, valores e saldos preservados.
DO $migration$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_functiondef('public.get_relatorio_movimentacao_financeira_secure(uuid,text,date,date,uuid,text,text,text)'::regprocedure);
  IF md5(v_definition) <> '4d2e26e26c7ed5a0a3e3b45505a1e6a8' THEN
    RAISE EXCEPTION 'Definição financeira mudou; revisar migration.';
  END IF;
  v_definition := replace(v_definition, $old$      coalesce(cb.conta, '') AS numero_conta,
      coalesce(cb.natureza, 'BANCARIA') AS natureza,
      coalesce(polo.nome, 'Sem polo') AS polo,
      cb.ativo AS ativa,
      (
$old$, $new$      coalesce(cb.conta, '') AS numero_conta,
      coalesce(cb.natureza, 'BANCARIA') AS natureza,
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo.nome, ''), nullif(concat_ws('/', nullif(polo.cidade, ''), nullif(polo.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo.nome, 'Sem polo') END AS polo,
      cb.ativo AS ativa,
      (
$new$);
  v_definition := replace(v_definition, $old$        'Conta não informada'
      ) AS conta,
      coalesce(polo.nome, 'Sem polo') AS polo,
      coalesce(
        CASE
$old$, $new$        'Conta não informada'
      ) AS conta,
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo.nome, ''), nullif(concat_ws('/', nullif(polo.cidade, ''), nullif(polo.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo.nome, 'Sem polo') END AS polo,
      coalesce(
        CASE
$new$);
  v_definition := replace(v_definition, $old$        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
$old$, $new$        'Conta não informada'
      ),
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo.nome, ''), nullif(concat_ws('/', nullif(polo.cidade, ''), nullif(polo.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo.nome, 'Sem polo') END,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
      coalesce(pagamento.valor_pago, pagamento.valor, 0)::numeric,
$new$);
  v_definition := replace(v_definition, $old$        'Conta não informada'
      ),
      coalesce(polo.nome, 'Sem polo'),
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
$old$, $new$        'Conta não informada'
      ),
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo.nome, ''), nullif(concat_ws('/', nullif(polo.cidade, ''), nullif(polo.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo.nome, 'Sem polo') END,
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
      coalesce(despesa.valor_pago, despesa.valor, 0)::numeric,
$new$);
  v_definition := replace(v_definition, $old$        'Conta de destino'
      ),
      coalesce(polo_destino.nome, 'Sem polo'),
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
$old$, $new$        'Conta de destino'
      ),
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo_destino.nome, ''), nullif(concat_ws('/', nullif(polo_destino.cidade, ''), nullif(polo_destino.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo_destino.nome, 'Sem polo') END,
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
$new$);
  v_definition := replace(v_definition, $old$        'Conta de origem'
      ),
      coalesce(polo_origem.nome, 'Sem polo'),
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
$old$, $new$        'Conta de origem'
      ),
      CASE WHEN v_tipo = 'EXTRATO_CONTA' THEN coalesce(nullif(concat_ws(' · ', nullif(polo_origem.nome, ''), nullif(concat_ws('/', nullif(polo_origem.cidade, ''), nullif(polo_origem.estado, '')), '')), ''), 'Sem polo') ELSE coalesce(polo_origem.nome, 'Sem polo') END,
      coalesce(transferencia.valor, 0)::numeric,
      coalesce(transferencia.valor, 0)::numeric,
$new$);
  IF md5(v_definition) <> 'd481f9522dc0d25ee26ab273475fd0c9' THEN
    RAISE EXCEPTION 'Rótulos divergiram do patch revisado.';
  END IF;
  EXECUTE v_definition;
END;
$migration$;
COMMIT;
