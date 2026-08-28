import assert from "node:assert/strict";
import {
  createLazyAsyncValue,
  queryWithSingleBaneseAuthRetry,
} from "./query-token-retry.ts";

Deno.test("nao solicita token enquanto a consulta Banese nao for usada", async () => {
  let requests = 0;
  const token = createLazyAsyncValue(() => {
    requests += 1;
    return Promise.reject(new Error("OAuth indisponivel"));
  });

  assert.equal(requests, 0);
  await assert.rejects(() => token.get(), /OAuth indisponivel/);
  assert.equal(requests, 1);
});

Deno.test("renova token quando PagamentosEfetivados devolve AUTH adiado", async () => {
  let queries = 0;
  let renewals = 0;
  const result = await queryWithSingleBaneseAuthRetry({
    query: () => {
      queries += 1;
      return Promise.resolve({
        attempt: queries,
        paymentsError: queries === 1
          ? new Error("PagamentosEfetivados falhou (401).")
          : null,
      });
    },
    renew: () => {
      renewals += 1;
      return Promise.resolve();
    },
    deferredError: (snapshot) => snapshot.paymentsError,
  });

  assert.equal(result.attempt, 2);
  assert.equal(result.paymentsError, null);
  assert.equal(queries, 2);
  assert.equal(renewals, 1);
});

Deno.test("limita a uma renovacao e preserva segundo erro adiado", async () => {
  let queries = 0;
  let renewals = 0;
  const result = await queryWithSingleBaneseAuthRetry({
    query: () => {
      queries += 1;
      return Promise.resolve({
        attempt: queries,
        paymentsError: new Error("PagamentosEfetivados falhou (403)."),
      });
    },
    renew: () => {
      renewals += 1;
      return Promise.resolve();
    },
    deferredError: (snapshot) => snapshot.paymentsError,
  });

  assert.equal(result.attempt, 2);
  assert.match(result.paymentsError.message, /403/);
  assert.equal(queries, 2);
  assert.equal(renewals, 1);
});
