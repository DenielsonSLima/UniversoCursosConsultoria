-- Snapshot autorizado do recibo de honorários. Em Modelos Documentos, o
-- recibo possui somente o modelo padrão (sem geometria salva). Esta RPC
-- congela essa revisão e preserva o cabeçalho e a marca d'água do polo.

CREATE OR REPLACE FUNCTION public.portal_professor_financeiro_preparar_recibo(
  p_professor_id uuid,
  p_polo_id uuid,
  p_lancamento_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_current_professor_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para emitir o recibo de honorários.'
      USING ERRCODE = '42501';
  END IF;

  v_current_professor_id := public.current_professor_id();
  IF v_current_professor_id IS NULL
     OR p_professor_id IS NULL
     OR v_current_professor_id <> p_professor_id THEN
    RAISE EXCEPTION 'O perfil informado não pertence ao professor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_polo_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.parceiros AS professor
    WHERE professor.id = v_current_professor_id
      AND (
        professor.polo_id = p_polo_id
        OR p_polo_id = ANY(coalesce(professor.polo_ids, ARRAY[]::uuid[]))
      )
  ) THEN
    RAISE EXCEPTION 'O polo informado não pertence ao escopo do professor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'model', jsonb_build_object(
      'key', 'recibo',
      'source', 'MODELO_RECIBO_PADRAO',
      'revision', 1,
      'orientation', 'portrait',
      'documentKind', 'RECIBO_HONORARIOS_PROFESSOR'
    ),
    'receipt', jsonb_build_object(
      'id', conta.id,
      'receiptNumber', upper(left(conta.id::text, 8)),
      'title', 'Recibo de honorários',
      'statusCode', 'PAGO',
      'statusLabel', 'Pago',
      'description', coalesce(
        nullif(btrim(conta.descricao), ''),
        'Honorários docentes'
      ),
      'categoryCode', coalesce(
        nullif(upper(btrim(conta.categoria)), ''),
        'NAO_INFORMADA'
      ),
      'category', CASE upper(btrim(coalesce(conta.categoria, '')))
        WHEN 'DESPESA_VARIAVEL' THEN 'Despesa variável'
        WHEN 'DESPESA_ADMINISTRATIVA' THEN 'Despesa administrativa'
        WHEN 'OUTRAS_DESPESAS' THEN 'Outras despesas'
        WHEN 'ADIANTAMENTO_CEDIDO' THEN 'Adiantamento cedido'
        WHEN 'EMPRESTIMO' THEN 'Empréstimo'
        ELSE 'Honorários'
      END,
      'beneficiaryName', professor.nome,
      'valueExpected', greatest(coalesce(conta.valor, 0), 0),
      'valuePaid', greatest(coalesce(conta.valor_pago, 0), 0),
      'valueOutstanding', 0,
      'dueDate', conta.data_vencimento,
      'dueDateLabel', coalesce(
        to_char(conta.data_vencimento, 'DD/MM/YYYY'),
        'Não informada'
      ),
      'paidAt', conta.data_pagamento,
      'paidAtLabel', coalesce(
        to_char(conta.data_pagamento, 'DD/MM/YYYY'),
        'Não informada'
      ),
      'paymentMethod', coalesce(
        nullif(btrim(conta.forma_pagamento), ''),
        'Não informada'
      ),
      'poloName', polo.nome,
      'poloLocation', coalesce(
        nullif(concat_ws(' - ', nullif(polo.cidade, ''), nullif(polo.estado, '')), ''),
        'Não informada'
      ),
      'declaration', concat(
        'Declaramos que o pagamento de honorários registrado neste recibo foi efetuado a ',
        coalesce(nullif(btrim(professor.nome), ''), 'professor não informado'),
        ', referente a ',
        coalesce(nullif(btrim(conta.descricao), ''), 'honorários docentes'),
        '.'
      ),
      'footerNote', 'Documento emitido automaticamente a partir da baixa financeira autorizada no Portal do Professor.',
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
  FROM public.contas_pagar AS conta
  INNER JOIN public.parceiros AS professor
    ON professor.id = conta.fornecedor_id
  INNER JOIN public.polos AS polo
    ON polo.id = conta.polo_id
  WHERE conta.id = p_lancamento_id
    AND conta.fornecedor_id = v_current_professor_id
    AND conta.polo_id = p_polo_id
    AND upper(btrim(coalesce(conta.status, ''))) = 'PAGO';

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Recibo indisponível ou fora do escopo do professor autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.portal_professor_financeiro_preparar_recibo(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_professor_financeiro_preparar_recibo(
  uuid, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.portal_professor_financeiro_preparar_recibo(
  uuid, uuid, uuid
) IS 'Entrega o snapshot autorizado do modelo, conteúdo, cabeçalho e marca d água do recibo vetorial de honorários.';

NOTIFY pgrst, 'reload schema';
