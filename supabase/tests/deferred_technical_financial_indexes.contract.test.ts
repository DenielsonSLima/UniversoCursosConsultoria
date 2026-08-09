import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809061000_index_deferred_technical_financial_activation.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test("FKs do financeiro técnico têm índices de cobertura", () => {
  assert.match(
    sql,
    /matriculas_tecnicas_financeiro_matricula_scope_idx[\s\S]*matricula_id,[\s\S]*turma_id,[\s\S]*aluno_id/i,
  );
  assert.match(
    sql,
    /matriculas_tecnicas_financeiro_titulo_idx[\s\S]*titulo_matricula_id[\s\S]*where titulo_matricula_id is not null/i,
  );
});
