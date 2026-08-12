import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260812010257_harden_legacy_financial_loan_rpc_search_path.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test('RPCs legadas de empréstimo mantêm search_path vazio e service_role exclusivo', () => {
  for (const name of [
    'criar_emprestimo_financeiro_polo_secure',
    'baixar_emprestimo_parcela_polo_secure',
  ]) {
    const start = sql.indexOf(`ALTER FUNCTION public.${name}(`);
    const end = sql.indexOf(';', start);
    assert.ok(start >= 0 && end > start, `ALTER FUNCTION ausente para ${name}`);
    assert.match(sql.slice(start, end), /set search_path to ''/i);
    assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated`, 'i'));
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role`, 'i'));
  }
});
