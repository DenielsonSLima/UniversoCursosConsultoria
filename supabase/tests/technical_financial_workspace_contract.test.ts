import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const migrationUrl = new URL(
  "../migrations/20260809103000_fix_technical_financial_workspace_contract.sql",
  import.meta.url,
);
const sql = await Deno.readTextFile(migrationUrl);

Deno.test("regra renderizada mantém o contrato completo da turma e do aluno", () => {
  assert.match(
    sql,
    /create or replace function internal_academic\.render_technical_financial_rule\(/i,
  );
  for (
    const alias of [
      "primeiroVencimentoSugerido",
      "valorMatricula",
      "valorMensalidade",
      "valorRematricula",
      "mensalidadesPorCiclo",
      "diaVencimento",
    ]
  ) {
    assert.match(sql, new RegExp(`'${alias}'`, "i"));
  }
  assert.match(sql, /'cobranca'[\s\S]*'cronogramaCiclo'/i);
  assert.match(
    sql,
    /revoke all on function[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(sql, /notify pgrst, 'reload schema'/i);
});
