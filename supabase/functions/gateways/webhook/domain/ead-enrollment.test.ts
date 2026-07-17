import assert from "node:assert/strict";
import {
  activateEadEnrollment,
  activateEnrollmentAfterPayment,
  isAutomaticEnrollmentActivationModality,
  syncEadOnlineInscription,
  syncOnlineInscriptionPayment,
} from "./ead-enrollment.ts";

const createContext = (modality: string) => {
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
                    status: "PENDENTE",
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
          return {
            eq: async (column: string, value: unknown) => {
              assert.equal(column, "id");
              activatedEnrollmentIds.push(value);
              return { error: null };
            },
          };
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
});

Deno.test("preserva aliases antigos para consumidores externos", () => {
  assert.equal(activateEadEnrollment, activateEnrollmentAfterPayment);
  assert.equal(syncEadOnlineInscription, syncOnlineInscriptionPayment);
});
