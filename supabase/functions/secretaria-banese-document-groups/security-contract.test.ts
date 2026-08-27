import assert from "node:assert/strict";

const readLocal = (relativePath: string) =>
  Deno.readTextFile(new URL(relativePath, import.meta.url));

Deno.test("catálogo Banese é estruturalmente read-only", async () => {
  const source = await readLocal("./index.ts");
  const forbiddenMutations = [
    /\.insert\s*\(/,
    /\.update\s*\(/,
    /\.upsert\s*\(/,
    /\.delete\s*\(/,
    /\.rpc\s*\(/,
    /\bfetch\s*\(/,
  ];
  for (const forbidden of forbiddenMutations) {
    assert.doesNotMatch(source, forbidden);
  }
  assert.doesNotMatch(source, /gateway_pix_(payload|encoded_image)/);
  assert.match(
    source,
    /const studentIds = unique\(enrollments\.map\(\(row\) => row\.aluno_id\)\)/,
  );
  assert.match(source, /\.from\("contas_receber"\)\s*\n\s*\.select\(/);
  assert.match(source, /requireFinanceDocumentReadAccess\(gestor\)/);
  assert.match(source, /requireGestorForPolo\(gestor, input\.poloId\)/);
});

Deno.test("renderizadores canônicos usam a guarda documental sem liberar escrita", async () => {
  const [boleto, carnet] = await Promise.all([
    readLocal("../banese-boleto-document/index.ts"),
    readLocal("../banese-carnet-document/index.ts"),
  ]);
  assert.match(
    boleto,
    /requireBaneseBoletoDocumentReadAccess\(gestor, row\.tipo_lancamento\)/,
  );
  assert.match(carnet, /requireFinanceDocumentReadAccess\(gestor\)/);
  assert.match(
    carnet,
    /\.in\("status", \[\.\.\.BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES\]\)/,
  );
  assert.match(carnet, /takeRegisteredBaneseCarnetCandidateRows/);
  assert.match(
    carnet,
    /\.range\(offset, offset \+ CANDIDATE_QUERY_PAGE_SIZE - 1\)/,
  );
  assert.doesNotMatch(carnet, /\.limit\(BANESE_CARNET_MAX_ITEMS \+ 1\)/);
  for (const source of [boleto, carnet]) {
    assert.doesNotMatch(source, /requireFinanceWriteAccess/);
    assert.match(source, /requireGestorForPolo/);
  }
});
