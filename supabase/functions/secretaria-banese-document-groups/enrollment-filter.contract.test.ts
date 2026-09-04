import assert from "node:assert/strict";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("catálogo aceita somente UUID e filtra a matrícula antes da paginação", () => {
  assert.match(source, /"enrollmentId"/);
  assert.match(source, /enrollmentId: optionalUuid\(record, "enrollmentId"\)/);
  assert.match(
    source,
    /query = query\.eq\("matricula_id", input\.enrollmentId\)/,
  );
  assert.doesNotMatch(source, /ilike\("matricula_id"/);
});
