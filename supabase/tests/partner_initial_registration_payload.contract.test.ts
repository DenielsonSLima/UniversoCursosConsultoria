import assert from "node:assert/strict";

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test(name: string, testFunction: () => void | Promise<void>): void;
};

const sourceUrl = new URL(
  "../../modules/gestor/parceiros/hooks/useParceirosMutations.ts",
  import.meta.url,
);

const source = await Deno.readTextFile(sourceUrl);
const mutationStart = source.indexOf("const saveAlunoMutation");
const mutationEnd = source.indexOf("onSuccess:", mutationStart);
const mutation = source.slice(mutationStart, mutationEnd);

Deno.test("cadastro inicial não envia campos protegidos de acesso", () => {
  assert.match(mutation, /delete alunoData\[field\]/);
  for (const field of [
    "trocaSenhaObrigatoria",
    "authUserId",
    "authLoginEmail",
    "matriculaAcesso",
    "acessoStatus",
    "aceitouTermosUso",
  ]) {
    assert.match(mutation, new RegExp(`'${field}'`));
  }
  assert.doesNotMatch(mutation, /trocaSenhaObrigatoria\s*:\s*true/);
});
