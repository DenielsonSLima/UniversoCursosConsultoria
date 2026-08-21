import assert from "node:assert/strict";
import test from "node:test";

import {
  ElectronicSignatureRpcError,
  toElectronicSignatureRpcError,
} from "./assinatura-eletronica.rpc-error.ts";

test("converte PostgrestError simples em Error com mensagem e SQLSTATE seguros", () => {
  const failure = toElectronicSignatureRpcError({
    code: "22023",
    message: "  O template global\n do carimbo v5 e invalido.  ",
    details: "contexto SQL interno que nao deve aparecer",
    hint: "nome de tabela interna",
  });

  assert.ok(failure instanceof Error);
  assert.ok(failure instanceof ElectronicSignatureRpcError);
  assert.equal(failure.code, "22023");
  assert.equal(
    failure.message,
    "O template global do carimbo v5 e invalido. [22023]",
  );
  assert.doesNotMatch(failure.message, /contexto SQL|tabela interna/u);
});

test("preserva codigo de concorrencia usado pelo fluxo de salvamento", () => {
  const failure = toElectronicSignatureRpcError({
    code: "40001",
    message: "Conflito de atualização.",
  });

  assert.equal(failure.code, "40001");
  assert.equal(failure.message, "Conflito de atualização. [40001]");
});

test("limita mensagem e substitui codigo arbitrario por fallback", () => {
  const failure = toElectronicSignatureRpcError({
    code: "<script>alert(1)</script>",
    message: `Falha ${"x".repeat(400)}`,
  });

  assert.equal(failure.code, "RPC_ERROR");
  assert.ok(failure.message.endsWith("[RPC_ERROR]"));
  assert.ok(failure.message.length <= 252);
  assert.doesNotMatch(failure.message, /script|alert/u);
});

test("usa mensagem neutra quando PostgREST nao entrega corpo valido", () => {
  const failure = toElectronicSignatureRpcError(null);

  assert.equal(failure.code, "RPC_ERROR");
  assert.equal(
    failure.message,
    "O serviço recusou a operação solicitada. [RPC_ERROR]",
  );
});
