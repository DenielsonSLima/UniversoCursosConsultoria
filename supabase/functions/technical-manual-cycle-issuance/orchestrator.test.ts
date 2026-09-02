import assert from "node:assert/strict";
import {
  IssuanceHttpError,
  type ManualCycleContext,
  type ManualCycleIssuanceRequest,
} from "./contract.ts";
import {
  type ManualCycleIssuanceDependencies,
  runManualCycleIssuance,
} from "./orchestrator.ts";

const request: ManualCycleIssuanceRequest = {
  action: "generate",
  matriculaId: "11111111-1111-4111-8111-111111111111",
  cicloNumero: 2,
  primeiroVencimento: "2026-09-15",
  requestId: "22222222-2222-4222-8222-222222222222",
  expectedRegraFingerprint: "a".repeat(64),
  expectedPoliticaFingerprint: "b".repeat(64),
  expectedCronogramaFingerprint: "c".repeat(64),
};

const receivables = Array.from({ length: 13 }, (_, index) => ({
  id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
  chave: index === 0 ? "ciclo-1-rematricula" : `ciclo-2-parc-${index}`,
  tipo: index === 0 ? "REMATRICULA" as const : "PARCELA" as const,
  numero: index,
  descricao: index === 0 ? "Rematrícula" : `Mensalidade ${index}/12`,
  valor: index === 0 ? "100.00" : "279.90",
  vencimento: `2026-${String(Math.min(index + 9, 12)).padStart(2, "0")}-15`,
  status: "PENDENTE",
  emissaoBanese: "PENDENTE",
}));

const contextAt = (issued: number): ManualCycleContext => ({
  requestId: request.requestId!,
  replayed: false,
  matriculaId: request.matriculaId,
  turmaId: "44444444-4444-4444-8444-444444444444",
  poloId: "55555555-5555-4555-8555-555555555555",
  ciclo: {
    numero: 2,
    cicloNumero: 2,
    status: issued === 13 ? "EMITIDO_BANESE" : "EMISSAO_PARCIAL",
    quantidadeItens: 13,
    total: "3458.80",
    emitidosBanese: issued,
    pendentesEmissao: 13 - issued,
    emRevisao: 0,
    recebiveis: receivables.map((item, index) => ({
      ...item,
      emissaoBanese: index < issued ? "EMITIDO" : "PENDENTE",
    })),
  },
  cicloManual: {
    cicloGerado: {
      numero: 2,
      quantidadeItens: 13,
      emitidosBanese: issued,
      pendentesEmissao: 13 - issued,
      emRevisao: 0,
    },
  },
});

const dependenciesAt = (input: {
  initial: number;
  failAt?: number;
}) => {
  let issued = input.initial;
  let calls = 0;
  const dependencies: ManualCycleIssuanceDependencies = {
    preflight: () => Promise.resolve(),
    prepare: () => Promise.resolve(contextAt(issued)),
    resume: () => Promise.resolve(contextAt(issued)),
    reload: () => Promise.resolve(contextAt(issued)),
    issueReceivable: () => {
      calls += 1;
      if (input.failAt === calls) {
        return Promise.reject(new Error("falha simulada sem novo POST"));
      }
      issued += 1;
      return Promise.resolve();
    },
  };
  return { dependencies, issued: () => issued, calls: () => calls };
};

Deno.test("uma confirmação emite sequencialmente os 13 títulos", async () => {
  const scenario = dependenciesAt({ initial: 0 });
  const result = await runManualCycleIssuance(request, scenario.dependencies);
  assert.equal(result.ciclo.status, "EMITIDO_BANESE");
  assert.equal(result.ciclo.emitidosBanese, 13);
  assert.equal(scenario.calls(), 13);
});

Deno.test("replay completo não tenta emitir nenhum título novamente", async () => {
  const scenario = dependenciesAt({ initial: 13 });
  const result = await runManualCycleIssuance(request, scenario.dependencies);
  assert.equal(result.ciclo.emitidosBanese, 13);
  assert.equal(scenario.calls(), 0);
});

