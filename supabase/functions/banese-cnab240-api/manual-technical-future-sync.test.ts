import assert from "node:assert/strict";
import { BANESE_POST_SETTLEMENT_PENDING_MESSAGE } from "../gateways/api/banese-post-settlement.ts";
import { completeBanesePostSettlement } from "../gateways/api/banese-post-settlement-projection.ts";
import { completeCnabActivation } from "./return-activation.ts";

type Row = Record<string, any>;

class Query implements PromiseLike<{ data: any; error: null }> {
  private action: "select" | "update" | "insert" = "select";
  private values: Row = {};
  private filters: Array<(row: Row) => boolean> = [];

  constructor(private admin: FakeAdmin, private table: string) {}

  select(_columns = "*") {
    return this;
  }

  update(values: Row) {
    this.action = "update";
    this.values = values;
    return this;
  }

  insert(values: Row) {
    this.action = "insert";
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  like(column: string, pattern: string) {
    const prefix = pattern.endsWith("%") ? pattern.slice(0, -1) : pattern;
    this.filters.push((row) => String(row[column] || "").startsWith(prefix));
    return this;
  }

  async maybeSingle() {
    const { data } = await this.execute();
    const rows = Array.isArray(data) ? data : [];
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = { data: any; error: null }, TResult2 = never>(
    onfulfilled?: (
      value: { data: any; error: null },
    ) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    const rows = this.admin.tables[this.table] ??
      (this.admin.tables[this.table] = []);
    const matched = rows.filter((row) =>
      this.filters.every((filter) => filter(row))
    );
    if (this.action === "update") {
      matched.forEach((row) => Object.assign(row, this.values));
      return { data: matched.map((row) => ({ ...row })), error: null };
    }
    if (this.action === "insert") {
      rows.push({ ...this.values });
      return { data: null, error: null };
    }
    return { data: matched.map((row) => ({ ...row })), error: null };
  }
}

class FakeAdmin {
  guardCalls = 0;

  constructor(public tables: Record<string, Row[]>) {}

  from(table: string) {
    return new Query(this, table);
  }

  rpc(name: string, args: Row) {
    assert.equal(name, "should_skip_technical_manual_future_sync");
    assert.equal(args.p_matricula_id, MATRICULA_ID);
    this.guardCalls += 1;
    return Promise.resolve({ data: true, error: null });
  }
}

const MATRICULA_ID = "11111111-1111-4111-8111-111111111111";
const RECEIVABLE_ID = "22222222-2222-4222-8222-222222222222";
const RECORD_ID = "33333333-3333-4333-8333-333333333333";

const createAdmin = () => {
  const receivable = {
    id: RECEIVABLE_ID,
    matricula_id: MATRICULA_ID,
    tipo_lancamento: "MATRICULA",
    status: "PAGO",
    gateway_provider: "banese_card",
    gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
    updated_at: "2026-09-01T12:00:00.000Z",
    forma_pagamento: "BOLETO",
  };
  const admin = new FakeAdmin({
    contas_receber: [receivable],
    inscricoes_online: [],
    matriculas: [{
      id: MATRICULA_ID,
      status: "ATIVO",
      turmas: { cursos: { id: "curso", modalidade: "TECNICO" } },
    }],
    payment_gateway_cnab_records: [{
      id: RECORD_ID,
      status: "ACTIVATION_PENDING",
    }],
    payment_gateway_cnab_audit_events: [],
  });
  return { admin, receivable };
};

Deno.test("baixa Banese técnica manual conclui sem sincronização futura", async () => {
  const { admin, receivable } = createAdmin();
  let futureSyncCalls = 0;

  const result = await completeBanesePostSettlement(admin, {
    receivable: { ...receivable },
    environment: "sandbox",
    nossoNumero: "123456789",
    settlementMethod: "BOLETO",
    syncFutureInstallments: () => {
      futureSyncCalls += 1;
      return Promise.reject(new Error("bulk não deveria executar"));
    },
  });

  assert.equal(futureSyncCalls, 0);
  assert.equal(admin.guardCalls, 1);
  assert.equal(result.futureSyncWarning, null);
  assert.equal(result.updated.status, "PAGO");
  assert.equal(result.updated.gateway_last_error, null);
});

Deno.test("retorno CNAB técnico manual ativa projeção sem erro ou retry", async () => {
  const { admin, receivable } = createAdmin();

  await completeCnabActivation(
    admin,
    { id: "44444444-4444-4444-8444-444444444444" },
    { id: "arquivo", environment: "sandbox" },
    {
      id: RECORD_ID,
      receivable_id: RECEIVABLE_ID,
      liquidation_channel: "BOLETO",
      nosso_numero: "123456789",
    },
  );

  assert.equal(admin.guardCalls, 1);
  assert.equal(receivable.status, "PAGO");
  assert.equal(
    admin.tables.payment_gateway_cnab_records[0].status,
    "ACTIVATED",
  );
  assert.equal(admin.tables.payment_gateway_cnab_audit_events.length, 1);
  assert.equal(
    admin.tables.payment_gateway_cnab_audit_events[0].action,
    "ATIVACAO_CONCLUIDA",
  );
});
