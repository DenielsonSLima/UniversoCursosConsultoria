import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migration = readFileSync(resolve(
  process.cwd(),
  'supabase/migrations/20260904010000_broadcast_manual_technical_banese_progress.sql',
), 'utf8');

test('o Broadcast acompanha cada título técnico confirmado no Banese', () => {
  assert.match(migration, /where config\.matricula_id = v_matricula_id/);
  assert.match(migration, /gateway_submission_status/);
  assert.match(migration, /new\.gateway_submission_status in \('API_REGISTERED', 'API_REVIEW'\)/);
  assert.match(migration, /old\.gateway_submission_status is distinct from new\.gateway_submission_status/);
  assert.match(migration, /send_technical_financial_changed\(\s*'title-changed'/);
  assert.doesNotMatch(migration, /gateway_boleto_issued_at\s+is\s+not\s+null/i);
});
