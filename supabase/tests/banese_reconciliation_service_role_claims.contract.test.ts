import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL(
    '../migrations/20260829194600_fix_banese_reconciliation_service_role_claims.sql',
    import.meta.url,
  ),
  'utf8',
);

test('persistência aceita service_role transportado em request.jwt.claims', () => {
  assert.match(
    migration,
    /persist_banese_reconciliation_snapshot\(uuid,text,text,timestamp with time zone/i,
  );
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\)/i);
  assert.match(migration, /current_setting\('request\.jwt\.claims', true\).*?::jsonb\s*->>\s*'role'/is);
  assert.match(migration, /<>\s*'service_role'/i);
});

test('a guarda continua fechada para usuários e preserva o fallback administrativo', () => {
  assert.match(
    migration,
    /session_user not in \('postgres', 'supabase_admin', 'service_role'\)/i,
  );
  assert.match(migration, /using errcode = '23514'/i);
  assert.match(migration, /pg_catalog\.pg_get_functiondef/i);
});
