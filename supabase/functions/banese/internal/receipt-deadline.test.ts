import assert from "node:assert/strict";
import { assertBaneseLastPaymentDate, baneseLastPaymentDate } from "./receipt-deadline.ts";

Deno.test("data limite oficial é preservada sem substituir vencimento comercial", () => {
  assert.equal(baneseLastPaymentDate({ DataLimitePagamento: "2026-11-02" }, "2026-10-03"), "2026-11-02");
  assert.equal(baneseLastPaymentDate({ DataLimitePagamento: "2026-11-02T00:00:00" }, "2026-10-03"), "2026-11-02");
  assert.equal(baneseLastPaymentDate({ dataLimitePagamento: "2026-10-03" }, "2026-10-03"), "2026-10-03");
});

Deno.test("último recebimento ausente, malformado ou anterior ao vencimento falha fechado", () => {
  for (const value of [null, "", 20261102, "2026-02-30", "2026-11-02T99:99:99", "2026-10-03 junk", "2026-10-02"]) {
    assert.throws(() => baneseLastPaymentDate({ DataLimitePagamento: value }, "2026-10-03"), /RECEIPT_DEADLINE/);
  }
  assert.throws(() => baneseLastPaymentDate({}, "2026-10-03"), /UNVERIFIED/);
});

Deno.test("mudança da data limite entre consultas impede baixa automática", () => {
  assert.doesNotThrow(() => assertBaneseLastPaymentDate({ DataLimitePagamento: "2026-11-02" }, "2026-10-03", "2026-11-02"));
  assert.throws(() => assertBaneseLastPaymentDate({ DataLimitePagamento: "2026-11-03" }, "2026-10-03", "2026-11-02"), /CHANGED/);
});
