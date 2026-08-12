import assert from "node:assert/strict";
import {
  activateEadEnrollment,
  activateEnrollmentAfterPayment,
  isAutomaticEnrollmentActivationModality,
  isEnrollmentStatusEligibleForAutomaticActivation,
  syncEadOnlineInscription,
  syncOnlineInscriptionPayment,
} from "./ead-enrollment.ts";

const createContext = (modality: string, enrollmentStatus = "PENDENTE") => {
  const selectedEnrollmentIds: unknown[] = [];
  const activatedEnrollmentIds: unknown[] = [];

  const admin = {
    from(table: string) {
      assert.equal(table, "matriculas");
      return {
        select(_columns: string) {
          return {
            eq(column: string, value: unknown) {
              assert.equal(column, "id");
              selectedEnrollmentIds.push(value);
              return {
                maybeSingle: async () => ({
                  data: {
                    id: value,
                    status: enrollmentStatus,
                    turmas: {
                      cursos: { id: "course-id", modalidade: modality },
                    },
                  },
                  error: null,
                }),
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          assert.deepEqual(values, { status: "ATIVO" });
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return query;
            },
            then(resolve: (value: unknown) => unknown) {
              assert.deepEqual(filters, [
                ["id", "enrollment-id"],
                ["status", enrollmentStatus],
              ]);
              activatedEnrollmentIds.push(filters[0][1]);
              return Promise.resolve({ error: null }).then(resolve);
            },
          };
          return query;
        },
      };
    },
  };

  return {
    context: { admin } as any,
    selectedEnrollmentIds,
    activatedEnrollmentIds,
  };
};

for (const modality of ["EAD", "LIVRE", "ESPECIALIZACAO"]) {
  Deno.test(`ativa matricula ${modality} depois do pagamento`, async () => {
    const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
      createContext(modality);

    await activateEnrollmentAfterPayment(context, {
      matricula_id: "enrollment-id",
      tipo_lancamento: "MATRICULA",
    });

    assert.deepEqual(selectedEnrollmentIds, ["enrollment-id"]);
    assert.deepEqual(activatedEnrollmentIds, ["enrollment-id"]);
  });
}

for (const modality of ["LIVRE", "ESPECIALIZACAO"]) {
  Deno.test(`ativa matrícula ${modality} após a primeira parcela do plano único`, async () => {
    const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
      createContext(modality);

    await activateEnrollmentAfterPayment(context, {
      matricula_id: "enrollment-id",
      tipo_lancamento: "PARCELA",
      parcela_numero: modality === "LIVRE" ? 1 : "1",
      regra_financeira_plano_unico_snapshot: { origem: "PLANO_UNICO" },
    });

    assert.deepEqual(selectedEnrollmentIds, ["enrollment-id"]);
    assert.deepEqual(activatedEnrollmentIds, ["enrollment-id"]);
  });
}

for (const modality of ["LIVRE", "ESPECIALIZACAO"]) {
  Deno.test(`nao ativa matrícula ${modality} pela segunda parcela do plano único`, async () => {
    const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
      createContext(modality);

    await activateEnrollmentAfterPayment(context, {
      matricula_id: "enrollment-id",
      tipo_lancamento: "PARCELA",
      parcela_numero: 2,
      regra_financeira_plano_unico_snapshot: { origem: "PLANO_UNICO" },
    });

    assert.deepEqual(selectedEnrollmentIds, []);
    assert.deepEqual(activatedEnrollmentIds, []);
  });
}

Deno.test("mantem matricula TECNICO sem ativacao automatica", async () => {
  const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
    createContext("TECNICO");

  await activateEnrollmentAfterPayment(context, {
    matricula_id: "enrollment-id",
    tipo_lancamento: "MATRICULA",
  });

  assert.deepEqual(selectedEnrollmentIds, ["enrollment-id"]);
  assert.deepEqual(activatedEnrollmentIds, []);
});

for (
  const closedStatus of [
    "ATIVO",
    "TRANCADO",
    "CONCLUIDO",
    "CANCELADO",
    "CANCELADA",
    "DESISTENTE",
    "TRANSFERIDO",
    "TRANSFERIDA",
  ]
) {
  Deno.test(`nao reativa matricula EAD em estado ${closedStatus}`, async () => {
    const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
      createContext("EAD", closedStatus);

    await activateEnrollmentAfterPayment(context, {
      matricula_id: "enrollment-id",
      tipo_lancamento: "MATRICULA",
    });

    assert.deepEqual(selectedEnrollmentIds, ["enrollment-id"]);
    assert.deepEqual(activatedEnrollmentIds, []);
  });
}

Deno.test("nao ativa lancamento que nao seja de matricula", async () => {
  const { context, selectedEnrollmentIds, activatedEnrollmentIds } =
    createContext("EAD");

  await activateEnrollmentAfterPayment(context, {
    matricula_id: "enrollment-id",
    tipo_lancamento: "MENSALIDADE",
  });

  assert.deepEqual(selectedEnrollmentIds, []);
  assert.deepEqual(activatedEnrollmentIds, []);
});

Deno.test("normaliza modalidade antes de aplicar a regra", () => {
  assert.equal(
    isAutomaticEnrollmentActivationModality(" especializacao "),
    true,
  );
  assert.equal(isAutomaticEnrollmentActivationModality("Especializacao"), true);
  assert.equal(isAutomaticEnrollmentActivationModality("tEcnico"), false);
  assert.equal(
    isEnrollmentStatusEligibleForAutomaticActivation(" aguardando_pagamento "),
    true,
  );
  assert.equal(
    isEnrollmentStatusEligibleForAutomaticActivation("DESISTENTE"),
    false,
  );
});

Deno.test("preserva aliases antigos para consumidores externos", () => {
  assert.equal(activateEadEnrollment, activateEnrollmentAfterPayment);
  assert.equal(syncEadOnlineInscription, syncOnlineInscriptionPayment);
});

Deno.test("sincronizacao da inscricao nunca sobrescreve status PAGO", async () => {
  let savedStatus = "PAGO";
  const upserted: Array<Record<string, unknown>> = [];
  const admin = {
    from(table: string) {
      if (table === "matriculas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "enrollment-id",
                  aluno_id: "student-id",
                  turma_id: "class-id",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "turmas") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "class-id", curso_id: "course-id" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "parceiros") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "student-id", nome: "Aluno" },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "inscricoes_online") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "inscription-id",
                  matricula_id: "enrollment-id",
                  receivable_id: "receivable-id",
                  gateway_provider: "mercado_pago",
                  gateway_environment: "sandbox",
                  gateway_payment_id: "payment-b",
                  gateway_payment_link_id: "preference-id",
                },
                error: null,
              }),
            }),
          }),
          upsert(payload: Record<string, unknown>) {
            upserted.push(payload);
            // Espelha o trigger: CANCELADO nao regride uma linha PAGO.
            if (savedStatus !== "PAGO") savedStatus = String(payload.status);
            return {
              select: () => ({
                single: async () => ({
                  data: { id: "inscription-id", status: savedStatus },
                  error: null,
                }),
              }),
            };
          },
        };
      }
      if (table === "payment_gateway_transactions") {
        return {
          update: () => {
            const query = {
              eq: () => query,
              select: () => query,
              maybeSingle: async () => ({
                data: { id: "transaction-id" },
                error: null,
              }),
              then: (resolve: (value: unknown) => unknown) =>
                Promise.resolve({ error: null }).then(resolve),
            };
            return query;
          },
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    },
  };

  await syncOnlineInscriptionPayment({
    admin,
  } as any, {
    receivable: {
      id: "receivable-id",
      matricula_id: "enrollment-id",
      turma_id: "class-id",
      cliente_id: "student-id",
      gateway_provider: "mercado_pago",
      gateway_environment: "sandbox",
      gateway_payment_id: "payment-b",
      valor: 100,
    },
    gatewayProvider: "mercado_pago",
    environment: "sandbox",
    paymentId: "payment-b",
    paymentLinkId: "preference-id",
    localStatus: "CANCELADO",
    legacyPaymentMethod: "CARTAO",
    pendingStatus: "AGUARDANDO_PAGAMENTO",
  });

  assert.equal(upserted.length, 1);
  assert.equal(upserted[0].matricula_id, "enrollment-id");
  assert.equal(upserted[0].receivable_id, "receivable-id");
  assert.equal(savedStatus, "PAGO");
});
