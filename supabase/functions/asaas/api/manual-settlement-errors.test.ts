import assert from "node:assert/strict";
import { manualSettlementErrorMessage } from "./manual-settlement-errors.ts";

Deno.test("erro PostgREST conserva motivo do bloqueio sem serializar payload", () => {
  const message =
    "Identidade ou status da cobrança mudou durante a baixa manual.";
  assert.equal(
    manualSettlementErrorMessage({
      code: "40001",
      message,
      details: { privateData: "não divulgar" },
      hint: null,
    }),
    message,
  );
});

Deno.test("erro nativo e mensagem textual continuam legíveis", () => {
  for (const error of [new Error("Banco indisponível"), "Banco indisponível"]) {
    assert.equal(manualSettlementErrorMessage(error), "Banco indisponível");
  }
});

Deno.test("objetos desconhecidos recebem mensagem segura sem object Object", () => {
  for (
    const error of [null, undefined, {}, { message: {} }, { message: " " }]
  ) {
    const message = manualSettlementErrorMessage(error);
    assert.match(message, /Consulte a revisão financeira/);
    assert.doesNotMatch(message, /\[object Object\]/);
  }
});
