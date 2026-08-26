import assert from "node:assert/strict";
import { loadGatewayCheckoutReceivable } from "./gateway-receivable.ts";

const MATRICULA_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const NEWER_ID = "33333333-3333-4333-8333-333333333333";
const EXPECTATION = {
  alunoId: "44444444-4444-4444-8444-444444444444",
  turmaId: "55555555-5555-4555-8555-555555555555",
  value: 14.9,
  dueDate: "2026-09-01",
  description: "Curso EAD",
};

const receivable = (
  overrides: Record<string, unknown> = {},
): Record<string, any> => ({
  id: TARGET_ID,
  matricula_id: MATRICULA_ID,
  cliente_id: EXPECTATION.alunoId,
  turma_id: EXPECTATION.turmaId,
  tipo_lancamento: "MATRICULA",
  valor: EXPECTATION.value,
  data_vencimento: EXPECTATION.dueDate,
  descricao: EXPECTATION.description,
  status: "PENDENTE",
  data_pagamento: null,
  created_at: "2026-08-25T10:00:00.000Z",
  ...overrides,
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
      limit: async (limit: number) => ({
        data: rows.filter((row) => filters.every((filter) => filter(row)))
          .sort((left, right) =>
            String(right.created_at).localeCompare(String(left.created_at))
          ).slice(0, limit),
        error: null,
      }),
    };
    return query;
  },
});

Deno.test("checkout vinculado carrega exatamente o titulo selecionado", async () => {
  const rows = [
    receivable(),
    receivable({
      id: NEWER_ID,
      created_at: "2026-08-26T10:00:00.000Z",
    }),
  ];

  const result = await loadGatewayCheckoutReceivable({
    admin: createAdmin(rows),
    matriculaId: MATRICULA_ID,
    receivableId: TARGET_ID,
    expectation: EXPECTATION,
  });

  assert.equal(result.id, TARGET_ID);
});

Deno.test("checkout revalida suspensao ocorrida depois das opcoes", async () => {
  const rows = [receivable()];
  assert.equal(
    (await loadGatewayCheckoutReceivable({
      admin: createAdmin(rows),
      matriculaId: MATRICULA_ID,
      receivableId: TARGET_ID,
      expectation: EXPECTATION,
    })).id,
    TARGET_ID,
  );

  rows[0].status = "SUSPENSO";
  await assert.rejects(
    () =>
      loadGatewayCheckoutReceivable({
        admin: createAdmin(rows),
        matriculaId: MATRICULA_ID,
        receivableId: TARGET_ID,
        expectation: EXPECTATION,
      }),
    /nao esta mais disponivel/i,
  );
});

Deno.test("checkout revalida pagamento ocorrido depois das opcoes", async () => {
  const rows = [receivable()];
  rows[0].data_pagamento = "2026-08-26T12:00:00.000Z";

  await assert.rejects(
    () =>
      loadGatewayCheckoutReceivable({
        admin: createAdmin(rows),
        matriculaId: MATRICULA_ID,
        receivableId: TARGET_ID,
        expectation: EXPECTATION,
      }),
    /nao esta mais disponivel/i,
  );
});

Deno.test("checkout revalida proprietario e turma do titulo", async () => {
  for (
    const drift of [{ cliente_id: NEWER_ID }, { turma_id: NEWER_ID }]
  ) {
    await assert.rejects(
      () =>
        loadGatewayCheckoutReceivable({
          admin: createAdmin([receivable(drift)]),
          matriculaId: MATRICULA_ID,
          receivableId: TARGET_ID,
          expectation: EXPECTATION,
        }),
      /nao esta mais disponivel/i,
    );
  }
});

Deno.test("checkout revalida termos canonicos antes de emitir", async () => {
  for (
    const drift of [
      { valor: 109.9 },
      { data_vencimento: "2026-09-15" },
      { descricao: "Titulo substituido" },
    ]
  ) {
    await assert.rejects(
      () =>
        loadGatewayCheckoutReceivable({
          admin: createAdmin([receivable(drift)]),
          matriculaId: MATRICULA_ID,
          receivableId: TARGET_ID,
          expectation: EXPECTATION,
        }),
      /nao esta mais disponivel/i,
    );
  }
});
