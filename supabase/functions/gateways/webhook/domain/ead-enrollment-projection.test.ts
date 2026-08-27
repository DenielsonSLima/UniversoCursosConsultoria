import assert from "node:assert/strict";
import { syncOnlineInscriptionPayment } from "./ead-enrollment.ts";

Deno.test("nao cria inscricao online para parcela secundaria", async () => {
  const queriedTables: string[] = [];
  const admin = {
    from(table: string) {
      queriedTables.push(table);
      assert.equal(table, "inscricoes_online");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      };
    },
  };

  await syncOnlineInscriptionPayment({ admin } as any, {
    receivable: {
      id: "installment-id",
      matricula_id: "technical-enrollment-id",
      tipo_lancamento: "PARCELA",
      parcela_numero: 2,
    },
    gatewayProvider: "banese_card",
    environment: "production",
    paymentId: "000096926",
    paymentLinkId: null,
    localStatus: "PAGO",
    legacyPaymentMethod: "BOLETO",
    pendingStatus: "AGUARDANDO_PAGAMENTO",
  });

  assert.deepEqual(queriedTables, ["inscricoes_online"]);
});

Deno.test("sincroniza parcela ligada a inscricao online existente", async () => {
  let onlineInscriptionReads = 0;
  const admin = {
    from(table: string) {
      assert.equal(table, "inscricoes_online");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              onlineInscriptionReads += 1;
              return onlineInscriptionReads === 1
                ? {
                  data: {
                    id: "inscription-id",
                    matricula_id: "enrollment-id",
                    receivable_id: "installment-id",
                  },
                  error: null,
                }
                : { data: null, error: new Error("repair-called") };
            },
          }),
        }),
      };
    },
  };

  await assert.rejects(
    () =>
      syncOnlineInscriptionPayment({ admin } as any, {
        receivable: {
          id: "installment-id",
          matricula_id: "enrollment-id",
          tipo_lancamento: "PARCELA",
          parcela_numero: 2,
          gateway_provider: "banese_card",
          gateway_environment: "production",
          gateway_payment_id: "000096926",
        },
        gatewayProvider: "banese_card",
        environment: "production",
        paymentId: "000096926",
        paymentLinkId: null,
        localStatus: "PAGO",
        legacyPaymentMethod: "BOLETO",
        pendingStatus: "AGUARDANDO_PAGAMENTO",
      }),
    /repair-called/,
  );
  assert.equal(onlineInscriptionReads, 2);
});

Deno.test("nao cria inscricao online para matricula tecnica manual", async () => {
  const queriedTables: string[] = [];
  const admin = {
    from(table: string) {
      queriedTables.push(table);
      if (table === "inscricoes_online") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      assert.equal(table, "matriculas");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "technical-enrollment-id",
                turmas: { cursos: { modalidade: "TECNICO" } },
              },
              error: null,
            }),
          }),
        }),
      };
    },
  };

  await syncOnlineInscriptionPayment({ admin } as any, {
    receivable: {
      id: "enrollment-receivable-id",
      matricula_id: "technical-enrollment-id",
      tipo_lancamento: "MATRICULA",
    },
    gatewayProvider: "banese_card",
    environment: "production",
    paymentId: "000096926",
    paymentLinkId: null,
    localStatus: "PAGO",
    legacyPaymentMethod: "BOLETO",
    pendingStatus: "AGUARDANDO_PAGAMENTO",
  });

  assert.deepEqual(queriedTables, ["inscricoes_online", "matriculas"]);
});

Deno.test("repara inscricao EAD ausente para cobranca inicial", async () => {
  let onlineInscriptionReads = 0;
  const admin = {
    from(table: string) {
      if (table === "inscricoes_online") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => {
                onlineInscriptionReads += 1;
                return onlineInscriptionReads === 1
                  ? { data: null, error: null }
                  : { data: null, error: new Error("repair-called") };
              },
            }),
          }),
        };
      }
      assert.equal(table, "matriculas");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: "ead-enrollment-id",
                turmas: { cursos: { modalidade: "EAD" } },
              },
              error: null,
            }),
          }),
        }),
      };
    },
  };

  await assert.rejects(
    () =>
      syncOnlineInscriptionPayment({ admin } as any, {
        receivable: {
          id: "enrollment-receivable-id",
          matricula_id: "ead-enrollment-id",
          tipo_lancamento: "MATRICULA",
          gateway_provider: "banese_card",
          gateway_environment: "production",
          gateway_payment_id: "000096926",
        },
        gatewayProvider: "banese_card",
        environment: "production",
        paymentId: "000096926",
        paymentLinkId: null,
        localStatus: "PAGO",
        legacyPaymentMethod: "BOLETO",
        pendingStatus: "AGUARDANDO_PAGAMENTO",
      }),
    /repair-called/,
  );
  assert.equal(onlineInscriptionReads, 2);
});

Deno.test("mantem rejeicao para cobranca inicial divergente", async () => {
  const existing = {
    id: "inscription-id",
    matricula_id: "enrollment-id",
    receivable_id: "original-receivable-id",
  };
  const admin = {
    from(table: string) {
      assert.equal(table, "inscricoes_online");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: existing, error: null }),
          }),
        }),
      };
    },
  };

  await assert.rejects(
    () =>
      syncOnlineInscriptionPayment({ admin } as any, {
        receivable: {
          id: "different-receivable-id",
          matricula_id: "enrollment-id",
          tipo_lancamento: "MATRICULA",
          gateway_provider: "banese_card",
          gateway_environment: "production",
          gateway_payment_id: "000096926",
        },
        gatewayProvider: "banese_card",
        environment: "production",
        paymentId: "000096926",
        paymentLinkId: null,
        localStatus: "PAGO",
        legacyPaymentMethod: "BOLETO",
        pendingStatus: "AGUARDANDO_PAGAMENTO",
      }),
    /recebivel canonico diferente/i,
  );
});
