import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  getCriterioElegibilidadeLabel,
  requireMatriculaTecnicaCicloManual,
} from "./matricula-tecnica-ciclo-manual.parser";

const eligibleState = {
  habilitado: true,
  modo: "MANUAL",
  cicloBaseHistorico: 1,
  cicloMaximo: 2,
  proximoCicloNumero: 2,
  primeiroVencimentoSugerido: "2026-10-15",
  criterioElegibilidade: "PENULTIMA_SEM_ATRASO",
  estado: "ELEGIVEL",
  podeGerar: true,
  bloqueio: null,
  politica: { revisao: 1, fingerprint: "policy-fingerprint" },
  cicloGerado: null,
};

test("traduz os critérios canônicos de elegibilidade sem expor código técnico", () => {
  assert.equal(
    getCriterioElegibilidadeLabel("PENULTIMA_SEM_ATRASO"),
    "Penúltima parcela paga e nenhuma cobrança vencida",
  );
  assert.equal(
    getCriterioElegibilidadeLabel("QUITACAO_TOTAL"),
    "Ciclo anterior totalmente quitado",
  );
  assert.equal(getCriterioElegibilidadeLabel(null), null);
});

test("estado manual falha fechado para critério de elegibilidade desconhecido", () => {
  assert.doesNotThrow(() => requireMatriculaTecnicaCicloManual(eligibleState));
  assert.throws(
    () =>
      requireMatriculaTecnicaCicloManual({
        ...eligibleState,
        primeiroVencimentoSugerido: "2026-02-30",
      }),
    /estado manual de ciclo incompleto/i,
  );
  assert.throws(
    () =>
      requireMatriculaTecnicaCicloManual({
        ...eligibleState,
        criterioElegibilidade: "CRITERIO_NAO_SUPORTADO",
      }),
    /estado manual de ciclo incompleto/i,
  );
});

test("prévia exige lista canônica completa sem recalcular valores no navegador", () => {
  const parserSource = readFileSync(
    resolve(
      process.cwd(),
      "modules/gestor/gestao/tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-manual-preview.parser.ts",
    ),
    "utf8",
  );

  assert.match(parserSource, /value\.quantidadeItens !== items\.length/);
  assert.match(parserSource, /typedItems\[0\]\?\.tipo === expectedLeadType/);
  assert.match(
    parserSource,
    /installments\.every\(\(item, index\) => item\.numero === index \+ 1\)/,
  );
  assert.match(parserSource, /new Set\(keys\)\.size === keys\.length/);
  assert.match(
    parserSource,
    /typedItems\[0\]\?\.vencimento === value\.primeiroVencimento/,
  );
  assert.match(parserSource, /isIsoCalendarDate\(value\.dataOrigem\)/);
  assert.match(parserSource, /const validTerms = isRecord\(terms\)/);
  assert.doesNotMatch(
    parserSource,
    /\.reduce\(|Number\(item\.valor\)|parseFloat\(item\.valor\)/,
  );
});
