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

const protectedIndividualHistory = {
  ...eligibleState,
  cicloBaseHistorico: null,
  proximoCicloNumero: null,
  primeiroVencimentoSugerido: null,
  criterioElegibilidade: null,
  estado: "PROTEGIDO_EXISTENTE",
  podeGerar: false,
  bloqueio: {
    codigo: "HISTORICO_FINANCEIRO_EXISTENTE",
    mensagem: "Há histórico financeiro vinculado ao aluno.",
  },
  politica: null,
};

test("histórico individual bloqueado sem ciclo comprovado não derruba a lista da turma", () => {
  const rows = [
    protectedIndividualHistory,
    {
      ...protectedIndividualHistory,
      cicloBaseHistorico: 1,
      criterioElegibilidade: "HISTORICO_EXTERNO",
      politica: eligibleState.politica,
    },
    eligibleState,
    {
      ...eligibleState,
      cicloBaseHistorico: 0,
      proximoCicloNumero: 1,
      criterioElegibilidade: "MANUAL_APOS_EMISSAO",
    },
  ];
  const parsed = rows.map(requireMatriculaTecnicaCicloManual);
  assert.deepEqual(parsed.map((row) => row.podeGerar), [false, false, true, true]);
  for (const row of parsed.slice(0, 2)) {
    assert.equal(row.cicloGerado, null);
    assert.equal(row.proximoCicloNumero, null);
    assert.equal(row.bloqueio?.codigo, "HISTORICO_FINANCEIRO_EXISTENTE");
  }
});

test("histórico individual protegido nunca aceita intenção de emissão ou metadados inválidos", () => {
  for (const change of [
    { podeGerar: true },
    { proximoCicloNumero: 1 },
    { primeiroVencimentoSugerido: "2026-10-20" },
    { habilitado: false },
    { modo: null },
    { estado: "ELEGIVEL" },
    { cicloMaximo: null },
    { cicloMaximo: 1 },
    { cicloBaseHistorico: -1 },
    { cicloBaseHistorico: 3 },
    { criterioElegibilidade: "DESCONHECIDO" },
    { politica: { revisao: 0, fingerprint: "" } },
    { bloqueio: null },
    { bloqueio: { codigo: "OUTRO", mensagem: "Bloqueado" } },
    { cicloGerado: {} },
  ]) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({
      ...protectedIndividualHistory,
      ...change,
    }), /estado manual de ciclo (incompleto|incoerente)/i);
  }
});

test("proteção individual preserva conferência Proesc e ciclo anterior sem liberar ações", () => {
  const pendingReview = { ...protectedIndividualHistory, conferenciaProesc: { necessaria: true } };
  assert.equal(requireMatriculaTecnicaCicloManual(pendingReview).podeGerar, false);
  const previousCycle = {
    ...pendingReview,
    cicloBaseHistorico: 0,
    politica: eligibleState.politica,
    cicloGerado: {
      numero: 1, status: "LOCAL_CREATED", quantidadeItens: 13, total: "3500.00",
      emitidosBanese: 1, pendentesEmissao: 11, emRevisao: 1,
    },
  };
  const parsed = requireMatriculaTecnicaCicloManual(previousCycle);
  assert.equal(parsed.podeGerar, false);
  assert.equal(parsed.proximoCicloNumero, null);
  assert.deepEqual(parsed.cicloGerado, previousCycle.cicloGerado);
  for (const numero of [0, 3]) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({
      ...previousCycle, cicloGerado: { ...previousCycle.cicloGerado, numero },
    }), /estado manual de ciclo (incompleto|incoerente)/i);
  }
});

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
  assert.equal(
    getCriterioElegibilidadeLabel("MANUAL_APOS_EMISSAO"),
    "Geração manual por ciclo",
  );
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