Deno.test("título já emitido continua reconciliável quando fica vencido", async () => {
  const overdue = contextAt(13);
  overdue.ciclo.recebiveis[0].status = "VENCIDO";
  const dependencies: ManualCycleIssuanceDependencies = {
    preflight: () => Promise.resolve(),
    prepare: () => Promise.resolve(overdue),
    resume: () => Promise.resolve(overdue),
    reload: () => Promise.resolve(overdue),
    issueReceivable: () => Promise.resolve(),
  };
  const result = await runManualCycleIssuance(
    { ...request, action: "resume", requestId: null },
    dependencies,
  );
  assert.equal(result.ciclo.emitidosBanese, 13);
  assert.equal(result.ciclo.recebiveis[0].status, "VENCIDO");
});

Deno.test("falha parcial devolve progresso e resume apenas os itens restantes", async () => {
  const interrupted = dependenciesAt({ initial: 0, failAt: 6 });
  await assert.rejects(
    () => runManualCycleIssuance(request, interrupted.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof IssuanceHttpError);
      assert.equal(error.status, 409);
      assert.equal(error.progress?.emitidosBanese, 5);
      return true;
    },
  );
  const resumed = dependenciesAt({ initial: interrupted.issued() });
  const result = await runManualCycleIssuance(
    { ...request, action: "resume", requestId: null },
    resumed.dependencies,
  );
  assert.equal(resumed.calls(), 8);
  assert.equal(result.ciclo.emitidosBanese, 13);
  assert.equal(result.replayed, true);
});

Deno.test("falha PostgREST estruturada nunca vira object Object", async () => {
  const scenario = dependenciesAt({ initial: 0 });
  scenario.dependencies.issueReceivable = () =>
    Promise.reject({
      code: "42703",
      message: "Cadastro do pagador incompatível.",
    });
  await assert.rejects(
    () => runManualCycleIssuance(request, scenario.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof IssuanceHttpError);
      assert.match(error.message, /Cadastro do pagador incompatível/);
      assert.match(error.message, /42703/);
      assert.doesNotMatch(error.message, /\[object Object\]/);
      return true;
    },
  );
});

Deno.test("revisão manual não dispara emissão nem bloqueia os itens retomáveis", async () => {
  const initial = contextAt(0);
  initial.ciclo.recebiveis[0].emissaoBanese = "REVISAO_MANUAL";
  initial.ciclo.pendentesEmissao = 12;
  initial.ciclo.emRevisao = 1;
  const finalContext = contextAt(13);
  finalContext.ciclo.status = "EMISSAO_EM_REVISAO";
  finalContext.ciclo.emitidosBanese = 12;
  finalContext.ciclo.pendentesEmissao = 0;
  finalContext.ciclo.emRevisao = 1;
  finalContext.ciclo.recebiveis = initial.ciclo.recebiveis.map((
    item,
    index,
  ) => ({
    ...item,
    emissaoBanese: index === 0 ? "REVISAO_MANUAL" : "EMITIDO",
  }));
  const calls: string[] = [];
  const dependencies: ManualCycleIssuanceDependencies = {
    preflight: () => Promise.resolve(),
    prepare: () => Promise.resolve(initial),
    resume: () => Promise.resolve(initial),
    reload: () => Promise.resolve(finalContext),
    issueReceivable: (_context, receivableId) => {
      calls.push(receivableId);
      return Promise.resolve();
    },
  };

  await assert.rejects(
    () =>
      runManualCycleIssuance(
        { ...request, action: "resume", requestId: null },
        dependencies,
      ),
    (error: unknown) => {
      assert.ok(error instanceof IssuanceHttpError);
      assert.equal(error.code, "CYCLE_ISSUANCE_INCOMPLETE");
      assert.equal(error.progress?.emRevisao, 1);
      return true;
    },
  );
  assert.equal(calls.length, 12);
  assert.ok(!calls.includes(initial.ciclo.recebiveis[0].id));
});
