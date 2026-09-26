BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

-- Read-only classification: a student remains a valid payer of a standalone credit.
-- Preserve academic receivables, their bank history and their normal Caixa readers.
-- Preserve both public signatures, authorization, ACLs and financial composition.
DO $scope$
DECLARE
  v_reader record;
  v_definition text;
  v_metadata jsonb;
  v_anchor text := $old$WHERE credito.categoria = 'OUTROS_CREDITOS'$old$;
  v_guard text := $new$WHERE credito.categoria = 'OUTROS_CREDITOS'
      AND credito.matricula_id IS NULL
      AND credito.turma_id IS NULL
      AND credito.origem_cronograma_id IS NULL
      AND coalesce(credito.tipo_lancamento, '') NOT IN (
        'MATRICULA', 'PARCELA', 'REMATRICULA', 'DEPENDENCIA'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.inscricoes_online inscricao
        WHERE inscricao.receivable_id = credito.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.matricula_dependencia_cobrancas dependencia
        WHERE dependencia.conta_receber_id = credito.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM internal_proesc.obligation_links vinculo
        WHERE vinculo.receivable_id = credito.id
      )$new$;
  v_old_total text := 'coalesce(sum(coalesce(valor_pago, valor)), 0)';
BEGIN
  FOR v_reader IN SELECT * FROM (VALUES
    ('public.listar_outros_creditos_secure(uuid)'::regprocedure,
      'abfccfdd3dcdf987d2f883bedc70e2ed', false),
    ('public.get_outros_creditos_summary(uuid,text,date,date,uuid)'::regprocedure,
      '5a6850dd2f0cfb228618fa2f26df0268', true)
  ) AS readers(signature, expected_hash, is_summary)
  LOOP
    v_definition := pg_get_functiondef(v_reader.signature);
    IF md5(v_definition) <> v_reader.expected_hash THEN
      RAISE EXCEPTION 'Other-credit reader drift: %', v_reader.signature;
    END IF;
    SELECT jsonb_build_object('oid', oid, 'owner', proowner, 'acl', proacl,
      'definer', prosecdef, 'volatility', provolatile, 'config', proconfig)
      INTO v_metadata FROM pg_proc WHERE oid = v_reader.signature;
    IF (length(v_definition) - length(replace(v_definition, v_anchor, '')))
        / length(v_anchor) <> 1 THEN
      RAISE EXCEPTION 'Unexpected other-credit classification anchor';
    END IF;
    v_definition := replace(v_definition, v_anchor, v_guard);
    IF v_reader.is_summary THEN
      IF (length(v_definition) - length(replace(v_definition, v_old_total, '')))
          / length(v_old_total) <> 1 THEN
        RAISE EXCEPTION 'Unexpected other-credit nominal-total anchor';
      END IF;
      -- all_value is nominal principal across all listed statuses. Actual received
      -- value remains status=PAGO with valor_pago, including discounts/interest.
      v_definition := replace(v_definition, v_old_total, 'coalesce(sum(valor), 0)');
    END IF;
    EXECUTE v_definition;
    IF v_metadata IS DISTINCT FROM (
      SELECT jsonb_build_object('oid', oid, 'owner', proowner, 'acl', proacl,
        'definer', prosecdef, 'volatility', provolatile, 'config', proconfig)
      FROM pg_proc WHERE oid = v_reader.signature
    ) THEN
      RAISE EXCEPTION 'Other-credit reader security metadata changed';
    END IF;
  END LOOP;
END;
$scope$;

NOTIFY pgrst, 'reload schema';
COMMIT;
