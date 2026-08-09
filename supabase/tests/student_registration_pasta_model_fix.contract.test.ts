import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809170000_fix_pasta_identificacao_unassigned_model.sql",
  import.meta.url,
);

Deno.test("Pasta não acessa o record de modelo exclusivo da Ficha", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /v_template_name text/,
  );
  assert.match(
    source,
    /v_template_name := v_model\.nome/,
  );
  assert.match(
    source,
    /v_template_name := ''Pasta de Identificação Geral''/,
  );
  assert.match(
    source,
    /''documentTemplateName'', v_template_name/,
  );
  assert.match(
    source,
    /v_snapshot_needle[\s\S]*?then v_model\.nome[\s\S]*?v_snapshot_replacement/,
  );
  assert.match(
    source,
    /position\(v_snapshot_needle in v_definition\) > 0[\s\S]*?raise exception 'A definição corrigida/,
  );
});

Deno.test("hotfix preserva roteamento privado e privilégios mínimos", async () => {
  const source = await Deno.readTextFile(migrationUrl);

  assert.match(
    source,
    /emitir_documento_validacao_portal_base/,
  );
  assert.match(
    source,
    /revoke all on function public\.emitir_ficha_validacao_portal\([\s\S]*?from public, anon;/i,
  );
  assert.match(
    source,
    /grant execute on function public\.emitir_ficha_validacao_portal\([\s\S]*?to authenticated, service_role;/i,
  );
  assert.match(source, /commit;\s*$/i);
});
