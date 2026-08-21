import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const mapperUrl = new URL(
  "../../modules/gestor/parceiros/utils/parceiro-mappers.ts",
  import.meta.url,
);

const mapper = await Deno.readTextFile(mapperUrl);

Deno.test("mapper preserva os polos legados aceitos pelo cadastro de aluno", () => {
  assert.match(mapper, /normalizedPoloId === MATRIZ_POLO_ID/);
  assert.match(mapper, /normalizedPoloId === ESTANCIA_LEGACY_POLO_ID/);
  assert.match(mapper, /UUID_RE\.test\(normalizedPoloId\)/);
});
