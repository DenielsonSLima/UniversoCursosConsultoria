import assert from "node:assert/strict";
import {
  AsaasHttpError,
  isCanonicalAsaasPostRejection,
  shouldKeepAsaasCreationLock,
} from "./http.ts";

Deno.test("mantem lock quando POST pode ter sido aceito sem resposta", () => {
  assert.equal(
    shouldKeepAsaasCreationLock(true, new TypeError("connection reset")),
    true,
  );
  assert.equal(
    shouldKeepAsaasCreationLock(
      true,
      new AsaasHttpError("indisponivel", 503, null),
    ),
    true,
  );
  assert.equal(
    shouldKeepAsaasCreationLock(
      true,
      new AsaasHttpError("timeout", 408, null),
    ),
    true,
  );
});

Deno.test("libera lock somente em rejeicao HTTP canonica do POST", () => {
  const rejected = new AsaasHttpError("CPF invalido", 422, {});
  assert.equal(isCanonicalAsaasPostRejection(rejected), true);
  assert.equal(shouldKeepAsaasCreationLock(true, rejected), false);
  assert.equal(
    shouldKeepAsaasCreationLock(false, new Error("antes do POST")),
    false,
  );
});
