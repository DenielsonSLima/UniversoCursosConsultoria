import assert from "node:assert/strict";
import { cancelBaneseReceivableBeforeManualSettlement } from "./banese-cancellation.ts";
import { RemoteCancellationPreflightError } from "./remote-cancellation-errors.ts";

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
  gateway_status: "PENDING",
  updated_at: "2026-07-21T12:00:00.000Z",
};

const fakeAdmin = () => {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> =
    [];
  const filters: Array<{
    table: string;
    kind: "eq" | "is" | "in" | "or";
    field: string;
    value: unknown;
  }> = [];
  const admin = {
    from(table: string) {
      let payload: Record<string, unknown> | null = null;
      const builder: any = {
        select: () => builder,
        eq: (field: string, value: unknown) => {
          filters.push({ table, kind: "eq", field, value });
          return builder;
        },
        is: (field: string, value: unknown) => {
          filters.push({ table, kind: "is", field, value });
          return builder;
        },
        in: (field: string, value: unknown) => {
          filters.push({ table, kind: "in", field, value });
          return builder;
        },
        or: (value: string) => {
          filters.push({ table, kind: "or", field: "or", value });
          return builder;
        },
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
          Promise.resolve({
            data: table === "payment_gateway_transactions" && payload
              ? [{ id: "transaction-1" }]
              : null,
            error: null,
          }).then(resolve),
      };
      return builder;
    },
  };
  return { admin, updates, filters };
};

Deno.test("baixa manual Banese confirma banco antes de atualizar o recebivel", async () => {
  const { admin, updates, filters } = fakeAdmin();
  let cancellationInput: Record<string, unknown> | null = null;
  const result = await cancelBaneseReceivableBeforeManualSettlement(
    admin,
    receivable,
    {
      cancelBoleto: async (_admin, environment, input) => {
        input.onMutationStart?.();
        cancellationInput = {
          environment,
          convenio: input.convenio,
          nossoNumero: input.nossoNumero,
        };
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
    updates.find((item) => item.table === "contas_receber")?.payload
      .gateway_status,
    "CANCELED",
  );
  assert.equal(
    updates.find((item) => item.table === "payment_gateway_transactions")
      ?.payload.remote_status,
    "CANCELED",
  );
  const receivableFilters = filters.filter((item) =>
    item.table === "contas_receber"
  );
  assert.ok(
    receivableFilters.some((item) =>
      item.field === "gateway_payment_id" && item.value === OUR_NUMBER
    ),
  );
  assert.ok(
    receivableFilters.some((item) =>
      item.field === "gateway_boleto_nosso_numero" && item.value === OUR_NUMBER
    ),
  );
  assert.ok(
    receivableFilters.some((item) =>
      item.field === "updated_at" && item.value === receivable.updated_at
    ),
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

Deno.test("baixa manual Banese nao infere sandbox sem ambiente", async () => {
  const { admin, updates } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, {
        ...receivable,
        gateway_environment: null,
      }),
    /ambiente ausente ou invalido/i,
  );
  assert.equal(updates.length, 0);
});

Deno.test("falha remota Banese preserva o recebivel local", async () => {
  const { admin, updates } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, receivable, {
        cancelBoleto: async (_admin, _environment, input) => {
          input.onMutationStart?.();
          throw new Error("boleto ja pago");
        },
      }),
    (error) =>
      error instanceof Error &&
      !(error instanceof RemoteCancellationPreflightError) &&
      /ja pago/i.test(error.message),
  );
  assert.equal(updates.length, 0);
});

Deno.test("falha de consulta antes do PUT Banese é classificada como segura", async () => {
  const { admin, updates } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, receivable, {
        cancelBoleto: async () => {
          throw new Error("falha no GET antes do PUT");
        },
      }),
    (error) =>
      error instanceof RemoteCancellationPreflightError &&
      /antes do PUT/i.test(error.message),
  );
  assert.equal(updates.length, 0);
});

Deno.test("baixa Banese bloqueia identidades remotas divergentes", async () => {
  const { admin, updates } = fakeAdmin();
  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(admin, {
        ...receivable,
        gateway_payment_id: "000000016",
      }),
    /identidade Banese inconsistente/i,
  );
  assert.equal(updates.length, 0);
});

Deno.test("baixa Banese aceita gateway id sem zeros equivalente ao Nosso Numero", async () => {
  const { admin, updates, filters } = fakeAdmin();
  let cancellationInput: Record<string, unknown> | null = null;

  await cancelBaneseReceivableBeforeManualSettlement(
    admin,
    {
      ...receivable,
      gateway_payment_id: "15",
      gateway_boleto_nosso_numero: OUR_NUMBER,
    },
    {
      cancelBoleto: async (_admin, environment, input) => {
        input.onMutationStart?.();
        cancellationInput = {
          environment,
          convenio: input.convenio,
          nossoNumero: input.nossoNumero,
        };
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
  assert.ok(updates.length > 0);
  assert.ok(
    filters.some((item) =>
      item.table === "payment_gateway_transactions" &&
      item.kind === "or" &&
      item.value ===
        "bank_slip_our_number.in.(000000015,15),remote_payment_id.in.(000000015,15)"
    ),
  );
});

Deno.test("baixa Banese completa com nove digitos quando existe apenas gateway id curto", async () => {
  const { admin } = fakeAdmin();
  let cancellationInput: Record<string, unknown> | null = null;

  await cancelBaneseReceivableBeforeManualSettlement(
    admin,
    {
      ...receivable,
      gateway_payment_id: "15",
      gateway_boleto_nosso_numero: null,
    },
    {
      cancelBoleto: async (_admin, environment, input) => {
        input.onMutationStart?.();
        cancellationInput = {
          environment,
          convenio: input.convenio,
          nossoNumero: input.nossoNumero,
        };
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
});

Deno.test("baixa Banese rejeita identificador contaminado sem chamar o banco", async () => {
  const { admin, updates } = fakeAdmin();
  let cancellationCalled = false;

  await assert.rejects(
    () =>
      cancelBaneseReceivableBeforeManualSettlement(
        admin,
        {
          ...receivable,
          gateway_payment_id: "15x",
        },
        {
          cancelBoleto: async () => {
            cancellationCalled = true;
            throw new Error("nao deveria chamar");
          },
        },
      ),
    /Nosso Numero Banese invalido/i,
  );

  assert.equal(cancellationCalled, false);
  assert.equal(updates.length, 0);
});
