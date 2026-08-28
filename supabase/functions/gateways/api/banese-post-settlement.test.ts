import assert from "node:assert/strict";
import {
  BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
  BANESE_POST_SETTLEMENT_PENDING_PREFIX,
  clearBanesePostSettlementPending,
  throwBanesePostSettlementPending,
} from "./banese-post-settlement.ts";

type Row = Record<string, any>;

class ReceivableQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private values: Row = {};

  constructor(private row: Row) {}

  update(values: Row) {
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  select(_columns: string) {
    return this;
  }

  async maybeSingle() {
    if (!this.filters.every((filter) => filter(this.row))) {
      return { data: null, error: null };
    }
    Object.assign(this.row, this.values);
    return { data: { ...this.row }, error: null };
  }
}

Deno.test("falha pos-baixa grava marcador duravel sem expor a causa", async () => {
  const receivable = {
    id: "11111111-1111-4111-8111-111111111111",
    gateway_provider: "banese_card",
    status: "PAGO",
    updated_at: "2026-08-27T20:00:00.000Z",
    gateway_last_error: null,
  };
  const admin = {
    from: () => new ReceivableQuery(receivable),
  };

  await assert.rejects(
    () =>
      throwBanesePostSettlementPending(
        admin,
        { ...receivable },
        new Error("segredo interno"),
      ),
    new RegExp(BANESE_POST_SETTLEMENT_PENDING_PREFIX),
  );
  assert.match(
    String(receivable.gateway_last_error),
    new RegExp(`^${BANESE_POST_SETTLEMENT_PENDING_PREFIX}`),
  );
  assert.doesNotMatch(
    String(receivable.gateway_last_error),
    /segredo interno/i,
  );
});

Deno.test("marcador pos-baixa respeita o CAS do recebivel", async () => {
  const receivable = {
    id: "11111111-1111-4111-8111-111111111111",
    gateway_provider: "banese_card",
    status: "PAGO",
    updated_at: "2026-08-27T20:02:00.000Z",
    gateway_last_error: null,
  };
  const admin = {
    from: () => new ReceivableQuery(receivable),
  };

  await assert.rejects(
    () =>
      throwBanesePostSettlementPending(admin, {
        ...receivable,
        updated_at: "2026-08-27T20:00:00.000Z",
      }, new Error("falha")),
    /mudou durante o registro/i,
  );
  assert.equal(receivable.gateway_last_error, null);
});

Deno.test("limpa marcador somente depois da conclusao pos-baixa", async () => {
  const receivable = {
    id: "11111111-1111-4111-8111-111111111111",
    gateway_provider: "banese_card",
    status: "PAGO",
    updated_at: "2026-08-27T20:00:00.000Z",
    gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
  };
  const admin = {
    from: () => new ReceivableQuery(receivable),
  };

  const cleared = await clearBanesePostSettlementPending(
    admin,
    { ...receivable },
  );

  assert.equal(receivable.gateway_last_error, null);
  assert.equal(cleared.gateway_last_error, null);
});

Deno.test("nao limpa marcador sobre snapshot pos-baixa obsoleto", async () => {
  const receivable = {
    id: "11111111-1111-4111-8111-111111111111",
    gateway_provider: "banese_card",
    status: "PAGO",
    updated_at: "2026-08-27T20:02:00.000Z",
    gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
  };
  const admin = {
    from: () => new ReceivableQuery(receivable),
  };

  await assert.rejects(
    () =>
      clearBanesePostSettlementPending(admin, {
        ...receivable,
        updated_at: "2026-08-27T20:00:00.000Z",
      }),
    /mudou durante a conclusao/i,
  );
  assert.equal(
    receivable.gateway_last_error,
    BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
  );
});
