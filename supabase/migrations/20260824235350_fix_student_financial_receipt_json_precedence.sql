BEGIN;

-- Hotfix incremental: evita que || seja resolvido como concatenação JSONB
-- antes de ->> ao compor o rótulo de turma do snapshot do recibo.
-- Snapshot autorizado do recibo do Aluno. O editor de Modelos Documentos
-- oferece somente o fallback de recibo padrão, sem geometria persistida.
CREATE OR REPLACE FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  p_aluno_id uuid,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_list jsonb;
  v_item jsonb;
  v_polo_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_aluno_id IS NULL
     OR public.current_aluno_id() IS NULL
     OR p_aluno_id IS DISTINCT FROM public.current_aluno_id() THEN
    RAISE EXCEPTION 'Recibo do aluno não autorizado.' USING ERRCODE = '42501';
  END IF;

  v_list := public.portal_aluno_financeiro_listar(
    p_aluno_id,
    NULL,
    NULL,
    NULL,
    'TODOS',
    'TODOS',
    1,
    1,
    p_lancamento_id
  );
  v_item := v_list->'items'->0;

  IF v_item IS NULL
     OR v_item->>'statusCode' <> 'PAGO'
     OR NOT coalesce((v_item->>'receiptEligible')::boolean, false) THEN
    RAISE EXCEPTION 'Recibo indisponível ou fora do escopo do aluno autenticado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT conta.polo_id
  INTO v_polo_id
  FROM public.contas_receber AS conta
  WHERE conta.id = p_lancamento_id
    AND conta.cliente_id = p_aluno_id
    AND upper(btrim(coalesce(conta.status, ''))) = 'PAGO';

  IF v_polo_id IS NULL THEN
    SELECT coalesce(aluno.polo_id, aluno.polo_ids[1])
    INTO v_polo_id
    FROM public.parceiros AS aluno
    WHERE aluno.id = p_aluno_id;
  END IF;

  SELECT jsonb_build_object(
    'model', jsonb_build_object(
      'key', 'recibo',
      'source', 'MODELO_RECIBO_PADRAO',
      'revision', 1,
      'orientation', 'portrait',
      'documentKind', 'RECIBO_PAGAMENTO_ALUNO'
    ),
    'receipt', jsonb_build_object(
      'id', v_item->>'id',
      'receiptNumber', upper(left(v_item->>'id', 8)),
      'title', 'Recibo de pagamento',
      'statusCode', 'PAGO',
      'statusLabel', 'Pago',
      'description', coalesce(
        nullif(btrim(v_item->>'descricao'), ''),
        'Pagamento acadêmico'
      ),
      'category', coalesce(
        nullif(btrim(v_item->>'categoria'), ''),
        'Mensalidade'
      ),
      'payerName', coalesce(
        nullif(btrim(v_item #>> '{parceiros,nome}'), ''),
        aluno.nome,
        'Aluno não informado'
      ),
      'payerDocument', coalesce(
        nullif(btrim(v_item #>> '{parceiros,cpf_cnpj}'), ''),
        nullif(btrim(aluno.cpf_cnpj), '')
      ),
      'courseLabel', coalesce(
        nullif(concat_ws(
          ' - ',
          nullif(btrim(v_item->>'cursoNome'), ''),
          CASE WHEN nullif(btrim(v_item->>'turmaNome'), '') IS NULL
            OR v_item->>'turmaNome' = 'N/A' THEN NULL
            ELSE concat('Turma ', v_item->>'turmaNome') END
        ), ''),
        'Pagamento acadêmico'
      ),
      'valueExpected', greatest(
        coalesce(nullif(v_item->>'valor', '')::numeric, 0),
        0
      ),
      'valuePaid', greatest(
        coalesce(
          nullif(v_item #>> '{financial_summary,paidValue}', '')::numeric,
          0
        ),
        0
      ),
      'valueOutstanding', 0,
      'dueDate', v_item->>'data_vencimento',
      'dueDateLabel', coalesce(
        to_char((v_item->>'data_vencimento')::date, 'DD/MM/YYYY'),
        'Não informada'
      ),
      'paidAt', v_item->>'data_pagamento',
      'paidAtLabel', coalesce(
        to_char((v_item->>'data_pagamento')::date, 'DD/MM/YYYY'),
        'Não informada'
      ),
      'paymentMethod', coalesce(
        nullif(btrim(v_item->>'forma_pagamento'), ''),
        nullif(btrim(v_item->>'origem_pagamento'), ''),
        'Não informada'
      ),
      'poloName', polo.nome,
      'poloLocation', coalesce(
        nullif(concat_ws(
          ' - ', nullif(polo.cidade, ''), nullif(polo.estado, '')
        ), ''),
        'Não informada'
      ),
      'declaration', concat(
        'Declaramos o recebimento de ',
        coalesce(nullif(btrim(v_item #>> '{parceiros,nome}'), ''), aluno.nome),
        ', referente a ',
        coalesce(nullif(btrim(v_item->>'descricao'), ''), 'pagamento acadêmico'),
        '.'
      ),
      'footerNote', 'Documento emitido automaticamente a partir da baixa financeira autorizada no Portal do Aluno.',
      'emittedAt', statement_timestamp(),
      'emittedAtLabel', to_char(
        statement_timestamp() AT TIME ZONE 'America/Maceio',
        'DD/MM/YYYY HH24:MI'
      )
    ),
    'institution', jsonb_build_object(
      'id', polo.id,
      'name', polo.nome,
      'cnpj', polo.cnpj,
      'address', polo.endereco,
      'number', polo.numero,
      'complement', polo.complemento,
      'neighborhood', polo.bairro,
      'city', polo.cidade,
      'state', polo.estado,
      'postalCode', polo.cep,
      'phone', polo.telefone,
      'email', polo.email,
      'isHeadquarters', coalesce(polo.is_matriz, false),
      'unitName', polo.nome,
      'logoUrl', nullif(btrim(coalesce(polo.logo_url, '')), '')
    ),
    'watermark', jsonb_build_object(
      'enabled', true,
      'label', coalesce(nullif(btrim(polo.nome), ''), 'UNIVERSO'),
      'imageUrl', nullif(btrim(coalesce(polo.watermark_url, '')), ''),
      'opacity', least(1, greatest(0, coalesce(polo.watermark_opacity, 0.1))),
      'scale', least(100, greatest(18, coalesce(polo.watermark_scale, 50))),
      'rotate', coalesce(polo.watermark_rotate, true),
      'source', CASE
        WHEN nullif(btrim(coalesce(polo.watermark_url, '')), '') IS NULL
          THEN 'FALLBACK_MODELO_RECIBO'
        ELSE 'CONFIGURACAO_POLO'
      END
    )
  )
  INTO v_result
  FROM public.parceiros AS aluno
  INNER JOIN public.polos AS polo ON polo.id = v_polo_id
  WHERE aluno.id = p_aluno_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Cabeçalho institucional do recibo indisponível.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(
  uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.portal_aluno_financeiro_preparar_recibo(uuid, uuid)
IS 'Entrega snapshot autorizado de conteúdo, modelo, cabeçalho e marca d água do recibo vetorial do Aluno.';

NOTIFY pgrst, 'reload schema';

COMMIT;
