import assert from "node:assert/strict";
import { readRequestBody, safeEqual } from "./request-guards.ts";

const requestWithBody = (body?: string) =>
  new Request("https://worker.test/banese-reconciliation-worker", {
    method: "POST",
    body,
  });

Deno.test("safeEqual aceita igualdade e rejeita conteúdo ou tamanho diferente", () => {
  assert.equal(safeEqual("segredo-interno-123", "segredo-interno-123"), true);
  assert.equal(safeEqual("segredo-interno-123", "segredo-interno-124"), false);
  assert.equal(safeEqual("segredo-interno-123", "segredo-curto"), false);
  assert.equal(safeEqual("", ""), true);
  assert.equal(safeEqual("á-token", "a-token"), false);
});

Deno.test("readRequestBody aceita corpo vazio e JSON válido até 1.024 bytes", async () => {
  await assert.doesNotReject(() => readRequestBody(requestWithBody()));
  await assert.doesNotReject(() => readRequestBody(requestWithBody("{}")));

  const boundaryJson = JSON.stringify("x".repeat(1_022));
  assert.equal(boundaryJson.length, 1_024);
  await assert.doesNotReject(() =>
    readRequestBody(requestWithBody(boundaryJson))
  );
});

Deno.test("readRequestBody rejeita JSON inválido e corpo acima de 1.024 bytes", async () => {
  await assert.rejects(
    () => readRequestBody(requestWithBody("{")),
    SyntaxError,
  );

  const oversizedJson = JSON.stringify("x".repeat(1_023));
  assert.equal(oversizedJson.length, 1_025);
  await assert.rejects(
    () => readRequestBody(requestWithBody(oversizedJson)),
    /Corpo da requisição inválido\./,
  );
});
