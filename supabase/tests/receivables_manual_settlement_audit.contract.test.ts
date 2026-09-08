import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sql = readFileSync(new URL(
  '../migrations/20260908023000_expose_receivable_manual_settlement_audit.sql', import.meta.url,
), 'utf8');

test('auditoria usa somente conclusão e ator da baixa vinculada e não estornada', () => {
  assert.match(sql, /settlement\.id = receivable\.manual_settlement_id/);
  assert.match(sql, /settlement\.receivable_id = receivable\.id/);
  assert.match(sql, /settlement\.polo_id IS NOT DISTINCT FROM receivable\.polo_id/);
  assert.match(sql, /settlement\.state = 'COMPLETED'/);
  assert.match(sql, /settlement\.reversed_at IS NULL/);
  assert.match(sql, /receivable\.manual_settlement_reversed_at IS NULL/);
  assert.match(sql, /actor\.id = settlement\.actor_id/);
  assert.match(sql, /'manual_settlement_completed_at', settlement\.completed_at/);
  assert.doesNotMatch(sql, /updated_at|created_at|data_pagamento|auth\.uid\(\).*actor/);
});

test('autoriza antes da leitura e preserva página, ordem e agregados existentes', () => {
  assert.ok(sql.indexOf('PERFORM public.assert_receivables_filter_scope') < sql.indexOf('v_page := public.get_receivables_modality_page_v3_secure'));
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /ORDER BY entry\.ordinality/);
  assert.match(sql, /jsonb_set\(v_page, '\{rows\}', v_rows\)/);
  assert.match(sql, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /TO authenticated, service_role/);
  assert.doesNotMatch(sql, /UPDATE public|INSERT INTO public|DELETE FROM public/);
});
