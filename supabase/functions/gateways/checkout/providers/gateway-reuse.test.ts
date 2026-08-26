import assert from "node:assert/strict";
import { repairAndRevalidateGatewayReuse } from "./gateway-reuse.ts";

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
  charge: {
    method: "BOLETO",
    installmentCount: 1,
    value: 14.9,
    dueDate: "2026-09-01",
    description: "Curso EAD",
  },
});

Deno.test("reuse revalida depois do repair e nao devolve titulo suspenso", async () => {
  const rows = [buildReceivable()];
  let inscricaoCalls = 0;
  await assert.rejects(
    () =>
      repairAndRevalidateGatewayReuse(
        buildContext(rows) as any,
        rows[0],
        "banese_card",
        {
          repairGatewayTransaction: () => {
            rows[0].status = "SUSPENSO";
            return Promise.resolve(null);
          },
          repairInscricao: () => {
            inscricaoCalls += 1;
            return Promise.resolve(null);
          },
        },
      ),
    /nao esta mais disponivel/i,
  );
  assert.equal(inscricaoCalls, 0);
});

Deno.test("reuse revalida depois do repair e nao devolve titulo pago", async () => {
  const rows = [buildReceivable()];
  let inscricaoCalls = 0;
  await assert.rejects(
    () =>
      repairAndRevalidateGatewayReuse(
        buildContext(rows) as any,
        rows[0],
        "banese_card",
        {
          repairGatewayTransaction: () => {
            rows[0].data_pagamento = "2026-08-26T10:05:00.000Z";
            return Promise.resolve(null);
          },
          repairInscricao: () => {
            inscricaoCalls += 1;
            return Promise.resolve(null);
          },
        },
      ),
    /nao esta mais disponivel/i,
  );
  assert.equal(inscricaoCalls, 0);
});

Deno.test("reuse nao executa repair quando titulo ja chegou indisponivel", async () => {
  for (
    const drift of [{ status: "SUSPENSO" }, {
      data_pagamento: "2026-08-26T10:05:00.000Z",
    }]
  ) {
    const rows = [{ ...buildReceivable(), ...drift }];
    let repairCalls = 0;
    await assert.rejects(
      () =>
        repairAndRevalidateGatewayReuse(
          buildContext(rows) as any,
          rows[0],
          "banese_card",
          {
            repairGatewayTransaction: () => {
              repairCalls += 1;
              return Promise.resolve(null);
            },
            repairInscricao: () => {
              repairCalls += 1;
              return Promise.resolve(null);
            },
          },
        ),
      /nao esta mais disponivel/i,
    );
    assert.equal(repairCalls, 0);
  }
});
