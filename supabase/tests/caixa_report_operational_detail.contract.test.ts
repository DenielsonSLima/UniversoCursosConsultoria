import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260811123904_align_caixa_operational_pdf_detail.sql',
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

const functionDefinition = (name: string) => sql.match(
  new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$function\\$;`, 'i'),
)?.[0] ?? '';

const recebimentos = functionDefinition('get_caixa_relatorio_recebimentos_core');
const despesas = functionDefinition('get_caixa_relatorio_despesas_core');

Deno.test('detalhamento operacional do Caixa exclui crédito de empréstimo', () => {
  assert.match(recebimentos, /returns table\s*\(\s*id uuid,[\s\S]*valor_recebido numeric\s*\)/i);
  assert.match(
    recebimentos,
    /not exists \([\s\S]*from public\.emprestimos_financeiros emprestimo[\s\S]*emprestimo\.conta_receber_id = cr\.id/i,
  );
  assert.match(recebimentos, /security definer[\s\S]*set search_path to ''/i);
});

Deno.test('detalhamento operacional do Caixa exclui parcela de empréstimo', () => {
  assert.match(despesas, /returns table\s*\(\s*id uuid,[\s\S]*valor_pago numeric\s*\)/i);
  assert.match(despesas, /cp\.despesa_lancamento_id is null[\s\S]*cp\.emprestimo_parcela_id is null/i);
  assert.match(despesas, /security definer[\s\S]*set search_path to ''/i);
});

Deno.test('núcleos detalhados continuam inacessíveis ao cliente', () => {
  for (const name of [
    'get_caixa_relatorio_recebimentos_core',
    'get_caixa_relatorio_despesas_core',
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}\\(uuid, date, date\\)[\\s\\S]*from public, anon, authenticated`, 'i'),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\(uuid, date, date\\)[\\s\\S]*to service_role`, 'i'),
    );
    assert.doesNotMatch(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\(uuid, date, date\\)[\\s\\S]*to (?:anon|authenticated|public)`, 'i'),
    );
  }
});
