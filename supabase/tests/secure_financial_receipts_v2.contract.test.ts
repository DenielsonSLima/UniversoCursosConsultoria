import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260831134000_add_secure_full_receiving_account_feed_v2.sql',
    import.meta.url,
  ),
  'utf8',
);

const rpcName = 'list_financial_receipts_v2_secure';
const signature = 'uuid, uuid, date, date, text, text, text, integer, integer';

test('v2 reutiliza o feed seguro e preserva todos os filtros', () => {
  assert.match(migration, /public\.list_financial_receipts_secure\(/);
  for (const argument of [
    'p_company_id',
    'p_polo_id',
    'p_payment_start',
    'p_payment_end',
    'p_search',
    'p_origin',
    'p_environment',
    'p_page',
    'p_page_size',
  ]) {
    assert.match(
      migration,
      new RegExp(`${argument}\\s*=>\\s*${argument}`),
      `Filtro não repassado: ${argument}`,
    );
  }
});

test('v2 mantém identidade, RBAC e escopo de polo antes do enriquecimento', () => {
  assert.match(migration, /auth\.uid\(\)\s+is\s+null/i);
  assert.match(migration, /public\.gestor_has_module\('financeiro'\)/i);
  assert.match(migration, /public\.gestor_has_financeiro_tab\('receber'\)/i);
  assert.match(migration, /public\.gestor_allowed_polo_ids\(\)/i);
  assert.match(migration, /p_polo_id\s*=\s*any\s*\(v_allowed_polo_ids\)/i);
  assert.match(
    migration,
    /receivable\.polo_id\s*=\s*any\s*\(v_allowed_polo_ids\)/i,
  );
  assert.match(
    migration,
    /jsonb_array_elements\([\s\S]*?join\s+public\.contas_receber\s+receivable[\s\S]*?payload_item\s*->>\s*'id'/i,
  );
});

test('v2 usa a conta efetiva, com precedência da baixa manual, e não mascara números', () => {
  assert.match(
    migration,
    /manual_settlement\.receivable_id\s*=\s*receivable\.id/i,
  );
  assert.match(
    migration,
    /receiving_account\.id\s*=\s*coalesce\s*\(\s*manual_settlement\.account_id\s*,\s*receivable\.conta_bancaria_id\s*\)/i,
  );
  assert.match(
    migration,
    /from\s+public\.contas_bancarias_polos\s+account_scope[\s\S]*?account_scope\.conta_bancaria_id\s*=\s*receiving_account\.id[\s\S]*?account_scope\.polo_id\s*=\s*receivable\.polo_id/i,
  );
  assert.match(migration, /'Ag\. '\s*\|\|\s*btrim\(authorized\.agencia\)/i);
  assert.match(migration, /'Conta '\s*\|\|\s*btrim\(authorized\.conta\)/i);
  assert.doesNotMatch(migration, /Ag\. \*\*\*|Conta \*\*\*\*/i);
  assert.match(
    migration,
    /payload_item\s*\|\|\s*jsonb_build_object\(\s*'conta_recebedora_nome'/i,
  );
  assert.match(migration, /jsonb_agg\(enriched\.payload_item\s+order\s+by\s+enriched\.position\)/i);
});

test('v2 fixa search_path e concede execução somente ao authenticated', () => {
  assert.match(migration, /security\s+definer/i);
  assert.match(migration, /set\s+search_path\s*=\s*''/i);
  assert.match(
    migration,
    new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+public\\.${rpcName}\\(\\s*${signature.replaceAll(', ', '\\s*,\\s*')}\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`,
      'i',
    ),
  );
  assert.match(
    migration,
    new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+public\\.${rpcName}\\(\\s*${signature.replaceAll(', ', '\\s*,\\s*')}\\s*\\)\\s+to\\s+authenticated`,
      'i',
    ),
  );
  assert.doesNotMatch(migration, /grant\s+execute[\s\S]*?to\s+(?:public|anon|service_role)\b/i);
});
