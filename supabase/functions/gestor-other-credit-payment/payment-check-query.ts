import {
  type BaneseAccessToken,
  type Environment,
  queryBaneseBoleto,
  requestBaneseBoletoAccessToken,
} from "../banese/core/adapter.ts";
import {
  createLazyAsyncValue,
  queryWithSingleBaneseAuthRetry,
} from "../banese-reconciliation-worker/query-token-retry.ts";

const tokens = new Map<Environment, {
  token: BaneseAccessToken;
  expiresAt: number;
}>();

// Only OAuth and the two existing GETs. One authentication retry is included
// in the conservative reservation of six HTTP requests (three title credits).
export const createPdvBankQuery = (
  admin: any,
  environment: Environment,
  refreshMarginSeconds: number,
  signal: AbortSignal,
  metrics: { requests: number; reused: boolean },
) => {
  const token = createLazyAsyncValue(async () => {
    const cached = tokens.get(environment);
    if (cached && cached.expiresAt > Date.now()) {
      metrics.reused = true;
      return cached.token;
    }
    metrics.requests += 1;
    const fresh = await requestBaneseBoletoAccessToken(admin, environment, {
      signal,
    });
    const lifetime = Math.max(
      0,
      Number(fresh.expiresIn ?? 0) - refreshMarginSeconds,
    );
    tokens.set(environment, {
      token: fresh,
      expiresAt: Date.now() + lifetime * 1000,
    });
    return fresh;
  });
  return async (
    queryAdmin: any,
    queryEnvironment: Environment,
    input: Parameters<typeof queryBaneseBoleto>[2],
  ) => {
    if (queryEnvironment !== environment) {
      throw new Error("Ambiente da consulta PDV diverge da reserva.");
    }
    return await queryWithSingleBaneseAuthRetry({
      query: async () =>
        await queryBaneseBoleto(queryAdmin, queryEnvironment, {
          ...input,
          // Always ask for effective payments; an OPEN boleto is insufficient.
          skipEffectivePaymentsWhenOfficiallyUnpaid: false,
          accessToken: await token.get(),
          signal,
        }),
      renew: async () => {
        tokens.delete(environment);
        token.reset();
        await token.get();
      },
      deferredError: (snapshot) => snapshot.paymentsError,
    });
  };
};
