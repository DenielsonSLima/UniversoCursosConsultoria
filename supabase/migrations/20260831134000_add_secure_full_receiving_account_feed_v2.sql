-- Mantém o feed financeiro original como fonte autorizada e enriquece somente
-- os itens já liberados com a identificação operacional da conta recebedora.
BEGIN;

CREATE OR REPLACE FUNCTION public.list_financial_receipts_v2_secure(
  p_company_id uuid DEFAULT NULL,
  p_polo_id uuid DEFAULT NULL,
  p_payment_start date DEFAULT NULL,
  p_payment_end date DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_origin text DEFAULT 'TODOS',
  p_environment text DEFAULT 'production',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_allowed_polo_ids uuid[] := ARRAY[]::uuid[];
  v_payload jsonb;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.gestor_has_module('financeiro')
     OR NOT public.gestor_has_financeiro_tab('receber')
  THEN
    RAISE EXCEPTION 'Acesso negado aos recebimentos financeiros.'
      USING ERRCODE = '42501';
  END IF;

  v_allowed_polo_ids := coalesce(
    public.gestor_allowed_polo_ids(),
    ARRAY[]::uuid[]
  );

  IF cardinality(v_allowed_polo_ids) = 0 THEN
    RAISE EXCEPTION 'Nenhum polo financeiro autorizado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NOT NULL
     AND NOT (p_polo_id = ANY (v_allowed_polo_ids))
  THEN
    RAISE EXCEPTION 'Polo fora do escopo financeiro autorizado.'
      USING ERRCODE = '42501';
  END IF;

  v_payload := public.list_financial_receipts_secure(
    p_company_id => p_company_id,
    p_polo_id => p_polo_id,
    p_payment_start => p_payment_start,
    p_payment_end => p_payment_end,
    p_search => p_search,
    p_origin => p_origin,
    p_environment => p_environment,
    p_page => p_page,
    p_page_size => p_page_size
  );

  WITH authorized_items AS (
    SELECT
      item.payload_item,
      item.position,
      receiving_account.id AS receiving_account_id,
      receiving_account.banco,
      receiving_account.agencia,
      receiving_account.conta
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_payload -> 'items') = 'array'
          THEN v_payload -> 'items'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS item(payload_item, position)
    JOIN public.contas_receber receivable
      ON receivable.id = (item.payload_item ->> 'id')::uuid
      AND receivable.polo_id = ANY (v_allowed_polo_ids)
      AND (p_polo_id IS NULL OR receivable.polo_id = p_polo_id)
    LEFT JOIN public.receivable_manual_settlements manual_settlement
      ON manual_settlement.id = receivable.manual_settlement_id
      AND manual_settlement.receivable_id = receivable.id
      AND receivable.manual_settlement_reversed_at IS NULL
      AND manual_settlement.reversed_at IS NULL
    LEFT JOIN public.contas_bancarias receiving_account
      ON receiving_account.id = coalesce(
        manual_settlement.account_id,
        receivable.conta_bancaria_id
      )
      AND EXISTS (
        SELECT 1
        FROM public.contas_bancarias_polos account_scope
        WHERE account_scope.conta_bancaria_id = receiving_account.id
          AND account_scope.polo_id = receivable.polo_id
      )
  ),
  enriched_items AS (
    SELECT
      authorized.payload_item || jsonb_build_object(
        'conta_recebedora_nome',
        CASE
          WHEN authorized.receiving_account_id IS NULL THEN coalesce(
            authorized.payload_item ->> 'conta_recebedora_nome',
            'Conta não informada'
          )
          ELSE coalesce(
            nullif(
              concat_ws(
                ' · ',
                nullif(btrim(authorized.banco), ''),
                CASE
                  WHEN nullif(btrim(authorized.agencia), '') IS NULL THEN NULL
                  ELSE 'Ag. ' || btrim(authorized.agencia)
                END,
                CASE
                  WHEN nullif(btrim(authorized.conta), '') IS NULL THEN NULL
                  ELSE 'Conta ' || btrim(authorized.conta)
                END
              ),
              ''
            ),
            'Conta não informada'
          )
        END
      ) AS payload_item,
      authorized.position
    FROM authorized_items authorized
  )
  SELECT coalesce(
    jsonb_agg(enriched.payload_item ORDER BY enriched.position),
    '[]'::jsonb
  )
  INTO v_items
  FROM enriched_items enriched;

  RETURN jsonb_set(v_payload, '{items}', v_items, false);
END;
$function$;

ALTER FUNCTION public.list_financial_receipts_v2_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.list_financial_receipts_v2_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_financial_receipts_v2_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.list_financial_receipts_v2_secure(
  uuid, uuid, date, date, text, text, text, integer, integer
) IS
  'Lista recebimentos já autorizados e exibe somente banco, agência e conta efetiva para conferência operacional do gestor.';

COMMIT;
