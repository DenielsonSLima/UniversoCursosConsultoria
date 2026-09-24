import assert from "node:assert/strict";
import { parseManualCycleRevision } from "./revision.ts";

const item = {
  chave: "ciclo-1-matricula", valor: "0.00", vencimento: "2026-09-28",
  descontoPontualidade: "0", jurosAtrasoPercentual: "2.000000", multaAtrasoPercentual: "2",
};

Deno.test("revisão opcional mantém chave e termos sem inferir pagamento", () => {
  assert.equal(parseManualCycleRevision(null), null);
  const revision = { emitirMatricula: false, itens: [item] };
  assert.deepEqual(parseManualCycleRevision(revision), revision);
  assert.throws(() => parseManualCycleRevision({ ...revision, pago: true }), /inválida/);
});

Deno.test("revisão rejeita duplicidade, datas impossíveis e entradas não decimais", () => {
  assert.throws(() => parseManualCycleRevision({ emitirMatricula: true, itens: [item, item] }), /repete/);
  for (const patch of [
    { vencimento: "2026-02-30" }, { valor: "-1" }, { valor: "1e3" },
    { descontoPontualidade: "dez" }, { multaAtrasoPercentual: "2,5" }, { pago: true },
  ]) {
    assert.throws(() => parseManualCycleRevision({ emitirMatricula: true, itens: [{ ...item, ...patch }] }), /inválidos/);
  }
});
