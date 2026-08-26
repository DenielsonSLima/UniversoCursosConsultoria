import assert from "node:assert/strict";
import {
  repairAndRevalidateProviderReuse,
  shouldPreserveReservedBaneseNumber,
  shouldReuseProviderReceivable,
} from "./provider-reuse.ts";

const MATRICULA_ID = "11111111-1111-4111-8111-111111111111";
const RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";

const buildReceivable = (): Record<string, any> => ({
  id: RECEIVABLE_ID,
  matricula_id: MATRICULA_ID,
  cliente_id: "33333333-3333-4333-8333-333333333333",
  turma_id: "44444444-4444-4444-8444-444444444444",
  tipo_lancamento: "MATRICULA",
  status: "PENDENTE",
  data_pagamento: null,
  created_at: "2026-08-26T10:00:00.000Z",
  gateway_provider: "banese_card",
  gateway_payment_method: "BOLETO",
  gateway_environment: "production",
  gateway_installments: 1,
  gateway_status: "PENDING",
  gateway_invoice_url: "https://boleto.example",
  gateway_boleto_nosso_numero: "74",
  valor: 14.9,
  data_vencimento: "2026-09-01",
  descricao: "Curso EAD",
});

const createAdmin = (rows: Array<Record<string, any>>) => ({
  from: (table: string) => {
    assert.equal(table, "contas_receber");
    const filters: Array<(row: Record<string, any>) => boolean> = [];
    const query: any = {
      select: () => query,
      eq: (field: string, value: unknown) => {
        filters.push((row) => row[field] === value);
        return query;
      },
      order: () => query,
      limit: (limit: number) =>
        Promise.resolve({
          data: rows.filter((row) => filters.every((filter) => filter(row)))
            .slice(0, limit),
          error: null,
        }),
    };
    return query;
  },
});

const buildContext = (rows: Array<Record<string, any>>) => ({
  admin: createAdmin(rows),
  matricula: { id: MATRICULA_ID },
  aluno: { id: "33333333-3333-4333-8333-333333333333" },
  turma: { id: "44444444-4444-4444-8444-444444444444" },
  environment: "production",
  gatewayPaymentMethodForCharge: "BOLETO",
  dataVencimento: "2026-09-01",
  charge: { installmentCount: 1, value: 14.9, description: "Curso EAD" },
});

Deno.test("checkout legado reutiliza somente titulo aberto e nao pago", () => {
  const rows = [buildReceivable()];
  const context = buildContext(rows) as any;

  for (const status of ["PENDENTE", "VENCIDO"]) {
    assert.equal(
      shouldReuseProviderReceivable(
        { ...rows[0], status },
        context,
        "banese_card",
      ),
      true,
      status,
    );
  }
  for (
    const status of [
      "SUSPENSO",
      "CANCELADO",
      "ESTORNADO",
      "DEVOLVIDO",
      "PAGO",
    ]
  ) {
    const current = { ...rows[0], status };
    assert.equal(
      shouldReuseProviderReceivable(current, context, "banese_card"),
      false,
      status,
    );
    assert.equal(
      shouldPreserveReservedBaneseNumber(current, context, "banese_card"),
      false,
      `reserva ${status}`,
    );
  }
  const paid = { ...rows[0], data_pagamento: "2026-08-26" };
  assert.equal(
    shouldReuseProviderReceivable(paid, context, "banese_card"),
    false,
  );
  assert.equal(
    shouldPreserveReservedBaneseNumber(paid, context, "banese_card"),
    false,
  );
});

Deno.test("checkout legado revalida corrida depois dos repairs", async () => {
  for (const invalidation of ["SUSPENSO", "PAGO"] as const) {
    const rows = [buildReceivable()];
    await assert.rejects(
      () =>
        repairAndRevalidateProviderReuse(
          buildContext(rows) as any,
          rows[0],
          "banese_card",
          {
            repairGatewayTransaction: () => {
              if (invalidation === "SUSPENSO") {
                rows[0].status = "SUSPENSO";
              } else {
                rows[0].data_pagamento = "2026-08-26T10:05:00.000Z";
              }
              return Promise.resolve(null);
            },
            repairInscricao: () => Promise.resolve(null),
          },
        ),
      /nao esta mais disponivel/i,
      invalidation,
    );
  }
});
