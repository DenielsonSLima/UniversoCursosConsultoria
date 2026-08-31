import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260831134100_expose_banese_boleto_discount_receivables.sql',
    import.meta.url,
  ),
  'utf8',
);

test('RPC separa desconto configurado do boleto da composição aplicada', () => {
  assert.match(migration, /boleto_desconto_configurado/i);
  assert.match(migration, /boleto_desconto_valido_ate/i);
  assert.match(migration, /boleto_desconto_situacao/i);
  assert.match(
    migration,
    /cr\.status\s*=\s*'PAGO'[\s\S]*?boleto\.nosso_numero\s+IS\s+NOT\s+NULL[\s\S]*?composition\.desconto\s*>\s*0/i,
  );
  assert.match(migration, /resolve_receivable_financial_composition/i);
  assert.doesNotMatch(
    migration,
    /gateway_financial_terms\s+AS\s+[a-z_]*financial_terms/i,
    'A RPC não deve devolver o snapshot financeiro bruto.',
  );
});

test('desconto exige boleto Banese confirmado, nosso número e identidade íntegra', () => {
  assert.match(migration, /gateway_provider[\s\S]*IN\s*\('banese',\s*'banese_card'\)/i);
  assert.match(migration, /gateway_payment_method[\s\S]*=\s*'BOLETO'/i);
  assert.match(migration, /gateway_boleto_nosso_numero[\s\S]*\^\[0-9\]\{9\}\$/i);
  assert.match(migration, /gateway_financial_terms_confirmed_at\s+IS\s+NOT\s+NULL/i);
  assert.match(
    migration,
    /BTRIM\(COALESCE\(cr\.gateway_last_error,\s*''\)\)[\s\S]*?NOT\s+LIKE\s+'BANESE_IDENTITY_QUARANTINED:%'/i,
  );
  assert.match(migration, /nominalAmount[\s\S]*=\s*ROUND\(cr\.valor,\s*2\)/i);
  assert.match(migration, /dueDate[\s\S]*cr\.data_vencimento/i);
});

test('valor percentual vira dinheiro no backend e a validade usa Maceió', () => {
  assert.match(
    migration,
    /WHEN\s+'percentage'\s+THEN\s+cr\.valor\s*\*[\s\S]*?\/\s*100/i,
  );
  assert.match(migration, /ROUND\([\s\S]*desconto_configurado/i);
  assert.match(migration, /timezone\('America\/Maceio',\s*CURRENT_TIMESTAMP\)/i);
  assert.match(
    migration,
    /validUntil'[\s\S]*?FROM\s+6\s+FOR\s+2[\s\S]*?BETWEEN\s+1\s+AND\s+12/i,
  );
  assert.match(migration, /WHEN\s+2\s+THEN\s+CASE[\s\S]*?MOD\([\s\S]*?400\)\s*=\s*0/i);
  assert.match(migration, /THEN\s+'VIGENTE'[\s\S]*ELSE\s+'EXPIRADO'/i);
});

test('RPC preserva escopo, search_path e ACL mínima', () => {
  assert.match(migration, /assert_receivables_filter_scope\(p_polo_id\)/i);
  assert.match(migration, /SET\s+search_path\s*=\s*''/i);
  assert.match(migration, /p_polo_id\s+IS\s+NULL\s+OR\s+cr\.polo_id\s*=\s*p_polo_id/i);
  assert.match(migration, /p_turma_id\s+IS\s+NULL\s+OR\s+cr\.turma_id\s*=\s*p_turma_id/i);
  assert.match(
    migration,
    /REVOKE\s+ALL[\s\S]*FROM\s+PUBLIC,\s*anon,\s*authenticated,\s*service_role/i,
  );
  assert.match(migration, /GRANT\s+EXECUTE[\s\S]*TO\s+authenticated,\s*service_role/i);
});
