import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPENDENCY_BILLING_INSTRUCTION,
  dependencyBillingPreviewContractError,
  dependencyRulePercentage,
  hasCompleteDependencyBoleto,
  resolveDependencyPolicyAttempt,
} from "./dependencias-academicas.finance.ts";

test("prévia financeira só libera contrato canônico e explícito", () => {
  const canonical = {
    origin: "DEPENDENCIA",
    description: "Disciplina: Anatomia e Fisiologia Humana",
    discount: 0,
    monthlyInterest: 1,
    penalty: 2,
    writeOffDays: 60,
    instruction: DEPENDENCY_BILLING_INSTRUCTION,
  };

  assert.equal(dependencyBillingPreviewContractError(canonical), null);
  assert.match(
    dependencyBillingPreviewContractError({ ...canonical, origin: null }) || "",
    /desatualizada/,
  );
  assert.match(
    dependencyBillingPreviewContractError({ ...canonical, discount: null }) || "",
    /encargos próprios/,
  );
  assert.match(
    dependencyBillingPreviewContractError({ ...canonical, writeOffDays: 30 }) || "",
    /60 dias/,
  );
  assert.match(
    dependencyBillingPreviewContractError({ ...canonical, instruction: "" }) || "",
    /instrução obrigatória/,
  );
});

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
    descontoPontualidade: 19.9,
    jurosAtrasoPercentual: 1,
    multaAtrasoPercentual: 2,
  };
  const first = resolveDependencyPolicyAttempt(null, payload, createKey);
  const retry = resolveDependencyPolicyAttempt(first, payload, createKey);
  const changed = resolveDependencyPolicyAttempt(
    retry,
    { ...payload, multaAtrasoPercentual: 3 },
    createKey,
  );

  assert.equal(first.idempotencyKey, "policy-key-1");
  assert.equal(retry, first);
  assert.equal(changed.idempotencyKey, "policy-key-2");
});
