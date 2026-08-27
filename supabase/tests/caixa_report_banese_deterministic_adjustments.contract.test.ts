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

const recurringMigrationUrl = new URL(
  '../migrations/20260827153000_caixa_report_recurring_deterministic_composition.sql',
  import.meta.url,
);
const recurringSql = await Deno.readTextFile(recurringMigrationUrl);

const functionDefinition = (source: string, name: string) => source.match(
  new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$[a-z]*\\$;`, 'i'),
)?.[0] ?? '';

const resolver = functionDefinition(sql, 'resolve_receivable_financial_composition');
const recebimentos = functionDefinition(sql, 'get_caixa_relatorio_recebimentos_core');
const carteiraRecorrente = functionDefinition(recurringSql, 'get_caixa_relatorio_carteira_recorrente_core');

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

Deno.test('get_caixa_relatorio_carteira_recorrente_core conecta o resolver via cross join lateral', () => {
  assert.ok(carteiraRecorrente.length > 0, 'Função get_caixa_relatorio_carteira_recorrente_core deve estar definida na migração.');
  assert.match(carteiraRecorrente, /cross join lateral public\.resolve_receivable_financial_composition\(/i);
  assert.match(carteiraRecorrente, /cr\.gateway_financial_terms/i);
  assert.match(carteiraRecorrente, /security definer[\s\S]*set search_path to ''/i);
  assert.match(carteiraRecorrente, /coalesce\(comp\.desconto, 0\)[\s\S]*?AS desconto/i);
  assert.match(carteiraRecorrente, /coalesce\(comp\.juros, 0\)[\s\S]*?AS juros/i);
  assert.match(carteiraRecorrente, /coalesce\(comp\.multa, 0\)[\s\S]*?AS multa/i);
  assert.match(carteiraRecorrente, /coalesce\(comp\.diferenca_nao_discriminada, 0\)[\s\S]*?AS diferenca_nao_discriminada/i);
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

  assert.match(
    recurringSql,
    /revoke all on function public\.get_caixa_relatorio_carteira_recorrente_core[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    recurringSql,
    /grant execute on function public\.get_caixa_relatorio_carteira_recorrente_core[\s\S]*to service_role/i,
  );
});
