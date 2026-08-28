import assert from "node:assert/strict";
import {
  discountRepairDiagnosticCode,
  repairMarkedBaneseDiscountBeforeBatch,
} from "./discount-removal-maintenance.ts";

const adminFor = (rows: Array<{ id: string }>, error: unknown = null) => ({
  from: (table: string) => {
    assert.equal(table, "contas_receber");
    return {
      select: (columns: string) => {
        assert.equal(columns, "id");
        return {
          eq: (column: string, value: string) => {
            assert.equal(column, "gateway_last_error");
            assert.equal(
              value,
              "BANESE_DISCOUNT_REMOVAL_PENDING:T42_REMATRICULA_NO_DISCOUNT",
            );
            return { limit: (_limit: number) => ({ data: rows, error }) };
          },
        };
      },
    };
  },
});

Deno.test("repara somente o unico titulo com marcador exato antes do lote", async () => {
  const calls: string[] = [];
  const result = await repairMarkedBaneseDiscountBeforeBatch(
    adminFor([{ id: "7e41ae27-a45b-4e94-a842-18e422704a27" }]),
    async (_admin, id) => {
      calls.push(String(id));
      return { success: true, repairedDiscount: true } as never;
    },
  );
  assert.deepEqual(calls, ["7e41ae27-a45b-4e94-a842-18e422704a27"]);
  assert.deepEqual(result, {
    receivableId: "7e41ae27-a45b-4e94-a842-18e422704a27",
    repairedDiscount: true,
  });
});

Deno.test("nao consulta o banco sem marcador", async () => {
  let called = false;
  const result = await repairMarkedBaneseDiscountBeforeBatch(
    adminFor([]),
    async () => {
      called = true;
      return {} as never;
    },
  );
  assert.equal(result, null);
  assert.equal(called, false);
});

Deno.test("falha fechado se o marcador nao for unico", async () => {
  await assert.rejects(
    () =>
      repairMarkedBaneseDiscountBeforeBatch(
        adminFor([{ id: "a" }, { id: "b" }]),
        async () => ({}) as never,
      ),
    /Mais de um titulo/,
  );
});

Deno.test("falha se o conciliador nao confirmar o reparo dedicado", async () => {
  await assert.rejects(
    () =>
      repairMarkedBaneseDiscountBeforeBatch(
        adminFor([{ id: "7e41ae27-a45b-4e94-a842-18e422704a27" }]),
        async () => ({ success: true }) as never,
      ),
    /nao confirmou/,
  );
});

Deno.test("diagnostico nunca devolve a mensagem bancaria bruta", () => {
  assert.equal(
    discountRepairDiagnosticCode(
      new Error("Banese recusou consulta: payload confidencial"),
    ),
    "BANK_PREFLIGHT",
  );
  assert.equal(
    discountRepairDiagnosticCode(
      new Error("Termos remotos nao correspondem ao reparo"),
    ),
    "REMOTE_TERMS",
  );
});
