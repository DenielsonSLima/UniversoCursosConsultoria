import assert from "node:assert/strict";
import { cancelBaneseReceivableBeforeManualSettlement } from "./banese-cancellation.ts";

const RECEIVABLE_ID = "11111111-1111-4111-8111-111111111111";
const OUR_NUMBER = "000000015";

const receivable = {
  id: RECEIVABLE_ID,
  status: "PENDENTE",
  gateway_provider: "banese_card",
  gateway_environment: "sandbox",
  gateway_payment_method: "BOLETO",
  gateway_payment_id: OUR_NUMBER,
  gateway_boleto_nosso_numero: OUR_NUMBER,
  gateway_boleto_convenio: "15528",
};

const fakeAdmin = () => {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const admin = {
    from(table: string) {
      let payload: Record<string, unknown> | null = null;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        or: () => builder,
        update: (value: Record<string, unknown>) => {
          payload = value;
          updates.push({ table, payload: value });
          return builder;
        },
        maybeSingle: async () => {
          if (table === "payment_gateway_credentials") {
            return {
              data: { metadata: { baneseBoletoConvenio: "15528" } },
              error: null,
            };
          }
          return {
            data: payload ? { ...receivable, ...payload } : null,
            error: null,
          };
        },
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return builder;
    },
  };
  return { admin, updates };
};

Deno.test("baixa manual Banese confirma banco antes de atualizar o recebivel", async () => {
  const { admin, updates } = fakeAdmin();
  let cancellationInput: Record<string, unknown> | null = null;
  const result = await cancelBaneseReceivableBeforeManualSettlement(
    admin,
    receivable,
    {
      cancelBoleto: async (_admin, environment, input) => {
        cancellationInput = { environment, ...input };
        return {
          convenio: "15528",
          nossoNumero: OUR_NUMBER,
          situationCode: 5,
          remoteStatus: "CANCELED",
          alreadyCanceled: false,
          raw: {},
        };
      },
    },
  );

  assert.deepEqual(cancellationInput, {
    environment: "sandbox",
    convenio: "15528",
    nossoNumero: OUR_NUMBER,
  });
  assert.equal(result.remoteStatus, "CANCELED");
  assert.equal(
    updates.find((item) => item.table === "contas_receber")?.payload.gateway_status,
    "CANCELED",
  );
  assert.equal(
    updates.find((item) => item.table === "payment_gateway_transactions")?.payload.remote_status,
    "CANCELED",
  );
});

Deno.test("baixa manual rejeita recebivel que nao pertence ao Banese", async () => {
  const { admin } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, {
        ...receivable,
        gateway_provider: "asaas",
      }),
    /nao pertence ao Banese/i,
  );
});

Deno.test("falha remota Banese preserva o recebivel local", async () => {
  const { admin, updates } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, receivable, {
        cancelBoleto: async () => {
          throw new Error("boleto ja pago");
        },
      }),
    /ja pago/i,
  );
  assert.equal(updates.length, 0);
});
