import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260809200000_fix_pasta_identificacao_footer_geometry.sql',
  import.meta.url,
);

Deno.test('migration corrige somente o rodapé legado do modelo atual da Pasta', async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(source, /where template\.id = 'pasta_identificacao_aluno'/);
  assert.match(source, /v_field ->> 'id' = 'pasta_rodape'/);
  assert.match(source, /v_y := case[\s\S]*?then \(v_field ->> 'y'\)::numeric/);
  assert.match(source, /v_y >= 1000/);
  assert.match(source, /'y', 930[\s\S]*?'height', 100/);
  assert.match(source, /greatest\([\s\S]*?13/);
  assert.match(source, /A geometria de pasta_rodape mudou; hotfix seguro não aplicado/);
  assert.match(source, /possui estrutura inválida/);
  assert.doesNotMatch(source, /update\s+public\.documentos_validacao/i);
  assert.match(source, /commit;\s*$/i);
});
