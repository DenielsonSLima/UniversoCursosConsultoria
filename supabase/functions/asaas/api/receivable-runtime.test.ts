import assert from "node:assert/strict";
import {
  hasExistingAsaasRemoteState,
  resolveExistingAsaasEnvironment,
  resolveExistingAsaasEnvironmentForMany,
} from "./receivable-runtime.ts";

Deno.test("opera título Asaas no ambiente persistido", () => {
  const receivable = {
    asaas_payment_id: "pay_1",
    gateway_provider: "asaas",
    gateway_environment: "sandbox",
  };
  assert.equal(hasExistingAsaasRemoteState(receivable), true);
  assert.equal(resolveExistingAsaasEnvironment(receivable), "sandbox");
});

Deno.test("falha fechado quando título Asaas não registra ambiente", () => {
  assert.throws(
    () => resolveExistingAsaasEnvironment({ asaas_payment_id: "pay_1" }),
    /ambiente original.*não está registrado/i,
  );
  assert.throws(
    () =>
      resolveExistingAsaasEnvironment({
        asaas_payment_id: "pay_1",
        gateway_provider: "banese_card",
        gateway_environment: "sandbox",
      }),
    /mistura identidade Asaas com outro provedor/i,
  );
});

Deno.test("criação nova continua usando ambiente ativo", () => {
  assert.equal(resolveExistingAsaasEnvironment({ status: "PENDENTE" }), null);
});

Deno.test("carnê não mistura títulos sandbox e produção", () => {
  assert.equal(
    resolveExistingAsaasEnvironmentForMany([
      {
        asaas_payment_id: "pay_1",
        gateway_environment: "production",
      },
      { status: "PENDENTE" },
    ]),
    "production",
  );
  assert.throws(
    () =>
      resolveExistingAsaasEnvironmentForMany([
        {
          asaas_payment_id: "pay_1",
          gateway_environment: "production",
        },
        {
          asaas_payment_id: "pay_2",
          gateway_environment: "sandbox",
        },
      ]),
    /ambientes diferentes/i,
  );
});
