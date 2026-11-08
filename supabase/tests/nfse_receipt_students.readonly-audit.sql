-- Read-only pre-deployment audit. Returns aggregate facts only, never identities.
-- Change only the month literal to audit another payment month.
WITH settings AS MATERIALIZED (
  SELECT DATE '2026-11-01' AS month, pg_catalog.clock_timestamp() AS started_at
), claims AS MATERIALIZED (
  SELECT grant_row.usuario_id AS context_id,
    pg_catalog.set_config('request.jwt.claim.sub', grant_row.auth_user_id::text, true) AS auth_claim,
    pg_catalog.set_config('request.jwt.claims', pg_catalog.jsonb_build_object(
      'sub', grant_row.auth_user_id, 'role', 'authenticated')::text, true) AS jwt_claims
  FROM private.nfse_access_grants grant_row
  WHERE (SELECT pg_catalog.count(*) FROM private.nfse_access_grants) = 1
), authorized AS MATERIALIZED (
  SELECT public.get_nfse_access_secure(claims.context_id) AS allowed,
    public.portal_identidade_gestor_escopo_atual() AS scope
  FROM claims WHERE claims.auth_claim IS NOT NULL AND claims.jwt_claims IS NOT NULL
), polo_scope AS MATERIALIZED (
  SELECT polo.id
  FROM public.polos polo CROSS JOIN authorized
  WHERE authorized.allowed AND public.is_active_status(polo.status)
    AND (authorized.scope->'allPolos' = 'true'::jsonb
      OR authorized.scope->'poloIds' @> pg_catalog.jsonb_build_array(polo.id))
  ORDER BY polo.is_matriz DESC, polo.id LIMIT 1
), canonical AS MATERIALIZED (
  SELECT receipt.id, receipt.valor_recebido
  FROM polo_scope polo CROSS JOIN settings
  CROSS JOIN LATERAL public.get_caixa_relatorio_recebimentos_core(
    polo.id, settings.month, (settings.month + INTERVAL '1 month')::date) receipt
), cash_identity AS MATERIALIZED (
  SELECT receipt.id, receipt.matricula_id, receipt.turma_id, receipt.polo_id
  FROM internal_financial_payments.cash_receivables() receipt CROSS JOIN settings
  WHERE receipt.polo_id IN (SELECT id FROM polo_scope) AND receipt.status = 'PAGO'
    AND receipt.data_pagamento >= settings.month
    AND receipt.data_pagamento < (settings.month + INTERVAL '1 month')::date
), students AS MATERIALIZED (
  SELECT canonical.id, canonical.valor_recebido, class.id AS class_id,
    student.id AS student_id, course.modalidade
  FROM canonical JOIN cash_identity identity ON identity.id = canonical.id
  JOIN public.matriculas enrollment ON enrollment.id = identity.matricula_id
  JOIN public.parceiros student ON student.id = enrollment.aluno_id
  JOIN public.turmas class ON class.id = coalesce(identity.turma_id, enrollment.turma_id)
    AND class.polo_id = identity.polo_id
  JOIN public.cursos course ON course.id = class.curso_id
  WHERE pg_catalog.upper(pg_catalog.btrim(student.tipo)) = 'ALUNO'
    AND canonical.valor_recebido > 0
    AND canonical.valor_recebido::text NOT IN ('NaN', 'Infinity', '-Infinity')
)
SELECT pg_catalog.jsonb_build_object(
  'paymentMonth', (SELECT pg_catalog.to_char(month, 'YYYY-MM') FROM settings),
  'pilotAuthorized', EXISTS(SELECT 1 FROM authorized WHERE allowed),
  'activePoloResolved', EXISTS(SELECT 1 FROM polo_scope),
  'canonicalReceiptCount', (SELECT pg_catalog.count(*) FROM canonical),
  'knownPositiveReceiptCount', (SELECT pg_catalog.count(*) FROM canonical
    WHERE valor_recebido > 0 AND valor_recebido::text NOT IN ('NaN', 'Infinity', '-Infinity')),
  'excludedUnknownCount', (SELECT pg_catalog.count(*) FROM canonical
    WHERE valor_recebido IS NULL OR valor_recebido::text IN ('NaN', 'Infinity', '-Infinity')),
  'eligibleReceiptCount', (SELECT pg_catalog.count(*) FROM students),
  'eligibleStudentCount', (SELECT pg_catalog.count(DISTINCT(class_id, student_id)) FROM students),
  'eligibleReceivedAmount', (SELECT coalesce(pg_catalog.sum(valor_recebido), 0)::numeric(30,2)::text FROM students),
  'technicalStudentCount', (SELECT pg_catalog.count(DISTINCT(class_id, student_id)) FROM students WHERE modalidade = 'TECNICO'),
  'technicalReceivedAmount', (SELECT coalesce(pg_catalog.sum(valor_recebido), 0)::numeric(30,2)::text FROM students WHERE modalidade = 'TECNICO'),
  'elapsedMs', (SELECT pg_catalog.round((EXTRACT(epoch FROM (pg_catalog.clock_timestamp() - started_at)) * 1000)::numeric, 2) FROM settings)
) AS audit;

