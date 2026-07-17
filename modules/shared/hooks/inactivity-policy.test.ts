import {
  getInactivityRemainingMs,
  hasInactivityExpired,
  PORTAL_INACTIVITY_TIMEOUT_MS,
} from './inactivity-policy.ts';

declare const Deno: {
  test: (name: string, testFunction: () => void) => void;
};

const assertEquals = (actual: unknown, expected: unknown) => {
  if (actual !== expected) {
    throw new Error(`Esperado ${String(expected)}, recebido ${String(actual)}`);
  }
};

Deno.test('mantem a sessao antes de 30 minutos de inatividade', () => {
  const now = 1_800_000;
  assertEquals(hasInactivityExpired(1, now), false);
  assertEquals(getInactivityRemainingMs(1, now), 1);
});

Deno.test('expira a sessao exatamente aos 30 minutos', () => {
  assertEquals(hasInactivityExpired(0, PORTAL_INACTIVITY_TIMEOUT_MS), true);
  assertEquals(getInactivityRemainingMs(0, PORTAL_INACTIVITY_TIMEOUT_MS), 0);
});

Deno.test('considera expirada uma aba retomada depois do prazo', () => {
  const elapsed = PORTAL_INACTIVITY_TIMEOUT_MS + 5 * 60 * 1000;
  assertEquals(hasInactivityExpired(0, elapsed), true);
});
