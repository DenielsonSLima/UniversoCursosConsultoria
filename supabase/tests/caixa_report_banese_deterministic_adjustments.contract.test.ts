import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260827035500_deterministic_banese_settlement_composition.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionDefinition = (name: string) => sql.match(
  new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$[a-z]*\\$;`, 'i'),
)?.[0] ?? '';

const resolver = functionDefinition('resolve_receivable_financial_composition');
const recebimentos = functionDefinition('get_caixa_relatorio_recebimentos_core');

Deno.test('função resolve_receivable_financial_composition possui assinatura e segurança canônica', () => {
  assert.ok(resolver.length > 0, 'Função resolve_receivable_financial_composition deve estar definida na migração.');
  assert.match(resolver, /security definer[\s\S]*set search_path to ''/i);
  assert.match(resolver, /returns table\s*\(\s*valor_base numeric,[\s\S]*valor_recebido numeric\s*\)/i);
  assert.match(resolver, /'CONCILIADO_POR_FORMULA_BANESE'/i);
  assert.match(resolver, /'NAO_DISCRIMINADA_PELO_GATEWAY'/i);
  assert.match(resolver, /'COMPOSICAO_EXPLICITA'/i);
  assert.match(resolver, /'SEM_DIFERENCA_FINANCEIRA'/i);
});

Deno.test('get_caixa_relatorio_recebimentos_core conecta o resolver via cross join lateral', () => {
  assert.ok(recebimentos.length > 0, 'Função get_caixa_relatorio_recebimentos_core deve estar definida na migração.');
  assert.match(recebimentos, /cross join lateral public\.resolve_receivable_financial_composition\(/i);
  assert.match(recebimentos, /cr\.gateway_financial_terms/i);
  assert.match(recebimentos, /security definer[\s\S]*set search_path to ''/i);
});

Deno.test('permissões de segurança garantem execução exclusiva pelo service_role', () => {
  for (const name of [
    'resolve_receivable_financial_composition',
    'get_caixa_relatorio_recebimentos_core',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}[\\s\\S]*from public, anon, authenticated`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to service_role`, 'i'),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant execute on function public\\.${name}[\\s\\S]*to (?:anon|authenticated|public)`, 'i'),
    );
  }
});
