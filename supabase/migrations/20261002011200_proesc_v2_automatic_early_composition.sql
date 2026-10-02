BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='15s';

-- User-authorized automatic report calculation from 01/10, for the three
-- reviewed class/source contracts. Not a settlement or proof of applied API fees.
CREATE TABLE internal_proesc.v2_automatic_composition_policies (
  turma_id uuid PRIMARY KEY REFERENCES public.turmas(id),
  source_unit_id text NOT NULL CHECK(source_unit_id='3145'),
  source_class_id text NOT NULL,
  class_code text NOT NULL UNIQUE,
  payment_from date NOT NULL CHECK(payment_from='2026-10-01'),
  rule_revision integer NOT NULL CHECK(rule_revision=1),
  rule_fingerprint text NOT NULL CHECK(rule_fingerprint ~ '^[0-9a-f]{64}$'),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_unit_id,source_class_id)
);
ALTER TABLE internal_proesc.v2_automatic_composition_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON internal_proesc.v2_automatic_composition_policies FROM PUBLIC,anon,authenticated,service_role;

DO $policies$
DECLARE v_count integer;
BEGIN
  INSERT INTO internal_proesc.v2_automatic_composition_policies(
    turma_id,source_unit_id,source_class_id,class_code,payment_from,rule_revision,rule_fingerprint)
  SELECT t.id,s.source_unit_id,s.source_class_id,t.codigo,'2026-10-01',
    t.regra_financeira_revisao,t.regra_financeira_fingerprint
  FROM public.turmas t JOIN internal_proesc.class_scopes s ON s.turma_id=t.id
  WHERE t.codigo IN ('ENF-T43-INT-MAT','ENF-T44-SEM-AQB','ENF-T45-SEM-PDF')
    AND s.class_code=t.codigo AND s.polo_id=t.polo_id AND s.phase='CONFIRMED'
    AND s.source_unit_id='3145' AND t.origem_financeira='LEGADO' AND t.financeiro_herdado
    AND t.regra_financeira_revisao=1 AND t.regra_financeira_fingerprint ~ '^[0-9a-f]{64}$'
    AND t.valor_parcela=279.90 AND t.desconto_pontualidade=19.90
    AND t.aplicar_desconto_mensalidade AND t.aplicar_multa_juros_mensalidade
    AND t.juros_atraso=2 AND t.multa_atraso_percentual=2;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>3 THEN RAISE EXCEPTION 'Expected three reviewed Proesc class rule policies'; END IF;
END;
$policies$;

-- This checks rule authorization only. The caller must ALSO pass the complete
-- v2_calculated_composition_candidate identity/payment/configuration guard.
CREATE FUNCTION internal_proesc.v2_automatic_composition_allowed(p_receivable_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $allowed$
DECLARE v_scope record; v_rule jsonb;
BEGIN
  SELECT c.matricula_id,p.rule_revision,p.rule_fingerprint INTO v_scope
  FROM public.contas_receber c
  JOIN public.turmas t ON t.id=c.turma_id
  JOIN internal_proesc.obligation_links l ON l.receivable_id=c.id
  JOIN internal_proesc.v2_automatic_composition_policies p ON p.turma_id=t.id
  JOIN public.matriculas_tecnicas_financeiro_config cfg ON cfg.matricula_id=c.matricula_id
  WHERE c.id=p_receivable_id AND c.data_pagamento>=p.payment_from
    AND c.data_pagamento<=(now() AT TIME ZONE 'America/Maceio')::date
    AND c.data_pagamento<=c.data_vencimento AND c.valor=279.90 AND c.valor_pago=260
    AND c.status='PAGO' AND c.tipo_lancamento='PARCELA' AND c.origem_pagamento='SISTEMA_ANTERIOR'
    AND l.source_unit_id=p.source_unit_id AND l.source_class_id=p.source_class_id
    AND t.codigo=p.class_code AND t.origem_financeira='LEGADO' AND t.financeiro_herdado
    AND t.regra_financeira_revisao=p.rule_revision AND t.regra_financeira_fingerprint=p.rule_fingerprint
    AND t.valor_parcela=279.90 AND t.desconto_pontualidade=19.90
    AND t.aplicar_desconto_mensalidade AND t.aplicar_multa_juros_mensalidade
    AND t.juros_atraso=2 AND t.multa_atraso_percentual=2 AND cfg.override_ativo IS FALSE;
  IF NOT FOUND THEN RETURN false; END IF;
  v_rule:=internal_academic.technical_financial_effective_rule(v_scope.matricula_id);
  RETURN coalesce(v_rule->>'origem'='TURMA'
    AND v_rule#>>'{identidade,turmaFingerprint}'=v_scope.rule_fingerprint
    AND v_rule#>>'{identidade,turmaRevisao}'=v_scope.rule_revision::text
    AND v_rule#>>'{cobranca,mensalidade,valor}'='279.90'
    AND v_rule#>'{cobranca,mensalidade,habilitada}'='true'::jsonb
    AND v_rule#>>'{encargos,descontoPontualidade}'='19.90'
    AND v_rule#>'{aplicacao,mensalidade,desconto}'='true'::jsonb,false);
EXCEPTION WHEN invalid_parameter_value THEN
  -- Incomplete individual configuration cannot make the entire report fail.
  RETURN false;
END;
$allowed$;
REVOKE ALL ON FUNCTION internal_proesc.v2_automatic_composition_allowed(uuid)
  FROM PUBLIC,anon,authenticated,service_role;

-- Keep the five explicit approvals and every historical/manual/gateway branch.
-- Only the authorization disjunction changes; all complete-candidate guards and
-- the exact calculated closure remain mandatory. No new approval per payment.
DO $patch$
DECLARE
  v_oid oid:=to_regprocedure('public.resolve_integrated_receivable_financial_composition(uuid,numeric,numeric,date,date,jsonb,uuid,timestamptz,bigint,bigint,bigint,bigint,bigint,bigint)');
  v_ddl text; v_metadata jsonb;
  v_from text:=$old$    if found and exists (
      select 1 from internal_proesc.v2_composition_approvals approval
      where approval.link_id=v_snapshot.link_id and approval.snapshot_id=v_snapshot.id
    ) and internal_proesc.v2_calculated_composition_candidate(p_receivable_id,v_snapshot.id) then$old$;
  v_to text:=$new$    if found and (exists (
      select 1 from internal_proesc.v2_composition_approvals approval
      where approval.link_id=v_snapshot.link_id and approval.snapshot_id=v_snapshot.id
    ) or internal_proesc.v2_automatic_composition_allowed(p_receivable_id))
      and internal_proesc.v2_calculated_composition_candidate(p_receivable_id,v_snapshot.id) then$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid),to_jsonb(p)-'prosrc' INTO v_ddl,v_metadata FROM pg_proc p WHERE p.oid=v_oid;
  IF v_oid IS NULL OR md5(v_ddl) IS DISTINCT FROM '6388ad8295fa5c3eedc20d964da688b6'
    OR (length(v_ddl)-length(replace(v_ddl,v_from,'')))/length(v_from)<>1 THEN
    RAISE EXCEPTION 'Composition resolver drift; rebase automatic rule authorization';
  END IF;
  EXECUTE replace(v_ddl,v_from,v_to);
  IF (SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE p.oid=v_oid) IS DISTINCT FROM v_metadata
    OR pg_get_functiondef(v_oid) IS DISTINCT FROM replace(v_ddl,v_from,v_to) THEN
    RAISE EXCEPTION 'Automatic composition patch changed unreviewed resolver metadata/body';
  END IF;
END;
$patch$;
COMMIT;
