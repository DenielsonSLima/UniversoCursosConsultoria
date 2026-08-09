import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  '../migrations/20260809202500_remove_redundant_pasta_identificacao_footer.sql',
  import.meta.url,
);
const source = await Deno.readTextFile(migrationUrl);

Deno.test('migration remove somente o rodapé institucional redundante da Pasta', () => {
  assert.match(source, /where template\.id = 'pasta_identificacao_aluno'/);
  assert.match(source, /v_field ->> 'id' = 'pasta_rodape'/);
  assert.match(source, /continue;/);
  assert.match(source, /greatest\(v_version, 14\)/);
  assert.match(source, /v_y = 930 and v_height = 100/);
  assert.match(source, /v_y >= 1000[\s\S]*v_y < 1123/);
  assert.match(source, /if v_known_geometry is not true/);
  for (const token of [
    '{{POLO_NOME}}',
    '{{POLO_CNPJ}}',
    '{{POLO_ENDERECO_COMPLETO}}',
    '{{POLO_TELEFONE}}',
    '{{POLO_EMAIL}}',
  ]) {
    assert.ok(source.includes(token), `assinatura sem ${token}`);
  }
  assert.match(
    source,
    /não corresponde ao rodapé institucional redundante conhecido/,
  );
  assert.match(source, /estrutura inválida/);
  assert.doesNotMatch(source, /update\s+public\.documentos_validacao/i);
  assert.match(source, /commit;\s*$/i);
});
