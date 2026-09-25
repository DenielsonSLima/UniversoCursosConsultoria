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

Deno.test("modo de matrícula distingue registro local de omissão sem presumir pagamento", () => {
  for (const modoMatricula of ["BOLETO", "REGISTRO_SEM_BOLETO", "OMITIR"]) {
    const revision = { emitirMatricula: modoMatricula === "BOLETO", modoMatricula, itens: [item] };
    assert.deepEqual(parseManualCycleRevision(revision), revision);
    assert.throws(() => parseManualCycleRevision({ ...revision, emitirMatricula: !revision.emitirMatricula }), /incompatível/);
  }
  for (const modoMatricula of [null, "LOCAL", true, 1]) {
    assert.throws(() => parseManualCycleRevision({ emitirMatricula: false, modoMatricula, itens: [item] }), /incompatível/);
  }
});

Deno.test("transporte aceita quantidade variável e limita a 60 mensalidades mais taxa", () => {
  const revision = (count: number) => ({
    emitirMatricula: true,
    itens: Array.from({ length: count }, (_, index) => ({
      ...item,
      chave: index === 0 ? "ciclo-1-matricula" : `ciclo-1-parcela-${index}`,
    })),
  });
  for (const count of [1, 7, 13, 14, 61]) {
    assert.equal(parseManualCycleRevision(revision(count))?.itens.length, count);
  }
  for (const count of [0, 62]) {
    assert.throws(() => parseManualCycleRevision(revision(count)), /inválida/);
  }
});
