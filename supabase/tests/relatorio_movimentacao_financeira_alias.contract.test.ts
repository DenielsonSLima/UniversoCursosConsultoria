import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260812010814_fix_financial_report_account_active_alias.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test('correção do relatório troca somente o alias ativo da conta', () => {
  assert.match(sql, /pg_get_functiondef\([\s\S]*get_relatorio_movimentacao_financeira_secure/i);
  assert.match(sql, /v_original constant text := 'cb\.ativo,'/i);
  assert.match(sql, /v_corrected constant text := 'cb\.ativo AS ativa,'/i);
  assert.match(sql, /execute replace\(v_definition, v_original, v_corrected\)/i);
  assert.match(sql, /revoke all on function public\.get_relatorio_movimentacao_financeira_secure[\s\S]*from public, anon/i);
  assert.match(sql, /grant execute on function public\.get_relatorio_movimentacao_financeira_secure[\s\S]*to authenticated, service_role/i);
});
