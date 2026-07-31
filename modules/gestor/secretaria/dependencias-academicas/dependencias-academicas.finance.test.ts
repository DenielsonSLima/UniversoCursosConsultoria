import assert from "node:assert/strict";
import test from "node:test";

import {
  dependencyRulePercentage,
  hasCompleteDependencyBoleto,
  resolveDependencyPolicyAttempt,
} from "./dependencias-academicas.finance.ts";

test("converte multiplicadores canônicos em 50%, 100%, 150% e 1000%", () => {
  assert.equal(dependencyRulePercentage({ percentual: 0.5 }), 50);
  assert.equal(dependencyRulePercentage({ percentual: 1 }), 100);
  assert.equal(dependencyRulePercentage({ percentual: 1.5 }), 150);
  assert.equal(dependencyRulePercentage({ percentual: 10 }), 1000);
});

test("prioriza campos de multiplicador explícitos e preserva 1%", () => {
  assert.equal(
    dependencyRulePercentage({ multiplicador_parcela: 0.01, percentual: 10 }),
    1,
  );
  assert.equal(dependencyRulePercentage({ fator: "0.3333" }), 33.33);
  assert.equal(dependencyRulePercentage({}), 0);
});

test("só considera boleto completo com linha, código e Nosso Número", () => {
  const complete = {
    linhaDigitavel: "1".repeat(47),
    codigoBarras: "2".repeat(44),
    nossoNumero: "123456789",
  };
  assert.equal(hasCompleteDependencyBoleto(complete), true);
  assert.equal(
    hasCompleteDependencyBoleto({ ...complete, nossoNumero: null }),
    false,
  );
  assert.equal(
    hasCompleteDependencyBoleto({
      ...complete,
      linhaDigitavel: "1".repeat(46),
    }),
    false,
  );
  assert.equal(
    hasCompleteDependencyBoleto({
      ...complete,
      codigoBarras: "2".repeat(43),
    }),
    false,
  );
});

test("reutiliza idempotência no retry e gira a chave quando o payload muda", () => {
  let sequence = 0;
  const createKey = () => `policy-key-${++sequence}`;
  const payload = {
    poloId: "polo-1",
    disciplinaId: "disciplina-1",
    multiplicadorParcela: 0.5,
  };
  const first = resolveDependencyPolicyAttempt(null, payload, createKey);
  const retry = resolveDependencyPolicyAttempt(first, payload, createKey);
  const changed = resolveDependencyPolicyAttempt(
    retry,
    { ...payload, multiplicadorParcela: 1 },
    createKey,
  );

  assert.equal(first.idempotencyKey, "policy-key-1");
  assert.equal(retry, first);
  assert.equal(changed.idempotencyKey, "policy-key-2");
});
